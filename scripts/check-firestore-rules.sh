#!/bin/bash
# Firestore Rules Deploy Kontrolü
# Teklifbul Rule v1.0

echo "🔍 Firestore Rules Kontrolü..."

# Rules dosyası var mı?
if [ ! -f "firestore.rules" ]; then
  echo "❌ firestore.rules dosyası bulunamadı!"
  exit 1
fi

echo "✅ firestore.rules dosyası mevcut"

# Deploy komutu
echo "📤 Rules deploy ediliyor..."
npm run deploy:rules

if [ $? -eq 0 ]; then
  echo "✅ Firestore rules başarıyla deploy edildi"
  exit 0
else
  echo "⚠️  Deploy hatası - Firebase authentication gerekebilir"
  exit 1
fi

