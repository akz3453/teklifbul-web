
/* global Chart */
import { logger } from '../src/shared/log/logger.js';
import { toast } from '../src/shared/ui/toast.js';
import { formatCurrency } from '../src/shared/utils/currency-formatter.js';
import { auth, requireAuth } from '../firebase.js';

// Global state
let allSales = [];
let chartInstances = {};

// Filter state
const filters = {
    dateRange: 'this_year',
    currency: 'TRY'
};

document.addEventListener('DOMContentLoaded', async () => {
    logger.info('Sales Reports page loaded');

    // Theme initialization checks
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
        document.documentElement.classList.contains('force-dark');
    Chart.defaults.color = isDark ? '#9ca3af' : '#6b7280';
    Chart.defaults.borderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    setupEventListeners();
    setupTabs();

    await fetchSalesData();
    renderDashboard();
});

function setupEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = 'Yükleniyor...';
            await fetchSalesData();
            renderDashboard();
            refreshBtn.textContent = '🔄 Yenile';
            refreshBtn.disabled = false;
        });
    }

    const dateSelect = document.getElementById('dateRange');
    const customDateGroup = document.getElementById('customDateGroup');
    if (dateSelect) {
        dateSelect.addEventListener('change', (e) => {
            filters.dateRange = e.target.value;
            // Özel tarih seçildiğinde tarih inputlarını göster/gizle
            if (customDateGroup) {
                customDateGroup.style.display = e.target.value === 'custom' ? 'flex' : 'none';
            }
            if (e.target.value !== 'custom') {
                renderDashboard();
            }
        });
    }

    // Özel tarih inputları
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    if (startDateInput) {
        startDateInput.addEventListener('change', () => {
            if (filters.dateRange === 'custom') renderDashboard();
        });
    }
    if (endDateInput) {
        endDateInput.addEventListener('change', () => {
            if (filters.dateRange === 'custom') renderDashboard();
        });
    }

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
        staff: document.getElementById('staffPanel')
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all
            tabs.forEach(t => t.classList.remove('active'));
            Object.values(panels).forEach(p => {
                if (p) p.classList.add('hidden');
            });

            // Activate clicked
            tab.classList.add('active');
            const target = tab.dataset.tab;
            if (panels[target]) {
                panels[target].classList.remove('hidden');
            }
        });
    });
}

async function fetchSalesData() {
    try {
        // Firebase auth state'in hazır olmasını bekle
        let user;
        try {
            user = await requireAuth();
        } catch (authErr) {
            toast.error('Oturum açmanız gerekiyor');
            logger.warn('Sales reports: Auth required', authErr);
            return;
        }

        const token = await user.getIdToken();
        const authStr = `Bearer ${token}`;

        // TODO: In production with many records, this should be a tailored 
        // analytics endpoint that does aggregation on the server.
        // For now, fetching all sales and aggregating client-side.
        const res = await fetch('/api/sales?limit=5000', { // Fetch reasonably large batch
            headers: { 'Authorization': authStr }
        });

        if (!res.ok) throw new Error('Satış verileri alınamadı');

        const data = await res.json();
        allSales = data.sales || []; // Ensure Array

        logger.info(`Fetched ${allSales.length} sales records`);
    } catch (err) {
        logger.error('Fetch sales error', err);
        toast.error('Rapor verileri yüklenirken hata oluştu');
        allSales = [];
    }
}

function getFilteredSales() {
    const now = new Date();
    let startDate = new Date(0); // Default all time
    let endDate = new Date();

    // Date filtering logic
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
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else if (filters.dateRange === 'this_year') {
        startDate = new Date(now.getFullYear(), 0, 1);
    } else if (filters.dateRange === 'last_year') {
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
    }

    // Filter and map
    return allSales.filter(sale => {
        // 1. Currency filter
        if (sale.currency !== filters.currency) return false;

        // 2. Status filter - only completed/revenue generating sales
        // Assuming 'draft', 'cancelled', 'rejected' should be excluded from revenue reports
        const excludeStatuses = ['draft', 'cancelled', 'rejected'];
        if (excludeStatuses.includes(sale.status)) return false;

        // 3. Date filter
        const saleDate = new Date(sale.createdAt._seconds ? sale.createdAt._seconds * 1000 : sale.createdAt); // Handle Firestore timestamp
        return saleDate >= startDate && saleDate <= endDate;
    });
}

