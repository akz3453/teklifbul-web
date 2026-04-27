// fefo-pos.js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('posForm');
  const statusPanel = document.getElementById('statusPanel');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const barcodeInput = document.getElementById('barcode');
    const qtyInput = document.getElementById('qty');
    const barcode = barcodeInput.value.trim();
    const quantity = parseFloat(qtyInput.value);

    // SAP Level Idempotency Key (Benzersiz islem IDsi - Ag hatalarinda cift cekimi onler)
    const idempotencyKey = crypto.randomUUID();

    statusPanel.className = 'status-panel';
    statusPanel.innerHTML = 'Islem SAP FEFO Motoruna iletiliyor...';
    statusPanel.style.display = 'block';

    try {
      const res = await fetch('/api/inventory/sale', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          barcode: barcode,
          quantity: quantity,
          warehouse_id: '123e4567-e89b-12d3-a456-426614174000', // Mocked Default Warehouse UUID 
          user_id: 'Test-Cashier-01'
        })
      });

      const data = await res.json();

      if (data.success) {
        let msg = `<strong>✅ Islem Basarili!</strong><br>Siparis Fisi ID: ${data.transaction_group_id}<br><br>`;
        
        // Multi-batch split report
        msg += `<strong>Ayrilan Parti/Stok Detaylari:</strong><br><ul style="text-align: left;">`;
        data.processed_batches.forEach(b => {
           msg += `<li>Batch ${b.batch_id.split('-')[0]}... -> ${b.qty} Adet Tuketildi</li>`;
        });
        msg += `</ul>`;

        if (data.warning) {
          msg += `<br><strong>⚠️ SAP UYARI:</strong> ${data.warning}`;
          statusPanel.classList.add('status-warning');
        } else {
          statusPanel.classList.add('status-success');
        }

        if (data.discount_rate) {
           msg += `<br><br><strong>🎁 Akilli Indirim:</strong> %${data.discount_rate} Uygulandi!`;
        }

        statusPanel.innerHTML = msg;
        barcodeInput.value = '';
        barcodeInput.focus();
      } else {
        // Hata ya da HARD BLOCK
        statusPanel.classList.add('status-danger');
        statusPanel.innerHTML = `<strong>❌ Islem Reddedildi!</strong><br>${data.message}`;
      }

    } catch (err) {
       console.error('POS Error:', err);
       statusPanel.classList.add('status-danger');
       statusPanel.innerHTML = `<strong>❌ Sunucu Hatasi!</strong><br>Lutfen baglantiyi kontrol edin.`;
    }
  });
});
