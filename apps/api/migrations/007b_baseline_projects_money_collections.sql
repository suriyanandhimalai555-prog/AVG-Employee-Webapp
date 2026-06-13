-- Migration 007b: Baseline for projects + money_collections.
--
-- These two tables were created by hand on the original database and were
-- never captured in a migration — yet migration 008 ALTERs money_collections,
-- 016/017 reference projects(id), and the money/incentive services depend on
-- both. A fresh database therefore could not be bootstrapped from the
-- migration set at all.
--
-- This file recreates them exactly as the code uses them. It is numbered 007b
-- so it sorts after 001-007 (users/branches must exist for the FKs) and before
-- 008 (the first file that ALTERs money_collections).
--
-- On the existing database every statement is a no-op (IF NOT EXISTS); the
-- runner simply records the file. Columns added by later migrations
-- (008: override_branch_id/notes/idempotency_key, 009: reference_number,
-- 026: projects.code) are deliberately NOT included here — those migrations
-- run afterwards and add them, keeping the history linear.

-- ─── projects ────────────────────────────────────────────────────────────────
-- Scheme/collection registry. One row per money project or scheme; the stable
-- `code` column is added by migration 026.

CREATE TABLE IF NOT EXISTS projects (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(200) NOT NULL UNIQUE,
  is_active  BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ  DEFAULT now()
);

-- ─── money_collections ───────────────────────────────────────────────────────
-- One row per field collection submitted by an employee, verified by their
-- manager. mode='cash_transfer' rows are grouped forwards of held cash
-- (source_collection_ids points at the originals; is_forwarded flags them).

CREATE TABLE IF NOT EXISTS money_collections (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID          NOT NULL REFERENCES users(id),
  project_id            UUID          NOT NULL REFERENCES projects(id),
  amount                NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  mode                  VARCHAR(20)   NOT NULL
                        CHECK (mode IN ('cash', 'gpay', 'bank_receipt', 'cash_transfer')),
  client_name           VARCHAR(200),
  client_phone          VARCHAR(20),
  photo_key             TEXT,
  assigned_verifier_id  UUID          REFERENCES users(id),
  status                VARCHAR(20)   NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_note        TEXT,
  verified_at           TIMESTAMPTZ,
  -- true once this (cash) collection has been bundled into a cash_transfer
  is_forwarded          BOOLEAN       NOT NULL DEFAULT false,
  -- for mode='cash_transfer': the original collection rows this transfer bundles
  source_collection_ids UUID[],
  submitted_at          TIMESTAMPTZ   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_money_collections_user
  ON money_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_money_collections_project
  ON money_collections(project_id);
CREATE INDEX IF NOT EXISTS idx_money_collections_status
  ON money_collections(status);
CREATE INDEX IF NOT EXISTS idx_money_collections_verifier
  ON money_collections(assigned_verifier_id)
  WHERE assigned_verifier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_money_collections_submitted
  ON money_collections(submitted_at DESC);
