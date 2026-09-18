-- Distinguish auto-shifted X+1 rows from rows set explicitly by management.
-- When management sets month X, the service writes X+1's start as a side-effect
-- (auto-shift).  Resetting X should only cascade-delete that companion row, not
-- an independently-configured X+1 override.  is_auto_shifted = TRUE marks the
-- companion; = FALSE marks an explicit management-set period.
ALTER TABLE period_overrides
  ADD COLUMN IF NOT EXISTS is_auto_shifted BOOLEAN NOT NULL DEFAULT FALSE;
