/**
 * Yapay zekâ satın alma asistanı widget'ı
 * Teklifbul Rule v1.0 - AI Purchase Assistant Widget
 */

// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../src/shared/log/logger.js';
// Teklifbul Rule v1.0 - Toast bildirim sistemi
import { toast } from '../../src/shared/ui/toast.js';
import { MESSAGES } from '../../src/shared/constants/messages.js';
// Teklifbul Rule v1.0 - XSS Protection
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';
import { requireCompanyContext } from './state/company-context.js';
import { initPermissions, requireExistingPerm, getAiPerms } from './state/permissions.js';

class AIAssistantWidget {
  constructor() {
    this.isOpen = false;
    this.messages = [];
    // Teklifbul Rule v1.0 - Long async ops must be cancelable
    this.inFlight = false;
    this.abortController = null;
    this.abortTimeoutId = null;
    this.init();
  }

  init() {
    // Widget HTML'ini oluştur
    this.createWidget();
    this.attachEventListeners();
  }

  createWidget() {
    const widgetHTML = `
      <div id="ai-assistant-widget" class="ai-assistant-widget">
        <!-- Chat Panel -->
        <div id="ai-assistant-panel" class="ai-assistant-panel">
          <div class="ai-assistant-header">
            <div class="ai-assistant-header-info">
              <h3><span class="ai-status-dot"></span> Nefisoft AI Asistanı</h3>
              <div class="ai-assistant-header-subtitle">Yapay zeka ile anında destek</div>
            </div>
            <div class="ai-assistant-header-actions">
              <button id="ai-assistant-cancel" class="ai-header-btn" type="button" aria-label="İptal" title="Yanıtı Durdur" style="display:none; color:#ef4444;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
              </button>
              <button id="ai-assistant-close" class="ai-header-btn" aria-label="Kapat">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>
          
          <div id="ai-assistant-messages" class="ai-assistant-messages">
            <!-- Welcome Message -->
            <div class="ai-message-group assistant">
              <div class="ai-avatar assistant">🤖</div>
              <div class="ai-bubble">
                Merhaba! Ben Nefisoft yapay zekâ asistanınızım. Talep oluşturma, teklif toplama (Teklifbul), satış yönetimi, fatura/irsaliye, stok takibi ve hakediş süreçlerinizle ilgili size nasıl yardımcı olabilirim?
              </div>
            </div>
          </div>

          <div class="ai-assistant-input-area">
            <div class="ai-input-wrapper">
              <textarea
                id="ai-assistant-input"
                class="ai-assistant-textarea"
                placeholder="Bir şeyler sorun..."
                rows="1"
              ></textarea>
              <button id="ai-assistant-send" class="ai-send-btn" aria-label="Gönder">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Toggle Button -->
        <div class="ai-assistant-label">Bana Sorun 👋</div>
        <button id="ai-assistant-toggle" class="ai-assistant-toggle" aria-label="Nefisoft AI Asistanı">
          <span class="ai-assistant-icon">🤖</span>
          <span class="ai-assistant-close-icon">×</span>
        </button>
      </div>
    `;

    // Widget'ı body'ye ekle
    document.body.insertAdjacentHTML('beforeend', widgetHTML);
  }

