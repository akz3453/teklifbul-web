# Teklifbul Rule v1.0 — Android release keystore üretir (Play Store imzası)
# Kullanım:
#   .\scripts\generate-android-keystore.ps1
#   .\scripts\generate-android-keystore.ps1 -NonInteractive
#
# Çıktı: android/keystore/nefisoft-release.jks + android/key.properties
# Bu dosyaları YEDEKLEYİN — kaybederseniz uygulamayı güncelleyemezsiniz.

param(
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$keystoreDir = Join-Path $root "android\keystore"
$keystorePath = Join-Path $keystoreDir "nefisoft-release.jks"
$keyPropsPath = Join-Path $root "android\key.properties"
$backupPath = Join-Path $keystoreDir "CREDENTIALS-BACKUP.txt"

function Find-Keytool {
  $candidates = @()
  if ($env:JAVA_HOME) {
    $candidates += (Join-Path $env:JAVA_HOME "bin\keytool.exe")
  }
  $studioRoots = @(
    "D:\Program Files\Android\Android Studio",
    "$env:ProgramFiles\Android\Android Studio",
    "${env:ProgramFiles(x86)}\Android\Android Studio",
    "$env:LOCALAPPDATA\Programs\Android Studio"
  )
  foreach ($s in $studioRoots) {
    $candidates += (Join-Path $s "jbr\bin\keytool.exe")
  }
  $cmd = Get-Command keytool -ErrorAction SilentlyContinue
  if ($cmd) { $candidates += $cmd.Source }
  foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { return $c }
  }
  return $null
}

Write-Host "NEFISOFT Android keystore uretimi" -ForegroundColor Cyan

$keytool = Find-Keytool
if (-not $keytool) {
  Write-Error "keytool bulunamadi. Android Studio (JBR) veya JDK 17+ kurulu olmali."
}

if (Test-Path $keystorePath) {
  Write-Host "Keystore zaten var: $keystorePath" -ForegroundColor Yellow
  if (-not (Test-Path $keyPropsPath)) {
    Write-Host "key.properties yok; NonInteractive ile sifre bilinmeden yeniden uretilemez." -ForegroundColor Yellow
  }
  Write-Host "Yeniden olusturmak icin once eski dosyayi yedekleyip silin." -ForegroundColor Yellow
  exit 0
}

New-Item -ItemType Directory -Force -Path $keystoreDir | Out-Null

if ($NonInteractive) {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $bytes = New-Object byte[] 24
  $rng.GetBytes($bytes)
  $storePass = [Convert]::ToBase64String($bytes).Replace('+','x').Replace('/','y').Substring(0, 24)
  $keyPass = $storePass
  $cn = "NEFISOFT"
  $ou = "Mobile"
  $o = "NEFISOFT"
  $c = "TR"
  Write-Host "NonInteractive: rastgele sifre uretildi (CREDENTIALS-BACKUP.txt)." -ForegroundColor Yellow
} else {
  $storePass = Read-Host "Store password (guclu bir sifre, kaydedin)"
  $keyPass = Read-Host "Key password (bos = store ile ayni)"
  if ([string]::IsNullOrWhiteSpace($keyPass)) { $keyPass = $storePass }

  $cn = Read-Host "Ad Soyad / Marka (CN) [NEFISOFT]"
  if ([string]::IsNullOrWhiteSpace($cn)) { $cn = "NEFISOFT" }
  $ou = Read-Host "Birim (OU) [Mobile]"
  if ([string]::IsNullOrWhiteSpace($ou)) { $ou = "Mobile" }
  $o = Read-Host "Organizasyon (O) [NEFISOFT]"
  if ([string]::IsNullOrWhiteSpace($o)) { $o = "NEFISOFT" }
  $c = Read-Host "Ulke kodu (C) [TR]"
  if ([string]::IsNullOrWhiteSpace($c)) { $c = "TR" }
}

$dname = "CN=$cn, OU=$ou, O=$o, C=$c"

& $keytool -genkeypair `
  -v `
  -keystore $keystorePath `
  -alias nefisoft `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000 `
  -storepass $storePass `
  -keypass $keyPass `
  -dname $dname

if ($LASTEXITCODE -ne 0) { Write-Error "keytool basarisiz" }

@"
storePassword=$storePass
keyPassword=$keyPass
keyAlias=nefisoft
storeFile=../keystore/nefisoft-release.jks
"@ | ForEach-Object {
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [IO.File]::WriteAllText($keyPropsPath, $_.Trim() + "`n", $utf8NoBom)
}

@"
NEFISOFT Android Release Credentials
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Keystore: $keystorePath
Alias: nefisoft
StorePassword: $storePass
KeyPassword: $keyPass

ONEMLI: Bu dosyayi guvenli yere kopyalayin. Git'e eklemeyin.
SHA-1:
  & `"$keytool`" -list -v -keystore `"$keystorePath`" -alias nefisoft -storepass `"$storePass`"
"@ | Set-Content -Path $backupPath -Encoding UTF8

Write-Host ""
Write-Host "Tamamlandi." -ForegroundColor Green
Write-Host "Keystore: $keystorePath"
Write-Host "Properties: $keyPropsPath"
Write-Host "Backup: $backupPath"
Write-Host ""
Write-Host "ONEMLI: keystore + sifreleri guvenli yere yedekleyin. Git'e eklemeyin." -ForegroundColor Yellow
