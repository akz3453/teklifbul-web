/**
 * Teklifbul Chat Widget
 * Floating chat assistant widget
 */

import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.2/+esm';
import { t } from './i18n.js';
import { auth } from '../firebase.js';
import { logger } from '../../src/shared/log/logger.js';
import { isCategoryAllowed, onCookieConsentChange } from './cookieConsent.js';

let chatPanel = null;
let chatButton = null;
let isOpen = false;
let isInitialized = false;
let isConsentListenerBound = false;

/**
 * Initialize chat widget
 * Named export for ES modules
 */
export function initChatWidget() {
  if (!isConsentListenerBound) {
    onCookieConsentChange((preferences) => {
      if (preferences?.functional && !isInitialized) {
        createChatWidget();
      }
    });
    isConsentListenerBound = true;
  }

  if (!isCategoryAllowed('functional')) {
    logger.info('Chat widget skipped until functional consent is granted');
    return;
  }

  createChatWidget();
}

/**
 * Create chat widget
 */
function createChatWidget() {
  if (isInitialized) return;
  // Chat button
  chatButton = document.createElement('button');
  chatButton.className = 'chat-button';
  chatButton.innerHTML = '💬';
  chatButton.setAttribute('aria-label', t('chat.title'));
  chatButton.addEventListener('click', toggleChat);
  
  // Chat panel
  chatPanel = document.createElement('div');
  chatPanel.className = 'chat-panel';
  chatPanel.innerHTML = `
    <div class="chat-header">
      <h3 data-i18n="chat.title">${t('chat.title')}</h3>
      <button class="chat-close" aria-label="Close">×</button>
    </div>
    <div class="chat-messages" id="chat-messages">
      <div class="chat-message bot">
        <p data-i18n="chat.welcome">${t('chat.welcome')}</p>
      </div>
    </div>
    <div class="chat-input-area">
      <input type="text" class="chat-input" id="chat-input" data-i18n="chat.placeholder" placeholder="${t('chat.placeholder')}" />
      <button class="chat-send" id="chat-send" data-i18n="chat.send">${t('chat.send')}</button>
    </div>
  `;
  
  // Close button
  chatPanel.querySelector('.chat-close').addEventListener('click', toggleChat);
  
  // Send button
  chatPanel.querySelector('#chat-send').addEventListener('click', sendMessage);
  
  // Enter key to send
  chatPanel.querySelector('#chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
  
  // Append to body
  const chatWidget = document.createElement('div');
  chatWidget.className = 'chat-widget';
  chatWidget.appendChild(chatButton);
  chatWidget.appendChild(chatPanel);
  document.body.appendChild(chatWidget);
  
  // Apply translations
  setTimeout(() => {
    const event = new Event('i18n-update');
    document.dispatchEvent(event);
  }, 100);
  isInitialized = true;
}

/**
 * Toggle chat panel
 */
function toggleChat() {
  isOpen = !isOpen;
  
  if (isOpen) {
    chatPanel.classList.add('open');
    chatPanel.querySelector('#chat-input').focus();
  } else {
    chatPanel.classList.remove('open');
  }
}

/**
 * Send message
 */
async function sendMessage() {
  const input = chatPanel.querySelector('#chat-input');
  const message = input.value.trim();
  
  if (!message) return;
  
  // Add user message
  addMessage(message, 'user');
  
  // Clear input
  input.value = '';
  input.disabled = true;
  
  // Disable send button
  const sendBtn = chatPanel.querySelector('#chat-send');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = 'Gönderiliyor...';
  }
  
  // Loading message
  const loadingId = addMessage('Asistan düşünüyor...', 'bot', true);
  
  try {
    // Kullanıcı oturum kontrolü
    const user = auth.currentUser;
    if (!user) {
      removeMessage(loadingId);
      addMessage('Yapay zekâ asistanını kullanmak için lütfen giriş yapın.', 'bot');
      return;
    }

    // Token al
    const token = await user.getIdToken();

    // API'ye istek gönder - yeni /api/chat endpoint'i kullanılıyor
    // Teklifbul Rule v1.0 - Timeout süresi uzatıldı (OpenAI API yanıt süresi için)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 saniye timeout
    
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        message: message
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      // Yetkisiz erişim (401)
      if (response.status === 401) {
        removeMessage(loadingId);
        addMessage('Oturum süreniz dolmuş veya giriş yapmamışsınız. Lütfen tekrar giriş yapın.', 'bot');
        return;
      }

      // Limit aşıldı durumu (429)
      if (response.status === 429) {
        const errorData = await response.json();
        const plan = errorData.plan || 'free';
        const periodType = errorData.periodType || 'month';
        const limitMessages = errorData.limitMessages || 150;
        
        // Loading mesajını kaldır
        removeMessage(loadingId);
        
        // Limit mesajını göster
        let limitMessage = '';
        if (plan === 'free') {
          limitMessage = `Ücretsiz planda aylık ${limitMessages} mesaj hakkınızı doldurdunuz. Premium plana geçerek günlük ${limitMessages} mesaj hakkı kazanabilirsiniz.`;
        } else {
          limitMessage = `Premium planda bugün için ${limitMessages} mesaj limitine ulaştınız. Yarın tekrar kullanabilirsiniz.`;
        }
        
        addMessage(limitMessage, 'bot');
        return;
      }
      
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Backend { answer } döner
    const assistantMessage =
      typeof data?.answer === 'string'
        ? data.answer
        : 'Üzgünüm, bir hata oluştu. Lütfen daha sonra tekrar deneyin.';

    // Loading mesajını kaldır
    removeMessage(loadingId);

    // Asistan cevabını göster
    addMessage(assistantMessage, 'bot');
    
    // Kalan mesaj sayısını göster (opsiyonel - sadece bilgilendirme için)
    if (data.remainingMessages !== undefined && data.remainingMessages < 10) {
      const plan = data.plan || 'free';
      const periodType = data.periodType === 'day' ? 'bugün' : 'bu ay';
      const remainingInfo = `ℹ️ ${plan === 'free' ? 'Ücretsiz' : 'Premium'} planda ${periodType} ${data.remainingMessages} mesaj hakkınız kaldı.`;
      setTimeout(() => {
        addMessage(remainingInfo, 'bot');
      }, 500);
    }
  } catch (error) {
    // Loading mesajını kaldır
    removeMessage(loadingId);
    
    // Hata mesajını göster
    addMessage(
      'Üzgünüm, bir hata oluştu. Lütfen daha sonra tekrar deneyin.',
      'bot'
    );
    
    logger.error('Chat widget error', error);
  } finally {
    // Input ve butonu tekrar aktif et
    input.disabled = false;
    input.focus();
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = t('chat.send');
    }
  }
}

/**
 * Add message to chat
 * @param {string} text - Message text
 * @param {string} type - 'user' or 'bot'
 * @param {boolean} isLoading - Is this a loading message?
 */
function addMessage(text, type, isLoading = false) {
  const messagesContainer = chatPanel.querySelector('#chat-messages');
  const messageDiv = document.createElement('div');
  const messageId = `chat-msg-${Date.now()}-${Math.random()}`;
  messageDiv.id = messageId;
  messageDiv.className = `chat-message ${type} ${isLoading ? 'loading' : ''}`;
  // Teklifbul Rule v1.0 - XSS koruma: text bot/kullanici girdisi olabilir, sadece p+br izinli
  const safeText = DOMPurify.sanitize(String(text ?? ''), {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'span'],
    ALLOWED_ATTR: []
  });
  const p = document.createElement('p');
  p.innerHTML = safeText;
  messageDiv.appendChild(p);
  
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
  return messageId;
}

/**
 * Remove message from chat
 * @param {string} messageId - Message ID to remove
 */
function removeMessage(messageId) {
  const message = document.getElementById(messageId);
  if (message) {
    message.remove();
  }
}
