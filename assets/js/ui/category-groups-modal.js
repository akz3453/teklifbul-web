/**
 * Category Groups Modal UI - BASIT VERSİYON
 * Test sayfasındaki gibi çalışan basit modal
 */

// Teklifbul Rule v1.0 - Structured Logging
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';
import { logger } from '../../../src/shared/log/logger.js';
// Teklifbul Rule v1.0 - Toast Bildirim Sistemi
import { toast } from '../../../src/shared/ui/toast.js';
import { MESSAGES } from '../../../src/shared/constants/messages.js';
// Teklifbul Rule v1.0 - Auth + Firestore CRUD
import { requireAuth } from '/firebase.js';
import { listGroupsForUser, createGroup, updateGroup, deleteGroup } from '/assets/js/services/category-groups.js';

// Categories embedded directly to avoid import issues
const EMBEDDED_CATEGORIES = [
  "Sac/Metal",
  "Elektrik", 
  "Elektronik",
  "Makine-İmalat",
  "Hırdavat",
  "Ambalaj",
  "Kimyasal",
  "İnşaat Malzemeleri",
  "Mobilya",
  "Boya",
  "Plastik",
  "Otomotiv Yan Sanayi",
  "İş Güvenliği",
  "Temizlik",
  "Gıda",
  "Hizmet",
  "Lojistik"
];

// Dynamic import for categories to handle missing file gracefully
async function loadCategories() {
  try {
    // Prefer new ID-based dictionary (29+ categories)
    const svc = await import('/src/categories/category-service.js');
    const cats = typeof svc.getAllCategories === 'function' ? svc.getAllCategories() : [];
    const names = (cats || []).map(c => c?.name).filter(Boolean);
    if (names.length > 0) {
      logger.info('Categories loaded from category-service', { count: names.length });
      return names;
    }
  } catch (e0) {
    logger.warn('category-service yüklenemedi, fallback devreye girdi', e0);
  }
  try {
    // Try to load from external file first
    const mod = await import('../../../categories.js');
    logger.info('Categories loaded from file', { count: mod.CATEGORIES?.length });
    // categories.js may export objects; normalize to display names
    const raw = mod.CATEGORIES || EMBEDDED_CATEGORIES;
    return Array.isArray(raw)
      ? raw.map(c => (typeof c === 'string' ? c : (c?.name || String(c)))).filter(Boolean)
      : EMBEDDED_CATEGORIES;
  } catch (e) {
    logger.warn('categories.js yüklenemedi, embedded kategoriler kullanılıyor', e);
    try {
      // Fallback: absolute path
      const mod2 = await import('/categories.js');
      logger.info('Categories loaded (fallback)', { count: mod2.CATEGORIES?.length });
      const raw2 = mod2.CATEGORIES || EMBEDDED_CATEGORIES;
      return Array.isArray(raw2)
        ? raw2.map(c => (typeof c === 'string' ? c : (c?.name || String(c)))).filter(Boolean)
        : EMBEDDED_CATEGORIES;
    } catch (e2) {
      logger.warn('categories.js yüklenemedi, embedded kategoriler kullanılıyor', e2);
      // Use embedded categories as final fallback
      logger.info('Using embedded categories', { count: EMBEDDED_CATEGORIES.length });
      return EMBEDDED_CATEGORIES;
    }
  }
}

