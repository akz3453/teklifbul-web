#!/bin/bash
# Ollama Setup Script (Bash)
# Teklifbul Rule v1.0 - Ollama Installation and Configuration

set -e

echo "🚀 Ollama Kurulum Başlatılıyor..."

# Check if Ollama is already installed
if ! command -v ollama &> /dev/null; then
    echo "📦 Ollama bulunamadı. Kurulum başlatılıyor..."
    echo "📥 Ollama indiriliyor..."
    
    # Download and install Ollama
    curl -fsSL https://ollama.com/install.sh | sh
    
    if [ $? -eq 0 ]; then
        echo "✅ Ollama başarıyla kuruldu"
    else
        echo "❌ Ollama kurulumu başarısız"
        echo "   Lütfen manuel olarak kurun: https://ollama.com/download"
        exit 1
    fi
else
    echo "✅ Ollama zaten kurulu"
fi

# Check Ollama service
echo ""
echo "🔍 Ollama servisi kontrol ediliyor..."

if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✅ Ollama servisi çalışıyor"
else
    echo "⚠️  Ollama servisi çalışmıyor. Başlatılıyor..."
    echo "   Lütfen Ollama'yı başlatın: ollama serve"
    echo "   Veya systemd servisi olarak yükleyin."
fi

# Pull Llama 3 model
echo ""
echo "📥 Llama 3 modeli indiriliyor..."
echo "   Bu işlem birkaç dakika sürebilir (~4.7GB)..."

if ollama pull llama3; then
    echo "✅ Llama 3 modeli başarıyla indirildi"
else
    echo "❌ Model indirme hatası"
    echo "   Lütfen manuel olarak çalıştırın: ollama pull llama3"
    exit 1
fi

# Verify model
echo ""
echo "🔍 Model doğrulanıyor..."

if ollama list | grep -q "llama3"; then
    echo "✅ Llama 3 modeli doğrulandı"
else
    echo "⚠️  Llama 3 modeli bulunamadı"
fi

# Environment variables check
echo ""
echo "⚙️  Ortam değişkenleri kontrol ediliyor..."

ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
    REQUIRED_VARS=("OLLAMA_BASE_URL" "OLLAMA_MODEL" "OLLAMA_DAILY_MESSAGE_LIMIT")
    MISSING_VARS=()
    
    for var in "${REQUIRED_VARS[@]}"; do
        if ! grep -q "^${var}=" "$ENV_FILE"; then
            MISSING_VARS+=("$var")
        fi
    done
    
    if [ ${#MISSING_VARS[@]} -gt 0 ]; then
        echo "⚠️  Aşağıdaki ortam değişkenleri .env dosyasına eklenmeli:"
        for var in "${MISSING_VARS[@]}"; do
            echo "   $var"
        done
        echo ""
        echo "Örnek .env eklemeleri:"
        echo "OLLAMA_BASE_URL=http://localhost:11434"
        echo "OLLAMA_MODEL=llama3"
        echo "OLLAMA_DAILY_MESSAGE_LIMIT=30"
    else
        echo "✅ Tüm ortam değişkenleri mevcut"
    fi
else
    echo "⚠️  .env dosyası bulunamadı"
    echo "   Lütfen .env dosyası oluşturun ve gerekli değişkenleri ekleyin"
fi

echo ""
echo "✅ Ollama kurulumu tamamlandı!"
echo ""
echo "📝 Sonraki Adımlar:"
echo "1. Ollama servisinin çalıştığından emin olun: ollama serve"
echo "2. .env dosyasına gerekli değişkenleri ekleyin"
echo "3. Sunucuyu yeniden başlatın: npm run dev:api"
echo "4. Premium Plus hesabıyla giriş yapıp Ollama'yı test edin"

