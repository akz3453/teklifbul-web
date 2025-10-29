/**
 * Firebase Initialization Module
 * Centralized Firebase configuration and initialization
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

// Firebase configuration
const firebaseConfig = {
  // Configuration will be loaded from firebase.js
  // This module provides the initialized instances
};

// Initialize Firebase
let app, auth, db;

try {
  // Try to get existing app instance
  app = initializeApp(firebaseConfig);
} catch (error) {
  // If app already exists, get the existing instance
  app = initializeApp(firebaseConfig, 'teklifbul-app');
}

// Initialize services
auth = getAuth(app);
db = getFirestore(app);

/**
 * Require authentication and return current user
 * @returns {Promise<Object>} Current user object
 */
export async function requireAuth() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      if (user) {
        resolve(user);
      } else {
        reject(new Error('User not authenticated'));
      }
    });
  });
}

/**
 * Get current user synchronously
 * @returns {Object|null} Current user or null
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Wait for auth state to be determined
 * @returns {Promise<Object|null>} Current user or null
 */
export function waitForAuth() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

// Export initialized services
export { app, auth, db };
