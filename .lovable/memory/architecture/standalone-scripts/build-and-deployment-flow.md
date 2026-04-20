# Memory: architecture/standalone-scripts/build-and-deployment-flow
Updated: 2026-03-22

Standalone scripts (e.g., XPath, macro-controller) are compiled into IIFE bundles in their respective `dist/` folders. Each project also has an `instruction.ts` (compiled to `instruction.json`) that serves as the load manifest.

The build pipeline (`run.ps1 -d`) copies ALL dist/ artifacts into per-project subfolders under `chrome-extension/dist/projects/scripts/{project-name}/`. This replaces the previous flat-file copy approach.

At runtime, the seeder stores **file paths** (not embedded code) in `chrome.storage.local`. The script-resolver fetches code from `chrome.runtime.getURL(filePath)` at injection time, with fallback to the embedded `code` property.

The `copyProjectScripts()` Vite plugin now:
1. Creates a subfolder per project: `dist/projects/scripts/{name}/`
2. Copies ALL files from the script's `dist/` folder into it
3. Includes instruction.json, script-manifest.json, CSS, templates, prompts, and JS bundles
