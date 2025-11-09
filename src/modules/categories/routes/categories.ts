/**
 * Categories API Routes
 * Teklifbul Rule v1.0
 * 
 * Firestore kullanıyor - $0 maliyet
 */

import { Router, Request, Response } from 'express';
import { getCategories, getCategoryById, suggestCategory, saveFeedback } from '../../../services/firestore-categories';

const router = Router();

// GET /api/categories - Liste
router.get('/', async (req: Request, res: Response) => {
  try {
    const { q, withDesc = 'true', page = '1', size = '100' } = req.query;
    
    const result = await getCategories({
      search: q as string | undefined,
      withDesc: withDesc === 'true',
      page: Number(page) || 1,
      size: Math.min(Number(size) || 100, 200)
    });
    
    res.json(result);
  } catch (e: any) {
    console.error('Categories list error:', e);
    res.status(500).json({ error: e.message || 'Internal server error' });
  }
});

// GET /api/categories/:id - Detay
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const category = await getCategoryById(id);
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json(category);
  } catch (e: any) {
    console.error('Category detail error:', e);
    res.status(500).json({ error: e.message || 'Internal server error' });
  }
});

// POST /api/categories/:id/desc - Açıklama güncelle (admin)
router.post('/:id/desc', async (req: Request, res: Response) => {
  try {
    // TODO: Auth middleware - admin/ops kontrolü
    const { id } = req.params;
    const { short_desc, examples } = req.body;
    
    // Firestore update
    const { doc, updateDoc } = await import('firebase/firestore');
    const { db } = await import('../../../lib/firebase');
    
    await updateDoc(doc(db, 'categories', id), {
      short_desc: short_desc || null,
      examples: examples || null,
      updatedAt: new Date()
    });
    
    // Cache'i temizle
    const { cache } = await import('../../../services/in-memory-cache');
    await cache.del(`category:${id}`);
    await cache.delPattern('categories:list:*');
    
    res.json({ success: true });
  } catch (e: any) {
    console.error('Category desc update error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/categories/suggest - Kategori öner
router.post('/suggest', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text parameter is required' });
    }
    
    const result = await suggestCategory(text);
    res.json(result);
  } catch (e: any) {
    console.error('Category suggest error:', e);
    res.status(500).json({ error: e.message || 'Internal server error' });
  }
});

// POST /api/categories/feedback - Geri bildirim kaydet
router.post('/feedback', async (req: Request, res: Response) => {
  try {
    const { query, suggested_category_id, chosen_category_id, user_id } = req.body;
    
    await saveFeedback(query, suggested_category_id, chosen_category_id, user_id);
    
    res.json({ success: true });
  } catch (e: any) {
    console.error('Category feedback error:', e);
    res.status(500).json({ error: e.message || 'Internal server error' });
  }
});

export default router;

