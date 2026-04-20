#!/usr/bin/env node
/**
 * Manifest Permission Validator
 *
 * Scans src/ for `chrome.*` API calls and cross-checks the result against
 * manifest.json's "permissions" array.
 *
 *   - HARD ERROR if a chrome.* API is used in src/ but its required permission
 *     is NOT declared in manifest.json.
 *   - HARD ERROR if a permission is declared in manifest.json but no matching
 *     chrome.* API is used anywhere in src/ (unused permission).
 *
 * Some permissions cannot be inferred from chrome.* usage (e.g. host_permissions,
 * unlimitedStorage which gates IndexedDB/OPFS quota). Those are listed in
 * SOFT_PERMISSIONS and only warn rather than fail when "unused".
 *
 * Exits 1 on any hard failure so CI / pre-commit can catch drift.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = resolve(ROOT, "manifest.json");
const SRC_DIR = resolve(ROOT, "src");

/* ------------------------------------------------------------------ */
/*  Permission map: chrome.<api> namespace -> manifest permission key  */
/* ------------------------------------------------------------------ */

/** Maps chrome.<NAMESPACE> usage to the manifest permission required. */
const API_TO_PERMISSION = {
    storage: "storage",
    tabs: "tabs",
    scripting: "scripting",
    cookies: "cookies",
    webNavigation: "webNavigation",
    alarms: "alarms",
    contextMenus: "contextMenus",
    offscreen: "offscreen",
    notifications: "notifications",
    downloads: "downloads",
    sidePanel: "sidePanel",
    identity: "identity",
    management: "management",
    webRequest: "webRequest",
    declarativeNetRequest: "declarativeNetRequest",
    bookmarks: "bookmarks",
    history: "history",
    topSites: "topSites",
    idle: "idle",
    power: "power",
    proxy: "proxy",
    tts: "tts",
    pageCapture: "pageCapture",
    desktopCapture: "desktopCapture",
    debugger: "debugger",
    declarativeContent: "declarativeContent",
    fontSettings: "fontSettings",
    privacy: "privacy",
    sessions: "sessions",
    system: "system",
    wallpaper: "wallpaper",
};

/**
 * Permissions that are valid in the manifest but cannot be detected via
 * chrome.<api> usage. They gate browser behavior implicitly (quotas, command
 * shortcuts, focused-tab access, host matching, etc.) so missing chrome.* hits
 * does NOT mean they're unused.
 */
const SOFT_PERMISSIONS = new Set([
    "activeTab",        // Granted on user gesture; no chrome.activeTab namespace.
    "unlimitedStorage", // Quota gate for IndexedDB/OPFS — not an API namespace.
    "commands",         // The "commands" manifest field, not a permission key.
    "background",       // Implicit via manifest.background field.
]);

/* ------------------------------------------------------------------ */
/*  File walker                                                        */
/* ------------------------------------------------------------------ */

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SKIP_DIR_NAMES = new Set([
    "node_modules",
    "dist",
    "__tests__",
    "test",
    "tests",
    "__snapshots__",
]);
/** Files matching these suffixes are excluded (test files don't reflect runtime usage). */
const SKIP_FILE_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"];

/** Recursively yields source-file paths under `dir`, applying skip rules. */
function* walk(dir) {
    let entries;
    try {
        entries = readdirSync(dir);
    } catch {
        return;
    }
    for (const entry of entries) {
        const full = join(dir, entry);
        let st;
        try { st = statSync(full); } catch { continue; }

        if (st.isDirectory()) {
            if (SKIP_DIR_NAMES.has(entry)) continue;
            yield* walk(full);
            continue;
        }

        if (!st.isFile()) continue;
        const isScannable = [...SCAN_EXTENSIONS].some((ext) => entry.endsWith(ext));
        if (!isScannable) continue;
        const isSkipped = SKIP_FILE_SUFFIXES.some((suffix) => entry.endsWith(suffix));
        if (isSkipped) continue;

        yield full;
    }
}

/* ------------------------------------------------------------------ */
/*  Scanner                                                            */
/* ------------------------------------------------------------------ */

/**
 * Strips line comments, block comments, and string/template-literal contents
 * from `src` so the chrome.* regex doesn't trip on docstrings.
 * Returns a string of the same length where non-code regions are replaced by spaces.
 */
function stripNonCode(src) {
    const out = src.split("");
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        const next = src[i + 1];

        // Line comment
        if (ch === "/" && next === "/") {
            while (i < src.length && src[i] !== "\n") { out[i] = " "; i++; }
            continue;
        }

        // Block comment
        if (ch === "/" && next === "*") {
            out[i] = " "; out[i + 1] = " ";
            i += 2;
            while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
                if (src[i] !== "\n") out[i] = " ";
                i++;
            }
            if (i < src.length) { out[i] = " "; out[i + 1] = " "; i += 2; }
            continue;
        }

        // String literals
        if (ch === '"' || ch === "'" || ch === "`") {
            const quote = ch;
            out[i] = " ";
            i++;
            while (i < src.length) {
                if (src[i] === "\\") { out[i] = " "; out[i + 1] = " "; i += 2; continue; }
                if (src[i] === quote) { out[i] = " "; i++; break; }
                if (src[i] !== "\n") out[i] = " ";
                i++;
            }
            continue;
        }

        i++;
    }
    return out.join("");
}

/**
 * Scans every source file under SRC_DIR and returns a Map of
 *   namespace -> Set<"relativePath:line">
 * recording where each chrome.<NAMESPACE> reference appears.
 */
