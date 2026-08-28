-- Migration 087: Land booking earner snapshot table
-- Freezes the earner chain (referrer → ABM → BM → GM) at the time a land booking
-- is created, alongside the role each person held at that moment.
-- distributeMonthly reads from this table instead of re-walking manager_id,
-- so transferred/promoted employees keep their earned monthly commission tier.

CREATE TABLE IF NOT EXISTS land_booking_earners (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES land_bookings(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id),
  -- role at enrollment time — determines which commission tier is applied each month
  role       VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_land_booking_earners_booking
  ON land_booking_earners (booking_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_land_booking_earners_booking_user
  ON land_booking_earners (booking_id, user_id);

-- Idempotent backfill: for every active booking that has a referrer but no snapshot
-- yet, replay the earner chain as-of-today (using current manager_id/role).
-- This cannot reconstruct the exact role held at original enrollment if the person has
-- since been promoted/transferred — such rows will continue with current-role resolution
-- until they receive a new booking. Documented as a known pre-migration limitation.
INSERT INTO land_booking_earners (booking_id, user_id, role)
SELECT DISTINCT ON (chain.booking_id, chain.user_id)
       chain.booking_id, chain.user_id, chain.role
FROM (
  WITH RECURSIVE earner_chain AS (
    SELECT
      lb.id AS booking_id,
      u.id  AS user_id,
      u.role,
      u.manager_id,
      1 AS depth
    FROM land_bookings lb
    JOIN users u ON u.id = lb.referrer_id
    WHERE lb.referrer_id IS NOT NULL
      AND lb.status NOT IN ('cancelled', 'refunded')
      AND NOT EXISTS (
        SELECT 1 FROM land_booking_earners lbe WHERE lbe.booking_id = lb.id
      )
      AND u.role IN ('sales_officer', 'abm', 'branch_manager', 'gm')
    UNION ALL
    SELECT
      ec.booking_id,
      u2.id,
      u2.role,
      u2.manager_id,
      ec.depth + 1
    FROM earner_chain ec
    JOIN users u2 ON u2.id = ec.manager_id
    WHERE ec.depth < 6
      AND u2.role IN ('sales_officer', 'abm', 'branch_manager', 'gm')
  )
  SELECT booking_id, user_id, role FROM earner_chain
) AS chain
ON CONFLICT (booking_id, user_id) DO NOTHING;
