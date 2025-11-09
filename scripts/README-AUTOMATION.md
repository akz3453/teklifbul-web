# Deployment & Migration Otomasyon Script'i

## Kullanım

### PowerShell (Windows)

```powershell
# Tüm adımları çalıştır (PR'lar dahil)
.\scripts\deploy-and-migrate.ps1

# PR oluşturmayı atla
.\scripts\deploy-and-migrate.ps1 -SkipPR
```

### Bash (Linux/Mac)

```bash
# PowerShell script'i bash'e çevrilmeli veya bash versiyonu oluşturulmalı
# Şimdilik PowerShell script'i kullanın
```

## Adımlar

1. **Önkoşullar Kontrolü**
   - Firebase CLI (`firebase --version`)
   - tsx (`tsx --version`)
   - Node.js 18+
   - Firebase proje hedefi

2. **Index Deploy**
   - `firebase deploy --only firestore:indexes`
   - Log: `logs/deploy-indexes-YYYYMMDD-HHMMSS.log`

3. **Migration**
   - `tsx scripts/migrate-tax-offices-add-lower-fields.ts --batch=1000`
   - Log: `logs/migration-tax-offices-YYYYMMDD-HHMMSS.log`

4. **Smoke Test**
   - `tsx scripts/smoke-tax-offices.ts`
   - Log: `logs/smoke-tax-offices-YYYYMMDD-HHMMSS.log`

5. **TECH-DEBT-TRACK Güncelleme**
   - Otomatik commit ve branch oluşturma

6. **PR Oluşturma (Opsiyonel)**
   - `feat/large-upload-progress-cancel`
   - `feat/migrations-progress-cancel`
   - `perf/tax-offices-index-optimization`

## Çıktı

Script sonunda özet tablo gösterilir:
- Index Deploy: ✅/❌
- Migration: ✅/❌
- Smoke Test: ✅/⚠️/❌
- PR'lar: ✅/⏭️/❌

## Hata Durumu

Herhangi bir adım başarısız olursa:
- İşlem durdurulur
- Hata log'u gösterilir
- Özet çıktı verilir
- Exit code 1 döner

## Notlar

- Tüm log dosyaları `logs/` klasöründe saklanır
- PR oluşturma için `gh` CLI gerekir
- Remote (origin) yoksa PR adımı atlanır
- Smoke test'te veri yoksa uyarı verilir ama hata sayılmaz

