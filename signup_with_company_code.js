/**
 * Frontend Signup Flow with Company Code
 * Firebase JS SDK v9 Modular
 * 
 * This module handles user registration with a company code.
 * It ensures users are NOT immediately added to the company but instead
 * create a pending join request that requires admin approval.
 * 
 * Usage:
 *   import { signupWithCompanyCode } from './signup_with_company_code.js';
 *   await signupWithCompanyCode(email, password, displayName, companyCode, requestedRole);
 * 
 * Environment Setup:
 *   1. Create firebase-config.js with your Firebase config:
 *      export const firebaseConfig = {
 *        apiKey: "your-api-key",
 *        authDomain: "your-project.firebaseapp.com",
 *        projectId: "your-project-id",
 *        storageBucket: "your-project.appspot.com",
 *        messagingSenderId: "123456789",
 *        appId: "your-app-id"
 *      };
 * 
 *   2. Initialize Firebase in your main app:
 *      import { initializeApp } from 'firebase/app';
 *      import { getAuth } from 'firebase/auth';
 *      import { getFirestore } from 'firebase/firestore';
 *      import { firebaseConfig } from './firebase-config.js';
 * 
 *      const app = initializeApp(firebaseConfig);
 *      export const auth = getAuth(app);
 *      export const db = getFirestore(app);
 */

