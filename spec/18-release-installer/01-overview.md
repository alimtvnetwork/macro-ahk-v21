# 01 — Overview

## Two Installer Channels

| Channel | Script | Default Behavior | Distributed Via |
|---------|--------|------------------|-----------------|
| **Latest** (existing) | `scripts/install.ps1` · `scripts/install.sh` | Calls `api.github.com/.../releases/latest`, installs newest non-prerelease | `raw.githubusercontent.com` URL on `main` branch + release asset |
| **Pinned** (new) | `scripts/release-version.ps1` · `scripts/release-version.sh` | Installs **exactly** the version of the release the file was downloaded from. **Never queries `latest`.** | Release asset only — no `raw.githubusercontent.com` URL |

Both installers share:
- Asset name `marco-extension-{VERSION}.zip`
- Default install dir (`$HOME/marco-extension` on Windows, `~/marco-extension` elsewhere)
- Manifest validation, file-count check, `VERSION` marker
- Load-unpacked summary at the end

They **diverge only on version resolution and update policy**.

## Goals (Pinned Installer)

1. **Reproducible installs from a release page**. A user copying the one-liner from the v2.158.0 release notes always lands on v2.158.0, regardless of what `latest` is at the moment of execution.
2. **Zero implicit network for version resolution**. No call to `api.github.com/.../releases/latest`. The version is known before any download starts.
3. **Self-contained**. The same script bytes shipped on every release work because they read their own URL context — but each release also stamps a constant inside the file to make it deterministic when URL context is unavailable (e.g., `irm | iex`).
4. **Override allowed but explicit**. `-Version vX.Y.Z` lets a user redirect to a *specific* other version. `latest` is **not** an accepted value; passing it errors out.
5. **No silent fallback to latest**. If the pinned version is missing on GitHub (deleted, retracted), the script **errors and exits non-zero**. It does not roll forward.

## Non-Goals

- **Cross-version migration**: The pinned installer does not migrate user data between versions. That is the extension's responsibility on first launch.
- **Replacing `install.ps1` / `install.sh`**: Those remain for the "latest" channel. Anyone who wants auto-update behavior keeps using them.
- **Signature / GPG verification**: Out of scope for v0.1. The security review (05) discusses this as a future hardening step.

## Asset Matrix (per release)

| Asset | Channel | Stamped Version | Notes |
|-------|---------|-----------------|-------|
| `install.ps1` | Latest | None | Resolves `latest` if no `-Version` |
| `install.sh` | Latest | None | Resolves `latest` if no `--version` |
| `release-version.ps1` | **Pinned (new)** | `v2.158.0` baked in | Hard-bound to this release |
| `release-version.sh` | **Pinned (new)** | `v2.158.0` baked in | Hard-bound to this release |
| `marco-extension-{VER}.zip` | Both | `{VER}` in filename | The actual extension payload |

## Existing Code Reuse

The pinned installers reuse the same helper functions as the latest installers (download, extract, validate, summary). Only **`Resolve-Version` / `resolve_version`** is replaced — instead of calling the GitHub API, it returns the stamped constant (or parses the URL).

This keeps maintenance cost low: both files share the same install/extract/summary code, copy-pasted with the version-resolution function swapped.
