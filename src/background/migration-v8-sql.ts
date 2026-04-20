/**
 * Marco Extension — Schema Migration v8 SQL
 *
 * Creates AssetVersion table for version history tracking
 * of SharedAsset changes (content snapshots + rollback).
 *
 * See: spec/13-features/cross-project-sync.md §VersionHistory
 */

import { ASSET_VERSION_SCHEMA } from "./db-schemas";

/**
 * Returns all v8 SQL statements for runIgnoringDuplicates.
 */
export function getV8Statements(): string[] {
    return ASSET_VERSION_SCHEMA
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => s + ";");
}
