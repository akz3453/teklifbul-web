/**
 * Initialize stock_locations and sample stock data
 * Run this once to set up the system
 */

import { db } from '/firebase.js';
import { normalizeTRLower, tokenizeForIndex } from '/scripts/lib/tr-utils.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

// Sample stock locations
const sampleLocations = [
  { name: 'Ankara Merkez Depo', type: 'DEPOT', addressSummary: 'Ankara', province: 'Ankara', district: 'Çankaya', neighborhood: 'Çukurambar' },
  { name: 'İstanbul Depo', type: 'DEPOT', addressSummary: 'İstanbul', province: 'İstanbul', district: 'Kartal', neighborhood: '' },
  { name: 'Rize Şantiye', type: 'SITE', addressSummary: 'Rize', province: 'Rize', district: 'Merkez', neighborhood: '' },
  { name: 'Trabzon Şantiye', type: 'SITE', addressSummary: 'Trabzon', province: 'Trabzon', district: 'Merkez', neighborhood: '' },
];

// Sample stocks
const sampleStocks = [
  { sku: 'CIMENTO-001', name: 'ÇIMENTO 32 KG', brand: 'Akçansa', model: '', unit: 'ADT', vatRate: 20, lastPurchasePrice: 45, avgCost: 0, salePrice: 55 },
  { sku: 'DEMIR-001', name: 'DEMIR 12 MM', brand: 'İçdaş', model: '', unit: 'KG', vatRate: 20, lastPurchasePrice: 8, avgCost: 0, salePrice: 10 },
  { sku: 'CIMENTO-002', name: 'ÇIMENTO 50 KG', brand: 'Akçansa', model: '', unit: 'ADT', vatRate: 20, lastPurchasePrice: 70, avgCost: 0, salePrice: 85 },
  { sku: 'KUM-001', name: 'YAPMA KUM', brand: '', model: '', unit: 'M3', vatRate: 20, lastPurchasePrice: 150, avgCost: 0, salePrice: 180 },
];

async function initData() {
  console.log('🔧 Initializing stock data...');
  
  // Add locations
  for (const loc of sampleLocations) {
    try {
      await addDoc(collection(db, 'stock_locations'), {
        ...loc,
        createdAt: serverTimestamp()
      });
      console.log(`✅ Location added: ${loc.name}`);
    } catch (error) {
      console.error(`❌ Error adding location ${loc.name}:`, error);
    }
  }
  
  // Add stocks with indexes
  for (const stock of sampleStocks) {
    try {
      const nameNorm = normalizeTRLower(stock.name);
      const searchKeywords = tokenizeForIndex(stock.name);
      
      await addDoc(collection(db, 'stocks'), {
        ...stock,
        customCodes: { code1: '', code2: '', code3: '' },
        name_norm: nameNorm,
        search_keywords: searchKeywords,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      console.log(`✅ Stock added: ${stock.sku}`);
    } catch (error) {
      console.error(`❌ Error adding stock ${stock.sku}:`, error);
    }
  }
  
  console.log('🎉 Initialization complete!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initData().catch(console.error);
}

export { initData };

