-- Migration 063: Extend scheme_corrections_audit action CHECK to include
-- 'delete' (permanent removal of an entry + its payments, with the full
-- before-state snapshotted into old_values so nothing is lost).
--
-- Safe to re-run: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT is idempotent.

ALTER TABLE scheme_corrections_audit
  DROP CONSTRAINT IF EXISTS scheme_corrections_audit_action_check;

ALTER TABLE scheme_corrections_audit
  ADD CONSTRAINT scheme_corrections_audit_action_check
  CHECK (action IN ('edit', 'void', 'unpay', 'remove', 'delete'));
