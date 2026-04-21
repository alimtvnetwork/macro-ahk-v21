# 02 — Version Pinning Contract

## Resolution Algorithm (both PS1 and Bash)

```
resolve_version():
    1. If user passed -Version / --version explicitly:
        a. Validate format: must match ^v\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$
        b. Reject literal "latest" with a clear error.
        c. Return that value. (Explicit override wins.)

    2. Read $script:PinnedVersion / PINNED_VERSION constant.
        - If it is a real version (matches the regex above), return it. ← primary path
        - If it is the placeholder "__PINNED_VERSION__", treat as "not stamped" and fall through.

    3. URL fallback — try to parse the version from the script's source URL:
        a. PS1: inspect $MyInvocation.MyCommand.Path, $PSCommandPath,
                and the `Referer` header set by Invoke-RestMethod (when available).
        b. Bash: inspect $0 / $BASH_SOURCE / the URL of the wrapping curl call
                 (passed via the MARCO_INSTALLER_URL env var when invoked through
                 `curl … | bash` — see "iwr/curl context" below).
        c. Match regex /releases/download/(v\d+\.\d+\.\d+[^/]*)/ on any candidate.
        d. Return the captured group.

    4. Hard error. Exit code 2 with the message:
        "release-version installer cannot determine its target version.
         This script is meant to be downloaded from a specific GitHub release page.
         If you want the latest version, use install.ps1 / install.sh instead."
```

## Stamping (Build Time)

The repo ships a **template** (`scripts/release-version.ps1`, `scripts/release-version.sh`) with the constant set to a sentinel:

```powershell
$script:PinnedVersion = '__PINNED_VERSION__'
```

```bash
PINNED_VERSION='__PINNED_VERSION__'
```

The release workflow runs a **one-line `sed`** before uploading the asset:

```bash
sed "s/__PINNED_VERSION__/${VER}/g" scripts/release-version.ps1 > release-assets/release-version.ps1
sed "s/__PINNED_VERSION__/${VER}/g" scripts/release-version.sh  > release-assets/release-version.sh
chmod +x release-assets/release-version.sh
```

The committed source file always contains the sentinel; the **release asset** always contains the real version. Running the committed file directly out of a clone falls through to the URL parser, which also fails (no `/releases/download/…` URL context), producing the hard error from step 4. This is the desired safety: you cannot accidentally use the pinned installer from a clone.

## `iwr | iex` and `curl | bash` URL Context

When users run:

```powershell
irm https://github.com/{org}/{repo}/releases/download/v2.158.0/release-version.ps1 | iex
```

PowerShell pipes the script body into `Invoke-Expression`. `$MyInvocation.MyCommand.Path` is **empty** in that context. The stamped constant (step 2) handles this case — the version is already baked into the bytes.

For Bash:

```bash
curl -fsSL https://github.com/{org}/{repo}/releases/download/v2.158.0/release-version.sh | bash
```

Same situation — `$0` is `bash`, not the URL. Again, the stamped constant resolves it.

The URL fallback (step 3) only matters when:
- A user manually downloads `release-version.ps1`, opens it, and runs `.\release-version.ps1` from disk — the file path will (rarely) include a `/releases/download/…` segment if extracted from a download manager that preserves URLs.
- A wrapper sets `MARCO_INSTALLER_URL=…` before piping. This is a documented escape hatch but not a default workflow.

In practice, **the stamped constant carries 100% of real-world traffic**. The URL fallback exists for completeness and as a defense-in-depth check.

## `-Version` Override Rules

| Input | Behavior |
|-------|----------|
| `(none)` | Use stamped version. |
| `-Version v2.150.0` | Install v2.150.0 instead. (Explicit user choice.) |
| `-Version latest` | **Reject** with: `"-Version latest" is not allowed in release-version installer. Use install.ps1 instead.` |
| `-Version 2.150.0` (no `v`) | **Reject** with format error. |
| `-Version main` | **Reject** with format error. |
| `-Version v2.150.0-beta.1` | Accept (matches semver pre-release). |

## Failure Modes

| Scenario | Exit Code | Message |
|----------|-----------|---------|
| Stamped sentinel still present + no URL context | 2 | "Cannot determine target version…" |
| User passed `-Version latest` | 3 | "`latest` is not allowed; use install.ps1" |
| User passed malformed `-Version` | 3 | "Version must match v<major>.<minor>.<patch>" |
| Stamped version asset missing on GitHub (404) | 4 | "Release v2.158.0 has no marco-extension-v2.158.0.zip asset. The release may have been retracted. **The installer will NOT roll forward.**" |
| Network unreachable | 5 | Standard download failure with URL surfaced |
| Manifest missing after extract | 6 | "manifest.json not found — archive may be corrupted" |

Note: there is **no exit code for "fell back to newer version"** — that scenario is impossible by design.
