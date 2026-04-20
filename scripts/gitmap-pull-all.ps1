<#
.SYNOPSIS
  gitmap pull all — scan a folder for git repos and pull each one (or run its run.ps1).

.DESCRIPTION
  For each immediate sub-folder under -Root that is a git repository:
    * If the repo contains a run.ps1 file at its root → execute it (it is assumed
      to handle 'git pull' + build/deploy itself, as this project's run.ps1 does).
    * Otherwise → run 'git pull --ff-only' inside the repo.

  Sequential, fail-fast (matches the project's no-retry policy). Each repo's
  result is reported with [OK] / [SKIP] / [FAIL] and a one-line reason.

.PARAMETER Root
  Parent folder to scan. Defaults to the parent of the folder containing this
  script (i.e. running it from inside a repo will scan the workspace folder
  that holds sibling repos).

.PARAMETER DryRun
  Print what would happen without executing git pull or run.ps1.

.PARAMETER Depth
  How many levels to descend when looking for repos. Default 1 (immediate
  children only). Use 2 for grouped layouts like wp-work\<org>\<repo>.

.PARAMETER ForcePull
  Run 'git pull --ff-only' even when run.ps1 is present (skip the run.ps1 hand-off).

.EXAMPLE
  .\scripts\gitmap-pull-all.ps1
    Scan parent of script root, pull each repo or invoke its run.ps1.

.EXAMPLE
  .\scripts\gitmap-pull-all.ps1 -Root D:\wp-work -Depth 2 -DryRun
    Show what would happen across a 2-level org/repo layout, no changes made.
#>
[CmdletBinding()]
param(
    [string]$Root = "",
    [switch]$DryRun,
    [int]$Depth = 1,
    [switch]$ForcePull
)

$ErrorActionPreference = 'Stop'

# ----- Resolve scan root --------------------------------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($Root)) {
    # Default: parent of the repo that contains this script
    $RepoRoot = Split-Path -Parent $ScriptDir
    $Root = Split-Path -Parent $RepoRoot
}
$Root = (Resolve-Path -LiteralPath $Root).Path

if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
    Write-Host ""
    Write-Host "  [ERROR] Scan root does not exist:" -ForegroundColor Red
    Write-Host "          Path     : $Root" -ForegroundColor Red
    Write-Host "          Missing  : directory" -ForegroundColor Red
    Write-Host "          Reason   : -Root parameter pointed at a non-existent folder" -ForegroundColor Red
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " gitmap pull all" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Scan root : $Root"
Write-Host "  Depth     : $Depth"
Write-Host "  Dry-run   : $DryRun"
Write-Host "  Force pull: $ForcePull"
Write-Host ""

# ----- Discover repos -----------------------------------------------------
function Find-Repos {
    param([string]$Base, [int]$RemainingDepth)
    $repos = @()
    if ($RemainingDepth -lt 1) { return $repos }
    Get-ChildItem -LiteralPath $Base -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
        $gitDir = Join-Path $_.FullName '.git'
        if (Test-Path -LiteralPath $gitDir) {
            $repos += $_.FullName
        } elseif ($RemainingDepth -gt 1) {
            $repos += Find-Repos -Base $_.FullName -RemainingDepth ($RemainingDepth - 1)
        }
    }
    return $repos
}

$repos = Find-Repos -Base $Root -RemainingDepth $Depth
if ($repos.Count -eq 0) {
    Write-Host "  No git repositories found under $Root (depth=$Depth)." -ForegroundColor Yellow
    exit 0
}

Write-Host "  Found $($repos.Count) repo(s):" -ForegroundColor Green
$repos | ForEach-Object { Write-Host "    - $_" }
Write-Host ""

# ----- Process each repo --------------------------------------------------
$results = @()
$index = 0
foreach ($repo in $repos) {
    $index++
    $name = Split-Path -Leaf $repo
    Write-Host "[$index/$($repos.Count)] $name" -ForegroundColor Cyan
    Write-Host "        Path: $repo"

    $runPs1 = Join-Path $repo 'run.ps1'
    $useRunPs1 = (-not $ForcePull) -and (Test-Path -LiteralPath $runPs1 -PathType Leaf)

    if ($useRunPs1) {
        Write-Host "        Action: invoke .\run.ps1 (handles its own git pull)" -ForegroundColor Yellow
        if ($DryRun) {
            $results += [pscustomobject]@{ Repo = $name; Action = 'run.ps1'; Status = 'DRYRUN' }
            Write-Host "        [DRYRUN] would execute: $runPs1" -ForegroundColor DarkGray
        } else {
            Push-Location $repo
            try {
                & $runPs1
                $exit = $LASTEXITCODE
                if ($null -eq $exit) { $exit = 0 }
                if ($exit -eq 0) {
                    $results += [pscustomobject]@{ Repo = $name; Action = 'run.ps1'; Status = 'OK' }
                    Write-Host "        [OK] run.ps1 completed (exit 0)" -ForegroundColor Green
                } else {
                    $results += [pscustomobject]@{ Repo = $name; Action = 'run.ps1'; Status = "FAIL (exit $exit)" }
                    Write-Host "        [FAIL] run.ps1 exit $exit" -ForegroundColor Red
                }
            } catch {
                $results += [pscustomobject]@{ Repo = $name; Action = 'run.ps1'; Status = "FAIL ($($_.Exception.Message))" }
                Write-Host "        [FAIL] $($_.Exception.Message)" -ForegroundColor Red
            } finally {
                Pop-Location
            }
        }
    } else {
        Write-Host "        Action: git pull --ff-only" -ForegroundColor Yellow
        if ($DryRun) {
            $results += [pscustomobject]@{ Repo = $name; Action = 'git pull'; Status = 'DRYRUN' }
            Write-Host "        [DRYRUN] would run: git -C `"$repo`" pull --ff-only" -ForegroundColor DarkGray
        } else {
            try {
                $output = & git -C $repo pull --ff-only 2>&1
                $exit = $LASTEXITCODE
                $output | ForEach-Object { Write-Host "          $_" }
                if ($exit -eq 0) {
                    $results += [pscustomobject]@{ Repo = $name; Action = 'git pull'; Status = 'OK' }
                    Write-Host "        [OK] git pull complete" -ForegroundColor Green
                } else {
                    $results += [pscustomobject]@{ Repo = $name; Action = 'git pull'; Status = "FAIL (exit $exit)" }
                    Write-Host "        [FAIL] git pull exit $exit" -ForegroundColor Red
                }
            } catch {
                $results += [pscustomobject]@{ Repo = $name; Action = 'git pull'; Status = "FAIL ($($_.Exception.Message))" }
                Write-Host "        [FAIL] $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
    Write-Host ""
}

# ----- Summary ------------------------------------------------------------
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host " Summary" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
$results | Format-Table -AutoSize Repo, Action, Status | Out-String | Write-Host

$failed = @($results | Where-Object { $_.Status -like 'FAIL*' })
if ($failed.Count -gt 0) {
    Write-Host "  $($failed.Count) repo(s) failed." -ForegroundColor Red
    exit 1
}
Write-Host "  All $($results.Count) repo(s) processed successfully." -ForegroundColor Green
exit 0
