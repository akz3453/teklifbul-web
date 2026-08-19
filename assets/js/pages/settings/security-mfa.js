/**
 * Settings > Security MFA Section
 * Teklifbul Rule v1.2
 *
 * User-based 2FA (SMS / Google Authenticator TOTP) management UI.
 * CSP-safe: no inline handlers, event delegation only.
 *
 * SMS MFA: firebase/auth (npm, projede firebase ^12.x) — CDN auth ile karıştırılmaz.
 */

import {
  EmailAuthProvider,
  getAuth,
  getIdTokenResult,
  GoogleAuthProvider,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut as firebaseSignOut,
  TotpMultiFactorGenerator,
} from 'firebase/auth';
import { app, auth } from '../../../../firebase.js';
import { logger } from '../../../../src/shared/log/logger.js';
import { toast } from '../../../../src/shared/ui/toast.js';

let initialized = false;
let busy = false;
/** @type {import('firebase/auth').RecaptchaVerifier | null} */
let recaptchaVerifier = null;
/** @type {number | null} */
let recaptchaWidgetId = null;

const SMS_MFA_ENABLED = true;
const RECENT_LOGIN_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Teklifbul Rule v1.0 — MFA yalnızca npm firebase/auth + getAuth(app).
 * CDN auth.currentUser ile npm multiFactor karışınca reloadListener → auth/internal-error.
 * CDN user'a asla fallback yok.
 */
function getMfaAuth() {
  return getAuth(app);
}

function getMfaUser() {
  return getMfaAuth().currentUser;
}

async function waitForMfaUser(timeoutMs = 10000) {
  const authInstance = getMfaAuth();
  if (authInstance.currentUser) return authInstance.currentUser;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        unsub();
      } catch {
        /* ignore */
      }
      reject(new Error('Kullanıcı oturumu hazır değil. Sayfayı yenileyip tekrar deneyin.'));
    }, timeoutMs);
    const unsub = authInstance.onAuthStateChanged((user) => {
      if (!user) return;
      clearTimeout(timer);
      try {
        unsub();
      } catch {
        /* ignore */
      }
      resolve(user);
    });
  });
}

/**
 * Network'te mfaEnrollment:start gövdesini yakala (400 gövdesi için).
 * Teklifbul Rule v1.0 — tek sefer patch
 */
function installMfaEnrollmentFetchLogger() {
  if (typeof window === 'undefined' || window.__TB_MFA_ENROLLMENT_FETCH_LOGGER__) return;
  window.__TB_MFA_ENROLLMENT_FETCH_LOGGER__ = true;
  // Sokak/adres JSON vb. istekler doğrudan native fetch kullansın (404 konsolu MFA dosyasına yazılmasın)
  if (!window.__TEKLIFBUL_NATIVE_FETCH__) {
    window.__TEKLIFBUL_NATIVE_FETCH__ = window.fetch.bind(window);
  }
  const orig = window.__TEKLIFBUL_NATIVE_FETCH__;
  window.fetch = async function patchedFetch(input, init) {
    const response = await orig(input, init);
    const url = typeof input === 'string' ? input : input?.url || '';
    const u = String(url);
    if (u.includes('identitytoolkit.googleapis.com') && u.includes('mfaEnrollment')) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        let body = text;
        try {
          body = JSON.parse(text);
        } catch {
          /* ham metin */
        }
        if (!response.ok) {
          logger.error('Identity Toolkit mfaEnrollment HTTP yanıtı', {
            status: response.status,
            statusText: response.statusText,
            url: u.split('?')[0],
            body,
          });
          console.error('mfaEnrollment:start response body', body);
        }
      } catch (logErr) {
        logger.warn('mfaEnrollment fetch log hatası', logErr);
      }
    }
    return response;
  };
}

function root() {
  return document.getElementById('securityMfaRoot');
}

function setBusy(isBusy) {
  busy = isBusy;
  const r = root();
  if (!r) return;
  r.style.opacity = isBusy ? '0.6' : '1';
  r.style.pointerEvents = isBusy ? 'none' : 'auto';
}

function safeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getLastSignInAgeMs(user) {
  try {
    const lastSignInRaw = user?.metadata?.lastSignInTime;
    const lastSignInAt = lastSignInRaw ? new Date(lastSignInRaw).getTime() : 0;
    if (!Number.isFinite(lastSignInAt) || lastSignInAt <= 0) return Number.POSITIVE_INFINITY;
    return Date.now() - lastSignInAt;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isRecentLogin(user) {
  return getLastSignInAgeMs(user) <= RECENT_LOGIN_MAX_AGE_MS;
}

function extractAuthCode(error) {
  const direct = error?.code || error?.errorInfo?.code;
  if (direct) return String(direct);
  const msg = String(error?.message || '').toLowerCase();
  if (msg.includes('requires-recent-login')) return 'auth/requires-recent-login';
  if (msg.includes('multi-factor-auth-required')) return 'auth/multi-factor-auth-required';
  if (msg.includes('invalid-app-credential')) return 'auth/invalid-app-credential';
  if (msg.includes('invalid-phone-number')) return 'auth/invalid-phone-number';
  return '';
}

function throwRecentLoginRequired() {
  const err = new Error('Bu işlem için yakın zamanda yeniden giriş doğrulaması gerekli.');
  err.code = 'auth/requires-recent-login';
  throw err;
}

async function refreshAuthCredential() {
  const user = getMfaUser();
  if (!user) return;
  try {
    await user.reload();
  } catch {
    /* ignore */
  }
  try {
    await user.getIdToken(true);
  } catch {
    /* ignore */
  }
}

async function ensureRecentLoginOrThrow() {
  const user = getMfaUser();
  if (!user) throw new Error('Kullanıcı yok');
  try {
    const tokenResult = await getIdTokenResult(user, false);
    const authTimeSec = Number(tokenResult?.claims?.auth_time || 0);
    const authTimeMs = authTimeSec * 1000;
    if (Number.isFinite(authTimeMs) && authTimeMs > 0) {
      const tokenAgeMs = Date.now() - authTimeMs;
      if (tokenAgeMs > RECENT_LOGIN_MAX_AGE_MS) {
        throwRecentLoginRequired();
      }
      return;
    }
  } catch (e) {
    if (extractAuthCode(e) === 'auth/requires-recent-login') throw e;
  }
  if (!isRecentLogin(user)) {
    throwRecentLoginRequired();
  }
}

function renderShell() {
  const r = root();
  if (!r) return;
  r.innerHTML = `
    <div style="display:grid; gap:14px;">
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <div style="font-weight:700; color:#111827;">Durum:</div>
        <div id="mfa_status" class="muted" style="font-size:12px;">Yükleniyor...</div>
      </div>

      <div id="mfa_email_block" style="display:none; padding:12px; background:#fff7ed; border:1px solid #f59e0b; border-radius:10px; color:#92400e;">
        <div style="font-weight:800; margin-bottom:6px;">E-posta doğrulaması gerekli</div>
        <div class="muted" style="font-size:12px; color:#78350f; line-height:1.4;">
          MFA (Google Authenticator / SMS) ekleyebilmek için önce e-posta adresiniz doğrulanmış olmalı.
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px; flex-wrap:wrap;">
          <button type="button" class="btn btn-primary" data-action="mfa-send-verification" style="padding:8px 12px; font-size:13px;">Doğrulama E-postası Gönder</button>
          <button type="button" class="btn btn-secondary" data-action="mfa-refresh" style="padding:8px 12px; font-size:13px;">Durumu Yenile</button>
        </div>
      </div>

      <div id="mfa_reauth_block" style="display:none; padding:12px; background:#f0f9ff; border:1px solid #3b82f6; border-radius:10px; color:#1e40af;">
        <div style="font-weight:800; margin-bottom:6px;">Yeniden giriş gerekli</div>
        <div class="muted" style="font-size:12px; color:#1e3a8a; line-height:1.4;">
          Güvenlik nedeniyle bu işlem için yeniden doğrulama gerekiyor. Aşağıdan yeniden giriş yapıp tekrar deneyin.
        </div>
        <div id="mfa_reauth_actions" style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px; flex-wrap:wrap;">
          <!-- actions inserted dynamically -->
        </div>
        <div id="mfa_reauth_password" style="display:none; margin-top:10px;">
          <label for="mfa_reauth_password_input" style="font-weight:700; font-size:12px;">Şifre</label>
          <input id="mfa_reauth_password_input" type="password" placeholder="Mevcut şifreniz" style="margin-top:6px;" />
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
            <button type="button" class="btn btn-primary" data-action="mfa-reauth-password-confirm" style="padding:8px 12px; font-size:13px;">Doğrula</button>
            <button type="button" class="btn btn-secondary" data-action="mfa-reauth-cancel" style="padding:8px 12px; font-size:13px;">Vazgeç</button>
          </div>
        </div>
      </div>

      <div id="mfa_factors" style="display:flex; gap:8px; flex-wrap:wrap;"></div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:12px;">
        <div style="background:white; border:1px solid #e5e7eb; border-radius:10px; padding:14px;">
          <div style="font-weight:800; color:#111827; margin-bottom:6px;">Google Authenticator</div>
          <div class="muted" style="font-size:12px; line-height:1.4; margin-bottom:10px;">
            QR kod ile uygulamanıza ekleyip 6 haneli kod üretirsiniz (TOTP).
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" id="mfa_totp_start_btn" class="btn btn-primary" data-action="mfa-totp-start" style="padding:8px 12px; font-size:13px;">Kur</button>
            <button type="button" id="mfa_totp_remove_btn" class="btn btn-secondary" data-action="mfa-totp-remove" style="padding:8px 12px; font-size:13px;">Kaldır</button>
          </div>
          <div id="mfa_totp_panel" style="display:none; margin-top:12px; padding:12px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px;">
            <div class="muted" style="font-size:12px; margin-bottom:8px;">1) QR’ı okutun 2) 6 haneli kodu girin</div>
            <div id="mfa_totp_qr" style="display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap;"></div>
            <div style="margin-top:10px;">
              <label for="mfa_totp_code" style="font-weight:700; font-size:12px;">Doğrulama Kodu</label>
              <input id="mfa_totp_code" type="text" inputmode="numeric" placeholder="123456" style="margin-top:6px;" />
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
              <button type="button" class="btn btn-primary" data-action="mfa-totp-confirm" style="padding:8px 12px; font-size:13px;">Onayla</button>
              <button type="button" class="btn btn-secondary" data-action="mfa-totp-cancel" style="padding:8px 12px; font-size:13px;">Vazgeç</button>
            </div>
          </div>
        </div>

        <div style="background:white; border:1px solid #e5e7eb; border-radius:10px; padding:14px;">
          <div style="font-weight:800; color:#111827; margin-bottom:6px;">SMS ile Giriş Onayı</div>
          <div class="muted" style="font-size:12px; line-height:1.4; margin-bottom:10px;">
            Telefon numaranıza doğrulama kodu gönderilir.
            Firebase Console’da “Test phone numbers” listesinde olan numaralara gerçek SMS gitmez; konsoldaki sabit test kodunu girin.
            ${SMS_MFA_ENABLED ? '' : '<br><strong>Geçici olarak devre dışı:</strong> Firebase SMS MFA için reCAPTCHA zorunlu.'}
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" id="mfa_sms_start_btn" class="btn btn-primary" data-action="mfa-sms-start" style="padding:8px 12px; font-size:13px;" ${SMS_MFA_ENABLED ? '' : 'disabled title="SMS MFA geçici olarak kapalı"'}>Kur</button>
            <button type="button" id="mfa_sms_remove_btn" class="btn btn-secondary" data-action="mfa-sms-remove" style="padding:8px 12px; font-size:13px;">Kaldır</button>
          </div>
          <div id="mfa_sms_panel" style="display:none; margin-top:12px; padding:12px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px;">
            <div style="margin-bottom:10px;">
              <label for="mfa_sms_phone" style="font-weight:700; font-size:12px;">Telefon</label>
              <input id="mfa_sms_phone" type="text" placeholder="+90xxxxxxxxxx" style="margin-top:6px;" />
              <div class="muted" style="font-size:11px; margin-top:6px;">Örn: +905xxxxxxxxx</div>
            </div>
            <div id="recaptcha-container" style="min-height:78px;" title="Güvenlik doğrulaması"></div>
            <div style="display:flex; justify-content:flex-end; gap:8px;">
              <button type="button" class="btn btn-primary" data-action="mfa-sms-send" style="padding:8px 12px; font-size:13px;">Kod Gönder</button>
              <button type="button" class="btn btn-secondary" data-action="mfa-sms-cancel" style="padding:8px 12px; font-size:13px;">Vazgeç</button>
            </div>
            <div id="mfa_sms_code_block" style="display:none; margin-top:10px;">
              <label for="mfa_sms_code" style="font-weight:700; font-size:12px;">SMS Kodu</label>
              <input id="mfa_sms_code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="Telefonunuza gelen 6 haneli kod" style="margin-top:6px;" title="SMS veya Firebase test kodu" aria-label="SMS doğrulama kodu" />
              <p id="mfa_sms_delivery_hint" class="muted" style="font-size:11px; margin:8px 0 0 0; line-height:1.4;">
                Kod 1–2 dakika içinde gelmezse: spam/operatör filtresi veya Firebase test numarası olabilir. Test numaralarında konsoldaki sabit kodu kullanın; üretimde gerçek SMS için numarayı Test phone numbers listesinden çıkarın.
              </p>
              <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
                <button type="button" class="btn btn-primary" data-action="mfa-sms-confirm" style="padding:8px 12px; font-size:13px;" title="Kodu onayla" aria-label="SMS kodunu onayla">Onayla</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function getEnrolledFactors() {
  let user = getMfaUser();
  if (!user) {
    try {
      user = await waitForMfaUser(5000);
    } catch {
      return [];
    }
  }
  try {
    return multiFactor(user).enrolledFactors || [];
  } catch (e) {
    logger.warn('MFA enrolledFactors okunamadı', e);
    return [];
  }
}

function renderFactors(factors) {
  const statusEl = document.getElementById('mfa_status');
  const listEl = document.getElementById('mfa_factors');
  if (!statusEl || !listEl) return;

  if (!getMfaUser()) {
    statusEl.textContent = 'Giriş yapılmamış.';
    listEl.innerHTML = '';
    return;
  }

  if (!factors || !factors.length) {
    statusEl.textContent = 'Pasif (2FA etkin değil)';
    listEl.innerHTML = '';
    const totpStartBtn = document.getElementById('mfa_totp_start_btn');
    const totpRemoveBtn = document.getElementById('mfa_totp_remove_btn');
    const smsStartBtn = document.getElementById('mfa_sms_start_btn');
    const smsRemoveBtn = document.getElementById('mfa_sms_remove_btn');
    if (totpStartBtn) totpStartBtn.style.display = '';
    if (totpRemoveBtn) totpRemoveBtn.style.display = 'none';
    if (smsStartBtn) smsStartBtn.style.display = SMS_MFA_ENABLED ? '' : 'none';
    if (smsRemoveBtn) smsRemoveBtn.style.display = 'none';
    return;
  }

  statusEl.textContent = `Aktif (${factors.length} yöntem)`;
  const chips = factors.map(f => {
    const label = f.factorId === 'phone' ? 'SMS' : f.factorId === 'totp' ? 'Google Authenticator' : f.factorId;
    const name = f.displayName ? ` — ${f.displayName}` : '';
    return `<span style="background:#e0e7ff;color:#3730a3;font-weight:700;padding:6px 12px;border-radius:999px;font-size:12px;">${safeHtml(label)}${safeHtml(name)}</span>`;
  });
  listEl.innerHTML = chips.join('');

  const factorIds = new Set(factors.map((f) => String(f?.factorId || '').toLowerCase()));
  const hasTotp = factorIds.has('totp');
  const hasSms = factorIds.has('phone');
  const totpStartBtn = document.getElementById('mfa_totp_start_btn');
  const totpRemoveBtn = document.getElementById('mfa_totp_remove_btn');
  const smsStartBtn = document.getElementById('mfa_sms_start_btn');
  const smsRemoveBtn = document.getElementById('mfa_sms_remove_btn');

  if (totpStartBtn) totpStartBtn.style.display = hasTotp ? 'none' : '';
  if (totpRemoveBtn) totpRemoveBtn.style.display = hasTotp ? '' : 'none';
  if (smsStartBtn) smsStartBtn.style.display = SMS_MFA_ENABLED && !hasSms ? '' : 'none';
  if (smsRemoveBtn) smsRemoveBtn.style.display = hasSms ? '' : 'none';
}

async function refresh() {
  const r = root();
  if (!r) return;
  try {
    // Fresh user state
    try {
      await getMfaUser()?.reload?.();
    } catch {}

    const user = getMfaUser();
    const emailBlock = document.getElementById('mfa_email_block');
    if (emailBlock) {
      emailBlock.style.display = user && user.emailVerified === false ? 'block' : 'none';
    }

    // Reauth block is hidden by default; only shown on requires-recent-login errors
    const reauthBlock = document.getElementById('mfa_reauth_block');
    if (reauthBlock) reauthBlock.style.display = 'none';

    const factors = await getEnrolledFactors();
    renderFactors(factors);
  } catch (e) {
    logger.warn('MFA refresh failed', e);
    const statusEl = document.getElementById('mfa_status');
    if (statusEl) statusEl.textContent = 'Yüklenemedi';
  }
}

async function ensureEmailVerifiedOrThrow() {
  const user = getMfaUser();
  if (!user) throw new Error('Kullanıcı yok');
  try {
    await user.reload();
  } catch {
    /* ignore */
  }
  // Firebase MFA enrollment may require email verification (especially password accounts).
  if (user.emailVerified === false) {
    const err = new Error('MFA eklemek için önce e-posta doğrulaması gerekli.');
    err.code = 'auth/email-not-verified';
    throw err;
  }
}

function getReauthHintMessage() {
  const user = getMfaUser() || auth.currentUser;
  const providers = (user?.providerData || []).map((p) => p?.providerId).filter(Boolean);
  const hasGoogle = providers.includes('google.com');
  const hasPassword = providers.includes('password');
  if (hasPassword && !hasGoogle) {
    return 'Güvenlik için yeniden doğrulama gerekiyor. “Şifre ile Yeniden Doğrula” veya “Çıkış Yapıp Yeniden Giriş” kullanın.';
  }
  if (hasGoogle) {
    return 'Güvenlik için yeniden doğrulama gerekiyor. “Google ile Yeniden Giriş” butonuna basın.';
  }
  return 'Güvenlik için yeniden doğrulama gerekiyor. “Çıkış Yapıp Yeniden Giriş” ile oturumu yenileyin.';
}

function mapMfaUserMessage(error, action) {
  const code = extractAuthCode(error);
  const raw = String(error?.message || '');

  if (code === 'auth/email-not-verified') {
    return 'MFA eklemek için önce e-posta adresinizi doğrulayın. “Doğrulama E-postası Gönder”e basın.';
  }
  if (code === 'auth/requires-recent-login') {
    return getReauthHintMessage();
  }
  if (code === 'auth/network-request-failed') {
    return 'Ağ isteği başarısız. Reklam engelleyici/eklentileri kapatıp tekrar deneyin; olmazsa “Çıkış Yapıp Yeniden Giriş” kullanın.';
  }
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'Şifre hatalı. Tekrar deneyin veya “Çıkış Yapıp Yeniden Giriş” kullanın.';
  }
  if (code === 'auth/internal-error' || raw.toLowerCase().includes('internal-error')) {
    if (action === 'mfa-totp-start' || action === 'mfa-totp-confirm') {
      return 'Authenticator kurulumu başarısız. Sayfayı yenileyip “Şifre ile Yeniden Doğrula” sonrası tekrar deneyin. Sürerse çıkış yapıp yeniden giriş yapın.';
    }
    return 'Kimlik doğrulama sunucusu geçici hata verdi. Yeniden giriş yapıp tekrar deneyin.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Bu MFA yöntemi projede kapalı. Firebase Console’da Multi-factor Authentication ayarını kontrol edin.';
  }
  if (code === 'auth/unsupported-first-factor' || code === 'auth/maximum-second-factor-count-exceeded') {
    return 'Bu hesap için MFA eklenemiyor. Mevcut ikinci faktörleri kontrol edin veya destek ekibine yazın.';
  }
  return raw || 'İşlem başarısız';
}

function showReauthUI() {
  const block = document.getElementById('mfa_reauth_block');
  const actions = document.getElementById('mfa_reauth_actions');
  const pw = document.getElementById('mfa_reauth_password');
  if (!block || !actions || !pw) return;

  const user = getMfaUser();
  const providers = (user?.providerData || []).map(p => p?.providerId).filter(Boolean);
  const hasGoogle = providers.includes('google.com');
  const hasPassword = providers.includes('password');

  const btns = [];
  if (hasGoogle) {
    btns.push(`<button type="button" class="btn btn-primary" data-action="mfa-reauth-google" style="padding:8px 12px; font-size:13px;">Google ile Yeniden Giriş</button>`);
  }
  // Teklifbul Rule v1.0 - Google provider varsa şifre seçeneğini gizle (kullanıcı kafa karışıklığı önleme)
  if (hasPassword && !hasGoogle) {
    btns.push(`<button type="button" class="btn btn-primary" data-action="mfa-reauth-password" style="padding:8px 12px; font-size:13px;">Şifre ile Yeniden Doğrula</button>`);
  }
  btns.push(`<button type="button" class="btn btn-secondary" data-action="mfa-reauth-signout" style="padding:8px 12px; font-size:13px;">Çıkış Yapıp Yeniden Giriş</button>`);
  btns.push(`<button type="button" class="btn btn-secondary" data-action="mfa-refresh" style="padding:8px 12px; font-size:13px;">Durumu Yenile</button>`);

  actions.innerHTML = btns.join('');
  pw.style.display = 'none';
  block.style.display = 'block';
}

async function reauthWithGooglePopup() {
  const user = getMfaUser();
  if (!user) throw new Error('Kullanıcı yok');
  const provider = new GoogleAuthProvider();
  await reauthenticateWithPopup(user, provider);
}

async function reauthWithPassword(password) {
  const user = getMfaUser();
  if (!user) throw new Error('Kullanıcı yok');
  if (!user.email) throw new Error('E-posta bulunamadı');
  const cred = EmailAuthProvider.credential(user.email, String(password || ''));
  await reauthenticateWithCredential(user, cred);
}

async function sendVerificationEmail() {
  const user = getMfaUser();
  if (!user) throw new Error('Kullanıcı yok');
  const { sendVerificationEmailBranded } = await import('../../utils/send-verification-email.js');
  await sendVerificationEmailBranded(user);
}

async function unenrollFactor(factorId) {
  const user = getMfaUser();
  if (!user) throw new Error('Kullanıcı yok');
  const factors = (multiFactor(user).enrolledFactors || []);
  const f = factors.find(x => x.factorId === factorId);
  if (!f) throw new Error('Bu yöntem aktif değil');
  await multiFactor(user).unenroll(f.uid);
}

async function startTotpEnroll() {
  const user = getMfaUser() || (await waitForMfaUser());
  if (!user) throw new Error('Kullanıcı yok');
  // Teklifbul Rule v1.0 - Firebase TOTP: tek Auth instance + re-auth + email verify
  await ensureEmailVerifiedOrThrow();
  await ensureRecentLoginOrThrow();
  if (typeof TotpMultiFactorGenerator?.generateSecret !== 'function') {
    throw new Error('TOTP generateSecret desteklenmiyor (SDK sürümü yetersiz olabilir)');
  }

  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);

  // Save secret on window-scoped state (module local)
  window.__TB_MFA_TOTP_SECRET__ = secret;

  const panel = document.getElementById('mfa_totp_panel');
  const qrWrap = document.getElementById('mfa_totp_qr');
  if (panel) panel.style.display = 'block';
  if (qrWrap) {
    let qrUrl = '';
    try {
      if (typeof secret.generateQrCodeUrl === 'function') {
        qrUrl = await secret.generateQrCodeUrl(user.email || user.uid, 'Teklifbul');
      }
    } catch {}
    const secretKey = secret?.secretKey ? String(secret.secretKey) : '';
    const qrImg = qrUrl
      ? `<img alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}" style="border:1px solid #e5e7eb; border-radius:10px; background:white; padding:6px;" />`
      : '';
    const urlBlock = qrUrl ? `<div class="muted" style="font-size:11px; word-break:break-all;">${safeHtml(qrUrl)}</div>` : '';
    const keyBlock = secretKey ? `<div class="muted" style="font-size:11px;">Secret: <code>${safeHtml(secretKey)}</code></div>` : '';
    qrWrap.innerHTML = `
      ${qrImg}
      <div style="display:grid; gap:8px; min-width:240px;">
        ${qrUrl ? `<div style="font-weight:700; font-size:12px; color:#111827;">QR Link</div>${urlBlock}` : ''}
        ${keyBlock}
      </div>
    `;
  }
}

