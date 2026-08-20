import './setup-env.js';
import fs from 'fs';
import path, { join } from 'path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { logger } from '../src/shared/log/logger.js';
import { resolveAllowedOrigins, corsOriginDelegate } from './constants/allowed-origins.js';
import { serverLogger } from './utils/logger.js';
import importRouter from './routes/import';
import ExcelJS from 'exceljs';

// Teklifbul Rule v1.0 - Categories router
import categoriesRouter from '../src/modules/categories/routes/categories';
// Teklifbul Rule v1.0 - Tax Offices router
import taxOfficesRouter from '../src/modules/taxOffices/routes/taxOffices';
// Teklifbul Rule v1.0 - Address router
import addrRouter from './routes/addr';
// Teklifbul Rule v1.0 - Template router
import templateRouter from './routes/template';
// Teklifbul Rule v1.0 - AI Purchase Assistant router
import aiRouter from './routes/ai';
// Teklifbul Rule v1.0 - Chat router
import chatRouter from './routes/chat';
import aiTokenPurchasesRouter from './routes/ai-token-purchases';
import aiUsageReportRouter from './routes/ai-usage-report';
import billingPlanRouter from './routes/billing-plan';
import leadsRouter from './routes/leads';
import adminProfitRouter from './routes/admin-profit';
import adminProfitDetailRouter from './routes/admin-profit-detail';
import adminProfitAlertsRouter from './routes/admin-profit-alerts';
import adminGuardrailsRouter from './routes/admin-guardrails';
import adminAiHealthRouter from './routes/admin-ai-health';
import adminAiControlsRouter from './routes/admin-ai-controls'; // Teklifbul Rule v3.11 - Admin AI Controls
import adminEntitlementsRouter from './routes/admin-entitlements'; // Teklifbul Rule v3.14 - Admin Entitlements Debug
import adminFinanceSnapshotsRouter from './routes/admin-finance-snapshots'; // Teklifbul Rule v3.18 - Admin Finance Snapshots
import adminAutoProtectionRouter from './routes/admin-auto-protection'; // Teklifbul Rule v3.20 - Admin Auto-Protection
// Teklifbul Rule v1.3 - AI Rate Limiting
import { rateLimitAi } from './middleware/rateLimitAi.js';
import fxRouter from './routes/fx';
import accountSubscriptionRouter from './routes/account-subscription';
import paymentsRouter from './routes/payments';
import paymentPreferenceRouter from './src/routes/payment-preference';
import migrationStatusRouter from './routes/migration-status';
import migrationHistoryRouter from './routes/migration-history';
import migrationExportRouter from './routes/migration-export';
import recaptchaRouter from './routes/recaptcha';
import supplierMemoryRouter from './routes/supplier-memory';
import suppliersMatchRouter from './routes/suppliers-match';
import userRouter from './routes/user';
import authRouter from './routes/auth';
import purchaseAssistantSettingsRouter from './routes/purchase-assistant-settings';
import purchaseAssistantRestorePaidRouter from './routes/purchase-assistant-restore-paid'; // Teklifbul Rule v3.5.2
import { verifyToken } from './middleware/auth.js';
import { requirePremium } from './middleware/requirePremium.js';
import { requireAdmin } from './middleware/requireAdmin.js';
import { isAdminUser, isOpsUser } from './auth/admin-check.js';
import { apiLimiter, authLimiter, publicTokenLimiter, webhookLimiter, exportLimiter, uploadLimiter } from './middleware/rate-limit.js';
import adminSubscriptionsRouter from './routes/admin-subscriptions';
import adminUsersRouter from './routes/admin-users';
import adminLogsRouter from './routes/admin-logs';
import adminSettingsRouter from './routes/admin-settings';
import adminErrorsRouter from './routes/admin-errors';
import adminTokensRouter from './routes/admin-tokens';
import contactPublicRouter, { contactAdminRouter } from './routes/contact';
// Teklifbul Rule v1.4 - Admin AI Catalog
import adminAiCatalogRouter from './routes/admin-ai-catalog';
import aiClassifyRouter from './routes/ai-classify.js';
import { getAdminDb } from './utils/firestore.js';
import interimPaymentsRouter from './routes/interim-payments';
import contractsRouter from './routes/contracts';
import waybillRouter from './routes/waybills';
// Teklifbul Rule v1.0 - Tedarikçi teklif sistemi
import supplierQuotesRouter from './routes/supplier-quotes';
import internalRequestsRouter from './routes/internal-requests';
// Teklifbul Rule v1.0 - Customers router (Satış Modülü)
import customersRouter from './src/routes/customers';
import salesRouter from './src/routes/sales';
import invoicesRouter from './src/routes/invoices';
import deliveryNotesRouter from './src/routes/delivery-notes';
import incomingDocsRouter from './src/routes/incoming-docs.js';
import stockMovementsRouter from './src/routes/stock-movements.js';
import edocSettingsRouter from './src/routes/edoc-settings';
// Teklifbul Rule v1.0 - Observability v1
import healthRouter from './src/routes/health';
import metricsRouter from './src/routes/metrics';
import { requestMetrics } from './src/middleware/requestMetrics';
import clientErrorsRouter from './src/routes/client-errors';
// Teklifbul Rule v1.0 - External bid submission via email token
import bidInvitesRouter from './routes/bid-invites';
import fefoInventoryRouter from './routes/fefo-inventory.js';

