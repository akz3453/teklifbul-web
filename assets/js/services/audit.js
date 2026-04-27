/**
 * Audit Logs Service Module
 * Handles audit log operations and queries
 */

import { db } from '../firebase.js';
// Teklifbul Rule v1.0 - Structured Logging
import { logger } from '../../../src/shared/log/logger.js';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
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
    logger.error('Error getting audit stats', error);
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
 * Create a manual audit log entry (Enterprise+ SaaS Edition)
 * @param {Object} logData - Audit log data
 * @returns {Promise<string>} Created log ID
 */
export async function createAuditLog(logData) {
  // Enforce required fields for Enterprise+ Audit Standard
  const VALID_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'CANCEL', 'LOGIN', 'LOGOUT'];
  
  const actionType = logData.action_type || logData.actionType || 'UPDATE';
  if (!VALID_ACTIONS.includes(actionType)) {
    logger.warn(`Invalid action_type provided to createAuditLog: ${actionType}. Defaulting to UPDATE.`);
  }

  // Get User Agent info
  const userAgent = navigator?.userAgent || 'Unknown Device';
  // Get IP address (Note: In pure frontend, IP is hard to get reliably without an API. Using placeholder until backend proxy is used)
  const clientIp = window.localStorage?.getItem('lastClientIp') || '0.0.0.0';

  // Make sure companyId exists (Multi-tenant isolation)
  if (!logData.companyId) {
    logger.error('CRITICAL: Audit log attempted without companyId', logData);
    // In strict env, this could throw an error. For now, we proceed but log heavily.
  }

  const enrichedLog = {
    ...logData,
    action_type: VALID_ACTIONS.includes(actionType) ? actionType : 'UPDATE',
    userAgent: userAgent,
    ipAddress: logData.ipAddress || clientIp,
    timestamp: new Date(),
    createdAt: new Date(), // Enforce standard field
    status: logData.status || 'draft' // Enforce standard field for schemas
  };

  try {
    // Write to companyAuditLogs (the enterprise table) as well as legacy auditLogs
    const docRef = await addDoc(collection(db, "companyAuditLogs"), enrichedLog);
    // Keep backwards compatibility for old dashboard views
    await addDoc(collection(db, "auditLogs"), enrichedLog);
    return docRef.id;
  } catch (error) {
    logger.error('Failed to write Enterprise Audit Log (companyAuditLogs is Append-Only)', error);
    throw error;
  }
}
