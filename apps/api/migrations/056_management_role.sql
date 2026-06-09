-- Migration 056: Add 'management' role for historical / backdated data entry.
--
-- The management account is a single system-seeded account (like MD) that
-- sits outside the org-chart hierarchy. It can write to any branch's scheme
-- data without an attendance or reporting constraint.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'md', 'director', 'gm', 'branch_manager', 'abm',
    'sales_officer', 'branch_admin', 'oa', 'client', 'management'
  ));