const app = express();

// Teklifbul Rule v1.0 - Production Hardening: Security Headers
// Helmet.js - Security headers (XSS, clickjacking, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Teklifbul Rule v1.0 - ReCAPTCHA Enterprise needs google domains
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://www.gstatic.com",
        "https://www.google.com",
        "https://www.recaptcha.net"
      ],
      scriptSrcElem: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://www.gstatic.com",
        "https://www.google.com",
        "https://www.recaptcha.net"
      ],
      // Teklifbul Rule v1.0 - Inline event handlers (onclick, onchange, etc.)
      scriptSrcAttr: [
        "'unsafe-inline'",
        "'unsafe-hashes'"
      ],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "https://*.googleapis.com", "https://*.firebaseio.com", "https://nominatim.openstreetmap.org"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false, // Firebase ve CDN'ler için
  crossOriginResourcePolicy: { policy: "cross-origin" } // Firebase için
}));

// Teklifbul Rule v1.0 - Production Hardening: CORS sıkılaştırma
// Web + Capacitor WebView origin'leri (ALLOWED_ORIGINS / CORS_ALLOWED_ORIGINS)
const allowedOrigins = resolveAllowedOrigins();

const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (origin && !allowedOrigins.includes(origin)) {
      logger.warn('CORS blocked origin', { origin });
    }
    corsOriginDelegate(allowedOrigins)(origin, callback);
  },
  credentials: true,
  // Özellikle GET/POST/OPTIONS için izin ver, diğerleri de desteklenir
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  // reCAPTCHA, auth ve company context için gerekli header'lar
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'x-recaptcha-token',
    'X-Recaptcha-Token',
    'x-company-id', // Teklifbul Rule v1.0 - Company context header
    'X-Company-Id' // Case-insensitive için büyük harf versiyonu
  ],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset']
};

// CORS middleware (tüm router'lardan önce)
app.use(cors(corsConfig));

// Preflight OPTIONS isteklerini global olarak yanıtla
// Express 5'te wildcard route için middleware yaklaşımı kullan
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    cors(corsConfig)(req, res, next);
  } else {
    next();
  }
});

// Teklifbul Rule v1.0 - Response Compression (gzip/br)
// API response'larını sıkıştır (büyük JSON'lar için network ve sayfa hızına katkı)
app.use(compression({
  threshold: 1024, // 1KB üstünü sıkıştır (küçük response'ları boşuna sıkıştırma)
  filter: (req, res) => {
    // Default compression filter
    const shouldCompress = compression.filter(req, res);

    if (!shouldCompress) {
      return false;
    }

    // PDF endpoint'lerini hariç tut (ileride stream edilecekse güvenli)
    const path = req.path || '';
    if (path.endsWith('/pdf')) {
      return false;
    }

    return true;
  }
}));

