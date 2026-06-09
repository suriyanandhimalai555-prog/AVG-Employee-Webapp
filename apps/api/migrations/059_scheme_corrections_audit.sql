-- Unified audit trail for scheme data corrections and voids.
-- Every PATCH /*/correct and PATCH /*/void writes one row here so management
-- always has a paper trail of who changed what, when, and what the old value was.
-- Land's own audit table (land_audit_log) is kept as-is; this is additive.

CREATE TABLE IF NOT EXISTS scheme_corrections_audit (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_code   TEXT        NOT NULL,
  entity_type   TEXT        NOT NULL,  -- 'member' | 'payment' | 'plan' | 'payout' | 'slot' | 'booking'
  entity_id     UUID        NOT NULL,
  actor_id      UUID        NOT NULL REFERENCES users(id),
  action        TEXT        NOT NULL CHECK (action IN ('edit', 'void')),
  old_values    JSONB,
  new_values    JSONB,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON scheme_corrections_audit (scheme_code, entity_id);
CREATE INDEX ON scheme_corrections_audit (actor_id);
CREATE INDEX ON scheme_corrections_audit (created_at DESC);
