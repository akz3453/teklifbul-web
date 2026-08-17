"use strict";
/**
 * Frontend Admin Helper Functions
 * Teklifbul Rule v1.0 - Admin kimlik tespiti: Merkezi helper fonksiyonlar
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdmin = isAdmin;
exports.isCurrentUserAdmin = isCurrentUserAdmin;
exports.hasFeatureAccess = hasFeatureAccess;
const firebase_js_1 = require("/firebase.js");
const logger_js_1 = require("../log/logger.js");
/**
 * Kullanıcının admin olup olmadığını kontrol eder
 * @param user Firebase user object veya null
 * @returns Promise<boolean>
 */
async function isAdmin(user) {
    if (!user) {
        return false;
    }
    try {
        // Custom claims'den admin kontrolü
        const tokenResult = await user.getIdTokenResult();
        const claims = tokenResult.claims || {};
        let isAdmin = claims.admin === true || claims.role === 'admin';
        let isOps = claims.ops === true || claims.role === 'ops';
        if (isAdmin || isOps) {
            return true;
        }
        // Eğer custom claims'de admin yoksa Firestore'dan kontrol et
        const { db } = await Promise.resolve().then(() => __importStar(require('/firebase.js')));
        const { getDoc, doc } = await Promise.resolve().then(() => __importStar(require('https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js')));
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            isAdmin = userData?.isAdmin === true || userData?.role === 'admin';
            isOps = userData?.isOps === true || userData?.role === 'ops';
            return isAdmin || isOps;
        }
        return false;
    }
    catch (error) {
        logger_js_1.logger.warn('Admin check failed', error);
        return false;
    }
}
/**
 * Mevcut kullanıcının admin olup olmadığını kontrol eder
 * @returns Promise<boolean>
 */
async function isCurrentUserAdmin() {
    const user = firebase_js_1.auth.currentUser;
    if (!user) {
        return false;
    }
    return await isAdmin(user);
}
/**
 * Premium özellik kontrolü - Admin kullanıcılar için her zaman true
 * @param planId Kullanıcının plan ID'si
 * @param requiredPlan Gerekli plan ('premium' veya 'premium_plus')
 * @returns Promise<boolean>
 */
async function hasFeatureAccess(planId, requiredPlan = 'premium') {
    const userIsAdmin = await isCurrentUserAdmin();
    // Admin kullanıcılar her zaman erişim sağlar
    if (userIsAdmin) {
        return true;
    }
    // Normal kullanıcılar için plan kontrolü
    if (requiredPlan === 'premium') {
        return planId === 'premium' || planId === 'premium_monthly' || planId === 'premium_yearly' ||
            planId === 'premium_plus' || planId === 'premium_plus_monthly' || planId === 'premium_plus_yearly';
    }
    else if (requiredPlan === 'premium_plus') {
        return planId === 'premium_plus' || planId === 'premium_plus_monthly' || planId === 'premium_plus_yearly';
    }
    return false;
}
