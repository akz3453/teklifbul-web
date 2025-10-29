/**
 * Jest Test Setup
 * Configures Firebase Emulator and test environment
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

// Mock Firebase configuration for testing
const firebaseConfig = {
  apiKey: "test-api-key",
  authDomain: "test-project.firebaseapp.com",
  projectId: "test-project",
  storageBucket: "test-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "test-app-id"
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Get services
const auth = getAuth(app);
const db = getFirestore(app);

// Connect to emulators (only if not already connected)
if (!global.firebaseEmulatorsConnected) {
  try {
    connectAuthEmulator(auth, "http://localhost:9099");
    connectFirestoreEmulator(db, "localhost", 8080);
    global.firebaseEmulatorsConnected = true;
  } catch (error) {
    console.warn('Firebase emulators already connected or not available:', error.message);
  }
}

// Make services available globally for tests
global.firebaseApp = app;
global.firebaseAuth = auth;
global.firebaseDb = db;

// Mock console methods to reduce noise in tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args) => {
  // Only show errors that are not from Firebase emulator
  if (!args[0]?.includes?.('Firebase')) {
    originalConsoleError(...args);
  }
};

console.warn = (...args) => {
  // Only show warnings that are not from Firebase emulator
  if (!args[0]?.includes?.('Firebase')) {
    originalConsoleWarn(...args);
  }
};

// Clean up after each test
afterEach(async () => {
  // Clear Firestore data
  if (global.firebaseDb) {
    try {
      // This would require admin SDK in a real implementation
      // For now, we'll just log that cleanup would happen
      console.log('Test cleanup: Firestore data would be cleared');
    } catch (error) {
      console.warn('Test cleanup error:', error.message);
    }
  }
});
