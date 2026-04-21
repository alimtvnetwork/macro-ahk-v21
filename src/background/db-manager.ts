/**
 * Marco Extension — Database Manager
 *
 * OPFS-first SQLite persistence with chrome.storage.local fallback
 * and in-memory last resort.
 *
 * @see spec/05-chrome-extension/19-opfs-persistence-strategy.md — Persistence strategy
 * @see .lovable/memory/architecture/storage/sqlite-implementation.md — SQLite architecture
 * @see .lovable/memory/architecture/storage/db-manager-binding.md — Handler binding pattern
 */

import type { Database as SqlJsDatabase } from "sql.js";
import initSqlJs from "./sqljs-loader";
import { migrateSchema } from "./schema-migration";
import { FULL_LOGS_SCHEMA, ERRORS_SCHEMA } from "./db-schemas";
import {
    flushToStorage,
    loadFromStorage,
    loadOrCreateFromOpfs,
    saveToOpfs,
} from "./db-persistence";
import { wrapDatabaseWithBindSafety } from "./sqlite-bind-safety";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SqlJs = typeof import("sql.js");
type PersistenceMode = "opfs" | "storage" | "memory";

export interface DbManager {
    getLogsDb(): SqlJsDatabase;
    getErrorsDb(): SqlJsDatabase;
    getPersistenceMode(): PersistenceMode;
    flushIfDirty(): Promise<void>;
    markDirty(): void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DB_NAMES = {
    logs: "marco-logs.db",
    errors: "marco-errors.db",
} as const;

const STORAGE_KEYS = {
    logs: "sqlite_logs_db",
    errors: "sqlite_errors_db",
} as const;

const FLUSH_DEBOUNCE_MS = 5000;

/* ------------------------------------------------------------------ */
/*  Module State                                                       */
/* ------------------------------------------------------------------ */

let SQL: SqlJs | null = null;
let logsDb: SqlJsDatabase | null = null;
let errorsDb: SqlJsDatabase | null = null;
let persistenceMode: PersistenceMode = "memory";
let isDirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isInitialized = false;

/* ------------------------------------------------------------------ */
/*  Initialization                                                     */
/* ------------------------------------------------------------------ */

/**
 * Performs a fast presence check on the bundled WASM asset before attempting
 * to fetch+initialize it. A HEAD request returns the file size in
 * `Content-Length` (when present) without downloading the body, letting us
 * surface a dedicated, unambiguous "WASM file missing" error path that the
 * popup banner classifies as `kind: "wasm-missing"`.
 *
 * Distinct from the in-flight errors in `loadSqlJs()` because:
 *   - The HEAD result is checked BEFORE we try to use the binary, so we can
 *     fail fast with a clearly-worded message that names the exact missing
 *     packaged path (`chrome-extension/wasm/sql-wasm.wasm`).
 *   - The error tag `WASM_FILE_MISSING_404` is detected verbatim by
 *     `classifyCause()` in BootFailureBanner.tsx, which selects the
 *     dedicated "WASM file missing" fix steps.
 */
async function verifyWasmPresence(wasmUrl: string): Promise<void> {
    let headResponse: Response;
    try {
        headResponse = await fetch(wasmUrl, { method: "HEAD" });
    } catch (err) {
        // HEAD itself threw — treat as a missing file (web_accessible_resources
        // misconfig or extension URL not yet ready). Tagged so the banner picks
        // up the dedicated cause.
        throw new Error(
            `[WASM_FILE_MISSING_404] HEAD request failed for "${wasmUrl}". ` +
            `The file "wasm/sql-wasm.wasm" appears to be missing from the packaged ` +
            `chrome-extension/ output OR is not listed in manifest.web_accessible_resources. ` +
            `Original error: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    if (headResponse.status === 404) {
        throw new Error(
            `[WASM_FILE_MISSING_404] HEAD ${wasmUrl} returned 404. ` +
            `The packaged extension is missing "wasm/sql-wasm.wasm" — rebuild with ` +
            `".\\run.ps1 -d" so viteStaticCopy regenerates it from node_modules/sql.js/dist/, ` +
            `then reload the extension from chrome://extensions.`,
        );
    }
    if (!headResponse.ok) {
        throw new Error(
            `[WASM_FILE_MISSING_404] HEAD ${wasmUrl} returned HTTP ${headResponse.status}. ` +
            `Confirm "wasm/sql-wasm.wasm" is listed in manifest.web_accessible_resources and ` +
            `present at chrome-extension/wasm/sql-wasm.wasm.`,
        );
    }
    // If Content-Length is reported and zero, the file is packaged but empty.
    const contentLength = headResponse.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) === 0) {
        throw new Error(
            `[WASM_FILE_MISSING_404] HEAD ${wasmUrl} reports Content-Length: 0. ` +
            `The packaged WASM file exists but is empty — rebuild the extension to regenerate it.`,
        );
    }
}

