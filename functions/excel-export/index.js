const functions = require("firebase-functions");
const ExcelJS = require("exceljs");

exports.exportPurchaseForm = functions
  .https
  .onRequest(async (req, res) => {
    // CORS
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method === "GET") return res.status(200).send("exportPurchaseForm OK v3.0 - TWO SHEETS (Talep + Teklif) (use POST for Excel).");
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    try {
      console.log("==========================================");
      console.log("📥 Excel export request received - v3.0");
      console.log("==========================================");
      const {
        talep_kodu,
        santiye,
        items,
        // Tüm talep bilgileri
        talep_tarihi,
        termin,
        talep_eden,
        teslimat_adresi,
        teslim_sekli,
        teslim_yeri,
        alim_yeri,
        para_birimi,
        odeme_sartlari,
        onaylayan,
        satinalma_sorumlusu,
        genel_mudur,
        aciklama,
        kategoriler
      } = req.body || {};

      console.log("📊 Request data:", {
        talep_kodu,
        items_count: Array.isArray(items) ? items.length : 0,
        has_talep_tarihi: !!talep_tarihi,
        has_talep_eden: !!talep_eden
      });

      const wb = new ExcelJS.Workbook();

      // ============================================
      // SAYFA 1: TALEP (Salt Okunur - Talep Bilgileri)
      // ============================================
      const shTalep = wb.addWorksheet("Talep");
      console.log("✅ Talep worksheet created");

      // Stil tanımlamaları
      const headerStyle = {
        font: { bold: true, size: 12, color: { argb: "FFFFFFFF" } },
        fill: {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF2563EB" }
        },
        alignment: { vertical: "middle", horizontal: "center" },
        border: {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } }
        }
      };

      const labelStyle = {
        font: { bold: true, size: 11 },
        fill: {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF3F4F6" }
        },
        alignment: { vertical: "middle", horizontal: "right" },
        border: {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } }
        }
      };

      const valueStyle = {
        font: { size: 11 },
        alignment: { vertical: "middle", horizontal: "left" },
        border: {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } }
        }
      };

      const tableHeaderStyle = {
        font: { bold: true, size: 11, color: { argb: "FFFFFFFF" } },
        fill: {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1E40AF" }
        },
        alignment: { vertical: "middle", horizontal: "center", wrapText: true },
        border: {
          top: { style: "medium", color: { argb: "FF000000" } },
          left: { style: "medium", color: { argb: "FF000000" } },
          bottom: { style: "medium", color: { argb: "FF000000" } },
          right: { style: "medium", color: { argb: "FF000000" } }
        }
      };

      const tableCellStyle = {
        font: { size: 11 },
        alignment: { vertical: "middle", horizontal: "center" },
        border: {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } }
        }
      };

      const readOnlyCellStyle = {
        font: { size: 11, italic: true },
        fill: {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF9FAFB" }
        },
        alignment: { vertical: "middle", horizontal: "center" },
        border: {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } }
        }
      };

      // TALEP SAYFASI - Başlık
      const titleRow = shTalep.addRow(["TALEP FORMU"]);
      titleRow.height = 30;
      shTalep.mergeCells(`A1:I1`);
      const titleCell = shTalep.getCell(1, 1);
      titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
      titleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2563EB" }
      };
      titleCell.alignment = { vertical: "middle", horizontal: "center" };
      titleCell.border = {
        top: { style: "medium", color: { argb: "FF000000" } },
        left: { style: "medium", color: { argb: "FF000000" } },
        bottom: { style: "medium", color: { argb: "FF000000" } },
        right: { style: "medium", color: { argb: "FF000000" } }
      };

      // Boş satır
      shTalep.addRow([]);

      // Talep Bilgileri Bölümü
      let rowNumTalep = 3;
      shTalep.addRow(["TALEP BİLGİLERİ"]);
      shTalep.mergeCells(`A${rowNumTalep}:I${rowNumTalep}`);
      const sectionHeader = shTalep.getRow(rowNumTalep);
      sectionHeader.height = 25;
      const sectionCell = shTalep.getCell(rowNumTalep, 1);
      sectionCell.font = headerStyle.font;
      sectionCell.fill = headerStyle.fill;
      sectionCell.alignment = headerStyle.alignment;
      sectionCell.border = headerStyle.border;
      rowNumTalep++;

      // Talep bilgileri (Label-Value çiftleri) - STF No kaldırıldı
      const demandInfo = [
        { label: "Talep Kodu:", value: talep_kodu || "" },
        { label: "Şantiye:", value: santiye || "" },
        { label: "Talep Tarihi:", value: talep_tarihi || "" },
        { label: "Termin:", value: termin || "" },
        { label: "Talep Eden:", value: talep_eden || "" },
        { label: "Teslimat Adresi:", value: teslimat_adresi || "" },
        { label: "Teslim Şekli:", value: teslim_sekli || "" },
        { label: "Teslim Yeri:", value: teslim_yeri || "" },
        { label: "Alım Yeri (İl):", value: alim_yeri || "" },
        { label: "Para Birimi:", value: para_birimi || "TRY" },
        { label: "Ödeme Şartları:", value: odeme_sartlari || "" },
        { label: "Onaylayan:", value: onaylayan || "" },
        { label: "Satınalma Sorumlusu:", value: satinalma_sorumlusu || "" },
        { label: "Genel Müdür:", value: genel_mudur || "" }
      ];

      demandInfo.forEach(info => {
        const row = shTalep.addRow([]);
        const labelCell = shTalep.getCell(rowNumTalep, 1);
        labelCell.value = info.label;
        labelCell.font = labelStyle.font;
        labelCell.fill = labelStyle.fill;
        labelCell.alignment = labelStyle.alignment;
        labelCell.border = labelStyle.border;
        shTalep.mergeCells(`A${rowNumTalep}:C${rowNumTalep}`);
        
        const valueCell = shTalep.getCell(rowNumTalep, 4);
        valueCell.value = info.value;
        valueCell.font = valueStyle.font;
        valueCell.alignment = valueStyle.alignment;
        valueCell.border = valueStyle.border;
        shTalep.mergeCells(`D${rowNumTalep}:I${rowNumTalep}`);
        rowNumTalep++;
      });

      // Kategoriler
      if (kategoriler && Array.isArray(kategoriler) && kategoriler.length > 0) {
        const row = shTalep.addRow([]);
        const labelCell = shTalep.getCell(rowNumTalep, 1);
        labelCell.value = "Kategoriler:";
        labelCell.font = labelStyle.font;
        labelCell.fill = labelStyle.fill;
        labelCell.alignment = labelStyle.alignment;
        labelCell.border = labelStyle.border;
        shTalep.mergeCells(`A${rowNumTalep}:C${rowNumTalep}`);
        
        const valueCell = shTalep.getCell(rowNumTalep, 4);
        valueCell.value = kategoriler.join(", ");
        valueCell.font = valueStyle.font;
        valueCell.alignment = valueStyle.alignment;
        valueCell.border = valueStyle.border;
        shTalep.mergeCells(`D${rowNumTalep}:I${rowNumTalep}`);
        rowNumTalep++;
      }

      // Açıklama
      if (aciklama) {
        const row = shTalep.addRow([]);
        const labelCell = shTalep.getCell(rowNumTalep, 1);
        labelCell.value = "Açıklama:";
        labelCell.font = labelStyle.font;
        labelCell.fill = labelStyle.fill;
        labelCell.alignment = labelStyle.alignment;
        labelCell.border = labelStyle.border;
        shTalep.mergeCells(`A${rowNumTalep}:C${rowNumTalep}`);
        
        const valueCell = shTalep.getCell(rowNumTalep, 4);
        valueCell.value = aciklama;
        valueCell.font = valueStyle.font;
        valueCell.alignment = { ...valueStyle.alignment, wrapText: true };
        valueCell.border = valueStyle.border;
        shTalep.mergeCells(`D${rowNumTalep}:I${rowNumTalep}`);
        rowNumTalep++;
      }

      // Boş satır
      shTalep.addRow([]);
      rowNumTalep++;

      // Ürün Tablosu Başlığı
      const tableTitleRow = shTalep.addRow(["TALEP EDİLEN ÜRÜNLER"]);
      tableTitleRow.height = 25;
      shTalep.mergeCells(`A${rowNumTalep}:H${rowNumTalep}`);
      const tableTitleCell = shTalep.getCell(rowNumTalep, 1);
      tableTitleCell.font = headerStyle.font;
      tableTitleCell.fill = headerStyle.fill;
      tableTitleCell.alignment = headerStyle.alignment;
      tableTitleCell.border = headerStyle.border;
      rowNumTalep++;

      // Tablo başlıkları (sadece talep bilgileri)
      const demandHeaders = [
        "Sıra No",
        "Malzeme Kodu",
        "Ürün Tanımı",
        "Marka/Model",
        "Talep Edilen Miktar",
        "Birim",
        "İstenilen Teslim Tarihi"
      ];
      const headerRow = shTalep.addRow(demandHeaders);
      headerRow.height = 25;

      demandHeaders.forEach((header, colIndex) => {
        const cell = shTalep.getCell(rowNumTalep, colIndex + 1);
        cell.font = tableHeaderStyle.font;
        cell.fill = tableHeaderStyle.fill;
        cell.alignment = tableHeaderStyle.alignment;
        cell.border = tableHeaderStyle.border;
      });
      rowNumTalep++;

      // Ürün satırları (sadece talep bilgileri)
      const itemsArray = Array.isArray(items) ? items : [];
      itemsArray.forEach((item, index) => {
        const row = shTalep.addRow([
          index + 1,
          item.sku || item.materialCode || "",
          item.name || item.description || "",
          item.brand || item.brandModel || "",
          item.qty || item.quantity || 0,
          item.unit || "",
          item.req_date || item.itemDueDate || item.deliveryDate || ""
        ]);

        row.height = 20;
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.font = readOnlyCellStyle.font;
          cell.fill = readOnlyCellStyle.fill;
          cell.alignment = readOnlyCellStyle.alignment;
          cell.border = readOnlyCellStyle.border;
        });
        rowNumTalep++;
      });

      // Sütun genişlikleri
      shTalep.columns = [
        { width: 10 }, // Sıra No
        { width: 15 }, // Malzeme Kodu
        { width: 40 }, // Ürün Tanımı
        { width: 20 }, // Marka/Model
        { width: 18 }, // Talep Edilen Miktar
        { width: 10 }, // Birim
        { width: 20 }  // İstenilen Teslim Tarihi
      ];

      // ============================================
      // SAYFA 2: TEKLİF (Tedarikçinin Dolduracağı)
      // ============================================
      const shTeklif = wb.addWorksheet("Teklif");
      console.log("✅ Teklif worksheet created");

      // TEKLİF SAYFASI - Başlık
      const titleRowTeklif = shTeklif.addRow(["TEKLİF FORMU"]);
      titleRowTeklif.height = 30;
      shTeklif.mergeCells(`A1:P1`);
      const titleCellTeklif = shTeklif.getCell(1, 1);
      titleCellTeklif.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
      titleCellTeklif.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF059669" }
      };
      titleCellTeklif.alignment = { vertical: "middle", horizontal: "center" };
      titleCellTeklif.border = {
        top: { style: "medium", color: { argb: "FF000000" } },
        left: { style: "medium", color: { argb: "FF000000" } },
        bottom: { style: "medium", color: { argb: "FF000000" } },
        right: { style: "medium", color: { argb: "FF000000" } }
      };

      // Boş satır
      shTeklif.addRow([]);

      // Talep Özeti
      let rowNumTeklif = 3;
      shTeklif.addRow(["TEKLİF BİLGİLERİ"]);
      shTeklif.mergeCells(`A${rowNumTeklif}:P${rowNumTeklif}`);
      const sectionHeaderTeklif = shTeklif.getRow(rowNumTeklif);
      sectionHeaderTeklif.height = 25;
      const sectionCellTeklif = shTeklif.getCell(rowNumTeklif, 1);
      sectionCellTeklif.font = { ...headerStyle.font, size: 12 };
      sectionCellTeklif.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF059669" }
      };
      sectionCellTeklif.alignment = headerStyle.alignment;
      sectionCellTeklif.border = headerStyle.border;
      rowNumTeklif++;

      // Talep özeti (küçük)
      const summaryInfo = [
        { label: "Talep Kodu:", value: talep_kodu || "" },
        { label: "Şantiye:", value: santiye || "" },
        { label: "Para Birimi:", value: para_birimi || "TRY" },
        { label: "Teslim Yeri:", value: teslim_yeri || "" }
      ];

      summaryInfo.forEach((info, idx) => {
        if (idx % 2 === 0) {
          const row = shTeklif.addRow([]);
          const labelCell = shTeklif.getCell(rowNumTeklif, 1);
          labelCell.value = info.label;
          labelCell.font = labelStyle.font;
          labelCell.fill = labelStyle.fill;
          labelCell.alignment = labelStyle.alignment;
          labelCell.border = labelStyle.border;
          shTeklif.mergeCells(`A${rowNumTeklif}:C${rowNumTeklif}`);
          
          const valueCell = shTeklif.getCell(rowNumTeklif, 4);
          valueCell.value = info.value;
          valueCell.font = valueStyle.font;
          valueCell.alignment = valueStyle.alignment;
          valueCell.border = valueStyle.border;
          shTeklif.mergeCells(`D${rowNumTeklif}:F${rowNumTeklif}`);
          
          // İkinci bilgi aynı satırda
          const info2 = summaryInfo[idx + 1];
          if (info2) {
            const labelCell2 = shTeklif.getCell(rowNumTeklif, 7);
            labelCell2.value = info2.label;
            labelCell2.font = labelStyle.font;
            labelCell2.fill = labelStyle.fill;
            labelCell2.alignment = labelStyle.alignment;
            labelCell2.border = labelStyle.border;
            shTeklif.mergeCells(`G${rowNumTeklif}:I${rowNumTeklif}`);
            
            const valueCell2 = shTeklif.getCell(rowNumTeklif, 10);
            valueCell2.value = info2.value;
            valueCell2.font = valueStyle.font;
            valueCell2.alignment = valueStyle.alignment;
            valueCell2.border = valueStyle.border;
            shTeklif.mergeCells(`J${rowNumTeklif}:L${rowNumTeklif}`);
          }
          rowNumTeklif++;
        }
      });

      // Boş satır
      shTeklif.addRow([]);
      rowNumTeklif++;

      // Ürün Tablosu Başlığı
      const teklifTableTitleRow = shTeklif.addRow(["TEKLİF ÜRÜN LİSTESİ"]);
      teklifTableTitleRow.height = 25;
      shTeklif.mergeCells(`A${rowNumTeklif}:P${rowNumTeklif}`);
      const teklifTableTitleCell = shTeklif.getCell(rowNumTeklif, 1);
      teklifTableTitleCell.font = headerStyle.font;
      teklifTableTitleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF059669" }
      };
      teklifTableTitleCell.alignment = headerStyle.alignment;
      teklifTableTitleCell.border = headerStyle.border;
      rowNumTeklif++;

      // Tablo başlıkları - Talep bilgileri (okunur) + Teklif bilgileri (düzenlenebilir)
      const teklifHeaders = [
        "Sıra", // A
        "Talep Malzeme Kodu", // B (okunur)
        "Talep Edilen Ürün", // C (okunur)
        "Talep Miktar", // D (okunur)
        "Talep Birim", // E (okunur)
        "İstenen Teslim Tarihi", // F (okunur)
        "TEKLİF ÜRÜN ADI/TANIM", // G (düzenlenebilir)
        "TEKLİF MİKTAR", // H (düzenlenebilir)
        "TEKLİF BİRİM", // I (düzenlenebilir)
        "BİRİM FİYAT", // J (düzenlenebilir)
        "KDV (%)", // K (düzenlenebilir)
        "Marka/Model", // L (düzenlenebilir)
        "Teslim Süresi (Gün)", // M (düzenlenebilir)
        "Minimum Sipariş", // N (düzenlenebilir)
        "Kısmi Teslimat (E/H)", // O (düzenlenebilir)
        "Menşei", // P (düzenlenebilir)
        "Notlar", // Q (düzenlenebilir)
        "KDV Hariç Toplam", // R (formül)
        "KDV Dahil Toplam"  // S (formül)
      ];
      
      const teklifHeaderRow = shTeklif.addRow(teklifHeaders);
      teklifHeaderRow.height = 25;

      teklifHeaders.forEach((header, colIndex) => {
        const cell = shTeklif.getCell(rowNumTeklif, colIndex + 1);
        if (colIndex < 6) {
          // Talep bilgileri (okunur) - mavi header
          cell.font = tableHeaderStyle.font;
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF1E40AF" }
          };
        } else {
          // Teklif bilgileri (düzenlenebilir) - yeşil header
          cell.font = tableHeaderStyle.font;
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF059669" }
          };
        }
        cell.alignment = tableHeaderStyle.alignment;
        cell.border = tableHeaderStyle.border;
      });
      rowNumTeklif++;

      // Ürün satırları
      const firstDataRow = rowNumTeklif;
      itemsArray.forEach((item, index) => {
        const row = shTeklif.addRow([
          index + 1, // Sıra
          item.sku || item.materialCode || "", // Talep Malzeme Kodu (okunur)
          item.name || item.description || "", // Talep Edilen Ürün (okunur)
          item.qty || item.quantity || 0, // Talep Miktar (okunur)
          item.unit || "", // Talep Birim (okunur)
          item.req_date || item.itemDueDate || item.deliveryDate || "", // İstenen Teslim Tarihi (okunur)
          "", // TEKLİF ÜRÜN ADI/TANIM (düzenlenebilir)
          "", // TEKLİF MİKTAR (düzenlenebilir)
          item.unit || "", // TEKLİF BİRİM (varsayılan talep birimi)
          "", // BİRİM FİYAT (düzenlenebilir)
          "", // KDV (%) (düzenlenebilir)
          "", // Marka/Model (düzenlenebilir)
          "", // Teslim Süresi (Gün) (düzenlenebilir)
          "", // Minimum Sipariş (düzenlenebilir)
          "", // Kısmi Teslimat (E/H) (düzenlenebilir)
          "", // Menşei (düzenlenebilir)
          "", // Notlar (düzenlenebilir)
          "", // KDV Hariç Toplam (formül)
          ""  // KDV Dahil Toplam (formül)
        ]);

        row.height = 20;

        // Hücre stilleri
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          if (colNumber <= 6) {
            // Talep bilgileri (salt okunur - gri)
            cell.font = readOnlyCellStyle.font;
            cell.fill = readOnlyCellStyle.fill;
            cell.alignment = readOnlyCellStyle.alignment;
            cell.border = readOnlyCellStyle.border;
          } else {
            // Teklif bilgileri (düzenlenebilir - beyaz)
            cell.font = tableCellStyle.font;
            cell.alignment = tableCellStyle.alignment;
            cell.border = tableCellStyle.border;
          }
        });

        // Formüller
        // KDV Hariç Toplam = TEKLİF MİKTAR (H) * BİRİM FİYAT (J)
        const exclVatFormula = `=H${rowNumTeklif}*J${rowNumTeklif}`;
        shTeklif.getCell(rowNumTeklif, 18).value = { formula: exclVatFormula };
        shTeklif.getCell(rowNumTeklif, 18).numFmt = "#,##0.00";

        // KDV Dahil Toplam = KDV Hariç Toplam * (1 + KDV/100)
        const inclVatFormula = `=R${rowNumTeklif}*(1+K${rowNumTeklif}/100)`;
        shTeklif.getCell(rowNumTeklif, 19).value = { formula: inclVatFormula };
        shTeklif.getCell(rowNumTeklif, 19).numFmt = "#,##0.00";

        rowNumTeklif++;
      });

      // Boş satır
      shTeklif.addRow([]);
      rowNumTeklif++;

      // Toplam satırı
      const totalRowTeklif = shTeklif.addRow([
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "TOPLAM:",
        `=SUM(R${firstDataRow}:R${rowNumTeklif - 1})`, // KDV Hariç Toplam
        `=SUM(S${firstDataRow}:S${rowNumTeklif - 1})`  // KDV Dahil Toplam
      ]);
      totalRowTeklif.height = 25;

      // Toplam satırı stil
      ["Q", "R", "S"].forEach((col, idx) => {
        const cell = shTeklif.getCell(rowNumTeklif, 17 + idx);
        cell.font = {
          bold: true,
          size: 11,
          color: { argb: "FFFFFFFF" }
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF059669" }
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "medium", color: { argb: "FF000000" } },
          left: { style: "medium", color: { argb: "FF000000" } },
          bottom: { style: "medium", color: { argb: "FF000000" } },
          right: { style: "medium", color: { argb: "FF000000" } }
        };
        if (idx > 0) {
          cell.numFmt = "#,##0.00";
        }
      });

      // Not satırı
      rowNumTeklif++;
      shTeklif.addRow([]);
      rowNumTeklif++;
      
      const noteRowTeklif = shTeklif.addRow(["NOT: 'TEKLİF' sütunlarını doldurunuz. Talep bilgileri referans amaçlıdır. Teklif ürün adı, miktar, birim fiyat ve KDV bilgilerini girdikten sonra toplamlar otomatik hesaplanacaktır."]);
      shTeklif.mergeCells(`A${rowNumTeklif}:S${rowNumTeklif}`);
      const noteCellTeklif = shTeklif.getCell(rowNumTeklif, 1);
      noteCellTeklif.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
      noteCellTeklif.alignment = { horizontal: "left" };

      // Sütun genişlikleri
      shTeklif.columns = [
        { width: 8 },  // Sıra
        { width: 15 }, // Talep Malzeme Kodu
        { width: 30 }, // Talep Edilen Ürün
        { width: 12 }, // Talep Miktar
        { width: 10 }, // Talep Birim
        { width: 18 }, // İstenen Teslim Tarihi
        { width: 35 }, // TEKLİF ÜRÜN ADI/TANIM
        { width: 12 }, // TEKLİF MİKTAR
        { width: 10 }, // TEKLİF BİRİM
        { width: 15 }, // BİRİM FİYAT
        { width: 10 }, // KDV (%)
        { width: 20 }, // Marka/Model
        { width: 15 }, // Teslim Süresi (Gün)
        { width: 15 }, // Minimum Sipariş
        { width: 15 }, // Kısmi Teslimat
        { width: 12 }, // Menşei
        { width: 30 }, // Notlar
        { width: 18 }, // KDV Hariç Toplam
        { width: 18 }  // KDV Dahil Toplam
      ];

      console.log("💾 Generating Excel buffer...");
      const buffer = await wb.xlsx.writeBuffer();
      console.log("✅ Excel buffer generated, size:", buffer.length, "bytes");
      console.log("📋 Talep worksheet row count:", shTalep.rowCount);
      console.log("📋 Teklif worksheet row count:", shTeklif.rowCount);
      res.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.set("Content-Disposition", `attachment; filename=${(talep_kodu || "talep")}.xlsx`);
      return res.status(200).send(Buffer.from(buffer));
    } catch (err) {
      console.error("❌ Excel oluşturma hatası:", err);
      console.error("❌ Error stack:", err.stack);
      return res.status(500).send("Excel oluşturulamadı: " + err.message);
  }
});
