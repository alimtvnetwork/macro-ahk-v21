#!/usr/bin/env node
/**
 * Pre-build lint: forbid dynamic `import()` calls in background entrypoints.
 *
 * Why:
 *   Chrome MV3 service workers cannot evaluate dynamic `import()` reliably —
 *   any await import() in the background bundle crashes the SW on cold start
 *   and trips the existing Vite `validate-no-bg-dynamic-import` plugin.
 *   This script catches violations at the SOURCE level so PRs fail before
 *   bundling, with file:line:column pointing at the offending call.
 *
 * Scope:
 *   - src/background/**\/*.ts  (excluding **\/__tests__/**)
 *
 * Allowed:
 *   - Static `import x from "y"` declarations
 *   - Type-only `import type` (parsed as ImportDeclaration, not call)
 *   - String literals containing the word "import(" (not parsed as calls)
 *
 * Forbidden:
 *   - Any CallExpression whose expression is `ImportKeyword` (i.e. `import(...)`).
 *
 * Exit:
 *   - 0 when clean; 1 with a CODE RED report listing each offending location.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const TARGET_DIR = resolve(REPO_ROOT, "src/background");
const TARGET_LABEL = "src/background";

/* ------------------------------------------------------------------ */
/*  Step 1: Verify target directory exists (CODE RED on miss)         */
/* ------------------------------------------------------------------ */
if (!existsSync(TARGET_DIR)) {
  console.error("");
  console.error("╔══════════════════════════════════════════════════════════════╗");
  console.error("║  CODE RED: background source directory missing              ║");
  console.error("╚══════════════════════════════════════════════════════════════╝");
  console.error(`  Path:    ${TARGET_DIR}`);
  console.error(`  Missing: ${TARGET_LABEL}/ (expected TypeScript sources)`);
  console.error(`  Reason:  check-no-bg-dynamic-import.mjs cannot scan a`);
  console.error(`           non-existent directory. Verify the repo layout`);
  console.error(`           or update TARGET_DIR in this script.`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Step 2: Collect *.ts files (skip __tests__)                        */
/* ------------------------------------------------------------------ */
function collectTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...collectTsFiles(full));
      continue;
    }
    if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

const files = collectTsFiles(TARGET_DIR);

