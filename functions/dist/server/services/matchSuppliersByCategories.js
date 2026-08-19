/**
 * Teklifbul Rule v1.0 — Admin SDK ile kategori bazlı tedarikçi eşleme
 * Client users sorgusu security rules'a takıldığı için sunucu tarafında çalışır.
 */
import { getAdminDb } from '../utils/firestore.js';
import { logger } from '../../src/shared/log/logger.js';
function chunkArray(arr, chunkSize) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
        chunks.push(arr.slice(i, i + chunkSize));
    }
    return chunks;
}
function uniq(arr) {
    return Array.from(new Set(arr.filter(Boolean)));
}
function isSupplierUser(data) {
    const isActive = data.isActive !== false;
    if (!isActive)
        return false;
    return ((Array.isArray(data.roles) && data.roles.includes('supplier')) ||
        (data.roles && typeof data.roles === 'object' && !Array.isArray(data.roles) && data.roles.supplier === true) ||
        data.role === 'supplier' ||
        data.isSupplier === true);
}
function sanitizeSupplier(id, data) {
    return {
        uid: id,
        id,
        displayName: data.displayName || data.name || data.companyName || null,
        email: null,
        companyId: data.companyId || data.activeCompanyId || null,
        roles: data.roles || null,
        role: data.role || null,
        isActive: data.isActive !== false,
        supplierCategoryIds: Array.isArray(data.supplierCategoryIds) ? data.supplierCategoryIds : [],
        supplierCategoryKeys: Array.isArray(data.supplierCategoryKeys) ? data.supplierCategoryKeys : [],
        supplierCategories: Array.isArray(data.supplierCategories) ? data.supplierCategories : [],
        categories: Array.isArray(data.categories) ? data.categories : [],
        category: typeof data.category === 'string' ? data.category : null,
    };
}
async function runFieldQuery(db, fieldName, values, resultMap) {
    const uniqueValues = uniq(values);
    if (!uniqueValues.length)
        return;
    const batches = chunkArray(uniqueValues, 10);
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        try {
            const snap = await db
                .collection('users')
                .where(fieldName, 'array-contains-any', batch)
                .limit(100)
                .get();
            snap.docs.forEach((docSnap) => {
                const data = docSnap.data() || {};
                if (!isSupplierUser(data))
                    return;
                if (!resultMap.has(docSnap.id)) {
                    resultMap.set(docSnap.id, sanitizeSupplier(docSnap.id, data));
                }
            });
        }
        catch (err) {
            logger.error(`Admin supplier query failed [${fieldName}] batch ${batchIndex + 1}`, {
                code: err?.code || 'unknown',
                message: err?.message || String(err),
            });
            throw err;
        }
    }
}
export async function matchSuppliersByCategories(options) {
    const categoryIds = Array.isArray(options.categoryIds) ? options.categoryIds : [];
    const legacySlugs = Array.isArray(options.legacySlugs) ? options.legacySlugs : [];
    const legacyNames = Array.isArray(options.legacyNames) ? options.legacyNames : [];
    if (!categoryIds.length && !legacySlugs.length && !legacyNames.length) {
        return [];
    }
    const db = await getAdminDb();
    if (!db) {
        throw new Error('firestore_unavailable');
    }
    const resultMap = new Map();
    if (categoryIds.length) {
        await runFieldQuery(db, 'supplierCategoryIds', categoryIds, resultMap);
    }
    if (legacySlugs.length) {
        await runFieldQuery(db, 'supplierCategoryKeys', legacySlugs, resultMap);
    }
    if (legacyNames.length) {
        await runFieldQuery(db, 'supplierCategories', legacyNames, resultMap);
    }
    const results = Array.from(resultMap.values());
    logger.info('Admin matchSuppliersByCategories', { count: results.length, categoryIds: categoryIds.length });
    return results;
}
