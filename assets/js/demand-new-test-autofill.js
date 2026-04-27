// Teklifbul Rule v1.0
// demand-new.html - Test: Formu Otomatik Doldur wiring
// NOTE: Bu dosya sadece geliştirme/test kolaylığı içindir.

import { logger } from "/src/shared/log/logger.js";
import { toast } from "/src/shared/ui/toast.js";
import { MESSAGES } from "/src/shared/constants/messages.js";

function isoDateOnly(date = new Date()) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getEl(id) {
  return document.getElementById(id);
}

function ensureItemsRow(itemsBody, lineNo) {
  // NOTE: Legacy helper kept for compatibility, but demand-new.html now owns row creation.
  // Prefer clicking #addLineBtn so all hidden fields + bindings exist.
  const tr = document.createElement("tr");
  tr.dataset.lineNo = String(lineNo);
  tr.innerHTML = `
    <td>${lineNo}</td>
    <td><input type="text" class="sku" placeholder="Stok Kodu" /></td>
    <td><textarea class="itemName auto-resize" placeholder="Malzeme tanımı" required rows="2"></textarea></td>
    <td><input type="text" class="brandModel" placeholder="Marka/Model" /></td>
    <td><input type="number" class="qty" min="1" step="0.01" placeholder="Miktar" required /></td>
    <td><input type="text" class="unit" list="unitList" placeholder="Birim" required /></td>
    <td><input type="number" class="stockQty" min="0" step="0.01" placeholder="Depo" /></td>
    <td><input type="number" class="targetPrice" min="0" step="0.01" placeholder="Hedef" /></td>
    <td>
      <input type="file" class="itemImage" accept="image/*" style="max-width:150px;">
      <input type="hidden" class="itemImageData" value="">
      <div class="itemImagePreview" style="font-size:11px;">Seçilmedi</div>
    </td>
    <td><input type="date" class="itemDueDate" /></td>
    <td style="text-align:center;">
      <input type="checkbox" class="publishToMarket" />
    </td>
    <td><button type="button" class="delBtn btn-sm" title="Sil">×</button></td>
  `;

  const delBtn = tr.querySelector(".delBtn");
  delBtn?.addEventListener("click", () => {
    try {
      tr.remove();
      toast.success(MESSAGES.SUCCESS_DELETE || "İşlem tamamlandı");
    } catch (err) {
      logger.error("Test row delete failed", err);
      toast.error(`${MESSAGES.ERROR_DELETE || "Hata"}: ${err?.message || err}`);
    }
  });

  itemsBody.appendChild(tr);
  return tr;
}

