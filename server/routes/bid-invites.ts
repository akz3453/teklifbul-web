/**
 * Bid Invites API Routes
 * Handles token-based bid submission for external suppliers
 */
import { Router, Request, Response } from 'express';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import ExcelJS from 'exceljs';

const router = Router();
const db = getFirestore();

/**
 * GET /api/bid-invites/:token
 * Validates a bid invite token and returns demand info
 */
router.get('/:token', async (req: Request, res: Response) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({ error: 'Token required', message: 'Token gerekli' });
        }

        // Fetch token from Firestore
        const tokenDoc = await db.collection('bidInvites').doc(token).get();

        if (!tokenDoc.exists) {
            return res.status(404).json({ error: 'Not found', message: 'Geçersiz veya süresi dolmuş link' });
        }

        const tokenData = tokenDoc.data()!;

        // Check if token is already used
        if (tokenData.used) {
            return res.status(410).json({ error: 'Already used', message: 'Bu link daha önce kullanılmış' });
        }

        // Check expiration
        const expiresAt = tokenData.expiresAt?.toDate ? tokenData.expiresAt.toDate() : new Date(tokenData.expiresAt);
        if (new Date() > expiresAt) {
            return res.status(410).json({ error: 'Expired', message: 'Link süresi dolmuş' });
        }

        // Fetch demand info
        const demandDoc = await db.collection('demands').doc(tokenData.demandId).get();
        if (!demandDoc.exists) {
            return res.status(404).json({ error: 'Demand not found', message: 'Talep bulunamadı' });
        }

        const demandData = demandDoc.data()!;

        // Get item count
        const itemsSnap = await db.collection('demands').doc(tokenData.demandId).collection('items').get();

        res.json({
            demand: {
                id: demandDoc.id,
                satfk: demandData.satfk,
                title: demandData.title,
                creatorCompanyName: demandData.creatorCompanyName,
                dueDate: demandData.dueDate
            },
            itemCount: itemsSnap.size,
            supplierEmail: tokenData.supplierEmail
        });

    } catch (error) {
        console.error('Token validation error:', error);
        res.status(500).json({ error: 'Server error', message: 'Sunucu hatası' });
    }
});

/**
 * POST /api/submit-bid
 * Submits a bid using a token and uploaded Excel file
 */
router.post('/submit', async (req: Request, res: Response) => {
    try {
        const { token, fileName, fileContent } = req.body;

        if (!token || !fileContent) {
            return res.status(400).json({ error: 'Missing data', message: 'Token ve dosya gerekli' });
        }

        // Validate token
        const tokenDoc = await db.collection('bidInvites').doc(token).get();
        if (!tokenDoc.exists) {
            return res.status(404).json({ error: 'Invalid token', message: 'Geçersiz token' });
        }

        const tokenData = tokenDoc.data()!;

        if (tokenData.used) {
            return res.status(410).json({ error: 'Already used', message: 'Bu link daha önce kullanılmış' });
        }

        const expiresAt = tokenData.expiresAt?.toDate ? tokenData.expiresAt.toDate() : new Date(tokenData.expiresAt);
        if (new Date() > expiresAt) {
            return res.status(410).json({ error: 'Expired', message: 'Link süresi dolmuş' });
        }

        // Parse Excel file - ExcelJS accepts ArrayBuffer
        const buffer = Buffer.from(fileContent, 'base64');
        const workbook = new ExcelJS.Workbook();
        // @ts-expect-error - Node 22 Buffer type incompatibility with ExcelJS
        await workbook.xlsx.load(buffer);

        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
            return res.status(400).json({ error: 'Invalid Excel', message: 'Excel dosyası okunamadı' });
        }

        // Extract bid items from Excel (assuming format from generateBidFormExcel)
        // Header row is 4, data starts from row 5
        const bidItems: Array<{
            lineNo: number;
            sku: string;
            name: string;
            brand: string;
            qty: number;
            unit: string;
            unitPrice: number;
            vatRate: number;
            total: number;
        }> = [];

        const HEADER_ROW = 4;
        let rowNum = HEADER_ROW + 1;
        let hasData = true;

        while (hasData && rowNum < 1000) { // Safety limit
            const row = worksheet.getRow(rowNum);
            const lineNo = row.getCell(1).value;

            if (!lineNo || lineNo === '' || (typeof lineNo === 'string' && lineNo.includes('TOPLAM'))) {
                hasData = false;
                break;
            }

            const unitPriceVal = row.getCell(7).value;
            const vatRateVal = row.getCell(8).value;

            bidItems.push({
                lineNo: Number(lineNo) || rowNum - HEADER_ROW,
                sku: String(row.getCell(2).value || ''),
                name: String(row.getCell(3).value || ''),
                brand: String(row.getCell(4).value || ''),
                qty: Number(row.getCell(5).value) || 0,
                unit: String(row.getCell(6).value || 'Adet'),
                unitPrice: typeof unitPriceVal === 'number' ? unitPriceVal : parseFloat(String(unitPriceVal)) || 0,
                vatRate: typeof vatRateVal === 'number' ? vatRateVal : parseFloat(String(vatRateVal)) || 0,
                total: 0 // Will be calculated
            });

            rowNum++;
        }

        // Calculate totals
        bidItems.forEach(item => {
            item.total = item.qty * item.unitPrice * (1 + item.vatRate / 100);
        });

        const totalAmount = bidItems.reduce((sum, item) => sum + item.total, 0);

        // Create bid document
        const bidRef = db.collection('bids').doc();
        await bidRef.set({
            demandId: tokenData.demandId,
            supplierEmail: tokenData.supplierEmail,
            supplierId: null, // External supplier, no user ID
            isExternalBid: true,
            source: 'email_invite',
            inviteToken: token,
            items: bidItems,
            totalAmount,
            currency: 'TRY',
            status: 'pending',
            fileName,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        });

        // Mark token as used
        await db.collection('bidInvites').doc(token).update({
            used: true,
            usedAt: FieldValue.serverTimestamp(),
            bidId: bidRef.id
        });

        console.log(`External bid created: ${bidRef.id} for demand ${tokenData.demandId}`);

        res.json({
            success: true,
            bidId: bidRef.id,
            itemCount: bidItems.length,
            totalAmount
        });

    } catch (error) {
        console.error('Bid submission error:', error);
        res.status(500).json({ error: 'Server error', message: 'Teklif gönderilemedi' });
    }
});

export default router;
