-- Migration 060: Extend scheme_corrections_audit action CHECK to include
-- 'unpay' (delete a recorded payment + claw back its incentive) and
-- 'remove' (remove a member/slot from a room with incentive reversal).
--
-- Safe to re-run: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT is idempotent.

ALTER TABLE scheme_corrections_audit
  DROP CONSTRAINT IF EXISTS scheme_corrections_audit_action_check;

ALTER TABLE scheme_corrections_audit
  ADD CONSTRAINT scheme_corrections_audit_action_check
  CHECK (action IN ('edit', 'void', 'unpay', 'remove'));

-- Also widen the entity_type column to allow 'room' (for voidRoom audit entries).
-- No CHECK exists on entity_type — it's free-text — so no constraint change needed.
