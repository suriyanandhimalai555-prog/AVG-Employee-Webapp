-- Performance indexes for the recursive hierarchy CTE and attendance lookups.
-- All use CREATE INDEX IF NOT EXISTS so re-running is safe (idempotent).

-- Speeds up the recursive CTE that walks manager_id chains for subtree resolution
CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users(manager_id);

-- Speeds up branch-scoped queries (branch admin scope, oversight JOIN)
CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id);

-- Composite index used by attendance list, history, and summary queries
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);

-- Speeds up per-branch attendance summary aggregations
CREATE INDEX IF NOT EXISTS idx_attendance_branch_date ON attendance(branch_id, date);

-- Speeds up oversight scope lookups (user_oversight_branches JOIN)
CREATE INDEX IF NOT EXISTS idx_user_oversight_branches_user_id ON user_oversight_branches(user_id);
CREATE INDEX IF NOT EXISTS idx_user_oversight_branches_branch_id ON user_oversight_branches(branch_id);
