import './setup-env.js';
import fs from 'fs';
import path, { join } from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { logger } from '../src/shared/log/logger.js';
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
import { apiLimiter, authLimiter, publicTokenLimiter, webhookLimiter, exportLimiter } from './middleware/rate-limit.js';
import adminSubscriptionsRouter from './routes/admin-subscriptions';
import adminUsersRouter from './routes/admin-users';
import adminLogsRouter from './routes/admin-logs';
import adminSettingsRouter from './routes/admin-settings';
import adminErrorsRouter from './routes/admin-errors';
import adminTokensRouter from './routes/admin-tokens';
// Teklifbul Rule v1.4 - Admin AI Catalog
import adminAiCatalogRouter from './routes/admin-ai-catalog';
import aiClassifyRouter from './routes/ai-classify.js';
import { getAdminDb } from './utils/firestore.js';
import interimPaymentsRouter from './routes/interim-payments';
import contractsRouter from './routes/contracts';
import waybillRouter from './routes/waybills';
// Teklifbul Rule v1.0 - Tedarik├ği teklif sistemi
import supplierQuotesRouter from './routes/supplier-quotes';
// Teklifbul Rule v1.0 - Customers router (Sat─▒┼ş Mod├╝l├╝)
import customersRouter from './src/routes/customers';
import salesRouter from './src/routes/sales';
import invoicesRouter from './src/routes/invoices';
import deliveryNotesRouter from './src/routes/delivery-notes';
import incomingDocsRouter from './src/routes/incoming-docs.js';
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
  crossOriginEmbedderPolicy: false, // Firebase ve CDN'ler i├ğin
  crossOriginResourcePolicy: { policy: "cross-origin" } // Firebase i├ğin
}));

// Teklifbul Rule v1.0 - Production Hardening: CORS s─▒k─▒la┼şt─▒rma
// Varsay─▒lan origin: local dev i├ğin 5173 ÔåÆ 5174 ├ğa─şr─▒lar─▒
// Hem ALLOWED_ORIGINS hem CORS_ALLOWED_ORIGINS env de─şi┼şkenleri destekleniyor (legacy uyum)
const envAllowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = envAllowedOrigins.length > 0 ? envAllowedOrigins : [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'https://teklifbul.web.app',
  'https://teklifbul.firebaseapp.com'
];

const corsConfig = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Same-origin requests (no origin header)
    if (!origin) {
      callback(null, true);
      return;
    }

    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked origin', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  // ├ûzellikle GET/POST/OPTIONS i├ğin izin ver, di─şerleri de desteklenir
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  // reCAPTCHA, auth ve company context i├ğin gerekli header'lar
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'x-recaptcha-token',
    'X-Recaptcha-Token',
    'x-company-id', // Teklifbul Rule v1.0 - Company context header
    'X-Company-Id' // Case-insensitive i├ğin b├╝y├╝k harf versiyonu
  ],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset']
};

// CORS middleware (t├╝m router'lardan ├Ânce)
app.use(cors(corsConfig));

// Preflight OPTIONS isteklerini global olarak yan─▒tla
// Express 5'te wildcard route i├ğin middleware yakla┼ş─▒m─▒ kullan
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    cors(corsConfig)(req, res, next);
  } else {
    next();
  }
});

