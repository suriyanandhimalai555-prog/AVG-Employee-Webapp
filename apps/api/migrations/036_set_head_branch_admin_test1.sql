-- Migration 036: Set test1@gmail.com as branch_admin of the head branch.
--
-- Two things must be true for a user to pass assertHeadBranchAdmin() in
-- the gold-coin combine/refund/extend routes:
--   1. users.role = 'branch_admin'
--   2. branches.is_head_branch = true  (for their branch_id)
--
-- This migration ensures both conditions hold for test1@gmail.com.
-- Their branch is also marked as is_head_branch so cross-branch gold-coin
-- operations (combine / refund / extend) are available to them.
--
-- Idempotent: safe to re-run.

DO $$
DECLARE
  v_user_id   UUID;
  v_branch_id UUID;
BEGIN
  -- Resolve the user
  SELECT id, branch_id
    INTO v_user_id, v_branch_id
    FROM users
   WHERE email = 'test1@gmail.com'
   LIMIT 1;

  -- Skip gracefully on databases where this environment-specific user does not
  -- exist (fresh/local bootstraps). Raising an exception here used to abort the
  -- whole migration run, making the schema impossible to build from scratch.
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User test1@gmail.com not found — skipping head-branch admin setup';
    RETURN;
  END IF;

  IF v_branch_id IS NULL THEN
    RAISE NOTICE 'User test1@gmail.com has no branch assigned — skipping head-branch admin setup';
    RETURN;
  END IF;

  -- Ensure branch_admin role
  UPDATE users
     SET role = 'branch_admin'
   WHERE id = v_user_id
     AND role <> 'branch_admin';

  -- Mark their branch as the head branch
  UPDATE branches
     SET is_head_branch = true
   WHERE id = v_branch_id;

  -- Link as the branch's admin_id so the branch knows its admin
  UPDATE branches
     SET admin_id = v_user_id
   WHERE id = v_branch_id
     AND admin_id IS DISTINCT FROM v_user_id;

  RAISE NOTICE 'Done — user % (branch %) is now head-branch admin', v_user_id, v_branch_id;
END $$;
