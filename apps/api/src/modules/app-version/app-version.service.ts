// Service layer for the mobile app version gate config.
// Reads from / writes to the singleton mobile_app_versions table (migration 081).
// GET is called publicly (no auth); PATCH is management-only via the route layer.
import { Pool } from 'pg';
import { AppVersionPatch, AppVersionConfig } from './app-version.schema';

// TS: default row returned when the table exists but somehow has no seed row
// (should not happen post-migration, but keeps the public GET safe at all times).
const DEFAULT_CONFIG: AppVersionConfig = {
  androidCurrentVersion: '1.0.0',
  androidMinimalVersion: '1.0.0',
  iosCurrentVersion:     '1.0.0',
  iosMinimalVersion:     '1.0.0',
  forceUpdate:           false,
  releaseNotes:          null,
  updatedAt:             new Date().toISOString(),
};

// TS: map a raw DB row (snake_case) to the camelCase shape the API returns
function rowToConfig(row: Record<string, unknown>): AppVersionConfig {
  return {
    androidCurrentVersion: row.android_current_version as string,
    androidMinimalVersion: row.android_minimal_version as string,
    iosCurrentVersion:     row.ios_current_version     as string,
    iosMinimalVersion:     row.ios_minimal_version     as string,
    forceUpdate:           row.force_update            as boolean,
    releaseNotes:          row.release_notes           as string | null,
    // TS: TIMESTAMPTZ comes back as a JS Date from pg — serialise to ISO string
    updatedAt:             (row.updated_at as Date).toISOString(),
  };
}

export const AppVersionService = {

  // GET /app-version — public, reads the singleton config row.
  // Returns sane defaults if the row is somehow absent (first boot before seed).
  async getConfig(db: Pool): Promise<AppVersionConfig> {
    const res = await db.query(
      `SELECT android_current_version, android_minimal_version,
              ios_current_version, ios_minimal_version,
              force_update, release_notes, updated_at
       FROM mobile_app_versions
       WHERE id = 1`
    );
    if (res.rows.length === 0) return DEFAULT_CONFIG;
    return rowToConfig(res.rows[0]);
  },

  // PATCH /app-version — management-only, partial-merge update.
  // Migration 081 always seeds row 1, so a plain UPDATE is safe.
  // COALESCE keeps the existing column value for any field absent from the patch,
  // so callers can flip just force_update without resending the version strings.
  // (INSERT...ON CONFLICT was avoided here: the INSERT half evaluates all column
  // values before the conflict check, which triggers NOT NULL violations on the
  // TEXT columns when only a boolean patch is sent.)
  async updateConfig(
    db: Pool,
    patch: AppVersionPatch,
    userId: string
  ): Promise<AppVersionConfig> {
    const res = await db.query(
      `UPDATE mobile_app_versions SET
         android_current_version = COALESCE($1, android_current_version),
         android_minimal_version = COALESCE($2, android_minimal_version),
         ios_current_version     = COALESCE($3, ios_current_version),
         ios_minimal_version     = COALESCE($4, ios_minimal_version),
         force_update            = COALESCE($5, force_update),
         release_notes           = COALESCE($6, release_notes),
         updated_by              = $7,
         updated_at              = now()
       WHERE id = 1
       RETURNING android_current_version, android_minimal_version,
                 ios_current_version, ios_minimal_version,
                 force_update, release_notes, updated_at`,
      [
        patch.androidCurrentVersion ?? null,
        patch.androidMinimalVersion ?? null,
        patch.iosCurrentVersion     ?? null,
        patch.iosMinimalVersion     ?? null,
        // TS: boolean | undefined — COALESCE needs null, not undefined, in pg params
        patch.forceUpdate  !== undefined ? patch.forceUpdate  : null,
        patch.releaseNotes !== undefined ? patch.releaseNotes : null,
        userId,
      ]
    );
    return rowToConfig(res.rows[0]);
  },
};
