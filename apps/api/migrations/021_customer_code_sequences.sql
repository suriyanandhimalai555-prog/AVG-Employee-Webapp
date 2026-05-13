-- Migration 021: Atomic customer code generation
--
-- Replaces the MAX()+1 pattern (which has a race condition under concurrent inserts)
-- with a dedicated sequence table. Each branch gets one row. The counter is
-- incremented atomically via UPDATE...RETURNING, so two concurrent inserts always
-- get different numbers — no locks, no gaps, no duplicates.

CREATE TABLE customer_code_sequences (
  branch_id UUID    PRIMARY KEY REFERENCES branches(id),
  last_seq  INTEGER NOT NULL DEFAULT 0
);

-- Seed one row per existing branch so the first INSERT...ON CONFLICT works
-- correctly for branches that already have customers.
-- We derive the starting value from the highest existing code for that branch.
INSERT INTO customer_code_sequences (branch_id, last_seq)
SELECT
  b.id,
  COALESCE(
    MAX(CAST(SUBSTRING(c.customer_code, length(b.client_prefix) + 1) AS INTEGER))
    FILTER (WHERE c.customer_code ~ ('^' || b.client_prefix || '[0-9]+$')),
    0
  )
FROM branches b
LEFT JOIN customers c ON c.branch_id = b.id
GROUP BY b.id
ON CONFLICT (branch_id) DO NOTHING;
