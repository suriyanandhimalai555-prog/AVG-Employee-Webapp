-- Migration 046: Register the Builders Scheme in the projects table.
--
-- The projects table is provisioned by the money-module bootstrap (not a numbered
-- migration). This seed follows the same pattern as 038_lss_seed.sql and
-- 040_agila_chit_seed.sql: a single idempotent INSERT ON CONFLICT DO NOTHING.
-- The stable code 'builders_scheme' must match BuildersService.schemeCode in
-- apps/api/src/modules/builders/builders.service.ts.

INSERT INTO projects (name, code)
VALUES ('Builders', 'builders_scheme')
ON CONFLICT (code) DO NOTHING;
