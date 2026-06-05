-- Migration 053: Land Sales — use shared customers table.
--
-- The land_bookings.customer_id FK was pointing to land_customers.
-- This corrects it to reference the shared customers table used by all other schemes,
-- then drops the unused land_customers table.
-- Assumes land_bookings is empty (dev only; no live data to migrate).

-- Step 1: Drop the FK constraint and the column referencing land_customers
ALTER TABLE land_bookings DROP CONSTRAINT IF EXISTS land_bookings_customer_id_fkey;
ALTER TABLE land_bookings DROP COLUMN IF EXISTS customer_id;

-- Step 2: Re-add customer_id referencing the shared customers table
ALTER TABLE land_bookings
  ADD COLUMN customer_id UUID NOT NULL REFERENCES customers(id);

CREATE INDEX IF NOT EXISTS idx_land_bookings_customer ON land_bookings(customer_id);

-- Step 3: Drop the now-unused land_customers table
DROP TABLE IF EXISTS land_customers;
