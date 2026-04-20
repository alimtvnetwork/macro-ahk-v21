<#
.SYNOPSIS
  One-liner installer for Marco Chrome Extension.

.DESCRIPTION
  Downloads the latest Marco Extension release from GitHub,
  extracts to a local directory, and prints load-unpacked instructions.

.PARAMETER Version
  Install a specific version (e.g. v2.116.1). Default: latest.

.PARAMETER InstallDir
  Target directory. Default: $HOME\marco-extension

.PARAMETER Repo
  GitHub owner/repo. Default: alimtvnetwork/macro-ahk-v15

.EXAMPLE
  irm https://raw.githubusercontent.com/alimtvnetwork/macro-ahk-v15/main/scripts/install.ps1 | iex

.EXAMPLE
  & ./install.ps1 -Version v2.116.1

.EXAMPLE
  & ./install.ps1 -InstallDir "D:\marco-extension"

.NOTES
  Repository: https://github.com/alimtvnetwork/macro-ahk-v15
#>

param(
    [string]$Version = "",
    [string]$InstallDir = "",
    [string]$Repo = "alimtvnetwork/macro-ahk-v15"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# --- Logging helpers ---

function Write-Step([string]$msg) {
    Write-Host " $msg" -ForegroundColor Cyan
}

function Write-OK([string]$msg) {
    Write-Host " $msg" -ForegroundColor Green
}

function Write-Err([string]$msg) {
    Write-Host " $msg" -ForegroundColor Red
}

# --- Resolve install directory ---

function Resolve-InstallDir([string]$dir) {
    if ($dir -ne "") { return $dir }
    return Join-Path $HOME "marco-extension"
}

# --- Resolve version (latest or pinned) ---

function Resolve-Version([string]$version) {
    if ($version -ne "") { return $version }

    Write-Step "Fetching latest release..."
    $url = "https://api.github.com/repos/$Repo/releases/latest"

    try {
        $release = Invoke-RestMethod -Uri $url -UseBasicParsing
        return $release.tag_name
    }
    catch {
        Write-Err "Failed to fetch latest release: $_"
        exit 1
    }
}

# --- Download asset ---

function Get-Asset([string]$version) {
    $assetName = "marco-extension-${version}.zip"
    $baseUrl = "https://github.com/$Repo/releases/download/$version"
    $assetUrl = "$baseUrl/$assetName"

    $tmpDir = Join-Path $env:TEMP "marco-install-$(Get-Random)"
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

    $zipPath = Join-Path $tmpDir $assetName

    Write-Step "Downloading $assetName ($version)..."

    try {
        Invoke-WebRequest -Uri $assetUrl -OutFile $zipPath -UseBasicParsing
    }
    catch {
        Write-Err "Download failed: $_"
        Write-Err "URL: $assetUrl"
        Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
        exit 1
    }

    Write-OK "Downloaded successfully."
    return @{ ZipPath = $zipPath; TmpDir = $tmpDir }
}

# --- Extract and install ---

function Install-Extension([string]$zipPath, [string]$installDir) {
    Write-Step "Installing to $installDir..."

    if (Test-Path $installDir) {
        Remove-Item $installDir -Recurse -Force
    }

    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    Expand-Archive -Path $zipPath -DestinationPath $installDir -Force

    # Verify extraction produced files
    $fileCount = (Get-ChildItem -Path $installDir -File -Recurse | Measure-Object).Count
    if ($fileCount -eq 0) {
        Write-Err "Extraction produced no files in $installDir"
        exit 1
    }

    # Verify manifest.json exists (Chrome extension marker)
    $manifest = Join-Path $installDir "manifest.json"
    if (-not (Test-Path $manifest)) {
        # Check one level deep (zip may have a subdirectory)
        $nested = Get-ChildItem -Path $installDir -Filter "manifest.json" -Recurse | Select-Object -First 1
        if (-not $nested) {
            Write-Err "Warning: manifest.json not found — may not be a valid Chrome extension"
        }
    }

    Write-OK "Installed $fileCount files to $installDir"
}

function Write-InstallSummary([string]$version, [string]$installDir) {
    Write-Host ""
    Write-Step "Install summary"
    Write-Host "  Version:     $version"
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
    Write-Host "  To update later, re-run this script — it replaces the folder."
    Write-Host ""
    Write-Host "  Example with custom directory:" -ForegroundColor DarkGray
    Write-Host "    .\install.ps1 -InstallDir `"D:\marco-extension`"" -ForegroundColor DarkGray
}

# --- Main ---

function Main {
    Write-Host ""
    Write-Host " Marco Extension installer" -ForegroundColor White
    Write-Host " github.com/$Repo" -ForegroundColor DarkGray
    Write-Host ""

    try {
        $resolvedVersion = Resolve-Version $Version
        $resolvedDir = Resolve-InstallDir $InstallDir

        # Write VERSION marker
        $versionFile = Join-Path $resolvedDir "VERSION"

        $result = Get-Asset $resolvedVersion

        try {
            Install-Extension $result.ZipPath $resolvedDir
        }
        finally {
            Remove-Item $result.TmpDir -Recurse -Force -ErrorAction SilentlyContinue
        }

        # Write version marker after install
        $resolvedVersion | Set-Content (Join-Path $resolvedDir "VERSION")

        return @{ InstallDir = $resolvedDir; Version = $resolvedVersion }
    }
    catch {
        Write-Err "Installation failed: $_"
        Write-Host ""
        Write-Err "If this persists, download manually from:"
        Write-Err "  https://github.com/$Repo/releases/latest"
        Write-Host ""
        return $null
    }
}

$installResult = Main

if (-not $installResult) {
    return
}

Write-InstallSummary $installResult.Version $installResult.InstallDir

Write-Host ""
Write-OK "Done!"
Write-Host ""
