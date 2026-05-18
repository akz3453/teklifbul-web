# AI Model Update Checklist

Teklifbul uzerinde OpenAI / Gemini model listelerini guncellerken bu adimlari izleyin.

## 1) Hazirlik

- [ ] Yeni modelin resmi provider dokumantasyonunda **aktif** oldugunu dogrula.
- [ ] Teknik model ID'sini kopyala (ornek: `gpt-4o-mini`, `gemini-3-pro-preview`).
- [ ] Bu modelin hangi planlarda gorunecegine karar ver (Free / Premium / Premium Plus).

## 2) Kataloga Ekleme (Asil kaynak)

- [ ] `Ayarlar > Admin AI Katalog Yonetimi` ekranina gir.
- [ ] Yeni model kaydi ekle:
  - Provider (`openai` / `gemini`)
  - Model (teknik ID)
  - Label (kullaniciya gorunen ad)
  - `isActive = true`
  - Plan uygunluklari (freeEligible vb.) dogru secili
- [ ] Siralama degerini (sort) model listesi UX'e uygun ayarla.

## 3) Eski Modelleri Yonetme

- [ ] Eski modeli hemen silme.
- [ ] Once `isActive = false` yap (geri donus/rollback icin).
- [ ] 1-2 hafta sorun cikmazsa arsivleme/silme karari ver.

## 4) Hizli Test Plani

- [ ] Kisa prompt testi (normal cevap).
- [ ] Uzun prompt testi (token/limit davranisi).
- [ ] Hata testi (provider gecici hata durumunda mesajlar dogru mu?).
- [ ] Plan kisiti testi:
  - Free kullanici yalnizca izinli modelleri goruyor mu?
  - Premium/Premium Plus dogru modelleri goruyor mu?

## 5) Operasyonel Kontrol

- [ ] `Ayarlar > Plan & Kullanim` ve ilgili AI rapor ekranlarinda model adi dogru gorunuyor mu?
- [ ] Loglarda model ID beklenen deger mi?
- [ ] Gerekirse eski modele hizli donus (isActive toggle) planlandi mi?

## 6) Acil Durum (Rollback)

- [ ] Yeni modeli `isActive = false` yap.
- [ ] Son stabil modeli tekrar `isActive = true` yap.
- [ ] Kisa smoke test calistirip kullanicilara geri ac.

## Notlar

- Tek kaynak her zaman **AI Katalog** olmali.
- Kod icindeki fallback model degerleri sadece katalog yuklenemezse devreye girmeli.
- Kullaniciya gorunen isim (`label`) ile teknik model ID (`model`) karistirilmamali.
