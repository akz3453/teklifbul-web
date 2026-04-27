// Tarayıcı konsolunda çalıştırılacak kod
// F12 > Console sekmesine yapıştırın ve Enter'a basın

(function getCoordinates() {
  // Özellikleri İncele butonunu bul
  const btn = document.querySelector('a[href="#features"].btn-outline');
  const teklifbulDiv = document.querySelector('.hero-text div[style*="display: inline-block"]');
  const heroText = document.querySelector('.hero-text');
  const heroContent = document.querySelector('.hero-content');
  const heroVisual = document.querySelector('.hero-visual');
  
  if (btn) {
    const btnRect = btn.getBoundingClientRect();
    console.log('📍 Özellikleri İncele Butonu Koordinatları:');
    console.log({
      top: btnRect.top,
      right: btnRect.right,
      bottom: btnRect.bottom,
      left: btnRect.left,
      width: btnRect.width,
      height: btnRect.height
    });
  }
  
  if (teklifbulDiv) {
    const teklifbulRect = teklifbulDiv.getBoundingClientRect();
    console.log('📍 Teklifbul Div Koordinatları:');
    console.log({
      top: teklifbulRect.top,
      right: teklifbulRect.right,
      bottom: teklifbulRect.bottom,
      left: teklifbulRect.left,
      width: teklifbulRect.width,
      height: teklifbulRect.height
    });
  }
  
  if (heroText) {
    const heroTextRect = heroText.getBoundingClientRect();
    console.log('📍 Hero Text Container Koordinatları:');
    console.log({
      top: heroTextRect.top,
      right: heroTextRect.right,
      bottom: heroTextRect.bottom,
      left: heroTextRect.left,
      width: heroTextRect.width,
      height: heroTextRect.height
    });
  }
  
  if (heroContent) {
    const heroContentRect = heroContent.getBoundingClientRect();
    console.log('📍 Hero Content (Grid) Koordinatları:');
    console.log({
      top: heroContentRect.top,
      right: heroContentRect.right,
      bottom: heroContentRect.bottom,
      left: heroContentRect.left,
      width: heroContentRect.width,
      height: heroContentRect.height
    });
  }
  
  if (heroVisual) {
    const heroVisualRect = heroVisual.getBoundingClientRect();
    console.log('📍 Hero Visual (Görsel Container) Koordinatları:');
    console.log({
      top: heroVisualRect.top,
      right: heroVisualRect.right,
      bottom: heroVisualRect.bottom,
      left: heroVisualRect.left,
      width: heroVisualRect.width,
      height: heroVisualRect.height
    });
  }
  
  // Görselin olması gereken konumu hesapla
  if (btn && teklifbulDiv && heroContent) {
    const btnRect = btn.getBoundingClientRect();
    const teklifbulRect = teklifbulDiv.getBoundingClientRect();
    const heroContentRect = heroContent.getBoundingClientRect();
    
    console.log('\n🎯 Görselin Olması Gereken Konum:');
    console.log({
      'Sol üst köşe (top)': teklifbulRect.top - heroContentRect.top,
      'Sol üst köşe (left)': btnRect.right - heroContentRect.left + 24, // gap
      'Yükseklik': btnRect.bottom - teklifbulRect.top,
      'Genişlik': heroContentRect.right - btnRect.right - 24
    });
  }
})();

