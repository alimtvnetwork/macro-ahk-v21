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
/* ------------------------------------------------------------------ */
const findings = [];

function walk(node, sourceFile, filePath) {
  if (
    ts.isCallExpression(node)
    && node.expression.kind === ts.SyntaxKind.ImportKeyword
  ) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const arg = node.arguments[0];
    const argText = arg ? arg.getText(sourceFile).slice(0, 80) : "<no arg>";
    findings.push({
      file: relative(REPO_ROOT, filePath).split(sep).join("/"),
      line: line + 1,
      column: character + 1,
      snippet: `import(${argText})`,
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
/*  Step 4: Report                                                     */
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
console.error(`  replace each with a static \`import\` declaration at the top of the file.`);
console.error("");
for (const f of findings) {
  console.error(`  ✗ ${f.file}:${f.line}:${f.column}  →  ${f.snippet}`);
}
console.error("");
process.exit(1);
