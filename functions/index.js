const {onRequest} = require("firebase-functions/v2/https");
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const cors = require("cors")({origin: true});

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * TCMB Exchange Rates Proxy
 * 
 * Fetches current USD and EUR exchange rates from TCMB (Turkish Central Bank)
 * CORS-enabled endpoint that can be called from the frontend
 * 
 * Example response:
 * {
 *   "USD": "34.5678",
 *   "EUR": "37.1234",
 *   "asOf": "2025-10-18"
 * }
 */
exports.fx = onRequest(async (req, res) => {
  return cors(req, res, async () => {
    try {
      // Fetch XML from TCMB
      const response = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml");
      
      if (!response.ok) {
        throw new Error(`TCMB API returned ${response.status}`);
      }
      
      const xml = await response.text();
      
      // Parse USD ForexSelling value
      const usdMatch = xml.match(/<Currency[^>]*Kod="USD"[\s\S]*?<ForexSelling>(.*?)<\/ForexSelling>/i);
      const usd = usdMatch ? usdMatch[1] : null;
      
      // Parse EUR ForexSelling value
      const eurMatch = xml.match(/<Currency[^>]*Kod="EUR"[\s\S]*?<ForexSelling>(.*?)<\/ForexSelling>/i);
      const eur = eurMatch ? eurMatch[1] : null;
      
      // Parse date
      const dateMatch = xml.match(/<Tarih>(.*?)<\/Tarih>/i);
      const asOf = dateMatch ? dateMatch[1] : new Date().toISOString().split('T')[0];
      
      // Return formatted response
      res.json({
        USD: usd ? Number(usd).toFixed(4) : null,
        EUR: eur ? Number(eur).toFixed(4) : null,
        asOf: asOf
      });
      
    } catch (error) {
      console.error("FX fetch error:", error);
      res.status(500).json({
        error: "fx_fetch_failed",
        message: error.message || String(error)
      });
    }
  });
});

/**
 * REFACTORED: onDemandPublished
 * 
 * Triggers when a demand status changes to 'published'
 * Sends FCM topic notifications to suppliers matching the demand's categories
 * 
 * Topics format: cat_<slug> (e.g., cat_insaat-malzemeleri)
 */
exports.onDemandPublished = onDocumentWritten(
  {document: "demands/{demandId}"},
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() : null;
    const after = event.data?.after.exists ? event.data.after.data() : null;
    
    if (!after) {
      console.log("📄 Demand deleted, skipping notification");
      return;
    }
    
    // Check if demand was just published
    const beforeStatus = before?.status || "draft";
    const afterStatus = after.status || "draft";
    const justPublished = beforeStatus !== "published" && afterStatus === "published";
    
    if (!justPublished) {
      console.log(`📄 Demand status: ${beforeStatus} → ${afterStatus}, skipping notification`);
      return;
    }
    
    console.log("📢 Demand just published, sending notifications...", {
      demandId: event.params.demandId,
      title: after.title || "Talep",
      supplierCategoryKeys: after.supplierCategoryKeys || []
    });
    
    // Get supplier category keys from demand
    const supplierCategoryKeys = Array.isArray(after.supplierCategoryKeys)
      ? after.supplierCategoryKeys
      : [];
    
    if (supplierCategoryKeys.length === 0) {
      console.warn("⚠️ No supplierCategoryKeys found, skipping notifications");
      return;
    }
    
    // Create topics array (format: cat_<slug>)
    const topics = supplierCategoryKeys.map((key) => `cat_${key}`);
    
    console.log(`📢 Sending to ${topics.length} topic(s):`, topics);
    
    // Send notification to each topic
    const notificationPromises = topics.map((topic) => {
      const message = {
        topic: topic,
        notification: {
          title: "Yeni Talep Yayınlandı",
          body: after.title || "Kategori eşleşmesi olan yeni talep"
        },
        data: {
          demandId: event.params.demandId,
          type: "demand_published",
          title: after.title || "",
          status: "published"
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1
            }
          }
        },
        android: {
          priority: "high",
          notification: {
            sound: "default",
            channelId: "demands"
          }
        }
      };
      
      return admin.messaging().send(message)
        .then((response) => {
          console.log(`✅ Notification sent to topic ${topic}:`, response);
          return response;
        })
        .catch((error) => {
          console.error(`❌ Error sending notification to topic ${topic}:`, error);
          // Don't throw - continue with other topics
          return null;
        });
    });
    
    try {
      const results = await Promise.all(notificationPromises);
      const successCount = results.filter(r => r !== null).length;
      console.log(`✅ Notifications sent: ${successCount}/${topics.length} successful`);
    } catch (error) {
      console.error("❌ Error in notification batch:", error);
    }
  }
);

/**
 * Send Test Notification
 * HTTP endpoint to send test notification to a user
 * 
 * POST /sendTestNotification
 * Body: { userId: string, title?: string, body?: string }
 */
