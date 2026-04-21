<#
.SYNOPSIS
  Pinned-version installer for Marco Chrome Extension.

.DESCRIPTION
  This installer is bound to a SPECIFIC release version, stamped at release-build
  time. It NEVER queries `latest`. It is shipped only as a GitHub release asset.

  If you want the latest channel, use install.ps1 instead.

.PARAMETER Version
  Override the stamped version with a different SPECIFIC version (e.g. v2.150.0).
  The literal "latest" is rejected. Branch names are rejected. Must match
  v<major>.<minor>.<patch>[-prerelease].

.PARAMETER InstallDir
  Target directory. Default: $HOME\marco-extension

.PARAMETER Repo
  GitHub owner/repo. Default: alimtvnetwork/macro-ahk-v21

.EXAMPLE
  # Standard usage from a release page (one-liner):
  irm https://github.com/alimtvnetwork/macro-ahk-v21/releases/download/v2.158.0/release-version.ps1 | iex

.EXAMPLE
  # Local execution after manual download:
  & ./release-version.ps1

.EXAMPLE
  # Explicit override to a different specific version:
  & ./release-version.ps1 -Version v2.150.0

.NOTES
  Spec: spec/18-release-installer/
  Version-pinning contract: spec/18-release-installer/02-version-pinning-contract.md
#>