// Simple category groups modal - BASIT VERSİYON
function initCategoryGroupsModal() {
  logger.info('Category groups modal initializing...');
  
  // Remove existing modal if any
  const existingModal = document.getElementById('categoryGroupsModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Create simple modal HTML (Teklifbul Rule v1.0 - A11Y: ARIA attributes)
  const modalHTML = `
    <div id="categoryGroupsModal" role="dialog" aria-modal="true" aria-labelledby="modalTitle" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000;">
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 24px; border-radius: 12px; max-width: 600px; width: 90%; max-height: 80%; overflow-y: auto;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 id="modalTitle" style="margin: 0; color: #1f2937;">🏷️ Kategori Grubu Oluştur</h2>
          <button id="closeModal" aria-label="Modalı kapat" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
        </div>
        
        <!-- Existing groups (manage) -->
        <div id="existingGroupsBox" style="margin-bottom: 16px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 10px;">
          <div style="display:flex; justify-content: space-between; align-items:center; gap:10px;">
            <div style="font-weight: 600; color:#111827;">Mevcut Gruplar</div>
            <button id="refreshGroupsBtn" type="button" style="padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 8px; background: #fff; cursor: pointer;">Yenile</button>
          </div>
          <div id="existingGroupsList" style="margin-top: 10px; display:flex; flex-direction:column; gap:8px;"></div>
        </div>
        
        <!-- Step 1: Group Name -->
        <div id="step1" class="modal-step">
          <div style="margin-bottom: 16px;">
            <label for="groupName" style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">Grup Adı *</label>
            <input type="text" id="groupName" placeholder="Örn: İnşaat Malzemeleri" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
            <p id="nameError" style="color: #dc2626; font-size: 12px; margin-top: 4px; display: none;"></p>
          </div>
          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button id="cancelStep1" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer;">İptal</button>
            <button id="nextStep" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">İlerle</button>
          </div>
        </div>
        
        <!-- Step 2: Category Selection - BASIT VERSİYON -->
        <div id="step2" class="modal-step" style="display: none;">
          <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151;">Kategoriler Seç *</label>
            <input type="text" id="categorySearch" placeholder="Kategori ara..." style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;">
          </div>
          
          <!-- BASIT KATEGORİ LİSTESİ -->
          <div style="border: 2px solid #3b82f6; background: #f0f9ff; padding: 20px; margin: 10px 0; border-radius: 8px;">
            <h4 style="margin: 0 0 15px 0; color: #1e40af;">📋 Mevcut Kategoriler:</h4>
            <div id="categoryList" style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; min-height: 300px; max-height: 400px; overflow-y: auto;">
              <!-- Categories will be populated here -->
            </div>
          </div>
          
          <div style="margin-top: 16px;">
            <p style="font-size: 12px; color: #6b7280; margin: 0;">
              <span id="selectedCount">0</span> kategori seçildi
            </p>
          </div>
          
          <div style="margin-top: 20px; display: flex; gap: 12px; justify-content: flex-end;">
            <button id="backStep" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer;">Geri</button>
            <button id="saveGroup" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer;">Kaydet</button>
          </div>
        </div>
        
      </div>
    </div>
  `;
  
  // Add modal to page
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  logger.info('Modal HTML added to page');
  
  // Get modal elements
  const modal = document.getElementById('categoryGroupsModal');
  const closeBtn = document.getElementById('closeModal');
  const groupNameInput = document.getElementById('groupName');
  const nameError = document.getElementById('nameError');
  const nextStepBtn = document.getElementById('nextStep');
  const backStepBtn = document.getElementById('backStep');
  const saveGroupBtn = document.getElementById('saveGroup');
  const cancelStep1Btn = document.getElementById('cancelStep1');
  const categorySearch = document.getElementById('categorySearch');
  const categoryList = document.getElementById('categoryList');
  const selectedCount = document.getElementById('selectedCount');
  const existingGroupsList = document.getElementById('existingGroupsList');
  const refreshGroupsBtn = document.getElementById('refreshGroupsBtn');
  
  logger.info('Modal element found', { modal: !!modal });
  
  // State
  let currentStep = 1;
  let selectedCategories = new Set();
  let allCategories = [];
  let editingGroupId = null;
  let currentUser = null;
  
  // Event listeners
  closeBtn.addEventListener('click', closeModal);
  cancelStep1Btn.addEventListener('click', closeModal);
  
  nextStepBtn.addEventListener('click', () => {
    const groupName = groupNameInput.value.trim();
    if (!groupName) {
      nameError.textContent = 'Grup adı gereklidir';
      nameError.style.display = 'block';
      return;
    }
    
    nameError.style.display = 'none';
    showStep(2);
  });
  
  backStepBtn.addEventListener('click', () => {
    showStep(1);
  });
  
  saveGroupBtn.addEventListener('click', async () => {
    if (selectedCategories.size === 0) {
      toast.warn(MESSAGES.WARN_VALIDATION || 'Dikkat: En az 1 kategori seçin');
      return;
    }
    
    const groupName = groupNameInput.value.trim();
    // Teklifbul Rule v1.0 - category.toLowerCase hatası düzeltildi
    const normalizedCategories = Array.from(selectedCategories)
      .map(category =>
        typeof category === 'string'
          ? category.trim()
          : String(category || '').trim()
      )
      .filter(name => name.length > 0);
    
    try {
      toast.info(MESSAGES.INFO_SAVING || MESSAGES.INFO_WAIT);
      saveGroupBtn.disabled = true;

      if (!currentUser) currentUser = await requireAuth();
      if (editingGroupId) {
        await updateGroup(currentUser.uid, editingGroupId, { name: groupName, categories: normalizedCategories });
        toast.success(MESSAGES.SUCCESS_UPDATE || 'İşlem tamamlandı');
      } else {
        await createGroup(currentUser.uid, { name: groupName, categories: normalizedCategories });
        toast.success(MESSAGES.SUCCESS_SAVE || 'İşlem tamamlandı');
      }

      // Notify page to refresh groups
      window.dispatchEvent(new CustomEvent('categoryGroups:changed'));
      closeModal();
      await loadAndRenderGroups();
    } catch (error) {
      logger.error('Error saving group', error);
      toast.error(`${MESSAGES.ERROR_SAVE || 'Hata'}: ${error?.message || error}`);
    } finally {
      saveGroupBtn.disabled = false;
    }
  });
  
  // Category search
  categorySearch.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    populateCategories(searchTerm);
  });
  
  // Functions
  function showStep(step) {
    currentStep = step;
    
    // Hide all steps
    document.querySelectorAll('.modal-step').forEach(stepEl => {
      stepEl.style.display = 'none';
    });
    
    // Show current step
    document.getElementById(`step${step}`).style.display = 'block';
    
    if (step === 2) {
      loadAndPopulateCategories();
    }
  }
  
  async function loadAndPopulateCategories() {
    logger.info('Loading categories...');
    allCategories = await loadCategories();
    logger.info('Categories loaded', { count: allCategories.length });
    populateCategories();
  }
  
  function populateCategories(searchTerm = '') {
    logger.info('Populating categories...');
    
    // Clear existing categories
    categoryList.innerHTML = '';
    
    // Filter categories based on search
    // Teklifbul Rule v1.0 - category.toLowerCase hatası düzeltildi
    const filteredCategories = allCategories.filter(category => {
      const categoryName = typeof category === 'string' 
        ? category.trim() 
        : String(category?.name || category || '').trim();
      return categoryName.toLowerCase().includes(searchTerm.toLowerCase());
    });
    
    logger.info(`Showing ${filteredCategories.length} categories`);
    
    // Add each category
    filteredCategories.forEach(category => {
      // Teklifbul Rule v1.0 - category.toLowerCase hatası düzeltildi
      const categoryName = typeof category === 'string' 
        ? category.trim() 
        : String(category?.name || category || '').trim();
      const categoryDisplay = typeof category === 'string' 
        ? category 
        : (category?.name || String(category || ''));
      
      const isSelected = selectedCategories.has(categoryName);
      
      const categoryDiv = document.createElement('div');
      categoryDiv.style.cssText = `
        display: flex !important;
        align-items: center !important;
        padding: 12px !important;
        margin: 8px 0 !important;
        border-radius: 8px !important;
        cursor: pointer !important;
        background-color: ${isSelected ? '#dbeafe' : '#f8fafc'} !important;
        border: 2px solid ${isSelected ? '#3b82f6' : '#e5e7eb'} !important;
        min-height: 50px !important;
        width: 100% !important;
        font-size: 16px !important;
        font-weight: 500 !important;
        visibility: visible !important;
        opacity: 1 !important;
        position: relative !important;
        z-index: 1 !important;
      `;
      
      // Teklifbul Rule v1.0 - Kategori öneri sistemi: tooltip ve detay desteği
      categoryDiv.innerHTML = `
        <input type="checkbox" ${isSelected ? 'checked' : ''} style="margin-right: 12px; width: 20px; height: 20px; transform: scale(1.2);">
        <span style="flex: 1; color: #1f2937;">${categoryDisplay}</span>
        <span class="category-info-icon" data-category="${categoryName}" 
              style="margin-left: 8px; cursor: pointer; color: #3b82f6; font-size: 18px;"
              title="Kategori bilgisi" aria-label="Kategori bilgisi">
          ⓘ
        </span>
      `;
      
      // Tooltip için event listener
      const infoIcon = categoryDiv.querySelector('.category-info-icon');
      if (infoIcon) {
        infoIcon.addEventListener('click', (e) => {
          e.stopPropagation();
          showCategoryInfo(categoryName);
        });
        
        // Hover tooltip (basit)
        let tooltipTimeout;
        infoIcon.addEventListener('mouseenter', () => {
          tooltipTimeout = setTimeout(() => {
            loadCategoryTooltip(categoryName, infoIcon);
          }, 500);
        });
        infoIcon.addEventListener('mouseleave', () => {
          clearTimeout(tooltipTimeout);
          hideTooltip();
        });
      }
      
      // Checkbox change handler - daha güvenilir
      const checkbox = categoryDiv.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
          selectedCategories.add(categoryName);
          categoryDiv.style.backgroundColor = '#dbeafe';
          categoryDiv.style.borderColor = '#3b82f6';
        } else {
          selectedCategories.delete(categoryName);
          categoryDiv.style.backgroundColor = '#f8fafc';
          categoryDiv.style.borderColor = '#e5e7eb';
        }
        updateSelectedCount();
      });
      
      // Click handler - tüm div'e tıklanınca checkbox'ı toggle et
      categoryDiv.addEventListener('click', (e) => {
        // Checkbox veya info icon'a tıklanmışsa işlem yapma
        if (e.target.type === 'checkbox' || e.target.classList.contains('category-info-icon')) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      });
      
      categoryList.appendChild(categoryDiv);
      logger.info(`Category "${category}" added to DOM`);
    });
    
    updateSelectedCount();
    logger.info(`${filteredCategories.length} categories rendered`);
    
    // AGGRESSIVE CSS FORCE - Container
    categoryList.style.cssText = `
      background: white !important;
      border: 2px solid #3b82f6 !important;
      border-radius: 6px !important;
      padding: 15px !important;
      min-height: 300px !important;
      max-height: 400px !important;
      overflow-y: auto !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      position: relative !important;
      z-index: 1 !important;
    `;
    
    logger.info('AGGRESSIVE CSS forced for categoryList');
  }
  
  function updateSelectedCount() {
    selectedCount.textContent = selectedCategories.size;
  }
  
  // Teklifbul Rule v1.0 - Kategori bilgi tooltip ve detay kartı
  let tooltipElement = null;
  let categoryDetailsCache = new Map();
  
  async function loadCategoryTooltip(categoryName, anchorElement) {
    try {
      // Cache kontrolü
      if (categoryDetailsCache.has(categoryName)) {
        showTooltip(categoryDetailsCache.get(categoryName), anchorElement);
        return;
      }
      
      // API'den kategori detayını al
      const { getCategoryDetails } = await import('/assets/js/services/category-suggest.js');
      const details = await getCategoryDetails(categoryName);
      
      if (details) {
        categoryDetailsCache.set(categoryName, details);
        showTooltip(details, anchorElement);
      }
    } catch (error) {
      logger.warn('Category tooltip load failed', error);
    }
  }
  
  function showTooltip(details, anchorElement) {
    if (!details.short_desc && (!details.examples || details.examples.length === 0)) {
      return; // Bilgi yoksa tooltip gösterme
    }
    
    // Mevcut tooltip'i kaldır
    if (tooltipElement) {
      tooltipElement.remove();
    }
    
    // Yeni tooltip oluştur
    tooltipElement = document.createElement('div');
    tooltipElement.style.cssText = `
      position: absolute;
      background: #1f2937;
      color: white;
      padding: 12px;
      border-radius: 8px;
      font-size: 13px;
      max-width: 300px;
      z-index: 10000;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      pointer-events: none;
    `;
    
    let content = `<div style="font-weight: 600; margin-bottom: 6px;">${details.name}</div>`;
    if (details.short_desc) {
      content += `<div style="margin-bottom: 6px; line-height: 1.4;">${details.short_desc}</div>`;
    }
    if (details.examples && details.examples.length > 0) {
      content += `<div style="font-size: 11px; color: #d1d5db; margin-top: 6px;">
        Örnekler: ${details.examples.slice(0, 4).join(', ')}
      </div>`;
    }
    
    tooltipElement.innerHTML = content;
    document.body.appendChild(tooltipElement);
    
    // Pozisyonlandır
    const rect = anchorElement.getBoundingClientRect();
    tooltipElement.style.top = `${rect.bottom + 8}px`;
    tooltipElement.style.left = `${rect.left}px`;
  }
  
  function hideTooltip() {
    if (tooltipElement) {
      tooltipElement.remove();
      tooltipElement = null;
    }
  }
  
  async function showCategoryInfo(categoryName) {
    try {
      const { getCategoryDetails } = await import('/assets/js/services/category-suggest.js');
      const details = await getCategoryDetails(categoryName);
      
      if (!details) {
        toast.warn(`"${categoryName}" kategorisi için detay bulunamadı.`);
        return;
      }
      
      // Modal veya kart göster
      let infoCard = document.getElementById('categoryInfoCard');
      if (!infoCard) {
        infoCard = document.createElement('div');
        infoCard.id = 'categoryInfoCard';
        infoCard.style.cssText = `
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          padding: 24px;
          border-radius: 12px;
          box-shadow: 0 10px 25px rgba(0,0,0,0.2);
          max-width: 500px;
          z-index: 10001;
        `;
        document.body.appendChild(infoCard);
      }
      
      let content = `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0; color: #1f2937;">${details.name}</h3>
        <button id="closeCategoryInfo" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
      </div>`;
      
      if (details.short_desc) {
        content += `<div style="margin-bottom: 16px; color: #374151; line-height: 1.6;">${details.short_desc}</div>`;
      }
      
      if (details.examples && details.examples.length > 0) {
        content += `<div style="margin-top: 16px;">
          <div style="font-weight: 600; margin-bottom: 8px; color: #1f2937;">Bu kategoride neler var?</div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${details.examples.map(ex => `<span style="background: #e0e7ff; color: #1e40af; padding: 4px 10px; border-radius: 12px; font-size: 12px;">${ex}</span>`).join('')}
          </div>
        </div>`;
      }
      
      infoCard.innerHTML = content;
      infoCard.style.display = 'block';
      
      // Kapat butonu
      document.getElementById('closeCategoryInfo').addEventListener('click', () => {
        infoCard.style.display = 'none';
      });
      
      // Dışarı tıklayınca kapat
      infoCard.addEventListener('click', (e) => {
        if (e.target === infoCard) {
          infoCard.style.display = 'none';
        }
      });
      
    } catch (error) {
      logger.error('Show category info failed', error);
      toast.error(MESSAGES.ERROR_CATEGORY_INFO_LOAD);
    }
  }
  
  // Teklifbul Rule v1.0 - A11Y: ESC tuşu ve focus trap için değişkenler
  let escHandler = null;
  let tabHandler = null;
  let previousActiveElement = null;

  function closeModal() {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    
    // Teklifbul Rule v1.0 - A11Y: Event listener'ları temizle
    if (escHandler) {
      document.removeEventListener('keydown', escHandler);
      escHandler = null;
    }
    if (tabHandler && modal) {
      const modalContent = modal.querySelector('div');
      if (modalContent) {
        modalContent.removeEventListener('keydown', tabHandler);
      }
      tabHandler = null;
    }
    
    // Önceki focus'a geri dön
    if (previousActiveElement instanceof HTMLElement) {
      previousActiveElement.focus();
      previousActiveElement = null;
    }
    
    // Reset form
    groupNameInput.value = '';
    nameError.style.display = 'none';
    selectedCategories.clear();
    editingGroupId = null;
    saveGroupBtn.textContent = 'Kaydet';
    document.getElementById('modalTitle').textContent = '🏷️ Kategori Grubu Oluştur';
    showStep(1);
  }
  
  function showModal(group = null) {
    logger.info('showModal called with group', group);
    
    // Teklifbul Rule v1.0 - A11Y: Önceki focus'u kaydet
    previousActiveElement = document.activeElement;
    
    if (group) {
      // Edit mode
      groupNameInput.value = group.name;
      selectedCategories = new Set(group.categories || []);
      editingGroupId = group.id || null;
      saveGroupBtn.textContent = 'Güncelle';
      document.getElementById('modalTitle').textContent = '🛠️ Grup Düzenle';
      showStep(2);
    } else {
      // Create mode
      groupNameInput.value = '';
      selectedCategories.clear();
      editingGroupId = null;
      saveGroupBtn.textContent = 'Kaydet';
      document.getElementById('modalTitle').textContent = '🏷️ Kategori Grubu Oluştur';
      showStep(1);
    }
    
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
    logger.info('Modal displayed');
    
    // Teklifbul Rule v1.0 - A11Y: Focus trap
    const modalContent = modal.querySelector('div');
    const focusableElements = modalContent.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0] || groupNameInput;
    const lastFocusable = focusableElements[focusableElements.length - 1] || groupNameInput;

    // İlk focusable element'e focus et
    setTimeout(() => {
      firstFocusable.focus();
    }, 100);

    // ESC tuşu ile kapatma
    escHandler = (e) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    document.addEventListener('keydown', escHandler);

    // Tab tuşu ile focus trap
    tabHandler = (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab (geri)
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        // Tab (ileri)
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    };
    modalContent.addEventListener('keydown', tabHandler);
    
    // Overlay tıklama ile kapatma
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }

  async function loadAndRenderGroups() {
    if (!existingGroupsList) return;
    try {
      existingGroupsList.innerHTML = '';
      if (!currentUser) currentUser = await requireAuth();
      const groups = await listGroupsForUser(currentUser.uid);
      if (!groups || groups.length === 0) {
        existingGroupsList.textContent = 'Henüz grup yok';
        return;
      }

      groups.forEach((g) => {
        const row = document.createElement('div');
        const count = Array.isArray(g.categories) ? g.categories.length : 0;
        row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px; border:1px solid #e5e7eb; border-radius:10px;';

        // Teklifbul Rule v1.0 - XSS koruma: g.name kullanici girdisi
        const left = document.createElement('div');
        left.style.cssText = 'min-width:0;';
        const safeName = DOMPurify.sanitize(String(g.name || '-'), { ALLOWED_TAGS: [] });
        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-weight:600; color:#111827; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        titleEl.innerHTML = safeName;
        const countEl = document.createElement('div');
        countEl.style.cssText = 'font-size:12px; color:#6b7280;';
        countEl.textContent = `${Number(count) || 0} kategori`;
        left.appendChild(titleEl);
        left.appendChild(countEl);

        const right = document.createElement('div');
        right.style.cssText = 'display:flex; gap:8px; align-items:center;';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.textContent = 'Düzenle';
        editBtn.title = 'Grubu düzenle';
        editBtn.setAttribute('aria-label', 'Grubu düzenle');
        editBtn.style.cssText = 'padding:6px 10px; border:1px solid #d1d5db; border-radius:8px; background:#fff; cursor:pointer;';
        editBtn.addEventListener('click', () => showModal(g));

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.textContent = 'Sil';
        delBtn.title = 'Grubu sil';
        delBtn.setAttribute('aria-label', 'Grubu sil');
        delBtn.style.cssText = 'padding:6px 10px; border:1px solid #d1d5db; border-radius:8px; background:#fff; cursor:pointer;';
        delBtn.addEventListener('click', async () => {
          try {
            const ok = window.confirm('Bu grup silinsin mi?');
            if (!ok) return;
            toast.info(MESSAGES.INFO_PROCESSING || MESSAGES.INFO_WAIT);
            await deleteGroup(currentUser.uid, g.id);
            toast.success(MESSAGES.SUCCESS_DELETE || 'İşlem tamamlandı');
            window.dispatchEvent(new CustomEvent('categoryGroups:changed'));
            await loadAndRenderGroups();
          } catch (err) {
            logger.error('Delete group failed', err);
            toast.error(`${MESSAGES.ERROR_DELETE || 'Hata'}: ${err?.message || err}`);
          }
        });

        right.append(editBtn, delBtn);
        row.append(left, right);
        existingGroupsList.appendChild(row);
      });
    } catch (err) {
      logger.error('loadAndRenderGroups failed', err);
      existingGroupsList.textContent = 'Gruplar yüklenemedi';
    }
  }

  refreshGroupsBtn?.addEventListener('click', () => {
    loadAndRenderGroups().catch((e) => logger.warn('refreshGroups failed', e));
  });
  
  // Public API
  return {
    showModal,
    showEditModal: (group) => showModal(group),
    refreshGroups: () => loadAndRenderGroups()
  };
}

// Initialize modal
const categoryGroupsModal = initCategoryGroupsModal();

// Export for use in other files
window.categoryGroupsModal = categoryGroupsModal;

logger.info('Category groups modal initialized');