// fefo-dashboard.js
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/inventory/dashboard-stats');
    if (!res.ok) {
      document.getElementById('expiryLoss').innerText = 'API Error';
      return;
    }
    const data = await res.json();
    if (data.success && data.stats) {
      document.getElementById('expiryLoss').innerText = parseInt(data.stats.expiryLossForecast).toLocaleString() + ' Units';
    } else {
      document.getElementById('expiryLoss').innerText = 'N/A';
    }
  } catch (err) {
    document.getElementById('expiryLoss').innerText = 'Unavailable';
    console.error('Failed to load FEFO stats:', err);
  }
});
