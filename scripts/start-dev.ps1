# Teklifbul Rule v1.0 - Development Server Starter
# PowerShell script to start dev servers without errors

$ErrorActionPreference = "SilentlyContinue"

Write-Host "🚀 Teklifbul Development Servers" -ForegroundColor Cyan
Write-Host "===============================`n" -ForegroundColor Cyan

# Check if Node.js is installed
try {
    $nodeVersion = node --version 2>&1
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js bulunamadı!" -ForegroundColor Red
    exit 1
}

# Start Frontend (Vite)
Write-Host "`n📦 Frontend server başlatılıyor (Vite)..." -ForegroundColor Yellow
$frontendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    npm run dev 2>&1 | Out-Null
}

# Wait a bit for frontend to start
Start-Sleep -Seconds 2

# Start Backend API
Write-Host "🔧 Backend API server başlatılıyor..." -ForegroundColor Yellow
$backendJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    Set-Location server
    npx tsx index.ts 2>&1 | Out-Null
}

# Wait a bit for backend to start
Start-Sleep -Seconds 3

Write-Host "`n✅ Sunucular başlatıldı!" -ForegroundColor Green
Write-Host "   Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "   Backend API: http://localhost:5174" -ForegroundColor Cyan
Write-Host "`n💡 Durdurmak için: Ctrl+C veya bu pencereyi kapatın`n" -ForegroundColor Yellow

# Keep script running and show status
try {
    while ($true) {
        Start-Sleep -Seconds 5
        $frontendStatus = Get-Job -Id $frontendJob.Id | Select-Object -ExpandProperty State
        $backendStatus = Get-Job -Id $backendJob.Id | Select-Object -ExpandProperty State
        
        if ($frontendStatus -eq "Failed" -or $backendStatus -eq "Failed") {
            Write-Host "⚠️  Bir sunucu durdu. Kontrol ediliyor..." -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "`n🛑 Sunucular durduruluyor..." -ForegroundColor Yellow
    Stop-Job -Job $frontendJob, $backendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $frontendJob, $backendJob -ErrorAction SilentlyContinue
    exit 0
}
