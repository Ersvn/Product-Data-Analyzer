# start-dev.ps1
# Starts backend (bootRun) and frontend (Vite) in separate windows.
# Does not open a browser.

$ErrorActionPreference = "Stop"

function Find-RepoRoot([string]$startDir) {
    $d = Resolve-Path $startDir
    while ($true) {
        if ((Test-Path (Join-Path $d "gradlew.bat")) -or (Test-Path (Join-Path $d "gradlew"))) {
            return $d
        }
        $parent = Split-Path $d -Parent
        if ($parent -eq $d) { throw "Could not find repo root (gradlew/gradlew.bat) from: $startDir" }
        $d = $parent
    }
}

function Get-GradleProjects([string]$repo) {
    $gradlew = Join-Path $repo "gradlew.bat"
    if (-not (Test-Path $gradlew)) { $gradlew = Join-Path $repo "gradlew" }
    if (-not (Test-Path $gradlew)) { throw "Could not find gradlew/gradlew.bat in: $repo" }

    Push-Location $repo
    try {
        $out = & $gradlew projects --quiet 2>&1
        return $out
    } finally {
        Pop-Location
    }
}

function Resolve-PriceComparerPath([string]$repo) {
    $out = Get-GradleProjects $repo

    # Common candidates in a monorepo
    $candidates = @(
        ":backend:price-comparer",
        ":price-comparer"
    )

    foreach ($p in $candidates) {
        if ($out -match [regex]::Escape($p)) {
            return $p
        }
    }

    # Fallback: if the projects list contains "price-comparer" but not the exact path,
    # pick the first match that looks like a Gradle path.
    $m = [regex]::Matches($out, "(:[a-zA-Z0-9\-_]+)*:price-comparer")
    if ($m.Count -gt 0) { return $m[0].Value }

    throw "Could not find the Gradle project for price-comparer. Run '.\gradlew projects' in the root and check the exact path."
}

function Stop-Port([int]$port) {
    # Find the PID listening on the port and stop it.
    $lines = netstat -ano | Select-String ":$port\s"
    foreach ($ln in $lines) {
        if ($ln -match "\sLISTENING\s+(\d+)$") {
            $pid = $Matches[1]
            Write-Host "[dev] Port $port in use, killing PID $pid..."
            try { taskkill /PID $pid /F | Out-Null } catch {}
        }
    }
}

$repo = Find-RepoRoot (Get-Location).Path
Write-Host "[dev] Repo root: $repo"

# Resolve correct Gradle path for backend
$pcPath = Resolve-PriceComparerPath $repo
Write-Host "[dev] price-comparer Gradle path: $pcPath"

# Stop any old server to avoid a port 3001 conflict.
Stop-Port 3001

# Demo defaults for local presentation use. Override in your shell if needed.
if (-not $env:DASH_USER) { $env:DASH_USER = "demo" }
if (-not $env:DASH_PASS) { $env:DASH_PASS = "demo-pass" }

# Backend
$backendCmd = ".\gradlew $pcPath`:bootRun"
Write-Host "[dev] Starting backend: $backendCmd"
Start-Process powershell -WorkingDirectory $repo -ArgumentList "-NoExit", "-Command", $backendCmd

# Frontend
$frontendDir = Join-Path $repo "frontend\dashboard\client"

if (-not (Test-Path (Join-Path $frontendDir "package.json"))) {
    throw "Could not find package.json in the frontend folder: $frontendDir"
}

Write-Host "[dev] Frontend dir: $frontendDir"

# Pick package manager automatically
$pm = "npm"
if (Test-Path (Join-Path $frontendDir "pnpm-lock.yaml")) { $pm = "pnpm" }
elseif (Test-Path (Join-Path $frontendDir "yarn.lock")) { $pm = "yarn" }

# Install deps if node_modules is missing
if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "[dev] Installing frontend deps via $pm..."
    Start-Process powershell -WorkingDirectory $frontendDir -ArgumentList "-NoExit", "-Command", "$pm install"
}

# Start dev server
Write-Host "[dev] Starting frontend dev server..."
Start-Process powershell -WorkingDirectory $frontendDir -ArgumentList "-NoExit", "-Command", "$pm run dev"

Write-Host "[dev] Done. Backend/frontend are running in separate windows."
