/**
 * System Health Monitoring Script
 * Teklifbul Rule v1.0 - Production Hardening
 * 
 * Health check endpoint'ini periyodik olarak kontrol eder
 * 
 * Node.js 18+ built-in fetch kullanır (node-fetch gerekmez)
 */

// Node.js 18+ built-in fetch kullan (global fetch)
// Eğer Node.js < 18 kullanıyorsanız: npm install node-fetch@2
import { logger } from '../src/shared/log/logger.js';

const HEALTH_CHECK_URL = process.env.HEALTH_CHECK_URL || 'http://localhost:5174/health';
const CHECK_INTERVAL = Number(process.env.HEALTH_CHECK_INTERVAL) || 60000; // 1 dakika
const MAX_FAILURES = Number(process.env.MAX_HEALTH_FAILURES) || 3; // 3 başarısız deneme sonrası alert

let failureCount = 0;
let lastStatus = 'unknown';

async function checkHealth() {
  try {
    const startTime = Date.now();
    // AbortController ile timeout (Node.js 18+)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 saniye timeout
    
    const response = await fetch(HEALTH_CHECK_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Teklifbul-HealthMonitor/1.0'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    const duration = Date.now() - startTime;
    const data = await response.json();

    if (response.ok && data.status === 'ok') {
      failureCount = 0; // Başarılı, reset
      lastStatus = 'ok';
      
      logger.info('✅ Health Check OK', {
        status: data.status,
        responseTime: `${duration}ms`,
        uptime: `${Math.round(data.uptime)}s`,
        memory: data.memory,
        database: data.database?.status,
        cache: data.cache?.status
      });
    } else {
      failureCount++;
      lastStatus = data.status || 'error';
      
      logger.warn('⚠️  Health Check Degraded', {
        status: data.status,
        responseTime: `${duration}ms`,
        failureCount,
        errors: {
          database: data.database?.error,
          cache: data.cache?.error
        }
      });

      if (failureCount >= MAX_FAILURES) {
        logger.error('❌ Health Check CRITICAL - Multiple failures detected', {
          failureCount,
          lastStatus,
          data
        });
        
        // Burada alert gönderilebilir (Slack webhook, email vb.)
        if (process.env.ALERT_WEBHOOK_URL) {
          try {
            await fetch(process.env.ALERT_WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: `🚨 Teklifbul Health Check CRITICAL\nStatus: ${lastStatus}\nFailures: ${failureCount}\nTime: ${new Date().toISOString()}`
              })
            });
          } catch (alertError) {
            logger.error('Alert webhook failed', alertError);
          }
        }
      }
    }
  } catch (error) {
    failureCount++;
    lastStatus = 'error';
    
    logger.error('❌ Health Check Failed', {
      error: error instanceof Error ? error.message : String(error),
      failureCount
    });

    if (failureCount >= MAX_FAILURES) {
      logger.error('❌ Health Check CRITICAL - Connection failed', {
        failureCount,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Alert gönder
      if (process.env.ALERT_WEBHOOK_URL) {
        try {
          await fetch(process.env.ALERT_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: `🚨 Teklifbul Health Check CRITICAL - Connection Failed\nError: ${error instanceof Error ? error.message : String(error)}\nFailures: ${failureCount}\nTime: ${new Date().toISOString()}`
            })
          });
        } catch (alertError) {
          logger.error('Alert webhook failed', alertError);
        }
      }
      
      process.exit(1); // Exit on critical failure
    }
  }
}

// İlk kontrol
checkHealth();

// Periyodik kontrol
setInterval(checkHealth, CHECK_INTERVAL);

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Health monitor shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Health monitor shutting down...');
  process.exit(0);
});

