-- 001_create_fefo_inventory_v2_sap_level.sql
-- GeliÅŸmiÅŸ Kurumsal FEFO + SKT YÃ–NETÄ°M SÄ°STEMÄ° (TRUE SAP ALTERNATIVE)

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0. IDEMPOTENCY TABLE
CREATE TABLE IF NOT EXISTS fefo_idempotency_keys (
    idempotency_key UUID PRIMARY KEY,
    response_body JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 1. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS fefo_products (
    product_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_name VARCHAR(255) NOT NULL,
    master_barcode VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(100),
    critical_skt_threshold_days INTEGER DEFAULT 30,
    allow_expired_sale BOOLEAN DEFAULT false,
    expired_sale_grace_days INTEGER DEFAULT 0,
    stock_rotation_type VARCHAR(10) DEFAULT 'FEFO' CHECK (stock_rotation_type IN ('FIFO', 'FEFO')),
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. WAREHOUSES TABLE
CREATE TABLE IF NOT EXISTS fefo_warehouses (
    warehouse_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    warehouse_name VARCHAR(255) NOT NULL,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. INVENTORY BATCHES TABLE
CREATE TABLE IF NOT EXISTS fefo_inventory_batches (
    batch_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES fefo_products(product_id),
    warehouse_id UUID NOT NULL REFERENCES fefo_warehouses(warehouse_id),
    lot_number VARCHAR(100) NOT NULL,
    received_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expiry_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'QUARANTINE' CHECK (status IN ('ACTIVE', 'BLOCKED', 'EXPIRED', 'QUARANTINE', 'RETURNED')),
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, warehouse_id, lot_number, expiry_date)
);

-- FEFO OPTIMIZATION INDEX
CREATE INDEX IF NOT EXISTS idx_fefo_lookup
ON fefo_inventory_batches (product_id, warehouse_id, expiry_date)
WHERE status = 'ACTIVE' AND is_deleted = false;

-- 4. BATCH STOCK CACHE TABLE
CREATE TABLE IF NOT EXISTS fefo_inventory_batch_stock (
    batch_id UUID PRIMARY KEY REFERENCES fefo_inventory_batches(batch_id),
    current_stock NUMERIC(15, 4) DEFAULT 0,
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. ALIAS BARCODES TABLE
CREATE TABLE IF NOT EXISTS fefo_alias_barcodes (
    barcode_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES fefo_inventory_batches(batch_id),
    alias_barcode_value VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'USED', 'REVOKED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. STOCK MOVEMENTS TABLE (RANGE PARTITIONED BY TIMESTAMP)
-- Primary key must include the partition key timestamp
CREATE TABLE IF NOT EXISTS fefo_stock_movements (
    movement_id UUID DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL,
    transaction_group_id UUID NOT NULL,
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('IN', 'OUT', 'ADJUSTMENT', 'RETURN', 'WASTE')),
    quantity NUMERIC(15, 4) NOT NULL,
    reference_id VARCHAR(255),
    user_id VARCHAR(100),
    correlation_id UUID,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (movement_id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Creating generic default partition for fallbacks
CREATE TABLE fefo_stock_movements_default 
PARTITION OF fefo_stock_movements DEFAULT;

-- Creating the first monthly partition
CREATE TABLE fefo_stock_movements_y2026m04 
PARTITION OF fefo_stock_movements FOR VALUES FROM ('2026-04-01 00:00:00Z') TO ('2026-05-01 00:00:00Z');

CREATE TABLE fefo_stock_movements_y2026m05 
PARTITION OF fefo_stock_movements FOR VALUES FROM ('2026-05-01 00:00:00Z') TO ('2026-06-01 00:00:00Z');

-- 7. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS fefo_audit_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    action_type VARCHAR(10) CHECK (action_type IN ('INSERT', 'UPDATE', 'DELETE', 'SOFT_DELETE')),
    old_value JSONB,
    new_value JSONB,
    user_id VARCHAR(100),
    correlation_id UUID,
    is_critical_change BOOLEAN DEFAULT false,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. QUALITY INSPECTIONS TABLE
CREATE TABLE IF NOT EXISTS fefo_quality_inspections (
    inspection_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES fefo_inventory_batches(batch_id),
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- TRIGGERS & FUNCTIONS
-- ==========================================

-- A. UPDATED_AT Trigger Function
CREATE OR REPLACE FUNCTION fefo_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_fefo_products_modtime BEFORE UPDATE ON fefo_products FOR EACH ROW EXECUTE FUNCTION fefo_update_updated_at_column();
CREATE TRIGGER update_fefo_inventory_batches_modtime BEFORE UPDATE ON fefo_inventory_batches FOR EACH ROW EXECUTE FUNCTION fefo_update_updated_at_column();

-- B. STOCK CACHE TRIGGER LOGIC
-- Automatically updates fefo_inventory_batch_stock on fefo_stock_movements INSERT
CREATE OR REPLACE FUNCTION fefo_update_batch_stock_cache()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO fefo_inventory_batch_stock (batch_id, current_stock, last_updated_at)
    VALUES (NEW.batch_id, 0, CURRENT_TIMESTAMP)
    ON CONFLICT (batch_id) DO NOTHING;

    IF NEW.movement_type = 'IN' OR NEW.movement_type = 'RETURN' THEN
        UPDATE fefo_inventory_batch_stock
        SET current_stock = current_stock + NEW.quantity,
            last_updated_at = CURRENT_TIMESTAMP
        WHERE batch_id = NEW.batch_id;
    ELSIF NEW.movement_type = 'OUT' OR NEW.movement_type = 'WASTE' THEN
        UPDATE fefo_inventory_batch_stock
        SET current_stock = current_stock - NEW.quantity,
            last_updated_at = CURRENT_TIMESTAMP
        WHERE batch_id = NEW.batch_id;
    ELSIF NEW.movement_type = 'ADJUSTMENT' THEN
        UPDATE fefo_inventory_batch_stock
        SET current_stock = current_stock + NEW.quantity,
            last_updated_at = CURRENT_TIMESTAMP
        WHERE batch_id = NEW.batch_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER trg_fefo_update_stock_cache AFTER INSERT ON fefo_stock_movements FOR EACH ROW EXECUTE FUNCTION fefo_update_batch_stock_cache();

-- C. AUDIT LOG TRIGGER LOGIC V2 (Supports Soft Delete Recognition)
CREATE OR REPLACE FUNCTION fefo_audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    is_critical BOOLEAN := false;
    record_uuid UUID;
    act_type VARCHAR(15);
BEGIN
    IF TG_TABLE_NAME = 'fefo_inventory_batches' THEN
        record_uuid := COALESCE(NEW.batch_id, OLD.batch_id);
    ELSIF TG_TABLE_NAME = 'fefo_products' THEN
        record_uuid := COALESCE(NEW.product_id, OLD.product_id);
    ELSE
        record_uuid := uuid_generate_v4();
    END IF;

    act_type := TG_OP;

    IF TG_OP = 'UPDATE' THEN
        -- Evaluate Critical change
        IF TG_TABLE_NAME = 'fefo_inventory_batches' AND OLD.expiry_date IS DISTINCT FROM NEW.expiry_date THEN
            is_critical := true;
        END IF;

        -- Check soft delete
        IF NEW.is_deleted = true AND OLD.is_deleted = false THEN
            act_type := 'SOFT_DELETE';
        END IF;

        INSERT INTO fefo_audit_logs (table_name, record_id, action_type, old_value, new_value, is_critical_change)
        VALUES (TG_TABLE_NAME, record_uuid, act_type, row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, is_critical);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO fefo_audit_logs (table_name, record_id, action_type, old_value, new_value)
        VALUES (TG_TABLE_NAME, record_uuid, act_type, row_to_json(OLD)::jsonb, NULL);
        RETURN OLD;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO fefo_audit_logs (table_name, record_id, action_type, old_value, new_value)
        VALUES (TG_TABLE_NAME, record_uuid, act_type, NULL, row_to_json(NEW)::jsonb);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE 'plpgsql';

CREATE TRIGGER trg_fefo_audit_batches AFTER INSERT OR UPDATE OR DELETE ON fefo_inventory_batches FOR EACH ROW EXECUTE FUNCTION fefo_audit_trigger_func();
CREATE TRIGGER trg_fefo_audit_products AFTER INSERT OR UPDATE OR DELETE ON fefo_products FOR EACH ROW EXECUTE FUNCTION fefo_audit_trigger_func();

COMMIT;
