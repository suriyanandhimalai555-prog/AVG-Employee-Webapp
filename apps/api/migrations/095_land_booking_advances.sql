-- Migration 095: Land booking advances child table
-- Replaces the single scalar advance_* columns on land_bookings with a
-- proper 1-to-many child table so multiple partial advance payments can be
-- recorded against one booking.  The scalar land_bookings.advance_amount is
-- kept as a denormalised running total (= SUM of child rows) so every
-- existing reader continues to work without change.

CREATE TABLE IF NOT EXISTS land_booking_advances (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID        NOT NULL REFERENCES land_bookings(id) ON DELETE CASCADE,
  amount         NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  advance_date   DATE        NOT NULL,
  channel        VARCHAR(20) NOT NULL DEFAULT 'cash'
                               CHECK (channel IN ('cash', 'gpay', 'bank_receipt')),
  proof_key      TEXT[],
  transaction_id TEXT[],
  created_by     UUID        NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_land_booking_advances_booking
  ON land_booking_advances(booking_id);

-- Backfill existing single-advance bookings into the child table.
-- The NOT EXISTS guard makes this idempotent — re-running the migration
-- (possible when the runner marks a file applied after a partial failure,
-- see GAPS.md #2) will not insert duplicate rows.
INSERT INTO land_booking_advances
  (booking_id, amount, advance_date, channel, proof_key, transaction_id, created_by)
SELECT
  b.id,
  b.advance_amount,
  COALESCE(b.advance_date, b.booking_date),
  COALESCE(b.advance_channel, 'cash'),
  b.advance_proof_key,
  b.advance_transaction_id,
  b.created_by
FROM land_bookings b
WHERE b.advance_amount IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM land_booking_advances a WHERE a.booking_id = b.id
  );
