/**
 * Settings > Security MFA Section
 * Teklifbul Rule v1.2
 *
 * User-based 2FA (SMS / Google Authenticator TOTP) management UI.
 * CSP-safe: no inline handlers, event delegation only.
 */

import { auth } from '../../../../firebase.js';
import { logger } from '../../../../src/shared/log/logger.js';
import { toast } from '../../../../src/shared/ui/toast.js';

let initialized = false;
let busy = false;

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

async function loadAuthMfaApis() {
  const mod = await import('https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js');
  return {
    multiFactor: mod.multiFactor,
    PhoneAuthProvider: mod.PhoneAuthProvider,
    RecaptchaVerifier: mod.RecaptchaVerifier,
    PhoneMultiFactorGenerator: mod.PhoneMultiFactorGenerator,
    TotpMultiFactorGenerator: mod.TotpMultiFactorGenerator,
    sendEmailVerification: mod.sendEmailVerification,
    reauthenticateWithPopup: mod.reauthenticateWithPopup,
    reauthenticateWithCredential: mod.reauthenticateWithCredential,
    EmailAuthProvider: mod.EmailAuthProvider,
    GoogleAuthProvider: mod.GoogleAuthProvider,
  };
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
            <button type="button" class="btn btn-primary" data-action="mfa-totp-start" style="padding:8px 12px; font-size:13px;">Kur</button>
            <button type="button" class="btn btn-secondary" data-action="mfa-totp-remove" style="padding:8px 12px; font-size:13px;">Kaldır</button>
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
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn btn-primary" data-action="mfa-sms-start" style="padding:8px 12px; font-size:13px;">Kur</button>
            <button type="button" class="btn btn-secondary" data-action="mfa-sms-remove" style="padding:8px 12px; font-size:13px;">Kaldır</button>
          </div>
          <div id="mfa_sms_panel" style="display:none; margin-top:12px; padding:12px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px;">
            <div style="margin-bottom:10px;">
              <label for="mfa_sms_phone" style="font-weight:700; font-size:12px;">Telefon</label>
              <input id="mfa_sms_phone" type="text" placeholder="+90xxxxxxxxxx" style="margin-top:6px;" />
              <div class="muted" style="font-size:11px; margin-top:6px;">Örn: +905xxxxxxxxx</div>
            </div>
            <div id="mfa_recaptcha" style="min-height:48px;"></div>
            <div style="display:flex; justify-content:flex-end; gap:8px;">
              <button type="button" class="btn btn-primary" data-action="mfa-sms-send" style="padding:8px 12px; font-size:13px;">Kod Gönder</button>
              <button type="button" class="btn btn-secondary" data-action="mfa-sms-cancel" style="padding:8px 12px; font-size:13px;">Vazgeç</button>
            </div>
            <div id="mfa_sms_code_block" style="display:none; margin-top:10px;">
              <label for="mfa_sms_code" style="font-weight:700; font-size:12px;">SMS Kodu</label>
              <input id="mfa_sms_code" type="text" inputmode="numeric" placeholder="123456" style="margin-top:6px;" />
              <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
                <button type="button" class="btn btn-primary" data-action="mfa-sms-confirm" style="padding:8px 12px; font-size:13px;">Onayla</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function getEnrolledFactors() {
  const user = auth.currentUser;
  if (!user) return [];
  const { multiFactor } = await loadAuthMfaApis();
  if (!multiFactor) return [];
  return multiFactor(user).enrolledFactors || [];
}

function renderFactors(factors) {
  const statusEl = document.getElementById('mfa_status');
  const listEl = document.getElementById('mfa_factors');
  if (!statusEl || !listEl) return;

  if (!auth.currentUser) {
    statusEl.textContent = 'Giriş yapılmamış.';
    listEl.innerHTML = '';
    return;
  }

  if (!factors || !factors.length) {
    statusEl.textContent = 'Pasif (2FA etkin değil)';
    listEl.innerHTML = '';
    return;
  }

  statusEl.textContent = `Aktif (${factors.length} yöntem)`;
  const chips = factors.map(f => {
    const label = f.factorId === 'phone' ? 'SMS' : f.factorId === 'totp' ? 'Google Authenticator' : f.factorId;
    const name = f.displayName ? ` — ${f.displayName}` : '';
    return `<span style="background:#e0e7ff;color:#3730a3;font-weight:700;padding:6px 12px;border-radius:999px;font-size:12px;">${safeHtml(label)}${safeHtml(name)}</span>`;
  });
  listEl.innerHTML = chips.join('');
}

async function refresh() {
  const r = root();
  if (!r) return;
  try {
    // Fresh user state
    try {
      await auth.currentUser?.reload?.();
    } catch {}

    const user = auth.currentUser;
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
  const user = auth.currentUser;
  if (!user) throw new Error('Kullanıcı yok');
  // Firebase MFA enrollment may require email verification (especially password accounts).
  if (user.emailVerified === false) {
    throw new Error('MFA eklemek için önce e-posta doğrulaması gerekli.');
  }
}

function showReauthUI() {
  const block = document.getElementById('mfa_reauth_block');
  const actions = document.getElementById('mfa_reauth_actions');
  const pw = document.getElementById('mfa_reauth_password');
  if (!block || !actions || !pw) return;

  const user = auth.currentUser;
  const providers = (user?.providerData || []).map(p => p?.providerId).filter(Boolean);
  const hasGoogle = providers.includes('google.com');
  const hasPassword = providers.includes('password');

  const btns = [];
  if (hasGoogle) {
    btns.push(`<button type="button" class="btn btn-primary" data-action="mfa-reauth-google" style="padding:8px 12px; font-size:13px;">Google ile Yeniden Giriş</button>`);
  }
  if (hasPassword) {
    btns.push(`<button type="button" class="btn btn-primary" data-action="mfa-reauth-password" style="padding:8px 12px; font-size:13px;">Şifre ile Yeniden Doğrula</button>`);
  }
  btns.push(`<button type="button" class="btn btn-secondary" data-action="mfa-refresh" style="padding:8px 12px; font-size:13px;">Durumu Yenile</button>`);

  actions.innerHTML = btns.join('');
  pw.style.display = 'none';
  block.style.display = 'block';
}

async function reauthWithGooglePopup() {
  const user = auth.currentUser;
  if (!user) throw new Error('Kullanıcı yok');
  const { reauthenticateWithPopup, GoogleAuthProvider } = await loadAuthMfaApis();
  if (!reauthenticateWithPopup || !GoogleAuthProvider) throw new Error('Google reauth desteklenmiyor');
  const provider = new GoogleAuthProvider();
  await reauthenticateWithPopup(user, provider);
}

async function reauthWithPassword(password) {
  const user = auth.currentUser;
  if (!user) throw new Error('Kullanıcı yok');
  if (!user.email) throw new Error('E-posta bulunamadı');
  const { reauthenticateWithCredential, EmailAuthProvider } = await loadAuthMfaApis();
  if (!reauthenticateWithCredential || !EmailAuthProvider) throw new Error('Şifre ile reauth desteklenmiyor');
  const cred = EmailAuthProvider.credential(user.email, String(password || ''));
  await reauthenticateWithCredential(user, cred);
}

async function sendVerificationEmail() {
  const user = auth.currentUser;
  if (!user) throw new Error('Kullanıcı yok');
  const { sendEmailVerification } = await loadAuthMfaApis();
  if (!sendEmailVerification) throw new Error('Doğrulama e-postası gönderilemedi (SDK uyumsuz)');
  await sendEmailVerification(user);
}

async function unenrollFactor(factorId) {
  const user = auth.currentUser;
  if (!user) throw new Error('Kullanıcı yok');
  const { multiFactor } = await loadAuthMfaApis();
  const factors = (multiFactor(user).enrolledFactors || []);
  const f = factors.find(x => x.factorId === factorId);
  if (!f) throw new Error('Bu yöntem aktif değil');
  await multiFactor(user).unenroll(f.uid);
}

async function startTotpEnroll() {
  const user = auth.currentUser;
  if (!user) throw new Error('Kullanıcı yok');
  await ensureEmailVerifiedOrThrow();
  const { multiFactor, TotpMultiFactorGenerator } = await loadAuthMfaApis();
  if (!multiFactor || !TotpMultiFactorGenerator) throw new Error('TOTP bu ortamda desteklenmiyor');

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
  const user = auth.currentUser;
  if (!user) throw new Error('Kullanıcı yok');
  const code = String(document.getElementById('mfa_totp_code')?.value || '').trim();
  if (!code) throw new Error('Kod gerekli');
  const secret = window.__TB_MFA_TOTP_SECRET__;
  if (!secret) throw new Error('Secret bulunamadı, tekrar deneyin');

  const { multiFactor, TotpMultiFactorGenerator } = await loadAuthMfaApis();
  if (!multiFactor || !TotpMultiFactorGenerator) throw new Error('TOTP bu ortamda desteklenmiyor');

  if (typeof TotpMultiFactorGenerator.assertionForEnrollment !== 'function') {
    throw new Error('TOTP enrollment assertion metodu bulunamadı (SDK uyumsuz olabilir)');
  }

  const assertion = await TotpMultiFactorGenerator.assertionForEnrollment(secret, code);
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

async function sendSmsCode() {
  const user = auth.currentUser;
  if (!user) throw new Error('Kullanıcı yok');
  await ensureEmailVerifiedOrThrow();
  const phone = String(document.getElementById('mfa_sms_phone')?.value || '').trim();
  if (!phone) throw new Error('Telefon gerekli');

  const { multiFactor, PhoneAuthProvider, RecaptchaVerifier } = await loadAuthMfaApis();
  if (!multiFactor || !PhoneAuthProvider || !RecaptchaVerifier) throw new Error('SMS MFA bu ortamda desteklenmiyor');

  const session = await multiFactor(user).getSession();

  // Create recaptcha verifier (best effort across SDK signatures)
  let verifier = null;
  try {
    verifier = new RecaptchaVerifier(auth, 'mfa_recaptcha', { size: 'invisible' });
  } catch (e1) {
    try {
      verifier = new RecaptchaVerifier('mfa_recaptcha', { size: 'invisible' }, auth);
    } catch (e2) {
      throw new Error('reCAPTCHA başlatılamadı');
    }
  }

  const provider = new PhoneAuthProvider(auth);
  const verificationId = await provider.verifyPhoneNumber({ phoneNumber: phone, session }, verifier);
  window.__TB_MFA_SMS_VERIFICATION_ID__ = verificationId;

  const codeBlock = document.getElementById('mfa_sms_code_block');
  if (codeBlock) codeBlock.style.display = 'block';
  toast.success('SMS kodu gönderildi.');
}

async function confirmSmsEnroll() {
  const user = auth.currentUser;
  if (!user) throw new Error('Kullanıcı yok');
  const code = String(document.getElementById('mfa_sms_code')?.value || '').trim();
  if (!code) throw new Error('Kod gerekli');
  const verificationId = window.__TB_MFA_SMS_VERIFICATION_ID__;
  if (!verificationId) throw new Error('Önce kod gönderin');

  const { multiFactor, PhoneAuthProvider, PhoneMultiFactorGenerator } = await loadAuthMfaApis();
  if (!multiFactor || !PhoneAuthProvider || !PhoneMultiFactorGenerator) throw new Error('SMS MFA bu ortamda desteklenmiyor');

  const cred = PhoneAuthProvider.credential(verificationId, code);
  const assertion = PhoneMultiFactorGenerator.assertion(cred);
  await multiFactor(user).enroll(assertion, 'SMS');
  window.__TB_MFA_SMS_VERIFICATION_ID__ = null;
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
        toast.success('Yeniden giriş başarılı. Şimdi işlemi tekrar deneyin.');
        await refresh();
      } else if (action === 'mfa-reauth-password') {
        const pw = document.getElementById('mfa_reauth_password');
        if (pw) pw.style.display = 'block';
      } else if (action === 'mfa-reauth-password-confirm') {
        const pass = String(document.getElementById('mfa_reauth_password_input')?.value || '').trim();
        if (!pass) throw new Error('Şifre gerekli');
        await reauthWithPassword(pass);
        toast.success('Yeniden doğrulama başarılı. Şimdi işlemi tekrar deneyin.');
        const pw = document.getElementById('mfa_reauth_password');
        if (pw) pw.style.display = 'none';
        await refresh();
      } else if (action === 'mfa-reauth-cancel') {
        const pw = document.getElementById('mfa_reauth_password');
        if (pw) pw.style.display = 'none';
      }
    } catch (e) {
      const msg = e?.message || 'İşlem başarısız';
      toast.error(msg);
      logger.error('MFA action failed', { action, error: e });

      // Teklifbul Rule v1.2 - Friendly handling for requires-recent-login
      const code = e?.code || e?.errorInfo?.code || '';
      if (code === 'auth/requires-recent-login') {
        showReauthUI();
      }
    } finally {
      setBusy(false);
    }
  });
}

export async function loadSecurityMfaSection() {
  if (!initialized) {
    renderShell();
    bindOnce();
    initialized = true;
  }
  await refresh();
}


