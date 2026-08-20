// Teklifbul Rule v1.0 - Timing Sabitleri
// Hard-coded timing değerleri yasak - Tüm timing değerleri bu dosyadan import edilir

export const TOAST_TIMING = {
  DURATION: 3000,        // Toast görünür kalma süresi (ms)
  ANIMATION_DURATION: 300 // Animasyon süresi (ms)
};

// Teklifbul Rule v1.0 — API / oturum zaman aşımları
export const AUTH_FETCH_TIMEOUT_MS = 15000;
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60000;
export const EMAIL_VERIFICATION_RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;
export const COMPANY_ID_CACHE_TTL_MS = 30000;
export const NATIVE_PUSH_REGISTRATION_TIMEOUT_MS = 20000;
export const NATIVE_DOWNLOAD_MAX_BYTES = 8 * 1024 * 1024;
export const ROBOTO_IDLE_TIMEOUT_MS = 2500;
export const STOCK_LIST_QUERY_LIMIT = 2000;
export const STOCK_LIST_QUERY_LIMIT_NATIVE = 800;
export const STOCK_LIST_PAGE_SIZE = 200;
export const STOCK_LIST_PAGE_SIZE_NATIVE = 150;
export const STOCK_SEARCH_QUERY_LIMIT = 50;
export const FIRESTORE_IN_QUERY_LIMIT = 10;
export const STOCK_MATCH_QUERY_LIMIT = 200;
export const STOCK_CATALOG_MAX_PAGES = 10;
export const STOCK_COUNT_ITEMS_QUERY_LIMIT = 500;
export const STOCK_LOCATIONS_QUERY_LIMIT = 200;
export const HEADER_NOTIFICATION_POLL_MS = 60000;
export const BID_ITEMS_QUERY_LIMIT = 500;
export const BIDS_PER_DEMAND_QUERY_LIMIT = 100;
export const DEMAND_RECIPIENTS_QUERY_LIMIT = 200;
export const COMPANY_JOIN_REQUESTS_QUERY_LIMIT = 20;
export const INTERNAL_DEMANDS_QUERY_LIMIT = 200;
export const STOCK_MOVEMENTS_REPORT_QUERY_LIMIT = 500;
export const STOCK_BALANCES_QUERY_LIMIT = 1000;
export const COMPANY_MEMBERS_QUERY_LIMIT = 200;
export const CUSTOMERS_QUERY_LIMIT = 1000;
export const COMPLETED_DEMANDS_CHECK_LIMIT = 100;
export const USER_BIDS_HISTORY_QUERY_LIMIT = 100;
export const WRITE_BATCH_LIMIT = 400;
export const NOTIFICATION_DELETE_BATCH_LIMIT = 400;
export const PURCHASE_FORM_MAX_EXCEL_ROWS = 500;