app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Teklifbul Rule v1.0 - Observability v1: Request metrics middleware
// Router'lardan önce ekle (tüm request'leri yakalamak için)
app.use(requestMetrics);

// Teklifbul Rule v1.0 - Performance: Static assets with cache headers
app.use(express.static(join(process.cwd(), 'public'), {
  maxAge: '1y', // 1 year cache for static assets
  immutable: true, // Assets won't change (versioned)
  etag: true,
  lastModified: true
}));

// Teklifbul Rule v1.0 - Production Hardening: Rate limiting
// Global API rate limit - Tüm /api/ isteklerine uygulanır (15 dk / 500 istek olarak rate-limit.ts içinde güncellenecek)
app.use('/api', apiLimiter);

// Auth endpoint'lerine özel, daha sıkı limiter (brute-force koruması)
app.use('/api/auth', authLimiter);

// Teklifbul Rule v1.0 - Webhook endpoint'leri (signature/secret tabanli) icin sikilastirilmis limit
app.use('/api/payments/webhook', webhookLimiter);

// Alt router'lar - Rate limit global uygulandığı için tekrar eklenmiyor
app.use('/api/categories', categoriesRouter);
app.use('/api/tax-offices', taxOfficesRouter);
app.use('/api/addr', addrRouter); // Teklifbul Rule v1.0 - Adres sistemi
app.use('/api/recaptcha', recaptchaRouter);
app.use('/api/auth', authRouter); // Rate limiter yukarıda eklendi
// Teklifbul Rule v1.0 - External bid submission (no auth required, token-based) + sıkı limit
app.use('/api/bid-invites', publicTokenLimiter, bidInvitesRouter);
app.use('/api/submit-bid', publicTokenLimiter, bidInvitesRouter);

// Protected routes (auth middleware zaten rate limit içeriyor)
app.use('/api/import', verifyToken, requirePremium, uploadLimiter, importRouter);
app.use('/api/template', verifyToken, templateRouter); // Teklifbul Rule v1.0 - Şablon indirme sistemi (Premium kontrolü router içinde yapılacak)
// Teklifbul Rule v1.3 - AI Rate Limiting (company-based)
app.use('/api/ai', verifyToken, rateLimitAi, aiRouter); // Teklifbul Rule v1.0 - Yapay zekâ satın alma asistanı
app.use('/api/ai', verifyToken, rateLimitAi, aiTokenPurchasesRouter); // Teklifbul Rule v1.0 - AI token packages + purchases (company)
app.use('/api/ai', verifyToken, aiUsageReportRouter); // Teklifbul Rule v1.5 - AI Usage Report (no rate limit needed for read-only)
app.use('/api/ai', verifyToken, rateLimitAi, aiClassifyRouter); // Teklifbul Rule v1.0 - AI tools (classification, etc.) - Security Hardening
app.use('/api/chat', verifyToken, rateLimitAi, chatRouter); // Teklifbul Rule v1.0 - Basit chat endpoint
app.use('/api/inventory', verifyToken, fefoInventoryRouter); // Teklifbul SAP FEFO