async function confirmTotpEnroll() {
  const user = getMfaUser();
  if (!user) throw new Error('Kullanıcı yok');
  const code = String(document.getElementById('mfa_totp_code')?.value || '').trim();
  if (!code) throw new Error('Kod gerekli');
  const secret = window.__TB_MFA_TOTP_SECRET__;
  if (!secret) throw new Error('Secret bulunamadı, tekrar deneyin');

  if (typeof TotpMultiFactorGenerator.assertionForEnrollment !== 'function') {
    throw new Error('TOTP enrollment assertion metodu bulunamadı (SDK uyumsuz olabilir)');
  }

  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code);
  await multiFactor(user).enroll(assertion, 'Google Authenticator');
  window.__TB_MFA_TOTP_SECRET__ = null;
}

async function startSmsEnroll() {
  await ensureEmailVerifiedOrThrow();
  const panel = document.getElementById('mfa_sms_panel');
  if (panel) panel.style.display = 'block';
  const codeBlock = document.getElementById('mfa_sms_code_block');
  if (codeBlock) codeBlock.style.display = 'none';
}

function normalizePhoneNumber(raw) {
  const input = String(raw || '').trim();
  if (!input) return '';

  // Keep only digits and optional leading plus
  const hasPlus = input.startsWith('+');
  const digits = input.replace(/\D/g, '');
  if (!digits) return '';

  // TR-friendly normalization
  if (hasPlus) return `+${digits}`;
  if (digits.startsWith('90')) return `+${digits}`;
  if (digits.startsWith('0')) return `+90${digits.slice(1)}`;
  if (digits.length === 10) return `+90${digits}`;
  return `+${digits}`;
}

