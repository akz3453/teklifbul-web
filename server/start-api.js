// Teklifbul Rule v1.0 - Cross-platform API starter
// This script handles directory change and starts the API server

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES modules için __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Change to server directory
process.chdir(path.join(__dirname));

// Teklifbul Rule v1.0 - Graceful shutdown ve error handling
let tsx = null;
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n🛑 API server kapatılıyor (${signal})...`);
  
  if (tsx && !tsx.killed) {
    // Windows'ta SIGTERM yerine daha güvenli yöntem
    if (process.platform === 'win32') {
      tsx.kill('SIGTERM');
      // Windows'ta SIGTERM çalışmazsa force kill
      setTimeout(() => {
        if (tsx && !tsx.killed) {
          tsx.kill('SIGKILL');
        }
        process.exit(0);
      }, 5000);
    } else {
      tsx.kill(signal);
      setTimeout(() => {
        if (tsx && !tsx.killed) {
          tsx.kill('SIGKILL');
        }
        process.exit(0);
      }, 5000);
    }
  } else {
    process.exit(0);
  }
}

// Start tsx with index.ts
try {
  tsx = spawn('npx', ['tsx', 'index.ts'], {
    stdio: 'inherit',
    shell: true,
    cwd: __dirname,
    // Windows'ta process group oluştur
    detached: false
  });

  tsx.on('error', (error) => {
    console.error('❌ API server başlatılamadı:', error.message);
    // Teklifbul Rule v1.0 - Error durumunda graceful exit
    if (!isShuttingDown) {
      process.exit(1);
    }
  });

  tsx.on('exit', (code, signal) => {
    if (isShuttingDown) {
      process.exit(0);
      return;
    }
    
    // Teklifbul Rule v1.0 - Beklenmedik crash durumunda log
    if (code !== 0 && code !== null) {
      console.error(`⚠️  API server beklenmedik şekilde sonlandı (code: ${code}, signal: ${signal})`);
    }
    
    // Windows'ta exit code 4294967295 genellikle process kill edildiğinde oluşur
    // Bu durumda normal exit yap
    if (code === 4294967295 || code === -1) {
      console.log('ℹ️  API server kapatıldı');
      process.exit(0);
    } else {
      process.exit(code || 0);
    }
  });

  // Handle process termination signals
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  
  // Windows'ta process exit event'i
  process.on('exit', (code) => {
    if (tsx && !tsx.killed) {
      try {
        tsx.kill('SIGTERM');
      } catch (e) {
        // Ignore errors during shutdown
      }
    }
  });

  // Uncaught exception handling
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
    gracefulShutdown('SIGTERM');
  });

  // Unhandled promise rejection
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled rejection:', reason);
    gracefulShutdown('SIGTERM');
  });

} catch (error) {
  console.error('❌ API server başlatma hatası:', error);
  process.exit(1);
}