function setValueIfExists(id, value) {
  const el = getEl(id);
  if (!el) return false;
  el.value = value ?? "";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

async function fillTestData() {
  logger.group("Demand New - Test AutoFill");
  try {
    toast.info(MESSAGES.INFO_PROCESSING || MESSAGES.INFO_WAIT);

    // Header fields
    setValueIfExists("demandDate", isoDateOnly());
    setValueIfExists("dueDate", isoDateOnly(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));

    // Title: generate (no hard-coded business text, deterministic)
    const title = `TEST-${Date.now()}`;
    setValueIfExists("title", title);

    // Requester: use current user display name if present, fallback to uid-based token
    const requesterFallback = `user-${String(Date.now()).slice(-6)}`;
    setValueIfExists("requester", requesterFallback);

    // Site name: pick first saved site if available (populated by other scripts)
    const savedSites = Array.isArray(window.__initialSavedSites) ? window.__initialSavedSites : [];
    const siteName =
      savedSites[0]?.name ||
      savedSites[0]?.siteName ||
      savedSites[0]?.title ||
      "";
    if (siteName) setValueIfExists("siteName", siteName);

    // Purchase location: if other scripts derive it, this can be empty; still try a safe fill.
    if (!getEl("purchaseLocation")?.value) {
      const cityGuess = savedSites[0]?.province || savedSites[0]?.city || savedSites[0]?.il || "";
      if (cityGuess) setValueIfExists("purchaseLocation", cityGuess);
    }

    // Talep Tipi (biddingMode)
    const biddingModeRadio = document.querySelector('input[name="biddingMode"][value="secret"]');
    if (biddingModeRadio) {
      biddingModeRadio.checked = true;
      biddingModeRadio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const isTimeBound = getEl("isTimeBound");
    if (isTimeBound) {
      isTimeBound.checked = false;
      isTimeBound.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Teslim Şekli + İndirme Şekli (basic defaults)
    const deliveryMethodRadio = document.querySelector('input[name="deliveryMethod"][value="nakliye_dahil"]');
    if (deliveryMethodRadio) {
      deliveryMethodRadio.checked = true;
      deliveryMethodRadio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    // Teklifbul Rule v1.0 - Avoid hard-coded copy in test; leave custom empty unless user picks.
    setValueIfExists("deliveryMethodCustom", "");

    const unloadingMethodRadio = document.querySelector('input[name="unloadingMethod"][value="personel_var"]');
    if (unloadingMethodRadio) {
      unloadingMethodRadio.checked = true;
      unloadingMethodRadio.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Ödeme seçenekleri (özet alanı)
    const paymentTermsEl = getEl("paymentTerms");
    // Teklifbul Rule v1.0 - Test fill should not force business copy; keep as-is if empty.
    if (paymentTermsEl && typeof paymentTermsEl.value === "string" && !paymentTermsEl.value) {
      paymentTermsEl.value = "";
    }

    // Items
    const itemsBody = getEl("itemsBody");
    if (!itemsBody) {
      toast.error(`${MESSAGES.ERROR_NOT_FOUND}: itemsBody`);
      return;
    }

    // Reset existing rows
    itemsBody.innerHTML = "";

    // IMPORTANT: Use the page's own "+ Satır Ekle" button so the row contains:
    // - itemCategoryIdsJson hidden field
    // - 🏷️ button bindings
    // - detail row (adv row) structure
    const addLineBtn = getEl("addLineBtn");
    if (!addLineBtn) {
      toast.error(`${MESSAGES.ERROR_NOT_FOUND}: addLineBtn`);
      return;
    }

    const today = isoDateOnly();
    const token = String(Date.now()).slice(-6);
    const rows = [
      { sku: `SKU-${token}-1`, name: `ITEM-${token}-1`, brandModel: `BM-${token}`, qty: "10", unit: "Adet", stockQty: "0", targetPrice: "0", itemDueDate: today },
      { sku: `SKU-${token}-2`, name: `ITEM-${token}-2`, brandModel: `BM-${token}`, qty: "5", unit: "Adet", stockQty: "0", targetPrice: "0", itemDueDate: today },
      { sku: `SKU-${token}-3`, name: `ITEM-${token}-3`, brandModel: `BM-${token}`, qty: "1", unit: "Adet", stockQty: "0", targetPrice: "0", itemDueDate: today }
    ];

    // Create needed rows via UI action
    rows.forEach(() => addLineBtn.click());

    // Fill only "main" rows (detail rows are also <tr> but do not contain .itemName)
    const allTr = Array.from(itemsBody.querySelectorAll("tr"));
    const mainRows = allTr.filter((tr) => tr.querySelector(".itemName") && tr.querySelector(".qty") && tr.querySelector(".unit"));

    rows.forEach((r, idx) => {
      const tr = mainRows[idx];
      if (!tr) return;
      const set = (sel, val) => {
        const el = tr.querySelector(sel);
        if (!el) return;
        el.value = val;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      set(".sku", r.sku);
      set(".itemName", r.name);
      set(".brandModel", r.brandModel);
      set(".qty", r.qty);
      set(".unit", r.unit);
      set(".stockQty", r.stockQty);
      set(".targetPrice", r.targetPrice);
      set(".itemDueDate", r.itemDueDate);
    });

    toast.success("İşlem tamamlandı");
    logger.info("Test form filled", { rows: rows.length, title });
  } catch (err) {
    logger.error("Test autofill failed", err);
    toast.error(`Hata: ${err?.message || err}`);
  } finally {
    logger.end();
  }
}

function initTestAutofill() {
  const btn = getEl("btnTestAutoFill");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    await fillTestData();
  });
  logger.info("Test otomatik doldurma butonu hazır");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTestAutofill);
} else {
  initTestAutofill();
}


