-- Migration 015: Employee incentive wallet
-- Each row is a credit entry. Wallet balance = SUM(amount) per user_id.
-- source_id is a polymorphic pointer (money_collections.id or gold_scheme_members.id)
-- source_description is denormalised so the UI can render without extra joins

CREATE TABLE IF NOT EXISTS employee_incentives (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id),
  amount             NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  source_type        VARCHAR(30) NOT NULL
                     CHECK (source_type IN ('collection', 'gold_scheme', 'direct_cash', 'other')),
  source_id          UUID,           -- optional pointer; no FK (polymorphic)
  source_description TEXT,           -- human-readable: "Collection from Ravi Kumar – ₹5,000"
  credited_by        UUID NOT NULL REFERENCES users(id),
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incentives_user
  ON employee_incentives(user_id);

CREATE INDEX IF NOT EXISTS idx_incentives_created
  ON employee_incentives(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_incentives_source
  ON employee_incentives(source_type, source_id);
