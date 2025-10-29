// firebase.js (FINAL)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAbX3UWRPpw-yo4I4HbSdTg82LxvM-fqTE",
  authDomain: "teklifbul.firebaseapp.com",
  projectId: "teklifbul",
  storageBucket: "teklifbul.firebasestorage.app",
  appId: "1:636669818119:web:9085962e660831c36941a2"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// Enable Firestore logging for debugging
// Uncomment the following line to enable detailed Firestore logging
// import { enableLogging } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
// enableLogging(true);

// Kalıcı oturum - with error handling
try {
  await setPersistence(auth, browserLocalPersistence);
  console.log("✅ Firebase persistence set to browserLocalPersistence");
} catch (e) {
  console.warn("⚠️ Firebase persistence error (using default):", e.message);
  console.warn("⚠️ Error details:", { code: e.code, name: e.name, stack: e.stack });
  // Continue without persistence - auth will still work with session storage
}

// ---- Auth yardımcıları ----
let _readyOnce;
export function authReady() {
  if (_readyOnce) return _readyOnce;
  _readyOnce = new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, () => { unsub(); resolve(auth.currentUser || null); });
  });
  return _readyOnce;
}

export async function requireAuth() {
  const user = await authReady();
  if (!user) { location.href = "./index.html"; throw new Error("AUTH_REQUIRED"); }
  return user;
}

export function getUser() { return auth.currentUser; }

// E-posta/şifre
export async function register(email, password) { return createUserWithEmailAndPassword(auth, email, password); }
export async function login(email, password)    { return signInWithEmailAndPassword(auth, email, password); }
export function logout()                        { return signOut(auth); }
export function watchAuth(cb)                   { return onAuthStateChanged(auth, cb); }

// Google
const googleProvider = new GoogleAuthProvider();
export async function loginWithGoogle() { const r = await signInWithPopup(auth, googleProvider); return r.user; }

// Global exports for console testing
window.__db = db;
window.__auth = auth;
window.__fs = {
  collection: (path) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.collection(db, path)),
  doc: (path, id) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.doc(db, path, id)),
  query: (...args) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.query(...args)),
  where: (...args) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.where(...args)),
  orderBy: (...args) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.orderBy(...args)),
  getDocs: (...args) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.getDocs(...args)),
  getDoc: (...args) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.getDoc(...args)),
  addDoc: (...args) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.addDoc(...args)),
  updateDoc: (...args) => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.updateDoc(...args)),
  serverTimestamp: () => import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(m => m.serverTimestamp())
};

console.log("🔧 Global exports available: window.__db, window.__auth, window.__fs");