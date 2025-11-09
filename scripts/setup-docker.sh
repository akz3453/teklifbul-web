#!/bin/bash
# Docker Setup Script for Teklifbul
# Teklifbul Rule v1.0

echo "🐳 Docker ile PostgreSQL ve Redis kurulumu"
echo "=========================================="
echo ""

# Docker kontrolü
if ! command -v docker &> /dev/null; then
    echo "❌ Docker kurulu değil!"
    echo "💡 Docker Desktop'ı indirin: https://www.docker.com/products/docker-desktop"
    exit 1
fi

echo "✅ Docker bulundu"
echo ""

# Docker Compose kontrolü
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose bulunamadı!"
    exit 1
fi

echo "✅ Docker Compose bulundu"
echo ""

# Container'ları durdur (varsa)
echo "🛑 Mevcut container'lar durduruluyor..."
docker-compose down 2>/dev/null || docker compose down 2>/dev/null

# Container'ları başlat
echo "🚀 PostgreSQL ve Redis container'ları başlatılıyor..."
docker-compose up -d || docker compose up -d

# Bekleme
echo "⏳ Container'ların başlaması bekleniyor..."
sleep 5

# Sağlık kontrolü
echo ""
echo "🔍 Sağlık kontrolü yapılıyor..."

# PostgreSQL kontrolü
if docker exec teklifbul-postgres pg_isready -U postgres &> /dev/null; then
    echo "✅ PostgreSQL hazır"
else
    echo "⚠️  PostgreSQL henüz hazır değil, biraz bekleyin..."
fi

# Redis kontrolü
if docker exec teklifbul-redis redis-cli ping &> /dev/null; then
    echo "✅ Redis hazır"
else
    echo "⚠️  Redis henüz hazır değil, biraz bekleyin..."
fi

echo ""
echo "=========================================="
echo "✅ Kurulum tamamlandı!"
echo ""
echo "📋 Bilgiler:"
echo "   PostgreSQL: localhost:5432"
echo "   Database: teklifbul"
echo "   User: postgres"
echo "   Password: postgres123"
echo ""
echo "   Redis: localhost:6379"
echo ""
echo "💡 .env dosyasını oluşturun veya güncelleyin:"
echo "   POSTGRES_HOST=localhost"
echo "   POSTGRES_PORT=5432"
echo "   POSTGRES_DB=teklifbul"
echo "   POSTGRES_USER=postgres"
echo "   POSTGRES_PASSWORD=postgres123"
echo ""
echo "🔧 Migration'ları çalıştırın:"
echo "   npm run migrate:categories"
echo "   npm run migrate:tax-offices"
echo "   npm run seed:categories"
echo ""

