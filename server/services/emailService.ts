// Teklifbul Rule v1.0 - Multi-Provider Email Service
// Robust fallback system with circuit breaker pattern
// Providers: Resend (primary), Brevo (secondary), Mailjet (tertiary)

import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';

// ============================================
// CONFIGURATION
// ============================================

const EMAIL_USAGE_COLLECTION = 'email_usage';
const PROVIDER_STATUS_COLLECTION = 'email_provider_status';

// Email quota limits per plan
const QUOTA_LIMITS = {
    free: { daily: 3, monthly: 50 },
    starter: { daily: 10, monthly: 200 },
    pro: { daily: 30, monthly: 1000 }
} as const;

// Global limits (combined across all providers)
const GLOBAL_DAILY_LIMIT = 500; // 100 (Resend) + 300 (Brevo) + 100 (Mailjet safety margin)

// Provider configuration
interface ProviderConfig {
    name: string;
    dailyLimit: number;
    priority: number;
    enabled: boolean;
}

const PROVIDERS: Record<string, ProviderConfig> = {
    resend: { name: 'Resend', dailyLimit: 100, priority: 1, enabled: true },
    brevo: { name: 'Brevo', dailyLimit: 300, priority: 2, enabled: true },
    mailjet: { name: 'Mailjet', dailyLimit: 200, priority: 3, enabled: true }
};

// Circuit breaker configuration
const CIRCUIT_BREAKER = {
    failureThreshold: 3,      // Failures before opening circuit
    resetTimeoutMs: 5 * 60 * 1000, // 5 minutes
    halfOpenMaxAttempts: 1    // Attempts in half-open state
};

// ============================================
// TYPES
// ============================================

interface EmailQuotaResult {
    allowed: boolean;
    reason?: string;
    remaining?: {
        user: number;
        company: number;
        global: number;
    };
}

interface SendEmailResult {
    success: boolean;
    messageId?: string;
    provider?: string;
    error?: string;
}

interface SupplierEmailPayload {
    requestId: string;
    requestTitle: string;
    requestNumber: string;
    requesterName: string;
    companyName: string;
    deliveryLocation: string;
    supplierEmail: string;
    quoteFormUrl: string;
    expiryDays: number;
    excelAttachment?: {
        filename: string;
        content: Buffer;
    };
}

interface CircuitState {
    state: 'closed' | 'open' | 'half-open';
    failures: number;
    lastFailure: number;
    lastSuccess: number;
}

interface ProviderUsage {
    count: number;
    lastReset: number;
}

// In-memory circuit breaker state (per provider)
const circuitBreakers: Record<string, CircuitState> = {
    resend: { state: 'closed', failures: 0, lastFailure: 0, lastSuccess: Date.now() },
    brevo: { state: 'closed', failures: 0, lastFailure: 0, lastSuccess: Date.now() },
    mailjet: { state: 'closed', failures: 0, lastFailure: 0, lastSuccess: Date.now() }
};