// Teklifbul Rule v1.0 - Response Compression (gzip/br)
// API response'lar─▒n─▒ s─▒k─▒┼şt─▒r (b├╝y├╝k JSON'lar i├ğin network ve sayfa h─▒z─▒na katk─▒)
app.use(compression({
  threshold: 1024, // 1KB ├╝st├╝n├╝ s─▒k─▒┼şt─▒r (k├╝├ğ├╝k response'lar─▒ bo┼şuna s─▒k─▒┼şt─▒rma)
  filter: (req, res) => {
    // Default compression filter
    const shouldCompress = compression.filter(req, res);

    if (!shouldCompress) {
      return false;
    }

    // PDF endpoint'lerini hari├ğ tut (ileride stream edilecekse g├╝venli)
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
// Router'lardan ├Ânce ekle (t├╝m request'leri yakalamak i├ğin)
app.use(requestMetrics);

// Teklifbul Rule v1.0 - Performance: Static assets with cache headers
app.use(express.static(join(process.cwd(), 'public'), {
  maxAge: '1y', // 1 year cache for static assets
  immutable: true, // Assets won't change (versioned)
  etag: true,
  lastModified: true
}));

// Teklifbul Rule v1.0 - Production Hardening: Rate limiting
// Global API rate limit - T├╝m /api/ isteklerine uygulan─▒r (15 dk / 500 istek olarak rate-limit.ts i├ğinde g├╝ncellenecek)
app.use('/api', apiLimiter);

// Auth endpoint'lerine ├Âzel, daha s─▒k─▒ limiter (brute-force korumas─▒)
app.use('/api/auth', authLimiter);

// Teklifbul Rule v1.0 - Webhook endpoint'leri (signature/secret tabanli) icin sikilastirilmis limit
app.use('/api/payments/webhook', webhookLimiter);

// Alt router'lar - Rate limit global uyguland─▒─ş─▒ i├ğin tekrar eklenmiyor
app.use('/api/categories', categoriesRouter);
app.use('/api/tax-offices', taxOfficesRouter);
app.use('/api/addr', addrRouter); // Teklifbul Rule v1.0 - Adres sistemi
app.use('/api/recaptcha', recaptchaRouter);
app.use('/api/auth', authRouter); // Rate limiter yukar─▒da eklendi
// Teklifbul Rule v1.0 - External bid submission (no auth required, token-based) + s─▒k─▒ limit
app.use('/api/bid-invites', publicTokenLimiter, bidInvitesRouter);
app.use('/api/submit-bid', publicTokenLimiter, bidInvitesRouter);

// Protected routes (auth middleware zaten rate limit i├ğeriyor)
app.use('/api/import', verifyToken, requirePremium, importRouter);
app.use('/api/template', verifyToken, templateRouter); // Teklifbul Rule v1.0 - ┼Şablon indirme sistemi (Premium kontrol├╝ router i├ğinde yap─▒lacak)
// Teklifbul Rule v1.3 - AI Rate Limiting (company-based)
app.use('/api/ai', verifyToken, rateLimitAi, aiRouter); // Teklifbul Rule v1.0 - Yapay zek├ó sat─▒n alma asistan─▒
app.use('/api/ai', verifyToken, rateLimitAi, aiTokenPurchasesRouter); // Teklifbul Rule v1.0 - AI token packages + purchases (company)
app.use('/api/ai', verifyToken, aiUsageReportRouter); // Teklifbul Rule v1.5 - AI Usage Report (no rate limit needed for read-only)
app.use('/api/ai', verifyToken, rateLimitAi, aiClassifyRouter); // Teklifbul Rule v1.0 - AI tools (classification, etc.) - Security Hardening
app.use('/api/chat', verifyToken, rateLimitAi, chatRouter); // Teklifbul Rule v1.0 - Basit chat endpoint
app.use('/api/inventory', verifyToken, fefoInventoryRouter); // Teklifbul SAP FEFO

// Teklifbul Rule v1.3.1 - Boot warning: in-memory limiter active
logger.warn('[AI-RL] in-memory limiter active; multi-instance deployments should use Redis.');
// Global limiter varken burada ekstra apiLimiter'a gerek yok
app.use('/api/fx', fxRouter); // Teklifbul Rule v1.0 - D├Âviz kuru proxy
app.use('/api/migration-status', verifyToken, requirePremium, migrationStatusRouter);
app.use('/api/migration-history', verifyToken, requirePremium, migrationHistoryRouter);
app.use('/api/migration-export', verifyToken, requirePremium, migrationExportRouter);
app.use('/api/supplier-memory', verifyToken, requirePremium, supplierMemoryRouter);
app.use('/api/suppliers', verifyToken, suppliersMatchRouter);
app.use('/api/account/subscription', verifyToken, accountSubscriptionRouter);
app.use('/api/payments', paymentsRouter); // Webhook endpoint'i kendi auth mekanizmas─▒n─▒ kullan─▒r
app.use('/api/payment-preference', verifyToken, paymentPreferenceRouter);
app.use('/api/user', verifyToken, userRouter);
app.use('/api/settings/purchase-assistant', verifyToken, purchaseAssistantSettingsRouter);
app.use('/api/settings/purchase-assistant', verifyToken, purchaseAssistantRestorePaidRouter); // Teklifbul Rule v3.5.2 - Restore Paid
app.use('/api/billing', verifyToken, billingPlanRouter); // Teklifbul Rule v1.6 - Plan & Usage Page
app.use('/api/leads', verifyToken, leadsRouter); // Teklifbul Rule v1.8 - Upgrade Leads

// Teklifbul Rule v1.0 - Admin check endpoint'i requireAdmin kullanmadan ├Ânce mount edilmeli
// Bu endpoint admin kontrol├╝ yapar, admin olmay─▒ gerektirmez
app.get('/api/admin/check', verifyToken, async (req: any, res) => {
  try {
    if (!req.user) {
      return res.json({ isAdmin: false });
    }

    // Custom claims'den admin kontrol├╝
    const customClaims = req.user.customClaims || {};
    let isAdmin = customClaims.admin === true || customClaims.role === 'admin';
    let isOps = customClaims.ops === true || customClaims.role === 'ops';

    // E─şer custom claims'de admin yoksa Firestore'dan kontrol et
    if (!isAdmin && !isOps) {
      try {
        const db = await getAdminDb();
        if (db) {
          const userDoc = await db.collection('users').doc(req.user.uid).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            isAdmin = userData?.isAdmin === true || userData?.role === 'admin';
            isOps = userData?.isOps === true || userData?.role === 'ops';
          }
        }
      } catch (firestoreError: any) {
        logger.warn('Firestore admin check failed', {
          error: firestoreError?.message || String(firestoreError)
        });
      }
    }

    return res.json({ isAdmin: isAdmin || isOps });
  } catch (error: any) {
    logger.error('Admin kontrol├╝ hatas─▒', {
      error: error?.message || String(error)
    });
    return res.json({ isAdmin: false });
  }
});

app.use('/api/admin', verifyToken, requireAdmin, adminUsersRouter); // Teklifbul Rule v1.0 - Admin kullan─▒c─▒ y├Ânetimi
app.use('/api/admin', verifyToken, requireAdmin, adminSubscriptionsRouter);
app.use('/api/admin', verifyToken, requireAdmin, adminLogsRouter); // Teklifbul Rule v1.0 - Admin log y├Ânetimi
app.use('/api/admin', verifyToken, requireAdmin, adminSettingsRouter); // Teklifbul Rule v1.0 - Admin sistem ayarlar─▒
app.use('/api/admin', verifyToken, requireAdmin, adminAiCatalogRouter); // Teklifbul Rule v1.4 - Admin AI Catalog Management
app.use('/api/admin', verifyToken, requireAdmin, adminProfitRouter); // Teklifbul Rule v2.0 - Admin Profit Report
app.use('/api/admin', verifyToken, requireAdmin, adminProfitDetailRouter); // Teklifbul Rule v2.5 - Admin Profit Detail
app.use('/api/admin', verifyToken, requireAdmin, adminProfitAlertsRouter); // Teklifbul Rule v2.6 - Admin Profit Alerts
app.use('/api/admin', verifyToken, requireAdmin, adminGuardrailsRouter); // Teklifbul Rule v2.7.1 - Admin Guardrails
app.use('/api/admin', verifyToken, requireAdmin, adminAiHealthRouter); // Teklifbul Rule v3.4 - Admin AI Health Check
app.use('/api/admin/ai-controls', verifyToken, requireAdmin, adminAiControlsRouter); // Teklifbul Rule v3.11 - Admin AI Controls
app.use('/api/admin', verifyToken, requireAdmin, adminEntitlementsRouter); // Teklifbul Rule v3.14 - Admin Entitlements Debug
app.use('/api/admin/finance', verifyToken, requireAdmin, adminFinanceSnapshotsRouter); // Teklifbul Rule v3.18 - Admin Finance Snapshots
app.use('/api/admin/auto-protection', verifyToken, requireAdmin, adminAutoProtectionRouter); // Teklifbul Rule v3.20 - Admin Auto-Protection
app.use('/api/admin/errors', verifyToken, requireAdmin, adminErrorsRouter); // Teklifbul Rule v1.0 - Admin hata y├Ânetimi
app.use('/api/admin/tokens', verifyToken, requireAdmin, adminTokensRouter); // Teklifbul Rule v1.0 - Admin token y├Ânetimi
import tokenPacksRouter from './routes/token-packs';
app.use('/api/token-packs', verifyToken, tokenPacksRouter); // Teklifbul Rule v1.0 - Token paketi sat─▒n alma
app.use('/api/interim-payments', verifyToken, interimPaymentsRouter); // Teklifbul Rule v1.0 - Hakedi┼ş y├Ânetim sistemi
app.use('/api/contracts', verifyToken, contractsRouter); // Teklifbul Rule v1.0 - S├Âzle┼şme y├Ânetim sistemi
app.use('/api/waybills', verifyToken, waybillRouter); // Teklifbul Rule v1.0 - ─░rsaliye kar┼ş─▒la┼şt─▒rma sistemi
// Teklifbul Rule v1.0 - Tedarik├ği teklif sistemi:
// public/token tabanli alt yollara sikilastirilmis limit (validate-token, request/:token, submit/:token)
app.use('/api/supplier-quotes/validate-token', publicTokenLimiter);
app.use('/api/supplier-quotes/request', publicTokenLimiter);
app.use('/api/supplier-quotes/submit', publicTokenLimiter);
app.use('/api/supplier-quotes', supplierQuotesRouter);
// Teklifbul Rule v1.0 - Sat─▒┼ş Mod├╝l├╝ routes
app.use('/api/customers', verifyToken, customersRouter);
app.use('/api/sales', verifyToken, salesRouter);
app.use('/api/invoices', verifyToken, invoicesRouter);
app.use('/api/delivery-notes', verifyToken, deliveryNotesRouter);
app.use('/api/incoming-docs', verifyToken, incomingDocsRouter);
// Teklifbul Rule v1.0 - Kasa Mod├╝l├╝ (ETA uyumlu)
import cashRouter from './src/routes/cash';
app.use('/api/cash-accounts', verifyToken, cashRouter);
app.use('/api/edoc', edocSettingsRouter); // Teklifbul Rule v1.0 - E-Belge ayarlar─▒ (i├ğinde verifyToken var)

// Export: Sat─▒n Alma Formu (Excel) - Auth + Rate Limit korumal─▒
app.get('/api/export/purchase-form', (_req, res) => {
  res.status(405).json({ ok: false, error: 'method_not_allowed', hint: 'Use POST with meta, items' });
});
app.post('/api/export/purchase-form', exportLimiter, verifyToken, async (req, res) => {
  try {
    const { meta = {}, items = [], userRole, userName, demandCode, demandData } = req.body || {};
    const code = demandCode || `SATFK-${Date.now()}`;
    // Resolve template path with fallbacks
    const candidates = [
      join(process.cwd(), 'backend', 'templates', '├Ârnek sat─▒n alma formu.xlsx'),
      join(process.cwd(), 'backend', 'templates', 'ornek satin alma formu.xlsx'),
      join(process.cwd(), 'assets', '├Ârnek sat─▒n alma formu.xlsx'),
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
      ws.getRow(5).values = [, 'No', 'Stok Kodu', 'Malzeme Tan─▒m─▒', 'Marka/Model', 'Miktar', 'Birim', 'Depo', 'G├Ârsel', 'Termin', 'A├ğ─▒klama'];
    }
    const ws = wb.worksheets[0];

    // Header cells with all requested information
    // I3: Talep Kodu (SATFK)
    ws.getCell('I3').value = code;

    // I2: Ba┼şl─▒k
    if (demandData?.title) ws.getCell('I2').value = demandData.title;

    // K2: Talep Tarihi
    if (demandData?.demandDate) ws.getCell('K2').value = demandData.demandDate;

    // I4: Al─▒m Yeri (─░l)
    if (demandData?.purchaseLocation) ws.getCell('I4').value = demandData.purchaseLocation;

    // I1: ┼Şantiye
    if (demandData?.siteName) ws.getCell('I1').value = demandData.siteName;

    // K1: Talep Tipi
    if (demandData?.biddingMode) {
      const biddingModeText = getBiddingModeText(demandData.biddingMode);
      ws.getCell('K1').value = biddingModeText;
    }

    // K3: S├╝reli (Ba┼şlang─▒├ğ ve Biti┼ş Tarihi)
    if (demandData?.phaseStart && demandData?.phaseEnd) {
      ws.getCell('K3').value = `${demandData.phaseStart} / ${demandData.phaseEnd}`;
    }

    // K4: ├ûncelik
    if (demandData?.priority) ws.getCell('K4').value = demandData.priority;

    // Para birimi (default TRY if not specified)
    const _currency = demandData?.currency || "TRY";

    // L6: ├ûdeme ┼Şartlar─▒ (for first item)
    if (demandData?.paymentTerms && items.length > 0) {
      ws.getCell('L6').value = demandData.paymentTerms;
    }

    // Role-dependent names
    // K11: Onay Veren
    if (userRole === 'approver') ws.getCell('K11').value = userName || '';
    // H11: Genel M├╝d├╝r
    if (demandData?.generalManager) ws.getCell('H11').value = demandData.generalManager;
    // G11: Sat─▒n Alma Yetkilisi
    if (userRole === 'satinalma_yetkilisi') ws.getCell('G11').value = userName || '';
    // F11: Talep Eden
    if (demandData?.requester) ws.getCell('F11').value = demandData.requester;

    // A11 and onwards: A├ğ─▒klamalar
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

    // D12: Teslim ┼Şekli + Adres
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
      r.getCell(8).value = it.imageUrl || '';           // H: G├Ârsel
      r.getCell(9).value = it.requestedDate || '';      // I: Termin
      r.getCell(10).value = it.note || '';              // J: A├ğ─▒klama
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
    "open": "A├ğ─▒k Teklif (tek tur)",
    "hybrid": "Hibrit (1. tur gizli, 2. tur a├ğ─▒k)"
  };
  return modeMap[mode] || mode || "-";
}

// Save JSON helpers
function ensureDirSync(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// POST /save-mahalle-json { districtId, districtName, neighborhoods }
// Teklifbul Rule v1.0 - Security: Admin auth + Path traversal korumas─▒
app.post('/save-mahalle-json', verifyToken, requireAdmin, (req, res) => {
  try {
    const { districtId, districtName, neighborhoods } = req.body || {};
    if (!districtId || !Array.isArray(neighborhoods)) {
      return res.status(400).json({ ok: false, error: 'invalid_body' });
    }
    // Path traversal korumas─▒: sadece alfanumerik ve tire/alt ├ğizgi kabul et
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
// Teklifbul Rule v1.0 - Security: Admin auth + Path traversal korumas─▒
app.post('/save-street-json', verifyToken, requireAdmin, (req, res) => {
  try {
    const { districtId, neighborhoodId, districtName, neighborhoodName, streets } = req.body || {};
    if (!districtId || !neighborhoodId || !Array.isArray(streets)) {
      return res.status(400).json({ ok: false, error: 'invalid_body' });
    }
    // Path traversal korumas─▒
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
app.use('/health', healthRouter);
app.use('/metrics', metricsRouter);
// Teklifbul Rule v1.0 - Client Error Reporting v1
app.use('/api/client-errors', clientErrorsRouter);

// Teklifbul Rule v1.0 - Global error handler (t├╝m route'lardan sonra)
app.use(async (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const statusCode = err?.status || 500;

  // Teklifbul Rule v1.0 - Security: 5xx hatalar─▒n─▒ logla
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

  // Teklifbul Rule v1.0 - Error tracker ile hatalar─▒ Firestore'a kaydet
  try {
    const { trackBackendError } = await import('./utils/error-tracker.js');
    await trackBackendError(err instanceof Error ? err : new Error(String(err)), req, statusCode);
  } catch (trackError) {
    // Error tracker hatas─▒ kritik de─şil, sessizce devam et
    logger.warn('Error tracker failed', trackError);
  }

  // Hata mesaj─▒n─▒ g├╝venli ┼şekilde d├Ând├╝r (Teklifbul Rule v1.0 - Centralized Error Catalog)
  const { Errors } = await import('./src/errors/errorCatalog.js');
  const { respondError } = await import('./src/errors/respondError.js');
  respondError(
    res,
    Errors.internal(process.env.NODE_ENV === 'development' ? (err?.message || String(err)) : 'Bir hata olu┼ştu')
  );
});

// 404 handler (t├╝m route'lardan sonra)
app.use(async (req: express.Request, res: express.Response) => {
  // Teklifbul Rule v1.0 - Centralized Error Catalog
  const { Errors } = await import('./src/errors/errorCatalog.js');
  const { respondError } = await import('./src/errors/respondError.js');
  respondError(
    res,
    Errors.notFound(`Endpoint bulunamad─▒: ${req.method} ${req.path}`)
  );
});

const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : (process.env.PORT ? Number(process.env.PORT) : 5174);
// Teklifbul Rule v1.0 - Server ba┼şlatma mesaj─▒ i├ğin logger kullan
// Not: Server dosyalar─▒nda console.log'a izin verilir (eslint config'de exception var)
// Ancak tutarl─▒l─▒k i├ğin logger kullan─▒yoruz

// OPENAI_API_KEY kontrol├╝ (log seviyesi: debug, anahtar bilgisi loglanmaz)
if (!process.env.OPENAI_API_KEY) {
  logger.warn('OPENAI_API_KEY is not configured');
}

// Teklifbul Rule v1.0 - Graceful shutdown i├ğin server instance'─▒ sakla
let server: any;

// Teklifbul Rule v1.0 - Sadece ana mod├╝l olarak ├ğal─▒┼şt─▒r─▒ld─▒─ş─▒nda listen yap
// Cloud Functions ve di─şer import durumlar─▒nda listen atlan─▒r
if (process.env.NODE_ENV !== 'production' || !process.env.FUNCTION_SIGNATURE_TYPE) {
  server = app.listen(PORT, () => {
    console.log(`[API] listening on http://localhost:${PORT}`);
  });

  // Handle termination signals
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

export { app };
export default app;

// Teklifbul Rule v1.0 - Graceful shutdown handling
let isShuttingDown = false;

function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n­şøæ API server kapat─▒l─▒yor (${signal})...`);

  server.close(() => {
    console.log('Ô£à API server g├╝venli ┼şekilde kapat─▒ld─▒');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('ÔÜá´©Å  Force shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Windows'ta process exit event'i
process.on('exit', (code) => {
  if (code !== 0 && !isShuttingDown) {
    console.log(`Ôä╣´©Å  API server exit code: ${code}`);
  }
});

// Uncaught exception handling
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  gracefulShutdown('uncaughtException');
});

// Unhandled promise rejection
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  gracefulShutdown('unhandledRejection');
});


