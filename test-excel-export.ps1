$body = @{
    talep_kodu = "TEST-EXCEL"
    stf_no = "STF-123"
    santiye = "Test Şantiye"
    talep_tarihi = "31.10.2025"
    termin = "01.11.2025"
    talep_eden = "Test Firma"
    teslimat_adresi = "Test Adres"
    teslim_sekli = "Kargo"
    teslim_yeri = "Şantiye"
    alim_yeri = "İstanbul"
    para_birimi = "TRY"
    odeme_sartlari = "Peşin"
    onaylayan = "Test Onay"
    satinalma_sorumlusu = "Test Sorumlu"
    genel_mudur = "Test Müdür"
    aciklama = "Test açıklama"
    kategoriler = @("test", "deneme")
    items = @(
        @{
            sku = "SKU-001"
            name = "Test Ürün 1"
            brand = "Test Marka"
            qty = 10
            unit = "adet"
            req_date = "01.11.2025"
        }
    )
} | ConvertTo-Json -Depth 3

Invoke-WebRequest -Uri "https://exportpurchaseform-vsh2lbzuja-uc.a.run.app" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body `
  -OutFile "test-excel-new.xlsx"

Write-Host "✅ Excel dosyası indirildi: test-excel-new.xlsx"
Write-Host "Lütfen dosyayı açıp kontrol edin."
