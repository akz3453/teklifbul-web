# 🚀 Teklifbul - Production Go-Live Checklist

> **Hazirlanma tarihi:** 2026-04-27
> **Sürüm:** v1.0 (ilk production launch)
>
> Bu checklist `npm run smoke` + build temizligi ile dogrulanmis durumdadir.
> Tüm "✅ Hazır" maddeleri otomatik testler ile dogrulanir.

---

## 1) Build & Tip Sağlığı (Hazır ✅)

- [x] `npm run build:api` → 0 TypeScript hatası
- [x] `npm run build` (Vite) → başarılı
- [x] `npm run lint` → 0 error (warnings non-blocking)
- [x] `npm run smoke` → `/health` 200 OK, `status=ok`

> Komutlar:
> ```powershell
> npm run build:api
> npm run build
> npm run lint
> npm run smoke
> ```

---

## 2) Environment Değişkenleri (Production)

Server tarafı kritik env'ler (`server/env-validator.ts`):

| Env | Zorunluluk | Açıklama |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` veya `GOOGLE_APPLICATION_CREDENTIALS` | **Zorunlu** | Firebase Admin SDK |
| `ALLOWED_ORIGINS` | **Zorunlu** | CORS whitelist (örn: `https://teklifbul.com`) |
| `APP_URL` | **Zorunlu** | `https://teklifbul.com` |
| `GROQ_API_KEY` veya `OPENAI_API_KEY` veya `GEMINI_API_KEY` | **Zorunlu** | En az bir AI sağlayıcı |
| `PAYMENT_WEBHOOK_SECRET` | **Zorunlu** | Webhook HMAC secret |
| `SENTRY_DSN` | Önerilen | Hata izleme |
| `ADMIN_EMAILS` | Önerilen | Super admin listesi |
| `RESEND_API_KEY` | Önerilen | Email bildirimleri |
| `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` | Önerilen | AppCheck |
| `VITE_GOOGLE_MAPS_API_KEY` | Önerilen | Harita özellikleri (HTTP referrer kısıtlı) |

