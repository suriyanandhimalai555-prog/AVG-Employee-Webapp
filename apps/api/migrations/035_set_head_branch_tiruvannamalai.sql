-- Migration 035: Mark Tiruvannamalai as the head branch.
--
-- The Gold Coin scheme routes combine / refund / extend operations to
-- branch admins of a branch where branches.is_head_branch = true (added in
-- migration 030 with default false). This migration flips that flag for
-- Tiruvannamalai so its branch admin can act on cross-branch pending_combine
-- rooms in production.
--
-- Idempotent: re-running just re-sets the flag to true. We leave other
-- branches untouched so additional head branches can be added later by
-- inserting a row to this table or running a follow-up migration.

UPDATE branches
SET is_head_branch = true
WHERE name = 'Tiruvannamalai';
