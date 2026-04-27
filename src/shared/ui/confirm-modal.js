/**
 * Basit Onay Modalı
 * Teklifbul Rule v1.0 - Toast sistemi yerine kullanılacak
 */

/**
 * Onay modalını gösterir ve sonucu promise olarak döner
 * @param {string} message - Onay mesajı
 * @param {string} confirmText - Onay butonu metni (varsayılan: "Evet")
 * @param {string} cancelText - İptal butonu metni (varsayılan: "İptal")
 * @returns {Promise<boolean>} - Kullanıcı onay verirse true, iptal ederse false
 */
export function showConfirmModal(message, confirmText = 'Evet', cancelText = 'İptal') {
  return new Promise((resolve) => {
    // Teklifbul Rule v1.0 - A11Y: Unique ID for modal
    const modalId = `confirmModal-${Date.now()}`;
    const titleId = `confirmModal-title-${Date.now()}`;

    // Modal container oluştur
    const modalOverlay = document.createElement('div');
    modalOverlay.id = modalId;
    modalOverlay.setAttribute('role', 'dialog');
    modalOverlay.setAttribute('aria-modal', 'true');
    modalOverlay.setAttribute('aria-labelledby', titleId);
    modalOverlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white;
      width: 100%;
      max-width: 400px;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 20px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;
    header.innerHTML = `
      <h3 id="${titleId}" style="margin:0; font-size:18px; font-weight:600; color:#1f2937;">Onay</h3>
      <button id="closeConfirmModal" aria-label="Modalı kapat" style="background:none; border:none; font-size:24px; cursor:pointer; color:#6b7280; padding:0; width:32px; height:32px; display:flex; align-items:center; justify-content:center;">&times;</button>
    `;

    // Body
    const body = document.createElement('div');
    body.style.cssText = `
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;
    
    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    messageEl.style.cssText = `
      margin: 0;
      font-size: 16px;
      color: #374151;
      line-height: 1.5;
    `;
    body.appendChild(messageEl);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 20px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'confirmCancelBtn';
    cancelBtn.textContent = cancelText;
    cancelBtn.style.cssText = `
      padding: 10px 16px;
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
      font-size: 14px;
    `;

    const confirmBtn = document.createElement('button');
    confirmBtn.id = 'confirmApproveBtn';
    confirmBtn.textContent = confirmText;
    confirmBtn.style.cssText = `
      padding: 10px 16px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
      font-size: 14px;
    `;

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);

    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modalContent.appendChild(footer);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    // Teklifbul Rule v1.0 - A11Y: Focus trap
    const focusableElements = [closeBtn, cancelBtn, confirmBtn].filter(Boolean);
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    // İlk focusable element'e focus et
    if (firstFocusable) {
      setTimeout(() => firstFocusable.focus(), 100);
    }

    // Tab tuşu ile focus trap
    const handleTab = (e) => {
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
    modalContent.addEventListener('keydown', handleTab);

    const closeModal = () => {
      document.removeEventListener('keydown', handleEsc);
      modalContent.removeEventListener('keydown', handleTab);
      if (modalOverlay.parentNode) {
        document.body.removeChild(modalOverlay);
      }
    };

    // Event listeners
    closeBtn.addEventListener('click', () => {
      resolve(false);
      closeModal();
    });

    cancelBtn.addEventListener('click', () => {
      resolve(false);
      closeModal();
    });

    confirmBtn.addEventListener('click', () => {
      resolve(true);
      closeModal();
    });

    // ESC tuşu ile kapatma
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        resolve(false);
        closeModal();
      }
    };
    document.addEventListener('keydown', handleEsc);

    // Overlay tıklama ile kapatma (modal içeriğine tıklamada kapanmaz)
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        resolve(false);
        closeModal();
      }
    });
  });
}