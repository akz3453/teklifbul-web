# Index Deploy → Migration → Smoke Test (Otomasyon)
# Teklifbul Rule v1.0 - Otomatik deployment ve migration script
#
# Bu script şu adımları sırayla çalıştırır:
# 1. Önkoşulları kontrol eder
# 2. Firestore index'lerini deploy eder
# 3. Migration çalıştırır
# 4. Smoke test yapar
# 5. TECH-DEBT-TRACK günceller
# 6. (Opsiyonel) PR açar

param(
    [switch]$SkipPR = $false
)

$ErrorActionPreference = "Stop"
$script:LogDir = "logs"
$script:Results = @{
    IndexDeploy = "HATA"
    Migration = "HATA"
    SmokeTest = "HATA"
    PRs = "ATLANDI"
}

# Logs klasörü oluştur
if (-not (Test-Path $script:LogDir)) {
    New-Item -ItemType Directory -Path $script:LogDir | Out-Null
}

function Write-Log {
    param([string]$Message, [string]$LogFile)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    if ($LogFile) {
        Add-Content -Path $LogFile -Value $logMessage -Encoding UTF8
    }
}

function Test-Prerequisites {
    Write-Log "Onkosullar kontrol ediliyor..." ""
    
    # Firebase CLI kontrolü
    try {
        $firebaseVersion = firebase --version 2>&1
        Write-Log "OK Firebase CLI: $firebaseVersion" ""
    } catch {
        Write-Log "HATA Firebase CLI bulunamadi. Lutfen yukleyin: npm install -g firebase-tools" ""
        exit 1
    }
    
    # tsx kontrolü
    try {
        $tsxVersion = npx tsx --version 2>&1
        Write-Log "OK tsx: $tsxVersion" ""
    } catch {
        Write-Log "HATA tsx bulunamadi. Lutfen yukleyin: npm install -g tsx" ""
        exit 1
    }
    
    # Node versiyon kontrolü
    $nodeVersion = node --version
    $nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($nodeMajor -lt 18) {
        Write-Log "HATA Node.js versiyonu 18+ olmali. Mevcut: $nodeVersion" ""
        exit 1
    }
    Write-Log "OK Node.js: $nodeVersion" ""
    
    # Firebase proje kontrolü
    try {
        $firebaseProject = firebase use 2>&1 | Select-String -Pattern "Using (.+)" | ForEach-Object { $_.Matches.Groups[1].Value }
        Write-Log "OK Firebase proje: $firebaseProject" ""
    } catch {
        Write-Log "UYARI Firebase proje kontrolu basarisiz. Devam ediliyor..." ""
    }
    
    Write-Log "OK Tum onkosullar saglandi" ""
}

function Deploy-Indexes {
    Write-Log "Firestore index'leri deploy ediliyor..." ""
    
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $logFile = Join-Path $script:LogDir "deploy-indexes-$timestamp.log"
    
    try {
        $output = firebase deploy --only firestore:indexes 2>&1 | Tee-Object -FilePath $logFile
        
        if ($LASTEXITCODE -eq 0) {
            if ($output -match "indexes.*deployed" -or $output -match "Deployed") {
                Write-Log "OK Index'ler basariyla deploy edildi" $logFile
                $script:Results.IndexDeploy = "OK"
                return $true
            } else {
                Write-Log "UYARI Deploy tamamlandi ama onay mesaji bulunamadi" $logFile
                $script:Results.IndexDeploy = "UYARI"
                return $true
            }
        } else {
            Write-Log "HATA Index deploy basarisiz (exit code: $LASTEXITCODE)" $logFile
            $script:Results.IndexDeploy = "HATA"
            return $false
        }
    } catch {
        Write-Log "HATA Index deploy hatasi: $_" $logFile
        $script:Results.IndexDeploy = "HATA"
        return $false
    }
}