// Teklifbul Rule v1.3.1 - Boot warning: in-memory limiter active
logger.warn('[AI-RL] in-memory limiter active; multi-instance deployments should use Redis.');
// Global limiter varken burada ekstra apiLimiter'a gerek yok
app.use('/api/fx', fxRouter); // Teklifbul Rule v1.0 - Döviz kuru proxy
app.use('/api/migration-status', verifyToken, requirePremium, migrationStatusRouter);
app.use('/api/migration-history', verifyToken, requirePremium, migrationHistoryRouter);
app.use('/api/migration-export', verifyToken, requireAdmin, migrationExportRouter);
app.use('/api/supplier-memory', verifyToken, requirePremium, supplierMemoryRouter);
app.use('/api/suppliers', verifyToken, suppliersMatchRouter);
app.use('/api/account/subscription', verifyToken, accountSubscriptionRouter);
app.use('/api/payments', paymentsRouter); // Webhook endpoint'i kendi auth mekanizmasını kullanır
app.use('/api/payment-preference', verifyToken, paymentPreferenceRouter);
app.use('/api/user', verifyToken, userRouter);
app.use('/api/settings/purchase-assistant', verifyToken, purchaseAssistantSettingsRouter);
app.use('/api/settings/purchase-assistant', verifyToken, purchaseAssistantRestorePaidRouter); // Teklifbul Rule v3.5.2 - Restore Paid
app.use('/api/billing', verifyToken, billingPlanRouter); // Teklifbul Rule v1.6 - Plan & Usage Page
app.use('/api/leads', verifyToken, leadsRouter); // Teklifbul Rule v1.8 - Upgrade Leads
app.use('/api/contact', contactPublicRouter); // Teklifbul Rule v1.0 - Public iletişim formu

// Teklifbul Rule v1.0 - Admin check endpoint'i requireAdmin kullanmadan önce mount edilmeli
// Bu endpoint admin kontrolü yapar, admin olmayı gerektirmez
app.get('/api/admin/check', verifyToken, async (req: any, res) => {
  try {
    if (!req.user) {
      return res.json({ isAdmin: false, isOps: false, canAccessOpsTools: false });
    }

    const isAdmin = isAdminUser(req.user);
    const isOps = isOpsUser(req.user);
    // isAdmin ve isOps ayrı — ops, admin API'lerine otomatik geçmez
    return res.json({ isAdmin, isOps, canAccessOpsTools: isAdmin || isOps });
  } catch (error: any) {
    logger.error('Admin kontrolü hatası', {
      error: error?.message || String(error)
    });
    return res.json({ isAdmin: false, isOps: false, canAccessOpsTools: false });
  }
});

