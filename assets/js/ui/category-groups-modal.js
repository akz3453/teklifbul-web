/**
 * Category Groups Modal UI - BASIT VERSİYON
 * Test sayfasındaki gibi çalışan basit modal
 */

// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../../src/shared/log/logger.js';

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
    // Try to load from external file first
    const mod = await import('../../../categories.js');
    logger.info('Categories loaded from file', { count: mod.CATEGORIES?.length });
    return mod.CATEGORIES || EMBEDDED_CATEGORIES;
  } catch (e) {
    logger.warn('categories.js yüklenemedi, embedded kategoriler kullanılıyor', e);
    try {
      // Fallback: absolute path
      const mod2 = await import('/categories.js');
      logger.info('Categories loaded (fallback)', { count: mod2.CATEGORIES?.length });
      return mod2.CATEGORIES || EMBEDDED_CATEGORIES;
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
  
  // Create simple modal HTML
  const modalHTML = `
    <div id="categoryGroupsModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000;">
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 24px; border-radius: 12px; max-width: 600px; width: 90%; max-height: 80%; overflow-y: auto;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 id="modalTitle" style="margin: 0; color: #1f2937;">🏷️ Kategori Grubu Oluştur</h2>
          <button id="closeModal" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
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
  
  logger.info('Modal element found', { modal: !!modal });
  
  // State
  let currentStep = 1;
  let selectedCategories = new Set();
  let allCategories = [];
  
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
      alert('En az bir kategori seçmelisiniz');
      return;
    }
    
    const groupName = groupNameInput.value.trim();
    const groupData = {
      name: groupName,
      categories: Array.from(selectedCategories),
      createdAt: new Date().toISOString()
    };
    
    try {
      // Save group (you can implement this)
      logger.info('Saving group', groupData);
      alert(`Grup "${groupName}" başarıyla oluşturuldu!`);
      closeModal();
    } catch (error) {
      logger.error('Error saving group', error);
      alert('Grup kaydedilirken hata oluştu');
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
    const filteredCategories = allCategories.filter(category => 
      category.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    logger.info(`Showing ${filteredCategories.length} categories`);
    
    // Add each category
    filteredCategories.forEach(category => {
      const isSelected = selectedCategories.has(category);
      
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
        <span style="flex: 1; color: #1f2937;">${category}</span>
        <span class="category-info-icon" data-category="${category}" 
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
          showCategoryInfo(category);
        });
        
        // Hover tooltip (basit)
        let tooltipTimeout;
        infoIcon.addEventListener('mouseenter', () => {
          tooltipTimeout = setTimeout(() => {
            loadCategoryTooltip(category, infoIcon);
          }, 500);
        });
        infoIcon.addEventListener('mouseleave', () => {
          clearTimeout(tooltipTimeout);
          hideTooltip();
        });
      }
      
      // Click handler
      categoryDiv.addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox') {
          const checkbox = categoryDiv.querySelector('input[type="checkbox"]');
          checkbox.checked = !checkbox.checked;
        }
        
        const checkbox = categoryDiv.querySelector('input[type="checkbox"]');
        if (checkbox.checked) {
          selectedCategories.add(category);
          categoryDiv.style.backgroundColor = '#dbeafe';
          categoryDiv.style.borderColor = '#3b82f6';
        } else {
          selectedCategories.delete(category);
          categoryDiv.style.backgroundColor = '#f8fafc';
          categoryDiv.style.borderColor = '#e5e7eb';
        }
        
        updateSelectedCount();
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
        alert(`"${categoryName}" kategorisi için detay bulunamadı.`);
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
      alert('Kategori bilgisi yüklenirken hata oluştu.');
    }
  }
  
  function closeModal() {
    modal.style.display = 'none';
    // Reset form
    groupNameInput.value = '';
    nameError.style.display = 'none';
    selectedCategories.clear();
    showStep(1);
  }
  
  function showModal(group = null) {
    logger.info('showModal called with group', group);
    
    if (group) {
      // Edit mode
      groupNameInput.value = group.name;
      selectedCategories = new Set(group.categories || []);
      showStep(2);
    } else {
      // Create mode
      groupNameInput.value = '';
      selectedCategories.clear();
      showStep(1);
    }
    
    modal.style.display = 'block';
    logger.info('Modal displayed');
  }
  
  // Public API
  return {
    showModal,
    showEditModal: (group) => showModal(group)
  };
}

// Initialize modal
const categoryGroupsModal = initCategoryGroupsModal();

// Export for use in other files
window.categoryGroupsModal = categoryGroupsModal;

logger.info('Category groups modal initialized');