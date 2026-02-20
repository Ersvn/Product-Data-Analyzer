# start-dev.ps1
# Startar backend (:price-comparer:bootRun) och frontend (Vite) i separata fönster.
# Öppnar INTE browser.

$ErrorActionPreference = "Stop"

function Find-RepoRoot([string]$startDir) {
    $d = Resolve-Path $startDir
    while ($true) {
        # ✅ rätt: två Test-Path och sedan -or UTANFÖR parentesen
        if ((Test-Path (Join-Path $d "gradlew.bat")) -or (Test-Path (Join-Path $d "gradlew"))) {
            return $d
        }
        $parent = Split-Path $d -Parent
        if ($parent -eq $d) { throw "Kunde inte hitta repo-root (gradlew/gradlew.bat) från: $startDir" }
        $d = $parent
    }
}

$repo = Find-RepoRoot (Get-Location).Path
Write-Host "[dev] Repo root: $repo"

# --- Backend ---
$backendCmd = ".\gradlew :price-comparer:bootRun"
Write-Host "[dev] Starting backend: $backendCmd"
Start-Process powershell -WorkingDirectory $repo -ArgumentList "-NoExit", "-Command", $backendCmd

# --- Frontend (låst path enligt dig) ---
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

#cd C:\Users\eriks\eclipse-workspace\Product-Data-Analyzer
#powershell -ExecutionPolicy Bypass -File .\start-dev.ps1