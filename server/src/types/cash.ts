/**
 * Cash Module Types - Kasa Modülü
 * Teklifbul Rule v1.0 - ETA uyumlu kasa yönetimi
 */

/**
 * Kasa Kartı
 */
export interface CashAccount {
    id: string;
    companyId: string;
    code: string; // örn: KASA-001
    name: string; // örn: Merkez Kasa
    currency: string; // TRY, USD, EUR
    balance: number; // Anlık bakiye
    isActive: boolean;
    isDefault: boolean; // Varsayılan kasa
    notes?: string;
    createdAt: FirebaseFirestore.Timestamp;
    updatedAt: FirebaseFirestore.Timestamp;
    createdBy: string;
    updatedBy?: string;
}

/**
 * Kasa Hareketi
 */
export interface CashTransaction {
    id: string;
    companyId: string;
    cashAccountId: string;
    cashAccountCode?: string; // Denormalize for display
    cashAccountName?: string; // Denormalize for display
    type: CashTransactionType; // 'in' veya 'out'
    transactionType: CashTransactionCategory;
    amount: number;
    currency: string;
    exchangeRate?: number; // Döviz kuru (dövizli işlemlerde)
    balanceAfter?: number; // İşlem sonrası bakiye

    // İlişkili kayıt
    relatedEntityType?: 'customer' | 'supplier' | 'bank' | 'cash_account' | 'expense' | 'other';
    relatedEntityId?: string;
    relatedEntityName?: string; // Denormalize for display

    // Belge bilgileri
    documentNumber?: string; // Fiş no, makbuz no vb.
    documentDate?: FirebaseFirestore.Timestamp;

    description: string;
    date: FirebaseFirestore.Timestamp;

    createdAt: FirebaseFirestore.Timestamp;
    createdBy: string;
}

/**
 * Kasa hareket yönü
 */
export type CashTransactionType = 'in' | 'out';

/**
 * Kasa hareket kategorisi
 */
export type CashTransactionCategory =
    | 'opening_balance'    // Açılış bakiyesi
    | 'customer_receipt'   // Müşteriden tahsilat
    | 'supplier_payment'   // Tedarikçiye ödeme
    | 'bank_deposit'       // Bankaya yatırma
    | 'bank_withdrawal'    // Bankadan çekim
    | 'cash_transfer_in'   // Kasadan havale (gelen)
    | 'cash_transfer_out'  // Kasadan havale (giden)
    | 'expense'            // Gider ödemesi
    | 'income'             // Gelir tahsilatı
    | 'check_receipt'      // Çek tahsilatı
    | 'note_receipt'       // Senet tahsilatı
    | 'check_payment'      // Çek ödemesi
    | 'note_payment'       // Senet ödemesi
    | 'adjustment'         // Düzeltme
    | 'other';             // Diğer

/**
 * Kasa oluşturma input
 */
export interface CreateCashAccountInput {
    companyId: string;
    code?: string; // Otomatik üretilebilir
    name: string;
    currency: string;
    openingBalance?: number;
    isDefault?: boolean;
    notes?: string;
    userId: string;
}

/**
 * Kasa güncelleme input
 */
export interface UpdateCashAccountInput {
    cashAccountId: string;
    companyId: string;
    name?: string;
    currency?: string;
    isActive?: boolean;
    isDefault?: boolean;
    notes?: string;
    userId: string;
}

/**
 * Kasa hareketi input
 */
export interface CashTransactionInput {
    companyId: string;
    cashAccountId: string;
    type: CashTransactionType;
    transactionType: CashTransactionCategory;
    amount: number;
    currency?: string; // Kasanın currency'si kullanılır
    exchangeRate?: number;
    relatedEntityType?: 'customer' | 'supplier' | 'bank' | 'cash_account' | 'expense' | 'other';
    relatedEntityId?: string;
    relatedEntityName?: string;
    documentNumber?: string;
    description: string;
    date: Date;
    userId: string;
}

/**
 * Kasalar arası virman input
 */
export interface CashTransferInput {
    companyId: string;
    fromCashAccountId: string;
    toCashAccountId: string;
    amount: number;
    exchangeRate?: number; // Farklı dövizler arasında
    description?: string;
    date: Date;
    userId: string;
}

/**
 * Kasa özet bilgisi
 */
export interface CashAccountSummary {
    id: string;
    code: string;
    name: string;
    currency: string;
    balance: number;
    isDefault: boolean;
    transactionCount: number;
    lastTransactionDate?: FirebaseFirestore.Timestamp;
}

/**
 * Hareket tipi etiketleri (UI için)
 */
export const CASH_TRANSACTION_LABELS: Record<CashTransactionCategory, string> = {
    opening_balance: 'Açılış Bakiyesi',
    customer_receipt: 'Müşteri Tahsilatı',
    supplier_payment: 'Tedarikçi Ödemesi',
    bank_deposit: 'Bankaya Yatırma',
    bank_withdrawal: 'Bankadan Çekim',
    cash_transfer_in: 'Kasadan Havale (Gelen)',
    cash_transfer_out: 'Kasadan Havale (Giden)',
    expense: 'Gider Ödemesi',
    income: 'Gelir Tahsilatı',
    check_receipt: 'Çek Tahsilatı',
    note_receipt: 'Senet Tahsilatı',
    check_payment: 'Çek Ödemesi',
    note_payment: 'Senet Ödemesi',
    adjustment: 'Düzeltme',
    other: 'Diğer'
};
