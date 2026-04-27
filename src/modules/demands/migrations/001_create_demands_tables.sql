-- Restore dropped demands table and associated entities
-- Teklifbul Rule v1.0 - Idempotent migrations with IF NOT EXISTS

-- 1. Companies table
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY, -- Matches Firestore ID
  name TEXT NOT NULL,
  tax_number TEXT,
  tax_office TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users table (simplified for relationship support)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, -- Matches Firestore UID
  company_id TEXT REFERENCES companies(id),
  email TEXT UNIQUE,
  display_name TEXT,
  role TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Stocks table
CREATE TABLE IF NOT EXISTS stocks (
  id SERIAL PRIMARY KEY,
  company_id TEXT REFERENCES companies(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT,
  current_quantity NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Demands table
CREATE TABLE IF NOT EXISTS demands (
  id SERIAL PRIMARY KEY,
  request_id TEXT UNIQUE NOT NULL, -- Logical ID (e.g., PR-2025-001)
  title TEXT NOT NULL,
  owner_id TEXT REFERENCES users(id),
  company_id TEXT REFERENCES companies(id),
  status TEXT DEFAULT 'pending',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Demand Items
CREATE TABLE IF NOT EXISTS demand_items (
  id SERIAL PRIMARY KEY,
  demand_id INTEGER REFERENCES demands(id) ON DELETE CASCADE,
  stock_id INTEGER REFERENCES stocks(id),
  product_code TEXT, -- Fallback product code
  product_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT,
  target_price NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_demands_request_id ON demands(request_id);
CREATE INDEX IF NOT EXISTS idx_demands_company_id ON demands(company_id);
CREATE INDEX IF NOT EXISTS idx_demand_items_demand_id ON demand_items(demand_id);
CREATE INDEX IF NOT EXISTS idx_stocks_sku ON stocks(sku);
CREATE INDEX IF NOT EXISTS idx_stocks_company ON stocks(company_id);
