/**
 * Firebase Cloud Function: Validate Company Code
 * 
 * This function validates a company code and returns company information.
 * It includes rate limiting and abuse protection.
 * 
 * Deploy Instructions:
 *   1. Place this file in: functions/src/index.ts (or functions/index.js)
 *   2. Install dependencies: cd functions && npm install
 *   3. Deploy: firebase deploy --only functions:validateCompanyCode
 * 
 * Usage (from frontend):
 *   import { getFunctions, httpsCallable } from 'firebase/functions';
 *   const functions = getFunctions();
 *   const validateCode = httpsCallable(functions, 'validateCompanyCode');
 *   const result = await validateCode({ companyCode: 'UL67HQYH' });
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Rate limiting: Track requests per IP
 * In production, use Redis or Firestore for distributed rate limiting
 */
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 requests per minute per IP

function checkRateLimit(context) {
  const ip = context.rawRequest.ip || context.rawRequest.connection.remoteAddress;
  const now = Date.now();
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  const limit = rateLimitMap.get(ip);
  
  if (now > limit.resetTime) {
    // Reset window
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (limit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false; // Rate limit exceeded
  }
  
  limit.count++;
  return true;
}

/**
 * Validate Company Code Cloud Function
 * 
 * @param {Object} data - Request data
 * @param {string} data.companyCode - Company code to validate
 * @param {Object} context - Function context
 * @returns {Promise<Object>} Validation result
 */
exports.validateCompanyCode = functions.https.onCall(async (data, context) => {
  // Authentication check (optional - can be public for signup)
  // Uncomment if you want to require authentication:
  // if (!context.auth) {
  //   throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  // }
  
  // Rate limiting
  if (!checkRateLimit(context)) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Too many requests. Please try again later.'
    );
  }
  
  // Input validation
  const { companyCode } = data;
  
  if (!companyCode || typeof companyCode !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Company code is required and must be a string'
    );
  }
  
  // Normalize company code (uppercase, trim)
  const codeUpper = companyCode.toUpperCase().trim();
  
  // Basic validation: company code format
  // Adjust regex based on your company code format
  if (!/^[A-Z0-9]{6,12}$/.test(codeUpper)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid company code format'
    );
  }
  
  try {
    // Query Firestore for company with matching code
    const companiesRef = db.collection('companies');
    const querySnapshot = await companiesRef
      .where('code', '==', codeUpper)
      .limit(1)
      .get();
    
    if (querySnapshot.empty) {
      // Company not found - return invalid but don't reveal too much
      return {
        valid: false,
        error: 'Geçersiz şirket kodu. Lütfen doğru şirket kodunu girin.',
        // Don't return companyId or other sensitive info
      };
    }
    
    // Company found
    const companyDoc = querySnapshot.docs[0];
    const companyData = companyDoc.data();
    const companyId = companyDoc.id;
    
    // Check if company is active (optional)
    if (companyData.status === 'inactive' || companyData.deleted === true) {
      return {
        valid: false,
        error: 'Bu şirket kodu aktif değil.',
      };
    }
    
    // Return company information
    const result = {
      valid: true,
      companyId: companyId,
      companyName: companyData.name || '',
      companyCode: codeUpper,
      // Optional: Return company settings
      autoApproveJoinRequests: companyData.autoApproveJoinRequests === true,
      // Don't return sensitive company data
    };
    
    // Log validation (for audit)
    console.log('Company code validated:', {
      companyCode: codeUpper,
      companyId: companyId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return result;
    
  } catch (error) {
    console.error('Error validating company code:', error);
    
    // Don't expose internal errors to client
    throw new functions.https.HttpsError(
      'internal',
      'Şirket kodu doğrulanırken bir hata oluştu. Lütfen tekrar deneyin.'
    );
  }
});

/**
 * Alternative: If you don't use Cloud Functions, use this Node.js script
 * File: validateCompanyCodeAdmin.js
 * 
 * Usage:
 *   const admin = require('firebase-admin');
 *   const { validateCompanyCode } = require('./validateCompanyCodeAdmin');
 *   const result = await validateCompanyCode('UL67HQYH');
 */

async function validateCompanyCodeAdmin(companyCode) {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  
  const db = admin.firestore();
  const codeUpper = companyCode.toUpperCase().trim();
  
  try {
    const companiesRef = db.collection('companies');
    const querySnapshot = await companiesRef
      .where('code', '==', codeUpper)
      .limit(1)
      .get();
    
    if (querySnapshot.empty) {
      return {
        valid: false,
        error: 'Geçersiz şirket kodu'
      };
    }
    
    const companyDoc = querySnapshot.docs[0];
    const companyData = companyDoc.data();
    
    return {
      valid: true,
      companyId: companyDoc.id,
      companyName: companyData.name || '',
      autoApproveJoinRequests: companyData.autoApproveJoinRequests === true
    };
  } catch (error) {
    console.error('Validation error:', error);
    return {
      valid: false,
      error: error.message
    };
  }
}

// Export for use in Node.js scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports.validateCompanyCodeAdmin = validateCompanyCodeAdmin;
}