/** @param {unknown} error */
function serializeFirebaseError(error) {
  if (!error || typeof error !== 'object') return { message: String(error) };
  try {
    const plain = {};
    for (const k of Object.getOwnPropertyNames(error)) {
      try {
        plain[k] = /** @type {Record<string, unknown>} */ (error)[k];
      } catch {
        plain[k] = '[unreadable]';
      }
    }
    return plain;
  } catch {
    return { message: String(error) };
  }
}

function getNormalizedPhoneNumberFromInput() {
  const phoneInputEl = document.getElementById('mfa_sms_phone');
  const phoneRaw = String(phoneInputEl?.value || '').trim();
  if (!phoneRaw) return '';
  const phone = normalizePhoneNumber(phoneRaw);
  if (phoneInputEl) phoneInputEl.value = phone;
  return phone;
}

async function initRecaptcha() {
  try {
    if (recaptchaVerifier) {
      try {
        recaptchaVerifier.clear();
      } catch (clearErr) {
        logger.warn('recaptchaVerifier.clear failed', clearErr);
      }
    }
    recaptchaVerifier = null;
    recaptchaWidgetId = null;

    const authInstance = getAuth(app);
    const host = document.getElementById('recaptcha-container');
    if (!host) {
      throw new Error('RECAPTCHA_CONTAINER_MISSING');
    }

    recaptchaVerifier = new RecaptchaVerifier(authInstance, 'recaptcha-container', {
      size: 'normal',
      callback: () => {
        logger.info('reCAPTCHA solved');
      },
      'expired-callback': () => {
        logger.warn('reCAPTCHA expired');
      },
    });

    recaptchaWidgetId = await recaptchaVerifier.render();

    logger.info('reCAPTCHA initialized', {
      widgetId: recaptchaWidgetId,
    });

    return recaptchaVerifier;
  } catch (error) {
    logger.error('reCAPTCHA init failed', error);
    throw error;
  }
}

