#!/usr/bin/env node
/**
 * Manifest Preflight — runs BEFORE every Vite extension build.
 *
 * Hard requirements:
 *   1. manifest.json MUST exist at the repo root.
 *   2. manifest.json "version" MUST equal EXTENSION_VERSION in src/shared/constants.ts.
 *   3. The version string MUST be a valid Chrome MV3 version (1-4 dot-separated
 *      integers, each 0-65535).
 *
 * On failure: prints a CODE RED error block (exact path, what is missing, why)
 * and exits with code 1 to abort the build pipeline.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = resolve(ROOT, "manifest.json");
const CONSTANTS_PATH = resolve(ROOT, "src/shared/constants.ts");

/** Prints a CODE RED failure block and exits 1. */
function fail(title, exactPath, missing, reason) {
  console.error("");
  console.error("========================================");
  console.error("  [CODE RED] MANIFEST PREFLIGHT FAILED");
  console.error("========================================");
  console.error(`  Check:    ${title}`);
  console.error(`  Path:     ${exactPath}`);
  console.error(`  Missing:  ${missing}`);
  console.error(`  Reason:   ${reason}`);
  console.error("========================================");
  console.error("");
  process.exit(1);
}

/* 1. manifest.json must exist at repo root ------------------------- */
if (!existsSync(MANIFEST_PATH)) {
  fail(
    "manifest.json existence",
    MANIFEST_PATH,
    "manifest.json file at repository root",
    "Vite extension build requires manifest.json at the repo root — without it, the bundled extension dist/ will be missing its manifest entirely.",
  );
}

/* 2. manifest.json must be valid JSON with a "version" field ------- */
let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
} catch (parseErr) {
  fail(
    "manifest.json JSON parse",
    MANIFEST_PATH,
    "Valid JSON content",
    `JSON.parse threw: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
  );
}

const manifestVersion = manifest.version;
if (typeof manifestVersion !== "string" || manifestVersion.length === 0) {
  fail(
    'manifest.json "version" field',
    MANIFEST_PATH,
    'Top-level "version" string',
    `Expected a non-empty string, got: ${JSON.stringify(manifestVersion)}`,
  );
}

/* 3. Version must be a valid Chrome MV3 version -------------------- */
const MV3_VERSION_RE = /^(\d{1,5})(\.\d{1,5}){0,3}$/;
if (!MV3_VERSION_RE.test(manifestVersion)) {
  fail(
    "manifest.json version format",
    MANIFEST_PATH,
    "Chrome MV3-compliant version (1-4 dot-separated integers, each 0-65535)",
    `"${manifestVersion}" does not match the MV3 version regex. Chrome will reject this manifest at install time.`,
  );
}
for (const part of manifestVersion.split(".")) {
  const n = Number(part);
  if (n > 65535) {
    fail(
      "manifest.json version range",
      MANIFEST_PATH,
      "Each version segment must be ≤ 65535",
      `Segment "${part}" in version "${manifestVersion}" exceeds the Chrome MV3 limit (65535).`,
    );
  }
}

/* 4. constants.ts must exist and expose EXTENSION_VERSION ---------- */
if (!existsSync(CONSTANTS_PATH)) {
  fail(
    "constants.ts existence",
    CONSTANTS_PATH,
    "src/shared/constants.ts file",
    "Cannot validate version sync — the canonical EXTENSION_VERSION source file is missing.",
  );
}

const constantsSrc = readFileSync(CONSTANTS_PATH, "utf-8");
const versionMatch = constantsSrc.match(
  /EXTENSION_VERSION\s*=\s*["'](\d+(?:\.\d+){0,3})["']/,
);
if (!versionMatch) {
  fail(
    "constants.ts EXTENSION_VERSION export",
    CONSTANTS_PATH,
    'export const EXTENSION_VERSION = "X.Y.Z" declaration',
    "Could not match the EXTENSION_VERSION regex — the constant is missing, renamed, or formatted unexpectedly.",
  );
}

const constantsVersion = versionMatch[1];

/* 5. Versions must match ------------------------------------------- */
if (manifestVersion !== constantsVersion) {
  fail(
    "manifest.json ↔ EXTENSION_VERSION sync",
    `${MANIFEST_PATH}  vs  ${CONSTANTS_PATH}`,
    `Both files must declare the same version`,
    `manifest.json version="${manifestVersion}" but constants.ts EXTENSION_VERSION="${constantsVersion}". Run \`node scripts/bump-version.mjs ${constantsVersion}\` or update manifest.json manually.`,
  );
}

console.log(
  `[OK] Manifest preflight: manifest.json + EXTENSION_VERSION = ${manifestVersion}`,
);
process.exit(0);
