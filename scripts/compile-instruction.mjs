#!/usr/bin/env node
/**
 * compile-instruction.mjs
 *
 * Compiles a standalone script's instruction.ts → dist/instruction.json.
 * Uses TypeScript compiler API to evaluate the default export.
 *
 * Usage: node scripts/compile-instruction.mjs <script-folder-path>
 * Example: node scripts/compile-instruction.mjs standalone-scripts/macro-controller
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

async function main() {
    const folderArg = process.argv[2];
    if (!folderArg) {
        console.error("Usage: node scripts/compile-instruction.mjs <script-folder>");
        process.exit(1);
    }

    const folder = resolve(ROOT, folderArg);
    const tsPath = join(folder, "src", "instruction.ts");
    const distDir = join(folder, "dist");
    const outPath = join(distDir, "instruction.json");

    if (!existsSync(tsPath)) {
        console.log(`ℹ No instruction.ts in ${folderArg}/src/ — skipping`);
        return;
    }

    // Read TypeScript source and extract the instruction object
    const source = readFileSync(tsPath, "utf-8");

    // Simple extraction: find the `const instruction: ... = { ... };` block
    // and evaluate it as a JS object literal
    const match = source.match(/const\s+instruction\s*(?::\s*\w+)?\s*=\s*(\{[\s\S]*?\n\});/);
    if (!match) {
        console.error(`❌ Could not extract instruction object from ${tsPath}`);
        process.exit(1);
    }

    // Collect all top-level const declarations before the instruction object
    // so that variables like LOVABLE_BASE_URL are available during evaluation.
    const preambleLines = [];
    const lines = source.split("\n");
    for (const line of lines) {
        // Stop when we reach the instruction declaration
        if (/^\s*const\s+instruction\s*(?::\s*\w+)?\s*=/.test(line)) break;
        // Capture simple const string/number assignments (strip TS type annotations)
        const constMatch = line.match(/^\s*(const\s+\w+)\s*(?::\s*\w+)?\s*=\s*(.+?);?\s*$/);
        if (constMatch) {
            preambleLines.push(`${constMatch[1]} = ${constMatch[2]};`);
        }
    }

    // Evaluate the object literal in a safe context with preamble variables
    const evalCode = preambleLines.join("\n") + "\nreturn (" + match[1] + ")";
    const obj = new Function(evalCode)();

    mkdirSync(distDir, { recursive: true });
    writeFileSync(outPath, JSON.stringify(obj, null, 2) + "\n", "utf-8");
    console.log(`✅ Compiled instruction.json → ${outPath}`);
}

main().catch((err) => {
    console.error("❌ compile-instruction failed:", err);
    process.exit(1);
});