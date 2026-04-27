/**
 * PWA Icon Generator Script
 * Teklifbul Rule v1.0 - PWA icon setleri oluşturur
 * 
 * Kullanım: node scripts/generate-pwa-icons.js
 * 
 * Not: Bu script SVG'yi PNG'ye dönüştürmek için sharp kütüphanesi kullanır.
 * Eğer sharp yoksa: npm install --save-dev sharp
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Icon boyutları
const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];

// SVG template (favicon.svg'den alınan)
const svgTemplate = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="{size}" height="{size}">
  <rect width="32" height="32" fill="#2563EB" rx="6"/>
  <text x="16" y="22" font-family="Arial" font-size="18" font-weight="bold" text-anchor="middle" fill="white">T</text>
</svg>`;

async function generateIcons() {
  try {
    // Sharp kütüphanesini kontrol et
    let sharp;
    try {
      sharp = (await import('sharp')).default;
    } catch (err) {
      console.error('❌ sharp kütüphanesi bulunamadı!');
      console.log('📦 Yüklemek için: npm install --save-dev sharp');
      console.log('\n📝 Alternatif: Manuel olarak icon oluşturmak için:');
      console.log('   1. https://realfavicongenerator.net/ veya https://www.pwabuilder.com/imageGenerator adresine gidin');
      console.log('   2. favicon.svg dosyasını yükleyin');
      console.log('   3. Tüm boyutları indirin ve public/icons/ klasörüne koyun');
      process.exit(1);
    }

    const iconsDir = path.join(__dirname, '..', 'public', 'icons');
    
    // Icons klasörünü oluştur
    if (!fs.existsSync(iconsDir)) {
      fs.mkdirSync(iconsDir, { recursive: true });
    }

    console.log('🎨 PWA icon setleri oluşturuluyor...\n');

    // Her boyut için icon oluştur
    for (const size of iconSizes) {
      // SVG'yi scale et
      const scaledSvg = svgTemplate.replace(/{size}/g, size.toString());
      
      // PNG'ye dönüştür
      const pngBuffer = await sharp(Buffer.from(scaledSvg))
        .resize(size, size)
        .png()
        .toBuffer();

      // Dosyaya kaydet
      const filename = `icon-${size}x${size}.png`;
      const filepath = path.join(iconsDir, filename);
      fs.writeFileSync(filepath, pngBuffer);

      console.log(`✅ ${filename} oluşturuldu`);
    }

    console.log('\n✨ Tüm icon setleri başarıyla oluşturuldu!');
    console.log(`📁 Konum: ${iconsDir}`);
  } catch (error) {
    console.error('❌ Icon oluşturma hatası:', error);
    process.exit(1);
  }
}

generateIcons();

