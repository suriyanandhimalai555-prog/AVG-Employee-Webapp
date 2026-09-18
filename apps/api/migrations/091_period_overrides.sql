-- Configurable business-month boundaries.
--
-- The default 7-to-6 period (7th of one month → 6th of the next) is
-- preserved as the fallback when no row is present for a given period.
-- Management can override any month by storing a custom_start here;
-- a period's end is derived as (next period's custom_start - 1 day),
-- so contiguity is always structural — no gaps or overlaps are possible.
--
-- period_key is the canonical default start (YYYY-MM-07) used as the PK.
-- Editing month X's start+end writes two rows in one transaction:
--   row for X    → new startDate
--   row for X+1  → endDate + 1 day  (auto-shifts the neighbor)
--
-- Idempotent: IF NOT EXISTS throughout, no seed rows.

CREATE TABLE IF NOT EXISTS period_overrides (
  -- Canonical default start of the period being overridden (e.g. 2026-05-07)
  period_key   DATE PRIMARY KEY,
  -- Actual custom start management set for this period (e.g. 2026-05-08)
  custom_start DATE NOT NULL,
  -- Who made the last change (FK to users; nullable to survive a soft-delete)
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
