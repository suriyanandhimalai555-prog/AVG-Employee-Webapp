-- 007_attendance_nullable_branch.sql
-- Directors and GMs have no home branch (users.branch_id IS NULL).
-- Their auto-absent and self-check-in records must be stored with
-- branch_id = NULL so they don't leak into any single branch's scope.

ALTER TABLE attendance ALTER COLUMN branch_id DROP NOT NULL;
