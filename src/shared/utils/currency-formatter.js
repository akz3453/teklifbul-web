/**
 * Format currency numbers with locale
 * @param {number} amount 
 * @param {string} currencyCode (TRY, USD, EUR)
 * @returns {string} Formatted string
 */
export function formatCurrency(amount, currencyCode = 'TRY') {
    if (amount === undefined || amount === null) return '-';

    const value = Number(amount);
    if (isNaN(value)) return '-';

    try {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: 2
        }).format(value);
    } catch (err) {
        console.warn('Currency format error', err);
        return `${value.toFixed(2)} ${currencyCode}`;
    }
}