function Run-Migration {
    Write-Log "Migration calistiriliyor..." ""
    
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $logFile = Join-Path $script:LogDir "migration-tax-offices-$timestamp.log"
    
    try {
        $output = npx tsx scripts/migrate-tax-offices-add-lower-fields.ts --batch=1000 2>&1 | Tee-Object -FilePath $logFile
        
        if ($LASTEXITCODE -eq 0) {
            if ($output -match "Migration tamamlandi" -or $output -match "processed") {
                Write-Log "OK Migration basariyla tamamlandi" $logFile
                $script:Results.Migration = "OK"
                return $true
            } else {
                Write-Log "UYARI Migration tamamlandi ama ozet bulunamadi" $logFile
                $script:Results.Migration = "UYARI"
                return $true
            }
        } else {
            Write-Log "HATA Migration basarisiz (exit code: $LASTEXITCODE)" $logFile
            $script:Results.Migration = "HATA"
            return $false
        }
    } catch {
        Write-Log "HATA Migration hatasi: $_" $logFile
        $script:Results.Migration = "HATA"
        return $false
    }
}

function Run-SmokeTest {
    Write-Log "Smoke test calistiriliyor..." ""
    
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $logFile = Join-Path $script:LogDir "smoke-tax-offices-$timestamp.log"
    
    try {
        $output = npx tsx scripts/smoke-tax-offices.ts 2>&1 | Tee-Object -FilePath $logFile
        
        if ($LASTEXITCODE -eq 0) {
            if ($output -match "veri yok" -or $output -match "no data") {
                Write-Log "UYARI Smoke test: Veri yok (demo ortam olabilir)" $logFile
                $script:Results.SmokeTest = "UYARI"
                return $true
            } else {
                Write-Log "OK Smoke test basarili" $logFile
                $script:Results.SmokeTest = "OK"
                return $true
            }
        } else {
            Write-Log "HATA Smoke test basarisiz (exit code: $LASTEXITCODE)" $logFile
            $script:Results.SmokeTest = "HATA"
            return $false
        }
    } catch {
        Write-Log "HATA Smoke test hatasi: $_" $logFile
        $script:Results.SmokeTest = "HATA"
        return $false
    }
}

function Update-TechDebtTrack {
    Write-Log "TECH-DEBT-TRACK guncelleniyor..." ""
    
    try {
        # Git branch oluştur
        $branchName = "docs/tech-debt-update-$(Get-Date -Format 'yyyyMMdd')"
        git checkout -b $branchName 2>&1 | Out-Null
        
        # TECH-DEBT-TRACK.md dosyasını oku ve güncelle
        $techDebtPath = "TECH-DEBT-TRACK.md"
        if (Test-Path $techDebtPath) {
            $content = Get-Content $techDebtPath -Raw -Encoding UTF8
            
            # Migration ve Tax Offices optimizasyonunu tamamlandı olarak işaretle
            $content = $content -replace '\[ \] \*\*Progress bar entegrasyonu \(kalan\)\*\*', '[x] **Progress bar entegrasyonu (kalan)**'
            $content = $content -replace '\[ \] Migration script''leri', '[x] Migration script''leri OK'
            $content = $content -replace '\[x\] \*\*Performans: getTaxOffices optimizasyonu\*\*', '[x] **Performans: getTaxOffices optimizasyonu** OK'
            
            Set-Content -Path $techDebtPath -Value $content -NoNewline -Encoding UTF8
            
            # Commit
            git add $techDebtPath
            git add $script:LogDir
            git commit -m "docs: mark migrations + tax offices optimization as completed; add logs" 2>&1 | Out-Null
            
            Write-Log "OK TECH-DEBT-TRACK guncellendi ve commit edildi" ""
            return $branchName
        } else {
            Write-Log "UYARI TECH-DEBT-TRACK.md bulunamadi" ""
            return $null
        }
    } catch {
        Write-Log "UYARI TECH-DEBT-TRACK guncelleme hatasi: $_" ""
        return $null
    }
}

