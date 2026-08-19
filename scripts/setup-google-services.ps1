# Teklifbul Rule v1.0 — google-services.json kurulum rehberi (konsol)
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root "android\app\google-services.json"
$example = Join-Path $root "android\app\google-services.json.example"

Write-Host "NEFISOFT Push / Firebase Android kurulumu" -ForegroundColor Cyan
Write-Host ""
Write-Host "1) https://console.firebase.google.com/project/teklifbul/settings/general"
Write-Host "2) Your apps > Add app > Android"
Write-Host "3) Package name: com.nefisoft.app"
Write-Host "4) App nickname: NEFISOFT"
Write-Host "5) google-services.json indir"
Write-Host "6) Dosyayi su yola koy:"
Write-Host "   $target" -ForegroundColor Yellow
Write-Host "7) npm run cap:sync"
Write-Host "8) Android Studio'dan Run veya: npm run cap:build:android"
Write-Host ""
Write-Host "Ornek sablon: $example"
Write-Host ""

if (Test-Path $target) {
  Write-Host "[OK] google-services.json mevcut" -ForegroundColor Green
} else {
  Write-Host "[EKSIK] google-services.json henuz yok - push calismaz, uygulama yine acilir." -ForegroundColor Yellow
}