import { 
  createUserWithEmailAndPassword,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import {
  collection,
  doc,
  setDoc,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-functions.js';
import { auth, db } from './firebase-config.js';

/**
 * Validates company code via Cloud Function (recommended) or direct Firestore lookup
 * @param {string} companyCode - Company code to validate (e.g., "UL67HQYH")
 * @returns {Promise<{valid: boolean, companyId?: string, companyName?: string, autoApprove?: boolean, error?: string}>}
 */
async function validateCompanyCode(companyCode) {
  try {
    // Method 1: Use Cloud Function (recommended for security)
    // Uncomment if you have Cloud Functions deployed:
    /*
    const validateCode = httpsCallable(functions, 'validateCompanyCode');
    const result = await validateCode({ companyCode: companyCode.toUpperCase().trim() });
    return result.data;
    */
    
    // Method 2: Direct Firestore lookup (fallback if no Cloud Functions)
    const codeUpper = companyCode.toUpperCase().trim();
    const companiesQuery = query(
      collection(db, 'companies'),
      where('code', '==', codeUpper)
    );
    
    const snapshot = await getDocs(companiesQuery);
    
    if (snapshot.empty) {
      return {
        valid: false,
        error: 'Geçersiz şirket kodu. Lütfen doğru şirket kodunu girin.'
      };
    }
    
    const companyDoc = snapshot.docs[0];
    const companyData = companyDoc.data();
    
    return {
      valid: true,
      companyId: companyDoc.id,
      companyName: companyData.name || '',
      autoApprove: companyData.autoApproveJoinRequests === true
    };
  } catch (error) {
    console.error('Company code validation error:', error);
    return {
      valid: false,
      error: 'Şirket kodu doğrulanırken bir hata oluştu. Lütfen tekrar deneyin.'
    };
  }
}

/**
 * Signs up a new user with a company code
 * 
 * CRITICAL: This function does NOT set companyId in users/{uid}.
 * Instead, it creates a companyJoinRequest and sets companyJoinStatus='pending'.
 * 
 * @param {string} email - User email address
 * @param {string} password - User password
 * @param {string} displayName - User display name
 * @param {string} companyCode - Company code (e.g., "UL67HQYH")
 * @param {string} requestedRole - Requested role (e.g., "buyer:satinalma_yetkilisi")
 * @returns {Promise<{success: boolean, message: string, userId?: string, error?: string}>}
 */
export async function signupWithCompanyCode(email, password, displayName, companyCode, requestedRole) {
  try {
    // Step 1: Validate company code
    console.log('🔍 Validating company code...', companyCode);
    const validation = await validateCompanyCode(companyCode);
    
    if (!validation.valid) {
      return {
        success: false,
        message: validation.error || 'Geçersiz şirket kodu'
      };
    }
    
    const { companyId, companyName, autoApprove } = validation;
    
    // Defensive check: Even if autoApprove is true, we still create pending request
    // Admin must explicitly approve (security best practice)
    if (autoApprove) {
      console.warn('⚠️  Company has autoApprove enabled, but creating pending request for security');
    }
    
    // Step 2: Create user in Firebase Auth
    console.log('👤 Creating user in Firebase Auth...');
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Step 3: Update user profile with display name
    if (displayName) {
      await updateProfile(user, { displayName: displayName.trim() });
    }
    
    // Step 4: Determine role type (buyer/supplier)
    const roleType = requestedRole.includes('supplier') ? 'supplier' : 'buyer';
    
    // Step 5: Create user document in Firestore
    // CRITICAL: DO NOT set companyId here - only set companyJoinStatus='pending'
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, {
      displayName: displayName.trim(),
      email: email.trim(),
      companyCode: companyCode.toUpperCase().trim(), // Only store the code, not companyId
      companyJoinStatus: 'pending', // ✅ Set to pending
      requestedCompanyRole: requestedRole, // Store requested role
      requestedRoleType: roleType, // Store role type
      // ❌ companyId is NOT set here - will be set only after approval
      // ❌ companyRole is NOT set here
      // ❌ companyRoleType is NOT set here
      // ❌ companyRoleKey is NOT set here
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ User document created with pending status');
    
    // Step 6: Create companyJoinRequest document
    const requestRef = await addDoc(collection(db, 'companyJoinRequests'), {
      userId: user.uid,
      userEmail: email.trim(),
      companyCode: companyCode.toUpperCase().trim(),
      companyId: companyId, // ✅ Store in request, not in user document
      companyName: companyName || '',
      requestedRole: roleType, // buyer or supplier
      requestedCompanyRole: requestedRole, // Full role like "buyer:satinalma_yetkilisi"
      status: 'pending', // ✅ Always pending, requires admin approval
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    console.log('✅ Company join request created:', requestRef.id);
    
    // Step 7: Return success message
    return {
      success: true,
      message: 'Başvurunuz alındı — tam yetkili kullanıcı onayı bekleniyor.',
      userId: user.uid,
      requestId: requestRef.id
    };
    
  } catch (error) {
    console.error('❌ Signup error:', error);
    
    // Handle specific Firebase errors
    let errorMessage = 'Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.';
    
    if (error.code === 'auth/email-already-in-use') {
      errorMessage = 'Bu e-posta adresi zaten kullanılıyor.';
    } else if (error.code === 'auth/weak-password') {
      errorMessage = 'Şifre çok zayıf. Lütfen daha güçlü bir şifre seçin.';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Geçersiz e-posta adresi.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return {
      success: false,
      message: errorMessage,
      error: error.code || error.message
    };
  }
}

/**
 * Example UI integration (Vanilla JS)
 * 
 * HTML:
 *   <form id="signupForm">
 *     <input type="email" id="email" required>
 *     <input type="password" id="password" required>
 *     <input type="text" id="displayName" required>
 *     <input type="text" id="companyCode" required>
 *     <select id="requestedRole">
 *       <option value="buyer:satinalma_yetkilisi">Satın Alma Yetkilisi</option>
 *       <option value="buyer:satinalma_uzmani">Satın Alma Uzmanı</option>
 *       <option value="supplier:tedarikci">Tedarikçi</option>
 *     </select>
 *     <button type="submit">Kayıt Ol</button>
 *   </form>
 * 
 * JavaScript:
 *   document.getElementById('signupForm').addEventListener('submit', async (e) => {
 *     e.preventDefault();
 *     
 *     const email = document.getElementById('email').value;
 *     const password = document.getElementById('password').value;
 *     const displayName = document.getElementById('displayName').value;
 *     const companyCode = document.getElementById('companyCode').value;
 *     const requestedRole = document.getElementById('requestedRole').value;
 *     
 *     // Show loading state
 *     const submitBtn = e.target.querySelector('button[type="submit"]');
 *     submitBtn.disabled = true;
 *     submitBtn.textContent = 'Kayıt yapılıyor...';
 *     
 *     try {
 *       const result = await signupWithCompanyCode(email, password, displayName, companyCode, requestedRole);
 *       
 *       if (result.success) {
 *         // Show success message
 *         alert(result.message);
 *         // Redirect to waiting page
 *         window.location.href = './company-join-waiting.html';
 *       } else {
 *         // Show error message
 *         alert(result.message);
 *         submitBtn.disabled = false;
 *         submitBtn.textContent = 'Kayıt Ol';
 *       }
 *     } catch (error) {
 *       console.error('Signup error:', error);
 *       alert('Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.');
 *       submitBtn.disabled = false;
 *       submitBtn.textContent = 'Kayıt Ol';
 *     }
 *   });
 */

/**
 * React Example:
 * 
 * import { useState } from 'react';
 * import { signupWithCompanyCode } from './signup_with_company_code.js';
 * 
 * function SignupForm() {
 *   const [loading, setLoading] = useState(false);
 *   const [error, setError] = useState('');
 *   
 *   const handleSubmit = async (e) => {
 *     e.preventDefault();
 *     setLoading(true);
 *     setError('');
 *     
 *     const formData = new FormData(e.target);
 *     const result = await signupWithCompanyCode(
 *       formData.get('email'),
 *       formData.get('password'),
 *       formData.get('displayName'),
 *       formData.get('companyCode'),
 *       formData.get('requestedRole')
 *     );
 *     
 *     if (result.success) {
 *       // Redirect to waiting page
 *       window.location.href = './company-join-waiting.html';
 *     } else {
 *       setError(result.message);
 *       setLoading(false);
 *     }
 *   };
 *   
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       {error && <div className="error">{error}</div>}
 *       <input type="email" name="email" required />
 *       <input type="password" name="password" required />
 *       <input type="text" name="displayName" required />
 *       <input type="text" name="companyCode" required />
 *       <select name="requestedRole" required>
 *         <option value="buyer:satinalma_yetkilisi">Satın Alma Yetkilisi</option>
 *       </select>
 *       <button type="submit" disabled={loading}>
 *         {loading ? 'Kayıt yapılıyor...' : 'Kayıt Ol'}
 *       </button>
 *     </form>
 *   );
 * }
 */

