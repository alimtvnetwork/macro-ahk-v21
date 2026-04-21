# Release Installer — Specification

**Status**: Draft (v0.1)
**Owner**: Build & Release
**Related**: `.github/workflows/release.yml`, `scripts/install.ps1`, `scripts/install.sh`, `scripts/release-version.ps1`, `scripts/release-version.sh`

---

## Why This Exists

The repo currently ships a single installer pair (`install.ps1` / `install.sh`) that **resolves `latest` from the GitHub API** when no `-Version` flag is passed. When that script is published as a release asset, end users running `irm …/install.ps1 | iex` from a pinned release page can still silently jump to a newer version because the script's default behavior is "fetch latest".

This spec introduces a **second, version-pinned installer pair** — `release-version.ps1` / `release-version.sh` — that is shipped **only as a release asset** and is **hard-bound to the version of the release that produced it**. It guarantees:

1. The installer downloaded from `…/releases/download/v2.158.0/release-version.ps1` will install **exactly v2.158.0** by default.
2. It performs **zero network calls to resolve "latest"** unless the user explicitly opts in via `-Version`.
3. The version is determined by a **stamped constant** baked in at release time, with a **download-URL fallback** for `irm | iex` flows that lose script-path context.
4. The existing `install.ps1` / `install.sh` remain the **"latest channel"** option for users who explicitly want auto-update behavior.

## Documents

| # | File | Description |
|---|------|-------------|
| 01 | [01-overview.md](01-overview.md) | Goals, scope, comparison with existing installer, asset matrix |
| 02 | [02-version-pinning-contract.md](02-version-pinning-contract.md) | Stamped constant + URL fallback algorithm, `-Version` override rules |
| 03 | [03-asset-packaging.md](03-asset-packaging.md) | How `release.yml` stamps and uploads the pinned installers |
| 04 | [04-release-notes-template.md](04-release-notes-template.md) | "Pinned" vs "Latest channel" sections in the release body |
| 05 | [05-security-review.md](05-security-review.md) | Threat model, integrity guarantees, no-update enforcement |