function renderDashboard() {
    if (!allSales.length) {
        // Show empty states if needed
        return;
    }

    const filteredData = getFilteredSales();

    updateKeyMetrics(filteredData);
    renderRevenueTrendChart(filteredData);
    renderProductCharts(filteredData);
    renderCustomerCharts(filteredData);
    renderStaffCharts(filteredData);
}

function updateKeyMetrics(data) {
    const totalRev = data.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
    const totalCount = data.length;
    const avgOrder = totalCount > 0 ? totalRev / totalCount : 0;

    // Active customers (unique count)
    const uniqueCustomers = new Set(data.map(s => s.customerId)).size;

    document.getElementById('totalRevenue').textContent = formatCurrency(totalRev, filters.currency);
    document.getElementById('totalSalesCount').textContent = totalCount;
    document.getElementById('avgOrderValue').textContent = formatCurrency(avgOrder, filters.currency);
    document.getElementById('activeCustomerCount').textContent = uniqueCustomers;

    // Trend calculation (simplistic comparison with previous period of same length)
    // For now just hiding placeholders or static text
    document.getElementById('revenueTrend').textContent = `${data.length} adet işlem üzerinden`;
}

// -----------------------------------------------------
// Chart Rendering Helpers
// -----------------------------------------------------

function destroyChart(canvasId) {
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
        delete chartInstances[canvasId];
    }
}

