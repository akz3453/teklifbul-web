$ErrorActionPreference = "Stop"

Write-Host "Deployment started..." -ForegroundColor Green

# 1. Frontend Build
Write-Host "Frontend Build (Vite)..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed!" }

# 2. Backend Build
Write-Host "Backend Build (TypeScript)..." -ForegroundColor Cyan
npm run build:api
if ($LASTEXITCODE -ne 0) { Write-Error "Backend build failed!" }

# 3. Functions Dependencies
Write-Host "Functions Dependencies..." -ForegroundColor Cyan
Push-Location functions
npm install
if ($LASTEXITCODE -ne 0) { Write-Error "Functions npm install failed!" }
Pop-Location

# 4. Deploy
Write-Host "Firebase Deploy..." -ForegroundColor Cyan
firebase deploy

Write-Host "Deployment Completed!" -ForegroundColor Green
