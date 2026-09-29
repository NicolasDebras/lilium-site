# Lance le site en local : API (http://localhost:8000) + frontend (http://localhost:4200).
# Usage (depuis la racine du repo) :  .\start-local.ps1
# Prérequis : Python 3.11+, Node 20+, et api/.env rempli (voir api/.env.example).

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$api = Join-Path $root "api"
$front = Join-Path $root "frontend"

if (-not (Test-Path (Join-Path $api ".env"))) {
    Copy-Item (Join-Path $api ".env.example") (Join-Path $api ".env")
    Write-Host "api/.env créé depuis .env.example : remplis-le (DATABASE_URL, secrets Discord) puis relance ce script." -ForegroundColor Yellow
    exit 1
}

# ── API : venv + dépendances (première fois seulement) ──
$python = Join-Path $api ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "Création de l'environnement Python (api/.venv)..."
    python -m venv (Join-Path $api ".venv")
    & $python -m pip install -r (Join-Path $api "requirements-dev.txt")
}

# ── Frontend : dépendances (première fois seulement) ──
if (-not (Test-Path (Join-Path $front "node_modules"))) {
    Write-Host "Installation des dépendances du frontend..."
    Push-Location $front
    npm install
    Pop-Location
}

Write-Host "Démarrage de l'API sur http://localhost:8000 ..."
Start-Process powershell -WorkingDirectory $api -ArgumentList "-NoExit", "-Command",
    "& '$python' -m uvicorn app.main:create_app --factory --reload --port 8000"

Write-Host "Démarrage du frontend sur http://localhost:4200 ..."
Start-Process powershell -WorkingDirectory $front -ArgumentList "-NoExit", "-Command", "npm start"

Write-Host ""
Write-Host "Ouvre http://localhost:4200 (deux fenêtres PowerShell se sont ouvertes : ferme-les pour arrêter)." -ForegroundColor Green
