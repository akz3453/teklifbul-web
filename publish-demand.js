// publishDemandAndMatchSuppliers.js
import { db } from './firebase.js';
import { collection, query, where, getDocs, addDoc, serverTimestamp } 
  from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

/**
 * Publish a demand and match it with relevant suppliers
 * @param {Object} demand - The demand object to publish
 * @returns {Promise<void>}
 */
export async function publishDemandAndMatchSuppliers(demand) {
  const cat = demand.categories?.[0];
  if (!cat) throw new Error('Demand has no categories');
  
  const qs = query(
    collection(db, 'users'),
    where('isSupplier','==',true),
    where('isActive','==',true),
    where('categories','array-contains', cat)
  );
  const res = await getDocs(qs);
  const tasks = [];
  res.forEach(u=>{
    tasks.push(addDoc(collection(db,'demandRecipients'), {
      demandId: demand.id,
      buyerId: demand.createdBy,
      supplierId: u.id,
      matchedAt: serverTimestamp(),
      status: 'pending'
    }));
  });
  await Promise.all(tasks);
}

/**
 * Backfill function to convert object array categories to string slug array
 * This should be run once to migrate existing data
 */
export async function backfillSupplierCategories() {
  const q = query(
    collection(db, 'users'),
    where('isSupplier', '==', true),
    where('categories', '!=', null)
  );
  
  const snap = await getDocs(q);
  const batchUpdates = [];
  
  snap.forEach(docSnap => {
    const data = docSnap.data();
    if (Array.isArray(data.categories) && data.categories.length > 0) {
      // Check if categories are objects or strings
      const firstItem = data.categories[0];
      if (typeof firstItem === 'object' && firstItem !== null) {
        // Convert object array to string slug array
        const slugArray = data.categories.map(cat => cat.slug || cat.id || '');
        batchUpdates.push({
          id: docSnap.id,
          categories: slugArray
        });
      }
    }
  });
  
  // Apply updates (in batches of 500 for Firestore limits)
  for (let i = 0; i < batchUpdates.length; i += 500) {
    const batch = batchUpdates.slice(i, i + 500);
    // In a real implementation, you would use Firestore batch writes here
    console.log(`Would update ${batch.length} supplier documents`);
  }
  
  return batchUpdates.length;
}