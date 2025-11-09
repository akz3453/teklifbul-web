# Otomatik Kurulum Scripti - Docker Sonrası
# Teklifbul Rule v1.0
# Kullanım: Docker Desktop kurulduktan sonra bu scripti çalıştırın

Write-Host "🚀 Teklifbul Otomatik Kurulum" -ForegroundColor Cyan
Write-Host "===============================`n" -ForegroundColor Cyan

# Docker kontrolü
Write-Host "1️⃣ Docker kontrol ediliyor..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    Write-Host "   ✅ Docker bulundu: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Docker bulunamadı!" -ForegroundColor Red
    Write-Host "   💡 Docker Desktop'ın çalıştığından emin olun" -ForegroundColor Yellow
    Write-Host "   💡 Bilgisayarı yeniden başlatmanız gerekebilir" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Docker Compose kontrolü
Write-Host "2️⃣ Docker Compose kontrol ediliyor..." -ForegroundColor Yellow
try {
    $composeCheck = docker compose version 2>&1
    Write-Host "   ✅ Docker Compose hazır" -ForegroundColor Green
    $useNewCompose = $true
} catch {
    try {
        $composeCheck = docker-compose --version 2>&1
        Write-Host "   ✅ Docker Compose hazır (legacy)" -ForegroundColor Green
        $useNewCompose = $false
    } catch {
        Write-Host "   ❌ Docker Compose bulunamadı!" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""

# Mevcut container'ları durdur
Write-Host "3️⃣ Mevcut container'lar durduruluyor..." -ForegroundColor Yellow
if ($useNewCompose) {
    docker compose down 2>&1 | Out-Null
} else {
    docker-compose down 2>&1 | Out-Null
}
Write-Host "   ✅ Temizlendi" -ForegroundColor Green

Write-Host ""

# Container'ları başlat
Write-Host "4️⃣ PostgreSQL ve Redis container'ları başlatılıyor..." -ForegroundColor Yellow
if ($useNewCompose) {
    docker compose up -d
} else {
    docker-compose up -d
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Container'lar başlatıldı" -ForegroundColor Green
} else {
    Write-Host "   ❌ Container başlatma hatası!" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Bekleme
Write-Host "5️⃣ Container'ların hazır olması bekleniyor (15 saniye)..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# Sağlık kontrolü
Write-Host "6️⃣ Sağlık kontrolü yapılıyor..." -ForegroundColor Yellow

# PostgreSQL
$pgOk = $false
try {
    $pgCheck = docker exec teklifbul-postgres pg_isready -U postgres 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ PostgreSQL hazır" -ForegroundColor Green
        $pgOk = $true
    }
} catch {
    Write-Host "   ⚠️  PostgreSQL henüz hazır değil, bekleniyor..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    try {
        $pgCheck = docker exec teklifbul-postgres pg_isready -U postgres 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ PostgreSQL hazır" -ForegroundColor Green
            $pgOk = $true
        }
    } catch {}
}

if (-not $pgOk) {
    Write-Host "   ⚠️  PostgreSQL kontrolü başarısız, devam ediliyor..." -ForegroundColor Yellow
}

# Redis
$redisOk = $false
try {
    $redisCheck = docker exec teklifbul-redis redis-cli ping 2>&1
    if ($redisCheck -eq "PONG") {
        Write-Host "   ✅ Redis hazır" -ForegroundColor Green
        $redisOk = $true
    }
} catch {
    Write-Host "   ⚠️  Redis kontrol edilemedi (opsiyonel)" -ForegroundColor Yellow
}

Write-Host ""

# Migration'lar
Write-Host "7️⃣ Database migration'ları çalıştırılıyor..." -ForegroundColor Yellow
Write-Host "   Categories migration..." -ForegroundColor White
npm run migrate:categories
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Categories migration tamamlandı" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Categories migration hatası" -ForegroundColor Yellow
}

Write-Host "   Tax Offices migration..." -ForegroundColor White
npm run migrate:tax-offices
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Tax Offices migration tamamlandı" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Tax Offices migration hatası" -ForegroundColor Yellow
}

Write-Host ""

# Seed
Write-Host "8️⃣ Seed data yükleniyor..." -ForegroundColor Yellow
npm run seed:categories
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Seed data yüklendi" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Seed data hatası (PostgreSQL hazır olmayabilir)" -ForegroundColor Yellow
}

Write-Host ""

# Final test
Write-Host "9️⃣ Final test yapılıyor..." -ForegroundColor Yellow
npm run test:connections

Write-Host ""
Write-Host "===============================" -ForegroundColor Cyan
Write-Host "✅ Kurulum tamamlandı!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Sonraki adımlar:" -ForegroundColor Yellow
Write-Host "   npm run test:category-system" -ForegroundColor White
Write-Host "   npm run test:tax-offices-api" -ForegroundColor White
Write-Host ""
Write-Host "🚀 API server başlat:" -ForegroundColor Cyan
Write-Host "   npm run dev:api" -ForegroundColor White
Write-Host ""

