/* global Chart */
// Teklifbul Rule v1.0 — Satış raporları
import { logger } from '../src/shared/log/logger.js';
import { toast } from '../src/shared/ui/toast.js';
import { formatCurrency } from '../src/shared/utils/currency-formatter.js';
import { requireAuth } from '../firebase.js';
import { authFetch } from '../assets/js/utils/api-helpers.js';
import { requireCompanyContext } from '../assets/js/state/company-context.js';
import { initPermissions, can, getSalesPerms } from '../assets/js/state/permissions.js';

const SALES_PERMS = getSalesPerms();
const MAX_PAGES = 20; // pageSize 100 → en fazla ~2000 satış
const PAGE_SIZE = 100;

let allSales = [];
let chartInstances = {};
let loadError = null;

const filters = {
  dateRange: 'this_year',
  currency: 'TRY',
};

const MONTH_TR = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
];

document.addEventListener('DOMContentLoaded', async () => {
  logger.group('Sales Reports');
  try {
    const isDark =
      document.documentElement.getAttribute('data-theme') === 'dark' ||
      document.documentElement.classList.contains('force-dark');
    if (typeof Chart !== 'undefined') {
      Chart.defaults.color = isDark ? '#9ca3af' : '#6b7280';
      Chart.defaults.borderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    }

    setupEventListeners();
    setupTabs();

    await requireAuth();
    await requireCompanyContext({ redirectOnPending: true });
    await initPermissions({ redirectOnPending: true });

    if (SALES_PERMS.view && !can(SALES_PERMS.view)) {
      showPageStatus(
        'error',
        'Satış raporlarını görüntüleme yetkiniz yok. Yöneticinizden sales.view yetkisi isteyin.'
      );
      toast.error('Satış raporları için yetkiniz yok');
      return;
    }

    await fetchSalesData();
    renderDashboard();
  } catch (err) {
    logger.error('Sales reports init', err);
    showPageStatus('error', 'Sayfa başlatılamadı. Oturumunuzu kontrol edip yenileyin.');
    toast.error('Hata: ' + (err?.message || 'Sayfa yüklenemedi'));
  } finally {
    logger.end();
  }
});

function setupEventListeners() {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Yükleniyor...';
      try {
        await fetchSalesData();
        renderDashboard();
        toast.success('İşlem tamamlandı');
      } catch (err) {
        toast.error('Hata: ' + (err?.message || 'Yenileme başarısız'));
      } finally {
        refreshBtn.textContent = '🔄 Yenile';
        refreshBtn.disabled = false;
      }
    });
  }

  const dateSelect = document.getElementById('dateRange');
  const customDateGroup = document.getElementById('customDateGroup');
  if (dateSelect) {
    dateSelect.addEventListener('change', (e) => {
      filters.dateRange = e.target.value;
      if (customDateGroup) {
        customDateGroup.hidden = e.target.value !== 'custom';
      }
      if (e.target.value !== 'custom') renderDashboard();
    });
  }

  ['startDate', 'endDate'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        if (filters.dateRange === 'custom') renderDashboard();
      });
    }
  });

  const currencySelect = document.getElementById('currencyFilter');
  if (currencySelect) {
    currencySelect.addEventListener('change', (e) => {
      filters.currency = e.target.value;
      renderDashboard();
    });
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  const panels = {
    overview: document.getElementById('overviewPanel'),
    products: document.getElementById('productsPanel'),
    customers: document.getElementById('customersPanel'),
    staff: document.getElementById('staffPanel'),
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      Object.values(panels).forEach((p) => {
        if (p) p.classList.add('hidden');
      });

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const target = tab.dataset.tab;
      if (panels[target]) panels[target].classList.remove('hidden');
    });
  });
}

function showPageStatus(type, message) {
  const el = document.getElementById('reportStatus');
  if (!el) return;
  el.hidden = !message;
  el.className = 'report-status' + (type ? ` report-status--${type}` : '');
  el.textContent = message || '';
}

