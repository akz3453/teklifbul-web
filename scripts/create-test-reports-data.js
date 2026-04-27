/**
 * Test Reports Data Creator
 * Teklifbul Rule v1.0 - Stok Raporları için test verileri oluşturur
 * 
 * Kullanım: node scripts/create-test-reports-data.js
 * 
 * Bu script, teklifbultedarikci1@gmail.com kullanıcısı için:
 * 1. Min Stok Altı raporu için test verileri
 * 2. Maliyet Altı Satış raporu için test verileri
 * 3. Lokasyon Stok raporu için test verileri
 * 4. Gerçek Maliyet raporu için test verileri
 * oluşturur.
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Firebase Admin SDK'yı başlat
import { existsSync } from 'fs';
const serviceAccountPath = join(__dirname, '..', 'serviceAccountKey.json');

if (!existsSync(serviceAccountPath)) {
  console.error('❌ serviceAccountKey.json bulunamadı!');
  console.log('Firebase Console → Project Settings → Service Accounts → Generate New Private Key');
  console.log('\nAlternatif: Frontend\'den test verileri oluşturmak için:');
  console.log('http://localhost:5173/create-test-reports-data.html');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const auth = admin.auth();

// Teklifbul Rule v1.0 - Structured Logging
const logger = {
  group: (title) => console.log(`\n🧭 ${title}`),
  info: (msg, data) => console.log(`ℹ️ ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`⚠️ ${msg}`, data || ''),
  error: (msg, err) => console.error(`❌ ${msg}`, err || ''),
  end: () => console.log('')
};

async function getUserCompanyId(email) {
  try {
    logger.group('Kullanıcı Bilgisi');
    
    // Kullanıcıyı email ile bul
    const user = await auth.getUserByEmail(email);
    logger.info('Kullanıcı bulundu', { uid: user.uid, email: user.email });
    
    // Kullanıcının companyId'sini bul
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (!userDoc.exists) {
      throw new Error('Kullanıcı dokümanı bulunamadı');
    }
    
    const userData = userDoc.data();
    const companyId = userData.companyId || userData.activeCompanyId;
    
    if (!companyId) {
      throw new Error('Kullanıcının companyId\'si bulunamadı');
    }
    
    logger.info('Company ID bulundu', { companyId });
    logger.end();
    
    return { uid: user.uid, companyId };
  } catch (error) {
    logger.error('Kullanıcı bilgisi alınamadı', error);
    throw error;
  }
}

async function createTestLocations(companyId) {
  logger.group('Lokasyonlar Oluşturuluyor');
  
  const locations = [
    { name: 'Merkez Depo', type: 'DEPOT', province: 'İstanbul', district: 'Şişli', addressSummary: 'İstanbul, Şişli' },
    { name: 'Şantiye A', type: 'SITE', province: 'İstanbul', district: 'Kadıköy', addressSummary: 'İstanbul, Kadıköy' },
    { name: 'Şantiye B', type: 'SITE', province: 'Ankara', district: 'Çankaya', addressSummary: 'Ankara, Çankaya' }
  ];
  
  const locationIds = [];
  
  for (const loc of locations) {
    const docRef = await db.collection('stock_locations').add({
      ...loc,
      companyId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    locationIds.push(docRef.id);
    logger.info('Lokasyon oluşturuldu', { id: docRef.id, name: loc.name });
  }
  
  logger.end();
  return locationIds;
}

async function createTestStocks(companyId) {
  logger.group('Stok Kartları Oluşturuluyor');
  
  const stocks = [
    { sku: 'CIM-001', name: 'ÇİMENTO 32 KG', brand: 'Lafarge', unit: 'KG', minStock: 100, avgCost: 45.50, salePrice: 55.00, lastPurchasePrice: 45.50 },
    { sku: 'DEM-001', name: 'DEMİR 12 MM', brand: 'İÇDAŞ', unit: 'TON', minStock: 5, avgCost: 12500.00, salePrice: 13500.00, lastPurchasePrice: 12500.00 },
    { sku: 'KUM-001', name: 'KUM İNCE', brand: null, unit: 'TON', minStock: 20, avgCost: 350.00, salePrice: 420.00, lastPurchasePrice: 350.00 },
    { sku: 'BOY-001', name: 'BOYA BEYAZ 20 LT', brand: 'Marshall', unit: 'LT', minStock: 50, avgCost: 280.00, salePrice: 350.00, lastPurchasePrice: 280.00 },
    { sku: 'TUĞ-001', name: 'TUĞLA KIRMIZI', brand: null, unit: 'ADT', minStock: 1000, avgCost: 2.50, salePrice: 3.20, lastPurchasePrice: 2.50 },
    { sku: 'BET-001', name: 'BETON C25', brand: null, unit: 'M3', minStock: 10, avgCost: 450.00, salePrice: 550.00, lastPurchasePrice: 450.00 }
  ];
  
  const stockIds = [];
  
  for (const stock of stocks) {
    // Teklifbul Rule v1.0 - Türkçe normalizasyon (basit)
    const nameNorm = stock.name
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toUpperCase('tr-TR')
      .replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/İ/g, 'I')
      .replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U');
    
    const docRef = await db.collection('stocks').add({
      ...stock,
      companyId,
      name_norm: nameNorm,
      search_keywords: generateSearchKeywords(stock.name),
      vatRate: 20,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    stockIds.push({ id: docRef.id, ...stock });
    logger.info('Stok kartı oluşturuldu', { id: docRef.id, sku: stock.sku, name: stock.name });
  }
  
  logger.end();
  return stockIds;
}

function generateSearchKeywords(name) {
  const normalized = name
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/i/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');
  
  const words = normalized.split(/\s+/).filter(Boolean);
  const keywords = new Set();
  
  words.forEach(word => {
    for (let i = 1; i <= Math.min(8, word.length); i++) {
      keywords.add(word.slice(0, i));
    }
  });
  
  return Array.from(keywords);
}

async function createTestMovements(companyId, stockIds, locationIds) {
  logger.group('Stok Hareketleri Oluşturuluyor');
  
  const now = admin.firestore.Timestamp.now();
  const movements = [];
  
  // 1. Min Stok Altı için: Bazı ürünlerde düşük stok oluştur
  // CIM-001: 100 min, 50 mevcut (düşük)
  // DEM-001: 5 min, 2 mevcut (düşük)
  // KUM-001: 20 min, 15 mevcut (düşük)
  
  const cimStock = stockIds.find(s => s.sku === 'CIM-001');
  const demStock = stockIds.find(s => s.sku === 'DEM-001');
  const kumStock = stockIds.find(s => s.sku === 'KUM-001');
  const boyStock = stockIds.find(s => s.sku === 'BOY-001');
  const tugStock = stockIds.find(s => s.sku === 'TUĞ-001');
  const betStock = stockIds.find(s => s.sku === 'BET-001');
  
  const loc1 = locationIds[0]; // Merkez Depo
  const loc2 = locationIds[1]; // Şantiye A
  
  // Giriş hareketleri (IN)
  movements.push(
    // CIM-001: 50 kg giriş (min 100, düşük stok)
    {
      stockId: cimStock.id,
      sku: 'CIM-001',
      companyId,
      locationId: loc1,
      type: 'IN',
      qty: 50,
      unitCost: 45.50,
      totalCost: 2275.00,
      extras: [
        { type: 'NAKLİYE', amount: 100.00 },
        { type: 'AMBALAJ', amount: 50.00 }
      ],
      createdAt: admin.firestore.Timestamp.fromMillis(now.toMillis() - 7 * 24 * 60 * 60 * 1000), // 7 gün önce
      createdBy: 'system'
    },
    // DEM-001: 2 ton giriş (min 5, düşük stok)
    {
      stockId: demStock.id,
      sku: 'DEM-001',
      companyId,
      locationId: loc1,
      type: 'IN',
      qty: 2,
      unitCost: 12500.00,
      totalCost: 25000.00,
      extras: [{ type: 'NAKLİYE', amount: 500.00 }],
      createdAt: admin.firestore.Timestamp.fromMillis(now.toMillis() - 5 * 24 * 60 * 60 * 1000), // 5 gün önce
      createdBy: 'system'
    },
    // KUM-001: 15 ton giriş (min 20, düşük stok)
    {
      stockId: kumStock.id,
      sku: 'KUM-001',
      companyId,
      locationId: loc2,
      type: 'IN',
      qty: 15,
      unitCost: 350.00,
      totalCost: 5250.00,
      extras: [],
      createdAt: admin.firestore.Timestamp.fromMillis(now.toMillis() - 3 * 24 * 60 * 60 * 1000), // 3 gün önce
      createdBy: 'system'
    },
    // BOY-001: 30 lt giriş (min 50, düşük stok)
    {
      stockId: boyStock.id,
      sku: 'BOY-001',
      companyId,
      locationId: loc1,
      type: 'IN',
      qty: 30,
      unitCost: 280.00,
      totalCost: 8400.00,
      extras: [{ type: 'AMBALAJ', amount: 100.00 }],
      createdAt: admin.firestore.Timestamp.fromMillis(now.toMillis() - 2 * 24 * 60 * 60 * 1000), // 2 gün önce
      createdBy: 'system'
    }
  );
  
  // 2. Maliyet Altı Satış için: OUT hareketleri (satış fiyatı < avgCost)
  movements.push(
    // CIM-001: 10 kg çıkış, 40 TL/kg (avgCost: 45.50, maliyet altı)
    {
      stockId: cimStock.id,
      sku: 'CIM-001',
      companyId,
      locationId: loc1,
      type: 'OUT',
      qty: 10,
      unitCost: 40.00, // avgCost'tan düşük
      totalCost: 400.00,
      createdAt: admin.firestore.Timestamp.fromMillis(now.toMillis() - 1 * 24 * 60 * 60 * 1000), // 1 gün önce
      createdBy: 'system'
    },
    // DEM-001: 0.5 ton çıkış, 12000 TL/ton (avgCost: 12500, maliyet altı)
    {
      stockId: demStock.id,
      sku: 'DEM-001',
      companyId,
      locationId: loc1,
      type: 'OUT',
      qty: 0.5,
      unitCost: 12000.00, // avgCost'tan düşük
      totalCost: 6000.00,
      createdAt: admin.firestore.Timestamp.fromMillis(now.toMillis() - 2 * 24 * 60 * 60 * 1000), // 2 gün önce
      createdBy: 'system'
    },
    // KUM-001: 5 ton çıkış, 320 TL/ton (avgCost: 350, maliyet altı)
    {
      stockId: kumStock.id,
      sku: 'KUM-001',
      companyId,
      locationId: loc2,
      type: 'OUT',
      qty: 5,
      unitCost: 320.00, // avgCost'tan düşük
      totalCost: 1600.00,
      createdAt: admin.firestore.Timestamp.fromMillis(now.toMillis() - 4 * 24 * 60 * 60 * 1000), // 4 gün önce
      createdBy: 'system'
    }
  );
  
  // 3. Lokasyon Stok için: Farklı lokasyonlarda stok
  movements.push(
    // TUĞ-001: Şantiye A'da 500 adet
    {
      stockId: tugStock.id,
      sku: 'TUĞ-001',
      companyId,
      locationId: loc2,
      type: 'IN',
      qty: 500,
      unitCost: 2.50,
      totalCost: 1250.00,
      extras: [],
      createdAt: admin.firestore.Timestamp.fromMillis(now.toMillis() - 6 * 24 * 60 * 60 * 1000),
      createdBy: 'system'
    },
    // BET-001: Şantiye B'de 8 m3
    {
      stockId: betStock.id,
      sku: 'BET-001',
      companyId,
      locationId: locationIds[2], // Şantiye B
      type: 'IN',
      qty: 8,
      unitCost: 450.00,
      totalCost: 3600.00,
      extras: [{ type: 'NAKLİYE', amount: 200.00 }],
      createdAt: admin.firestore.Timestamp.fromMillis(now.toMillis() - 4 * 24 * 60 * 60 * 1000),
      createdBy: 'system'
    }
  );
  
  // 4. Gerçek Maliyet için: Extras içeren IN hareketleri
  // (Yukarıdaki IN hareketlerinde zaten extras var)
  
  // Hareketleri Firestore'a ekle
  for (const mv of movements) {
    const docRef = await db.collection('stock_movements').add(mv);
    logger.info('Hareket oluşturuldu', { id: docRef.id, type: mv.type, sku: mv.sku, qty: mv.qty });
  }
  
  logger.end();
  return movements.length;
}

async function main() {
  try {
    logger.group('Test Verileri Oluşturuluyor');
    
    const email = 'teklifbultedarikci1@gmail.com';
    const { uid, companyId } = await getUserCompanyId(email);
    
    logger.info('Test verileri oluşturuluyor', { email, companyId });
    
    // 1. Lokasyonlar oluştur
    const locationIds = await createTestLocations(companyId);
    
    // 2. Stok kartları oluştur
    const stockIds = await createTestStocks(companyId);
    
    // 3. Stok hareketleri oluştur
    const movementCount = await createTestMovements(companyId, stockIds, locationIds);
    
    logger.group('Özet');
    logger.info('✅ Lokasyonlar oluşturuldu', { count: locationIds.length });
    logger.info('✅ Stok kartları oluşturuldu', { count: stockIds.length });
    logger.info('✅ Stok hareketleri oluşturuldu', { count: movementCount });
    logger.info('\n✨ Test verileri başarıyla oluşturuldu!');
    logger.info('📊 Raporları görüntülemek için: http://localhost:5173/pages/reports.html');
    logger.end();
    
  } catch (error) {
    logger.error('Test verileri oluşturulamadı', error);
    process.exit(1);
  }
}

main();