exports.sendTestNotification = onRequest(async (req, res) => {
  return cors(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const { userId, title, body } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'userId required' });
      }

      // Get user tokens from Firestore
      const tokensSnapshot = await admin.firestore()
        .collection('userTokens')
        .doc(userId)
        .collection('tokens')
        .get();

      if (tokensSnapshot.empty) {
        return res.status(404).json({ error: 'No tokens found for user' });
      }

      const tokens = tokensSnapshot.docs.map(doc => doc.id);

      // Send notification to all tokens
      const message = {
        notification: {
          title: title || 'Test Bildirimi',
          body: body || 'Bu bir test bildirimidir. FCM çalışıyor! 🎉'
        },
        data: {
          type: 'test',
          timestamp: new Date().toISOString()
        },
        tokens: tokens
      };

      const response = await admin.messaging().sendEachForMulticast(message);

      return res.json({
        success: true,
        sent: response.successCount,
        failed: response.failureCount,
        responses: response.responses
      });

    } catch (error) {
      console.error('Test notification error:', error);
      return res.status(500).json({
        error: 'send_failed',
        message: error.message || String(error)
      });
    }
  });
});

/**
 * Notification Templates
 * Reusable notification templates for different scenarios
 */
const notificationTemplates = {
  approval_needed: {
    title: 'Onay Bekleyen Teklif',
    body: (data) => `${data.request_title || 'Talep'} için onay gerekiyor`
  },
  new_bid: {
    title: 'Yeni Teklif',
    body: (data) => `Talebiniz "${data.request_title || 'Talep'}" için yeni teklif geldi`
  },
  bid_accepted: {
    title: 'Teklif Onaylandı',
    body: (data) => `${data.buyer_company || 'Alıcı'} teklifinizi onayladı`
  },
  bid_rejected: {
    title: 'Teklif Reddedildi',
    body: (data) => `${data.buyer_company || 'Alıcı'} teklifinizi reddetti`
  },
  demand_published: {
    title: 'Yeni Talep Yayınlandı',
    body: (data) => data.title || 'Kategori eşleşmesi olan yeni talep'
  },
  test: {
    title: 'Test Bildirimi',
    body: () => 'Bu bir test bildirimidir. FCM çalışıyor! 🎉'
  }
};

/**
 * Send Notification with Template
 * Helper function to send notifications using templates
 * 
 * @param {string} userId - User ID
 * @param {string} templateKey - Template key (e.g., 'approval_needed')
 * @param {Object} data - Template data
 * @param {Object} customData - Custom data for notification
 */
async function sendNotificationWithTemplate(userId, templateKey, data = {}, customData = {}) {
  try {
    const template = notificationTemplates[templateKey];
    if (!template) {
      throw new Error(`Template not found: ${templateKey}`);
    }

    // Get user tokens
    const tokensSnapshot = await admin.firestore()
      .collection('userTokens')
      .doc(userId)
      .collection('tokens')
      .get();

    if (tokensSnapshot.empty) {
      console.warn(`No tokens found for user: ${userId}`);
      return { success: false, reason: 'no_tokens' };
    }

    const tokens = tokensSnapshot.docs.map(doc => doc.id);

    // Build notification message
    const message = {
      notification: {
        title: typeof template.title === 'function' ? template.title(data) : template.title,
        body: typeof template.body === 'function' ? template.body(data) : template.body
      },
      data: {
        type: templateKey,
        ...customData,
        timestamp: new Date().toISOString()
      },
      tokens: tokens
    };

    // Send notification
    const response = await admin.messaging().sendEachForMulticast(message);

    return {
      success: true,
      sent: response.successCount,
      failed: response.failureCount,
      responses: response.responses
    };

  } catch (error) {
    console.error('Send notification error:', error);
    return { success: false, error: error.message };
  }
}

// Export helper function for use in other Cloud Functions
exports.sendNotificationWithTemplate = sendNotificationWithTemplate;

/**
 * On Notification Test Created
 * Triggers when a test notification is requested via Firestore
 */
exports.onNotificationTestCreated = onDocumentWritten(
  { document: 'notification_tests/{testId}' },
  async (event) => {
    const after = event.data?.after.exists ? event.data.after.data() : null;
    
    if (!after || after.status !== 'pending') {
      return;
    }

  const { token, title, body } = after;

    try {
      // Send notification to specific token
      const message = {
        token: token,
        notification: {
          title: title || 'Test Bildirimi',
          body: body || 'Bu bir test bildirimidir. FCM çalışıyor! 🎉'
        },
        data: {
          type: 'test',
          testId: event.params.testId,
          timestamp: new Date().toISOString()
        }
      };

      await admin.messaging().send(message);

      // Update test status
      await admin.firestore()
        .collection('notification_tests')
        .doc(event.params.testId)
        .update({
          status: 'sent',
          sentAt: admin.firestore.FieldValue.serverTimestamp()
        });

      console.log(`✅ Test notification sent: ${event.params.testId}`);

    } catch (error) {
      console.error(`❌ Test notification failed: ${event.params.testId}`, error);
      
      // Update test status
      await admin.firestore()
        .collection('notification_tests')
        .doc(event.params.testId)
        .update({
          status: 'failed',
          error: error.message,
          failedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
  }
);