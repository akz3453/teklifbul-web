# Teklifbul Rule v1.0 — Mobil gelistirme on kosullari
$ErrorActionPreference = "Continue"
$ok = $true

Write-Host "NEFISOFT mobil onkosul kontrolu" -ForegroundColor Cyan
Write-Host ""

function Check($name, $condition, $hint) {
  if ($condition) {
    Write-Host "[OK] $name" -ForegroundColor Green
  } else {
    Write-Host "[EKSIK] $name" -ForegroundColor Red
    Write-Host "       -> $hint" -ForegroundColor Yellow
    $script:ok = $false
  }
}

function Find-AndroidStudioRoot {
  $candidates = @(
    "D:\Program Files\Android\Android Studio",
    "$env:ProgramFiles\Android\Android Studio",
    "${env:ProgramFiles(x86)}\Android\Android Studio",
    "$env:LOCALAPPDATA\Programs\Android Studio"
  )
  foreach ($c in $candidates) {
    if (Test-Path (Join-Path $c "bin\studio64.exe")) { return $c }
    if (Test-Path (Join-Path $c "jbr\bin\java.exe")) { return $c }
  }
  $reg = Get-ItemProperty "HKLM:\SOFTWARE\Android Studio" -ErrorAction SilentlyContinue
  if ($reg -and $reg.Path -and (Test-Path $reg.Path)) { return $reg.Path }
  return $null
}

function Find-SdkPath {
  $candidates = @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    "$env:LOCALAPPDATA\Android\Sdk",
    "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk",
    "D:\Android\Sdk",
    "D:\Android\sdk"
  ) | Where-Object { $_ -and $_.Trim() -ne "" }
  foreach ($c in $candidates) {
    if (Test-Path $c) { return $c }
  }
  return $null
}

$studioRoot = Find-AndroidStudioRoot
$jbrJava = $null
if ($studioRoot) {
  $jbrJava = Join-Path $studioRoot "jbr\bin\java.exe"
}

$jdkOk = $false
$jdkInfo = ""
if ($jbrJava -and (Test-Path $jbrJava)) {
  $verOut = & $jbrJava -version 2>&1 | Out-String
  if ($verOut -match 'version "(1[7-9]|2[0-9])\.') {
    $jdkOk = $true
    $jdkInfo = "Android Studio JBR: $jbrJava"
  }
}
if (-not $jdkOk) {
  $java = Get-Command java -ErrorAction SilentlyContinue
  if ($java) {
    $verOut = & java -version 2>&1 | Out-String
    if ($verOut -match 'version "(1[7-9]|2[0-9])\.') {
      $jdkOk = $true
      $jdkInfo = "PATH java"
    }
  }
}
if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
  $verOut = & (Join-Path $env:JAVA_HOME "bin\java.exe") -version 2>&1 | Out-String
  if ($verOut -match 'version "(1[7-9]|2[0-9])\.') {
    $jdkOk = $true
    $jdkInfo = "JAVA_HOME=$env:JAVA_HOME"
  }
}

Check "JDK 17+ (Android Studio JBR yeterli)" $jdkOk "Android Studio kuruluysa ayri JDK gerekmez. Studio > Settings > Build Tools > Gradle > Gradle JDK"
if ($jdkOk -and $jdkInfo) { Write-Host "       $jdkInfo" -ForegroundColor DarkGray }

$sdk = Find-SdkPath
Check "Android SDK" ([bool]$sdk) "Android Studio'yu acin > More Actions > SDK Manager > Android SDK kurun (API 35/36)"
if ($sdk) { Write-Host "       $sdk" -ForegroundColor DarkGray }

Check "Android Studio" ([bool]$studioRoot) "https://developer.android.com/studio"
if ($studioRoot) { Write-Host "       $studioRoot" -ForegroundColor DarkGray }

$root = Split-Path -Parent $PSScriptRoot
Check "android/ klasoru" (Test-Path (Join-Path $root "android")) "npm run cap:sync calistirin"
Check "capacitor.config.ts" (Test-Path (Join-Path $root "capacitor.config.ts")) "Capacitor yapilandirmasi eksik"
Check "keystore (opsiyonel)" (Test-Path (Join-Path $root "android\keystore\nefisoft-release.jks")) "npm run cap:keystore:auto"
Check "key.properties (opsiyonel)" (Test-Path (Join-Path $root "android\key.properties")) "npm run cap:keystore:auto"
Check "google-services.json (Android push)" (Test-Path (Join-Path $root "android\app\google-services.json")) "npm run cap:push:setup"
Check "GoogleService-Info.plist (iOS push)" (Test-Path (Join-Path $root "ios\App\App\GoogleService-Info.plist")) "firebase apps:sdkconfig IOS"
$aasa = Join-Path $root "public\.well-known\apple-app-site-association"
$aasaOk = (Test-Path $aasa) -and -not ((Get-Content $aasa -Raw) -match 'TEAMID\.com\.nefisoft\.app')
Check "AASA Apple Team ID" $aasaOk "public/.well-known/apple-app-site-association icindeki TEAMID yerine Apple Team ID yazin"
$envFile = Join-Path $root ".env"
$sentrySet = $false
if (Test-Path $envFile) {
  $sentrySet = [bool](Select-String -Path $envFile -Pattern '^VITE_SENTRY_DSN=.+' -ErrorAction SilentlyContinue | Where-Object { $_.Line -notmatch '^VITE_SENTRY_DSN=\s*$' })
}
if ($sentrySet) {
  Write-Host "[OK] VITE_SENTRY_DSN" -ForegroundColor Green
} else {
  Write-Host "[OPSIYONEL] VITE_SENTRY_DSN yok (browser Sentry no-op)" -ForegroundColor Yellow
}
Check "Android App Links (.well-known)" (Test-Path (Join-Path $root "public\.well-known\assetlinks.json")) "public/.well-known/assetlinks.json.example dosyasini kopyalayip SHA256 ekleyin"

Write-Host ""
if ($studioRoot -and $jbrJava -and (Test-Path $jbrJava) -and -not $env:JAVA_HOME) {
  Write-Host "Ipucu: terminal icin JAVA_HOME ayarlayabilirsiniz:" -ForegroundColor Cyan
  Write-Host ('  [System.Environment]::SetEnvironmentVariable("JAVA_HOME", "{0}", "User")' -f (Join-Path $studioRoot "jbr"))
}
if (-not $sdk) {
  Write-Host ""
  Write-Host "SIMDI YAPIN: Android Studio'yu bir kez acin, kurulum sihirbazinda Android SDK'yi indirin." -ForegroundColor Yellow
  Write-Host "Sonra tekrar: npm run cap:check" -ForegroundColor Yellow
}

Write-Host ""
if ($ok) {
  Write-Host "Temel araclar tamam. Sonraki adim:" -ForegroundColor Green
  Write-Host "  npm run cap:android"
} else {
  Write-Host "Eksikleri tamamlayin; Play Console hesabi EN SON acilir." -ForegroundColor Yellow
}
