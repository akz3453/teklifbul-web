// Teklifbul Rule v1.0 - Dashboard Data Loading Script
// External dosyaya taşındı - Vite HTML proxy hatası önlemek için
// Teklifbul Rule v1.0 - XSS Protection
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';
import { db, requireAuth } from "../firebase.js";
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../src/shared/log/logger.js';
import { toast } from '../../src/shared/ui/toast.js';
import { MESSAGES } from '../../src/shared/constants/messages.js';
import { setTableEmpty } from './utils/safe-table.js';
import { resolveSharedCompanyId } from './utils/api-helpers.js';
import { COMPANY_JOIN_REQUESTS_QUERY_LIMIT } from '../../src/shared/constants/timing.js';
import { getCachedUserSnap } from './utils/user-doc-cache.js';
import { isDemandExpired } from './utils/demand-expiry.js';
import {
  collection, getDocs, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
// CRITICAL: Import new ID-based category system
import {
  getAllCategories,
  normalizeToIds 
} from "../../src/categories/category-service.js";

// Async IIFE - Teklifbul Rule v1.0
(async function() {
  const dashUser = await requireAuth();
  const uid = dashUser.uid;
  let userData = {};
  
  // Şirket kodlu kayıt durumunu kontrol et - Teklifbul Rule v1.0
  try {
    const userDoc = await getCachedUserSnap(db, dashUser.uid);
    if (userDoc.exists()) {
      userData = userDoc.data() || {};
      if (userData.companyJoinStatus === 'pending' || userData.companyJoinStatus === 'rejected') {
        location.href = "./company-join-waiting.html";
        return;
      }
    }
  } catch (e) {
    logger.warn('User status check failed', e);
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


try {
  // Get user's company ID and supplier categories (same as demands.html)
  let userCompanyId = resolveSharedCompanyId(userData);
  
  // Eğer companyId yoksa ama companyCode varsa, companyJoinRequests'ten al
  if (!userCompanyId && userData.companyCode) {
    try {
      const { collection: getCollection, getDocs, query: getQuery, where: getWhere } = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js');
      const joinRequestsRef = getCollection(db, 'companyJoinRequests');
      const joinRequestsQuery = getQuery(
        joinRequestsRef,
        getWhere('userId', '==', uid),
        getWhere('status', 'in', ['pending', 'accepted']),
        limit(COMPANY_JOIN_REQUESTS_QUERY_LIMIT)
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
        }
      }
    } catch (joinRequestError) {
      logger.warn('companyJoinRequests kontrolü sırasında hata (dashboard-data)', joinRequestError);
    }
  }
  
  // Teklifbul Rule v1.2.24 - Multi-role desteği: Kullanıcının rolleri kontrol et
  const userRoles = userData.roles || [];
  const hasBuyerRole = userRoles.includes('buyer') || userRoles.includes('both');
  const hasSupplierRole = userRoles.includes('supplier') || userRoles.includes('both');
  
  // CRITICAL: Get supplier categories in ID format (new system)
  // Priority: supplierCategoryIds > supplierCategoryKeys (slugs) > supplierCategories (names)
  let mySupplierCategoryTokens = [];
  if (Array.isArray(userData.supplierCategoryIds) && userData.supplierCategoryIds.length > 0) {
    mySupplierCategoryTokens = userData.supplierCategoryIds;
  } else if (Array.isArray(userData.supplierCategoryKeys) && userData.supplierCategoryKeys.length > 0) {
    mySupplierCategoryTokens = userData.supplierCategoryKeys;
  } else if (Array.isArray(userData.supplierCategories) && userData.supplierCategories.length > 0) {
    mySupplierCategoryTokens = userData.supplierCategories;
  }
  
  // Normalize all tokens to IDs
  const mySupplierCategoryIds = normalizeToIds(mySupplierCategoryTokens).slice(0, 10); // Firestore limit
  
  // Reduced logging: Only log summary
  if (mySupplierCategoryIds.length === 0 && hasSupplierRole) {
    logger.warn("Dashboard: No supplier categories found for user.");
  }
  
  // DEBUG queries removed for performance
  
  // Load incoming demands - same logic as demands.html
  // Teklifbul Rule v1.2.24 - Sadece supplier veya both rolüne sahip kullanıcılar için
  let incomingDemands = [];
  try {
    if (hasSupplierRole && mySupplierCategoryIds.length > 0) {
      // Use category filtering (same as demands.html)
      // Note: Published demands have status='published' or 'approved' and isPublished=true
      // CRITICAL: Try categoryIds first (new system), then fallback to legacy fields
      let incomingSnap;
      try {
        // Primary: Use categoryIds (new ID-based system)
        const qIncomingDemands = query(
          collection(db, "demands"),
          where("isPublished", "==", true),
          where("categoryIds", "array-contains-any", mySupplierCategoryIds),
          orderBy("createdAt", "desc"),
          limit(100)
        );
        incomingSnap = await getDocs(qIncomingDemands);
      } catch (err) {
        // Fallback 1: Try supplierCategoryIds if categoryIds query fails
        try {
          const qIncomingDemands = query(
            collection(db, "demands"),
            where("isPublished", "==", true),
            where("supplierCategoryIds", "array-contains-any", mySupplierCategoryIds),
            orderBy("createdAt", "desc"),
            limit(100)
          );
          incomingSnap = await getDocs(qIncomingDemands);
        } catch (err2) {
          // Fallback 2: Try legacy categoryTags (slugs) if ID queries fail
          const allCategories = getAllCategories();
          const legacySlugs = mySupplierCategoryIds.map(id => {
            const cat = allCategories.find(c => c.id === id);
            return cat ? cat.slug : null;
          }).filter(Boolean);
          
          if (legacySlugs.length > 0) {
            logger.warn("ID queries failed, trying legacy categoryTags fallback", err2.message);
            try {
              const qIncomingDemands = query(
                collection(db, "demands"),
                where("isPublished", "==", true),
                where("categoryTags", "array-contains-any", legacySlugs.slice(0, 10)),
                orderBy("createdAt", "desc"),
                limit(100)
              );
              incomingSnap = await getDocs(qIncomingDemands);
            } catch (err3) {
              logger.error("Dashboard: All category query attempts failed");
              if (err3.code === 'failed-precondition') {
                logger.error("Firestore index required. Please:");
                logger.error("   1. Click the link in the error message above to create the index manually");
                logger.error("   2. Or run: firebase deploy --only firestore:indexes");
                logger.error("   3. Wait a few minutes for the index to build, then refresh the page.");
              }
              incomingSnap = { docs: [] };
            }
          } else {
            logger.error("Dashboard: All category query attempts failed - no legacy slugs available");
            incomingSnap = { docs: [] };
          }
        }
      }
      
      incomingDemands = incomingSnap.docs
        .filter(d => {
          const data = d.data();
          // Kendi şirketinin taleplerini filtrele (silent filter)
          if (data.creatorCompanyId && userCompanyId && data.creatorCompanyId === userCompanyId) {
            return false;
          }
          return true;
        })
        .map(d => ({ id: d.id, ...d.data() }));
      
      // DEBUG: If no matches, check why - Teklifbul Rule v1.2.21
      if (incomingSnap.docs.length > 0 && incomingDemands.length === 0) {
        const sample = incomingSnap.docs[0];
        const sampleData = sample.data();
        const isOwnCompany = sampleData.creatorCompanyId && userCompanyId && sampleData.creatorCompanyId === userCompanyId;
        
        if (isOwnCompany) {
          // Teklifbul Rule v1.2.21 - Kendi şirketinin talepleri filtreleniyor, bu normal
          logger.info("Talepler bulundu ancak kendi şirketinizin talepleri olduğu için filtrelendi", {
            totalFound: incomingSnap.docs.length,
            filtered: incomingSnap.docs.length
          });
        } else {
          // Kategori eşleşmesi sorunu olabilir
          logger.warn("WARNING: Published demands exist but none match user categories!");
          logger.info("Sample demand from query");
          const demandCats = sampleData.categoryIds || sampleData.supplierCategoryIds || sampleData.categoryTags || [];
          const demandCategoryIds = normalizeToIds(demandCats);
          const matchedCats = demandCategoryIds.filter(id => mySupplierCategoryIds.includes(id));
          logger.info("Sample demand debug", {
            demandId: sample.id,
            categoryIds: sampleData.categoryIds,
            supplierCategoryIds: sampleData.supplierCategoryIds,
            categoryTags: sampleData.categoryTags,
            creatorCompanyId: sampleData.creatorCompanyId,
            userCompanyId: userCompanyId,
            isOwnCompany: isOwnCompany,
            userCategoryIds: mySupplierCategoryIds,
            demandCategoryIds: demandCategoryIds,
            matchedCategoryIds: matchedCats,
            hasMatch: matchedCats.length > 0
          });
        }
      }
    } else if (hasSupplierRole) {
      // Fallback: if no supplier categories but has supplier role, show all published (excluding own)
      // Note: Published demands have status='published' and isPublished=true
      const qIncomingDemands = query(
        collection(db, "demands"),
        where("isPublished", "==", true),
        orderBy("createdAt", "desc"),
        limit(100)
      );
      const incomingSnap = await getDocs(qIncomingDemands);
      incomingDemands = incomingSnap.docs
        .filter(d => {
          const data = d.data();
          // Kendi şirketinin taleplerini filtrele
          if (data.creatorCompanyId && userCompanyId && data.creatorCompanyId === userCompanyId) {
            return false;
          }
          if (data.createdBy === uid) return false;
          return true;
        })
        .map(d => ({ id: d.id, ...d.data() }));
      // Silent: all published demands shown (no categories filter)
    } else {
      // Teklifbul Rule v1.2.24 - Supplier rolü yoksa gelen talepler gösterilmez
    }
  } catch (error) {
    logger.error('Error loading incoming demands', error);
    if (error.code === 'failed-precondition') {
      logger.error("Firestore index required. Please:");
      logger.error("   1. Click the link in the error message above to create the index manually");
      logger.error("   2. Or run: firebase deploy --only firestore:indexes");
      logger.error("   3. Wait a few minutes for the index to build, then refresh the page.");
    }
  }

  incomingDemands = incomingDemands.filter((demand) => !isDemandExpired(demand));
  
  // Incoming bid metric uses demand.bidCount on the company demand page (below).
  let incomingBids = { length: 0 };
  
  // Load outgoing bids (bids I sent)
  // Teklifbul Rule v1.2.24 - Sadece supplier veya both rolüne sahip kullanıcılar için
  // Teklifbul Rule v1.0 — supplierId + supplierCompanyId tek list query rules'ta
  // permission-denied olur (OR içinde get()). bids.html gibi ayrı sorgular.
  const dashboardBidsQueryLimit = 300;
  let outgoingBids = [];
  try {
    if (hasSupplierRole) {
      const bidMap = new Map();
      let companyQueryOk = false;
      let userQueryOk = false;
      const outgoingBidErrors = [];

      if (userCompanyId && !String(userCompanyId).startsWith('solo-')) {
        try {
          const byCompanySnap = await getDocs(query(
            collection(db, "bids"),
            where("supplierCompanyId", "==", userCompanyId),
            limit(dashboardBidsQueryLimit)
          ));
          byCompanySnap.docs.forEach((d) => bidMap.set(d.id, { id: d.id, ...d.data() }));
          companyQueryOk = true;
        } catch (companyQueryError) {
          outgoingBidErrors.push(companyQueryError);
          logger.warn('Dashboard: outgoing bids company query failed', companyQueryError);
        }
      } else if (!userCompanyId) {
        logger.warn('Dashboard: Supplier rolü var ancak userCompanyId bulunamadı, şirket sorgusu atlandı');
      } else {
        companyQueryOk = true;
      }

      try {
        const byUserSnap = await getDocs(query(
          collection(db, "bids"),
          where("supplierId", "==", uid),
          limit(dashboardBidsQueryLimit)
        ));
        byUserSnap.docs.forEach((d) => {
          if (!bidMap.has(d.id)) bidMap.set(d.id, { id: d.id, ...d.data() });
        });
        userQueryOk = true;
      } catch (userQueryError) {
        outgoingBidErrors.push(userQueryError);
        logger.warn('Dashboard: outgoing bids user query failed', userQueryError);
      }

      outgoingBids = Array.from(bidMap.values());
      if (!companyQueryOk && !userQueryOk) {
        logger.error('Error loading outgoing bids', outgoingBidErrors[0]);
        toast.error(MESSAGES.ERROR_LOADING_OUTGOING_BIDS);
      }
    }
  } catch (error) {
    logger.error('Error loading outgoing bids', error);
    toast.error(MESSAGES.ERROR_LOADING_OUTGOING_BIDS);
  }

  // Load all user demands (for "Son Taleplerim" table) - creatorCompanyId or createdBy
  // Teklifbul Rule v1.2.24 - Sadece buyer veya both rolüne sahip kullanıcılar için
  let allUserDemands = [];
  try {
    if (hasBuyerRole && userCompanyId) {
      const qAllDemands = query(
        collection(db, "demands"),
        where("creatorCompanyId", "==", userCompanyId),
        orderBy("createdAt", "desc"),
        limit(100)
      );
      const allDemandsSnap = await getDocs(qAllDemands);
      allUserDemands = allDemandsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else if (hasBuyerRole) {
      // Fallback: use createdBy if no companyId
      const qAllDemands = query(
        collection(db, "demands"),
        where("createdBy", "==", uid),
        orderBy("createdAt", "desc"),
        limit(100)
      );
      const allDemandsSnap = await getDocs(qAllDemands);
      allUserDemands = allDemandsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      // Teklifbul Rule v1.2.24 - Buyer rolü yoksa kullanıcı talepleri gösterilmez
    }
  } catch (error) {
    logger.error('Error loading all user demands', error);
  }

  // Load outgoing demands - same logic as demands.html (creatorCompanyId + status published)
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
  
  let outgoingDemands = [];
  try {
    if (canViewOutgoingDemands(userData)) {
      outgoingDemands = allUserDemands.filter((d) => d.isPublished === true);
    }
  } catch (error) {
    logger.error('Error loading outgoing demands', error);
  }
  
  // Load draft demands - same logic as demands.html (creatorCompanyId + status IN ['draft', 'withdrawn'])
  // Teklifbul Rule v1.2.24 - Sadece buyer veya both rolüne sahip kullanıcılar için
  let drafts = [];
  try {
    if (hasBuyerRole && userCompanyId) {
      const qDrafts = query(
        collection(db, "demands"),
        where("creatorCompanyId", "==", userCompanyId),
        where("status", "in", ["draft", "withdrawn"]),
        orderBy("updatedAt", "desc"),
        limit(100)
      );
      const draftsSnap = await getDocs(qDrafts);
      drafts = draftsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Silent: draft demands loaded
    } else if (hasBuyerRole) {
      // Fallback: use createdBy if no companyId
      const qDrafts = query(
        collection(db, "demands"),
        where("createdBy", "==", uid),
        where("status", "in", ["draft", "withdrawn"]),
        orderBy("updatedAt", "desc"),
        limit(100)
      );
      const draftsSnap = await getDocs(qDrafts);
      drafts = draftsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Silent: draft demands loaded (createdBy fallback)
    } else {
      // Teklifbul Rule v1.2.24 - Buyer rolü yoksa taslak talepler gösterilmez
    }
  } catch (error) {
    logger.error('Error loading draft demands', error);
  }

  // Use allUserDemands for "Son Taleplerim" table
  const sent = allUserDemands;
  if (hasBuyerRole) {
    incomingBids = {
      length: allUserDemands.reduce((acc, d) => acc + (Number(d.bidCount) || 0), 0),
    };
  }

  // Update metrics - use outgoingDemands instead of sent for consistency
  // Teklifbul Rule v1.0 - Metrikleri güncelle ve opacity'yi normale döndür
  const updateMetric = (id, value) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = String(value);
      el.style.opacity = '1'; // Loading state'den çık
    }
  };
  
  updateMetric("metric-inbox", incomingDemands.length);
  updateMetric("metric-sent", outgoingDemands.length);
  updateMetric("metric-draft", drafts.length);
  updateMetric("metric-incoming-bids", incomingBids.length);
  updateMetric("metric-outgoing-bids", outgoingBids.length);

  // Sort and display last 5 demands
  sent.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 0;
    const bTime = b.createdAt?.toMillis?.() || 0;
    return bTime - aTime;
  });

  const lastBody = document.getElementById("last-demands");
  lastBody.innerHTML = "";
  
  const last5 = sent.slice(0, 5);
  if (last5.length === 0) {
    // Teklifbul Rule v1.0 — DOMPurify <tr>/<td>'yi table dışında siler; createElement kullan
    setTableEmpty(lastBody, 6, 'Henüz talep yok');
  } else {
    // No need for batch bid loading, we use x.bidCount directly from the demand document
    
    // Render rows with cached bid counts
    for (const x of last5) {
      const bidCount = Number(x.bidCount) || 0;
      
      const cats = [
        ...(Array.isArray(x.categoryTags) ? x.categoryTags : []),
        ...(x.customCategory ? [x.customCategory] : [])
      ];
      const catDisplay = cats.length > 0
        ? cats.slice(0, 3).join(", ") + (cats.length > 3 ? ` +${cats.length - 3}` : "")
        : "-";
      
      const statusText = translateStatus(x.status || (x.isPublished ? 'published' : 'draft'));
      const statusBadge = x.isPublished 
        ? `<span class="badge success">${statusText}</span>` 
        : `<span class="badge warn">${statusText}</span>`;
      
      const bidDisplay = bidCount > 0 
        ? `<span class="badge success">${bidCount} teklif</span>`
        : '<span style="color:#6b7280">Henüz teklif yok</span>';
      
      // Teklifbul Rule v1.0 - XSS Protection
      const safeSatfk = DOMPurify.sanitize(x.satfk || "-", { ALLOWED_TAGS: [] });
      const safeTitle = DOMPurify.sanitize(x.title || "-", { ALLOWED_TAGS: [] });
      const safeId = DOMPurify.sanitize(x.id || '', { ALLOWED_TAGS: [] });
      const safeCatDisplay = DOMPurify.sanitize(catDisplay || "-", { ALLOWED_TAGS: [] });
      const safeStatusBadge = DOMPurify.sanitize(statusBadge || '', {
        ALLOWED_TAGS: ['span'],
        ALLOWED_ATTR: ['class']
      });
      const safeBidDisplay = DOMPurify.sanitize(bidDisplay || '', {
        ALLOWED_TAGS: ['span'],
        ALLOWED_ATTR: ['class', 'style']
      });
      const tr = document.createElement("tr");
      const dateStr = x.createdAt?.toDate?.()?.toLocaleDateString?.("tr-TR") || "-";
      const safeDate = DOMPurify.sanitize(dateStr, { ALLOWED_TAGS: [] });
      
      // CRITICAL: Use DOM API to create <td> elements directly to preserve table structure
      // This ensures proper table rendering with borders and alignment
      
      // SATFK column
      const td1 = document.createElement("td");
      td1.textContent = safeSatfk;
      tr.appendChild(td1);
      
      // Title column with link
      const td2 = document.createElement("td");
      const link = document.createElement("a");
      link.href = `./demand-detail.html?id=${safeId}`;
      link.style.color = "#3b82f6";
      link.style.textDecoration = "none";
      link.textContent = safeTitle;
      td2.appendChild(link);
      tr.appendChild(td2);
      
      // Categories column
      const td3 = document.createElement("td");
      td3.textContent = safeCatDisplay;
      tr.appendChild(td3);
      
      // Status column (with badge HTML)
      const td4 = document.createElement("td");
      td4.innerHTML = safeStatusBadge;
      tr.appendChild(td4);
      
      // Bid count column (with badge HTML)
      const td5 = document.createElement("td");
      td5.innerHTML = safeBidDisplay;
      tr.appendChild(td5);
      
      // Date column
      const td6 = document.createElement("td");
      td6.textContent = safeDate;
      tr.appendChild(td6);
      
      lastBody.appendChild(tr);
    }
  }
} catch (e) {
  logger.error("Dashboard data load error", e);
  // Show detailed error information to help diagnose the issue
  const errorMessage = `
    <div style="text-align: center; padding: 40px; color: #6b7280; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; margin: 20px;">
      <h3>Dashboard verileri yüklenemedi</h3>
      <p>Hata detayı: ${e.message || e}</p>
      <p>Lütfen aşağıdaki kontrol listesini inceleyin:</p>
      <ul style="text-align: left; max-width: 500px; margin: 20px auto;">
        <li>İnternet bağlantınızı kontrol edin</li>
        <li>Firebase authentication'ın doğru çalıştığından emin olun</li>
        <li>Şirket bilgilerinizin doğru ayarlandığından emin olun</li>
        <li>Tedarikçi kategorilerinizin seçili olduğundan emin olun</li>
        <li>Ayarlar sayfasından profil bilgilerinizi kontrol edin</li>
      </ul>
      <p style="font-size: 14px; margin-top: 20px;">
        <a href="./settings.html" style="color: #3b82f6;">Ayarlar</a> | 
        <a href="./demands.html" style="color: #3b82f6;">Talepler</a> | 
        <a href="./bids.html" style="color: #3b82f6;">Teklifler</a>
      </p>
    </div>
  `;
  
  // Try to insert the error message in a visible place
  const mainContent = document.querySelector("main");
  if (mainContent) {
    const errorDiv = document.createElement("div");
    // Teklifbul Rule v1.0 - XSS Protection
    const safeErrorMessage = DOMPurify.sanitize(errorMessage, {
      ALLOWED_TAGS: ['div', 'h3', 'p', 'ul', 'li', 'a'],
      ALLOWED_ATTR: ['style', 'href']
    });
    errorDiv.innerHTML = safeErrorMessage;
    mainContent.insertBefore(errorDiv, mainContent.firstChild);
  }
  
  if (e.message && e.message.includes("Missing or insufficient permissions")) {
    logger.warn("Permission denied for dashboard data - Firestore rules may need updating");
  }
}

// Async IIFE kapatma - Teklifbul Rule v1.0
})();