app.use('/api/admin', verifyToken, requireAdmin, adminUsersRouter); // Teklifbul Rule v1.0 - Admin kullanıcı yönetimi
app.use('/api/admin', verifyToken, requireAdmin, adminSubscriptionsRouter);
app.use('/api/admin', verifyToken, requireAdmin, adminLogsRouter); // Teklifbul Rule v1.0 - Admin log yönetimi
app.use('/api/admin', verifyToken, requireAdmin, adminSettingsRouter); // Teklifbul Rule v1.0 - Admin sistem ayarları
app.use('/api/admin', verifyToken, requireAdmin, adminAiCatalogRouter); // Teklifbul Rule v1.4 - Admin AI Catalog Management
app.use('/api/admin', verifyToken, requireAdmin, adminProfitRouter); // Teklifbul Rule v2.0 - Admin Profit Report
app.use('/api/admin', verifyToken, requireAdmin, adminProfitDetailRouter); // Teklifbul Rule v2.5 - Admin Profit Detail
app.use('/api/admin', verifyToken, requireAdmin, adminProfitAlertsRouter); // Teklifbul Rule v2.6 - Admin Profit Alerts
app.use('/api/admin/guardrails', verifyToken, requireAdmin, adminGuardrailsRouter); // Teklifbul Rule v2.7.1 - Admin Guardrails
app.use('/api/admin', verifyToken, requireAdmin, adminAiHealthRouter); // Teklifbul Rule v3.4 - Admin AI Health Check
app.use('/api/admin/ai-controls', verifyToken, requireAdmin, adminAiControlsRouter); // Teklifbul Rule v3.11 - Admin AI Controls
app.use('/api/admin', verifyToken, requireAdmin, adminEntitlementsRouter); // Teklifbul Rule v3.14 - Admin Entitlements Debug
app.use('/api/admin/finance', verifyToken, requireAdmin, adminFinanceSnapshotsRouter); // Teklifbul Rule v3.18 - Admin Finance Snapshots
app.use('/api/admin/auto-protection', verifyToken, requireAdmin, adminAutoProtectionRouter); // Teklifbul Rule v3.20 - Admin Auto-Protection
app.use('/api/admin/errors', verifyToken, requireAdmin, adminErrorsRouter); // Teklifbul Rule v1.0 - Admin hata yönetimi
app.use('/api/admin/tokens', verifyToken, requireAdmin, adminTokensRouter); // Teklifbul Rule v1.0 - Admin token yönetimi
app.use('/api/admin', verifyToken, requireAdmin, contactAdminRouter); // Teklifbul Rule v1.0 - İletişim mesajları
import tokenPacksRouter from './routes/token-packs';
app.use('/api/token-packs', verifyToken, tokenPacksRouter); // Teklifbul Rule v1.0 - Token paketi satın alma
app.use('/api/interim-payments', verifyToken, interimPaymentsRouter); // Teklifbul Rule v1.0 - Hakediş yönetim sistemi
app.use('/api/contracts', verifyToken, contractsRouter); // Teklifbul Rule v1.0 - Sözleşme yönetim sistemi
app.use('/api/waybills', verifyToken, waybillRouter); // Teklifbul Rule v1.0 - İrsaliye karşılaştırma sistemi
// Teklifbul Rule v1.0 - Tedarikçi teklif sistemi:
// public/token tabanli alt yollara sikilastirilmis limit (validate-token, request/:token, submit/:token)
app.use('/api/supplier-quotes/validate-token', publicTokenLimiter);
app.use('/api/supplier-quotes/request', publicTokenLimiter);
app.use('/api/supplier-quotes/submit', publicTokenLimiter);
app.use('/api/supplier-quotes', supplierQuotesRouter);
// Teklifbul Rule v1.0 - Satış Modülü routes
app.use('/api/customers', verifyToken, requirePremium, customersRouter);
app.use('/api/sales', verifyToken, requirePremium, salesRouter);
app.use('/api/invoices', verifyToken, requirePremium, invoicesRouter);
app.use('/api/delivery-notes', verifyToken, requirePremium, deliveryNotesRouter);
app.use('/api/incoming-docs', verifyToken, requirePremium, incomingDocsRouter);
app.use('/api/stock-movements', verifyToken, stockMovementsRouter);
app.use('/api/internal-requests', internalRequestsRouter);
// Teklifbul Rule v1.0 - Kasa Modülü (ETA uyumlu)
import cashRouter from './src/routes/cash';
app.use('/api/cash-accounts', verifyToken, cashRouter);
app.use('/api/edoc', edocSettingsRouter); // Teklifbul Rule v1.0 - E-Belge ayarları (içinde verifyToken var)

