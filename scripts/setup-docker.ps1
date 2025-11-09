# Docker Setup Script for Teklifbul (PowerShell)
# Teklifbul Rule v1.0

Write-Host "🐳 Docker ile PostgreSQL ve Redis kurulumu" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Docker kontrolü
try {
    $dockerVersion = docker --version 2>&1
    Write-Host "✅ Docker bulundu: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker kurulu değil!" -ForegroundColor Red
    Write-Host "💡 Docker Desktop'ı indirin: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Docker Compose kontrolü
try {
    $composeVersion = docker compose version 2>&1
    Write-Host "✅ Docker Compose bulundu" -ForegroundColor Green
} catch {
    try {
        $composeVersion = docker-compose --version 2>&1
        Write-Host "✅ Docker Compose bulundu (legacy)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Docker Compose bulunamadı!" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""

# Container'ları durdur (varsa)
Write-Host "🛑 Mevcut container'lar durduruluyor..." -ForegroundColor Yellow
try {
    docker compose down 2>&1 | Out-Null
} catch {
    try {
        docker-compose down 2>&1 | Out-Null
    } catch {
        # Container'lar zaten durmuş olabilir
    }
}

# Container'ları başlat
Write-Host "🚀 PostgreSQL ve Redis container'ları başlatılıyor..." -ForegroundColor Cyan
try {
    docker compose up -d
} catch {
    docker-compose up -d
}

# Bekleme
Write-Host "⏳ Container'ların başlaması bekleniyor..." -ForegroundColor Yellow
Start-Sleep -Seconds 8

# Sağlık kontrolü
Write-Host ""
Write-Host "🔍 Sağlık kontrolü yapılıyor..." -ForegroundColor Cyan

# PostgreSQL kontrolü
try {
    $pgCheck = docker exec teklifbul-postgres pg_isready -U postgres 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ PostgreSQL hazır" -ForegroundColor Green
    } else {
        Write-Host "⚠️  PostgreSQL henüz hazır değil, biraz bekleyin..." -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  PostgreSQL kontrolü yapılamadı, container başlıyor olabilir..." -ForegroundColor Yellow
}

# Redis kontrolü
try {
    $redisCheck = docker exec teklifbul-redis redis-cli ping 2>&1
    if ($redisCheck -eq "PONG") {
        Write-Host "✅ Redis hazır" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Redis henüz hazır değil, biraz bekleyin..." -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Redis kontrolü yapılamadı, container başlıyor olabilir..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "✅ Kurulum tamamlandı!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Bilgiler:" -ForegroundColor Cyan
Write-Host "   PostgreSQL: localhost:5432"
Write-Host "   Database: teklifbul"
Write-Host "   User: postgres"
Write-Host "   Password: postgres123"
Write-Host ""
Write-Host "   Redis: localhost:6379"
Write-Host ""
Write-Host "💡 .env dosyasını oluşturun veya güncelleyin:" -ForegroundColor Yellow
Write-Host "   POSTGRES_HOST=localhost"
Write-Host "   POSTGRES_PORT=5432"
Write-Host "   POSTGRES_DB=teklifbul"
Write-Host "   POSTGRES_USER=postgres"
Write-Host "   POSTGRES_PASSWORD=postgres123"
Write-Host ""
Write-Host "🔧 Migration'ları çalıştırın:" -ForegroundColor Cyan
Write-Host "   npm run migrate:categories"
Write-Host "   npm run migrate:tax-offices"
Write-Host "   npm run seed:categories"
Write-Host ""

