-- Migration 058: Promote Chit packages from hardcoded TypeScript to a DB table.
--
-- Previously CHIT_PACKAGES was a plain object in chit.schema.ts.
-- Moving it to the DB lets the Management Control Center edit package amounts.
-- Existing chit groups are unaffected — amounts are denormalised at group-creation time.

CREATE TABLE IF NOT EXISTS chit_packages (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  package_number INTEGER       NOT NULL UNIQUE CHECK (package_number BETWEEN 1 AND 5),
  -- Months 1–10: full monthly payment amount
  full_amount    NUMERIC(12,2) NOT NULL CHECK (full_amount > 0),
  -- Months 11–20: half monthly payment amount
  half_amount    NUMERIC(12,2) NOT NULL CHECK (half_amount > 0),
  is_active      BOOLEAN       NOT NULL DEFAULT true,
  updated_at     TIMESTAMPTZ   DEFAULT now()
);

-- Seed from the current hardcoded values — idempotent
INSERT INTO chit_packages (package_number, full_amount, half_amount)
VALUES
  (1,  5000,  2500),
  (2, 10000,  5000),
  (3, 15000,  7500),
  (4, 20000, 10000),
  (5, 25000, 12500)
ON CONFLICT (package_number) DO UPDATE
  SET full_amount = EXCLUDED.full_amount,
      half_amount = EXCLUDED.half_amount,
      updated_at  = now();