/**
 * Production-debug: ham hata + Identity Toolkit gövdesi (fetch logger ile).
 * Teklifbul Rule v1.0 — getAuth(app) ile firebase.js oturumu birebir
 */
async function sendSmsCode() {
  const authInstance = getAuth(app);

  try {
    setBusy(true);

    if (!authInstance.currentUser) {
      const err = new Error('AUTH_USER_NOT_FOUND');
      err.code = 'auth/no-current-user';
      throw err;
    }

    logger.info('MFA enrollment öncesi kullanıcı metadata', {
      lastSignInTime: authInstance.currentUser.metadata?.lastSignInTime,
      creationTime: authInstance.currentUser.metadata?.creationTime,
    });

    await authInstance.currentUser.reload();
    const user = authInstance.currentUser;

    await ensureEmailVerifiedOrThrow();
    await ensureRecentLoginOrThrow();
    await refreshAuthCredential();

    const phoneNumber = getNormalizedPhoneNumberFromInput();

    logger.info('Starting MFA enrollment', {
      uid: user.uid,
      phoneNumber,
    });

    if (!phoneNumber) {
      throw Object.assign(new Error('Telefon gerekli'), { code: 'auth/missing-phone-number' });
    }

    if (!phoneNumber.startsWith('+90')) {
      throw Object.assign(new Error('INVALID_PHONE_FORMAT'), { code: 'auth/invalid-phone-number' });
    }

    const enrolledFactors = multiFactor(user).enrolledFactors || [];
    const alreadyExists = enrolledFactors.some(
      (f) => f.factorId === 'phone' && f.phoneNumber === phoneNumber
    );

    if (alreadyExists) {
      throw Object.assign(new Error('SECOND_FACTOR_EXISTS'), {
        code: 'auth/second-factor-already-exists',
      });
    }

    const verifier = await initRecaptcha();

    logger.info('Getting MFA session');

    const session = await multiFactor(user).getSession();

    logger.info('MFA session created');

    const phoneInfoOptions = {
      phoneNumber,
      session,
    };

    logger.info('MFA SMS verifyPhoneNumber hazır', {
      hasSession: !!session,
      phoneSuffix: phoneNumber.slice(-4),
    });

    const provider = new PhoneAuthProvider(authInstance);

    logger.info('Sending SMS verification');

    const verificationId = await provider.verifyPhoneNumber(phoneInfoOptions, verifier);

    window.__TB_MFA_SMS_VERIFICATION_ID__ = verificationId;
    window.currentMfaVerificationId = verificationId;

    logger.info('SMS sent successfully', {
      verificationId,
      phoneSuffix: phoneNumber.slice(-4),
    });

    // Teklifbul Rule v1.0 — Firebase test numaralarına gerçek SMS gitmez; kullanıcıyı yönlendir
    toast.success('Doğrulama oturumu açıldı. Telefona kod gelmezse Firebase test numarası olabilir — konsoldaki test kodunu girin.');
    toast.info('İpucu: Gerçek SMS için numarayı Auth → Phone → Test phone numbers listesinden kaldırın.');

    const codeBlock = document.getElementById('mfa_sms_code_block');
    if (codeBlock) codeBlock.style.display = 'block';
    const codeInput = document.getElementById('mfa_sms_code');
    if (codeInput) {
      codeInput.value = '';
      codeInput.focus();
    }
  } catch (error) {
    const code = extractAuthCode(error) || error?.code || '';
    logger.error('MFA SMS ERROR', {
      code,
      message: error?.message,
      customData: error?.customData,
      serverResponse: error?.customData?.serverResponse,
      serialized: serializeFirebaseError(error),
    });

    if (typeof grecaptcha !== 'undefined' && recaptchaWidgetId != null) {
      try {
        grecaptcha.reset(recaptchaWidgetId);
      } catch (resetErr) {
        logger.warn('grecaptcha.reset failed', resetErr);
      }
    }

    switch (code) {
      case 'auth/requires-recent-login':
        toast.error('Güvenlik nedeniyle tekrar giriş yapmalısınız');
        showReauthUI();
        break;
      case 'auth/invalid-app-credential':
        toast.error('reCAPTCHA / domain doğrulaması başarısız. nefisoft.com ve www.nefisoft.com Firebase Authorized Domains + reCAPTCHA anahtarında tanımlı olmalı.');
        break;
      case 'auth/captcha-check-failed':
        toast.error('reCAPTCHA doğrulaması başarısız. Domain (nefisoft.com / www) site anahtarına ekli mi kontrol edin.');
        break;
      case 'auth/invalid-phone-number':
        toast.error('Telefon numarası geçersiz (+905551112233 formatında deneyin)');
        break;
      case 'auth/quota-exceeded':
        toast.error('SMS kotası doldu');
        break;
      case 'auth/second-factor-already-exists':
        toast.error('Bu telefon numarası için SMS doğrulaması zaten kayıtlı');
        break;
      default:
        if (error?.message === 'SECOND_FACTOR_EXISTS') {
          toast.error('Bu telefon numarası için SMS doğrulaması zaten kayıtlı');
        } else if (error?.message === 'INVALID_PHONE_FORMAT') {
          toast.error('Telefon numarası +90 ile başlamalı');
        } else if (/geçersiz alan|invalid domain for site key|site.?mismatch|error for site owner/i.test(String(error?.message || ''))) {
          toast.error('reCAPTCHA: site anahtarı bu alan adı için geçersiz. Google Cloud → reCAPTCHA Enterprise → WEB anahtarına nefisoft.com ve www.nefisoft.com ekleyin.');
        } else {
          toast.error(error?.message || 'SMS gönderilemedi');
        }
    }
  } finally {
    setBusy(false);
  }
}

