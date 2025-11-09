# Firestore Rules Deploy Kontrolü
# Teklifbul Rule v1.0

Write-Host "🔍 Firestore Rules Kontrolü..." -ForegroundColor Cyan

# Rules dosyası var mı?
if (-not (Test-Path "firestore.rules")) {
    Write-Host "❌ firestore.rules dosyası bulunamadı!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ firestore.rules dosyası mevcut" -ForegroundColor Green

# Deploy komutu
Write-Host "📤 Rules deploy ediliyor..." -ForegroundColor Yellow
npm run deploy:rules

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Firestore rules başarıyla deploy edildi" -ForegroundColor Green
    exit 0
} else {
    Write-Host "⚠️  Deploy hatası - Firebase authentication gerekebilir" -ForegroundColor Yellow
    exit 1
}

