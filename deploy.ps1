$ErrorActionPreference = "Stop"

Write-Host "🚀 Teklifbul Deployment Başlatılıyor..." -ForegroundColor Green

# 1. Frontend Build
Write-Host "`n📦 Frontend Build (Vite)..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build başarısız!" }

# 2. Backend Build
Write-Host "`n⚙️ Backend Build (TypeScript)..." -ForegroundColor Cyan
npm run build:api
if ($LASTEXITCODE -ne 0) { Write-Error "Backend build başarısız!" }

# 3. Functions Dependencies
Write-Host "`n📚 Functions Dependencies..." -ForegroundColor Cyan
Push-Location functions
npm install
if ($LASTEXITCODE -ne 0) { Write-Error "Functions npm install başarısız!" }
Pop-Location

# 4. Deploy
Write-Host "`n🔥 Firebase Deploy..." -ForegroundColor Cyan
firebase deploy

Write-Host "`n✅ Deployment Tamamlandı!" -ForegroundColor Green
