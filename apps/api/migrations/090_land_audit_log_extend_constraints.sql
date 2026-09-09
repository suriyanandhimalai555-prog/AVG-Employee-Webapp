-- 090_land_audit_log_extend_constraints.sql
-- Extends land_audit_log CHECK constraints to accept 'layout' as an entity
-- and 'delete' as an action — required by the hard-delete paths in
-- land-sites.service.ts (deleteSite, deleteLayout, deletePlot).
--
-- Migration 050 created the table with inline column-level CHECKs, which
-- Postgres auto-named land_audit_log_entity_check and land_audit_log_action_check.
-- We drop them (IF EXISTS for idempotency) and recreate with the extended sets.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'land_audit_log'::regclass
      AND conname = 'land_audit_log_entity_check'
  ) THEN
    ALTER TABLE land_audit_log DROP CONSTRAINT land_audit_log_entity_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'land_audit_log'::regclass
      AND conname = 'land_audit_log_action_check'
  ) THEN
    ALTER TABLE land_audit_log DROP CONSTRAINT land_audit_log_action_check;
  END IF;
END $$;

ALTER TABLE land_audit_log
  ADD CONSTRAINT IF NOT EXISTS land_audit_log_entity_check
  CHECK (entity IN ('site', 'layout', 'plot', 'customer', 'booking', 'payout'));

ALTER TABLE land_audit_log
  ADD CONSTRAINT IF NOT EXISTS land_audit_log_action_check
  CHECK (action IN (
    'create', 'update', 'cancel', 'delete',
    'advance_payment', 'full_payment',
    'deadline_extended', 'payout_paid'
  ));
