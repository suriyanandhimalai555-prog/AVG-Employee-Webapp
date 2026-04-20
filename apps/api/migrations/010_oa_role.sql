-- Migration 010: Add 'oa' (Operations Assistant) role
-- OA is a standalone per-branch role like branch_admin — no manager_id chain above them.
-- SOs can be assigned under OA via manager_id = OA.id.

-- Drop the existing check constraint and recreate it with 'oa' included.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'md', 'director', 'gm', 'branch_manager',
    'abm', 'sales_officer', 'client', 'branch_admin', 'oa'
  ));
