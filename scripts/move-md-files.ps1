# MD Dosyalarını Taşıma Scripti
# Sistem Tarama Raporu 2025 - Dosya Organizasyonu

Write-Host "MD dosyalari tasiniyor..." -ForegroundColor Cyan

# Klasörleri oluştur
if (-not (Test-Path "docs\archive")) {
    New-Item -ItemType Directory -Path "docs\archive" | Out-Null
    Write-Host "[OK] docs\archive klasoru olusturuldu"
}

if (-not (Test-Path "docs\guides")) {
    New-Item -ItemType Directory -Path "docs\guides" | Out-Null
    Write-Host "[OK] docs\guides klasoru olusturuldu"
}

# TAMAMLANDI dosyalarını taşı
$tamamlandiFiles = Get-ChildItem -Path . -Filter "*_TAMAMLANDI.md" -File | Where-Object { $_.DirectoryName -notlike "*docs*" }
foreach ($file in $tamamlandiFiles) {
    $dest = Join-Path "docs\archive" $file.Name
    Move-Item $file.FullName $dest -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] $($file.Name) -> docs\archive\" -ForegroundColor Green
}

# GUIDE dosyalarını taşı
$guideFiles = Get-ChildItem -Path . -Filter "*_GUIDE.md" -File | Where-Object { $_.DirectoryName -notlike "*docs*" }
foreach ($file in $guideFiles) {
    $dest = Join-Path "docs\guides" $file.Name
    Move-Item $file.FullName $dest -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] $($file.Name) -> docs\guides\" -ForegroundColor Green
}

# REHBERI dosyalarını taşı
$rehberiFiles = Get-ChildItem -Path . -Filter "*_REHBERI.md" -File | Where-Object { $_.DirectoryName -notlike "*docs*" }
foreach ($file in $rehberiFiles) {
    $dest = Join-Path "docs\guides" $file.Name
    Move-Item $file.FullName $dest -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] $($file.Name) -> docs\guides\" -ForegroundColor Green
}

Write-Host "`nDosya tasima islemi tamamlandi!" -ForegroundColor Cyan

