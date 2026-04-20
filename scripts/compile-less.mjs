#!/usr/bin/env node
/**
 * compile-less.mjs — LESS -> CSS compiler (CLI-independent)
 * Usage: node scripts/compile-less.mjs <input.less> <output.css>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import less from "less";

const [,, inputFile, outputFile] = process.argv;

if (!inputFile || !outputFile) {
  console.error("Usage: node scripts/compile-less.mjs <input.less> <output.css>");
  process.exit(1);
}

const inputAbs = resolve(inputFile);
const outputAbs = resolve(outputFile);

if (!existsSync(inputAbs)) {
  console.error(`[compile-less] Input file not found: ${inputFile}`);
  process.exit(1);
}

try {
  const lessSource = readFileSync(inputAbs, "utf-8");
  const rendered = await less.render(lessSource, {
    filename: inputAbs,
    paths: [dirname(inputAbs)],
    javascriptEnabled: true,
  });

  const outDir = dirname(outputAbs);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  writeFileSync(outputAbs, rendered.css || "", "utf-8");
  console.log(`[compile-less] Compiled ${inputFile} -> ${outputFile}`);
} catch (error) {
  const message = error && typeof error === "object" && "message" in error
    ? String(error.message)
    : String(error);
  console.error(`[compile-less] FAIL: ${message}`);
  process.exit(1);
}
