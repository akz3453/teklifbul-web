/**
 * Teklifbul Rule v1.0 — Dosya indirme (web + Capacitor native)
 * Android WebView'da <a download> + blob URL guvenilir degil; Filesystem + Share kullanilir.
 */
import { logger } from '../../../src/shared/log/logger.js';
import { MESSAGES } from '../../../src/shared/constants/messages.js';
import { NATIVE_DOWNLOAD_MAX_BYTES } from '../../../src/shared/constants/timing.js';

function isNativePlatform() {
  try {
    return typeof window !== 'undefined'
      && window.Capacitor
      && typeof window.Capacitor.isNativePlatform === 'function'
      && window.Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function isShareCancelled(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.code || '').toLowerCase();
  return err?.name === 'AbortError'
    || msg.includes('cancel')
    || msg.includes('dismiss')
    || code.includes('cancel');
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const dataUrl = String(reader.result || '');
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        if (!base64) throw new Error(MESSAGES.ERROR_DOWNLOAD);
        resolve(base64);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error || new Error(MESSAGES.ERROR_DOWNLOAD));
    reader.readAsDataURL(blob);
  });
}

/**
 * Blob'u cihaza indirir / paylasim sayfasini acar
 * @param {Blob} blob
 * @param {string} filename
 * @returns {Promise<{ mode: 'web'|'native', uri?: string, cancelled?: boolean }>}
 */
export async function downloadBlobFile(blob, filename) {
  if (!blob) throw new Error(MESSAGES.ERROR_DOWNLOAD);
  const safeName = String(filename || `dosya-${Date.now()}.bin`).replace(/[\\/:*?"<>|]/g, '_');

  if (!isNativePlatform()) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    return { mode: 'web' };
  }

  if (blob.size > NATIVE_DOWNLOAD_MAX_BYTES) {
    throw new Error(MESSAGES.ERROR_NATIVE_FILE_TOO_LARGE);
  }

  logger.group('Native dosya indirme');
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const base64 = await blobToBase64(blob);
    const path = `downloads/${safeName}`;

    await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });

    const { uri } = await Filesystem.getUri({
      path,
      directory: Directory.Cache,
    });

    try {
      await Share.share({
        title: safeName,
        text: safeName,
        url: uri,
        dialogTitle: 'Dosyayi kaydet / paylas',
      });
    } catch (shareErr) {
      if (isShareCancelled(shareErr)) {
        logger.info('Native paylasim iptal', { path });
        return { mode: 'native', uri, cancelled: true };
      }
      throw shareErr;
    }

    logger.info('Native dosya paylasildi', { path, uri });
    return { mode: 'native', uri };
  } catch (err) {
    logger.error('Native dosya indirme hatasi', err);
    throw err;
  } finally {
    logger.end();
  }
}