if (files.length === 0) {
  console.error(`[FAIL] No *.ts files found under ${TARGET_LABEL}/ — refusing to silently pass.`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Step 3: Walk each AST and record dynamic import() call sites       */
/*                                                                     */
/*  For every offending `import("…")` we capture:                       */
/*    • file / line / column                                            */
/*    • enclosing function name (or "<module scope>")                   */
/*    • specifier (the string literal arg, when statically resolvable)  */
/*    • bindings imported from it (destructure / default / namespace)   */
/*  …so the report can suggest the EXACT refactor.                      */
/* ------------------------------------------------------------------ */
const findings = [];

/** Returns a human-readable name for the nearest enclosing function-like scope. */
function getEnclosingFunctionName(node) {
    let current = node.parent;
    while (current) {
        if (ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) {
            return current.name ? current.name.getText() : "<anonymous function>";
        }
        if (ts.isFunctionExpression(current) || ts.isArrowFunction(current)) {
            // Try to recover a name from `const foo = () => …` / property assignments.
            const parent = current.parent;
            if (parent && ts.isVariableDeclaration(parent) && parent.name) {
                return parent.name.getText();
            }
            if (parent && ts.isPropertyAssignment(parent) && parent.name) {
                return `${parent.name.getText()} (callback)`;
            }
            if (parent && ts.isPropertyDeclaration(parent) && parent.name) {
                return parent.name.getText();
            }
            return "<inline callback>";
        }
        if (ts.isConstructorDeclaration(current)) {
            return "constructor";
        }
        if (ts.isGetAccessor(current) || ts.isSetAccessor(current)) {
            return current.name ? current.name.getText() : "<accessor>";
        }
        current = current.parent;
    }
    return "<module scope>";
}

/**
 * Inspects the parent of the `import(…)` call to learn what bindings the
 * caller actually consumes, so we can suggest the matching static import.
 *
 * Handles:
 *   const { a, b } = await import("…")    → ["a", "b"]
 *   const ns       = await import("…")    → "* as ns"
 *   const x        = (await import("…")).default  → "default as x"
 *   plain expression statement            → null (no destructure to mirror)
 */
function getImportBindings(callNode) {
    let target = callNode.parent;
    if (target && target.kind === ts.SyntaxKind.AwaitExpression) {
        target = target.parent;
    }
    // Property access: (await import("…")).default / .foo
    if (target && (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target))) {
        const accessor = ts.isPropertyAccessExpression(target)
            ? target.name.getText()
            : (target.argumentExpression ? target.argumentExpression.getText().replace(/['"]/g, "") : null);
        if (accessor) {
            return { kind: "named", names: [accessor] };
        }
    }
    if (target && ts.isVariableDeclaration(target) && target.name) {
        if (ts.isObjectBindingPattern(target.name)) {
            const names = target.name.elements.map((el) => {
                const propertyName = el.propertyName ? el.propertyName.getText() : null;
                const localName = el.name.getText();
                return propertyName && propertyName !== localName
                    ? `${propertyName} as ${localName}`
                    : localName;
            });
            return { kind: "named", names };
        }
        if (ts.isIdentifier(target.name)) {
            return { kind: "namespace", localName: target.name.getText() };
        }
    }
    return { kind: "unknown" };
}

function walk(node, sourceFile, filePath) {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const arg = node.arguments[0];
        const isStringLiteral = arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg));
        const specifier = isStringLiteral ? arg.text : null;
        const argText = arg ? arg.getText(sourceFile).slice(0, 80) : "<no arg>";

        findings.push({
            file: relative(REPO_ROOT, filePath).split(sep).join("/"),
            line: line + 1,
            column: character + 1,
            snippet: `import(${argText})`,
            functionName: getEnclosingFunctionName(node),
            specifier,
            bindings: getImportBindings(node),
        });
    }
    ts.forEachChild(node, (child) => walk(child, sourceFile, filePath));
}

for (const filePath of files) {
    const text = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
    walk(sourceFile, sourceFile, filePath);
}

/* ------------------------------------------------------------------ */
/*  Step 4: Build a concrete refactor suggestion per finding           */
/* ------------------------------------------------------------------ */
function suggestionFor(finding) {
    const { specifier, bindings, functionName, file } = finding;
    const where = `in \`${file}\` (function: ${functionName})`;

    if (!specifier) {
        return [
            `Resolve the import specifier to a string literal, then hoist it to a static import ${where}.`,
            `Dynamic specifiers cannot be statically bundled and must be eliminated.`,
        ];
    }

    if (bindings.kind === "named" && bindings.names.length > 0) {
        const list = bindings.names.join(", ");
        return [
            `Add at the top of \`${file}\`:`,
            `    import { ${list} } from "${specifier}";`,
            `Then delete the \`await import("${specifier}")\` call inside \`${functionName}\` and use \`${bindings.names[0].split(" as ").pop()}\` directly.`,
        ];
    }

    if (bindings.kind === "namespace") {
        return [
            `Add at the top of \`${file}\`:`,
            `    import * as ${bindings.localName} from "${specifier}";`,
            `Then delete the \`await import("${specifier}")\` call inside \`${functionName}\`.`,
        ];
    }

    return [
        `Add at the top of \`${file}\`:`,
        `    import "${specifier}";   // side-effect import (or pick a named binding to import)`,
        `Then delete the \`await import("${specifier}")\` call inside \`${functionName}\`.`,
        `If you only need a single export, prefer \`import { name } from "${specifier}"\` instead.`,
    ];
}

/* ------------------------------------------------------------------ */
/*  Step 5: Report                                                     */
/* ------------------------------------------------------------------ */
if (findings.length === 0) {
    console.log(`[OK] ${TARGET_LABEL}/: no dynamic import() calls (${files.length} files scanned)`);
    process.exit(0);
}

console.error("");
console.error("╔══════════════════════════════════════════════════════════════╗");
console.error("║  BLOCKED: dynamic import() in background source             ║");
console.error("╚══════════════════════════════════════════════════════════════╝");
console.error(`  Found ${findings.length} dynamic import() call(s) under ${TARGET_LABEL}/.`);
console.error(`  MV3 service workers cannot evaluate import() reliably —`);
console.error(`  hoist each call to a static \`import\` declaration at the top of the file.`);
console.error("");

findings.forEach((f, idx) => {
    console.error(`  [${idx + 1}/${findings.length}] ✗ ${f.file}:${f.line}:${f.column}`);
    console.error(`        function: ${f.functionName}`);
    console.error(`        call:     ${f.snippet}`);
    console.error(`        suggested fix:`);
    for (const line of suggestionFor(f)) {
        console.error(`          • ${line}`);
    }
    console.error("");
});

process.exit(1);
