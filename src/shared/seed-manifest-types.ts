/**
 * Marco Extension — Seed Manifest Types
 *
 * Declarative schema for `seed-manifest.json`, generated at build time
 * from each project's `instruction.json`.
 *
 * The seeder reads this single file to know what scripts, configs,
 * and projects to seed — no hardcoded chunks needed.
 */

/* ------------------------------------------------------------------ */
/*  Top-Level Manifest                                                 */
/* ------------------------------------------------------------------ */

export interface SeedManifest {
    /** ISO timestamp when the manifest was generated */
    generatedAt: string;
    /** Schema version for forward compatibility */
    schemaVersion: number;
    /** All project entries to seed */
    projects: SeedProjectEntry[];
}

/* ------------------------------------------------------------------ */
/*  Per-Project Entry                                                  */
/* ------------------------------------------------------------------ */

export interface SeedProjectEntry {
    /** Project folder name (e.g., "macro-controller") */
    name: string;
    /** Human-readable name */
    displayName: string;
    /** Semantic version */
    version: string;
    /** Description */
    description: string;

    /** Deterministic seed ID for chrome.storage.local */
    seedId: string;
    /** Whether this project seeds on first install */
    seedOnInstall: boolean;
    /** Chrome execution world */
    world: "MAIN" | "ISOLATED";
    /** Global load order (lower = first) */
    loadOrder: number;
    /** Whether this is a global utility */
    isGlobal: boolean;
    /** Whether the user can remove this project */
    isRemovable: boolean;
    /** Project dependencies (other project folder names) */
    dependencies: string[];

    /** Script entries to seed into chrome.storage.local */
    scripts: SeedScriptEntry[];
    /** Config entries to seed into chrome.storage.local */
    configs: SeedConfigEntry[];
    /** CSS files to inject into <head> */
    css: SeedCssEntry[];
    /** Template registries */
    templates: SeedTemplateEntry[];
    /** Prompt files */
    prompts: SeedPromptEntry[];

    /** Target URL patterns for injection */
    targetUrls: SeedUrlPattern[];
    /** Cookie bindings for auth */
    cookies: SeedCookieBinding[];

    /** Project-level settings overrides */
    settings?: SeedProjectSettings;
}

/* ------------------------------------------------------------------ */
/*  Asset Entries                                                      */
/* ------------------------------------------------------------------ */

export interface SeedScriptEntry {
    /** Deterministic ID for this script in storage */
    seedId: string;
    /** File name (e.g., "macro-looping.js") */
    file: string;
    /** Relative path in extension dist (e.g., "projects/scripts/macro-controller/macro-looping.js") */
    filePath: string;
    /** Injection order within the project */
    order: number;
    /** Whether this is an IIFE bundle */
    isIife: boolean;
    /** Config key this script depends on (resolved to config seedId at seed time) */
    configBinding?: string;
    /** Config key for theme data (resolved to config seedId at seed time) */
    themeBinding?: string;
    /** Cookie name binding */
    cookieBinding?: string;
    /** When to run: document_start, document_idle, document_end */
    runAt?: "document_start" | "document_idle" | "document_end";
    /** Description */
    description?: string;
    /** Whether to auto-inject on page load */
    autoInject: boolean;
}

export interface SeedConfigEntry {
    /** Deterministic ID for this config in storage */
    seedId: string;
    /** File name (e.g., "macro-looping-config.json") */
    file: string;
    /** Relative path in extension dist */
    filePath: string;
    /** Key used for binding resolution */
    key: string;
    /** Window global variable name */
    injectAs?: string;
    /** Description */
    description?: string;
}

export interface SeedCssEntry {
    /** File name */
    file: string;
    /** Relative path in extension dist */
    filePath: string;
    /** Injection target */
    inject: "head";
}

export interface SeedTemplateEntry {
    /** File name */
    file: string;
    /** Relative path in extension dist */
    filePath: string;
    /** Window global variable name */
    injectAs?: string;
}

export interface SeedPromptEntry {
    /** File name */
    file: string;
    /** Relative path in extension dist */
    filePath: string;
}

/* ------------------------------------------------------------------ */
/*  URL & Cookie Patterns                                              */
/* ------------------------------------------------------------------ */

export interface SeedUrlPattern {
    pattern: string;
    matchType: "glob" | "regex";
}

export interface SeedCookieBinding {
    cookieName: string;
    url: string;
    role: "session" | "refresh";
    description: string;
}

/* ------------------------------------------------------------------ */
/*  Project Settings                                                   */
/* ------------------------------------------------------------------ */

export interface SeedProjectSettings {
    isolateScripts?: boolean;
    logLevel?: "debug" | "info" | "warn" | "error";
    retryOnNavigate?: boolean;
    chatBoxXPath?: string;
    onlyRunAsDependency?: boolean;
    allowDynamicRequests?: boolean;
}