function setLoading(isLoading) {
  const el = document.getElementById('reportLoading');
  if (el) el.hidden = !isLoading;
}

function parseSaleDate(sale) {
  const raw = sale?.createdAt || sale?.saleDate || sale?.date;
  if (!raw) return null;
  if (raw._seconds) return new Date(raw._seconds * 1000);
  if (typeof raw.toDate === 'function') return raw.toDate();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getSaleCurrency(sale) {
  const c = String(sale?.currency || 'TRY').trim().toUpperCase();
  return c || 'TRY';
}

function getSaleAmount(sale) {
  const n = Number(
    sale?.totalAmount ?? sale?.grandTotal ?? sale?.totals?.total ?? sale?.amount ?? 0
  );
  return Number.isFinite(n) ? n : 0;
}

function getSaleCustomerName(sale) {
  return (
    sale?.customerName ||
    sale?.customer?.name ||
    sale?.customerTitle ||
    'Bilinmeyen müşteri'
  );
}

function getStaffLabel(sale) {
  return (
    sale?.salesRepName ||
    sale?.createdByName ||
    sale?.salesRep ||
    sale?.createdByEmail ||
    (sale?.createdBy ? `Kullanıcı ${String(sale.createdBy).slice(0, 8)}…` : 'Belirtilmemiş')
  );
}

async function fetchSalesData() {
  loadError = null;
  setLoading(true);
  showPageStatus('info', 'Satışlar yükleniyor...');

  try {
    const collected = [];
    let cursor = null;
    let page = 0;

    do {
      page += 1;
      const params = new URLSearchParams({
        pageSize: String(PAGE_SIZE),
        status: 'all',
        showArchived: 'false',
      });
      if (cursor) params.set('cursor', cursor);

      const res = await authFetch(`/api/sales?${params.toString()}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        const msg =
          data.message ||
          data.error ||
          (res.status === 403
            ? 'Satış listesi için yetkiniz yok'
            : 'Satış verileri alınamadı');
        throw new Error(msg);
      }

      const batch = Array.isArray(data.sales) ? data.sales : [];
      collected.push(...batch);
      cursor = data.pagination?.hasMore ? data.pagination.nextCursor : null;
    } while (cursor && page < MAX_PAGES);

    allSales = collected;
    logger.info('Sales reports data loaded', {
      count: allSales.length,
      pages: page,
    });

    if (!allSales.length) {
      showPageStatus(
        'info',
        'Bu şirkette henüz satış kaydı yok. Satış oluşturduğunuzda özet kartlar ve grafikler burada dolacak.'
      );
    } else {
      showPageStatus('', '');
    }
  } catch (err) {
    loadError = err?.message || 'Yükleme hatası';
    allSales = [];
    logger.error('Fetch sales error', err);
    showPageStatus('error', 'Hata: ' + loadError);
    toast.error('Hata: ' + loadError);
  } finally {
    setLoading(false);
  }
}

function getDateBounds() {
  const now = new Date();
  let startDate = new Date(0);
  let endDate = new Date();
  endDate.setHours(23, 59, 59, 999);

  if (filters.dateRange === 'custom') {
    const startVal = document.getElementById('startDate')?.value;
    const endVal = document.getElementById('endDate')?.value;
    if (startVal) startDate = new Date(startVal);
    if (endVal) {
      endDate = new Date(endVal);
      endDate.setHours(23, 59, 59, 999);
    }
  } else if (filters.dateRange === 'this_month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (filters.dateRange === 'last_month') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else if (filters.dateRange === 'this_year') {
    startDate = new Date(now.getFullYear(), 0, 1);
  } else if (filters.dateRange === 'last_year') {
    startDate = new Date(now.getFullYear() - 1, 0, 1);
    endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
  } else if (filters.dateRange === 'all') {
    startDate = new Date(0);
  }

  return { startDate, endDate };
}

function getFilteredSales() {
  const { startDate, endDate } = getDateBounds();
  return allSales.filter((sale) => {
    if (getSaleCurrency(sale) !== filters.currency) return false;
    const excludeStatuses = ['draft', 'cancelled', 'rejected'];
    if (excludeStatuses.includes(sale.status)) return false;
    const saleDate = parseSaleDate(sale);
    if (!saleDate) return false;
    return saleDate >= startDate && saleDate <= endDate;
  });
}

function periodLabel() {
  const map = {
    this_month: 'Bu ay',
    last_month: 'Geçen ay',
    this_year: 'Bu yıl',
    last_year: 'Geçen yıl',
    all: 'Tüm zamanlar',
    custom: 'Özel tarih',
  };
  return map[filters.dateRange] || filters.dateRange;
}

function renderDashboard() {
  const periodEl = document.getElementById('periodSummary');
  const filteredData = getFilteredSales();

  if (periodEl) {
    periodEl.textContent = `${periodLabel()} · ${filters.currency} · ${filteredData.length} satış (toplam ${allSales.length} kayıt)`;
  }

  if (loadError) {
    updateKeyMetrics([]);
    clearChart('revenueTrendChart');
    renderEmptyTables();
    return;
  }

  if (!allSales.length) {
    updateKeyMetrics([]);
    clearChart('revenueTrendChart');
    setChartEmpty('revenueTrendEmpty', true, 'Satış kaydı yok.');
    renderEmptyTables();
    return;
  }

  if (!filteredData.length) {
    showPageStatus(
      'info',
      `Seçilen filtrede (${periodLabel()}, ${filters.currency}) satış yok. Tarihi veya para birimini değiştirin.`
    );
  } else {
    showPageStatus('', '');
  }

  updateKeyMetrics(filteredData);
  renderRevenueTrendChart(filteredData);
  renderRecentSalesTable(filteredData);
  renderProductCharts(filteredData);
  renderCustomerCharts(filteredData);
  renderStaffCharts(filteredData);
}

function updateKeyMetrics(data) {
  const totalRev = data.reduce((sum, s) => sum + getSaleAmount(s), 0);
  const totalCount = data.length;
  const avgOrder = totalCount > 0 ? totalRev / totalCount : 0;
  const uniqueCustomers = new Set(
    data.map((s) => s.customerId || getSaleCustomerName(s))
  ).size;

  setText('totalRevenue', formatCurrency(totalRev, filters.currency));
  setText('totalSalesCount', String(totalCount));
  setText('avgOrderValue', formatCurrency(avgOrder, filters.currency));
  setText('activeCustomerCount', String(uniqueCustomers));
  setText(
    'revenueTrend',
    totalCount
      ? `${periodLabel()} · ${totalCount} işlem`
      : 'Seçilen dönemde işlem yok'
  );
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function destroyChart(canvasId) {
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
    delete chartInstances[canvasId];
  }
}

function clearChart(canvasId) {
  destroyChart(canvasId);
}

function setChartEmpty(emptyId, show, message) {
  const el = document.getElementById(emptyId);
  if (!el) return;
  el.hidden = !show;
  if (message) el.textContent = message;
  const canvas = el.previousElementSibling;
  if (canvas && canvas.tagName === 'CANVAS') {
    canvas.hidden = !!show;
  }
}

function renderRevenueTrendChart(data) {
  const ctx = document.getElementById('revenueTrendChart');
  if (!ctx || typeof Chart === 'undefined') return;

  destroyChart('revenueTrendChart');

  if (!data.length) {
    setChartEmpty('revenueTrendEmpty', true, 'Bu dönemde grafik için veri yok.');
    return;
  }
  setChartEmpty('revenueTrendEmpty', false);

  const monthlyData = {};
  data.forEach((s) => {
    const d = parseSaleDate(s);
    if (!d) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyData[key] = (monthlyData[key] || 0) + getSaleAmount(s);
  });

  const sortedKeys = Object.keys(monthlyData).sort();
  const labels = sortedKeys.map((k) => {
    const [y, m] = k.split('-');
    return `${MONTH_TR[Number(m) - 1]} ${y}`;
  });
  const values = sortedKeys.map((k) => monthlyData[k]);

  chartInstances.revenueTrendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Ciro',
          data: values,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => formatCurrency(c.raw, filters.currency),
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) =>
              new Intl.NumberFormat('tr-TR', {
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(v),
          },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

function appendCells(tr, values) {
  values.forEach((v) => {
    const td = document.createElement('td');
    td.textContent = v == null ? '' : String(v);
    tr.appendChild(td);
  });
}

function fillTable(tableId, rows, emptyMessage, colSpan) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  tbody.textContent = '';

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = colSpan;
    td.className = 'table-empty';
    td.textContent = emptyMessage;
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((cells) => {
    const tr = document.createElement('tr');
    appendCells(tr, cells);
    tbody.appendChild(tr);
  });
}

function renderEmptyTables() {
  fillTable('recentSalesTable', [], 'Gösterilecek satış yok.', 5);
  fillTable('productsTable', [], 'Ürün satış verisi yok.', 6);
  fillTable('customersTable', [], 'Müşteri verisi yok.', 4);
  fillTable('staffTable', [], 'Personel verisi yok.', 3);
}

function renderRecentSalesTable(data) {
  const sorted = [...data].sort((a, b) => {
    const da = parseSaleDate(a)?.getTime() || 0;
    const db = parseSaleDate(b)?.getTime() || 0;
    return db - da;
  });

  const rows = sorted.slice(0, 15).map((s) => {
    const d = parseSaleDate(s);
    return [
      d ? d.toLocaleDateString('tr-TR') : '-',
      getSaleCustomerName(s),
      s.status || '-',
      String(Array.isArray(s.items) ? s.items.length : '-'),
      formatCurrency(getSaleAmount(s), filters.currency),
    ];
  });

  fillTable(
    'recentSalesTable',
    rows,
    'Bu dönemde satış yok.',
    5
  );
}

function renderProductCharts(data) {
  const productRevenue = {};
  const productQty = {};
  const productNames = {};
  let totalRev = 0;

  data.forEach((sale) => {
    totalRev += getSaleAmount(sale);
    if (!sale.items || !Array.isArray(sale.items)) return;
    sale.items.forEach((item) => {
      const sku = item.sku || `UNKNOWN-${item.name || 'ürün'}`;
      productNames[sku] = item.name || sku;
      const lineTotal = Number(item.totalPrice ?? item.lineTotal ?? 0) || 0;
      const qty = Number(item.quantity) || 0;
      productRevenue[sku] = (productRevenue[sku] || 0) + lineTotal;
      productQty[sku] = (productQty[sku] || 0) + qty;
    });
  });

  const sortedByRev = Object.keys(productRevenue)
    .sort((a, b) => productRevenue[b] - productRevenue[a])
    .slice(0, 10);
  const sortedByQty = Object.keys(productQty)
    .sort((a, b) => productQty[b] - productQty[a])
    .slice(0, 10);

  renderBarChart(
    'topProductsRevenueChart',
    'productsRevenueEmpty',
    sortedByRev,
    productRevenue,
    productNames,
    'Toplam Ciro',
    '#8b5cf6',
    true
  );
  renderBarChart(
    'topProductsQtyChart',
    'productsQtyEmpty',
    sortedByQty,
    productQty,
    productNames,
    'Satış Adedi',
    '#10b981',
    false
  );

  const rows = sortedByRev.map((sku) => {
    const qty = productQty[sku] || 0;
    const rev = productRevenue[sku] || 0;
    const avg = qty > 0 ? rev / qty : 0;
    const share = totalRev > 0 ? ((rev / totalRev) * 100).toFixed(1) : '0.0';
    return [
      sku,
      productNames[sku] || '-',
      String(qty),
      formatCurrency(avg, filters.currency),
      formatCurrency(rev, filters.currency),
      `%${share}`,
    ];
  });

  fillTable('productsTable', rows, 'Bu dönemde ürün satışı yok.', 6);
}

function renderCustomerCharts(data) {
  const customerRevenue = {};
  const customerCount = {};
  const lastOrderDate = {};

  data.forEach((sale) => {
    const name = getSaleCustomerName(sale);
    customerRevenue[name] = (customerRevenue[name] || 0) + getSaleAmount(sale);
    customerCount[name] = (customerCount[name] || 0) + 1;
    const d = parseSaleDate(sale);
    if (d && (!lastOrderDate[name] || d > lastOrderDate[name])) {
      lastOrderDate[name] = d;
    }
  });

  const sortedCustomers = Object.keys(customerRevenue)
    .sort((a, b) => customerRevenue[b] - customerRevenue[a])
    .slice(0, 10);

  renderBarChart(
    'topCustomersChart',
    'customersEmpty',
    sortedCustomers,
    customerRevenue,
    null,
    'Ciro',
    '#f59e0b',
    true,
    { axis: 'y' }
  );

  const rows = sortedCustomers.map((name) => [
    name,
    String(customerCount[name]),
    formatCurrency(customerRevenue[name], filters.currency),
    lastOrderDate[name] ? lastOrderDate[name].toLocaleDateString('tr-TR') : '-',
  ]);

  fillTable('customersTable', rows, 'Bu dönemde müşteri satışı yok.', 4);
}

function renderStaffCharts(data) {
  const staffRevenue = {};
  const staffCount = {};

  data.forEach((sale) => {
    const staff = getStaffLabel(sale);
    staffRevenue[staff] = (staffRevenue[staff] || 0) + getSaleAmount(sale);
    staffCount[staff] = (staffCount[staff] || 0) + 1;
  });

  const sortedStaff = Object.keys(staffRevenue).sort(
    (a, b) => staffRevenue[b] - staffRevenue[a]
  );

  const ctx = document.getElementById('staffPerformanceChart');
  if (ctx && typeof Chart !== 'undefined') {
    destroyChart('staffPerformanceChart');
    if (!sortedStaff.length) {
      setChartEmpty('staffEmpty', true, 'Personel performansı için veri yok.');
    } else {
      setChartEmpty('staffEmpty', false);
      chartInstances.staffPerformanceChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: sortedStaff,
          datasets: [
            {
              data: sortedStaff.map((k) => staffRevenue[k]),
              backgroundColor: [
                '#3b82f6',
                '#ef4444',
                '#10b981',
                '#f59e0b',
                '#8b5cf6',
                '#ec4899',
              ],
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right' },
            tooltip: {
              callbacks: {
                label: (c) =>
                  `${c.label}: ${formatCurrency(c.raw, filters.currency)}`,
              },
            },
          },
        },
      });
    }
  }

  const rows = sortedStaff.map((name) => [
    name,
    String(staffCount[name]),
    formatCurrency(staffRevenue[name], filters.currency),
  ]);
  fillTable('staffTable', rows, 'Personel satışı yok.', 3);
}

function renderBarChart(
  canvasId,
  emptyId,
  keys,
  valueMap,
  nameMap,
  label,
  color,
  asCurrency,
  options = {}
) {
  const ctx = document.getElementById(canvasId);
  if (!ctx || typeof Chart === 'undefined') return;

  destroyChart(canvasId);

  if (!keys.length) {
    setChartEmpty(emptyId, true, `${label} için veri yok.`);
    return;
  }
  setChartEmpty(emptyId, false);

  const displayLabels = keys.map((k) => {
    const name = nameMap ? nameMap[k] || k : k;
    return String(name).length > 22 ? `${String(name).slice(0, 20)}…` : name;
  });
  const dataValues = keys.map((k) => valueMap[k]);

  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: displayLabels,
      datasets: [
        {
          label,
          data: dataValues,
          backgroundColor: color,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: options.axis || 'x',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) =>
              asCurrency
                ? formatCurrency(c.raw, filters.currency)
                : `${c.raw}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true },
      },
    },
  });
}
