<#
.SYNOPSIS
  Unified installer for Marco Chrome Extension.

.DESCRIPTION
  Single installer script — the version is auto-derived from the script's
  source URL when downloaded from a GitHub release page (so each release-page
  one-liner is implicitly pinned to that exact version). When run from
  `raw.githubusercontent.com/.../main/` (or from a clone), it falls back to
  resolving the GitHub `latest` release.

  Resolution order:
    1. Explicit -Version override (must match v<major>.<minor>.<patch>[-pre]).
    2. URL parsed from $MyInvocation / $PSCommandPath / $env:MARCO_INSTALLER_URL
       — matching `/releases/download/(vX.Y.Z)/`.
    3. GitHub Releases API → `latest`.

.PARAMETER Version
  Override the resolved version. Must match v<major>.<minor>.<patch>[-pre].
  Pass `latest` to force the API fallback even when a URL pin is present.

.PARAMETER InstallDir
  Target directory. Default: $HOME\marco-extension

.PARAMETER Repo
  GitHub owner/repo. Default: alimtvnetwork/macro-ahk-v21

.EXAMPLE
  # From a release page — installs that exact release (URL-pinned):
  irm https://github.com/alimtvnetwork/macro-ahk-v21/releases/download/v2.158.0/install.ps1 | iex

.EXAMPLE
  # From main — installs the latest release:
  irm https://raw.githubusercontent.com/alimtvnetwork/macro-ahk-v21/main/scripts/install.ps1 | iex

.EXAMPLE
  & ./install.ps1 -Version v2.150.0
#>

param(
    [string]$Version = "",
    [string]$InstallDir = "",
    [string]$Repo = "alimtvnetwork/macro-ahk-v21"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$script:VersionRegex = '^v\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$'

# --- Logging helpers ---

function Write-Step([string]$msg) { Write-Host " $msg" -ForegroundColor Cyan }
function Write-OK   ([string]$msg) { Write-Host " $msg" -ForegroundColor Green }
function Write-Warn ([string]$msg) { Write-Host " $msg" -ForegroundColor Yellow }
function Write-Err  ([string]$msg) { Write-Host " $msg" -ForegroundColor Red }

# --- Version resolution ---

function Test-VersionFormat([string]$v) {
    return $v -match $script:VersionRegex
}

function Get-VersionFromUrl {
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

function Get-LatestVersion {
    Write-Step "Resolving latest release from github.com/$Repo..."
    $url = "https://api.github.com/repos/$Repo/releases/latest"
    try {
        $release = Invoke-RestMethod -Uri $url -UseBasicParsing
        return $release.tag_name
    }
    catch {
        Write-Err "Failed to fetch latest release: $_"
        exit 5
    }
}

function Resolve-Version([string]$override) {
    # 1. Explicit override
    if ($override -ne "") {
        if ($override -ieq "latest") {
            return Get-LatestVersion
        }
        if (-not (Test-VersionFormat $override)) {
            Write-Err "Invalid -Version '$override'. Must match v<major>.<minor>.<patch>[-prerelease] or 'latest'."
            exit 3
        }
        return $override
    }

    # 2. URL-derived pin (release-page download)
    $fromUrl = Get-VersionFromUrl
    if ($fromUrl -and (Test-VersionFormat $fromUrl)) {
        Write-Step "Pinned to $fromUrl (derived from download URL)."
        return $fromUrl
    }

    # 3. Fallback: latest release via API
    return Get-LatestVersion
}

# --- Install dir ---

function Resolve-InstallDir([string]$dir) {
    if ($dir -ne "") { return $dir }
    return Join-Path $HOME "marco-extension"
}

# --- Download ---

function Get-Asset([string]$version) {
    $assetName = "marco-extension-${version}.zip"
    $assetUrl = "https://github.com/$Repo/releases/download/$version/$assetName"

    $tmpDir = Join-Path $env:TEMP "marco-install-$(Get-Random)"
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
    $zipPath = Join-Path $tmpDir $assetName

    Write-Step "Downloading $assetName..."

    try {
        Invoke-WebRequest -Uri $assetUrl -OutFile $zipPath -UseBasicParsing
    }
    catch {
        Write-Err "Download failed: $_"
        Write-Err "URL: $assetUrl"
        Write-Err ""
        Write-Err "Release $version may have been retracted or the asset is missing."
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

function Write-InstallSummary([string]$version, [string]$installDir, [bool]$urlPinned) {
    Write-Host ""
    Write-Step "Install summary"
    $pinNote = if ($urlPinned) { " (pinned via release URL)" } else { "" }
    Write-Host "  Version:     $version$pinNote"
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
    if ($urlPinned) {
        Write-Warn "URL-pinned install — re-running this exact one-liner reinstalls $version."
        Write-Host "  For auto-update, use the install.ps1 from raw.githubusercontent.com/.../main/." -ForegroundColor DarkGray
    } else {
        Write-Host "  To update later, re-run this script — it replaces the folder." -ForegroundColor DarkGray
    }
}

# --- Main ---

function Main {
    Write-Host ""
    Write-Host " Marco Extension installer" -ForegroundColor White
    Write-Host " github.com/$Repo" -ForegroundColor DarkGray
    Write-Host ""

    $urlPinned = ($Version -eq "") -and ($null -ne (Get-VersionFromUrl))

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

    return @{ InstallDir = $resolvedDir; Version = $resolvedVersion; UrlPinned = $urlPinned }
}

$installResult = Main
Write-InstallSummary $installResult.Version $installResult.InstallDir $installResult.UrlPinned

Write-Host ""
Write-OK "Done!"
Write-Host ""
