/**
 * Category Groups Modal UI - BASIT VERSİYON
 * Test sayfasındaki gibi çalışan basit modal
 */

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
    console.log('✅ Categories loaded from file:', mod.CATEGORIES);
    return mod.CATEGORIES || EMBEDDED_CATEGORIES;
  } catch (e) {
    console.warn('categories.js yüklenemedi, embedded kategoriler kullanılıyor:', e);
    try {
      // Fallback: absolute path
      const mod2 = await import('/categories.js');
      console.log('✅ Categories loaded (fallback):', mod2.CATEGORIES);
      return mod2.CATEGORIES || EMBEDDED_CATEGORIES;
    } catch (e2) {
      console.warn('categories.js yüklenemedi, embedded kategoriler kullanılıyor:', e2);
      // Use embedded categories as final fallback
      console.log('✅ Using embedded categories:', EMBEDDED_CATEGORIES);
      return EMBEDDED_CATEGORIES;
    }
  }
}

// Simple category groups modal - BASIT VERSİYON
function initCategoryGroupsModal() {
  console.log('🔄 Category groups modal initializing...');
  
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
  console.log('✅ Modal HTML added to page');
  
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
  
  console.log('✅ Modal element found:', modal);
  
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
      console.log('💾 Saving group:', groupData);
      alert(`Grup "${groupName}" başarıyla oluşturuldu!`);
      closeModal();
    } catch (error) {
      console.error('Error saving group:', error);
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
    console.log('🔄 Loading categories...');
    allCategories = await loadCategories();
    console.log('✅ Categories loaded:', allCategories);
    populateCategories();
  }
  
  function populateCategories(searchTerm = '') {
    console.log('🔄 Populating categories...');
    
    // Clear existing categories
    categoryList.innerHTML = '';
    
    // Filter categories based on search
    const filteredCategories = allCategories.filter(category => 
      category.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    console.log(`📋 Showing ${filteredCategories.length} categories`);
    
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
      
      categoryDiv.innerHTML = `
        <input type="checkbox" ${isSelected ? 'checked' : ''} style="margin-right: 12px; width: 20px; height: 20px; transform: scale(1.2);">
        <span style="flex: 1; color: #1f2937;">${category}</span>
      `;
      
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
      console.log(`✅ Category "${category}" added to DOM`);
    });
    
    updateSelectedCount();
    console.log(`✅ ${filteredCategories.length} categories rendered`);
    
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
    
    console.log('🔧 AGGRESSIVE CSS forced for categoryList');
  }
  
  function updateSelectedCount() {
    selectedCount.textContent = selectedCategories.size;
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
    console.log('🔄 showModal called with group:', group);
    
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
    console.log('✅ Modal displayed');
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

console.log('✅ Category groups modal initialized');