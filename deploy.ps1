$ErrorActionPreference = "Stop"
$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"

Write-Host "Deployment started..." -ForegroundColor Green

# 1. Backend Build (Express -> functions/dist)
Write-Host "Backend Build (TypeScript)..." -ForegroundColor Cyan
npm run build:api
if ($LASTEXITCODE -ne 0) { Write-Error "Backend build failed!" }

# 2. Functions lib + dependencies
Write-Host "Functions build..." -ForegroundColor Cyan
Push-Location functions
npm install
if ($LASTEXITCODE -ne 0) { Write-Error "Functions npm install failed!" }
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Functions tsc failed!" }
Pop-Location

# 3. Frontend Build
Write-Host "Frontend Build (Vite)..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed!" }

# 4. Deploy hosting + API + indexes (rules ayrı onay ister)
Write-Host "Firebase Deploy (hosting, api, indexes)..." -ForegroundColor Cyan
firebase deploy --only hosting,functions:api,firestore:indexes

Write-Host "Deployment Completed!" -ForegroundColor Green
