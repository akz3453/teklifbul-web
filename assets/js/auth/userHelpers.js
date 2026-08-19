// Teklifbul Rule v1.0 - Admin/Premium yardımcıları
export function isAdminUser(user) {
  if (!user) return false;
  const claims = user.customClaims || user.claims || {};
  if (claims.superAdmin === true || claims.admin === true || claims.isAdmin === true) return true;
  if (claims.role === 'admin') return true;

  const adminEmails = ((window.ADMIN_EMAILS || '')).split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const email = (user.email || '').toLowerCase();
  return !!email && adminEmails.includes(email);
}

/**
 * Premium erişim kontrolü
 * Teklifbul Rule v1.0 - NOT: Bu fonksiyon user objesindeki plan bilgisini kontrol eder.
 * Şirket bazlı premium kontrolü için, user objesine şirket bazlı plan bilgisi override edilmeli
 * (örn: header.js'de yapıldığı gibi companyPlan override'ı sonrası bu fonksiyon çağrılmalı)
 */
export function hasPremiumAccess(user) {
  if (isAdminUser(user)) return true;
  const plan = user?.plan || user?.planId;
  return plan === 'premium' || plan === 'premiumPlus' || plan === 'premium_plus' ||
    plan === 'premium_plus_monthly' || plan === 'premium_plus_yearly';
}

/**
 * Premium Plus erişim kontrolü
 * Teklifbul Rule v1.0 - NOT: Bu fonksiyon user objesindeki plan bilgisini kontrol eder.
 * Şirket bazlı premium kontrolü için, user objesine şirket bazlı plan bilgisi override edilmeli
 * (örn: header.js'de yapıldığı gibi companyPlan override'ı sonrası bu fonksiyon çağrılmalı)
 */
export function hasPremiumPlusAccess(user) {
  if (isAdminUser(user)) return true;
  const plan = user?.plan || user?.planId;
  return plan === 'premiumPlus' || plan === 'premium_plus' ||
    plan === 'premium_plus_monthly' || plan === 'premium_plus_yearly';
}