function scanSourceForChromeApiUsage() {
    const usage = new Map();
    const apiPattern = /\bchrome\.([a-zA-Z]+)\b/g;

    for (const file of walk(SRC_DIR)) {
        const raw = readFileSync(file, "utf-8");
        const code = stripNonCode(raw);

        let match;
        while ((match = apiPattern.exec(code)) !== null) {
            const apiName = match[1];

            // Only record namespaces we know about — `chrome.runtime`, `chrome.action`,
            // `chrome.permissions` are MV3 built-ins that don't need a permission entry.
            const permission = API_TO_PERMISSION[apiName];
            if (!permission) continue;

            const lineNum = code.slice(0, match.index).split("\n").length;
            const relPath = relative(ROOT, file).replaceAll("\\", "/");
            const location = `${relPath}:${lineNum}`;

            if (!usage.has(apiName)) usage.set(apiName, new Set());
            usage.get(apiName).add(location);
        }
    }

    return usage;
}

/* ------------------------------------------------------------------ */
/*  Failure helpers                                                    */
/* ------------------------------------------------------------------ */

function fail(title, exactPath, missing, reason) {
    console.error("");
    console.error("========================================");
    console.error("  [CODE RED] MANIFEST PERMISSION CHECK FAILED");
    console.error("========================================");
    console.error(`  Check:    ${title}`);
    console.error(`  Path:     ${exactPath}`);
    console.error(`  Missing:  ${missing}`);
    console.error(`  Reason:   ${reason}`);
    console.error("========================================");
    console.error("");
    process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

if (!existsSync(MANIFEST_PATH)) {
    fail(
        "manifest.json existence",
        MANIFEST_PATH,
        "manifest.json file at repository root",
        "Permission validator cannot run without a manifest. Run `node scripts/check-manifest-version.mjs` first.",
    );
}

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

const declaredPermissions = Array.isArray(manifest.permissions)
    ? new Set(manifest.permissions)
    : new Set();

if (!existsSync(SRC_DIR)) {
    fail(
        "src/ directory existence",
        SRC_DIR,
        "src/ source root for chrome.* scan",
        "Permission validator scans src/ for chrome.<namespace> usage. The directory is missing.",
    );
}

const usage = scanSourceForChromeApiUsage();

/* --- Check 1: every used API has its permission declared ---------- */
const requiredButMissing = [];
for (const [apiName, locations] of usage.entries()) {
    const requiredPermission = API_TO_PERMISSION[apiName];
    if (!declaredPermissions.has(requiredPermission)) {
        requiredButMissing.push({ apiName, requiredPermission, locations });
    }
}

if (requiredButMissing.length > 0) {
    console.error("");
    console.error("========================================");
    console.error("  [CODE RED] MISSING PERMISSIONS IN manifest.json");
    console.error("========================================");
    for (const { apiName, requiredPermission, locations } of requiredButMissing) {
        const sample = [...locations].slice(0, 3);
        const more = locations.size > sample.length
            ? ` (+${locations.size - sample.length} more)`
            : "";
        console.error(`  Missing:  "${requiredPermission}"`);
        console.error(`  API:      chrome.${apiName}`);
        console.error(`  Used in:  ${sample.join(", ")}${more}`);
        console.error(`  Reason:   chrome.${apiName} requires the "${requiredPermission}" permission in manifest.json. Calling it without the declared permission throws TypeError or returns undefined at runtime.`);
        console.error("  ---");
    }
    console.error(`  Fix:      Add ${requiredButMissing.map((r) => `"${r.requiredPermission}"`).join(", ")} to manifest.json "permissions".`);
    console.error("========================================");
    console.error("");
    process.exit(1);
}

/* --- Check 2: every declared permission is actually used ---------- */
const unusedHard = [];
const unusedSoft = [];

for (const declared of declaredPermissions) {
    if (SOFT_PERMISSIONS.has(declared)) continue;

    const isUsed = [...usage.values()].length > 0
        && [...Object.entries(API_TO_PERMISSION)].some(
            ([apiName, perm]) => perm === declared && usage.has(apiName),
        );

    if (!isUsed) {
        // If the declared permission is not in our API_TO_PERMISSION values at all,
        // we cannot validate it — treat as soft (warn only).
        const isKnown = Object.values(API_TO_PERMISSION).includes(declared);
        if (isKnown) {
            unusedHard.push(declared);
        } else {
            unusedSoft.push(declared);
        }
    }
}

if (unusedHard.length > 0) {
    console.error("");
    console.error("========================================");
    console.error("  [CODE RED] UNUSED PERMISSIONS IN manifest.json");
    console.error("========================================");
    for (const perm of unusedHard) {
        console.error(`  Unused:   "${perm}"`);
        console.error(`  Path:     ${MANIFEST_PATH}`);
        console.error(`  Missing:  Any chrome.${perm}.* call in src/`);
        console.error(`  Reason:   Declaring unused permissions triggers Chrome Web Store review warnings, expands the install-time consent prompt, and grows the extension's attack surface. Remove from manifest.json "permissions" or add the corresponding chrome.${perm}.* code.`);
        console.error("  ---");
    }
    console.error("========================================");
    console.error("");
    process.exit(1);
}

if (unusedSoft.length > 0) {
    console.warn(`[WARN] Declared permissions not in validator's known map (cannot verify usage): ${unusedSoft.join(", ")}`);
}

/* --- Success ------------------------------------------------------- */
const usedApis = [...usage.keys()].sort();
console.log(
    `[OK] Manifest permissions validated: ${declaredPermissions.size} declared, ${usedApis.length} chrome.* API namespaces used (${usedApis.join(", ")})`,
);
process.exit(0);
