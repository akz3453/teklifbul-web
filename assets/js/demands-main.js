// Teklifbul Rule v1.0 - XSS Protection
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';
import { db, requireAuth, logout } from "../firebase.js";
import {
  collection, getDocs, getDoc, query, where, deleteDoc, doc, orderBy, limit, startAfter,
  updateDoc, arrayUnion, serverTimestamp, writeBatch, addDoc, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../src/shared/log/logger.js';
// Teklifbul Rule v1.0 - Toast Notification System
import { toast } from '../../src/shared/ui/toast.js';
// Teklifbul Rule v1.1 - MESSAGES constants (i18n hazırlığı)
import { MESSAGES } from '../../src/shared/constants/messages.js';
// CRITICAL: Import new ID-based category system
import {
  getAllCategories,
  getNameById,
  normalizeToIds
} from "../../src/categories/category-service.js";
// Import match service for supplier matching
import { matchSuppliers } from "../../src/matching/match-service.js";

// Main async function
async function initDemandsPage() {

  // --- UI refs ---
  // Teklifbul Rule v1.0 - Legacy tablo kaldırıldı, tbody artık kullanılmıyor
  // const tbody        = document.getElementById("demands-body");
  const groupedWrap = document.getElementById("grouped-container");
  const pager = document.getElementById("pager");
  // Teklifbul Rule v1.0 - f-status filtresi kaldırıldı (kullanıcı isteği)
  const fPriority = document.getElementById("f-priority");
  const fBiddingMode = document.getElementById("f-biddingmode");
  const fGroup = document.getElementById("f-group");
  const fUser = document.getElementById("f-user");

  // Gelen talepler için filtreler
  const fIncomingStatus = document.getElementById("f-incoming-status");
  const fKeyword = document.getElementById("f-keyword");
  const fCategory = document.getElementById("f-category");
  const incomingFilters = document.getElementById("incoming-filters");
  const outgoingFilters = document.getElementById("outgoing-filters");

  // Populate Categories
  const COMPANY_CACHE = new Map(); // Teklifbul Rule v1.0 - Firma isimlerini önbelleğe al
  if (fCategory) {
    try {
      const allCats = getAllCategories();
      allCats.sort((a, b) => a.name.localeCompare(b.name, 'tr')).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        fCategory.appendChild(opt);
      });
    } catch (e) {
      logger.warn('Failed to populate categories', e);
    }
  }

  // --- Auth ---
  // Teklifbul Rule v1.0 - Middle click ile açılan sayfalarda auth state henüz yüklenmemiş olabilir
  // waitAuthReady() ile auth state'in yüklenmesini bekle, sonra requireAuth() çağır
  const { waitAuthReady } = await import('../../firebase.js');
  await waitAuthReady();

  const user = await requireAuth();
  const uid = user.uid;

  // Readonly mod kontrolü - Teklifbul Rule v1.0
  const urlParams = new URLSearchParams(window.location.search);
  const isReadOnly = urlParams.get('readonly') === 'true';

  // URL filter parametresi - Teklifbul Rule v1.0 (geniş scope için burada tanımlı)
  const filter = urlParams.get('filter');

  // Kullanıcı durumu kontrolü
  let userIsPending = false;
  let userData = {};
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      userData = userDoc.data();
      userIsPending = userData.companyJoinStatus === 'pending' || userData.companyJoinStatus === 'rejected';
    }
  } catch (e) {
    logger.warn('User status check failed', e);
  }

  // Talep havuzu tab'ı kaldırıldı (kullanıcı isteği) 


  const readonlyMode = isReadOnly || userIsPending;

  // Readonly modunda uyarı göster ve butonları gizle
  if (readonlyMode) {
    const readonlyBanner = document.createElement('div');
    readonlyBanner.style.cssText = 'background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;';
    // Teklifbul Rule v1.0 - XSS Protection
    readonlyBanner.innerHTML = DOMPurify.sanitize(`
      <div style="display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap;">
        <span style="font-size: 24px;">⏳</span>
        <div>
          <strong style="color: #92400e; font-size: 16px;">Onay Bekleniyor</strong>
          <p style="color: #92400e; font-size: 14px; margin: 4px 0 0 0;">
            Şirket yöneticileri kaydınızı onaylayana kadar sadece görüntüleme yapabilirsiniz. İşlem yapamazsınız.
          </p>
          <a href="./company-join-waiting.html" style="color: #92400e; text-decoration: underline; font-size: 13px; margin-top: 8px; display: inline-block;">
            Bekleme durumunu kontrol et →
          </a>
        </div>
      </div>
    `, {
      ALLOWED_TAGS: ['div', 'span', 'strong', 'p', 'a'],
      ALLOWED_ATTR: ['style', 'href']
    });
    const container = document.querySelector('.container--wide');
    if (container) {
      const toolbar = container.querySelector('.toolbar');
      if (toolbar) {
        container.insertBefore(readonlyBanner, toolbar);
      } else {
        container.insertBefore(readonlyBanner, container.firstChild);
      }
    }

    // Yeni Talep butonunu gizle
    const newDemandBtn = document.getElementById('newDemandBtn');
    if (newDemandBtn) {
      newDemandBtn.style.display = 'none';
    }
  }

  // Durum çevirisi fonksiyonu
  function translateStatus(status) {
    const statusMap = {
      'draft': 'Taslak',
      'approved': 'Onaylandı',
      'published': 'Yayınlandı',
      'sent': 'Gönderildi',
      'pending': 'Bekleyen',
      'viewed': 'Görüldü',
      'responded': 'Yanıtlandı',
      'rejected': 'Reddedildi',
      'cancelled': 'İptal Edildi',
      'completed': 'Tamamlandı',
      'in_progress': 'Devam Ediyor',
      'closed': 'Kapatıldı'
    };
    return statusMap[status] || status || 'Bilinmeyen';
  }

  // Unified Pagination State
  const PAGING = {
    pageSize: 10,
    sortBy: 'createdAt',
    sortDir: 'desc',
    currentPage: 1,
    pageHistory: [null], // Stores the document to startAfter for each page (index 1 is start of page 1, which is null)
    lastVisible: null,   // Last doc of current page
    activeTab: 'incoming',
    totalItems: 0,
    currentVisibleCount: 0
  };

  // Sync PAGING with UI on start
  function syncPagingUI() {
    const ps = document.getElementById('f-pageSize');
    const so = document.getElementById('f-sort');
    if (ps) ps.value = String(PAGING.pageSize);
    if (so) so.value = `${PAGING.sortBy}_${PAGING.sortDir}`;
    updatePagerUI();
  }

  function updatePagerUI() {
    const pi = document.getElementById('pageInfo');
    const ti = document.getElementById('totalItemsInfo');
    const btnNext = document.getElementById('btnNext');
    const btnPrev = document.getElementById('btnPrev');
    const pager = document.getElementById('pagination-controls');

    if (pi) pi.textContent = `Sayfa ${PAGING.currentPage}`;
    if (ti) {
      if (PAGING.activeTab === 'incoming') {
        ti.textContent = `Toplam: ${PAGING.currentVisibleCount}`;
      } else {
        ti.textContent = PAGING.totalItems > 0 ? `Toplam: ${PAGING.totalItems}` : 'Yükleniyor...';
      }
    }
    
    if (btnPrev) btnPrev.disabled = PAGING.currentPage === 1;
    // Next button disabled state will be set after fetch if less than pageSize items returned
    
    if (pager) pager.classList.remove('hidden');
  }

  let isLoading = false;
  // Teklifbul Rule v1.0 - Duplicate activeTab removed, using PAGING.activeTab
  const PAGE_SIZE = 20;
  let currentPage = 0;

  // Draft pagination state
  let lastDraftDoc = null;
  let accumulatedDrafts = [];
  let isLoadingDrafts = false;
  let draftsFinished = false;
  const DRAFT_PAGE_SIZE = 10;

  // Loading flags
  let isLoadingIncoming = false;
  let isLoadingOutgoing = false;
  let isLoadingPool = false;

  // Pool list cache (avoid re-querying when switching tabs / quick revisits)
  const POOL_CACHE_TTL_MS = 45_000; // 30–60s target
  const POOL_CACHE = {
    key: null,
    ts: 0,
    rows: null
  };

  function chunkArray(arr, chunkSize) {
    const out = [];
    for (let i = 0; i < arr.length; i += chunkSize) out.push(arr.slice(i, i + chunkSize));
    return out;
  }

  // Helper: slug normalize (tr-friendly)
  function toSlug(name) {
    if (!name) return '';
    return String(name)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[şŞ]/g, 's').replace(/[ıİ]/g, 'i').replace(/[ğĞ]/g, 'g')
      .replace(/[çÇ]/g, 'c').replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // Helper: categoryId -> display name (best-effort, for legacy matching logs/fields)
  function categoryIdToName(id) {
    try {
      if (!id) return null;
      const cats =
        (typeof getAllCategories === 'function' ? getAllCategories() :
          (Array.isArray(window.CATEGORIES) ? window.CATEGORIES : []));
      const hit = cats.find(c => c?.id === id) || cats.find(c => toSlug(c?.name) === id) || cats.find(c => c?.name === id);
      return hit?.name || null;
    } catch {
      return null;
    }
  }

  // Prefer real company name over placeholders
  function pickCompanyName({ demandRow, creatorProfile, companyDoc }) {
    const candidates = [
      demandRow?.companyName,
      demandRow?.company?.name,
      companyDoc?.name,
      creatorProfile?.companyName,
      creatorProfile?.company?.name,
      creatorProfile?.settings?.companyName,
      creatorProfile?.profile?.companyName,
      creatorProfile?.companyTitle,
      creatorProfile?.company_name
    ]
      .map(v => (typeof v === 'string' ? v.trim() : v))
      .filter(Boolean);

    const cleaned = candidates.find(n => n && n.toLowerCase() !== 'kendi firmam');
    return cleaned || '—';
  }

  // Render categories: show top 3 chips, expandable to all
  // CRITICAL: Accept categoryIds, categoryTags, or legacy formats and convert to display names
  function renderCategoriesCell(cats = []) {
    if (!cats || cats.length === 0) return '-';

    // Normalize to IDs first (handles IDs, slugs, names)
    const categoryIds = normalizeToIds(Array.isArray(cats) ? cats : []);

    // Convert IDs to display names
    const displayNames = categoryIds.map(id => getNameById(id)).filter(Boolean);

    if (displayNames.length === 0) return '-';

    const top = displayNames.slice(0, 3);
    const rest = displayNames.slice(3);
    const chip = (t) => `<span class="cat-chip">${t}</span>`;
    let html = top.map(chip).join(' ');
    if (rest.length) {
      const payload = encodeURIComponent(JSON.stringify(rest));
      const tipHtml = rest.map(chip).join(' ');
      html += ` <span class="cat-more"><button class="cat-toggle" data-rest="${payload}">+${rest.length}</button><div class="cat-tip">${tipHtml}</div></span>`;
    }
    return html;
  }
  // Expand handler (event delegation)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.cat-toggle');
    if (!btn) return;
    const wrap = btn.parentElement; if (!wrap) return;
    try {
      const rest = JSON.parse(decodeURIComponent(btn.getAttribute('data-rest') || '%5B%5D'));
      const current = Array.from(wrap.querySelectorAll('.cat-chip')).map(n => n.textContent);
      const all = [...current, ...rest];
      // Teklifbul Rule v1.0 - XSS Protection
      const safeCategories = all.map(t => {
        const safeText = DOMPurify.sanitize(t || '', { ALLOWED_TAGS: [] });
        return `<span class="cat-chip">${safeText}</span>`;
      }).join(' ');
      wrap.innerHTML = DOMPurify.sanitize(safeCategories, {
        ALLOWED_TAGS: ['span'],
        ALLOWED_ATTR: ['class']
      });
    } catch (_) { }
  });

  // OPTIMIZED: Load first item meta only for first 10 demands (lazy loading for performance)
  async function loadFirstItemMeta(rows) {
    // Only load for first 10 to reduce requests
    const rowsToLoad = rows.slice(0, 10);
    const cache = new Map();

    await Promise.all(rowsToLoad.map(async (r) => {
      try {
        const qItem = query(collection(db, 'demands', r.id, 'items'), orderBy('lineNo', 'asc'), limit(1));
        const s = await getDocs(qItem);
        if (!s.empty) {
          const it = s.docs[0].data();
          const img = it.imageUrl || it.image || null;
          const target = it.targetUnitPrice || it.targetPrice || r.targetPrice || null;
          r._firstItem = { name: it.name || it.description || '', imageUrl: img, target };
          cache.set(r.id, r._firstItem);
        } else {
          r._firstItem = { name: '', imageUrl: null, target: r.targetPrice || null };
        }
      } catch (e) { r._firstItem = { name: '', imageUrl: null, target: r.targetPrice || null }; }
    }));

    // For remaining rows, set empty firstItem
    rows.slice(10).forEach(r => {
      if (!r._firstItem) {
        r._firstItem = { name: '', imageUrl: null, target: r.targetPrice || null };
      }
    });

    return rows;
  }

  /**
   * Teklifbul Rule v1.0 - Firma isimlerini toplu olarak yükler
   * Eksik firma isimlerini (companyName) creatorCompanyId üzerinden companies koleksiyonundan çeker
   */
  async function loadCompanyNames(rows) {
    if (!rows || rows.length === 0) return;

    const cIds = [...new Set(rows
      .map(r => r.creatorCompanyId)
      .filter(id => id && !COMPANY_CACHE.has(id))
    )];

    if (cIds.length === 0) {
      // Tüm isimler zaten önbellekte, sadece ata
      rows.forEach(r => {
        if (!r.companyName && r.creatorCompanyId) {
          r.companyName = COMPANY_CACHE.get(r.creatorCompanyId) || 'Bilinmeyen Firma';
        }
      });
      return;
    }

    // Firestore 'in' limiti 10 olduğu için parçalara bölerek çekiyoruz
    for (let i = 0; i < cIds.length; i += 10) {
      const chunk = cIds.slice(i, i + 10);
      try {
        const q = query(collection(db, 'companies'), where('__name__', 'in', chunk));
        const snap = await getDocs(q);
        snap.forEach(doc => {
          const data = doc.data();
          // companyName, name veya title alanlarından birini al
          COMPANY_CACHE.set(doc.id, data.companyName || data.name || data.title || 'Bilinmeyen Firma');
        });
      } catch (err) {
        logger.error('Firma isimleri yüklenirken hata oluştu', err);
      }
    }

    // İsimleri dökümanlara ata
    rows.forEach(r => {
      if (!r.companyName && r.creatorCompanyId) {
        r.companyName = COMPANY_CACHE.get(r.creatorCompanyId) || 'Bilinmeyen Firma';
      }
    });
  }


  // Tab functionality
  function showTab(which) {
    // Reset pagination state when switching tabs
    PAGING.activeTab = which;
    PAGING.currentPage = 1;
    PAGING.pageHistory = [null, null]; // Page 1 starts at null
    PAGING.lastVisible = null;
    PAGING.totalItems = 0;

    // Reset Filter Inputs on tab switch
    if (fKeyword) fKeyword.value = '';
    if (fCategory) fCategory.value = '';
    if (fIncomingStatus) fIncomingStatus.value = '';
    if (fUser) fUser.value = '';
    if (fPriority) fPriority.value = '';
    if (fBiddingMode) fBiddingMode.value = '';
    if (fGroup) fGroup.value = '';
    
    // reset searchInput too as it affects loadDemandsPaged
    const sInput = document.getElementById('searchInput');
    if (sInput) sInput.value = '';

    document.getElementById('tabIncoming').classList.toggle('active', which === 'incoming');
    document.getElementById('tabPool')?.classList.toggle('active', which === 'pool');
    document.getElementById('tabOutgoing').classList.toggle('active', which === 'outgoing');
    document.getElementById('tabDraft').classList.toggle('active', which === 'draft');

    document.getElementById('incomingDemands').classList.toggle('hidden', which !== 'incoming');
    document.getElementById('poolDemands')?.classList.toggle('hidden', which !== 'pool');
    document.getElementById('outgoingDemands').classList.toggle('hidden', which !== 'outgoing');
    document.getElementById('draftDemands').classList.toggle('hidden', which !== 'draft');

    // Trigger paged load
    loadDemandsPaged(true).catch(err => logger.error('Paged load failed', err));

    // Filtreleri göster/gizle
    if (which === 'incoming') {
      if (incomingFilters) incomingFilters.style.setProperty('display', 'flex', 'important');
      if (outgoingFilters) outgoingFilters.style.setProperty('display', 'none', 'important');
    } else if (which === 'outgoing') {
      if (incomingFilters) incomingFilters.style.setProperty('display', 'none', 'important');
      if (outgoingFilters) outgoingFilters.style.setProperty('display', 'flex', 'important');
    } else if (which === 'draft') {
      if (incomingFilters) incomingFilters.style.setProperty('display', 'none', 'important');
      if (outgoingFilters) outgoingFilters.style.setProperty('display', 'none', 'important');
    }

    // Pager elements are now shared
    syncPagingUI();
  }

  // --- Unified Paged Loading ---
  async function loadDemandsPaged(reset = false, direction = 'next') {
    if (isLoading) return;
    isLoading = true;
    
    try {
      if (reset) {
        PAGING.currentPage = 1;
        PAGING.pageHistory = [null, null];
        PAGING.lastVisible = null;
      } else {
        if (direction === 'next') {
          PAGING.currentPage++;
          PAGING.pageHistory[PAGING.currentPage] = PAGING.lastVisible;
        } else if (direction === 'prev') {
          PAGING.currentPage--;
        }
      }

      updatePagerUI();

      // Resolve user data if needed (categories etc)
      const userDoc = await getDoc(doc(db, 'users', uid));
      const myData = userDoc.exists() ? userDoc.data() : {};
      
      // Get shared company ID - Robust resolution
      function resolveSharedCompanyId(userData) {
        if (!userData) return null;
        const companyId = userData.activeCompanyId || userData.companyId || (Array.isArray(userData.companies) && userData.companies.length ? userData.companies[0] : null);
        if (companyId && typeof companyId === 'string' && companyId.trim() !== '') return companyId;
        return null;
      }
      const userCompanyId = resolveSharedCompanyId(myData);

      // 1. Build Base Query based on active tab
      let basePath = 'demands';
      let conditions = [];

      // Keyword search (SATFK) - If searchInput has value, filter by SATFK exactly
      const searchInput = document.getElementById('searchInput');
      const satfkFilter = searchInput?.value?.trim();
      if (satfkFilter) {
        conditions.push(where('satfk', '==', satfkFilter));
      }

      // Keyword search (Title) - Handled client-side for better UX (Firestore doesn't support substring search)
      const keyword = fKeyword?.value?.trim()?.toLowerCase();

      // Category filter
      const catFilter = fCategory?.value;
      if (catFilter) {
        conditions.push(where('categoryIds', 'array-contains', catFilter));
      }

      // Priority filter
      const prioFilter = fPriority?.value;
      if (prioFilter) {
        conditions.push(where('priority', '==', prioFilter));
      }

      // Bidding mode filter
      const modeFilter = fBiddingMode?.value;
      if (modeFilter) {
        conditions.push(where('biddingMode', '==', modeFilter));
      }

      if (PAGING.activeTab === 'incoming') {
        let catIds = normalizeToIds(myData.supplierCategoryIds || myData.supplierCategoryKeys || myData.supplierCategories || []);
        
        // Filter by incoming status
        const incStatus = fIncomingStatus?.value;
        
        // Base conditions for incoming
        conditions.push(where('isPublished', '==', true));
        
        // If no specific category filter, use supplier categories
        if (!catFilter && catIds.length > 0) {
          // Firestore 10 limit workaround: we take the first 10 for server-side
          // In a real app we might need multiple queries or a better matching strategy
          conditions.push(where('categoryIds', 'array-contains-any', catIds.slice(0, 10)));
        }

        // Note: Incoming status (Bekleyen/Yanıtlandı) will be filtered client-side 
        // because it depends on whether the user has a bid, which isn't in the demand doc.
        
      } else if (PAGING.activeTab === 'outgoing') {
        if (!userCompanyId) { showEmptyState('Şirket bilgisi bulunamadı.'); return; }
        conditions.push(where('creatorCompanyId', '==', userCompanyId));
        conditions.push(where('isPublished', '==', true));
        
        // Company user filter
        const userFilter = fUser?.value;
        if (userFilter === 'own') {
          conditions.push(where('createdBy', '==', uid));
        } else if (userFilter === 'others') {
          // Firestore doesn't support '!=' for non-sort fields easily with other filters
          // We'll handle 'others' client-side if needed, but 'own' is supported.
        }
      } else if (PAGING.activeTab === 'draft') {
        if (!userCompanyId) { showEmptyState('Şirket bilgisi bulunamadı.'); return; }
        conditions.push(where('creatorCompanyId', '==', userCompanyId));
        conditions.push(where('status', 'in', ['draft', 'withdrawn']));
      }

      // 2. Add Count Query (only on reset)
      if (reset) {
        const countQ = query(collection(db, 'demands'), ...conditions);
        const countSnap = await getCountFromServer(countQ);
        PAGING.totalItems = countSnap.data().count;

        // Teklifbul Rule v1.0 - Outgoing fallback count:
        // Some legacy demands may not have creatorCompanyId; count by createdBy as fallback.
        if (PAGING.activeTab === 'outgoing' && PAGING.totalItems === 0 && uid) {
          try {
            const fallbackCountQ = query(
              collection(db, 'demands'),
              where('createdBy', '==', uid),
              where('isPublished', '==', true)
            );
            const fallbackCountSnap = await getCountFromServer(fallbackCountQ);
            PAGING.totalItems = fallbackCountSnap.data().count;
          } catch (e) {
            logger.warn('Outgoing fallback count query failed', e);
          }
        }
      }

      // 3. Build Final Query with Sort and Limit
      let finalQ = query(
        collection(db, 'demands'),
        ...conditions,
        orderBy(PAGING.sortBy, PAGING.sortDir),
        limit(PAGING.pageSize)
      );

      // 4. Apply Pagination Cursor
      const startAtDoc = PAGING.pageHistory[PAGING.currentPage];
      if (startAtDoc) {
        finalQ = query(finalQ, startAfter(startAtDoc));
      }

      const snap = await getDocs(finalQ);
      let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Teklifbul Rule v1.0 - Outgoing fallback rows:
      // If company-based query returns empty, fetch user's published demands.
      if (PAGING.activeTab === 'outgoing' && rows.length === 0 && uid) {
        try {
          const fallbackQ = query(
            collection(db, 'demands'),
            where('createdBy', '==', uid),
            where('isPublished', '==', true),
            orderBy(PAGING.sortBy, PAGING.sortDir),
            limit(PAGING.pageSize)
          );
          const fallbackSnap = await getDocs(fallbackQ);
          rows = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          logger.info('Outgoing fallback by createdBy applied', { count: rows.length, uid });
        } catch (e) {
          logger.warn('Outgoing fallback rows query failed', e);
        }
      }
      
      if (snap.docs.length > 0) {
        PAGING.lastVisible = snap.docs[snap.docs.length - 1];
      }

      // 5. Enhance data (metas, bid counts, company names)
      await loadFirstItemMeta(rows);
      await loadCompanyNames(rows); // Teklifbul Rule v1.0 - Firma isimlerini çek
      
      // Load bid counts if needed
      if (rows.length > 0) {
        const dIds = rows.map(r => r.id);
        const bidCountsMap = new Map();
        const bidSupplierKeyMap = new Map();
        for (let i = 0; i < dIds.length; i += 10) {
          const batch = dIds.slice(i, i + 10);
          const bQ = query(collection(db, 'bids'), where('demandId', 'in', batch));
          const bSnap = await getDocs(bQ);
          bSnap.docs.forEach(bd => {
            const bidData = bd.data();
            const did = bidData.demandId;
            const supplierKey = bidData.supplierCompanyId || bidData.supplierId || bd.id;
            if (!did) return;
            if (!bidSupplierKeyMap.has(did)) bidSupplierKeyMap.set(did, new Set());
            bidSupplierKeyMap.get(did).add(String(supplierKey));
          });
        }
        bidSupplierKeyMap.forEach((supplierSet, did) => {
          bidCountsMap.set(did, supplierSet.size);
        });
        rows.forEach(r => r._bidCount = bidCountsMap.get(r.id) || 0);

        // For incoming/pool, check own bid
        if (PAGING.activeTab === 'incoming' || PAGING.activeTab === 'pool') {
          const ownBidSet = new Set();
          for (let i = 0; i < dIds.length; i += 10) {
            const batch = dIds.slice(i, i + 10);
            const ownBQ = query(collection(db, 'bids'), where('demandId', 'in', batch), where('supplierId', '==', uid));
            const ownBSnap = await getDocs(ownBQ);
            ownBSnap.docs.forEach(bd => ownBidSet.add(bd.data().demandId));
          }
          rows.forEach(r => r.hasOwnBid = ownBidSet.has(r.id));
        }
      }

      // 6. Client-side Post-Filtering (Keyword & Status)
      let filteredRows = [...rows];

      // CRITICAL: Exclude own company's demands from incoming tab
      // A company should never see its own demands in "Gelen Talepler",
      // even if the company has both Alıcı (Buyer) and Tedarikçi (Supplier) roles.
      if (PAGING.activeTab === 'incoming') {
        filteredRows = filteredRows.filter(r => {
          const createdByCurrentUser = r.createdBy && uid && r.createdBy === uid;
          const createdByCurrentCompany = userCompanyId && r.creatorCompanyId === userCompanyId;
          return !createdByCurrentUser && !createdByCurrentCompany;
        });
      }
      
      // Keyword filter (Title)
      if (keyword) {
        filteredRows = filteredRows.filter(r => 
          (r.title || '').toLowerCase().includes(keyword) || 
          (r.satfk || '').toLowerCase().includes(keyword)
        );
      }

      // Incoming Status filter (Bekleyen / Yanıtlandı)
      if (PAGING.activeTab === 'incoming') {
        const incStatus = fIncomingStatus?.value;
        if (incStatus === 'pending') {
          filteredRows = filteredRows.filter(r => !r.hasOwnBid);
        } else if (incStatus === 'responded') {
          filteredRows = filteredRows.filter(r => r.hasOwnBid);
        }
      }

      // Outgoing User Filter (Others) - Handled client-side if not filtered by server
      if (PAGING.activeTab === 'outgoing') {
        const userFilter = fUser?.value;
        if (userFilter === 'others') {
          filteredRows = filteredRows.filter(r => r.createdBy !== uid);
        }
      }

      // 7. Render
      PAGING.currentVisibleCount = filteredRows.length;
      if (PAGING.activeTab === 'incoming') {
        renderIncomingGroups(filteredRows);
      } else if (PAGING.activeTab === 'outgoing') {
        render(filteredRows, '#outgoingRows', '#outgoingEmpty');
      } else if (PAGING.activeTab === 'draft') {
        renderDraft(filteredRows, '#draftRows', '#draftEmpty');
      }

      // 7. Update UI
      updatePagerUI();
      const btnNext = document.getElementById('btnNext');
      if (btnNext) btnNext.disabled = snap.docs.length < PAGING.pageSize;

    } catch (err) {
      logger.error('loadDemandsPaged error', err);
      if (err.code === 'failed-precondition' || String(err).includes('index')) {
        toast.error('Gelişmiş filtreleme için Firestore indeksi gerekiyor. Lütfen konsoldaki (F12) linke tıklayıp indeksi oluşturun.');
        showIndexHint(err);
      } else {
        toast.error('Talepler yüklenirken hata oluştu: ' + (err.message || err));
      }
    } finally {
      isLoading = false;
    }
  }

  function showEmptyState(msg) {
    const selector = `#${PAGING.activeTab}Empty`;
    const el = document.querySelector(selector);
    if (el) {
      el.textContent = msg;
      el.classList.remove('hidden');
    }
    isLoading = false;
    updatePagerUI();
  }

  // Bind Paging Listeners
  document.getElementById('f-pageSize')?.addEventListener('change', (e) => {
    PAGING.pageSize = parseInt(e.target.value);
    loadDemandsPaged(true);
  });
  
  document.getElementById('f-sort')?.addEventListener('change', (e) => {
    const [field, dir] = e.target.value.split('_');
    PAGING.sortBy = field;
    PAGING.sortDir = dir;
    loadDemandsPaged(true);
  });

  document.getElementById('btnPrev')?.addEventListener('click', () => loadDemandsPaged(false, 'prev'));
  document.getElementById('btnNext')?.addEventListener('click', () => loadDemandsPaged(false, 'next'));

  // Filter listeners
  [fPriority, fBiddingMode, fGroup, fUser, fCategory, fIncomingStatus].forEach(el => {
    el?.addEventListener('change', () => loadDemandsPaged(true));
  });

  // Keyword search with debounce
  let keywordTimeout;
  fKeyword?.addEventListener('input', () => {
    clearTimeout(keywordTimeout);
    keywordTimeout = setTimeout(() => loadDemandsPaged(true), 500);
  });

  // Tab switches
  const pushTabToUrl = (tab) => {
    const qs = new URLSearchParams(window.location.search);
    qs.set('tab', tab);
    history.pushState({}, '', `${window.location.pathname}?${qs.toString()}`);
  };

  document.getElementById('tabIncoming')?.addEventListener('click', () => {
    pushTabToUrl('incoming');
    showTab('incoming');
  });
  document.getElementById('tabPool')?.addEventListener('click', () => {
    pushTabToUrl('pool');
    showTab('pool');
  });
  document.getElementById('tabOutgoing')?.addEventListener('click', () => {
    pushTabToUrl('outgoing');
    showTab('outgoing');
  });
  document.getElementById('tabDraft')?.addEventListener('click', () => {
    pushTabToUrl('draft');
    showTab('draft');
  });

  // Check URL parameters for dashboard navigation - Teklifbul Rule v1.0
  // URL parametresini kontrol et, sayfa yüklenirken hemen doğru sekmeye geçiş yap
  // Teklifbul Rule v1.0 - showTab fonksiyonu artık tanımlı, güvenle kullanılabilir
  // filter değişkeni yukarıda (satır 50) tanımlı, burada tekrar tanımlamaya gerek yok

  // Teklifbul Rule v1.0 - Önce aktif tab'ı belirle ve göster
  let initialTab = 'incoming'; // Varsayılan
  const tabFromUrl = urlParams.get('tab');
  if (tabFromUrl && ['incoming', 'pool', 'outgoing', 'draft'].includes(tabFromUrl)) {
    initialTab = tabFromUrl;
  } else if (filter) {
    // Apply filter based on URL parameter
    // Teklifbul Rule v1.0 - filter=sent ve filter=outgoing aynı şekilde işlenir
    if (filter === 'inbox') {
      initialTab = 'incoming';
    } else if (filter === 'outgoing' || filter === 'sent') {
      initialTab = 'outgoing';
    } else if (filter === 'draft') {
      initialTab = 'draft';
    }
  }

  // Aktif tab'ı göster (içerik yükleme showTab içinde yapılacak)
  showTab(initialTab);

  window.addEventListener('popstate', () => {
    const p = new URLSearchParams(window.location.search);
    const tab = p.get('tab');
    if (tab && ['incoming', 'pool', 'outgoing', 'draft'].includes(tab)) {
      showTab(tab);
    }
  });

  // Search functionality
  document.getElementById('searchBtn')?.addEventListener('click', (e) => { 
    e.preventDefault?.(); 
    // If SATFK exists, we can still do a direct search/redirect, 
    // but also refresh the list if they just press search.
    loadDemandsPaged(true); 
  });
  document.getElementById('searchForm')?.addEventListener('submit', (e) => { 
    e.preventDefault(); 
    loadDemandsPaged(true); 
  });
  document.getElementById('clearSearchBtn')?.addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    loadDemandsPaged(true);
  });
  document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loadDemandsPaged(true);
  });

  // Search by SATFK function
  async function searchBySATFK() {
    const searchInput = document.getElementById('searchInput');
    const satfk = searchInput.value.trim();

    if (!satfk) {
      toast.warn(MESSAGES.WARN_SATFK_REQUIRED);
      return;
    }

    // Validate SATFK format
    if (!satfk.match(/^SATFK-\d{8}-[0-9A-Z]+$/)) {
      toast.error(MESSAGES.ERROR_SATFK_INVALID);
      return;
    }

    try {
      // Search in all demands
      const q = query(
        collection(db, 'demands'),
        where('satfk', '==', satfk)
      );

      const snap = await getDocs(q);

      if (snap.empty) {
        toast.warn(MESSAGES.WARN_SATFK_NOT_FOUND);
        return;
      }

      const demand = snap.docs[0].data();
      const demandId = snap.docs[0].id;

      // Redirect to demand detail
      const readonlyParam = readonlyMode ? '&readonly=true' : '';
      window.location.href = `./demand-detail.html?id=${demandId}${readonlyParam}`;

    } catch (error) {
      logger.error('Arama hatası', error);
      toast.error(MESSAGES.ERROR_SEARCH);
    }
  }

  // ==========================================
  // Reached Firms Modal Logic for Outgoing Demands
  // ==========================================
  let ReachedFirmsState = {
    demandId: null,
    lastDoc: null,
    isLoading: false,
    hasMore: true
  };

  window.showReachedFirms = async function(demandId, satfk) {
    const modal = document.getElementById('reachedFirmsModal');
    if (!modal) return;
    
    // Reset state
    ReachedFirmsState = { demandId, lastDoc: null, isLoading: false, hasMore: true };
    document.getElementById('reachedFirmsList').innerHTML = '';
    document.getElementById('reachedFirmsEmpty').style.display = 'none';
    const btnLoadMore = document.getElementById('btnLoadMoreFirms');
    if (btnLoadMore) btnLoadMore.style.display = 'none';
    
    const subtitle = document.getElementById('reachedFirmsSubtitle');
    if (subtitle) {
      subtitle.textContent = `${satfk || 'Talep'} numaralı talebin iletildiği firmalar`;
    }
    
    modal.style.display = 'flex';
    await loadReachedFirms();
  };

  async function loadReachedFirms() {
    if (ReachedFirmsState.isLoading || !ReachedFirmsState.hasMore) return;
    ReachedFirmsState.isLoading = true;
    
    const loadingEl = document.getElementById('reachedFirmsLoading');
    const btnLoadMore = document.getElementById('btnLoadMoreFirms');
    const emptyEl = document.getElementById('reachedFirmsEmpty');
    const listEl = document.getElementById('reachedFirmsList');
    
    if (loadingEl) loadingEl.style.display = 'block';
    if (btnLoadMore) btnLoadMore.style.display = 'none';
    
    try {
      let q = query(
        collection(db, 'demandRecipients'),
        where('demandId', '==', ReachedFirmsState.demandId),
        limit(10)
      );
      
      if (ReachedFirmsState.lastDoc) {
        q = query(
          collection(db, 'demandRecipients'),
          where('demandId', '==', ReachedFirmsState.demandId),
          startAfter(ReachedFirmsState.lastDoc),
          limit(10)
        );
      }
      
      const snap = await getDocs(q);
      
      if (loadingEl) loadingEl.style.display = 'none';
      
      if (snap.empty && !ReachedFirmsState.lastDoc) {
        if (emptyEl) emptyEl.style.display = 'block';
        ReachedFirmsState.hasMore = false;
      } else {
        if (snap.docs.length < 10) {
          ReachedFirmsState.hasMore = false;
        } else {
          ReachedFirmsState.lastDoc = snap.docs[snap.docs.length - 1];
          if (btnLoadMore) {
            btnLoadMore.style.display = 'inline-block';
            btnLoadMore.classList.remove('hidden');
          }
        }
        
        const supplierIds = snap.docs.map(d => d.data().supplierId);
        
        // Fetch company details for each recipient
        for (const sId of supplierIds) {
          let companyName = 'Bilinmeyen Firma';
          let email = '';
          let companyId = '';
          try {
             // Try profiles first
             const pSnap = await getDoc(doc(db, 'profiles', sId));
             if (pSnap.exists()) {
               const pData = pSnap.data();
               companyName = pData.companyName || pData.companyTitle || pData.name || 'Bilinmeyen Firma';
               email = pData.email || '';
               companyId = pData.companyId || pData.activeCompanyId || '';
             }
             
             // If no companyId or not found, try users
             if (!companyId) {
               const uSnap = await getDoc(doc(db, 'users', sId));
               if (uSnap.exists()) {
                 const uData = uSnap.data();
                 if (companyName === 'Bilinmeyen Firma') {
                   companyName = uData.companyName || uData.companyTitle || uData.name || 'Bilinmeyen Firma';
                   email = uData.email || email || '';
                 }
                 companyId = uData.companyId || uData.activeCompanyId || '';
               }
             }
             
             // Fallback for companyId: if it's still empty and sId looks like a company ID or starts with solo
             if (!companyId && (sId.startsWith('solo-') || sId.length > 20)) {
               // In some cases sId might be the company ID itself if we reached a company
               // But usually it's a user ID. 
             }
          } catch (err) { logger.warn('Kullanıcı bilgisi çekilemedi', err); }
          
          const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
          const item = document.createElement('div');
          item.style.padding = '12px 16px';
          item.style.border = isDark ? '1px solid rgba(255,255,255,0.2)' : '1px solid #e2e8f0';
          item.style.borderRadius = '8px';
          item.style.background = isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc';
          item.style.display = 'flex';
          item.style.flexDirection = 'column';
          
          const safeName = DOMPurify.sanitize(companyName);
          const safeEmail = DOMPurify.sanitize(email);
          const nameHtml = companyId 
            ? `<a href="company-profile.html?id=${companyId}" target="_blank" rel="noopener noreferrer" style="color: ${isDark ? '#60a5fa' : '#3b82f6'}; text-decoration: none; font-weight: 600;">${safeName}</a>`
            : `${safeName}`;

          // Teklifbul Rule v1.0 - DOMPurify ile savunma derinligi (nameHtml/safeEmail zaten saf)
          item.innerHTML = DOMPurify.sanitize(`
            <div style="font-size: 14px;">${nameHtml}</div>
            <div style="font-size: 13px; color: ${isDark ? '#cbd5e1' : '#64748b'}; margin-top: 4px;">${safeEmail}</div>
          `, { ADD_ATTR: ['target', 'style'] });
          listEl.appendChild(item);
        }
      }
    } catch (error) {
       logger.error('Error loading reached firms', error);
       toast.error('Firmalar yüklenirken bir hata oluştu');
       if (loadingEl) loadingEl.style.display = 'none';
    }
    
    ReachedFirmsState.isLoading = false;
  }

  // Bind load more & close
  document.getElementById('btnLoadMoreFirms')?.addEventListener('click', loadReachedFirms);
  document.getElementById('closeReachedFirmsModal')?.addEventListener('click', () => {
      const modal = document.getElementById('reachedFirmsModal');
      if (modal) modal.style.display = 'none';
  });
  
  // Close modal when clicking outside
  window.addEventListener('click', (event) => {
    const modal = document.getElementById('reachedFirmsModal');
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });
  // Clear search function
  function clearSearch() {
    document.getElementById('searchInput').value = '';
  }

  // Get URL parameters once for the entire page (already defined above)
  // urlParams is already defined at line 369, reusing it here

  // Check for search parameter in URL
  const searchQuery = urlParams.get('q');
  if (searchQuery) {
    document.getElementById('searchInput').value = searchQuery;
    searchBySATFK();
  }

  // Teklifbul Rule v1.0 - Tema kontrolü
  function isDarkMode() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ||
      document.documentElement.classList.contains('force-dark');
  }

  // Teklifbul Rule v1.0 - Açık mod için stil helper'ları
  function getSpanStyle(text, bg = null) {
    if (isDarkMode()) {
      return bg
        ? `style="background: #111827; color: #ffffff; padding: 2px 6px; border: 1px solid rgba(255,255,255,0.25); border-radius: 4px; display: inline-block;"`
        : `style="color: #ffffff; padding: 2px 6px; border: 1px solid rgba(255,255,255,0.25); border-radius: 4px; display: inline-block;"`;
    } else {
      // Açık mod: Beyaz arka plan, #1f2937 metin, #1f2937 border
      return bg
        ? `style="background: #ffffff; color: #1f2937; padding: 2px 6px; border: 1px solid #1f2937; border-radius: 4px; display: inline-block; font-size: 12px;"`
        : `style="background: #ffffff; color: #1f2937; padding: 2px 6px; border: 1px solid #1f2937; border-radius: 4px; display: inline-block; font-size: 12px;"`;
    }
  }

  function getStatusBadgeStyle() {
    if (isDarkMode()) {
      return 'style="background: #111827; color: #ffffff; padding: 4px 8px; border-radius: 4px; font-size: 12px; border: 1px solid rgba(255,255,255,0.25);"';
    } else {
      // Açık mod: Beyaz arka plan, #1f2937 metin, #1f2937 border
      return 'style="background: #ffffff; color: #1f2937; padding: 4px 8px; border-radius: 4px; font-size: 12px; border: 1px solid #1f2937;"';
    }
  }

  function getTitleBlockStyle() {
    if (isDarkMode()) {
      return 'style="font-weight:600;color:#ffffff;padding:4px 8px;border:1px solid rgba(255,255,255,0.25);border-radius:4px;display:inline-block;"';
    } else {
      // Açık mod: Beyaz arka plan, #1f2937 metin, #1f2937 border
      return 'style="background:#ffffff;font-weight:600;color:#1f2937;padding:4px 8px;border:1px solid #1f2937;border-radius:4px;display:inline-block;"';
    }
  }

  function getLinkStyle() {
    if (isDarkMode()) {
      return 'style="color:#ffffff;padding:4px 8px;border:1px solid rgba(255,255,255,0.25);border-radius:4px;display:inline-block;text-decoration:none;"';
    } else {
      // Açık mod: Mavi metin, mavi border
      return 'style="background:#ffffff;color:#2563eb;padding:4px 8px;border:1px solid #2563eb;border-radius:4px;display:inline-block;text-decoration:none;"';
    }
  }

  // Teklifbul Rule v1.0 - Company badge için özel stil
  function getCompanyBadgeStyle() {
    if (isDarkMode()) {
      return 'style="background:#111827;color:#ffffff;padding:2px 6px;border:1px solid rgba(255,255,255,0.25);border-radius:4px;font-size:12px;display:inline-block;"';
    } else {
      // Açık mod: Beyaz arka plan, #1f2937 metin, #1f2937 border
      return 'style="background:#ffffff;color:#1f2937;padding:2px 6px;border:1px solid #1f2937;border-radius:4px;font-size:12px;display:inline-block;"';
    }
  }

  // Render function for draft demands (with action buttons)
  // Teklifbul Rule v1.0 - DOM API kullanarak tablo yapısını koru (innerHTML yerine)
  async function renderDraft(rows, tbodySel, emptySel) {
    const tb = document.querySelector(tbodySel);
    if (!tb) return;
    tb.innerHTML = '';

    if (rows.length === 0) {
      document.querySelector(emptySel).classList.remove('hidden');
      return;
    }

    document.querySelector(emptySel).classList.add('hidden');

    // Helper to extract style from getSpanStyle/getStatusBadgeStyle
    function extractStyle(styleString) {
      const match = styleString.match(/style="([^"]+)"/);
      return match ? match[1] : '';
    }

    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.dataset.id = r.id;

      const d = r.dueDate ? new Date(r.dueDate) : null;
      const statusText = translateStatus(r.statusText || r.status || 'draft');

      // OPTIMIZED: Use pre-loaded bid count instead of querying
      const bidCount = r._bidCount !== undefined ? r._bidCount : 0;

      // Build bid display
      let bidDisplayHTML = '';
      if (bidCount > 0) {
        if (isDarkMode()) {
          bidDisplayHTML = `<span style="background:#111827;color:#ffffff;padding:2px 6px;border:1px solid rgba(255,255,255,0.25);border-radius:4px;font-size:12px">${bidCount} teklif</span>`;
        } else {
          bidDisplayHTML = `<span style="background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:4px;font-size:12px">${bidCount} teklif</span>`;
        }
      } else {
        if (isDarkMode()) {
          bidDisplayHTML = '<span style="color:#dc2626;font-size:12px;padding:2px 6px;border:1px solid rgba(255,255,255,0.25);border-radius:4px;display:inline-block;">Henüz teklif yok</span>';
        } else {
          bidDisplayHTML = '<span style="color:#dc2626;font-size:12px">Henüz teklif yok</span>';
        }
      }

      // Teklifbul Rule v1.0 - XSS Protection
      const safeId = DOMPurify.sanitize(r.id || '', { ALLOWED_TAGS: [] });
      const safeSatfk = DOMPurify.sanitize(r.satfk || '-', { ALLOWED_TAGS: [] });
      const safeTitle = DOMPurify.sanitize(r.title || '-', { ALLOWED_TAGS: [] });
      const safeStatusText = DOMPurify.sanitize(statusText || '', { ALLOWED_TAGS: [] });

      // Checkbox column
      const td0 = document.createElement('td');
      td0.style.textAlign = 'center';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'draft-select';
      checkbox.dataset.id = safeId;
      td0.appendChild(checkbox);
      tr.appendChild(td0);

      // SATFK column
      const td1 = document.createElement('td');
      const satfkSpan = document.createElement('span');
      satfkSpan.style.cssText = extractStyle(getSpanStyle(safeSatfk));
      satfkSpan.textContent = safeSatfk;
      td1.appendChild(satfkSpan);
      tr.appendChild(td1);

      // Title column
      const td2 = document.createElement('td');
      td2.textContent = safeTitle;
      tr.appendChild(td2);

      // Categories column
      const td3 = document.createElement('td');
      td3.className = 'td-cats';
      const catWrap = document.createElement('div');
      catWrap.className = 'cat-wrap';
      catWrap.innerHTML = renderCategoriesCell(r.categoryIds || r.categoryTags || []);
      td3.appendChild(catWrap);
      tr.appendChild(td3);

      // Date column
      const td4 = document.createElement('td');
      td4.textContent = d ? d.toLocaleDateString('tr-TR') : '-';
      tr.appendChild(td4);

      // Status column
      const td5 = document.createElement('td');
      const statusSpan = document.createElement('span');
      statusSpan.style.cssText = extractStyle(getStatusBadgeStyle());
      statusSpan.textContent = safeStatusText;
      td5.appendChild(statusSpan);
      tr.appendChild(td5);

      // Bid count column - Teklifbul Rule v1.0 - DOMPurify (savunma derinligi)
      const td6 = document.createElement('td');
      td6.innerHTML = DOMPurify.sanitize(bidDisplayHTML, { ADD_ATTR: ['style'] });
      tr.appendChild(td6);

      // Actions column
      const td7 = document.createElement('td');
      const editBtn = document.createElement('button');
      editBtn.onclick = () => editDraftDemand(safeId);
      editBtn.className = 'btn btn-primary';
      editBtn.style.cssText = 'padding: 4px 10px; font-size: 12px; margin-right: 4px; background:#3b82f6; color:#ffffff; border:none; border-radius:4px;';
      editBtn.textContent = '✏️ Düzenle';
      td7.appendChild(editBtn);

      const approveBtn = document.createElement('button');
      approveBtn.onclick = () => approveDraftDemand(safeId);
      approveBtn.className = 'btn btn-success';
      approveBtn.style.cssText = 'padding: 4px 8px; font-size: 12px; margin-right: 4px;';
      approveBtn.textContent = '✅ Onayla';
      td7.appendChild(approveBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.onclick = () => deleteDraftDemand(safeId);
      deleteBtn.className = 'btn btn-danger';
      deleteBtn.style.cssText = 'padding: 4px 8px; font-size: 12px;';
      deleteBtn.textContent = '🗑️ Sil';
      td7.appendChild(deleteBtn);

      tr.appendChild(td7);
      tb.appendChild(tr);
    }
  }

  // Render function for tab tables (outgoing demands)
  // Teklifbul Rule v1.0 - DOM API kullanarak tablo yapısını koru (innerHTML yerine)
  async function render(rows, tbodySel, emptySel) {
    const tb = document.querySelector(tbodySel);
    if (!tb) return;
    tb.innerHTML = '';
    const emptyEl = document.querySelector(emptySel);
    if (!rows.length) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    const isIncoming = (tbodySel === '#incomingRows');

    // Helper to extract style from getSpanStyle/getTitleBlockStyle/getCompanyBadgeStyle
    function extractStyle(styleString) {
      const match = styleString.match(/style="([^"]+)"/);
      return match ? match[1] : '';
    }

    for (const r of rows) {
      // Normalize due date across different field shapes
      let d = null;
      if (r.dueDate?.toDate) d = r.dueDate.toDate();
      else if (r.dueDate) d = new Date(r.dueDate);
      else if (r.deadline?.toDate) d = r.deadline.toDate();
      else if (r.deadline) d = new Date(r.deadline);

      const tr = document.createElement('tr');
      tr.dataset.id = r.id;
      tr.dataset.status = r.status || 'draft';

      // REFACTORED: Durum gösterimi - sadece status alanı kullanılıyor
      const statusText = translateStatus(r.status || 'draft');

      // OPTIMIZED: Use pre-loaded bid count instead of querying
      const bidCount = r._bidCount !== undefined ? r._bidCount : 0;

      // Build bid display
      let bidDisplayHTML = '';
      if (bidCount > 0) {
        if (isDarkMode()) {
          bidDisplayHTML = `<span style="background:#111827;color:#ffffff;padding:2px 6px;border:1px solid rgba(255,255,255,0.25);border-radius:4px;font-size:12px">${bidCount} teklif</span>`;
        } else {
          bidDisplayHTML = `<span style="background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:4px;font-size:12px">${bidCount} teklif</span>`;
        }
      } else {
        if (isDarkMode()) {
          bidDisplayHTML = '<span style="color:#dc2626;font-size:12px;padding:2px 6px;border:1px solid rgba(255,255,255,0.25);border-radius:4px;display:inline-block;">Henüz teklif yok</span>';
        } else {
          bidDisplayHTML = '<span style="color:#dc2626;font-size:12px">Henüz teklif yok</span>';
        }
      }

      // Tablo sütunları hedef tabloya göre hizalanır
      const detailLink = (src) => {
        const baseUrl = `demand-detail.html?id=${encodeURIComponent(r.id)}&source=${src}`;
        return readonlyMode ? `${baseUrl}&readonly=true` : baseUrl;
      };
      const fi = r._firstItem || {};

      // SATFK column
      const td1 = document.createElement('td');
      const satfkSpan = document.createElement('span');
      satfkSpan.style.cssText = extractStyle(getSpanStyle(r.satfk || '-'));
      satfkSpan.textContent = DOMPurify.sanitize(r.satfk || '-', { ALLOWED_TAGS: [] });
      td1.appendChild(satfkSpan);
      tr.appendChild(td1);

      // Title column
      const td2 = document.createElement('td');
      const titleDiv = document.createElement('div');
      titleDiv.style.display = 'flex';
      titleDiv.style.alignItems = 'center';

      if (fi.imageUrl) {
        const img = document.createElement('img');
        img.src = fi.imageUrl;
        img.alt = '';
        img.style.cssText = 'width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;margin-right:8px;';
        titleDiv.appendChild(img);
      }

      const titleInner = document.createElement('div');
      const titleBlock = document.createElement('div');
      titleBlock.style.cssText = extractStyle(getTitleBlockStyle());
      titleBlock.textContent = DOMPurify.sanitize(r.title || '-', { ALLOWED_TAGS: [] });
      titleInner.appendChild(titleBlock);

      titleDiv.appendChild(titleInner);
      td2.appendChild(titleDiv);
      tr.appendChild(td2);

      // Company column (only for incoming)
      if (isIncoming) {
        const companyName = r.companyName || r.company?.name || COMPANY_CACHE.get(r.creatorCompanyId) || 'Bilinmeyen Firma';
        const td3 = document.createElement('td');
        const companySpan = document.createElement('span');
        companySpan.style.cssText = extractStyle(getCompanyBadgeStyle());
        companySpan.textContent = DOMPurify.sanitize(companyName, { ALLOWED_TAGS: [] });
        td3.appendChild(companySpan);
        tr.appendChild(td3);
      }

      // Categories column
      const td4 = document.createElement('td');
      td4.className = 'td-cats';
      const catWrap = document.createElement('div');
      catWrap.className = 'cat-wrap';
      catWrap.innerHTML = renderCategoriesCell(r.categoryIds || r.categoryTags || []);
      td4.appendChild(catWrap);
      tr.appendChild(td4);

      // Date column
      const td5 = document.createElement('td');
      const dateSpan = document.createElement('span');
      const dateStr = fmtDateCell(d);
      dateSpan.style.cssText = extractStyle(getSpanStyle(dateStr));
      dateSpan.textContent = dateStr;
      td5.appendChild(dateSpan);
      tr.appendChild(td5);

      // Status column
      const td6 = document.createElement('td');
      const statusSpan = document.createElement('span');
      statusSpan.style.cssText = extractStyle(getSpanStyle(statusText));
      statusSpan.textContent = DOMPurify.sanitize(statusText, { ALLOWED_TAGS: [] });
      td6.appendChild(statusSpan);
      tr.appendChild(td6);

      // Bid count column - Teklifbul Rule v1.0 - DOMPurify (savunma derinligi)
      const td7 = document.createElement('td');
      td7.innerHTML = DOMPurify.sanitize(bidDisplayHTML, { ADD_ATTR: ['style'] });
      tr.appendChild(td7);

      // Link column
      const td8 = document.createElement('td');
      td8.style.display = 'flex';
      td8.style.gap = '8px';
      
      const link = document.createElement('a');
      link.href = detailLink(isIncoming ? 'incoming' : 'outgoing');
      link.style.cssText = extractStyle(getLinkStyle());
      link.textContent = 'Görüntüle →';
      td8.appendChild(link);
      
      if (!isIncoming) {
        const btnFirms = document.createElement('button');
        btnFirms.style.cssText = extractStyle(getLinkStyle()) + ' background:#f8fafc; color:#475569; border-color:#cbd5e1; cursor:pointer;';
        btnFirms.textContent = 'Firmaları Gör 🏢';
        btnFirms.onclick = (e) => { e.preventDefault(); window.showReachedFirms(r.id, r.satfk); };
        td8.appendChild(btnFirms);
      }

      tr.appendChild(td8);

      tb.appendChild(tr);
    }
  }

  // Load incoming demands (assigned to supplier)
  let INCOMING_ALL_ROWS = [];

  function fmtDateCell(d) { return d ? d.toLocaleDateString('tr-TR') : '-'; }

  function demandRowHtml(r, isIncoming) {
    const d = r._dueDate || null;
    const statusText = translateStatus(r.status || 'published');
    const bidCount = typeof r._bidCount === 'number' ? r._bidCount : 0;
    // Build bid display to avoid complex nested conditionals
    let bidDisplay;
    if (bidCount > 0) {
      if (isDarkMode()) {
        bidDisplay = `<span style="background:#111827;color:#ffffff;padding:2px 6px;border:1px solid rgba(255,255,255,0.25);border-radius:4px;font-size:12px">${bidCount} teklif</span>`;
      } else {
        bidDisplay = `<span style="background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:4px;font-size:12px">${bidCount} teklif</span>`;
      }
    } else {
      if (isDarkMode()) {
        bidDisplay = '<span style="color:#dc2626;font-size:12px;padding:2px 6px;border:1px solid rgba(255,255,255,0.25);border-radius:4px;display:inline-block;">Henüz teklif yok</span>';
      } else {
        bidDisplay = '<span style="color:#dc2626;font-size:12px">Henüz teklif yok</span>';
      }
    }
    const companyName = r.companyName || r.company?.name || COMPANY_CACHE.get(r.creatorCompanyId) || 'Bilinmeyen Firma';
    const companyTd = isIncoming ? `<td><span ${getCompanyBadgeStyle()}>${companyName}</span></td>` : '';
    const detailLink = (src) => {
      const baseUrl = `demand-detail.html?id=${encodeURIComponent(r.id)}&source=${src}`;
      return readonlyMode ? `${baseUrl}&readonly=true` : baseUrl;
    };
    const fi = r._firstItem || {};
    const thumb = fi.imageUrl ? `<img src="${fi.imageUrl}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;margin-right:8px;">` : '';
    const targetStyle = isDarkMode()
      ? 'style="font-size:12px;color:#ffffff;padding:2px 6px;border:1px solid rgba(255,255,255,0.25);border-radius:4px;display:inline-block;margin-top:4px;"'
      : 'style="background:#ffffff;font-size:12px;color:#1f2937;padding:2px 6px;border:1px solid #1f2937;border-radius:4px;display:inline-block;margin-top:4px;"';
    const titleBlock = `<div style="display:flex;align-items:center;">${thumb}<div><div ${getTitleBlockStyle()}>${r.title || '-'}</div></div></div>`;
    const actionLinks = `<a href="${detailLink(isIncoming ? 'incoming' : 'outgoing')}" ${getLinkStyle()}>Görüntüle →</a>` + 
                        (!isIncoming ? ` <button onclick="window.showReachedFirms('${r.id}', '${r.satfk || ''}')" ${getLinkStyle()} style="background:#f8fafc; color:#475569; border-color:#cbd5e1; cursor:pointer; margin-left:8px;">Firmaları Gör 🏢</button>` : '');
    return `<td><span ${getSpanStyle(r.satfk || '-')}>${r.satfk || '-'}</span></td><td>${titleBlock}</td>${companyTd}<td class="td-cats"><div class="cat-wrap">${renderCategoriesCell(r.categoryTags)}</div></td><td><span ${getSpanStyle(fmtDateCell(d))}>${fmtDateCell(d)}</span></td><td><span ${getSpanStyle(statusText)}>${statusText}</span></td><td>${bidDisplay}</td><td><div style="display:flex;gap:8px;">${actionLinks}</div></td>`;
  }

  // OPTIMIZED: This function is now integrated into loadIncoming for batch processing
  // Kept for backward compatibility but should use batch approach instead
  async function markOwnBidFlags(rows, u) {
    // If hasOwnBid is already set (from batch processing), skip
    if (rows.length > 0 && rows[0].hasOwnBid !== undefined) {
      return rows;
    }

    // Fallback: batch query if not already done
    const demandIds = rows.map(r => r.id).slice(0, 10);
    if (demandIds.length === 0) return rows;

    try {
      const bidsQuery = query(
        collection(db, 'bids'),
        where('demandId', 'in', demandIds),
        where('supplierId', '==', u.uid)
      );
      const snap = await getDocs(bidsQuery);
      const ownBidSet = new Set(snap.docs.map(d => d.data().demandId));
      rows.forEach(r => {
        r.hasOwnBid = ownBidSet.has(r.id);
      });
    } catch (e) {
      rows.forEach(r => { r.hasOwnBid = false; });
    }
    return rows;
  }

  function renderIncomingGroups(rows) {
    const bodyGiven = document.getElementById('incomingRowsGiven');
    const bodyWaiting = document.getElementById('incomingRowsWaiting');
    const emptyEl = document.getElementById('incomingEmpty');
    if (bodyGiven) bodyGiven.innerHTML = '';
    if (bodyWaiting) bodyWaiting.innerHTML = '';
    const filtered = rows || [];
    
    // Status filtresini uygula
    const statusFilter = document.getElementById('f-incoming-status')?.value || '';
    
    let given = filtered.filter(r => r.hasOwnBid);
    let waiting = filtered.filter(r => !r.hasOwnBid);

    // Filtre 'pending' ise sadece bekleyenleri göster, 'responded' ise sadece yanıtlananları
    if (statusFilter === 'pending') {
      given = [];
    } else if (statusFilter === 'responded') {
      waiting = [];
    } else if (statusFilter === 'viewed') {
      // viewed durumu şimdilik pending içinde değerlendiriliyor (status=='viewed')
      given = [];
      waiting = waiting.filter(r => r.status === 'viewed');
    }

    const sectionGiven = bodyGiven?.closest('section') || bodyGiven?.parentElement?.parentElement;
    const sectionWaiting = bodyWaiting?.closest('section') || bodyWaiting?.parentElement?.parentElement;
    
    // Bölümleri göster/gizle
    const titleGiven = bodyGiven?.parentElement?.previousElementSibling || document.querySelector('.section-title:nth-of-type(1)');
    const titleWaiting = bodyWaiting?.parentElement?.previousElementSibling || document.querySelector('.section-title:nth-of-type(2)');

    if (given.length === 0) {
      if (titleGiven && titleGiven.textContent.includes('Teklif Verilenler')) titleGiven.classList.add('hidden');
      if (bodyGiven?.parentElement) bodyGiven.parentElement.classList.add('hidden');
    } else {
      if (titleGiven && titleGiven.textContent.includes('Teklif Verilenler')) titleGiven.classList.remove('hidden');
      if (bodyGiven?.parentElement) bodyGiven.parentElement.classList.remove('hidden');
    }

    if (waiting.length === 0) {
      if (titleWaiting && titleWaiting.textContent.includes('Bekleyenler')) titleWaiting.classList.add('hidden');
      if (bodyWaiting?.parentElement) bodyWaiting.parentElement.classList.add('hidden');
    } else {
      if (titleWaiting && titleWaiting.textContent.includes('Bekleyenler')) titleWaiting.classList.remove('hidden');
      if (bodyWaiting?.parentElement) bodyWaiting.parentElement.classList.remove('hidden');
    }

    if ((given.length + waiting.length) === 0) { if (emptyEl) emptyEl.classList.remove('hidden'); return; } else { if (emptyEl) emptyEl.classList.add('hidden'); }
    // Helper function to create a table row using DOM API (preserves <td> structure)
    function createIncomingRow(r) {
      const tr = document.createElement('tr');
      tr.dataset.id = r.id;
      tr.dataset.status = r.status || 'published';

      // Normalize due date
      let d = null;
      if (r.dueDate?.toDate) d = r.dueDate.toDate();
      else if (r.dueDate) d = new Date(r.dueDate);
      else if (r.deadline?.toDate) d = r.deadline.toDate();
      else if (r.deadline) d = new Date(r.deadline);
      r._dueDate = d;

      const statusText = translateStatus(r.status || 'published');
      const bidCount = typeof r._bidCount === 'number' ? r._bidCount : 0;

      // Build bid display
      let bidDisplayHTML = '';
      if (bidCount > 0) {
        if (isDarkMode()) {
          bidDisplayHTML = `<span style="background:#111827;color:#ffffff;padding:2px 6px;border:1px solid rgba(255,255,255,0.25);border-radius:4px;font-size:12px">${bidCount} teklif</span>`;
        } else {
          bidDisplayHTML = `<span style="background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:4px;font-size:12px">${bidCount} teklif</span>`;
        }
      } else {
        if (isDarkMode()) {
          bidDisplayHTML = '<span style="color:#dc2626;font-size:12px;padding:2px 6px;border:1px solid rgba(255,255,255,0.25);border-radius:4px;display:inline-block;">Henüz teklif yok</span>';
        } else {
          bidDisplayHTML = '<span style="color:#dc2626;font-size:12px">Henüz teklif yok</span>';
        }
      }

      // Teklifbul Rule v1.0 - companyName alanı yoksa yüklenen şirket ismini kullan
      const companyName = r.companyName || r.company?.name || COMPANY_CACHE.get(r.creatorCompanyId) || 'Bilinmeyen Firma';
      const fi = r._firstItem || {};
      const detailLink = (src) => {
        const baseUrl = `demand-detail.html?id=${encodeURIComponent(r.id)}&source=${src}`;
        return readonlyMode ? `${baseUrl}&readonly=true` : baseUrl;
      };

      // Helper to extract style from getSpanStyle/getTitleBlockStyle/getCompanyBadgeStyle
      function extractStyle(styleString) {
        const match = styleString.match(/style="([^"]+)"/);
        return match ? match[1] : '';
      }

      // SATFK column
      const td1 = document.createElement('td');
      const satfkSpan = document.createElement('span');
      satfkSpan.style.cssText = extractStyle(getSpanStyle(r.satfk || '-'));
      satfkSpan.textContent = DOMPurify.sanitize(r.satfk || '-', { ALLOWED_TAGS: [] });
      td1.appendChild(satfkSpan);
      tr.appendChild(td1);

      // Title column
      const td2 = document.createElement('td');
      const titleDiv = document.createElement('div');
      titleDiv.style.display = 'flex';
      titleDiv.style.alignItems = 'center';

      if (fi.imageUrl) {
        const img = document.createElement('img');
        img.src = fi.imageUrl;
        img.alt = '';
        img.style.cssText = 'width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;margin-right:8px;';
        titleDiv.appendChild(img);
      }

      const titleInner = document.createElement('div');
      const titleBlock = document.createElement('div');
      titleBlock.style.cssText = extractStyle(getTitleBlockStyle());
      titleBlock.textContent = DOMPurify.sanitize(r.title || '-', { ALLOWED_TAGS: [] });
      titleInner.appendChild(titleBlock);

      titleDiv.appendChild(titleInner);
      td2.appendChild(titleDiv);
      tr.appendChild(td2);

      // Company column (only for incoming)
      const td3 = document.createElement('td');
      const companySpan = document.createElement('span');
      companySpan.style.cssText = extractStyle(getCompanyBadgeStyle());
      companySpan.textContent = DOMPurify.sanitize(companyName, { ALLOWED_TAGS: [] });
      td3.appendChild(companySpan);
      tr.appendChild(td3);

      // Categories column
      const td4 = document.createElement('td');
      td4.className = 'td-cats';
      const catWrap = document.createElement('div');
      catWrap.className = 'cat-wrap';
      catWrap.innerHTML = renderCategoriesCell(r.categoryTags || []);
      td4.appendChild(catWrap);
      tr.appendChild(td4);

      // Date column
      const td5 = document.createElement('td');
      const dateSpan = document.createElement('span');
      const dateStr = fmtDateCell(d);
      dateSpan.style.cssText = extractStyle(getSpanStyle(dateStr));
      dateSpan.textContent = dateStr;
      td5.appendChild(dateSpan);
      tr.appendChild(td5);

      // Status column
      const td6 = document.createElement('td');
      const statusSpan = document.createElement('span');
      statusSpan.style.cssText = extractStyle(getSpanStyle(statusText));
      statusSpan.textContent = DOMPurify.sanitize(statusText, { ALLOWED_TAGS: [] });
      td6.appendChild(statusSpan);
      tr.appendChild(td6);

      // Bid count column - Teklifbul Rule v1.0 - DOMPurify (savunma derinligi)
      const td7 = document.createElement('td');
      td7.innerHTML = DOMPurify.sanitize(bidDisplayHTML, { ADD_ATTR: ['style'] });
      tr.appendChild(td7);

      // Link column
      const td8 = document.createElement('td');
      const link = document.createElement('a');
      link.href = detailLink('incoming');
      link.style.cssText = extractStyle(getLinkStyle());
      link.textContent = 'Görüntüle →';
      td8.appendChild(link);
      tr.appendChild(td8);

      return tr;
    }

    if (bodyGiven) {
      for (const r of given) {
        const tr = createIncomingRow(r);
        bodyGiven.appendChild(tr);
      }
    }
    if (bodyWaiting) {
      for (const r of waiting) {
        const tr = createIncomingRow(r);
        bodyWaiting.appendChild(tr);
      }
    }
  }

  // REFACTORED: Gelen talepler - sadece tedarikçi görür
  // Teklifbul Rule v1.2.24 - Multi-role desteği: Sadece supplier veya both rolüne sahip kullanıcılar için
  async function loadIncoming(u) {
    // CRITICAL: Prevent infinite loops by checking loading flag
    if (isLoadingIncoming) {
      logger.debug('loadIncoming already in progress, skipping');
      return;
    }

    try {
      isLoadingIncoming = true;
      // Get current user's supplier categories
      // Check multiple field names for backward compatibility
      const meDoc = await getDoc(doc(db, 'users', u.uid));
      const myData = meDoc.exists() ? meDoc.data() : {};

      // Teklifbul Rule v1.2.24 - Multi-role desteği: Kullanıcının rolleri kontrol et
      const userRoles = myData.roles || [];
      const hasSupplierRole = userRoles.includes('supplier') || userRoles.includes('both');

      if (!hasSupplierRole) {
        logger.debug("User does not have supplier role, skipping incoming demands");
        document.querySelector('#incomingEmpty')?.classList.remove('hidden');
        document.querySelector('#incomingEmpty').textContent = 'Gelen talepleri görmek için tedarikçi rolüne sahip olmalısınız. Ayarlar sayfasından rolünüzü güncelleyin.';
        return;
      }

      // CRITICAL: Get supplier categories in ID format (new system)
      // Priority: supplierCategoryIds > supplierCategoryKeys (slugs) > supplierCategories (names)
      let mySupplierCategoryTokens = [];
      if (Array.isArray(myData.supplierCategoryIds) && myData.supplierCategoryIds.length > 0) {
        mySupplierCategoryTokens = myData.supplierCategoryIds;
      } else if (Array.isArray(myData.supplierCategoryKeys) && myData.supplierCategoryKeys.length > 0) {
        mySupplierCategoryTokens = myData.supplierCategoryKeys;
      } else if (Array.isArray(myData.supplierCategories) && myData.supplierCategories.length > 0) {
        mySupplierCategoryTokens = myData.supplierCategories;
      }

      // Normalize all tokens to IDs
      const mySupplierCategoryIds = normalizeToIds(mySupplierCategoryTokens).slice(0, 10); // Firestore limit

      // Reduced logging: Only log summary
      if (mySupplierCategoryIds.length === 0) {
        logger.warn("No supplier categories found for user. Incoming demands may be empty.");
      } else {
        logger.info(`User has ${mySupplierCategoryIds.length} supplier categories (IDs)`);
      }

      if (mySupplierCategoryIds.length === 0) {
        logger.warn("Kullanıcının tedarikçi kategorisi yok, gelen talep gösterilemez");
        document.querySelector('#incomingEmpty')?.classList.remove('hidden');
        document.querySelector('#incomingEmpty').textContent = 'Tedarikçi kategorisi seçmelisiniz. Ayarlar sayfasından kategorilerinizi seçin.';
        return;
      }

      // Teklifbul Rule v1.0 - Get user's company ID (resolveSharedCompanyId helper kullan)
      function resolveSharedCompanyId(userData) {
        if (!userData) return null;
        const companyId = userData.activeCompanyId || userData.companyId || (Array.isArray(userData.companies) && userData.companies.length ? userData.companies[0] : null);
        if (companyId && typeof companyId === 'string' && companyId.trim() !== '') return companyId;
        return null;
      }
      let userCompanyId = resolveSharedCompanyId(myData);

      // Teklifbul Rule v1.0 - Eğer companyId bulunamadıysa ve companyCode varsa, companyJoinRequests'ten kontrol et
      // Bu, şirket kodunu girerek kayıt olan kullanıcılar için şirket taleplerinin görünmesini sağlar
      if (!userCompanyId && myData.companyCode) {
        try {
          const { collection: getCollection, getDocs, query: getQuery, where: getWhere } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
          const joinRequestsRef = getCollection(db, 'companyJoinRequests');
          const joinRequestsQuery = getQuery(
            joinRequestsRef,
            getWhere('userId', '==', u.uid),
            getWhere('status', 'in', ['pending', 'accepted'])
          );
          const joinRequestsSnapshot = await getDocs(joinRequestsQuery);

          if (!joinRequestsSnapshot.empty) {
            const latestRequest = joinRequestsSnapshot.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .sort((a, b) => {
                const aTime = a.createdAt?.toMillis?.() || 0;
                const bTime = b.createdAt?.toMillis?.() || 0;
                return bTime - aTime;
              })[0];

            if (latestRequest?.companyId) {
              userCompanyId = latestRequest.companyId;
              logger.info('CompanyId companyJoinRequests\'ten bulundu (incoming)', {
                companyId: userCompanyId,
                requestId: latestRequest.id,
                status: latestRequest.status
              });
            }
          }
        } catch (joinRequestError) {
          logger.warn('companyJoinRequests kontrolü sırasında hata (incoming)', joinRequestError);
        }
      }

      // Teklifbul Rule v1.0 - userCompanyId loglama (debug için)
      logger.debug('loadIncoming - userCompanyId resolved', {
        userCompanyId,
        hasCompanyCode: !!myData.companyCode,
        resolvedFrom: userCompanyId ? (myData.companyId ? 'userData.companyId' : 'companyJoinRequests') : 'none'
      });

      // Query: isPublished=true AND (supplierCategoryIds OR categoryIds OR legacy fields) hasAny AND creatorCompanyId != userCompanyId
      // Note: Published demands have status='published' or 'approved' and isPublished=true
      // CRITICAL: Try categoryIds first (new system), then fallback to legacy fields
      let snap;
      try {
        // Primary: Use categoryIds (new ID-based system)
        const incomingQ = query(
          collection(db, 'demands'),
          where('isPublished', '==', true),
          where('categoryIds', 'array-contains-any', mySupplierCategoryIds),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        snap = await getDocs(incomingQ);
        logger.debug(`Found ${snap.docs.length} published demands with categoryIds match`);
      } catch (err) {
        // Check if it's an index error
        if (err.code === 'failed-precondition') {
          logger.warn("categoryIds index not found. Using fallback", err.message);
        } else {
          logger.warn("categoryIds query failed", err.message);
        }

        // Fallback 1: Try legacy categoryTags if categoryIds query fails
        // Note: Demands use 'categoryIds', not 'supplierCategoryIds'
        // supplierCategoryIds is a field on users collection, not demands
        try {
          // Convert category IDs to slugs for legacy matching
          const allCategories = getAllCategories();
          const legacySlugs = mySupplierCategoryIds.map(id => {
            const cat = allCategories.find(c => c.id === id);
            return cat ? cat.slug : null;
          }).filter(Boolean);

          if (legacySlugs.length > 0) {
            const incomingQ = query(
              collection(db, 'demands'),
              where('isPublished', '==', true),
              where('categoryTags', 'array-contains-any', legacySlugs.slice(0, 10)),
              orderBy('createdAt', 'desc'),
              limit(50)
            );
            snap = await getDocs(incomingQ);
            logger.debug(`Found ${snap.docs.length} published demands with categoryTags match (fallback)`);
          } else {
            throw new Error('No legacy slugs available');
          }
        } catch (err2) {
          // All query attempts failed
          logger.error("All category query attempts failed", err2.message);
          if (err2.code === 'failed-precondition') {
            logger.error("Firestore index required. Please:");
            logger.error("   1. Click the link in the error message above to create the index manually");
            logger.error("   2. Or run: firebase deploy --only firestore:indexes");
            logger.error("   3. Wait a few minutes for the index to build, then refresh the page.");
          }
          snap = { docs: [] };
        }
      }

      // Filter out own company's demands and log category matching
      const rows = snap.docs
        .map(d => {
          const data = d.data();
          // Match categories silently (no per-demand logging)
          return { id: d.id, ...data };
        })
        .filter(d => {
          // Kendi şirketinin taleplerini gösterme (silent filter)
          if (d.creatorCompanyId && userCompanyId && d.creatorCompanyId === userCompanyId) {
            logger.debug('Filtered out own company demand', {
              demandId: d.id,
              satfk: d.satfk,
              creatorCompanyId: d.creatorCompanyId,
              userCompanyId
            });
            return false;
          }
          return true;
        });

      logger.debug(`Processed ${rows.length} incoming demands`, {
        total: snap.docs.length,
        filtered: snap.docs.length - rows.length,
        userCompanyId,
        hasUserCompanyId: !!userCompanyId
      });

      // DEBUG: Show sample demand categories for comparison - Teklifbul Rule v1.2.20
      if (snap.docs.length > 0 && rows.length === 0) {
        logger.warn("WARNING: Published demands exist but none match user categories!");
        logger.debug("Sample demand categories from database");
        snap.docs.slice(0, 3).forEach(d => {
          const data = d.data();
          const demandCats = data.supplierCategoryKeys || data.categoryTags || [];
          // Teklifbul Rule v1.2.20 - mySupplierCatKeys yerine mySupplierCategoryTokens kullan
          const userCats = mySupplierCategoryTokens || [];
          logger.debug(`Demand ${d.id}`, {
            supplierCategoryKeys: demandCats,
            hasMatch: demandCats.some(cat => userCats.includes(cat)),
            userCompanyId: userCompanyId,
            creatorCompanyId: data.creatorCompanyId,
            userCategories: userCats
          });
        });
      }

      // OPTIMIZED: Load bid counts in batch (single query instead of N queries)
      // Fetch all bids for all demands at once, then map to demands
      const demandIds = rows.map(r => r.id);
      const bidCountsMap = new Map();
      const ownBidMap = new Map();

      // Teklifbul Rule v1.0 - userCompanyId'yi tekrar resolve et (şirket bazlı kontrol için)
      let userCompanyIdForBids = resolveSharedCompanyId(myData);
      logger.debug('loadIncoming - userCompanyIdForBids ilk resolve', {
        userCompanyIdForBids,
        hasCompanyCode: !!myData.companyCode,
        userId: u.uid
      });

      if (!userCompanyIdForBids && myData.companyCode) {
        try {
          const { collection: getCollection, getDocs, query: getQuery, where: getWhere } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
          const joinRequestsRef = getCollection(db, 'companyJoinRequests');
          const joinRequestsQuery = getQuery(
            joinRequestsRef,
            getWhere('userId', '==', u.uid),
            getWhere('status', 'in', ['pending', 'accepted'])
          );
          const joinRequestsSnapshot = await getDocs(joinRequestsQuery);

          logger.info('loadIncoming - companyJoinRequests sorgusu', {
            userId: u.uid,
            foundRequests: joinRequestsSnapshot.docs.length
          });

          if (!joinRequestsSnapshot.empty) {
            const latestRequest = joinRequestsSnapshot.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .sort((a, b) => {
                const aTime = a.createdAt?.toMillis?.() || 0;
                const bTime = b.createdAt?.toMillis?.() || 0;
                return bTime - aTime;
              })[0];

            if (latestRequest?.companyId) {
              userCompanyIdForBids = latestRequest.companyId;
              logger.debug('loadIncoming - userCompanyIdForBids companyJoinRequests\'ten resolve edildi', {
                userCompanyIdForBids,
                requestId: latestRequest.id,
                status: latestRequest.status
              });
            }
          }
        } catch (joinRequestError) {
          logger.warn('companyJoinRequests kontrolü sırasında hata (bids)', joinRequestError);
        }
      }

      logger.debug('loadIncoming - userCompanyIdForBids final', { userCompanyIdForBids, userId: u.uid });

      // Teklifbul Rule v1.0 - supplierCompanyId eksik olan bid'ler için supplier kullanıcılarının companyId'lerini tutacak map
      // Bu map hem ilk sorguda hem batch sorgularında kullanılacak
      const supplierCompanyMap = new Map();

      if (demandIds.length > 0) {
        try {
          // Batch query: get all bids for these demands in one query
          const bidsQuery = query(
            collection(db, 'bids'),
            where('demandId', 'in', demandIds.slice(0, 10)) // Firestore 'in' limit is 10
          );
          const allBidsSnap = await getDocs(bidsQuery);

          // Teklifbul Rule v1.0 - Debug log: teklif sorgusu sonuçları
          logger.debug('loadIncoming - teklif sorgusu sonuçları', {
            demandIdsCount: demandIds.length,
            queriedDemandIds: demandIds.slice(0, 10),
            bidsFound: allBidsSnap.docs.length,
            userCompanyIdForBids,
            userId: u.uid
          });

          // Count bids per demand
          // Teklifbul Rule v1.0 - supplierCompanyId eksik olan bid'ler için supplier kullanıcılarının companyId'lerini topla
          const supplierIdsToCheck = new Set();
          allBidsSnap.docs.forEach(bidDoc => {
            const bidData = bidDoc.data();
            // Eğer supplierCompanyId yoksa, supplierId'den şirket ID'sini bulmak için topla
            if (!bidData.supplierCompanyId && bidData.supplierId) {
              supplierIdsToCheck.add(bidData.supplierId);
            }
          });

          // Supplier kullanıcılarının companyId'lerini batch olarak yükle (getDoc ile paralel)
          if (supplierIdsToCheck.size > 0) {
            try {
              const supplierIdsArray = Array.from(supplierIdsToCheck);
              // Her supplier ID için getDoc kullan (paralel)
              const supplierDocPromises = supplierIdsArray.map(supplierId =>
                getDoc(doc(db, 'users', supplierId)).catch(e => {
                  logger.warn('Supplier user yüklenemedi', { supplierId, error: e });
                  return null;
                })
              );
              const supplierDocs = await Promise.all(supplierDocPromises);

              supplierDocs.forEach((userDoc, index) => {
                if (userDoc && userDoc.exists()) {
                  const userData = userDoc.data();
                  // Resolve company ID (aynı mantık)
                  function resolveSharedCompanyId(uData) {
                    if (!uData) return null;
                    const cId = uData.activeCompanyId || uData.companyId || (Array.isArray(uData.companies) && uData.companies.length ? uData.companies[0] : null);
                    if (cId && typeof cId === 'string' && cId.trim() !== '') return cId;
                    return null;
                  }
                  const resolvedCompanyId = resolveSharedCompanyId(userData);
                  if (resolvedCompanyId) {
                    supplierCompanyMap.set(supplierIdsArray[index], resolvedCompanyId);
                  }
                }
              });

              logger.debug('loadIncoming - supplier companyId\'leri yüklendi', {
                supplierCount: supplierIdsToCheck.size,
                resolvedCount: supplierCompanyMap.size
              });
            } catch (e) {
              logger.warn('Supplier companyId yükleme hatası', e);
            }
          }

          allBidsSnap.docs.forEach(bidDoc => {
            const bidData = bidDoc.data();
            const dId = bidData.demandId;
            bidCountsMap.set(dId, (bidCountsMap.get(dId) || 0) + 1);

            // Teklifbul Rule v1.0 - supplierCompanyId yoksa, supplierId'den resolve et
            let bidSupplierCompanyId = bidData.supplierCompanyId;
            if (!bidSupplierCompanyId && bidData.supplierId) {
              bidSupplierCompanyId = supplierCompanyMap.get(bidData.supplierId);
            }

            // Teklifbul Rule v1.0 - Debug: Her bid için detaylı log
            logger.debug('loadIncoming - bid kontrolü', {
              demandId: dId,
              bidId: bidDoc.id,
              supplierId: bidData.supplierId,
              supplierCompanyId: bidData.supplierCompanyId,
              resolvedSupplierCompanyId: bidSupplierCompanyId,
              userCompanyIdForBids,
              userId: u.uid,
              isUserBid: bidData.supplierId === u.uid,
              isCompanyBid: userCompanyIdForBids && bidSupplierCompanyId === userCompanyIdForBids
            });

            // Teklifbul Rule v1.0 - Check if user or user's company has bid
            // Kullanıcı bazlı kontrol
            if (bidData.supplierId === u.uid) {
              ownBidMap.set(dId, true);
              logger.debug('loadIncoming - kullanıcı teklifi bulundu', {
                demandId: dId,
                bidId: bidDoc.id,
                supplierId: bidData.supplierId,
                supplierCompanyId: bidData.supplierCompanyId,
                resolvedSupplierCompanyId: bidSupplierCompanyId
              });
            }
            // Şirket bazlı kontrol (aynı şirketteki başka bir kullanıcı teklif vermişse)
            else if (userCompanyIdForBids && bidSupplierCompanyId === userCompanyIdForBids) {
              ownBidMap.set(dId, true);
              logger.debug('loadIncoming - şirket teklifi bulundu', {
                demandId: dId,
                bidId: bidDoc.id,
                supplierId: bidData.supplierId,
                supplierCompanyId: bidData.supplierCompanyId,
                resolvedSupplierCompanyId: bidSupplierCompanyId,
                userCompanyIdForBids
              });
            }
          });

          // If more than 10 demands, query remaining in batches
          if (demandIds.length > 10) {
            for (let i = 10; i < demandIds.length; i += 10) {
              const batch = demandIds.slice(i, i + 10);
              try {
                const batchQuery = query(
                  collection(db, 'bids'),
                  where('demandId', 'in', batch)
                );
                const batchSnap = await getDocs(batchQuery);

                // Teklifbul Rule v1.0 - Batch'teki bid'ler için supplier ID'leri topla
                const batchSupplierIdsToCheck = new Set();
                batchSnap.docs.forEach(bidDoc => {
                  const bidData = bidDoc.data();
                  if (!bidData.supplierCompanyId && bidData.supplierId && !supplierCompanyMap.has(bidData.supplierId)) {
                    batchSupplierIdsToCheck.add(bidData.supplierId);
                  }
                });

                // Batch supplier'ların companyId'lerini yükle
                if (batchSupplierIdsToCheck.size > 0) {
                  try {
                    const batchSupplierIdsArray = Array.from(batchSupplierIdsToCheck);
                    const batchSupplierDocPromises = batchSupplierIdsArray.map(supplierId =>
                      getDoc(doc(db, 'users', supplierId)).catch(e => {
                        logger.warn('Batch supplier user yüklenemedi', { supplierId, error: e });
                        return null;
                      })
                    );
                    const batchSupplierDocs = await Promise.all(batchSupplierDocPromises);

                    batchSupplierDocs.forEach((userDoc, index) => {
                      if (userDoc && userDoc.exists()) {
                        const userData = userDoc.data();
                        function resolveSharedCompanyId(uData) {
                          if (!uData) return null;
                          const cId = uData.activeCompanyId || uData.companyId || (Array.isArray(uData.companies) && uData.companies.length ? uData.companies[0] : null);
                          if (cId && typeof cId === 'string' && cId.trim() !== '') return cId;
                          return null;
                        }
                        const resolvedCompanyId = resolveSharedCompanyId(userData);
                        if (resolvedCompanyId) {
                          supplierCompanyMap.set(batchSupplierIdsArray[index], resolvedCompanyId);
                        }
                      }
                    });
                  } catch (e) {
                    logger.warn('Batch supplier companyId yükleme hatası', e);
                  }
                }

                batchSnap.docs.forEach(bidDoc => {
                  const bidData = bidDoc.data();
                  const dId = bidData.demandId;

                  bidCountsMap.set(dId, (bidCountsMap.get(dId) || 0) + 1);

                  // Teklifbul Rule v1.0 - supplierCompanyId yoksa, supplierId'den resolve et
                  let bidSupplierCompanyId = bidData.supplierCompanyId;
                  if (!bidSupplierCompanyId && bidData.supplierId) {
                    bidSupplierCompanyId = supplierCompanyMap.get(bidData.supplierId);
                  }

                  // Teklifbul Rule v1.0 - Check if user or user's company has bid
                  if (bidData.supplierId === u.uid) {
                    ownBidMap.set(dId, true);
                    logger.debug('loadIncoming - batch: kullanıcı teklifi bulundu', {
                      demandId: dId,
                      bidId: bidDoc.id,
                      supplierId: bidData.supplierId,
                      supplierCompanyId: bidData.supplierCompanyId,
                      resolvedSupplierCompanyId: bidSupplierCompanyId
                    });
                  } else if (userCompanyIdForBids && bidSupplierCompanyId === userCompanyIdForBids) {
                    ownBidMap.set(dId, true);
                    logger.debug('loadIncoming - batch: şirket teklifi bulundu', {
                      demandId: dId,
                      bidId: bidDoc.id,
                      supplierId: bidData.supplierId,
                      supplierCompanyId: bidData.supplierCompanyId,
                      resolvedSupplierCompanyId: bidSupplierCompanyId,
                      userCompanyIdForBids
                    });
                  }
                });
              } catch (e) { logger.warn('Batch bid query error', e); }
            }
          }
        } catch (e) {
          logger.warn('Bulk bid query failed, using fallback', e);
        }
      }

      // Apply bid counts and own bid flags
      rows.forEach(r => {
        r._bidCount = bidCountsMap.get(r.id) || 0;
        r.hasOwnBid = ownBidMap.has(r.id) || false;
      });

      // Teklifbul Rule v1.0 - Debug log: hasOwnBid durumunu kontrol et
      const givenCount = rows.filter(r => r.hasOwnBid).length;
      const waitingCount = rows.filter(r => !r.hasOwnBid).length;

      logger.debug('loadIncoming - hasOwnBid durumu', {
        total: rows.length,
        given: givenCount,
        waiting: waitingCount,
        userCompanyIdForBids,
        userId: u.uid,
        ownBidMapSize: ownBidMap.size,
        bidCountsMapSize: bidCountsMap.size
      });

      await loadFirstItemMeta(rows);

      INCOMING_ALL_ROWS = rows;

      // Apply incoming status filter if set
      await applyIncomingFilters();

      logger.info(`Incoming demands loaded`, { total: rows.length, rendered: INCOMING_ALL_ROWS.length });
    } catch (err) {
      logger.error('incoming load error', err);
      showIndexHint(err);

      // Show detailed error information (Teklifbul Rule v1.0)
      const emptyEl = document.querySelector('#incomingEmpty');
      if (emptyEl) {
        emptyEl.classList.remove('hidden');
        // Teklifbul Rule v1.0 - XSS Protection
        const safeErrorMessage = DOMPurify.sanitize(err?.message || String(err) || '', { ALLOWED_TAGS: [] });
        emptyEl.innerHTML = DOMPurify.sanitize(`<div style="padding: 20px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px;"><h4 style="margin-top: 0; color: #92400e;">Gelen talepler yüklenemedi</h4><p><strong>Hata:</strong> ${safeErrorMessage}</p><p>Lütfen aşağıdaki kontrol listesini inceleyin:</p><ul style="text-align: left;"><li>İnternet bağlantınızı kontrol edin</li><li>Firebase authentication'ın doğru çalıştığından emin olun</li><li>Şirket bilgilerinizin doğru ayarlandığından emin olun</li><li>Tedarikçi kategorilerinizin seçili olduğundan emin olun (Ayarlar → Tedarikçi Kategorileri)</li><li>Firestore güvenlik kurallarının doğru yapılandırıldığından emin olun</li></ul><p><a href="./settings.html" style="color: #3b82f6;" class="settings-link">Ayarlar sayfasına git →</a></p></div>`, {
          ALLOWED_TAGS: ['div', 'h4', 'p', 'strong', 'ul', 'li', 'a'],
          ALLOWED_ATTR: ['style', 'href', 'class']
        });
      }
    } finally {
      isLoadingIncoming = false;
    }
  }

  // Supplier Talep Havuzu (routingMode='pool') - supplier-only
  async function loadPool(u, { force = false } = {}) {
    if (isLoadingPool) return;
    isLoadingPool = true;
    try {
      const tabBtn = document.getElementById('tabPool');
      const poolEmpty = document.getElementById('poolEmpty');
      const poolRows = document.getElementById('poolRows');
      if (poolRows) poolRows.innerHTML = '';

      const meDoc = await getDoc(doc(db, 'users', u.uid));
      const myData = meDoc.exists() ? meDoc.data() : {};
      const userRoles = myData.roles || [];
      const hasSupplierRole = userRoles.includes('supplier') || userRoles.includes('both');
      if (!hasSupplierRole) {
        // Teklifbul Rule v1.0 - Tab zaten başlangıçta gizli, sadece boş mesaj göster
        if (tabBtn) tabBtn.classList.add('hidden');
        if (poolEmpty) {
          poolEmpty.classList.remove('hidden');
          poolEmpty.textContent = 'Talep havuzunu görmek için tedarikçi rolüne sahip olmalısınız.';
        }
        isLoadingPool = false;
        return;
      }

      // Teklifbul Rule v1.0 - Tab zaten görünür yapılmış olmalı (sayfa yüklenirken)
      // Ancak yine de kontrol edip görünür yap (defensive programming)
      if (tabBtn) tabBtn.classList.remove('hidden');

      // Supplier categories (ID only)
      let myTokens = [];
      if (Array.isArray(myData.supplierCategoryIds) && myData.supplierCategoryIds.length) myTokens = myData.supplierCategoryIds;
      else if (Array.isArray(myData.supplierCategoryKeys) && myData.supplierCategoryKeys.length) myTokens = myData.supplierCategoryKeys;
      else if (Array.isArray(myData.supplierCategories) && myData.supplierCategories.length) myTokens = myData.supplierCategories;
      const mySupplierCategoryIds = normalizeToIds(myTokens);
      if (!mySupplierCategoryIds.length) {
        if (poolEmpty) {
          poolEmpty.classList.remove('hidden');
          poolEmpty.innerHTML = DOMPurify.sanitize(
            `Tedarikçi kategoriniz yok. Ayarlardan kategori seçin: <a href="./settings.html" style="color:#3b82f6;">Ayarlar →</a>`,
            { ALLOWED_TAGS: ['a'], ALLOWED_ATTR: ['href', 'style'] }
          );
        }
        return;
      }

      const batches = chunkArray(mySupplierCategoryIds, 10);
      const cacheKey = mySupplierCategoryIds.slice().sort().join('|');
      const now = Date.now();
      if (!force && POOL_CACHE.key === cacheKey && POOL_CACHE.rows && (now - POOL_CACHE.ts) < POOL_CACHE_TTL_MS) {
        logger.debug('Pool list served from memory cache', { ageMs: now - POOL_CACHE.ts, count: POOL_CACHE.rows.length });
      } else {
        const demandMap = new Map(); // demandId -> demandData
        for (const batch of batches) {
          try {
            // Primary query (requires composite index):
            // routingMode == pool AND isPublished == true AND derivedCategoryIds array-contains-any AND orderBy createdAt desc
            const q = query(
              collection(db, 'demands'),
              where('routingMode', '==', 'pool'),
              where('isPublished', '==', true),
              where('derivedCategoryIds', 'array-contains-any', batch),
              orderBy('createdAt', 'desc'),
              limit(100)
            );
            const snap = await getDocs(q);
            snap.docs.forEach(d => {
              demandMap.set(d.id, { id: d.id, ...d.data() });
            });
          } catch (e) {
            // Fallback: try without orderBy to reduce index strictness; still client-sort by createdAt
            logger.warn('Pool query failed (maybe missing index). Falling back to unordered query', e);
            try {
              const q2 = query(
                collection(db, 'demands'),
                where('routingMode', '==', 'pool'),
                where('isPublished', '==', true),
                where('derivedCategoryIds', 'array-contains-any', batch),
                limit(100)
              );
              const snap2 = await getDocs(q2);
              snap2.docs.forEach(d => {
                demandMap.set(d.id, { id: d.id, ...d.data() });
              });
            } catch (e2) {
              logger.warn('Pool fallback query also failed', e2);
              if (poolEmpty) {
                poolEmpty.classList.remove('hidden');
                poolEmpty.textContent = 'Talep havuzu yüklenemedi (Firestore index gerekebilir). Konsoldaki "Create index" linkini oluşturup tekrar deneyin.';
              }
              return;
            }
          }
        }
        const computedRows = Array.from(demandMap.values());
        POOL_CACHE.key = cacheKey;
        POOL_CACHE.ts = now;
        POOL_CACHE.rows = computedRows;
      }

      const rows = Array.isArray(POOL_CACHE.rows) ? POOL_CACHE.rows : [];
      // Sort createdAt desc
      rows.sort((a, b) => {
        const ad = a?.createdAt?.toDate?.() || (a?.createdAt ? new Date(a.createdAt) : null);
        const bd = b?.createdAt?.toDate?.() || (b?.createdAt ? new Date(b.createdAt) : null);
        return (bd?.getTime?.() || 0) - (ad?.getTime?.() || 0);
      });

      if (!rows.length) {
        if (poolEmpty) poolEmpty.classList.remove('hidden');
        return;
      }
      if (poolEmpty) poolEmpty.classList.add('hidden');

      const mySet = new Set(mySupplierCategoryIds);
      rows.forEach(r => {
        const tr = document.createElement('tr');
        const created = r?.createdAt?.toDate?.() || (r?.createdAt ? new Date(r.createdAt) : null);
        const dateStr = created ? created.toLocaleDateString('tr-TR') : '-';
        const derived = Array.isArray(r.derivedCategoryIds) ? r.derivedCategoryIds.filter(Boolean) : [];
        const inter = derived.filter(id => mySet.has(id));
        const interNames = inter.map(id => getNameById(id)).filter(Boolean);
        const buyerCompany = r.companyName || r.company?.name || r.creatorCompanyName || '—';

        const reasonKey = r.routingReason || '';
        const reasonLabel = reasonKey === 'max_recipients' ? 'Spam önleme' : 'Havuz modu';
        const cand = (typeof r.routingCandidateCount === 'number' && Number.isFinite(r.routingCandidateCount)) ? r.routingCandidateCount : '?';
        const lim = (typeof r.routingMaxRecipients === 'number' && Number.isFinite(r.routingMaxRecipients)) ? r.routingMaxRecipients : 200;
        const poolReasonText = `Havuz: ${reasonLabel} (aday: ${cand}, limit: ${lim})`;

        const safeSatfk = DOMPurify.sanitize(r.satfk || '-', { ALLOWED_TAGS: [] });
        const safeTitle = DOMPurify.sanitize(r.title || '-', { ALLOWED_TAGS: [] });
        const safeBuyer = DOMPurify.sanitize(buyerCompany || '—', { ALLOWED_TAGS: [] });
        const chips = interNames.slice(0, 6).map(n => `<span class="cat-chip">${DOMPurify.sanitize(n, { ALLOWED_TAGS: [] })}</span>`).join(' ')
          + (interNames.length > 6 ? ` <span class="cat-chip">+${interNames.length - 6}</span>` : '');
        const link = `./demand-detail.html?id=${encodeURIComponent(r.id)}&source=pool${readonlyMode ? '&readonly=true' : ''}`;

        tr.innerHTML = DOMPurify.sanitize(
          `<td><span>${safeSatfk}</span></td>
           <td>
             <div style="font-weight:700;">${safeTitle}</div>
             <div style="margin-top:4px; font-size:12px; color:#6b7280;">${DOMPurify.sanitize(poolReasonText, { ALLOWED_TAGS: [] })}</div>
           </td>
           <td>${safeBuyer}</td>
           <td class="td-cats">${chips || '-'}</td>
           <td>${dateStr}</td>
           <td><a href="${link}" style="color:#3b82f6; font-weight:600;">Görüntüle →</a></td>`,
          { ALLOWED_TAGS: ['td', 'span', 'a', 'div'], ALLOWED_ATTR: ['href', 'style', 'class'] }
        );
        poolRows.appendChild(tr);
      });
    } finally {
      isLoadingPool = false;
    }
  }
  // REFACTORED: Filtreler kaldırıldı - sadece 3 basit sorgu kullanılıyor

  // Hata mesajı index için
  function showIndexHint(err) {
    const emptyEl = document.querySelector('#incomingEmpty');
    if (emptyEl) {
      if (String(err.message || err).includes('index')) {
        emptyEl.textContent = 'Firestore dizini hazırlanıyor. Konsoldaki "Create index" linkine tıklayıp Ready olunca sayfayı yenileyin.';
      } else {
        emptyEl.textContent = 'Gelen talepler yüklenemedi.';
      }
      emptyEl.classList.remove('hidden');
    }
  }

  // REFACTORED: Giden talepler - kullanıcının şirketi yazarı, published
  // Teklifbul Rule v1.2.25 - Yönetim kadrosu ve satın alma rolleri kontrolü
  // Helper function: Check if user can view outgoing demands - Teklifbul Rule v1.2.25
  function canViewOutgoingDemands(userData) {
    // Yönetim kadrosu rolleri
    const managementRoles = [
      'buyer:genel_mudur',
      'buyer:genel_mudur_yardimcisi',
      'buyer:ceo',
      'buyer:isveren',
      'buyer:yonetim_kurulu_baskani',
      'buyer:yonetim_kurulu_uyesi'
    ];

    // Satın alma rolleri
    const purchasingRoles = [
      'buyer:satinalma_uzman_yardimcisi',
      'buyer:satinalma_uzmani',
      'buyer:satinalma_muduru',
      'buyer:satinalma_yetkilisi'
    ];

    // Kullanıcının rolleri
    const userRoles = userData.roles || [];
    const hasBuyerRole = userRoles.includes('buyer') || userRoles.includes('both');

    // Kullanıcının companyRoleKey, companyRole veya requestedCompanyRole
    const userRoleKey = userData.companyRoleKey || userData.companyRole || userData.requestedCompanyRole || '';
    const userRoleSimple = userRoleKey.split(':')[1] || userRoleKey;

    // Yönetim kadrosu kontrolü
    const isManagement = managementRoles.includes(userRoleKey) ||
      managementRoles.some(r => r.split(':')[1] === userRoleSimple);

    // Satın alma rolleri kontrolü
    const isPurchasing = purchasingRoles.includes(userRoleKey) ||
      purchasingRoles.some(r => r.split(':')[1] === userRoleSimple);

    // Eğer buyer rolü varsa veya yönetim/satın alma rollerinden biri varsa görebilir
    return hasBuyerRole || isManagement || isPurchasing;
  }

  async function loadOutgoing(u) {
    // CRITICAL: Prevent infinite loops by checking loading flag
    if (isLoadingOutgoing) {
      logger.debug('loadOutgoing already in progress, skipping');
      return;
    }

    try {
      isLoadingOutgoing = true;
      outgoingRowsCache = [];
      // Get user's company ID
      const userDoc = await getDoc(doc(db, 'users', u.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};

      // Teklifbul Rule v1.2.25 - Yönetim kadrosu ve satın alma rolleri kontrolü
      if (!canViewOutgoingDemands(userData)) {
        logger.info("User does not have required role to view outgoing demands");
        document.querySelector('#outgoingEmpty')?.classList.remove('hidden');
        document.querySelector('#outgoingEmpty').textContent = 'Giden talepleri görmek için yönetim kadrosu veya satın alma rolüne sahip olmalısınız. (Genel Müdür, Satın Alma Müdürü, Satın Alma Yetkilisi, vb.)';
        updateMergedTable();
        return;
      }

      // Teklifbul Rule v1.0 - Get user's company ID (resolveSharedCompanyId helper kullan)
      function resolveSharedCompanyId(uData) {
        if (!uData) return null;
        const cId = uData.activeCompanyId || uData.companyId || (Array.isArray(uData.companies) && uData.companies.length ? uData.companies[0] : null);
        if (cId && typeof cId === 'string' && cId.trim() !== '') return cId;
        return null;
      }
      let userCompanyId = resolveSharedCompanyId(userData);

      // Teklifbul Rule v1.0 - Eğer companyId bulunamadıysa veya geçersizse (solo-/tax-), companies array'inden geçerli bir companyId ara
      // Teklifbul Rule v1.x - Tüm geçerli companyId'ler (tax-/solo- dahil) kabul edilir
      const isInvalidCompanyId = !userCompanyId;
      if (isInvalidCompanyId && Array.isArray(userData?.companies) && userData.companies.length > 0) {
        // companies array'inde geçerli bir companyId ara (herhangi bir string)
        const validCId = userData.companies.find(cid => typeof cid === 'string' && cid.trim() !== '');
        if (validCId) {
          userCompanyId = validCId;
        }
      }

      // Teklifbul Rule v1.0 - tax- ile başlayan companyId için Firestore'da şirket dokümanı var mı kontrol et
      // Eğer tax- ile başlayan bir ID varsa ve Firestore'da bu ID'ye sahip bir şirket dokümanı varsa, geçerli kabul et
      if (userCompanyId && userCompanyId.startsWith('tax-')) {
        try {
          const companyDoc = await getDoc(doc(db, 'companies', userCompanyId));
          if (companyDoc.exists()) {
            logger.info('tax- ile başlayan companyId Firestore\'da mevcut, geçerli kabul ediliyor (outgoing)', {
              companyId: userCompanyId
            });
            // tax- ile başlayan ID geçerli, devam et
          } else {
            logger.warn('tax- ile başlayan companyId Firestore\'da bulunamadı (outgoing)', {
              companyId: userCompanyId
            });
            // Firestore'da yoksa, companyJoinRequests'ten kontrol et
            userCompanyId = null;
          }
        } catch (taxCheckError) {
          logger.warn('tax- companyId kontrolü sırasında hata (outgoing)', taxCheckError);
          userCompanyId = null;
        }
      }

      // Teklifbul Rule v1.0 - Hala geçersizse, companyJoinRequests'ten kontrol et
      // Bu, şirket kodunu girerek kayıt olan kullanıcılar için şirket taleplerinin görünmesini sağlar
      const stillInvalid = !userCompanyId || userCompanyId.startsWith('solo-');
      if (stillInvalid) {
        try {
          const { collection: getCollection, getDocs, query: getQuery, where: getWhere } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
          const joinRequestsRef = getCollection(db, 'companyJoinRequests');
          const joinRequestsQuery = getQuery(
            joinRequestsRef,
            getWhere('userId', '==', u.uid),
            getWhere('status', 'in', ['pending', 'accepted'])
          );
          const joinRequestsSnapshot = await getDocs(joinRequestsQuery);

          logger.info('companyJoinRequests kontrol ediliyor (outgoing)', {
            requestCount: joinRequestsSnapshot.size,
            userId: u.uid
          });

          if (!joinRequestsSnapshot.empty) {
            const latestRequest = joinRequestsSnapshot.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .sort((a, b) => {
                const aTime = a.createdAt?.toMillis?.() || 0;
                const bTime = b.createdAt?.toMillis?.() || 0;
                return bTime - aTime;
              })[0];

            if (latestRequest?.companyId) {
              userCompanyId = latestRequest.companyId;
              logger.info('CompanyId companyJoinRequests\'ten bulundu (outgoing)', {
                companyId: userCompanyId,
                requestId: latestRequest.id,
                status: latestRequest.status
              });
            } else {
              logger.warn('companyJoinRequests\'te companyId yok (outgoing)', {
                requestId: latestRequest.id,
                requestData: latestRequest
              });
            }
          } else {
            logger.info('companyJoinRequests boş (outgoing)', { userId: u.uid });
          }
        } catch (joinRequestError) {
          logger.warn('companyJoinRequests kontrolü sırasında hata (outgoing)', joinRequestError);
        }
      }

      // Final check: solo- ile başlayanlar geçersiz, tax- ile başlayanlar Firestore'da varsa geçerli
      if (!userCompanyId || userCompanyId.startsWith('solo-')) {
        logger.warn("Kullanıcının geçerli companyId yok", { userCompanyId });
        document.querySelector('#outgoingEmpty')?.classList.remove('hidden');
        document.querySelector('#outgoingEmpty').textContent = 'Şirket bilgisi bulunamadı.';
        return;
      }

      // tax- ile başlayan ID'ler için Firestore kontrolü yapıldı (yukarıda), geçerli ise devam et

      // Query: creatorCompanyId == userCompanyId AND isPublished == true
      // Note: Published demands have status='published' and isPublished=true
      const outgoingQ = query(
        collection(db, 'demands'),
        where('creatorCompanyId', '==', userCompanyId),
        where('isPublished', '==', true),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      const snap = await getDocs(outgoingQ);
      let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Teklifbul Rule v1.0 - Legacy fallback:
      // Some older demands may be linked by createdBy but missing creatorCompanyId.
      if (rows.length === 0 && u?.uid) {
        try {
          const fallbackQ = query(
            collection(db, 'demands'),
            where('createdBy', '==', u.uid),
            where('isPublished', '==', true),
            orderBy('createdAt', 'desc'),
            limit(50)
          );
          const fallbackSnap = await getDocs(fallbackQ);
          rows = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          logger.info('Outgoing legacy fallback by createdBy applied', { count: rows.length, uid: u.uid });
        } catch (fallbackErr) {
          logger.warn('Outgoing legacy fallback query failed', fallbackErr);
        }
      }

      // OPTIMIZED: Load bid counts in batch
      const demandIds = rows.map(r => r.id);
      const bidCountsMap = new Map();

      if (demandIds.length > 0) {
        try {
          // Batch query bids for all demands
          for (let i = 0; i < demandIds.length; i += 10) {
            const batch = demandIds.slice(i, i + 10);
            const bidsQuery = query(
              collection(db, 'bids'),
              where('demandId', 'in', batch)
            );
            const bidsSnap = await getDocs(bidsQuery);
            bidsSnap.docs.forEach(bidDoc => {
              const dId = bidDoc.data().demandId;
              bidCountsMap.set(dId, (bidCountsMap.get(dId) || 0) + 1);
            });
          }
        } catch (e) {
          logger.warn('Outgoing bid count query failed', e);
        }
      }

      // Apply bid counts
      rows.forEach(r => {
        r._bidCount = bidCountsMap.get(r.id) || 0;
      });

      logger.debug(`Loaded ${rows.length} published outgoing demands`);
      await loadFirstItemMeta(rows);
      await render(rows, '#outgoingRows', '#outgoingEmpty');
      outgoingRowsCache = rows;
      updateMergedTable();
    } catch (err) {
      outgoingRowsCache = [];
      updateMergedTable();
      logger.error('outgoing load error', err);
      const emptyEl = document.querySelector('#outgoingEmpty');
      if (emptyEl) {
        if (String(err.message || err).includes('index')) {
          emptyEl.textContent = 'Firestore dizini hazırlanıyor. Konsoldaki "Create index" linkine tıklayıp Ready olunca sayfayı yenileyin.';
        } else {
          // Show detailed error information
          // Teklifbul Rule v1.0 - XSS Protection
          const safeErrorMessage = DOMPurify.sanitize(err.message || String(err) || '', { ALLOWED_TAGS: [] });
          emptyEl.innerHTML = DOMPurify.sanitize(`<div style="padding: 20px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px;"><h4 style="margin-top: 0; color: #92400e;">Giden talepler yüklenemedi</h4><p><strong>Hata:</strong> ${safeErrorMessage}</p><p>Lütfen aşağıdaki kontrol listesini inceleyin:</p><ul style="text-align: left;"><li>İnternet bağlantınızı kontrol edin</li><li>Firebase authentication'ın doğru çalıştığından emin olun</li><li>Şirket bilgilerinizin doğru ayarlandığından emin olun</li><li>Firestore güvenlik kurallarının doğru yapılandırıldığından emin olun</li></ul><p><a href="./settings.html" style="color: #3b82f6;" class="settings-link">Ayarlar sayfasına git →</a></p></div>`, {
            ALLOWED_TAGS: ['div', 'h4', 'p', 'strong', 'ul', 'li', 'a'],
            ALLOWED_ATTR: ['style', 'href', 'class']
          });
        }
        emptyEl.classList.remove('hidden');
      }
    } finally {
      isLoadingOutgoing = false;
    }
  }

  // REFACTORED: Taslak talepler - kullanıcının şirketi yazarı, draft veya withdrawn
  // Teklifbul Rule v1.2.24 - Multi-role desteği: Sadece buyer veya both rolüne sahip kullanıcılar için
  async function loadDraftPaged(u, { append = false } = {}) {
    if (isLoadingDrafts) return;

    try {
      isLoadingDrafts = true;
      logger.info("Loading draft demands for user", { uid: u.uid, append });

      // İlk yüklemede listeyi sıfırla
      if (!append) {
        accumulatedDrafts = [];
        lastDraftDoc = null;
        draftsFinished = false;
      }

      // Get user's company ID
      const userDoc = await getDoc(doc(db, 'users', u.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};

      // Teklifbul Rule v1.2.24 - Multi-role desteği: Kullanıcının rolleri kontrol et
      const userRoles = userData.roles || [];
      const hasBuyerRole = userRoles.includes('buyer') || userRoles.includes('both');

      if (!hasBuyerRole) {
        logger.info("User does not have buyer role, skipping draft demands");
        document.querySelector('#draftEmpty')?.classList.remove('hidden');
        document.querySelector('#draftEmpty').textContent = 'Taslak talepleri görmek için alıcı rolüne sahip olmalısınız. Ayarlar sayfasından rolünüzü güncelleyin.';
        isLoadingDrafts = false;
        draftRowsCache = [];
        updateMergedTable();
        return;
      }

      const userCompanyId = userData.companyId;

      if (!userCompanyId) {
        logger.warn("Kullanıcının companyId yok");
        document.querySelector('#draftEmpty').classList.remove('hidden');
        document.querySelector('#draftEmpty').textContent = 'Şirket bilgisi bulunamadı.';
        draftRowsCache = [];
        updateMergedTable();
        return;
      }

      // Build query with cursor
      let q = query(
        collection(db, 'demands'),
        where('creatorCompanyId', '==', userCompanyId),
        where('status', 'in', ['draft', 'withdrawn']),
        orderBy('updatedAt', 'desc'),
        limit(DRAFT_PAGE_SIZE)
      );

      // Add cursor if we have a last document
      if (lastDraftDoc) {
        q = query(
          collection(db, 'demands'),
          where('creatorCompanyId', '==', userCompanyId),
          where('status', 'in', ['draft', 'withdrawn']),
          orderBy('updatedAt', 'desc'),
          startAfter(lastDraftDoc),
          limit(DRAFT_PAGE_SIZE)
        );
      }

      const snap = await getDocs(q);
      logger.debug(`Found ${snap.docs.length} draft/withdrawn demands`);

      const draftRows = snap.docs.map(d => {
        const demandData = { id: d.id, ...d.data() };
        demandData.statusText = translateStatus(demandData.status || 'draft');
        return demandData;
      });

      // Verileri birleştir
      accumulatedDrafts = [...accumulatedDrafts, ...draftRows];

      // Son dökümanı kaydet
      if (snap.docs.length > 0) {
        lastDraftDoc = snap.docs[snap.docs.length - 1];
      }

      // Sayfa bitince finished flag'i set et
      if (snap.docs.length < DRAFT_PAGE_SIZE) {
        draftsFinished = true;
      }

      // Render
      await renderDraft(accumulatedDrafts, '#draftRows', '#draftEmpty');
      draftRowsCache = [...accumulatedDrafts];
      updateMergedTable();

      // Sayfa bitince "Daha Fazla" butonunu gizle
      const loadMoreBtn = document.getElementById('loadMoreDraftsBtn');
      if (draftsFinished) {
        if (loadMoreBtn) loadMoreBtn.classList.add('hidden');
      } else {
        if (loadMoreBtn) loadMoreBtn.classList.remove('hidden');
      }

    } catch (err) {
      draftRowsCache = [...accumulatedDrafts];
      updateMergedTable();
      logger.error('draft load error', err);
      const emptyEl = document.querySelector('#draftEmpty');
      if (emptyEl) {
        if (String(err.message || err).includes('index')) {
          emptyEl.textContent = 'Firestore dizini hazırlanıyor. Konsoldaki "Create index" linkine tıklayıp Ready olunca sayfayı yenileyin.';
        } else {
          emptyEl.textContent = 'Taslak talepler yüklenemedi.';
        }
        emptyEl.classList.remove('hidden');
      }
    } finally {
      isLoadingDrafts = false;
    }
  }

  // Backward compatibility wrapper
  async function loadDraft(u, append = false) {
    return loadDraftPaged(u, { append });
  }

  // Daha fazla taslak yükleme fonksiyonu
  window.loadMoreDrafts = function () {
    loadDraftPaged(user, { append: true });
  };
  document.getElementById('btnLoadMoreDrafts')?.addEventListener('click', window.loadMoreDrafts);

  // Taslak talepler için action fonksiyonları
  window.editDraftDemand = function (demandId) {
    location.href = `./demand-new.html?edit=${demandId}`;
  };

  window.approveDraftDemand = async function approveDraftDemand(demandId, companyId = null) {
    if (!confirm('Bu talebi onaylayıp yayınlamak istediğinizden emin misiniz?')) {
      return;
    }

    try {
      // Path seçimi: companyId verilmişse company altı, değilse global
      const ref = companyId
        ? doc(db, "companies", companyId, "demands", demandId)
        : doc(db, "demands", demandId);

      // Talep durumunu 'published' yap ve yayınla
      await updateDoc(ref, {
        status: 'published',
        published: true,
        isPublished: true,
        statusHistory: arrayUnion({
          status: 'published',
          timestamp: Date.now(),
          userId: user.uid,
          note: 'Taslak onaylandı ve yayınlandı'
        }),
        updatedAt: serverTimestamp(),
        approvedAt: serverTimestamp()
      });

      logger.info("Draft approved", { path: ref.path });

      // Tedarikçi eşleştirmesi yap
      await publishDemandAndMatchSuppliers(demandId);

      toast.success(MESSAGES.SUCCESS_DEMAND_APPROVED_SENT);
      loadDraft(user); // Listeyi yenile

    } catch (error) {
      logger.error('Talep onaylama hatası (approveDraftDemand)', error);
      toast.error(MESSAGES.ERROR_DEMAND_APPROVE + ': ' + (error && error.message ? error.message : error));
    }
  };

  // Toplu silme yardımcıları
  const draftSelectAll = document.getElementById('draftSelectAll');
  const btnDeleteSelectedDrafts = document.getElementById('btnDeleteSelectedDrafts');

  if (draftSelectAll) {
    draftSelectAll.addEventListener('change', () => {
      document.querySelectorAll('.draft-select').forEach(ch => ch.checked = draftSelectAll.checked);
    });
  }



  if (btnDeleteSelectedDrafts) {
    btnDeleteSelectedDrafts.addEventListener('click', async () => {
      const ids = Array.from(document.querySelectorAll('.draft-select:checked')).map(ch => ch.getAttribute('data-id'));
      if (!ids.length) { toast.warn(MESSAGES.WARN_DRAFT_SELECT_REQUIRED); return; }
      if (!confirm(`${ids.length} taslak talebi silmek istediğinize emin misiniz?`)) return;
      for (const id of ids) {
        await deleteDraftDemand(id);
      }
    });
  }

  // Taslak talep silme - Detaylı temizlik yapan versiyon (kullanılan)
  window.deleteDraftDemand = async function deleteDraftDemand(demandId) {
    if (!confirm('Bu taslak talebi kalıcı olarak silmek istiyor musunuz? Bu işlem geri alınamaz.')) return;
    try {
      // Alt koleksiyon: items
      try {
        const itemsSnap = await getDocs(collection(db, 'demands', demandId, 'items'));
        await Promise.all(itemsSnap.docs.map(d => deleteDoc(doc(db, 'demands', demandId, 'items', d.id))));
      } catch (e) { logger.warn('items cleanup warn', e); }

      // bids (top-level)
      try {
        const bidsSnap = await getDocs(query(collection(db, 'bids'), where('demandId', '==', demandId)));
        await Promise.all(bidsSnap.docs.map(d => deleteDoc(doc(db, 'bids', d.id))));
      } catch (e) { logger.warn('bids cleanup warn', e); }

      // recipients (top-level)
      try {
        const recSnap = await getDocs(query(collection(db, 'demandRecipients'), where('demandId', '==', demandId)));
        await Promise.all(recSnap.docs.map(d => deleteDoc(doc(db, 'demandRecipients', d.id))));
      } catch (e) { logger.warn('recipients cleanup warn', e); }

      // Ana doküman
      await deleteDoc(doc(db, 'demands', demandId));

      // UI'dan kaldır
      const tr = document.querySelector(`#draftRows tr[data-id="${demandId}"]`);
      if (tr) tr.remove();
      accumulatedDrafts = accumulatedDrafts.filter(x => x.id !== demandId);
      if (accumulatedDrafts.length === 0) {
        const emptyEl = document.querySelector('#draftEmpty');
        if (emptyEl) emptyEl.classList.remove('hidden');
      }
      toast.success(MESSAGES.SUCCESS_DRAFT_DELETED_ALT);
      loadDraft(user); // Listeyi yenile
    } catch (err) {
      logger.error('deleteDraft error', err);
      toast.error(MESSAGES.ERROR_DRAFT_DELETE + ': ' + (err.message || err));
    }
  };

  // Tedarikçi eşleştirme fonksiyonu
  async function publishDemandAndMatchSuppliers(demandId) {
    try {
      const routingTraceId = `${demandId}_${Math.random().toString(36).slice(2, 6)}`;
      logger.debug("Publishing demand and matching suppliers (v2 derivedCategoryIds)", { demandId, routingTraceId });
      const MAX_RECIPIENTS = 200;

      // Talep verilerini al
      const demandDoc = await getDoc(doc(db, 'demands', demandId));
      if (!demandDoc.exists()) {
        throw new Error('Talep bulunamadı');
      }

      const demandData = demandDoc.data();

      // Routing Policy Lock: SADECE derivedCategoryIds (source of truth: items[].itemCategoryIds)
      let derivedCategoryIds = Array.isArray(demandData.derivedCategoryIds) ? demandData.derivedCategoryIds.filter(Boolean) : [];
      const derivedSource = derivedCategoryIds.length ? 'demand.derivedCategoryIds' : 'items.union(itemCategoryIds)';
      if (!derivedCategoryIds.length) {
        try {
          const itemsSnap = await getDocs(query(collection(db, 'demands', demandId, 'items'), limit(500)));
          const union = new Set();
          itemsSnap.docs.forEach(d => {
            const it = d.data() || {};
            const ids = Array.isArray(it.itemCategoryIds) ? it.itemCategoryIds : [];
            ids.filter(Boolean).forEach(x => union.add(x));
          });
          derivedCategoryIds = Array.from(union);
        } catch (e) {
          logger.warn('Could not derive categories from items subcollection', e);
        }
      }
      if (!derivedCategoryIds.length) {
        toast?.error?.("Kalem kategorileri bulunamadı. Lütfen kalem kategorilerini seçin.");
        throw new Error('derivedCategoryIds_empty');
      }
      try {
        await updateDoc(doc(db, 'demands', demandId), { derivedCategoryIds });
      } catch (e) {
        logger.warn('Could not write derivedCategoryIds to demand', e);
      }

      logger.debug('Routing summary (derived lock)', {
        routingTraceId,
        derivedSource,
        derivedCategoryIdsCount: derivedCategoryIds.length
      });

      // Use match-service for category-based supplier matching (derived only)
      const matchedSuppliers = await matchSuppliers(db, {
        categoryIds: derivedCategoryIds,
        legacySlugs: derivedCategoryIds.map(id => toSlug(categoryIdToName(id) || id)),
        legacyNames: derivedCategoryIds.map(id => categoryIdToName(id)).filter(Boolean)
      });

      // Hard filter: empty intersection => skip supplier entirely
      const allSuppliers = new Set();

      logger.debug('Found suppliers', { count: allSuppliers.size });

      // demandRecipients kayıtları oluştur (idempotent + recipientCategoryIds)
      const existingSnap = await getDocs(query(collection(db, 'demandRecipients'), where('demandId', '==', demandId), limit(2000)));
      const existingSupplierIds = new Set(existingSnap.docs.map(d => d.data()?.supplierId).filter(Boolean));

      const normalizeSupplierToIds = (supplier = {}) => {
        const t = [];
        if (Array.isArray(supplier.supplierCategoryIds)) t.push(...supplier.supplierCategoryIds);
        if (Array.isArray(supplier.supplierCategoryKeys)) t.push(...supplier.supplierCategoryKeys);
        if (Array.isArray(supplier.supplierCategories)) t.push(...supplier.supplierCategories);
        if (Array.isArray(supplier.categories)) t.push(...supplier.categories);
        if (typeof supplier.category === 'string' && supplier.category.trim()) t.push(supplier.category.trim());
        return normalizeToIds(t).filter(Boolean);
      };

      const supplierToRecipientCats = new Map();
      matchedSuppliers.forEach(s => {
        const sid = s.uid || s.id;
        if (!sid) return;
        const sIds = normalizeSupplierToIds(s);
        const inter = derivedCategoryIds.filter(id => sIds.includes(id));
        if (!inter.length) return; // HARD FILTER
        supplierToRecipientCats.set(sid, inter);
        if (sid !== demandData.createdBy) allSuppliers.add(sid);
      });

      const recipientPromises = Array.from(allSuppliers)
        .filter(supplierId => !existingSupplierIds.has(supplierId))
        .map(supplierId =>
          addDoc(collection(db, 'demandRecipients'), {
            demandId: demandId,
            buyerId: demandData.createdBy,
            supplierId: supplierId,
            matchedAt: serverTimestamp(),
            status: 'matched',
            createdAt: serverTimestamp(),
            recipientCategoryIds: supplierToRecipientCats.get(supplierId) || [],
            matchedBy: { type: 'category', ids: supplierToRecipientCats.get(supplierId) || [] },
            matchDebug: {
              demandCategoryIds: derivedCategoryIds,
              supplierCategoryIds: normalizeSupplierToIds(matchedSuppliers.find(x => (x.uid || x.id) === supplierId) || {}) || [],
              intersectionIds: supplierToRecipientCats.get(supplierId) || []
            }
          })
        );

      // Anti-spam limit: havuz modu (recipient üretimini durdur)
      if (allSuppliers.size > MAX_RECIPIENTS) {
        logger.warn('Recipient limit exceeded, switching to pool routing mode', {
          routingTraceId,
          count: allSuppliers.size,
          max: MAX_RECIPIENTS
        });
        toast?.warn?.("Talep çok geniş hedef kitleye çıkıyor. Spam’i önlemek için havuz moduna alındı.");
        try {
          await updateDoc(doc(db, 'demands', demandId), {
            routingMode: 'pool',
            routingReason: 'max_recipients',
            routingMaxRecipients: MAX_RECIPIENTS,
            routingCandidateCount: allSuppliers.size,
            matchedSupplierCount: allSuppliers.size,
            lastMatchingAt: serverTimestamp(),
            derivedCategoryIds
          });
        } catch (e) {
          logger.warn('Could not write pool routing fields', e);
        }
        return;
      }

      await Promise.all(recipientPromises);

      logger.info(`Created ${recipientPromises.length} demandRecipients records`, {
        routingTraceId,
        routingMode: 'direct',
        derivedCategoryIdsCount: derivedCategoryIds.length,
        candidateCount: allSuppliers.size,
        recipientCreatedCount: recipientPromises.length
      });

    } catch (error) {
      logger.error('Error in publishDemandAndMatchSuppliers', { error });
      throw error;
    }
  }

  PAGING.activeTab = initialTab;
  await loadDemandsPaged(true);
  
  // --- Filters ---
  // Teklifbul Rule v1.0 - Use unified loadDemandsPaged(true) for all filter changes

  // Legacy filter functions removed - unified loadDemandsPaged(true) is used instead.


  // ====================
  // Grouping Functions
  // ====================
  function groupKey(rec, by) {
    switch (by) {
      case "site":
        return rec.siteName || "— (Şantiye yok) —";
      case "status":
        // Önce status alanını kontrol et, sonra published/isPublished
        const isDraft = rec.status === 'draft' || (!rec.published && !rec.isPublished);
        return isDraft ? "Taslak" : "Gönderildi";
      case "priority":
        return translatePriority(rec.priority) || "—";
      case "biddingmode": {
        const mode = rec.biddingMode || "secret";
        const labels = { secret: "Gizli", open: "Açık Artırma", hybrid: "Hibrit" };
        return labels[mode] || "Gizli";
      }
      case "category": {
        const cats = [
          ...(Array.isArray(rec.categoryTags) ? rec.categoryTags : []),
          ...(rec.customCategory ? [rec.customCategory] : [])
        ];
        return cats.length ? cats : ["— (Kategori yok) —"];
      }
      case "month": {
        const d = rec.createdAt?.toDate?.();
        if (!d) return "— (Tarih yok) —";
        const m = (d.getMonth() + 1).toString().padStart(2, "0");
        return `${d.getFullYear()}-${m}`;
      }
      default:
        return "";
    }
  }

  function buildGroups(rows, by) {
    const map = new Map();
    for (const r of rows) {
      const k = groupKey(r, by);
      const keys = Array.isArray(k) ? k : [k];
      keys.forEach(key => {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(r);
      });
    }
    return map; // Map<groupName, Record[]>
  }

  // Teklifbul Rule v1.0 - Öncelik çevirisi
  function translatePriority(priority) {
    if (!priority) return "-";
    const translations = {
      'price': 'Fiyat',
      'speed': 'Hız',
      'quality': 'Kalite',
      'urgent': 'Acil',
      'normal': 'Normal',
      'low': 'Düşük'
    };
    return translations[priority.toLowerCase()] || priority;
  }

  // Teklifbul Rule v1.0 - Tablo hücresi için stil (açık modda çerçeveli)
  function getTableCellStyle(text) {
    if (!text || text === "-" || text === "" || text === null || text === undefined) {
      return null; // Boş veya "-" ise çerçeve ekleme
    }
    if (isDarkMode()) {
      return null; // Koyu modda çerçeve yok
    } else {
      // Açık mod: Beyaz arka plan, #1f2937 metin, #1f2937 border (ince çizgili)
      return `style="background:#ffffff;color:#1f2937;padding:2px 6px;border:1px solid #1f2937;border-radius:4px;display:inline-block;font-size:12px;"`;
    }
  }

  // --- Row HTML (gerçek <td>'ler!) ---
  function rowHtml(d) {
    const tr = document.createElement("tr");

    const cats = [
      ...(Array.isArray(d.categoryTags) ? d.categoryTags : []),
      ...(d.customCategory ? [d.customCategory] : [])
    ];
    const catsHtml = cats.slice(0, 3).map(c => `<span class="badge">${c}</span>`).join(" ") + (cats.length > 3 ? ` +${cats.length - 3}` : "");

    const mode = d.biddingMode || "secret";
    const modeLabel = ({ secret: "Gizli", open: "Açık", hybrid: "Hibrit" })[mode] || "Gizli";

    const isOwner = d.createdBy === uid;
    // Tarih formatlaması - Firestore Timestamp kontrolü
    const formatDate = (date) => {
      if (!date) return "-";
      if (date.toDate && typeof date.toDate === 'function') {
        try {
          return date.toDate().toLocaleDateString("tr-TR");
        } catch (e) {
          console.warn('toDate() failed:', e);
        }
      }
      if (date instanceof Date) return date.toLocaleDateString("tr-TR");
      if (typeof date === "string") {
        // Timestamp string formatı kontrolü: "Timestamp(seconds=1764171108, nanoseconds=503000000)"
        const timestampMatch = date.match(/Timestamp\(seconds=(\d+),\s*nanoseconds=(\d+)\)/);
        if (timestampMatch) {
          const seconds = parseInt(timestampMatch[1], 10);
          const dateObj = new Date(seconds * 1000);
          return dateObj.toLocaleDateString("tr-TR");
        }
        try {
          return new Date(date).toLocaleDateString("tr-TR");
        } catch (e) {
          return date;
        }
      }
      if (date.seconds !== undefined) {
        try {
          const dateObj = new Date(date.seconds * 1000 + (date.nanoseconds || 0) / 1000000);
          return dateObj.toLocaleDateString("tr-TR");
        } catch (e) {
          console.warn('Timestamp conversion failed:', e);
        }
      }
      return "-";
    };
    const created = formatDate(d.createdAt);

    // Teklifbul Rule v1.0 - Öncelik çevirisi
    const priorityText = translatePriority(d.priority);

    // Teklifbul Rule v1.0 - Tarih formatlaması (dueDate için)
    const dueDateText = d.dueDate ? formatDate(d.dueDate) : "-";

    // Teklifbul Rule v1.0 - Açık modda çerçeveli metinler (tüm hücreler için)
    const satfkStyle = getTableCellStyle(d.satfk);
    const dueDateStyle = getTableCellStyle(dueDateText);
    const priorityStyle = getTableCellStyle(priorityText);
    const modeStyle = getTableCellStyle(modeLabel);
    const siteStyle = getTableCellStyle(d.siteName);
    const createdStyle = getTableCellStyle(created);
    const statusText = (d.status === 'draft' || (!d.published && !d.isPublished)) ? 'Taslak' : 'Gönderildi';
    const statusStyle = getTableCellStyle(statusText);

    // Teklifbul Rule v1.0 - XSS Protection
    const safeSatfk = DOMPurify.sanitize(d.satfk || "-", { ALLOWED_TAGS: [] });
    const safeTitle = DOMPurify.sanitize(d.title || "-", { ALLOWED_TAGS: [] });
    const safeId = DOMPurify.sanitize(d.id || '', { ALLOWED_TAGS: [] });
    const safeSiteName = DOMPurify.sanitize(d.siteName || "-", { ALLOWED_TAGS: [] });
    const safeStatusText = DOMPurify.sanitize(statusText || '', { ALLOWED_TAGS: [] });
    const safeDueDateText = DOMPurify.sanitize(dueDateText || "-", { ALLOWED_TAGS: [] });
    const safePriorityText = DOMPurify.sanitize(priorityText || '', { ALLOWED_TAGS: [] });
    const safeModeLabel = DOMPurify.sanitize(modeLabel || '', { ALLOWED_TAGS: [] });
    const safeCreated = DOMPurify.sanitize(created || '', { ALLOWED_TAGS: [] });
    const rowHTML = `
      <td>${satfkStyle ? `<span ${satfkStyle}>${safeSatfk}</span>` : safeSatfk}</td>
      <td><a href="./demand-detail.html?id=${safeId}${readonlyMode ? '&readonly=true' : ''}">${safeTitle}</a></td>
      <td>${catsHtml || "-"}</td>
      <td>${dueDateStyle ? `<span ${dueDateStyle}>${safeDueDateText}</span>` : safeDueDateText}</td>
      <td>${priorityStyle ? `<span ${priorityStyle}>${safePriorityText}</span>` : safePriorityText}</td>
      <td>${modeStyle ? `<span ${modeStyle}>${safeModeLabel}</span>` : safeModeLabel}</td>
      <td>${siteStyle ? `<span ${siteStyle}>${safeSiteName}</span>` : safeSiteName}</td>
      <td>${statusStyle ? `<span ${statusStyle}>${safeStatusText}</span>` : ((d.status === 'draft' || (!d.published && !d.isPublished)) ? '<span class="badge warn">Taslak</span>' : '<span class="badge success">Gönderildi</span>')}</td>
      <td>${createdStyle ? `<span ${createdStyle}>${safeCreated}</span>` : safeCreated}</td>
      <td>${isOwner ? `<button class="danger small" data-id="${safeId}">Sil</button>` : ""}</td>
    `;
    tr.innerHTML = DOMPurify.sanitize(rowHTML, {
      ALLOWED_TAGS: ['td', 'span', 'a', 'button'],
      ALLOWED_ATTR: ['style', 'class', 'href', 'data-id']
    });
    return tr;
  }

  function renderGrouped(groupsMap) {
    const wrap = document.getElementById("grouped-container");
    const tbody = document.getElementById("demands-body");
    const pager = document.getElementById("pager");
    wrap.innerHTML = "";
    wrap.style.display = "";
    tbody.innerHTML = "";
    pager.style.display = "none"; // Hide pagination in grouped view

    // Sort groups by name
    const entries = [...groupsMap.entries()].sort((a, b) => a[0].localeCompare(b[0], "tr"));

    for (const [gname, list] of entries) {
      // Group header (collapsible)
      const openId = Math.random().toString(36).slice(2, 8);
      const header = document.createElement("div");
      header.style.cssText = "margin:12px 0 4px 0; font-weight:600; cursor:pointer; font-size:16px;";
      // Teklifbul Rule v1.0 - XSS Protection
      const safeGname = DOMPurify.sanitize(gname || '', { ALLOWED_TAGS: [] });
      header.innerHTML = DOMPurify.sanitize(`${safeGname} <span style="opacity:.7">(${list.length})</span>`, {
        ALLOWED_TAGS: ['span'],
        ALLOWED_ATTR: ['style']
      });
      const cont = document.createElement("div");
      cont.id = `grp-${openId}`;

      // Mini table
      const tbl = document.createElement("table");
      tbl.className = "table";
      const head = document.createElement("thead");
      head.innerHTML = document.querySelector("thead").innerHTML;
      const body = document.createElement("tbody");
      list
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        .forEach(d => body.appendChild(rowHtml(d)));
      tbl.appendChild(head);
      tbl.appendChild(body);
      cont.appendChild(tbl);

      // Toggle
      let visible = true;
      header.onclick = () => {
        visible = !visible;
        cont.style.display = visible ? "" : "none";
      };

      wrap.appendChild(header);
      wrap.appendChild(cont);
    }
  }

  // --- Table render ---
  // Teklifbul Rule v1.0 - Legacy tablo kaldırıldı, bu fonksiyon artık kullanılmıyor
  function renderTable(list) {
    // Legacy tablo kaldırıldı, bu fonksiyon artık çalışmıyor
    logger.warn('renderTable called but legacy table was removed');
    return;
  }
  // Teklifbul Rule v1.0 - Legacy tablo kaldırıldı, bu fonksiyon artık kullanılmıyor


  // --- Delete bind (owner only) ---
  function bindDeleteButtons(scopeSelector) {
    document.querySelectorAll(`${scopeSelector} button.danger`).forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-id");
        if (!confirm("Bu talebi silmek istiyor musunuz?")) return;
        try {
          await deleteDoc(doc(db, "demands", id));
          merged = merged.filter(x => x.id !== id);
          applyFilters();
          toast.success(MESSAGES.SUCCESS_DEMAND_DELETED);
        } catch (e) { toast.error(MESSAGES.ERROR_DELETE + ": " + (e.message || e)); }
      };
    });
  }

  // Initialize page - only called once at the end

}

// Listen for company changes - outside initDemandsPage
window.addEventListener('company:changed', async (e) => {
  const { companyId } = e.detail;
  logger.info('Company changed, reloading data', { companyId });

  try {
    // Teklifbul Rule v1.0 - Basit ve güvenli çözüm: şirket değişince sayfayı yenile
    // (load* fonksiyonları initDemandsPage scope'unda olduğu için burada erişilmez)
    window.location.reload();
  } catch (err) {
    logger.error('Error reloading data after company change', err);
  }
});

// Initialize page - only called once
initDemandsPage().catch(err => {
  logger.error('Failed to initialize demands page', err);
});
