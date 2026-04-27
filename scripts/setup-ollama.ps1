# Ollama Setup Script (PowerShell)
# Teklifbul Rule v1.0 - Ollama Installation and Configuration

Write-Host "🚀 Ollama Kurulum Başlatılıyor..." -ForegroundColor Cyan

# Check if Ollama is already installed
$ollamaInstalled = Get-Command ollama -ErrorAction SilentlyContinue

if (-not $ollamaInstalled) {
    Write-Host "📦 Ollama bulunamadı. Kurulum başlatılıyor..." -ForegroundColor Yellow
    
    # Try winget first
    $wingetAvailable = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetAvailable) {
        Write-Host "📥 Winget ile Ollama kuruluyor..." -ForegroundColor Green
        winget install Ollama.Ollama --accept-package-agreements --accept-source-agreements
    } else {
        Write-Host "⚠️  Winget bulunamadı. Lütfen Ollama'yı manuel olarak kurun:" -ForegroundColor Yellow
        Write-Host "   https://ollama.com/download" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Kurulumdan sonra bu scripti tekrar çalıştırın." -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "✅ Ollama zaten kurulu" -ForegroundColor Green
}

# Check Ollama service
Write-Host ""
Write-Host "🔍 Ollama servisi kontrol ediliyor..." -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -Method GET -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ Ollama servisi çalışıyor" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Ollama servisi çalışmıyor. Başlatılıyor..." -ForegroundColor Yellow
    Write-Host "   Lütfen Ollama'yı başlatın: ollama serve" -ForegroundColor Cyan
    Write-Host "   Veya Ollama'yı Windows servisi olarak yükleyin." -ForegroundColor Cyan
}

# Pull Llama 3 model
Write-Host ""
Write-Host "📥 Llama 3 modeli indiriliyor..." -ForegroundColor Cyan
Write-Host "   Bu işlem birkaç dakika sürebilir (~4.7GB)..." -ForegroundColor Yellow

try {
    ollama pull llama3
    Write-Host "✅ Llama 3 modeli başarıyla indirildi" -ForegroundColor Green
} catch {
    Write-Host "❌ Model indirme hatası: $_" -ForegroundColor Red
    Write-Host "   Lütfen manuel olarak çalıştırın: ollama pull llama3" -ForegroundColor Yellow
    exit 1
}

# Verify model
Write-Host ""
Write-Host "🔍 Model doğrulanıyor..." -ForegroundColor Cyan

try {
    $models = ollama list
    if ($models -match "llama3") {
        Write-Host "✅ Llama 3 modeli doğrulandı" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Llama 3 modeli bulunamadı" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Model listesi alınamadı" -ForegroundColor Yellow
}

# Environment variables check
Write-Host ""
Write-Host "⚙️  Ortam değişkenleri kontrol ediliyor..." -ForegroundColor Cyan

$envFile = Join-Path $PSScriptRoot ".." ".env"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    
    $requiredVars = @(
        "OLLAMA_BASE_URL",
        "OLLAMA_MODEL",
        "OLLAMA_DAILY_MESSAGE_LIMIT"
    )
    
    $missingVars = @()
    foreach ($var in $requiredVars) {
        if ($envContent -notmatch $var) {
            $missingVars += $var
        }
    }
    
    if ($missingVars.Count -gt 0) {
        Write-Host "⚠️  Aşağıdaki ortam değişkenleri .env dosyasına eklenmeli:" -ForegroundColor Yellow
        foreach ($var in $missingVars) {
            Write-Host "   $var" -ForegroundColor Cyan
        }
        Write-Host ""
        Write-Host "Örnek .env eklemeleri:" -ForegroundColor Yellow
        Write-Host "OLLAMA_BASE_URL=http://localhost:11434" -ForegroundColor Cyan
        Write-Host "OLLAMA_MODEL=llama3" -ForegroundColor Cyan
        Write-Host "OLLAMA_DAILY_MESSAGE_LIMIT=30" -ForegroundColor Cyan
    } else {
        Write-Host "✅ Tüm ortam değişkenleri mevcut" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  .env dosyası bulunamadı" -ForegroundColor Yellow
    Write-Host "   Lütfen .env dosyası oluşturun ve gerekli değişkenleri ekleyin" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "✅ Ollama kurulumu tamamlandı!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Sonraki Adımlar:" -ForegroundColor Cyan
Write-Host "1. Ollama servisinin çalıştığından emin olun: ollama serve" -ForegroundColor White
Write-Host "2. .env dosyasına gerekli değişkenleri ekleyin" -ForegroundColor White
Write-Host "3. Sunucuyu yeniden başlatın: npm run dev:api" -ForegroundColor White
Write-Host "4. Premium Plus hesabıyla giriş yapıp Ollama'yı test edin" -ForegroundColor White

