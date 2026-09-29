-- Partial index for the transferred-referrer picker + guard query pattern:
-- WHERE previous_branch_id = $1 AND kind = 'transfer' AND status = 'approved'
-- Single-statement file to avoid the migration runner's multi-statement trap (GAPS.md #2).
CREATE INDEX IF NOT EXISTS idx_transfer_requests_prev_branch
  ON user_transfer_requests (previous_branch_id, user_id, decided_at)
  WHERE kind = 'transfer' AND status = 'approved';
