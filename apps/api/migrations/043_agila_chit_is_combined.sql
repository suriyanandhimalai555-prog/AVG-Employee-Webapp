-- Migration 043: Add is_combined flag to agila_chit_groups.
-- Mirrors the gold_coin_rooms.is_combined column pattern.
-- A combined group is one created by the head branch from two or more
-- pending_combine groups via ChitService.combineGroups.

ALTER TABLE agila_chit_groups
  ADD COLUMN IF NOT EXISTS is_combined BOOLEAN NOT NULL DEFAULT false;
