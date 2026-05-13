-- Migration 020: Central customers table
--
-- Scheme members (gold, trading academy, future schemes) are all the same
-- entity: a customer of the business. This migration:
--   1. Creates the customers table with auto-generated customer_code
--   2. Adds customer_id FK to both scheme tables
--   3. Drops the now-redundant name/phone/address columns from scheme tables
--   4. Removes client_code from users (clients are now customers)

-- ─── 1. customers table ───────────────────────────────────────────────────────
CREATE TABLE customers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code VARCHAR(20) UNIQUE NOT NULL,
  branch_id     UUID NOT NULL REFERENCES branches(id),
  name          VARCHAR(255) NOT NULL,
  phone         VARCHAR(20),
  address       TEXT,
  notes         TEXT,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_customers_branch ON customers(branch_id);
CREATE INDEX idx_customers_code   ON customers(customer_code);
-- GIN index on name for fast ILIKE search
CREATE INDEX idx_customers_name   ON customers USING gin(to_tsvector('simple', name));

-- ─── 2. Link scheme tables to customers ──────────────────────────────────────
ALTER TABLE trading_academy_members ADD COLUMN customer_id UUID REFERENCES customers(id);
ALTER TABLE gold_scheme_members     ADD COLUMN customer_id UUID REFERENCES customers(id);

-- ─── 3. Drop redundant denormalized member columns ───────────────────────────
-- (safe: no production data yet; the customer record carries name/phone/address)
ALTER TABLE trading_academy_members
  DROP COLUMN member_name,
  DROP COLUMN member_phone,
  DROP COLUMN member_address;

ALTER TABLE gold_scheme_members
  DROP COLUMN member_name,
  DROP COLUMN member_phone,
  DROP COLUMN member_address;

-- ─── 4. Remove client_code from users ────────────────────────────────────────
-- client_code now lives on customers.customer_code
ALTER TABLE users DROP COLUMN IF EXISTS client_code;
