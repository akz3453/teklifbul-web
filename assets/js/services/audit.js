/**
 * Audit Logs Service Module
 * Handles audit log operations and queries
 */

import { db } from '../firebase.js';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  addDoc
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

/**
 * Get audit logs for a specific demand
 * @param {string} demandId - Demand ID
 * @param {number} limitCount - Maximum number of logs to return
 * @returns {Promise<Array>} Array of audit log objects
 */
export async function getDemandAuditLogs(demandId, limitCount = 50) {
  const q = query(
    collection(db, "auditLogs"),
    where("demandId", "==", demandId),
    orderBy("timestamp", "desc"),
    limit(limitCount)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get audit logs for a specific user
 * @param {string} userId - User ID
 * @param {number} limitCount - Maximum number of logs to return
 * @returns {Promise<Array>} Array of audit log objects
 */
export async function getUserAuditLogs(userId, limitCount = 50) {
  const q = query(
    collection(db, "auditLogs"),
    where("actorUid", "==", userId),
    orderBy("timestamp", "desc"),
    limit(limitCount)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get all audit logs
 * @param {number} limitCount - Maximum number of logs to return
 * @returns {Promise<Array>} Array of audit log objects
 */
export async function getAllAuditLogs(limitCount = 100) {
  const q = query(
    collection(db, "auditLogs"),
    orderBy("timestamp", "desc"),
    limit(limitCount)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get audit logs by field type
 * @param {string} field - Field name (isPublished, visibility, etc.)
 * @param {number} limitCount - Maximum number of logs to return
 * @returns {Promise<Array>} Array of audit log objects
 */
export async function getAuditLogsByField(field, limitCount = 50) {
  const q = query(
    collection(db, "auditLogs"),
    where("field", "==", field),
    orderBy("timestamp", "desc"),
    limit(limitCount)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Format audit log for display
 * @param {Object} log - Audit log object
 * @returns {Object} Formatted log object
 */
export function formatAuditLog(log) {
  const timestamp = log.timestamp?.toDate?.() || new Date(log.timestamp || 0);
  
  let action = '';
  let description = '';
  
  switch (log.field) {
    case 'isPublished':
      action = log.to ? 'Yayınlandı' : 'Yayından Kaldırıldı';
      description = `Talep ${log.to ? 'yayınlandı' : 'yayından kaldırıldı'}`;
      break;
    case 'visibility':
      const visibilityNames = {
        'public': 'Herkese Açık',
        'company': 'Şirket İçinde',
        'private': 'Özel'
      };
      action = 'Görünürlük Değiştirildi';
      description = `Görünürlük "${visibilityNames[log.from] || log.from}" → "${visibilityNames[log.to] || log.to}" olarak değiştirildi`;
      break;
    default:
      action = 'Değişiklik';
      description = `${log.field} alanı değiştirildi`;
  }
  
  return {
    ...log,
    formattedTimestamp: timestamp.toLocaleString('tr-TR'),
    action,
    description
  };
}

/**
 * Get audit log statistics
 * @param {string} demandId - Demand ID (optional)
 * @returns {Promise<Object>} Statistics object
 */
export async function getAuditStats(demandId = null) {
  try {
    let q;
    if (demandId) {
      q = query(
        collection(db, "auditLogs"),
        where("demandId", "==", demandId)
      );
    } else {
      q = query(collection(db, "auditLogs"));
    }
    
    const snap = await getDocs(q);
    const logs = snap.docs.map(doc => doc.data());
    
    const stats = {
      totalLogs: logs.length,
      publishCount: logs.filter(log => log.field === 'isPublished' && log.to === true).length,
      unpublishCount: logs.filter(log => log.field === 'isPublished' && log.to === false).length,
      visibilityChanges: logs.filter(log => log.field === 'visibility').length,
      uniqueActors: new Set(logs.map(log => log.actorUid)).size,
      uniqueDemands: new Set(logs.map(log => log.demandId)).size
    };
    
    return stats;
  } catch (error) {
    console.error('Error getting audit stats:', error);
    return {
      totalLogs: 0,
      publishCount: 0,
      unpublishCount: 0,
      visibilityChanges: 0,
      uniqueActors: 0,
      uniqueDemands: 0
    };
  }
}

/**
 * Create a manual audit log entry
 * @param {Object} logData - Audit log data
 * @returns {Promise<string>} Created log ID
 */
export async function createAuditLog(logData) {
  const docRef = await addDoc(collection(db, "auditLogs"), {
    ...logData,
    timestamp: new Date(),
    createdAt: new Date()
  });
  return docRef.id;
}
