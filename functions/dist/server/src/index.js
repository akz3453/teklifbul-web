import express from "express";
import cors from "cors";
import helmet from "helmet";
import demands from "./routes/demands.js";
import groups from "./routes/groups.js";
import paymentPref from "./routes/payment-preference.js";
import paymentsRouter from "../routes/payments.js";
import accountSubscriptionRouter from "../routes/account-subscription.js";
import adminSubscriptionsRouter from "../routes/admin-subscriptions.js";
import escrow from "./routes/escrow.js";
import importRouter from "../routes/import.js";
import categoriesRouter from "../../src/modules/categories/routes/categories.js";
import taxOfficesRouter from "../../src/modules/taxOffices/routes/taxOffices.js";
import offersRouter from "./api/offers.js";
import customersRouter from "./routes/customers.js";
import salesRouter from "./routes/sales.js";
import invoicesRouter from "./routes/invoices.js";
import deliveryNotesRouter from "./routes/delivery-notes.js";
import incomingDocsRouter from "./routes/incoming-docs.js";
import stockMovementsRouter from "./routes/stock-movements.js";
import efaturaRouter from "./routes/efatura.js";
// Teklifbul Rule v1.0 - Production Hardening
import { apiLimiter, authLimiter, uploadLimiter, exportLimiter } from "../middleware/rate-limit.js";
import { healthCheck } from "../routes/health.js";
import authRouter from "../routes/auth.js";
import migrationStatusRouter from "../routes/migration-status.js";
import migrationHistoryRouter from "../routes/migration-history.js";
import migrationExportRouter from "../routes/migration-export.js";
import { verifyToken } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { requirePremium } from "../middleware/requirePremium.js";
// Teklifbul Rule v1.0 - Template routes
import templateRouter from "../routes/template.js";
// Teklifbul Rule v1.0 - Supplier Memory routes
import supplierMemoryRouter from "../routes/supplier-memory.js";
// Teklifbul Rule v1.0 - AI Assistant routes
import aiAssistantRouter from "../routes/ai-assistant.js";
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from "../../src/shared/log/logger.js";
import { resolveAllowedOrigins, corsOriginDelegate } from "../constants/allowed-origins.js";
const app = express();
// Teklifbul Rule v1.0 - Production Hardening: Security Headers
app.use(helmet({
    contentSecurityPolicy: false, // Frontend Vite/Express ana CSP'yi kontrol ediyor
    crossOriginEmbedderPolicy: false
}));
// Teklifbul Rule v1.0 - Sirket whitelist tabanli CORS (server/index.ts ile uyumlu)
const finalOrigins = resolveAllowedOrigins();
app.use(cors({
    origin: (origin, callback) => {
        if (origin && !finalOrigins.includes(origin)) {
            logger.warn('CORS blocked origin', { origin });
        }
        return corsOriginDelegate(finalOrigins)(origin, callback);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'x-recaptcha-token',
        'X-Recaptcha-Token',
        'x-company-id',
        'X-Company-Id'
    ],
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset']
}));
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
// Rate limiting (Production Hardening)
// Genel API limiti
app.use("/api", apiLimiter);
// Auth endpoint'leri için sıkı limit
app.use("/api/auth", authLimiter);
// Upload endpoint'leri için özel limit
app.use("/api/upload", uploadLimiter);
app.use("/api/import", uploadLimiter); // Import da upload sayılır
// Auth routes (rate limiting'den sonra, route'lardan önce)
app.use("/api/auth", authRouter);
app.use("/api/demands", verifyToken, demands);
app.use("/api/groups", verifyToken, groups);
app.use("/api/payment-preference", paymentPref);
app.use("/api/payments", paymentsRouter);
app.use("/api/account/subscription", accountSubscriptionRouter);
app.use("/api/admin", adminSubscriptionsRouter);
// Teklifbul Rule v1.0 - escrow rotasi yalnizca DEV ortamda ve auth ile aktif (in-memory demo)
if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_ESCROW_DEMO === 'true') {
    app.use("/api/escrow", verifyToken, escrow);
    logger.warn('[escrow] DEMO route enabled (NODE_ENV != production)');
}
else {
    app.use("/api/escrow", (_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
}
app.use("/api/import", verifyToken, requirePremium, importRouter);
app.use("/api/offers", verifyToken, offersRouter);
app.use("/api/customers", verifyToken, requirePremium, customersRouter);
app.use("/api/sales", verifyToken, requirePremium, salesRouter);
app.use("/api/invoices", verifyToken, requirePremium, invoicesRouter);
app.use("/api/delivery-notes", verifyToken, requirePremium, deliveryNotesRouter);
app.use("/api/incoming-docs", verifyToken, requirePremium, incomingDocsRouter);
app.use("/api/stock-movements", verifyToken, stockMovementsRouter);
app.use("/api/efatura", verifyToken, efaturaRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/tax-offices", taxOfficesRouter);
app.use("/api/template", verifyToken, templateRouter);
app.use("/api/supplier-memory", verifyToken, requirePremium, supplierMemoryRouter);
app.use("/api/ai", verifyToken, requirePremium, aiAssistantRouter);
// Health check (rate limiting'den muaf)
app.get('/health', healthCheck);
app.get('/api/health', healthCheck);
// Migration APIs
app.use('/api/migration-status', verifyToken, requirePremium, migrationStatusRouter);
app.use('/api/migration-history', verifyToken, requirePremium, migrationHistoryRouter);
// Migration Export (admin-only, rate limited)
app.use('/api/migrations', exportLimiter, verifyToken, requireAdmin, migrationExportRouter);
// Teklifbul Rule v1.0 - Sadece doğrudan çalıştırıldığında listen (Functions import'ta port açma)
const PORT = process.env.API_PORT ? Number(process.env.API_PORT) : 5174;
const isFirebaseManaged = Boolean(process.env.K_SERVICE) ||
    Boolean(process.env.FUNCTION_TARGET) ||
    Boolean(process.env.FIREBASE_CONFIG);
if (!isFirebaseManaged) {
    app.listen(PORT, () => {
        logger.info(`API listening on http://localhost:${PORT}`);
    });
}