async function confirmSmsEnroll() {
  const user = getMfaUser() || (await waitForMfaUser());
  if (!user) throw new Error('Kullanıcı yok');
  await ensureRecentLoginOrThrow();
  const code = String(document.getElementById('mfa_sms_code')?.value || '').trim();
  if (!code) throw new Error('Kod gerekli');
  const verificationId =
    window.__TB_MFA_SMS_VERIFICATION_ID__ || window.currentMfaVerificationId;
  if (!verificationId) throw new Error('Önce kod gönderin');

  const cred = PhoneAuthProvider.credential(verificationId, code);
  const assertion = PhoneMultiFactorGenerator.assertion(cred);
  await multiFactor(user).enroll(assertion, 'SMS');
  window.__TB_MFA_SMS_VERIFICATION_ID__ = null;
  window.currentMfaVerificationId = null;
}

function bindOnce() {
  const r = root();
  if (!r) return;
  r.addEventListener('click', async (evt) => {
    const t = evt.target;
    if (!(t instanceof HTMLElement)) return;
    const btn = t.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (!action) return;
    if (busy) return;

    try {
      setBusy(true);
      if (action === 'mfa-totp-start') {
        await startTotpEnroll();
      } else if (action === 'mfa-totp-confirm') {
        await confirmTotpEnroll();
        toast.success('Google Authenticator etkinleştirildi.');
        document.getElementById('mfa_totp_panel').style.display = 'none';
        await refresh();
      } else if (action === 'mfa-totp-cancel') {
        document.getElementById('mfa_totp_panel').style.display = 'none';
      } else if (action === 'mfa-totp-remove') {
        await unenrollFactor('totp');
        toast.success('Google Authenticator kaldırıldı.');
        await refresh();
      } else if (action === 'mfa-sms-start') {
        await ensureRecentLoginOrThrow();
        await startSmsEnroll();
      } else if (action === 'mfa-sms-send') {
        await sendSmsCode();
      } else if (action === 'mfa-sms-confirm') {
        await confirmSmsEnroll();
        toast.success('SMS ile giriş onayı etkinleştirildi.');
        document.getElementById('mfa_sms_panel').style.display = 'none';
        await refresh();
      } else if (action === 'mfa-sms-cancel') {
        document.getElementById('mfa_sms_panel').style.display = 'none';
      } else if (action === 'mfa-sms-remove') {
        await unenrollFactor('phone');
        toast.success('SMS ile giriş onayı kaldırıldı.');
        await refresh();
      } else if (action === 'mfa-send-verification') {
        await sendVerificationEmail();
        toast.success('Doğrulama e-postası gönderildi. Gelen kutunuzu kontrol edin.');
      } else if (action === 'mfa-refresh') {
        await refresh();
      } else if (action === 'mfa-reauth-google') {
        await reauthWithGooglePopup();
        await refreshAuthCredential();
        toast.success('Yeniden giriş başarılı. Şimdi işlemi tekrar deneyin.');
        await refresh();
      } else if (action === 'mfa-reauth-password') {
        const pw = document.getElementById('mfa_reauth_password');
        if (pw) pw.style.display = 'block';
      } else if (action === 'mfa-reauth-password-confirm') {
        const pass = String(document.getElementById('mfa_reauth_password_input')?.value || '').trim();
        if (!pass) throw new Error('Şifre gerekli');
        await reauthWithPassword(pass);
        await refreshAuthCredential();
        toast.success('Yeniden doğrulama başarılı. Şimdi işlemi tekrar deneyin.');
        const pw = document.getElementById('mfa_reauth_password');
        if (pw) pw.style.display = 'none';
        await refresh();
      } else if (action === 'mfa-reauth-signout') {
        toast.info('Güvenlik için çıkış yapılıyor. Tekrar giriş yaptıktan sonra MFA kurulumunu deneyin.');
        try {
          await firebaseSignOut(getMfaAuth());
        } catch {
          /* ignore */
        }
        try {
          await auth.signOut();
        } catch {
          /* ignore */
        }
        window.location.replace('/login.html?redirect=' + encodeURIComponent('/settings.html#security'));
        return;
      } else if (action === 'mfa-reauth-cancel') {
        const pw = document.getElementById('mfa_reauth_password');
        if (pw) pw.style.display = 'none';
      }
    } catch (e) {
      // Teklifbul Rule v1.0 - requires-recent-login beklenen bir durum, hata gibi davranma
      const code = extractAuthCode(e);
      if (code === 'auth/requires-recent-login') {
        const ageMs = getLastSignInAgeMs(getMfaUser());
        logger.warn('MFA requires recent login', { action, code, lastSignInAgeMs: ageMs });
        toast.info(getReauthHintMessage());
        showReauthUI();
      } else if (code === 'auth/email-not-verified') {
        toast.error(mapMfaUserMessage(e, action));
        logger.warn('MFA email not verified', { action, code });
        await refresh();
      } else if (code === 'auth/network-request-failed') {
        toast.error(mapMfaUserMessage(e, action));
        logger.warn('MFA network request failed', { action, code });
        showReauthUI();
      } else if (code === 'auth/multi-factor-auth-required') {
        toast.info('Google popup reauth bu hesapta tamamlanamadı. "Çıkış Yapıp Yeniden Giriş" ile oturumu yenileyin, sonra SMS kurulumunu tekrar deneyin.');
        logger.warn('MFA reauth requires second factor', { action, code });
      } else if (code === 'auth/invalid-phone-number') {
        toast.error('Telefon numarası geçersiz. Lütfen +905551112233 formatında girin.');
        logger.warn('MFA invalid phone number', { action, code });
      } else if (code === 'auth/invalid-app-credential') {
        toast.error('SMS doğrulama başlatılamadı. Sayfayı yenileyip tekrar deneyin; sorun sürerse tarayıcıda reklam engelleyici/anti-tracker eklentilerini kapatın.');
        logger.warn('MFA invalid app credential', { action, code });
        try {
          if (recaptchaVerifier && typeof recaptchaVerifier.clear === 'function') {
            recaptchaVerifier.clear();
          }
        } catch {}
        recaptchaVerifier = null;
        recaptchaWidgetId = null;
      } else if (code === 'auth/internal-error' || code === 'auth/operation-not-allowed') {
        const friendly = mapMfaUserMessage(e, action);
        toast.error(friendly);
        logger.error('MFA action failed', {
          action,
          code,
          message: e?.message,
          customData: e?.customData || null,
        });
        if (action === 'mfa-totp-start' || action === 'mfa-totp-confirm') {
          showReauthUI();
        }
      } else {
        toast.error(mapMfaUserMessage(e, action));
        logger.error('MFA action failed', { action, code, error: e });
      }
    } finally {
      setBusy(false);
    }
  });
}

export async function loadSecurityMfaSection() {
  if (!initialized) {
    installMfaEnrollmentFetchLogger();
    logger.info('MFA SMS: firebase/auth (npm)', {
      packageHint: 'dependencies.firebase >= 11 (package.json)',
      sameAppAsFirebaseJs: true,
    });
    renderShell();
    bindOnce();
    initialized = true;
  }
  await refresh();
}


