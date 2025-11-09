-- Migration: Vergi Daireleri Tablosu
-- Created: 2025-01-21

CREATE TABLE IF NOT EXISTS tax_offices (
  id SERIAL PRIMARY KEY,
  province_name TEXT NOT NULL,
  district_name TEXT NOT NULL,
  office_name TEXT NOT NULL,
  office_code TEXT UNIQUE NOT NULL, -- MUH.BIR.KODU
  office_type TEXT NOT NULL,        -- 'VD' | 'MALMUDURLUGU'
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_offices_prov ON tax_offices(province_name);
CREATE INDEX IF NOT EXISTS idx_tax_offices_prov_dist ON tax_offices(province_name, district_name);
CREATE INDEX IF NOT EXISTS idx_tax_offices_code ON tax_offices(office_code);
CREATE INDEX IF NOT EXISTS idx_tax_offices_type ON tax_offices(office_type);

