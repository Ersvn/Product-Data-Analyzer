# start-dev.ps1
# Startar backend (bootRun) och frontend (Vite) i separata fönster.
# Öppnar INTE browser.

$ErrorActionPreference = "Stop"

function Find-RepoRoot([string]$startDir) {
    $d = Resolve-Path $startDir
    while ($true) {
        if ((Test-Path (Join-Path $d "gradlew.bat")) -or (Test-Path (Join-Path $d "gradlew"))) {
            return $d
        }
        $parent = Split-Path $d -Parent
        if ($parent -eq $d) { throw "Kunde inte hitta repo-root (gradlew/gradlew.bat) från: $startDir" }
        $d = $parent
    }
}

function Get-GradleProjects([string]$repo) {
    $gradlew = Join-Path $repo "gradlew.bat"
    if (-not (Test-Path $gradlew)) { $gradlew = Join-Path $repo "gradlew" }
    if (-not (Test-Path $gradlew)) { throw "Hittar inte gradlew/gradlew.bat i: $repo" }

    Push-Location $repo
    try {
        # --quiet för mindre brus, men projects skriver ändå ut listan
        $out = & $gradlew projects --quiet 2>&1
        return $out
    } finally {
        Pop-Location
    }
}

function Resolve-PriceComparerPath([string]$repo) {
    $out = Get-GradleProjects $repo

    # Vanliga kandidater i monorepo
    $candidates = @(
        ":backend:price-comparer",
        ":price-comparer"
    )

    foreach ($p in $candidates) {
        if ($out -match [regex]::Escape($p)) {
            return $p
        }
    }

    # Fallback: om projects-listan innehåller "price-comparer" men inte exakt path
    # plocka första matchen som ser ut som en gradle path.
    $m = [regex]::Matches($out, "(:[a-zA-Z0-9\-_]+)*:price-comparer")
    if ($m.Count -gt 0) { return $m[0].Value }

    throw "Kunde inte hitta Gradle-projekt för price-comparer. Kör '.\gradlew projects' i root och kolla exakt path."
}

function Stop-Port([int]$port) {
    # Hitta PID som lyssnar på porten och döda den
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

# ---- Resolve correct Gradle path for backend ----
$pcPath = Resolve-PriceComparerPath $repo
Write-Host "[dev] price-comparer Gradle path: $pcPath"

# (Rekommenderat) döda gamla servern så du slipper port 3001-konflikt
Stop-Port 3001

# --- Backend ---
$backendCmd = ".\gradlew $pcPath`:bootRun"
Write-Host "[dev] Starting backend: $backendCmd"
Start-Process powershell -WorkingDirectory $repo -ArgumentList "-NoExit", "-Command", $backendCmd

# --- Frontend (låst path) ---
$frontendDir = Join-Path $repo "frontend\dashboard\client"

if (-not (Test-Path (Join-Path $frontendDir "package.json"))) {
    throw "Hittar inte package.json i frontend-mappen: $frontendDir"
}

Write-Host "[dev] Frontend dir: $frontendDir"

# Välj paketmanager automatiskt
$pm = "npm"
if (Test-Path (Join-Path $frontendDir "pnpm-lock.yaml")) { $pm = "pnpm" }
elseif (Test-Path (Join-Path $frontendDir "yarn.lock")) { $pm = "yarn" }

# Installera deps om node_modules saknas
if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "[dev] Installing frontend deps via $pm..."
    Start-Process powershell -WorkingDirectory $frontendDir -ArgumentList "-NoExit", "-Command", "$pm install"
}

# Starta dev-server
Write-Host "[dev] Starting frontend dev server..."
Start-Process powershell -WorkingDirectory $frontendDir -ArgumentList "-NoExit", "-Command", "$pm run dev"

Write-Host "[dev] Done. Backend/frontend kör i egna fönster."