function Create-PRs {
    if ($SkipPR) {
        Write-Log "PR olusturma atlandi (--SkipPR flag)" ""
        return
    }
    
    Write-Log "PR'lar olusturuluyor..." ""
    
    try {
        # Remote kontrolü
        $remotes = git remote -v 2>&1
        if (-not $remotes -or -not ($remotes -match "origin")) {
            Write-Log "⏭️  Git remote (origin) bulunamadı. PR'lar atlandı." ""
            $script:Results.PRs = "⏭️ (remote yok)"
            return
        }
        
        $branches = @(
            "feat/large-upload-progress-cancel",
            "feat/migrations-progress-cancel",
            "perf/tax-offices-index-optimization"
        )
        
        $createdPRs = 0
        
        foreach ($branch in $branches) {
            # Branch var mı kontrol et
            $branchExists = git show-ref --verify --quiet "refs/heads/$branch" 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Log "⏭️  Branch yok: $branch" ""
                continue
            }
            
            try {
                # Branch'e geç ve push et
                git checkout $branch 2>&1 | Out-Null
                git push -u origin $branch 2>&1 | Out-Null
                
                # gh CLI kontrolü
                $ghExists = Get-Command gh -ErrorAction SilentlyContinue
                if ($ghExists) {
                    $prTitle = "${branch}: auto PR"
                    $prBody = "Automated PR: indexes deploy, migration run, smoke tests. Loglar /logs altinda."
                    gh pr create --fill --title $prTitle --body $prBody 2>&1 | Out-Null
                    if ($LASTEXITCODE -eq 0) {
                        Write-Log "✅ PR oluşturuldu: $branch" ""
                        $createdPRs++
                    } else {
                        Write-Log "⚠️  PR oluşturulamadı: $branch" ""
                    }
                } else {
                    Write-Log "⚠️  gh CLI bulunamadı. PR manuel oluşturulmalı: $branch" ""
                }
            } catch {
                Write-Log "⚠️  Branch işleme hatası ($branch): $_" ""
            }
        }
        
        if ($createdPRs -gt 0) {
            $script:Results.PRs = "OK ($createdPRs PR)"
        } else {
            $script:Results.PRs = "UYARI (manuel)"
        }
    } catch {
        Write-Log "UYARI PR olusturma hatasi: $_" ""
        $script:Results.PRs = "HATA"
    }
}

function Show-Summary {
    Write-Log "`nOZET" ""
    Write-Log ("=" * 50) ""
    
    Write-Log "Index Deploy: $($script:Results.IndexDeploy)" ""
    Write-Log "Migration: $($script:Results.Migration)" ""
    Write-Log "Smoke Test: $($script:Results.SmokeTest)" ""
    Write-Log "PR'lar: $($script:Results.PRs)" ""
    
    Write-Log "`nLog Dosyalari:" ""
    $logFiles = Get-ChildItem $script:LogDir -Filter "*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 3
    foreach ($logFile in $logFiles) {
        Write-Log "   - $($logFile.FullName)" ""
    }
    
    # Başarısızlık kontrolü
    $hasFailures = ($script:Results.IndexDeploy -eq "HATA") -or 
                   ($script:Results.Migration -eq "HATA") -or 
                   ($script:Results.SmokeTest -eq "HATA")
    
    if ($hasFailures) {
        Write-Log "`nHATA: BAZI ADIMLAR BASARISIZ!" ""
        Write-Log "Lutfen log dosyalarini kontrol edin." ""
        exit 1
    } else {
        Write-Log "`nOK: TUM ADIMLAR TAMAMLANDI!" ""
        exit 0
    }
}

# Ana akış
try {
    Write-Log "Index Deploy -> Migration -> Smoke Test Otomasyonu Baslatiliyor..." ""
    Write-Log ("=" * 50) ""
    
    # 0) Önkoşullar
    Test-Prerequisites
    
    # 1) Index deploy
    if (-not (Deploy-Indexes)) {
        Write-Log "HATA Index deploy basarisiz. Islem durduruluyor." ""
        Show-Summary
        exit 1
    }
    
    # 2) Migration
    if (-not (Run-Migration)) {
        Write-Log "HATA Migration basarisiz. Islem durduruluyor." ""
        Show-Summary
        exit 1
    }
    
    # 3) Smoke test
    if (-not (Run-SmokeTest)) {
        Write-Log "UYARI Smoke test basarisiz ama devam ediliyor..." ""
    }
    
    # 4) TECH-DEBT-TRACK güncelle
    $updateBranch = Update-TechDebtTrack
    
    # 5) PR'lar (opsiyonel)
    if (-not $SkipPR) {
        Create-PRs
    }
    
    # 6) Özet
    Show-Summary
    
} catch {
    Write-Log "HATA Kritik hata: $_" ""
    Show-Summary
    exit 1
}