function renderRevenueTrendChart(data) {
    const ctx = document.getElementById('revenueTrendChart');
    if (!ctx) return;

    destroyChart('revenueTrendChart');

    // Group by Month (YYYY-MM)
    const monthlyData = {};
    data.forEach(s => {
        const d = new Date(s.createdAt._seconds ? s.createdAt._seconds * 1000 : s.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[key] = (monthlyData[key] || 0) + (Number(s.totalAmount) || 0);
    });

    const sortedKeys = Object.keys(monthlyData).sort();
    const labels = sortedKeys;
    const values = sortedKeys.map(k => monthlyData[k]);

    chartInstances['revenueTrendChart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ciro',
                data: values,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => formatCurrency(ctx.raw, filters.currency)
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: Chart.defaults.borderColor }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

function renderProductCharts(data) {
    // Aggregate items
    const productRevenue = {};
    const productQty = {};
    const productNames = {};

    data.forEach(sale => {
        if (!sale.items || !Array.isArray(sale.items)) return;

        sale.items.forEach(item => {
            const sku = item.sku || `UNKNOWN-${item.name}`;
            productNames[sku] = item.name;

            productRevenue[sku] = (productRevenue[sku] || 0) + (Number(item.totalPrice) || 0);
            productQty[sku] = (productQty[sku] || 0) + (Number(item.quantity) || 0);
        });
    });

    // Top 10 Revenue
    const sortedByRev = Object.keys(productRevenue).sort((a, b) => productRevenue[b] - productRevenue[a]).slice(0, 10);

    // Top 10 Qty
    const sortedByQty = Object.keys(productQty).sort((a, b) => productQty[b] - productQty[a]).slice(0, 10);

    // Render Charts
    renderBarChart('topProductsRevenueChart', sortedByRev, productRevenue, productNames, 'Toplam Ciro', '#8b5cf6');
    renderBarChart('topProductsQtyChart', sortedByQty, productQty, productNames, 'Satış Adedi', '#10b981');

    // Populate Table
    const tableBody = document.querySelector('#productsTable tbody');
    if (tableBody) {
        tableBody.innerHTML = sortedByRev.map(sku => `
      <tr>
        <td>${sku}</td>
        <td>${productNames[sku] || '-'}</td>
        <td>${productQty[sku]}</td>
        <td>${formatCurrency(productRevenue[sku] / productQty[sku], filters.currency)}</td>
        <td>${formatCurrency(productRevenue[sku], filters.currency)}</td>
        <td>%${((productRevenue[sku] / (data.reduce((sum, s) => sum + s.totalAmount, 0) || 1)) * 100).toFixed(1)}</td>
      </tr>
    `).join('');
    }
}

function renderCustomerCharts(data) {
    const customerRevenue = {};
    const customerCount = {};
    const lastOrderDate = {};

    data.forEach(sale => {
        const name = sale.customerName || 'Bilinmeyen Müşteri';
        customerRevenue[name] = (customerRevenue[name] || 0) + (Number(sale.totalAmount) || 0);
        customerCount[name] = (customerCount[name] || 0) + 1;

        const d = new Date(sale.createdAt._seconds ? sale.createdAt._seconds * 1000 : sale.createdAt);
        if (!lastOrderDate[name] || d > lastOrderDate[name]) {
            lastOrderDate[name] = d;
        }
    });

    const sortedCustomers = Object.keys(customerRevenue).sort((a, b) => customerRevenue[b] - customerRevenue[a]).slice(0, 10);

    renderBarChart('topCustomersChart', sortedCustomers, customerRevenue, null, 'Ciro', '#f59e0b', { axis: 'y' });

    const tableBody = document.querySelector('#customersTable tbody');
    if (tableBody) {
        tableBody.innerHTML = sortedCustomers.map(name => `
      <tr>
        <td>${name}</td>
        <td>${customerCount[name]}</td>
        <td>${formatCurrency(customerRevenue[name], filters.currency)}</td>
        <td>${lastOrderDate[name] ? lastOrderDate[name].toLocaleDateString() : '-'}</td>
      </tr>
    `).join('');
    }
}

function renderStaffCharts(data) {
    const staffRevenue = {};
    const staffCount = {};

    // Assuming 'createdBy' is the user ID and we might not have names locally.
    // Ideally, sales data should populate a 'createdByName' or similar.
    // For now, check if 'salesRep' exists or fallback to createdBy
    data.forEach(sale => {
        const staff = sale.salesRep || sale.createdBy || 'Unknown';
        staffRevenue[staff] = (staffRevenue[staff] || 0) + (Number(sale.totalAmount) || 0);
        staffCount[staff] = (staffCount[staff] || 0) + 1;
    });

    const sortedStaff = Object.keys(staffRevenue).sort((a, b) => staffRevenue[b] - staffRevenue[a]);

    // Pie Chart
    const ctx = document.getElementById('staffPerformanceChart');
    if (ctx) {
        destroyChart('staffPerformanceChart');
        chartInstances['staffPerformanceChart'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: sortedStaff,
                datasets: [{
                    data: sortedStaff.map(k => staffRevenue[k]),
                    backgroundColor: [
                        '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'right' },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw, filters.currency)}`
                        }
                    }
                }
            }
        });
    }

    const tableBody = document.querySelector('#staffTable tbody');
    if (tableBody) {
        tableBody.innerHTML = sortedStaff.map(name => `
      <tr>
        <td>${name}</td>
        <td>${staffCount[name]}</td>
        <td>${formatCurrency(staffRevenue[name], filters.currency)}</td>
      </tr>
    `).join('');
    }
}

function renderBarChart(canvasId, keys, valueMap, nameMap, label, color, options = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    destroyChart(canvasId);

    const displayLabels = keys.map(k => nameMap ? (nameMap[k]?.substring(0, 20) || k) : k);
    const dataValues = keys.map(k => valueMap[k]);

    const config = {
        type: 'bar',
        data: {
            labels: displayLabels,
            datasets: [{
                label: label,
                data: dataValues,
                backgroundColor: color,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: options.axis || 'x',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.raw;
                            // Simple check if it *looks* like currency (large numbers, not quantity)
                            // Better to pass a formatter type param
                            return typeof val === 'number' && val > 1000 ? formatCurrency(val, filters.currency) : val;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false } },
                y: {
                    beginAtZero: true,
                    grid: { color: Chart.defaults.borderColor }
                }
            }
        }
    };

    chartInstances[canvasId] = new Chart(ctx, config);
}
