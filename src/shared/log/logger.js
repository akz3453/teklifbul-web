// Teklifbul Rule v1.0 - Logger.js → Logger.ts Re-export
// Bu dosya geriye dönük uyumluluk için logger.ts'yi re-export eder
// Tüm yeni kod logger.ts'yi doğrudan import etmeli

// TypeScript dosyasını JavaScript olarak import et
// Vite ve modern build sistemleri .ts uzantısını otomatik çözümler
export { logger, initErrorTracking } from './logger.ts';

