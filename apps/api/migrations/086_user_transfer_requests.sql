-- Migration 086: User transfer/promotion requests
-- Adds a staging table for employee promotion and inter-branch transfers.
-- Requests are submitted by branch managers/GMs/branch-admins and approved
-- (or rejected) by MD/Management before any users row is mutated.
-- This table is the complete audit trail: who requested, who decided, when, and
-- the before/after position snapshot.

CREATE TABLE IF NOT EXISTS user_transfer_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id),
  kind                 VARCHAR(20) NOT NULL CHECK (kind IN ('promotion', 'transfer')),
  -- proposed target position
  new_role             VARCHAR(20) NOT NULL,
  new_branch_id        UUID REFERENCES branches(id),
  new_manager_id       UUID REFERENCES users(id),
  replacement_manager_id UUID REFERENCES users(id),    -- inherits the old team when needed
  reason               TEXT,
  -- snapshot of the FROM position, filled at approval time
  previous_role        VARCHAR(20),
  previous_branch_id   UUID,
  previous_manager_id  UUID,
  -- lifecycle
  status               VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by         UUID NOT NULL REFERENCES users(id),
  decided_by           UUID REFERENCES users(id),
  decided_at           TIMESTAMPTZ,
  decision_note        TEXT,
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- Partial index for the management pending inbox
CREATE INDEX IF NOT EXISTS idx_transfer_requests_pending
  ON user_transfer_requests (created_at DESC)
  WHERE status = 'pending';

-- Index for per-user history
CREATE INDEX IF NOT EXISTS idx_transfer_requests_user
  ON user_transfer_requests (user_id, created_at DESC);