**Adımlar:**
- [ ] `.env.production` hazırlandı (gerçek secret'lar ile, **commit edilmedi**)
- [ ] Firebase Functions config / GitHub Secrets / hosting environment'a env'ler yüklendi
- [ ] `NODE_ENV=production` olarak ayarlı
- [ ] `RECAPTCHA_DISABLED=0` (production'da MUTLAKA aktif)
- [ ] `ENABLE_ESCROW_DEMO=0`
- [ ] `CACHE_DISABLED=0`
- [ ] `DEBUG_MODE=0`

---

## 3) Secret Audit (Hazır ✅)

- [x] Hardcoded `RESEND_API_KEY` `functions/src/index.ts`'ten kaldırıldı
- [x] Hardcoded Google Maps API key `assets/js/google-maps-loader.js`'ten kaldırıldı (artık `VITE_GOOGLE_MAPS_API_KEY` veya `window.__APP_CONFIG__` üzerinden)
- [x] `docs/archive/GROQ_MIGRATION_SUMMARY.md`'deki gerçek Groq API key redacted
- [x] `.env.example` tüm env'ler için güncel (commit'lendi, secret içermiyor)
- [x] `.gitignore` ile `.env`, `firebase-service-account.json` korunmakta

**Önerilen ek aksiyonlar (deploy öncesi):**
- [ ] Önceden expose olmuş Resend / Groq / Maps anahtarlarını **rotate** edin
- [ ] Google Maps API key'ini Cloud Console'da **HTTP referrer** ile kısıtlayın (yalnızca `https://*.teklifbul.com/*`)
- [ ] OpenAI / Groq anahtarlarına aylık **usage limit** koyun

---

## 4) Firebase Konfig (`firebase.json`)

- [x] `firestore.rules` referansı var
- [x] `firestore.indexes.json` referansı var
- [x] `storage.rules` referansı **eklendi** (yeni)
- [x] Hosting → `dist/` (Vite build output)
- [x] Hosting rewrites: `/api/**` → `api` Cloud Function
- [x] `functions/src/index.ts` içinde `exports.api = onRequest(..., app)` mevcut

**Deploy komutları:**
```powershell
# Sadece kuralları test et
firebase emulators:start --only firestore,storage

# Production deploy
firebase deploy --only firestore:rules,storage:rules
firebase deploy --only firestore:indexes
firebase deploy --only hosting
firebase deploy --only functions:api
firebase deploy --only functions  # tüm fonksiyonlar
```

> **Önerilen sıralama (ilk deploy):**
> 1. `firebase deploy --only firestore:rules,storage:rules,firestore:indexes`
> 2. `firebase deploy --only functions` (api dahil)
> 3. `firebase deploy --only hosting`

---

## 5) Firestore Security Rules (Audit Yapıldı ✅)

`firestore.rules` üzerinden teyit edilmiş güvenlik özellikleri:

- [x] `rules_version = '2'`
- [x] **Default deny** (en sondaki `match /{document=**}`) sadece `isSuperAdmin()`
- [x] `isSuperAdmin()` custom claim üzerinden (`request.auth.token.superAdmin == true`) — email tabanlı admin yok
- [x] `companyMatch()` ile şirket bazlı izolasyon
- [x] Kritik alanlar (`companyId`, `role`, `superAdmin`) kullanıcı tarafından değiştirilemez
- [x] Audit log koleksiyonları **append-only**
- [x] `paymentRequests` üzerinde requesterUserId/status üzerinde sıkı kontrol
- [x] PII (email, phone vb.) sadece sahip + şirket erişimi

**Storage rules** (`storage.rules`):
- [x] Supplier docs sadece sahibi erişebilir
- [x] Demand attachments sadece authenticated kullanıcılar
- [x] Default deny

**Önerilen son kontrol:**
- [ ] `firebase emulators:start --only firestore` ile rules'ları local olarak test edin
- [ ] `npm run test:rules` ile rules unit testlerini çalıştırın

---

## 6) Cloud Functions

Mevcut fonksiyonlar (`functions/src/index.ts` + `functions/index.js`):
- `api` (HTTPS) — Express app, ana API
- `fx` (HTTPS) — TCMB döviz proxy
- `generateSATFK` (Firestore trigger)
- `backfillMissingSATFK` (HTTPS)
- `normalizeDemandCategories` (Firestore trigger)
- `normalizeSupplierCategories` (Firestore trigger)
- `auditDemandChanges` / `auditBidChanges`
- `searchBySATFK` (HTTPS)
- `generateStockSearchTokens` (Firestore trigger)
- `sendDemandCreatedNotifications` (Firestore trigger)
- `shareDemandViaEmail` (HTTPS)
- `sendTestNotification` / `onNotificationTestCreated`
- `onDemandPublished` (FCM topic notification)
- `excel-export` codebase (ayrı)

**Kontroller:**
- [ ] Functions environment config: `firebase functions:config:set` ile gerekli env'ler set edildi mi?
- [ ] Memory & timeout ayarları (api: 512MiB / 60s) trafik beklentisine uygun mu?
- [ ] Cold start kabul edilebilir mi? (`minInstances: 0` → ilk istekte ~3-5s gecikme)

---

## 7) CI/CD Pipeline (`.github/workflows/ci.yml`)

- [ ] PR build pipeline çalışıyor (`npm run build`, `npm run build:api`, `npm run lint`)
- [ ] `npm run smoke` adımı CI'a eklenmesi önerilir (opsiyonel)
- [ ] Deploy job ya manuel onay ile ya da main branch push tetikli olmalı
- [ ] `FIREBASE_TOKEN` GitHub Secrets'ta tanımlı

---

## 8) Monitoring & Observability

- [ ] **Sentry**: `SENTRY_DSN` set, dev/prod ortamları ayrı
- [ ] **Firebase Console**: Crashlytics, Performance Monitoring aktif
- [ ] **Cloud Logging**: Cloud Functions loglarını görmek için Cloud Console'da gözden geçirin
- [ ] **Uptime check**: `https://<host>/health` için bir uptime monitoring (StatusCake, UptimeRobot, GCP Uptime) kurun
- [ ] **Alerting**: error rate > %5, p95 latency > 2s gibi alarmlar

---

## 9) Rate Limiting & Bot Protection

- [x] Express rate limiter aktif (`express-rate-limit`)
- [x] IPv6 bypass'i `ipKeyGenerator` ile çözüldü
- [x] AI endpoint'leri ek rate limit ile korunuyor (kullanıcı başına dakikada 10)
- [ ] Production'da `RECAPTCHA_DISABLED=0` (zorunlu)
- [ ] reCAPTCHA Enterprise key Firebase AppCheck'e bağlandı
- [ ] Cloudflare / GCP Armor önünde değilse bir CDN/WAF düşünün

---

## 10) Smoke / Sanity Tests

```powershell
# 1) Lokal smoke
npm run smoke

# 2) Production smoke (deploy sonrası)
$env:SMOKE_HOST="<production-host>"
$env:SMOKE_PORT="443"
# Veya direkt curl:
curl https://<your-domain>/health
curl https://<your-domain>/api/health
```

**Kabul kriterleri:**
- HTTP 200 dönüyor
- Response içinde `status: "ok"` ya da `status: "degraded"` (DB henüz hazır değilse degraded normal)
- Response time < 2 saniye

---

## 11) Domain & SSL

- [ ] Custom domain Firebase Hosting'e bağlandı
- [ ] DNS A/AAAA kayıtları doğru
- [ ] SSL sertifikası aktif (Firebase otomatik yönetir)
- [ ] HSTS header (Helmet zaten ekliyor)
- [ ] CSP header production'da test edildi

---

## 12) Veritabanı / Firestore Hazırlık

- [ ] Production Firestore projesi oluşturuldu
- [ ] `firestore.indexes.json` deploy edildi
- [ ] İlk admin kullanıcısı için custom claim `superAdmin: true` set edildi:
  ```ts
  await admin.auth().setCustomUserClaims(uid, { superAdmin: true });
  ```
- [ ] Test data temizlendi (varsa)
- [ ] Backup politikası ayarlandı (Cloud Firestore export günlük)

---

## 13) Kullanıcı / Rol Yönetimi

- [ ] Default rol şablonları seed edildi (`scripts/migrate-set-default-plan.js` vb.)
- [ ] Free / Premium / Premium+ plan limitleri doğru
- [ ] AI token paketleri Firestore'da tanımlı
- [ ] Approval policy default değerleri OK

---

## 14) Roll-back Planı

Sorun çıkarsa:

1. **Hosting roll-back:**
   ```powershell
   firebase hosting:channel:deploy <previous-version>
   # Veya Firebase Console → Hosting → Release history → Rollback
   ```
2. **Functions roll-back:**
   ```powershell
   firebase functions:delete api  # geçici (çok agresif)
   # Daha güvenli: önceki commit'i checkout edip yeniden deploy
   ```
3. **Rules roll-back:** Firebase Console → Firestore → Rules → History → Restore
4. **DB roll-back:** Firestore export'tan restore (`gcloud firestore import gs://...`)

---

## 15) Deploy Anı (Önerilen sıra)

```powershell
# 0. Pre-flight
git status   # temiz olmalı
git pull origin main
npm ci
npm run lint
npm run preflight   # build:api + build + smoke (tek komut)
# Hızlı kontrol (smoke atlanır): npm run preflight:quick

# 1. Firebase login
firebase login
firebase use <project-id>

# 2. Rules + indexes (en zararsız)
firebase deploy --only firestore:rules,storage:rules,firestore:indexes

# 3. Functions
firebase deploy --only functions

# 4. Hosting
firebase deploy --only hosting

# 5. Production smoke
curl https://<your-domain>/health
```

---

## 16) Post-Deploy (İlk 24 Saat)

- [ ] Production smoke yeşil (`/health` 200)
- [ ] İlk 5 kullanıcı login → herhangi bir hata var mı?
- [ ] Sentry'de crash report var mı?
- [ ] Cloud Functions error rate < %1
- [ ] Firestore quota / cost dashboard kontrol
- [ ] Email bildirimi (RESEND) ulaşıyor mu?

---

## ✅ Şu an hazır olan kısım

- Build / type / lint sağlığı
- Smoke test scripti (`npm run smoke`)
- Deploy öncesi tek komut (`npm run preflight` / `npm run preflight:quick`)
- Env validator (`server/env-validator.ts`)
- Firebase rules (firestore + storage) audit edildi
- `firebase.json` storage rules eklendi
- Hardcoded secret'lar repo'dan temizlendi
- IPv6 rate limit bypass kapatıldı
- `.env.example` tüm env'ler için güncel

## 🟡 Deploy ekibinden bekleyen (insan kararı)

- Production env'lerin Firebase / hosting'e yüklenmesi
- Önceden expose olmuş anahtarların rotate edilmesi
- Domain / SSL / DNS bağlama
- İlk admin için `superAdmin` custom claim
- Sentry / monitoring kurulumu

---

**Deployment Tarihi:** _______________  
**Deployment Yapan:** _______________  
**Sonuç:** ☐ Başarılı  ☐ Başarısız  
**Notlar:** _______________
