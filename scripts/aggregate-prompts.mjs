#!/usr/bin/env node
/**
 * aggregate-prompts.mjs
 *
 * Reads standalone-scripts/prompts/<seq>-<slug>/{info.json, prompt.md}
 * and produces:
 *   - dist/prompts/macro-prompts.json (single source of truth, copied to chrome-extension/dist/prompts/)
 *
 * Run: node scripts/aggregate-prompts.mjs
 * Called by: run.ps1 -d (seeding phase)
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PROMPTS_DIR = join(ROOT, "standalone-scripts", "prompts");
const DIST_PROMPTS_DIR = join(ROOT, "dist", "prompts");
const OUTPUT = join(DIST_PROMPTS_DIR, "macro-prompts.json");


async function main() {
    const entries = await readdir(PROMPTS_DIR, { withFileTypes: true });
    const folders = entries
        .filter(e => e.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    const prompts = [];

    for (const folder of folders) {
        const dir = join(PROMPTS_DIR, folder.name);
        let info;
        try {
            info = JSON.parse(await readFile(join(dir, "info.json"), "utf-8"));
        } catch {
            console.warn(`⚠ Skipping ${folder.name}: missing/invalid info.json`);
            continue;
        }

        let text;
        try {
            text = (await readFile(join(dir, "prompt.md"), "utf-8")).trim();
        } catch {
            console.warn(`⚠ Skipping ${folder.name}: missing prompt.md`);
            continue;
        }

        const entry = {
            name: info.title || info.name || folder.name,
            text,
        };

        // Include id and slug for programmatic lookup (e.g., Task Next)
        if (info.id) entry.id = info.id;
        if (info.slug) entry.slug = info.slug;

        // Include version
        if (info.version) entry.version = info.version;

        // Include order for sorting
        if (typeof info.order === "number") entry.order = info.order;

        // Include default/favorite flags
        if (info.isDefault) entry.isDefault = true;
        if (info.isFavorite) entry.isFavorite = true;

        // Add category if present (array → first item for legacy compat, or string)
        const cats = info.categories || info.category;
        if (Array.isArray(cats) && cats.length > 0) {
            entry.category = cats[0];
        } else if (typeof cats === "string" && cats) {
            entry.category = cats;
        }

        prompts.push(entry);
    }

    const output = { prompts };
    const payload = JSON.stringify(output, null, 2) + "\n";

    await mkdir(DIST_PROMPTS_DIR, { recursive: true });
    await writeFile(OUTPUT, payload, "utf-8");

    console.log(`✅ Aggregated ${prompts.length} prompts → ${OUTPUT}`);
}

main().catch(err => {
    console.error("❌ aggregate-prompts failed:", err);
    process.exit(1);
});