// In-memory provider usage tracking (resets daily)
const providerUsage: Record<string, ProviderUsage> = {
    resend: { count: 0, lastReset: Date.now() },
    brevo: { count: 0, lastReset: Date.now() },
    mailjet: { count: 0, lastReset: Date.now() }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function getTodayDocId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function getMonthKey(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}${month}`;
}

function isNewDay(lastReset: number): boolean {
    const now = new Date();
    const last = new Date(lastReset);
    return now.getDate() !== last.getDate() ||
        now.getMonth() !== last.getMonth() ||
        now.getFullYear() !== last.getFullYear();
}

// Reset daily provider counts if needed
function resetDailyCountsIfNeeded(): void {
    for (const provider of Object.keys(providerUsage)) {
        if (isNewDay(providerUsage[provider].lastReset)) {
            providerUsage[provider] = { count: 0, lastReset: Date.now() };
            logger.info(`Daily count reset for provider: ${provider}`);
        }
    }
}

// ============================================
// CIRCUIT BREAKER LOGIC
// ============================================

function isCircuitOpen(provider: string): boolean {
    const circuit = circuitBreakers[provider];
    if (!circuit) return true; // Unknown provider = blocked

    if (circuit.state === 'closed') return false;

    if (circuit.state === 'open') {
        // Check if we should try half-open
        if (Date.now() - circuit.lastFailure > CIRCUIT_BREAKER.resetTimeoutMs) {
            circuit.state = 'half-open';
            logger.info(`Circuit breaker half-open for ${provider}`);
            return false;
        }
        return true;
    }

    return false; // half-open = allow attempt
}

function recordSuccess(provider: string): void {
    const circuit = circuitBreakers[provider];
    if (!circuit) return;

    circuit.failures = 0;
    circuit.state = 'closed';
    circuit.lastSuccess = Date.now();

    // Update usage count
    resetDailyCountsIfNeeded();
    providerUsage[provider].count++;
}

function recordFailure(provider: string, error: string): void {
    const circuit = circuitBreakers[provider];
    if (!circuit) return;

    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.failures >= CIRCUIT_BREAKER.failureThreshold) {
        circuit.state = 'open';
        logger.error(`Circuit breaker OPEN for ${provider}`, { failures: circuit.failures, error });
    }
}

// ============================================
// PROVIDER SELECTION
// ============================================

function getAvailableProviders(): string[] {
    resetDailyCountsIfNeeded();

    return Object.entries(PROVIDERS)
        .filter(([key, config]) => {
            // Check if provider is enabled
            if (!config.enabled) return false;

            // Check circuit breaker
            if (isCircuitOpen(key)) {
                logger.debug(`Provider ${key} circuit is open, skipping`);
                return false;
            }

            // Check daily limit
            const usage = providerUsage[key];
            if (usage.count >= config.dailyLimit) {
                logger.debug(`Provider ${key} daily limit reached: ${usage.count}/${config.dailyLimit}`);
                return false;
            }

            // Check if API key is configured
            const hasKey = checkProviderApiKey(key);
            if (!hasKey) {
                logger.debug(`Provider ${key} API key not configured`);
                return false;
            }

            return true;
        })
        .sort((a, b) => a[1].priority - b[1].priority)
        .map(([key]) => key);
}

function checkProviderApiKey(provider: string): boolean {
    switch (provider) {
        case 'resend':
            return !!process.env.RESEND_API_KEY;
        case 'brevo':
            return !!process.env.BREVO_API_KEY;
        case 'mailjet':
            return !!(process.env.MAILJET_API_KEY && process.env.MAILJET_API_SECRET);
        default:
            return false;
    }
}

// ============================================
// USER QUOTA MANAGEMENT
// ============================================

async function getUserPlanType(userId: string): Promise<'free' | 'starter' | 'pro'> {
    try {
        const db = await getAdminDb();
        if (!db) return 'free';

        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) return 'free';

        const userData = userDoc.data();
        if (userData?.isPremium || userData?.planId?.includes('pro')) {
            return 'pro';
        }
        if (userData?.planId?.includes('starter')) {
            return 'starter';
        }
        return 'free';
    } catch (error) {
        logger.warn('Failed to get user plan type', { userId, error });
        return 'free';
    }
}

export async function checkEmailQuota(
    userId: string,
    companyId: string
): Promise<EmailQuotaResult> {
    try {
        const db = await getAdminDb();
        if (!db) {
            return { allowed: false, reason: 'Veritabanı bağlantısı yok' };
        }

        const todayDocId = getTodayDocId();
        const planType = await getUserPlanType(userId);
        const limits = QUOTA_LIMITS[planType];

        // Get today's usage document
        const usageDoc = await db.collection(EMAIL_USAGE_COLLECTION).doc(todayDocId).get();
        const usageData = usageDoc.exists ? usageDoc.data() : { globalCount: 0, users: {}, companies: {} };

        // Check global daily limit
        const globalCount = usageData?.globalCount || 0;
        if (globalCount >= GLOBAL_DAILY_LIMIT) {
            return {
                allowed: false,
                reason: 'Sistem günlük e-posta limiti doldu. Lütfen yarın tekrar deneyin.'
            };
        }

        // Check user daily limit
        const userDailyCount = usageData?.users?.[userId] || 0;
        if (userDailyCount >= limits.daily) {
            return {
                allowed: false,
                reason: `Günlük e-posta limitiniz doldu (${limits.daily}/${limits.daily}). Yarın tekrar deneyin.`
            };
        }

        // Check company monthly limit
        const monthKey = getMonthKey();
        const startOfMonth = monthKey + '01';
        const endOfMonth = monthKey + '31';

        const monthlyDocs = await db.collection(EMAIL_USAGE_COLLECTION)
            .where('__name__', '>=', startOfMonth)
            .where('__name__', '<=', endOfMonth)
            .get();

        let companyMonthlyCount = 0;
        monthlyDocs.forEach((doc: FirebaseFirestore.DocumentSnapshot) => {
            const data = doc.data();
            companyMonthlyCount += data?.companies?.[companyId] || 0;
        });

        if (companyMonthlyCount >= limits.monthly) {
            return {
                allowed: false,
                reason: `Firma aylık e-posta limiti doldu (${limits.monthly}/${limits.monthly}).`
            };
        }

        // Check if any provider is available
        const availableProviders = getAvailableProviders();
        if (availableProviders.length === 0) {
            return {
                allowed: false,
                reason: 'Tüm e-posta servisleri şu an devre dışı. Lütfen daha sonra tekrar deneyin.'
            };
        }

        return {
            allowed: true,
            remaining: {
                user: limits.daily - userDailyCount,
                company: limits.monthly - companyMonthlyCount,
                global: GLOBAL_DAILY_LIMIT - globalCount
            }
        };
    } catch (error) {
        logger.error('Email quota check failed', { userId, companyId, error });
        return { allowed: false, reason: 'Kota kontrolü başarısız oldu' };
    }
}

export async function incrementEmailUsage(
    userId: string,
    companyId: string,
    provider: string
): Promise<void> {
    try {
        const db = await getAdminDb();
        if (!db) return;

        const todayDocId = getTodayDocId();
        const usageRef = db.collection(EMAIL_USAGE_COLLECTION).doc(todayDocId);

        await db.runTransaction(async (transaction: FirebaseFirestore.Transaction) => {
            const usageDoc = await transaction.get(usageRef);

            if (!usageDoc.exists) {
                transaction.set(usageRef, {
                    globalCount: 1,
                    users: { [userId]: 1 },
                    companies: { [companyId]: 1 },
                    providers: { [provider]: 1 },
                    createdAt: new Date()
                });
            } else {
                const data = usageDoc.data() || {};
                transaction.update(usageRef, {
                    globalCount: (data.globalCount || 0) + 1,
                    [`users.${userId}`]: (data.users?.[userId] || 0) + 1,
                    [`companies.${companyId}`]: (data.companies?.[companyId] || 0) + 1,
                    [`providers.${provider}`]: (data.providers?.[provider] || 0) + 1
                });
            }
        });

        logger.info('Email usage incremented', { userId, companyId, provider, date: todayDocId });
    } catch (error) {
        logger.error('Failed to increment email usage', { userId, companyId, error });
    }
}

export async function getEmailQuotaStatus(
    userId: string,
    companyId: string
): Promise<{
    planType: string;
    limits: { daily: number; monthly: number };
    used: { daily: number; monthly: number };
    remaining: { daily: number; monthly: number };
    providers: Array<{ name: string; available: boolean; dailyUsed: number; dailyLimit: number }>;
}> {
    const planType = await getUserPlanType(userId);
    const limits = QUOTA_LIMITS[planType];

    const db = await getAdminDb();
    if (!db) {
        return {
            planType,
            limits,
            used: { daily: 0, monthly: 0 },
            remaining: limits,
            providers: []
        };
    }

    const todayDocId = getTodayDocId();
    const usageDoc = await db.collection(EMAIL_USAGE_COLLECTION).doc(todayDocId).get();
    const usageData = usageDoc.exists ? usageDoc.data() : {};

    const userDailyCount = usageData?.users?.[userId] || 0;

    // Get monthly count
    const monthKey = getMonthKey();
    const startOfMonth = monthKey + '01';
    const endOfMonth = monthKey + '31';

    const monthlyDocs = await db.collection(EMAIL_USAGE_COLLECTION)
        .where('__name__', '>=', startOfMonth)
        .where('__name__', '<=', endOfMonth)
        .get();

    let companyMonthlyCount = 0;
    monthlyDocs.forEach((doc: FirebaseFirestore.DocumentSnapshot) => {
        const data = doc.data();
        companyMonthlyCount += data?.companies?.[companyId] || 0;
    });

    // Get provider status
    resetDailyCountsIfNeeded();
    const providerStatus = Object.entries(PROVIDERS).map(([key, config]) => ({
        name: config.name,
        available: !isCircuitOpen(key) && checkProviderApiKey(key),
        dailyUsed: providerUsage[key]?.count || 0,
        dailyLimit: config.dailyLimit
    }));

    return {
        planType,
        limits,
        used: {
            daily: userDailyCount,
            monthly: companyMonthlyCount
        },
        remaining: {
            daily: Math.max(0, limits.daily - userDailyCount),
            monthly: Math.max(0, limits.monthly - companyMonthlyCount)
        },
        providers: providerStatus
    };
}

// ============================================
// EMAIL SENDING - PROVIDER IMPLEMENTATIONS
// ============================================

async function sendViaResend(
    to: string,
    subject: string,
    html: string,
    from: string,
    attachments?: Array<{ filename: string; content: Buffer }>
): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);

        const payload: any = { from, to, subject, html };
        if (attachments?.length) {
            payload.attachments = attachments;
        }

        const result = await resend.emails.send(payload);

        if (result.error) {
            return { success: false, error: result.error.message };
        }

        return { success: true, messageId: result.data?.id };
    } catch (error: any) {
        return { success: false, error: error.message || 'Resend error' };
    }
}

async function sendViaBrevo(
    to: string,
    subject: string,
    html: string,
    from: string,
    attachments?: Array<{ filename: string; content: Buffer }>
): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
        // Using fetch for Brevo API (simpler than SDK)
        const payload: any = {
            sender: { email: from.includes('<') ? from.match(/<(.+)>/)?.[1] : from },
            to: [{ email: to }],
            subject,
            htmlContent: html
        };

        if (attachments?.length) {
            payload.attachment = attachments.map(a => ({
                name: a.filename,
                content: a.content.toString('base64')
            }));
        }

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': process.env.BREVO_API_KEY!,
                'content-type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return { success: false, error: errorData.message || `HTTP ${response.status}` };
        }

        const data = await response.json();
        return { success: true, messageId: data.messageId };
    } catch (error: any) {
        return { success: false, error: error.message || 'Brevo error' };
    }
}

async function sendViaMailjet(
    to: string,
    subject: string,
    html: string,
    from: string,
    attachments?: Array<{ filename: string; content: Buffer }>
): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
        const apiKey = process.env.MAILJET_API_KEY;
        const apiSecret = process.env.MAILJET_API_SECRET;

        const payload: any = {
            Messages: [{
                From: {
                    Email: from.includes('<') ? from.match(/<(.+)>/)?.[1] : from,
                    Name: from.includes('<') ? from.split('<')[0].trim() : 'Teklifbul'
                },
                To: [{ Email: to }],
                Subject: subject,
                HTMLPart: html
            }]
        };

        if (attachments?.length) {
            payload.Messages[0].Attachments = attachments.map(a => ({
                ContentType: 'application/octet-stream',
                Filename: a.filename,
                Base64Content: a.content.toString('base64')
            }));
        }

        const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await fetch('https://api.mailjet.com/v3.1/send', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return { success: false, error: errorData.ErrorMessage || `HTTP ${response.status}` };
        }

        const data = await response.json();
        const messageId = data.Messages?.[0]?.To?.[0]?.MessageID;
        return { success: true, messageId };
    } catch (error: any) {
        return { success: false, error: error.message || 'Mailjet error' };
    }
}

/**
 * Teklifbul Rule v1.0 — Markalı transactional mail gerçekten gönderilebilir mi?
 */
export function isBrandedEmailReady(): boolean {
    const sender = String(process.env.SENDER_EMAIL || '').trim();
    if (!sender || sender.toLowerCase().includes('resend.dev')) {
        return false;
    }
    return getAvailableProviders().length > 0;
}

/** Markalı transactional e-posta (doğrulama vb.) */
export async function sendBrandedEmail(params: {
    to: string;
    subject: string;
    html: string;
}): Promise<SendEmailResult> {
    const sender = String(process.env.SENDER_EMAIL || '').trim();
    if (!sender || sender.includes('resend.dev')) {
        logger.error('sendBrandedEmail: SENDER_EMAIL yapılandırılmamış');
        return { success: false, error: 'E-posta gönderici yapılandırılmamış' };
    }

    const availableProviders = getAvailableProviders();
    if (availableProviders.length === 0) {
        return { success: false, error: 'Tüm e-posta servisleri şu an kullanılamıyor' };
    }

    for (const provider of availableProviders) {
        let result: { success: boolean; messageId?: string; error?: string };
        try {
            if (provider === 'resend') {
                result = await sendViaResend(params.to, params.subject, params.html, sender);
            } else if (provider === 'brevo') {
                result = await sendViaBrevo(params.to, params.subject, params.html, sender);
            } else {
                result = await sendViaMailjet(params.to, params.subject, params.html, sender);
            }
        } catch (err: any) {
            result = { success: false, error: err?.message || String(err) };
        }

        if (result.success) {
            logger.info('Branded email sent', { provider, to: params.to.substring(0, 3) + '***' });
            return { success: true, messageId: result.messageId, provider };
        }
        logger.warn('Branded email provider failed', { provider, error: result.error });
    }

    return { success: false, error: 'E-posta gönderilemedi' };
}

// ============================================
// MAIN EMAIL SENDING FUNCTION
// ============================================

export async function sendSupplierQuoteEmail(
    payload: SupplierEmailPayload
): Promise<SendEmailResult> {
    const SENDER_EMAIL = process.env.SENDER_EMAIL || '';
    if (!SENDER_EMAIL || SENDER_EMAIL.toLowerCase().includes('onboarding@resend.dev')) {
        logger.error('sendSupplierQuoteEmail: production sender yapılandırılmamış');
        return { success: false, error: 'E-posta gönderici adresi yapılandırılmamış' };
    }

    // Get available providers
    const availableProviders = getAvailableProviders();

    if (availableProviders.length === 0) {
        logger.error('No email providers available');
        return { success: false, error: 'Tüm e-posta servisleri şu an kullanılamıyor' };
    }

    const htmlContent = generateEmailHtml(payload);
    const subject = `Fiyat Teklifi Talebi - ${payload.requestTitle}`;

    const attachments = payload.excelAttachment
        ? [{ filename: payload.excelAttachment.filename, content: payload.excelAttachment.content }]
        : undefined;

    // Try each provider in order
    for (const provider of availableProviders) {
        logger.info(`Attempting to send email via ${provider}`, {
            to: payload.supplierEmail.substring(0, 5) + '***',
            requestId: payload.requestId
        });

        let result: { success: boolean; messageId?: string; error?: string };

        try {
            switch (provider) {
                case 'resend':
                    result = await sendViaResend(payload.supplierEmail, subject, htmlContent, SENDER_EMAIL, attachments);
                    break;
                case 'brevo':
                    result = await sendViaBrevo(payload.supplierEmail, subject, htmlContent, SENDER_EMAIL, attachments);
                    break;
                case 'mailjet':
                    result = await sendViaMailjet(payload.supplierEmail, subject, htmlContent, SENDER_EMAIL, attachments);
                    break;
                default:
                    result = { success: false, error: `Unknown provider: ${provider}` };
            }

            if (result.success) {
                recordSuccess(provider);
                logger.info(`Email sent successfully via ${provider}`, {
                    messageId: result.messageId,
                    to: payload.supplierEmail.substring(0, 5) + '***',
                    requestId: payload.requestId
                });
                return { success: true, messageId: result.messageId, provider };
            } else {
                recordFailure(provider, result.error || 'Unknown error');
                logger.warn(`Failed to send email via ${provider}, trying next`, { error: result.error });
            }
        } catch (error: any) {
            recordFailure(provider, error.message || 'Exception');
            logger.error(`Exception while sending via ${provider}`, { error: error.message });
        }
    }

    // All providers failed
    logger.error('All email providers failed', {
        requestId: payload.requestId,
        supplierEmail: payload.supplierEmail.substring(0, 5) + '***'
    });

    return {
        success: false,
        error: 'E-posta gönderilemedi. Tüm servisler şu an kullanılamıyor.'
    };
}

// ============================================
// HTML EMAIL TEMPLATE
// ============================================

function generateEmailHtml(payload: SupplierEmailPayload): string {
    const registerUrl = `${process.env.APP_URL || 'https://nefisoft.com'}/register?ref=supplier`;

    return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 600; }
    .content { padding: 24px; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .info-row { display: flex; margin: 8px 0; }
    .info-label { font-weight: 600; color: #64748b; min-width: 140px; }
    .info-value { color: #1e293b; }
    .button { display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; }
    .warning { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px 16px; margin: 16px 0; color: #92400e; font-size: 14px; }
    .footer { padding: 20px 24px; text-align: center; color: #64748b; font-size: 13px; border-top: 1px solid #e2e8f0; }
    .footer a { color: #2563eb; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>📋 Fiyat Teklifi Talebi</h1>
      </div>
      <div class="content">
        <p>Sayın Yetkili,</p>
        <p><strong>${escapeHtml(payload.companyName)}</strong> firması sizden fiyat teklifi talep etmektedir.</p>
        
        <div class="info-box">
          <div class="info-row">
            <span class="info-label">Talep No:</span>
            <span class="info-value">${escapeHtml(payload.requestNumber)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Başlık:</span>
            <span class="info-value">${escapeHtml(payload.requestTitle)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Talep Eden:</span>
            <span class="info-value">${escapeHtml(payload.requesterName)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Teslimat Yeri:</span>
            <span class="info-value">${escapeHtml(payload.deliveryLocation)}</span>
          </div>
        </div>

        <p>📎 <strong>Ek:</strong> Talep kalemleri Excel dosyası olarak eklenmiştir.</p>

        <p style="text-align: center; margin: 32px 0;">
          <a href="${escapeHtml(payload.quoteFormUrl)}" class="button">✍️ Teklif Ver</a>
        </p>

        <div class="warning">
          ⚠️ Bu link <strong>${payload.expiryDays} gün</strong> geçerlidir. Lütfen süresi dolmadan teklifinizi gönderin.
        </div>

        <!-- Kayıt Daveti -->
        <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center; color: white;">
          <p style="margin: 0 0 12px 0; font-size: 15px;">🎁 <strong>Nefisoft'a Ücretsiz Kayıt Olun!</strong></p>
          <p style="margin: 0 0 16px 0; font-size: 13px; opacity: 0.9;">Tüm tekliflerinizi tek yerden yönetin, yeni taleplere önce siz ulaşın.</p>
          <a href="${registerUrl}" style="display: inline-block; background: white; color: #059669 !important; padding: 10px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">📝 Ücretsiz Kayıt Ol</a>
        </div>
      </div>
      <div class="footer">
        <p>Bu e-posta <strong>Nefisoft</strong> platformu üzerinden gönderilmiştir.</p>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

// Escape HTML to prevent XSS in emails
function escapeHtml(text: string): string {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================
// HEALTH CHECK & STATUS
// ============================================

export function getProviderHealth(): {
    providers: Array<{
        name: string;
        status: 'healthy' | 'degraded' | 'down';
        circuit: 'closed' | 'open' | 'half-open';
        hasApiKey: boolean;
        dailyUsed: number;
        dailyLimit: number;
    }>;
    summary: {
        totalAvailable: number;
        totalDailyCapacity: number;
        totalUsedToday: number;
    };
} {
    resetDailyCountsIfNeeded();

    const providers = Object.entries(PROVIDERS).map(([key, config]) => {
        const circuit = circuitBreakers[key];
        const usage = providerUsage[key];
        const hasApiKey = checkProviderApiKey(key);

        let status: 'healthy' | 'degraded' | 'down' = 'down';
        if (hasApiKey && circuit.state === 'closed') {
            status = 'healthy';
        } else if (hasApiKey && circuit.state === 'half-open') {
            status = 'degraded';
        }

        return {
            name: config.name,
            status,
            circuit: circuit.state,
            hasApiKey,
            dailyUsed: usage?.count || 0,
            dailyLimit: config.dailyLimit
        };
    });

    const totalAvailable = providers.filter(p => p.status !== 'down').length;
    const totalDailyCapacity = Object.values(PROVIDERS).reduce((sum, p) => sum + p.dailyLimit, 0);
    const totalUsedToday = Object.values(providerUsage).reduce((sum, p) => sum + p.count, 0);

    return {
        providers,
        summary: {
            totalAvailable,
            totalDailyCapacity,
            totalUsedToday
        }
    };
}

export default {
    checkEmailQuota,
    incrementEmailUsage,
    getEmailQuotaStatus,
    sendSupplierQuoteEmail,
    getProviderHealth
};