/** Loads sql.js WASM binary from the extension bundle. */
async function loadSqlJs(): Promise<SqlJs> {
    // Service workers have no `document`, so sql.js's default locateFile
    // (which uses document.currentScript) throws ReferenceError.
    // We fetch the WASM binary ourselves and pass it directly.
    const wasmUrl = chrome.runtime.getURL("wasm/sql-wasm.wasm");

    // Fast upfront presence check — produces a distinctive
    // "[WASM_FILE_MISSING_404]" tagged error that the popup banner
    // classifies as `kind: "wasm-missing"` with dedicated fix steps.
    await verifyWasmPresence(wasmUrl);

    let wasmResponse: Response;
    try {
        wasmResponse = await fetch(wasmUrl);
    } catch (err) {
        throw new Error(
            `Failed to fetch WASM binary at "${wasmUrl}". ` +
            `Ensure "wasm/sql-wasm.wasm" exists in the chrome-extension/ build output ` +
            `(viteStaticCopy target in vite.config.extension.ts copies it from node_modules/sql.js/dist). ` +
            `Original error: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    if (!wasmResponse.ok) {
        throw new Error(
            `WASM fetch returned HTTP ${wasmResponse.status} for "${wasmUrl}". ` +
            `Ensure "wasm/sql-wasm.wasm" is listed in manifest.web_accessible_resources ` +
            `and the file was copied to chrome-extension/wasm/ during the build.`,
        );
    }

    let wasmBinary: ArrayBuffer;
    try {
        wasmBinary = await wasmResponse.arrayBuffer();
    } catch (err) {
        throw new Error(
            `Failed to read WASM binary as ArrayBuffer from "${wasmUrl}". ` +
            `Original error: ${err instanceof Error ? err.message : String(err)}`,
        );
    }

    if (wasmBinary.byteLength === 0) {
        throw new Error(
            `WASM binary at "${wasmUrl}" is empty (0 bytes). ` +
            `The file exists but has no content — rebuild the extension to regenerate it.`,
        );
    }

    try {
        return await initSqlJs({ wasmBinary });
    } catch (err) {
        throw new Error(
            `sql.js initSqlJs() factory failed after ${wasmBinary.byteLength}-byte WASM was fetched successfully. ` +
            `This usually means the WASM binary is corrupted or incompatible with the sql.js JS shim version. ` +
            `Run "pnpm install" to ensure node_modules/sql.js/dist/sql-wasm.wasm matches the installed sql.js version. ` +
            `Original error: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
}

/** Attempts to load or create a DB from OPFS. */
async function tryOpfsInit(): Promise<boolean> {
    try {
        const root = await navigator.storage.getDirectory();

        logsDb = await loadOrCreateFromOpfs(SQL!, root, DB_NAMES.logs, FULL_LOGS_SCHEMA);
        errorsDb = await loadOrCreateFromOpfs(SQL!, root, DB_NAMES.errors, ERRORS_SCHEMA);
        persistenceMode = "opfs";

        console.log("[db-manager] OPFS persistence active");
        return true;
    } catch (err) {
        console.error(`[db-manager] OPFS unavailable\n  Path: navigator.storage.getDirectory() → OPFS root\n  Missing: SQLite database files (logs + errors)\n  Reason: ${err instanceof Error ? err.message : String(err)} — OPFS may not be supported or quota exceeded`, err);
        return false;
    }
}

/** Attempts to load or create a DB from chrome.storage.local. */
async function tryStorageInit(): Promise<boolean> {
    try {
        logsDb = await loadFromStorage(SQL!, STORAGE_KEYS.logs, FULL_LOGS_SCHEMA);
        errorsDb = await loadFromStorage(SQL!, STORAGE_KEYS.errors, ERRORS_SCHEMA);
        persistenceMode = "storage";

        console.log("[db-manager] storage.local persistence active");
        return true;
    } catch (err) {
        console.error(`[db-manager] storage.local persistence failed\n  Path: chrome.storage.local → SQLite serialized blobs\n  Missing: Deserialized SQLite database instances\n  Reason: ${err instanceof Error ? err.message : String(err)}`, err);
        return false;
    }
}

/** Creates in-memory databases as a last resort. */
function initInMemory(): void {
    logsDb = new SQL!.Database();
    logsDb.run(FULL_LOGS_SCHEMA);

    errorsDb = new SQL!.Database();
    errorsDb.run(ERRORS_SCHEMA);
    persistenceMode = "memory";

    console.log("[db-manager] In-memory only (no persistence)");
}

/** Initializes databases with OPFS → storage → memory fallback. */
export async function initDatabases(): Promise<DbManager> {
    if (isInitialized) {
        return buildManager();
    }

    SQL = await loadSqlJs();
    await initWithFallback();
    await migrateSchema(logsDb!, errorsDb!);

    isInitialized = true;
    return buildManager();
}

/** Tries OPFS, then storage, then in-memory. */
async function initWithFallback(): Promise<void> {
    const isOpfsReady = await tryOpfsInit();

    if (isOpfsReady) {
        return;
    }

    const isStorageReady = await tryStorageInit();
    const isFallbackNeeded = isStorageReady === false;

    if (isFallbackNeeded) {
        initInMemory();
    }
}

/* ------------------------------------------------------------------ */
/*  Flush Logic                                                        */
/* ------------------------------------------------------------------ */

/** Marks databases as needing a flush, debounced. */
function markDirty(): void {
    isDirty = true;
    const hasExistingTimer = flushTimer !== null;

    if (hasExistingTimer) {
        clearTimeout(flushTimer!);
    }
    flushTimer = setTimeout(() => void flushIfDirty(), FLUSH_DEBOUNCE_MS);
}

/** Flushes databases to persistent storage if dirty. */
async function flushIfDirty(): Promise<void> {
    const isClean = isDirty === false;

    if (isClean) {
        return;
    }
    isDirty = false;

    await flushByMode();
}

/** Dispatches flush to the correct persistence backend. */
async function flushByMode(): Promise<void> {
    const isOpfs = persistenceMode === "opfs";

    if (isOpfs) {
        return flushToOpfs();
    }

    const isStorage = persistenceMode === "storage";

    if (isStorage) {
        await flushToStorage({
            logsDb: logsDb!,
            errorsDb: errorsDb!,
            logsKey: STORAGE_KEYS.logs,
            errorsKey: STORAGE_KEYS.errors,
        });
    }
}

/** Flushes both databases to OPFS. */
async function flushToOpfs(): Promise<void> {
    const root = await navigator.storage.getDirectory();

    await saveToOpfs(root, DB_NAMES.logs, logsDb!);
    await saveToOpfs(root, DB_NAMES.errors, errorsDb!);
}

/* ------------------------------------------------------------------ */
/*  Public Manager                                                     */
/* ------------------------------------------------------------------ */

/** Builds the public DbManager interface. */
function buildManager(): DbManager {
    // Wrap the live DB handles so every handler call routes through
    // assertBindable() before reaching sql.js. Wrapping happens at the
    // accessor boundary so direct internal references (flush, export)
    // continue to operate on the raw instance.
    const wrappedLogs = wrapDatabaseWithBindSafety(logsDb!);
    const wrappedErrors = wrapDatabaseWithBindSafety(errorsDb!);
    return {
        getLogsDb: () => wrappedLogs,
        getErrorsDb: () => wrappedErrors,
        getPersistenceMode: () => persistenceMode,
        flushIfDirty,
        markDirty,
    };
}
