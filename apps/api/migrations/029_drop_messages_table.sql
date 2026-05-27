-- Migration 029: Drop the unused messages table.
--
-- The messages table was created in migration 003 alongside transactions, when
-- internal messaging was part of the planned scope. It was never wired up:
--   - no service file
--   - no routes
--   - no frontend reference
--   - zero rows ever written
-- Removing it keeps the schema honest. If a messaging feature is added later,
-- it will be designed from the requirements that exist then.

DROP TABLE IF EXISTS messages;
