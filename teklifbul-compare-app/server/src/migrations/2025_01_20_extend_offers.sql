-- Migration: Extend offers table with new fields for enhanced comparison
-- Date: 2025-01-20
-- Description: Add new fields to support detailed offer comparison with shipping, payment terms, etc.

-- Add new columns to offers table
ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS request_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS vendor VARCHAR(100),
  ADD COLUMN IF NOT EXISTS product_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS qty DECIMAL(18,4) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT 'adet',
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'TRY',
  ADD COLUMN IF NOT EXISTS price DECIMAL(18,4),
  ADD COLUMN IF NOT EXISTS brand VARCHAR(100),
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_date DATE,
  ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50),
  ADD COLUMN IF NOT EXISTS shipping_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS shipping_cost DECIMAL(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(100),
  ADD COLUMN IF NOT EXISTS min_order_qty DECIMAL(18,4),
  ADD COLUMN IF NOT EXISTS vat_rate DECIMAL(5,2) DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_offers_request_id ON offers(request_id);
CREATE INDEX IF NOT EXISTS idx_offers_product_code ON offers(product_code);
CREATE INDEX IF NOT EXISTS idx_offers_vendor ON offers(vendor);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);

-- Update existing records to populate new fields from legacy fields
UPDATE offers 
SET 
  request_id = COALESCE(request_id, 'LEGACY-' || id),
  vendor = COALESCE(vendor, tedarikci),
  product_code = COALESCE(product_code, urun_kodu),
  price = COALESCE(price, teklif_fiyati),
  currency = COALESCE(currency, para_birimi),
  brand = COALESCE(brand, marka),
  lead_time_days = COALESCE(lead_time_days, teslim_suresi_gun),
  delivery_date = COALESCE(delivery_date, 
    CASE 
      WHEN teslim_suresi_gun IS NOT NULL 
      THEN CURRENT_DATE + INTERVAL '1 day' * teslim_suresi_gun
      ELSE NULL 
    END
  ),
  payment_terms = COALESCE(payment_terms, 'Peşin'),
  shipping_type = COALESCE(shipping_type, 'DAP'),
  shipping_cost = COALESCE(shipping_cost, 0),
  delivery_method = COALESCE(delivery_method, 'Şantiye Teslim'),
  min_order_qty = COALESCE(min_order_qty, min_siparis),
  vat_rate = COALESCE(vat_rate, 20.00),
  notes = COALESCE(notes, aciklama),
  created_at = COALESCE(created_at, 
    CASE 
      WHEN teklif_tarihi IS NOT NULL 
      THEN teklif_tarihi::timestamp
      ELSE CURRENT_TIMESTAMP 
    END
  ),
  updated_at = CURRENT_TIMESTAMP,
  status = CASE 
    WHEN durum = 'aktif' THEN 'active'
    WHEN durum = 'pasif' THEN 'inactive'
    WHEN durum = 'beklemede' THEN 'pending'
    ELSE 'active'
  END
WHERE request_id IS NULL OR vendor IS NULL OR product_code IS NULL;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_offers_updated_at ON offers;
CREATE TRIGGER update_offers_updated_at
    BEFORE UPDATE ON offers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add constraints
ALTER TABLE offers 
  ADD CONSTRAINT chk_offers_currency CHECK (currency IN ('TRY', 'USD', 'EUR', 'GBP')),
  ADD CONSTRAINT chk_offers_status CHECK (status IN ('active', 'inactive', 'pending')),
  ADD CONSTRAINT chk_offers_price_positive CHECK (price > 0),
  ADD CONSTRAINT chk_offers_qty_positive CHECK (qty > 0),
  ADD CONSTRAINT chk_offers_vat_rate CHECK (vat_rate >= 0 AND vat_rate <= 100);

-- Create view for backward compatibility
CREATE OR REPLACE VIEW offers_legacy AS
SELECT 
  id,
  tedarikci,
  urun_kodu,
  teklif_fiyati,
  para_birimi,
  min_siparis,
  teslim_suresi_gun,
  teklif_tarihi,
  marka,
  aciklama,
  durum
FROM offers
WHERE tedarikci IS NOT NULL AND urun_kodu IS NOT NULL;

-- Create view for enhanced offers
CREATE OR REPLACE VIEW offers_enhanced AS
SELECT 
  id,
  request_id,
  vendor,
  product_code,
  qty,
  unit,
  currency,
  price,
  brand,
  lead_time_days,
  delivery_date,
  payment_terms,
  shipping_type,
  shipping_cost,
  delivery_method,
  min_order_qty,
  vat_rate,
  notes,
  created_at,
  updated_at,
  status,
  -- Calculated fields
  (qty * price) as line_total,
  (qty * price + COALESCE(shipping_cost, 0)) as total_with_shipping,
  CASE 
    WHEN currency = 'TRY' THEN (qty * price + COALESCE(shipping_cost, 0))
    WHEN currency = 'USD' THEN (qty * price + COALESCE(shipping_cost, 0)) * 30.5 -- Mock USD rate
    WHEN currency = 'EUR' THEN (qty * price + COALESCE(shipping_cost, 0)) * 33.2 -- Mock EUR rate
    WHEN currency = 'GBP' THEN (qty * price + COALESCE(shipping_cost, 0)) * 38.7 -- Mock GBP rate
    ELSE (qty * price + COALESCE(shipping_cost, 0))
  END as total_tl
FROM offers
WHERE status = 'active';

COMMENT ON TABLE offers IS 'Enhanced offers table with detailed comparison fields';
COMMENT ON COLUMN offers.request_id IS 'Purchase request ID this offer belongs to';
COMMENT ON COLUMN offers.vendor IS 'Vendor/supplier name';
COMMENT ON COLUMN offers.product_code IS 'Product code identifier';
COMMENT ON COLUMN offers.qty IS 'Quantity being offered';
COMMENT ON COLUMN offers.unit IS 'Unit of measurement (adet, kg, m, etc.)';
COMMENT ON COLUMN offers.currency IS 'Currency code (TRY, USD, EUR, GBP)';
COMMENT ON COLUMN offers.price IS 'Unit price in specified currency';
COMMENT ON COLUMN offers.brand IS 'Product brand';
COMMENT ON COLUMN offers.lead_time_days IS 'Lead time in days';
COMMENT ON COLUMN offers.delivery_date IS 'Specific delivery date (optional)';
COMMENT ON COLUMN offers.payment_terms IS 'Payment terms (e.g., "Peşin", "30 Gün")';
COMMENT ON COLUMN offers.shipping_type IS 'Shipping type (DAP, EXW, FOB, etc.)';
COMMENT ON COLUMN offers.shipping_cost IS 'Shipping cost in specified currency';
COMMENT ON COLUMN offers.delivery_method IS 'Delivery method (Şantiye Teslim, Depo, etc.)';
COMMENT ON COLUMN offers.min_order_qty IS 'Minimum order quantity';
COMMENT ON COLUMN offers.vat_rate IS 'VAT rate percentage';
COMMENT ON COLUMN offers.notes IS 'Additional notes';
COMMENT ON COLUMN offers.status IS 'Offer status (active, inactive, pending)';