  attachEventListeners() {
    const toggleBtn = document.getElementById('ai-assistant-toggle');
    const closeBtn = document.getElementById('ai-assistant-close');
    const cancelBtn = document.getElementById('ai-assistant-cancel');
    const sendBtn = document.getElementById('ai-assistant-send');
    const input = document.getElementById('ai-assistant-input');
    const panel = document.getElementById('ai-assistant-panel');

    // Toggle button
    toggleBtn?.addEventListener('click', () => {
      this.toggle();
    });

    // Close button
    closeBtn?.addEventListener('click', () => {
      this.close();
    });

    // Cancel current request
    cancelBtn?.addEventListener('click', () => {
      this.cancelRequest();
    });

    // Send button
    sendBtn?.addEventListener('click', () => {
      this.sendMessage();
    });

    // Auto-resize textarea
    input?.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
      if (this.value === '') this.style.height = 'auto';
    });

    // Enter key (Ctrl/Cmd+Enter to send, single Enter = new line)
    input?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey || !e.shiftKey) && e.key === 'Enter') {
        e.preventDefault();
        this.sendMessage();
        // Reset height
        input.style.height = 'auto';
      }
    });

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  toggle() {
    this.isOpen = !this.isOpen;
    const panel = document.getElementById('ai-assistant-panel');
    const toggleBtn = document.getElementById('ai-assistant-toggle');

    if (panel) {
      if (this.isOpen) {
        panel.classList.add('open');
        toggleBtn?.classList.add('active');
        // Focus input
        setTimeout(() => {
          const input = document.getElementById('ai-assistant-input');
          input?.focus();
        }, 300); // Wait for transition

        // Scroll to bottom on open
        const messagesContainer = document.getElementById('ai-assistant-messages');
        if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
      } else {
        panel.classList.remove('open');
        toggleBtn?.classList.remove('active');
      }
    }
  }

  close() {
    this.isOpen = false;
    const panel = document.getElementById('ai-assistant-panel');
    const toggleBtn = document.getElementById('ai-assistant-toggle');
    if (panel) {
      panel.classList.remove('open');
      toggleBtn?.classList.remove('active');
    }
  }

  // Teklifbul Rule v1.0 - Cancel support for long operations
  cancelRequest() {
    try {
      if (this.abortTimeoutId) {
        clearTimeout(this.abortTimeoutId);
        this.abortTimeoutId = null;
      }
      if (this.abortController) {
        this.abortController.abort();
      }
      toast.info(MESSAGES?.INFO_PLEASE_WAIT || 'İşlem iptal edildi.');
      logger.info('AI assistant request cancelled by user');
    } catch (e) {
      logger.warn('AI assistant cancel failed', e);
    }
  }

  setInFlight(isInFlight) {
    this.inFlight = !!isInFlight;
    const cancelBtn = document.getElementById('ai-assistant-cancel');
    if (cancelBtn) {
      if (this.inFlight) {
        cancelBtn.style.display = 'flex'; // Changed to flex for icon centering
        cancelBtn.disabled = false;
      } else {
        cancelBtn.disabled = true;
        cancelBtn.style.display = 'none';
      }
    }
  }

  async sendMessage() {
    const input = document.getElementById('ai-assistant-input');
    const message = input?.value?.trim();

    if (!message) {
      return;
    }
    if (this.inFlight) {
      toast.info(MESSAGES?.INFO_PLEASE_WAIT || 'Lütfen bekleyin...');
      return;
    }

    // Kullanıcı mesajını göster
    this.addMessage(message, 'user');

    // Input'u temizle
    if (input) {
      input.value = '';
      input.disabled = true;
      input.style.height = 'auto'; // Reset height
    }

    // Gönder butonunu devre dışı bırak
    const sendBtn = document.getElementById('ai-assistant-send');
    if (sendBtn) {
      sendBtn.disabled = true;
    }

    // Loading mesajı
    const loadingId = this.addMessage('Asistan düşünüyor...', 'assistant', true);

    try {
      logger.group('AI Assistant Request');
      logger.info('Sending message to AI assistant', { message: message.substring(0, 50) });
      this.setInFlight(true);

      // Şirket context'i ve yetki kontrolü
      const ctx = await requireCompanyContext({ redirectOnPending: true });
      if (!ctx || !ctx.companyId) {
        throw new Error(
          (MESSAGES.ERROR_COMPANY_ID_REQUIRED || 'Şirket bilgisi doğrulanamadı') +
          '. AI asistanını kullanamazsınız.'
        );
      }

      const permState = await initPermissions({ redirectOnPending: true });
      if (!permState) {
        throw new Error(
          (MESSAGES.ERROR_PERMISSION || 'Yetki bilgileri yüklenemedi') +
          '. AI asistanını kullanamazsınız.'
        );
      }

      const aiPerms = getAiPerms();
      const aiUseKey = aiPerms && aiPerms.use;
      const okAi = await requireExistingPerm(aiUseKey, {
        toastMessage:
          (MESSAGES.ERROR_PERMISSION_AI_USE ||
            MESSAGES.ERROR_PERMISSION_DENIED ||
            MESSAGES.ERROR_PERMISSION) ??
          'AI satın alma asistanını kullanma yetkiniz yok.'
      });
      if (!okAi) {
        logger.warn('AI Assistant: ai.use izni yok veya şablonu eksik, istek iptal edildi', {
          permKey: aiUseKey || 'premium.ai.useAssistant',
          companyId: permState.companyId,
          roleKey: permState.roleKey
        });
        // Loading mesajını kaldır ve UI'yı eski haline getir
        this.removeMessage(loadingId);
        if (input) {
          input.disabled = false;
          input.focus();
        }
        if (sendBtn) {
          sendBtn.disabled = false;
        }
        logger.end();
        return;
      }

      // Kullanıcı oturum kontrolü
      const { auth } = await import('../../firebase.js');
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Giriş yapmanız gerekiyor');
      }

      // API'ye istek gönder
      this.abortController = new AbortController();
      // Teklifbul Rule v1.0 - Timeout + cancel
      this.abortTimeoutId = setTimeout(() => this.abortController?.abort(), 30000); // 30 saniye timeout

      // Teklifbul Rule v1.0 - Ortak authFetch helper kullan
      const { authFetch } = await import('./utils/api-helpers.js');
      const response = await authFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: message
        }),
        signal: this.abortController.signal
      });

      if (this.abortTimeoutId) {
        clearTimeout(this.abortTimeoutId);
        this.abortTimeoutId = null;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          throw new Error('Giriş yapmanız gerekiyor');
        } else if (response.status === 402) {
          // Widget-specific handling: remove loading message and show assistant message
          const msg = errorData?.message || 'AI token paketi gerekli.';
          this.removeMessage(loadingId);
          this.addMessage(
            `${msg}\n\nToken paketi satın almak için: [Premium Hesap](/settings.html#premium)`,
            'assistant'
          );
          logger.warn('AI assistant blocked by insufficient tokens', { status: 402, errorData });
          logger.end();
          return;
        } else if (response.status === 403) {
          throw new Error('Bu özellik için yetkiniz yok');
        } else if (response.status === 429) {
          const retryAfterSec = errorData?.retryAfterSec || 60;
          const msg = `Çok hızlı istek gönderildi. ${retryAfterSec} sn sonra tekrar deneyin.`;
          this.removeMessage(loadingId);
          this.addMessage(msg, 'assistant');
          toast.error(msg);
          logger.warn('AI assistant rate limited', { status: 429, retryAfterSec, errorData });
          logger.end();
          return;
        } else {
          throw new Error(errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }
      }

      const data = await response.json();

      // Backend { answer } döner (reply değil!)
      const assistantMessage =
        typeof data?.answer === 'string'
          ? data.answer
          : typeof data?.reply === 'string'
            ? data.reply
            : 'Üzgünüm, bir hata oluştu. Lütfen daha sonra tekrar deneyin.';

      // Loading mesajını kaldır
      this.removeMessage(loadingId);

      // Asistan cevabını göster
      this.addMessage(assistantMessage, 'assistant');

      logger.info('AI assistant response received');
      logger.end();

    } catch (error) {
      const isAbort =
        error?.name === 'AbortError' ||
        String(error?.message || '').toLowerCase().includes('abort');

      if (isAbort) {
        logger.warn('AI assistant request aborted', { name: error?.name, message: error?.message });
      } else {
        logger.error('AI assistant error', error);
      }
      logger.end();

      // Loading mesajını kaldır
      this.removeMessage(loadingId);

      // Hata mesajını göster
      if (isAbort) {
        this.addMessage('İşlem iptal edildi.', 'assistant');
        toast.info(MESSAGES?.INFO_PLEASE_WAIT || 'İşlem iptal edildi.');
      } else {
        this.addMessage('Üzgünüm, bir hata oluştu. Lütfen daha sonra tekrar deneyin.', 'assistant');
        toast.error(`${MESSAGES.ERROR_AI_ASSISTANT_RESPONSE}: ${error.message}`);
      }
    } finally {
      this.setInFlight(false);
      this.abortController = null;
      if (this.abortTimeoutId) {
        clearTimeout(this.abortTimeoutId);
        this.abortTimeoutId = null;
      }
      // Input ve butonu tekrar aktif et
      if (input) {
        input.disabled = false;
        input.focus();
      }
      if (sendBtn) {
        sendBtn.disabled = false;
      }
    }
  }

  addMessage(content, type, isLoading = false) {
    const messagesContainer = document.getElementById('ai-assistant-messages');
    if (!messagesContainer) return null;

    const messageId = `msg-${Date.now()}-${Math.random()}`;
    const avatar = type === 'user' ? '👤' : '🤖';

    // Teklifbul Rule v1.0 - XSS Protection
    const safeText = DOMPurify.sanitize(String(content || ''), { ALLOWED_TAGS: [] });
    // Markdown format for assistant unless it's just raw text loading
    let innerContent = safeText;

    if (type === 'assistant' && !isLoading) {
      innerContent = DOMPurify.sanitize(this.formatMarkdown(String(content || '')), {
        ALLOWED_TAGS: ['h1', 'h2', 'h3', 'p', 'br', 'strong', 'ul', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'code', 'pre', 'a', 'span', 'div'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style']
      });
    } else if (isLoading) {
      // Modern typing indicator
      innerContent = `
         <div class="ai-typing">
           <div class="ai-typing-dot"></div>
           <div class="ai-typing-dot"></div>
           <div class="ai-typing-dot"></div>
         </div>
       `;
    }

    const messageHTML = `
      <div id="${messageId}" class="ai-message-group ${type}">
        <div class="ai-avatar ${type}">${avatar}</div>
        <div class="ai-bubble">
          ${innerContent}
        </div>
      </div>
    `;

    messagesContainer.insertAdjacentHTML('beforeend', messageHTML);

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return messageId;
  }

  removeMessage(messageId) {
    const message = document.getElementById(messageId);
    if (message) {
      message.remove();
    }
  }

  formatMarkdown(text) {
    // Basit markdown formatlama
    // Başlıklar
    text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    text = text.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Kalın
    text = text.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');

    // Liste
    text = text.replace(/^\- (.*$)/gim, '<li>$1</li>');
    text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Tablo (basit)
    text = text.replace(/\|(.*)\|/gim, (match) => {
      const cells = match.split('|').filter(c => c.trim());
      if (cells.length > 0) {
        return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
      }
      return match;
    });

    // Satır sonları
    text = text.replace(/\n/g, '<br>');

    return text;
  }
}

// Widget'ı başlat
let aiAssistantWidget = null;

// DOM yüklendiğinde widget'ı başlat
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    aiAssistantWidget = new AIAssistantWidget();
  });
} else {
  aiAssistantWidget = new AIAssistantWidget();
}

export default AIAssistantWidget;
