/**
 * Currency conversion service
 * Handles currency conversion with mock rates (can be replaced with real API later)
 */

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  lastUpdated: string;
}

export class FXService {
  private rates: Map<string, ExchangeRate> = new Map();

  constructor() {
    this.initializeRates();
  }

  /**
   * Initialize mock exchange rates
   * In production, these would come from a real API like fixer.io or similar
   */
  private initializeRates(): void {
    const baseRates = [
      { from: 'USD', to: 'TRY', rate: 30.5 },
      { from: 'EUR', to: 'TRY', rate: 33.2 },
      { from: 'GBP', to: 'TRY', rate: 38.7 },
      { from: 'TRY', to: 'USD', rate: 1 / 30.5 },
      { from: 'TRY', to: 'EUR', rate: 1 / 33.2 },
      { from: 'TRY', to: 'GBP', rate: 1 / 38.7 },
      { from: 'EUR', to: 'USD', rate: 30.5 / 33.2 },
      { from: 'USD', to: 'EUR', rate: 33.2 / 30.5 },
      { from: 'GBP', to: 'USD', rate: 30.5 / 38.7 },
      { from: 'USD', to: 'GBP', rate: 38.7 / 30.5 },
      { from: 'GBP', to: 'EUR', rate: 33.2 / 38.7 },
      { from: 'EUR', to: 'GBP', rate: 38.7 / 33.2 }
    ];

    baseRates.forEach(rate => {
      const key = `${rate.from}_${rate.to}`;
      this.rates.set(key, {
        from: rate.from,
        to: rate.to,
        rate: rate.rate,
        lastUpdated: new Date().toISOString()
      });
    });
  }

  /**
   * Convert amount from one currency to another
   */
  convert(amount: number, fromCurrency: string, toCurrency: string): number {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    const rate = this.getRate(fromCurrency, toCurrency);
    if (!rate) {
      console.warn(`No exchange rate found for ${fromCurrency} to ${toCurrency}`);
      return amount; // Return original amount if no rate found
    }

    return amount * rate;
  }

  /**
   * Get exchange rate between two currencies
   */
  getRate(fromCurrency: string, toCurrency: string): number | null {
    if (fromCurrency === toCurrency) {
      return 1;
    }

    const key = `${fromCurrency}_${toCurrency}`;
    const rate = this.rates.get(key);
    return rate ? rate.rate : null;
  }

  /**
   * Convert to TRY (Turkish Lira) - most common conversion
   */
  convertToTRY(amount: number, fromCurrency: string): number {
    return this.convert(amount, fromCurrency, 'TRY');
  }

  /**
   * Get all available rates
   */
  getAllRates(): ExchangeRate[] {
    return Array.from(this.rates.values());
  }

  /**
   * Update exchange rates (for future real API integration)
   */
  async updateRates(): Promise<void> {
    // TODO: Implement real API call
    // Example: const rates = await this.fetchRatesFromAPI();
    // this.rates.clear();
    // rates.forEach(rate => this.rates.set(`${rate.from}_${rate.to}`, rate));
    
    console.log('Mock rates updated');
    this.initializeRates();
  }

  /**
   * Get supported currencies
   */
  getSupportedCurrencies(): string[] {
    const currencies = new Set<string>();
    this.rates.forEach(rate => {
      currencies.add(rate.from);
      currencies.add(rate.to);
    });
    return Array.from(currencies);
  }

  /**
   * Format currency amount with proper formatting
   */
  formatAmount(amount: number, currency: string, locale: string = 'tr-TR'): string {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return formatter.format(amount);
  }

  /**
   * Calculate total with VAT
   */
  calculateTotalWithVAT(amount: number, vatRate: number = 20): number {
    return amount * (1 + vatRate / 100);
  }

  /**
   * Calculate line total: (qty * price) + shipping_cost, converted to target currency
   */
  calculateLineTotal(
    qty: number,
    unitPrice: number,
    currency: string,
    shippingCost: number = 0,
    targetCurrency: string = 'TRY'
  ): number {
    const lineTotal = (qty * unitPrice) + shippingCost;
    return this.convert(lineTotal, currency, targetCurrency);
  }

  /**
   * Get currency symbol
   */
  getCurrencySymbol(currency: string): string {
    const symbols: Record<string, string> = {
      'TRY': '₺',
      'USD': '$',
      'EUR': '€',
      'GBP': '£'
    };
    return symbols[currency] || currency;
  }

  /**
   * Check if currency is supported
   */
  isSupported(currency: string): boolean {
    return this.getSupportedCurrencies().includes(currency);
  }
}

// Export singleton instance
export const fxService = new FXService();
