-- 004_user_oversight_branches.sql
-- Directors and GMs can oversee multiple branches that are not in their
-- direct manager_id chain. This table records those extra-hierarchy assignments.

CREATE TABLE user_oversight_branches (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, branch_id)
);

-- Fast lookup: all branches a Director/GM oversees
CREATE INDEX idx_oversight_user   ON user_oversight_branches(user_id);
-- Fast lookup: all Directors/GMs overseeing a branch
CREATE INDEX idx_oversight_branch ON user_oversight_branches(branch_id);
