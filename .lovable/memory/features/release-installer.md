# Memory: features/release-installer
Updated: 2026-04-21

## Two-channel installer model

The repo ships **two installer pairs** for the Chrome extension:

| Channel | Files | Default | Distribution |
|---------|-------|---------|--------------|
| Latest | `scripts/install.ps1` · `scripts/install.sh` | Resolves `latest` from GitHub API | `raw.githubusercontent.com` on `main` + release asset |
| **Pinned** | `scripts/release-version.ps1` · `scripts/release-version.sh` | Installs **exactly** the release the file came from | **Release asset only** — never advertised on `main` |

## Pinned installer rules

1. Version is determined by a **stamped constant** (`$script:PinnedVersion` / `PINNED_VERSION`). The committed source contains the sentinel `__PINNED_VERSION__`; `release.yml` substitutes the real version via `sed` when packaging assets.
2. If the sentinel is still present at runtime, the installer falls back to **URL parsing** (`/releases/download/(vX.Y.Z)/`) on `$MyInvocation.MyCommand.Path`, `$PSCommandPath`, `$0`, `$BASH_SOURCE`, or `MARCO_INSTALLER_URL`.
3. If neither yields a version, the installer **errors with exit code 2** — it never queries `latest`.
4. `-Version vX.Y.Z` is allowed as an explicit override. The literal `latest` is hard-rejected (exit 3). Branch names and unversioned strings are rejected by the format regex `^v\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$`.
5. If the targeted release's `marco-extension-{VER}.zip` asset is missing on GitHub, the installer **errors with exit code 4** — it never rolls forward.

## Exit-code contract

| Code | Meaning |
|------|---------|
| 0 | Install succeeded |
| 2 | Cannot determine target version (sentinel + no URL context) |
| 3 | Invalid `-Version` argument (incl. `latest`) |
| 4 | Targeted release asset missing |
| 5 | Network/tool error during download |
| 6 | Extracted archive invalid (no files / no manifest) |

## Release-pipeline contract (`release.yml`)

The "Package release assets" step **must**:

1. `sed`-substitute `__PINNED_VERSION__` → real version in both `release-version.ps1` and `release-version.sh`.
2. `chmod +x` the bash variant.
3. **Verify** with `grep -q '__PINNED_VERSION__'` that no sentinel survived. If any does, fail the workflow with `::error::`.
4. Place both files in `release-assets/` so the existing `sha256sum *` and `softprops/action-gh-release` steps pick them up.

## Release-notes contract

The "Quick Install" section in the generated release body is split into **two clearly labeled subsections**:

- 🔒 **Pinned to this release (recommended)** — uses `release-version.{ps1,sh}` from the release download URL.
- 🌊 **Latest channel (auto-update)** — uses `install.{ps1,sh}` from `raw.githubusercontent.com/.../main/`.

Pinned comes **first** because users landing on a specific release page usually want that exact version.

## Spec source of truth

`spec/18-release-installer/` (overview, version-pinning contract, asset packaging, release-notes template, security review).