// Export: Satın Alma Formu (Excel) - Auth + Rate Limit korumalı
app.get('/api/export/purchase-form', (_req, res) => {
  res.status(405).json({ ok: false, error: 'method_not_allowed', hint: 'Use POST with meta, items' });
});
app.post('/api/export/purchase-form', exportLimiter, verifyToken, async (req, res) => {
  try {
    const { meta = {}, items = [], userRole, userName, demandCode, demandData } = req.body || {};
    const code = demandCode || `SATFK-${Date.now()}`;
    // Resolve template path with fallbacks
    const candidates = [
      join(process.cwd(), 'backend', 'templates', 'örnek satın alma formu.xlsx'),
      join(process.cwd(), 'backend', 'templates', 'ornek satin alma formu.xlsx'),
      join(process.cwd(), 'assets', 'örnek satın alma formu.xlsx'),
      join(process.cwd(), 'assets', 'ornek satin alma formu.xlsx'),
    ];
    const templatePath = candidates.find(p => fs.existsSync(p));

    const wb = new ExcelJS.Workbook();
    if (templatePath) {
      await wb.xlsx.readFile(templatePath);
    } else {
      // Fallback: build minimal workbook if template missing
      const ws = wb.addWorksheet('SATFK');
      ws.getCell('H3').value = 'SATFK';
      ws.getCell('I3').value = code;
      ws.getRow(5).values = [, 'No', 'Stok Kodu', 'Malzeme Tanımı', 'Marka/Model', 'Miktar', 'Birim', 'Depo', 'Görsel', 'Termin', 'Açıklama'];
    }
    const ws = wb.worksheets[0];

    // Header cells with all requested information
    // I3: Talep Kodu (SATFK)
    ws.getCell('I3').value = code;

    // I2: Başlık
    if (demandData?.title) ws.getCell('I2').value = demandData.title;

    // K2: Talep Tarihi
    if (demandData?.demandDate) ws.getCell('K2').value = demandData.demandDate;

    // I4: Alım Yeri (İl)
    if (demandData?.purchaseLocation) ws.getCell('I4').value = demandData.purchaseLocation;

    // I1: Şantiye
    if (demandData?.siteName) ws.getCell('I1').value = demandData.siteName;

    // K1: Talep Tipi
    if (demandData?.biddingMode) {
      const biddingModeText = getBiddingModeText(demandData.biddingMode);
      ws.getCell('K1').value = biddingModeText;
    }

    // K3: Süreli (Başlangıç ve Bitiş Tarihi)
    if (demandData?.phaseStart && demandData?.phaseEnd) {
      ws.getCell('K3').value = `${demandData.phaseStart} / ${demandData.phaseEnd}`;
    }

    // K4: Öncelik
    if (demandData?.priority) ws.getCell('K4').value = demandData.priority;

    // Para birimi (default TRY if not specified)
    const _currency = demandData?.currency || "TRY";

    // L6: Ödeme Şartları (for first item)
    if (demandData?.paymentTerms && items.length > 0) {
      ws.getCell('L6').value = demandData.paymentTerms;
    }

    // Role-dependent names
    // K11: Onay Veren
    if (userRole === 'approver') ws.getCell('K11').value = userName || '';
    // H11: Genel Müdür
    if (demandData?.generalManager) ws.getCell('H11').value = demandData.generalManager;
    // G11: Satın Alma Yetkilisi
    if (userRole === 'satinalma_yetkilisi') ws.getCell('G11').value = userName || '';
    // F11: Talep Eden
    if (demandData?.requester) ws.getCell('F11').value = demandData.requester;

    // A11 and onwards: Açıklamalar
    if (Array.isArray(demandData?.descriptions)) {
      demandData.descriptions.forEach((desc: string, index: number) => {
        if (desc && desc.trim()) {
          const row = 11 + index; // Start from A11
          ws.getCell(`A${row}`).value = desc.trim();
        }
      });
    } else if (demandData?.spec) {
      ws.getCell('A11').value = demandData.spec;
    }

    // D12: Teslim Şekli + Adres
    const deliveryCombined = `${meta.deliveryMethod || ''} ${meta.deliveryAddress || ''}`.trim();
    ws.getCell('D12').value = deliveryCombined || null;

    // Items start at row 6
    const rowIdx = 6;
    items.forEach((it: any, i: number) => {
      const r = ws.getRow(rowIdx + i);
      r.getCell(1).value = it.lineNo ?? i + 1;          // A: No
      r.getCell(2).value = it.sku || '';                // B: SKU
      r.getCell(3).value = it.name || '';               // C: Ad
      r.getCell(4).value = it.brandModel || '';         // D: Marka/Model
      r.getCell(5).value = it.qty ?? null;              // E: Miktar
      r.getCell(6).value = it.unit || '';               // F: Birim
      r.getCell(7).value = it.warehouseQty ?? null;     // G: Depodaki
      r.getCell(8).value = it.imageUrl || '';           // H: Görsel
      r.getCell(9).value = it.requestedDate || '';      // I: Termin
      r.getCell(10).value = it.note || '';              // J: Açıklama
      r.commit();

      // For each item, set the delivery date in the appropriate cell
      // I6 for first item, I7 for second item, etc.
      if (it.requestedDate) {
        ws.getCell(`I${6 + i}`).value = it.requestedDate;
      }
    });

    res.setHeader('Content-Disposition', `attachment; filename="SATFK_${code}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error('export purchase-form error', e);
    res.status(500).json({ ok: false, error: 'export_failed' });
  }
});

// Helper function to get bidding mode text
function getBiddingModeText(mode: string) {
  const modeMap: Record<string, string> = {
    "secret": "Gizli Teklif (tek tur)",
    "open": "Açık Teklif (tek tur)",
    "hybrid": "Hibrit (1. tur gizli, 2. tur açık)"
  };
  return modeMap[mode] || mode || "-";
}

// Save JSON helpers
function ensureDirSync(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// POST /save-mahalle-json { districtId, districtName, neighborhoods }
// Teklifbul Rule v1.0 - Security: Admin auth + Path traversal koruması
app.post('/save-mahalle-json', verifyToken, requireAdmin, (req, res) => {
  try {
    const { districtId, districtName, neighborhoods } = req.body || {};
    if (!districtId || !Array.isArray(neighborhoods)) {
      return res.status(400).json({ ok: false, error: 'invalid_body' });
    }
    // Path traversal koruması: sadece alfanumerik ve tire/alt çizgi kabul et
    const safeDistrictId = String(districtId).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeDistrictId || safeDistrictId !== String(districtId)) {
      return res.status(400).json({ ok: false, error: 'invalid_districtId' });
    }
    const outDir = join(process.cwd(), 'public', 'assets', 'mahalle');
    ensureDirSync(outDir);
    const outPath = join(outDir, `${safeDistrictId}.json`);
    const payload = { districtId: safeDistrictId, districtName, neighborhoods };
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
    return res.json({ ok: true, path: `/assets/mahalle/${safeDistrictId}.json` });
  } catch (e) {
    logger.error('save-mahalle-json error', e);
    return res.status(500).json({ ok: false });
  }
});

// POST /save-street-json { districtId, districtName, neighborhoodId, neighborhoodName, streets }
// Teklifbul Rule v1.0 - Security: Admin auth + Path traversal koruması
app.post('/save-street-json', verifyToken, requireAdmin, (req, res) => {
  try {
    const { districtId, neighborhoodId, districtName, neighborhoodName, streets } = req.body || {};
    if (!districtId || !neighborhoodId || !Array.isArray(streets)) {
      return res.status(400).json({ ok: false, error: 'invalid_body' });
    }
    // Path traversal koruması
    const safeDistrictId = String(districtId).replace(/[^a-zA-Z0-9_-]/g, '');
    const safeNeighborhoodId = String(neighborhoodId).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeDistrictId || safeDistrictId !== String(districtId) || !safeNeighborhoodId || safeNeighborhoodId !== String(neighborhoodId)) {
      return res.status(400).json({ ok: false, error: 'invalid_ids' });
    }
    const outDir = join(process.cwd(), 'public', 'assets', 'sokak');
    ensureDirSync(outDir);
    const outPath = join(outDir, `${safeDistrictId}_mah-${safeNeighborhoodId}.json`);
    const payload = { districtId: safeDistrictId, districtName, neighborhoodId: safeNeighborhoodId, neighborhoodName, streets };
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
    return res.json({ ok: true, path: `/assets/sokak/${safeDistrictId}_mah-${safeNeighborhoodId}.json` });
  } catch (e) {
    logger.error('save-street-json error', e);
    return res.status(500).json({ ok: false });
  }
});

// Teklifbul Rule v1.0 - Observability v1: Health and metrics endpoints
// /api/* Firebase Hosting rewrite ile Cloud Function'a gider; kök /health hosting'de HTML döner.
app.use('/health', healthRouter);
app.use('/metrics', metricsRouter);
app.use('/api/health', healthRouter);
app.use('/api/metrics', metricsRouter);
// Teklifbul Rule v1.0 - Client Error Reporting v1
app.use('/api/client-errors', clientErrorsRouter);

// Teklifbul Rule v1.0 - Global error handler (tüm route'lardan sonra)
app.use(async (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const statusCode = err?.status || 500;

  // Teklifbul Rule v1.0 - Security: 5xx hatalarını logla
  if (statusCode >= 500) {
    serverLogger.security.serverError(req, err instanceof Error ? err : new Error(String(err)), statusCode);
  } else {
    logger.error('Unhandled route error', {
      error: err?.message || String(err),
      stack: err?.stack,
      path: req.path,
      method: req.method
    });
  }

  // Teklifbul Rule v1.0 - Error tracker ile hataları Firestore'a kaydet
  try {
    const { trackBackendError } = await import('./utils/error-tracker.js');
    await trackBackendError(err instanceof Error ? err : new Error(String(err)), req, statusCode);
  } catch (trackError) {
    // Error tracker hatası kritik değil, sessizce devam et
    logger.warn('Error tracker failed', trackError);
  }

  // Hata mesajını güvenli şekilde döndür (Teklifbul Rule v1.0 - Centralized Error Catalog)
  const { Errors } = await import('./src/errors/errorCatalog.js');
  const { respondError } = await import('./src/errors/respondError.js');
  respondError(
    res,
    Errors.internal(process.env.NODE_ENV === 'development' ? (err?.message || String(err)) : 'Bir hata oluştu')
  );
});

// 404 handler (tüm route'lardan sonra)
app.use(async (req: express.Request, res: express.Response) => {
  // Teklifbul Rule v1.0 - Centralized Error Catalog
  const { Errors } = await import('./src/errors/errorCatalog.js');
  const { respondError } = await import('./src/errors/respondError.js');
  respondError(
    res,
    Errors.notFound(`Endpoint bulunamadı: ${req.method} ${req.path}`)
  );
});

const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : (process.env.PORT ? Number(process.env.PORT) : 5174);
// Teklifbul Rule v1.0 - Server başlatma mesajı için logger kullan
// Not: Server dosyalarında console.log'a izin verilir (eslint config'de exception var)
// Ancak tutarlılık için logger kullanıyoruz

// OPENAI_API_KEY kontrolü (log seviyesi: debug, anahtar bilgisi loglanmaz)
if (!process.env.OPENAI_API_KEY) {
  logger.warn('OPENAI_API_KEY is not configured');
}

// Teklifbul Rule v1.0 - Graceful shutdown için server instance'ı sakla
let server: any;

// Teklifbul Rule v1.0 - Sadece doğrudan çalıştırıldığında listen (Functions import'ta port açma)
const isFirebaseManaged =
  Boolean(process.env.K_SERVICE) ||
  Boolean(process.env.FUNCTION_TARGET) ||
  Boolean(process.env.FIREBASE_CONFIG);

const isExecutedDirectly = (() => {
  if (isFirebaseManaged) return false;
  try {
    const entry = process.argv[1];
    if (!entry) return false;
    return fileURLToPath(import.meta.url) === path.resolve(entry);
  } catch {
    return false;
  }
})();

if (isExecutedDirectly) {
  server = app.listen(PORT, () => {
    console.log(`[API] listening on http://localhost:${PORT}`);
  });

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    gracefulShutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason, promise });
    gracefulShutdown('unhandledRejection');
  });
} else {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception (managed runtime — process kept alive)', error);
  });
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection (managed runtime — process kept alive)', { reason, promise });
  });
}

export { app };
export default app;

// Teklifbul Rule v1.0 - Graceful shutdown handling
let isShuttingDown = false;

function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 API server kapatılıyor (${signal})...`);

  if (!server) {
    process.exit(0);
    return;
  }

  server.close(() => {
    console.log('✅ API server güvenli şekilde kapatıldı');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Force shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Windows'ta process exit event'i
process.on('exit', (code) => {
  if (code !== 0 && !isShuttingDown) {
    console.log(`ℹ️  API server exit code: ${code}`);
  }
});


