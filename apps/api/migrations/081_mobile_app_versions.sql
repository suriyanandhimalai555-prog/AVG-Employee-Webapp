-- Migration 081: Mobile App Versions
-- Singleton config table that lets Management control the native Android/iOS
-- app version gate: current/minimum versions, a force-update flag, and
-- release notes. Written by Management from the EMS admin UI; read (public,
-- no JWT) by the native app on every launch so outdated builds can be blocked.
--
-- Singleton is enforced by a fixed INTEGER PK (always 1) backed by a CHECK
-- constraint. Both statements are idempotent (IF NOT EXISTS / ON CONFLICT DO
-- NOTHING) to avoid the partial-skip trap described in GAPS.md #2.

CREATE TABLE IF NOT EXISTS mobile_app_versions (
  id                      INTEGER     PRIMARY KEY DEFAULT 1,
  android_current_version TEXT        NOT NULL DEFAULT '1.0.0',
  android_minimal_version TEXT        NOT NULL DEFAULT '1.0.0',
  ios_current_version     TEXT        NOT NULL DEFAULT '1.0.0',
  ios_minimal_version     TEXT        NOT NULL DEFAULT '1.0.0',
  force_update            BOOLEAN     NOT NULL DEFAULT false,
  release_notes           TEXT,
  updated_by              UUID        REFERENCES users(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mobile_app_versions_singleton CHECK (id = 1)
);

-- Seed the one config row so the public GET always returns a value even
-- before Management has made any explicit update.
INSERT INTO mobile_app_versions (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