param(
    [string]$Version = "",
    [string]$InstallDir = "",
    [string]$Repo = "alimtvnetwork/macro-ahk-v21"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# ──────────────────────────────────────────────────────────────────────
# STAMPED CONSTANT — replaced by release.yml at asset-packaging time.
# In the committed source, this is the sentinel "__PINNED_VERSION__".
# In a real release asset, this is e.g. "v2.158.0".
# ──────────────────────────────────────────────────────────────────────
$script:PinnedVersion = '__PINNED_VERSION__'

$script:VersionRegex = '^v\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$'

# --- Logging helpers ---

function Write-Step([string]$msg) { Write-Host " $msg" -ForegroundColor Cyan }
function Write-OK   ([string]$msg) { Write-Host " $msg" -ForegroundColor Green }
function Write-Err  ([string]$msg) { Write-Host " $msg" -ForegroundColor Red }

# --- Version resolution ---

function Test-VersionFormat([string]$v) {
    return $v -match $script:VersionRegex
}

function Get-VersionFromUrl {
    # Try every URL-bearing variable PowerShell exposes.
    $candidates = @(
        $MyInvocation.MyCommand.Path,
        $PSCommandPath,
        $env:MARCO_INSTALLER_URL
    ) | Where-Object { $_ }

    foreach ($c in $candidates) {
        if ($c -match '/releases/download/(v\d+\.\d+\.\d+[^/]*)/') {
            return $matches[1]
        }
    }
    return $null
}

function Resolve-Version([string]$override) {
    # 1. Explicit user override
    if ($override -ne "") {
        if ($override -ieq "latest") {
            Write-Err "'-Version latest' is not allowed in release-version installer."
            Write-Err "Use scripts/install.ps1 if you want the latest channel."
            exit 3
        }
        if (-not (Test-VersionFormat $override)) {
            Write-Err "Invalid -Version '$override'. Must match v<major>.<minor>.<patch>[-prerelease]."
            exit 3
        }
        return $override
    }

    # 2. Stamped constant
    if ($script:PinnedVersion -ne '__PINNED_VERSION__' -and (Test-VersionFormat $script:PinnedVersion)) {
        return $script:PinnedVersion
    }

    # 3. URL fallback
    $fromUrl = Get-VersionFromUrl
    if ($fromUrl -and (Test-VersionFormat $fromUrl)) {
        return $fromUrl
    }

    # 4. Hard error — no implicit "latest" fallback by design
    Write-Err "release-version installer cannot determine its target version."
    Write-Err "This script is meant to be downloaded from a specific GitHub release page:"
    Write-Err "  https://github.com/$Repo/releases"
    Write-Err ""
    Write-Err "If you want the latest version, use scripts/install.ps1 instead."
    exit 2
}

# --- Install dir ---

function Resolve-InstallDir([string]$dir) {
    if ($dir -ne "") { return $dir }
    return Join-Path $HOME "marco-extension"
}

# --- Download asset ---

function Get-Asset([string]$version) {
    $assetName = "marco-extension-${version}.zip"
    $assetUrl = "https://github.com/$Repo/releases/download/$version/$assetName"

    $tmpDir = Join-Path $env:TEMP "marco-pinned-install-$(Get-Random)"
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
    $zipPath = Join-Path $tmpDir $assetName

    Write-Step "Downloading $assetName ($version)..."

    try {
        Invoke-WebRequest -Uri $assetUrl -OutFile $zipPath -UseBasicParsing
    }
    catch {
        Write-Err "Download failed: $_"
        Write-Err "URL: $assetUrl"
        Write-Err ""
        Write-Err "Release $version may have been retracted or the asset is missing."
        Write-Err "The pinned installer will NOT roll forward to a newer version."
        Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
        exit 4
    }

    Write-OK "Downloaded successfully."
    return @{ ZipPath = $zipPath; TmpDir = $tmpDir }
}

# --- Install ---

function Install-Extension([string]$zipPath, [string]$installDir) {
    Write-Step "Installing to $installDir..."

    if (Test-Path $installDir) {
        Remove-Item $installDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    Expand-Archive -Path $zipPath -DestinationPath $installDir -Force

    $fileCount = (Get-ChildItem -Path $installDir -File -Recurse | Measure-Object).Count
    if ($fileCount -eq 0) {
        Write-Err "Extraction produced no files in $installDir"
        exit 6
    }

    $manifest = Join-Path $installDir "manifest.json"
    if (-not (Test-Path $manifest)) {
        $nested = Get-ChildItem -Path $installDir -Filter "manifest.json" -Recurse | Select-Object -First 1
        if (-not $nested) {
            Write-Err "manifest.json not found — archive may be corrupted."
            exit 6
        }
    }

    Write-OK "Installed $fileCount files to $installDir"
}

function Write-InstallSummary([string]$version, [string]$installDir) {
    Write-Host ""
    Write-Step "Install summary"
    Write-Host "  Version:     $version (pinned)"
    Write-Host "  Install dir: $installDir"
    Write-Host ""
    Write-Host "  ----------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "  To load in Chrome / Edge / Brave:" -ForegroundColor White
    Write-Host ""
    Write-Host "  1. Open chrome://extensions (or edge://extensions)"
    Write-Host "  2. Enable 'Developer mode' (toggle in top-right)"
    Write-Host "  3. Click 'Load unpacked'"
    Write-Host "  4. Select: $installDir"
    Write-Host "  ----------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Pinned install — will NOT auto-update on re-run." -ForegroundColor Yellow
    Write-Host "  For latest-channel installs, use install.ps1 instead." -ForegroundColor DarkGray
}

# --- Main ---

function Main {
    Write-Host ""
    Write-Host " Marco Extension installer (pinned)" -ForegroundColor White
    Write-Host " github.com/$Repo" -ForegroundColor DarkGray
    Write-Host ""

    $resolvedVersion = Resolve-Version $Version
    $resolvedDir = Resolve-InstallDir $InstallDir
    $result = Get-Asset $resolvedVersion

    try {
        Install-Extension $result.ZipPath $resolvedDir
    }
    finally {
        Remove-Item $result.TmpDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    $resolvedVersion | Set-Content (Join-Path $resolvedDir "VERSION")

    return @{ InstallDir = $resolvedDir; Version = $resolvedVersion }
}

$installResult = Main
Write-InstallSummary $installResult.Version $installResult.InstallDir

Write-Host ""
Write-OK "Done!"
Write-Host ""
