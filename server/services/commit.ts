import { v4 as uuid } from 'uuid';
import admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: 'teklifbul'
    });
  } catch (err) {
    console.log('[Firebase Admin] Using fallback auth', err);
    // Fallback to in-memory DB if Firebase Admin fails
  }
}

let db: FirebaseFirestore.Firestore | null = null;
try {
  db = admin.apps.length ? admin.firestore() : null;
} catch (err) {
  console.log('[Firestore] Disabled, falling back to in-memory DB', err);
  db = null;
}
const DB:any = { demands: new Map<string, any>(), bySATFK: new Map<string,string>() };

function genSATFK(){
  const d = new Date(); const id = Math.floor(Math.random()*999).toString().padStart(3,'0');
  return `SATFK-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${id}`;
}

export async function commitDemand({ demand, items }:{ demand:any, items:any[] }){
  let satfk = (demand.satfk||'').toString().trim();
  if (satfk){
    // Check in DB or Firestore
    if (DB.bySATFK.has(satfk)) throw new Error('Bu SATFK daha önce kullanılmış');
    if (db) {
      try {
        const snapshot = await db.collection('demands').where('satfk', '==', satfk).limit(1).get();
        if (!snapshot.empty) throw new Error('Bu SATFK daha önce kullanılmış');
      } catch (err) {
        console.log('[Firestore] SATFK check failed, using mock DB', (err as any)?.message);
        db = null;
      }
    }
  } else {
    do { satfk = genSATFK(); } while (DB.bySATFK.has(satfk));
  }

  const demandId = uuid();
  const payload = {
    demandId, satfk,
    title: demand.title,
    currency: demand.currency || 'TRY',
    requester: demand.requester || null,
    demandDate: demand.demandDate || null,
    dueDate: demand.dueDate || null,
    visibility: demand.visibility || 'public',
    createdAt: new Date().toISOString(),
    items: items.map((x,i)=>({ row:i+1, ...x })),
    status: 'opened'
  };

  // Save to Firestore (if available) or fallback to in-memory DB
  if (db) {
    try {
      await db.collection('demands').doc(demandId).set(payload);
      console.log(`[Firestore] Saved demand ${demandId} (${satfk})`);
    } catch (err) {
      console.log('[Firestore] write failed, using mock DB', (err as any)?.message);
      db = null;
      DB.demands.set(demandId, payload);
      DB.bySATFK.set(satfk, demandId);
      console.log(`[Mock DB] Saved demand ${demandId} (${satfk})`);
    }
  } else {
    DB.demands.set(demandId, payload);
    DB.bySATFK.set(satfk, demandId);
    console.log(`[Mock DB] Saved demand ${demandId} (${satfk})`);
  }
  
  return { demandId, satfk };
}

export const __DB = DB;


