DO $$
DECLARE con_name text;
BEGIN
  -- Drop any single-column UNIQUE constraint currently on booking_ref (name-agnostic).
  -- We look up by column position so the name auto-assigned by Postgres does not matter;
  -- this prevents the DROP from silently no-op-ing if the name differs from the default.
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'land_bookings'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 1
    AND conkey[1] = (SELECT attnum FROM pg_attribute
                     WHERE attrelid = 'land_bookings'::regclass AND attname = 'booking_ref');
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE land_bookings DROP CONSTRAINT %I', con_name);
  END IF;

  -- Add the branch-scoped composite unique if not already present.
  -- Existing rows trivially satisfy (branch_id, booking_ref) uniqueness because
  -- the old global unique already guaranteed booking_ref was unique across all rows.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'land_bookings'::regclass
      AND conname = 'land_bookings_branch_id_booking_ref_key'
  ) THEN
    ALTER TABLE land_bookings
      ADD CONSTRAINT land_bookings_branch_id_booking_ref_key UNIQUE (branch_id, booking_ref);
  END IF;
END $$;
