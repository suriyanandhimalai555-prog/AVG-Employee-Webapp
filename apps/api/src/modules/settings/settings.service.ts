// App-level settings stored in the app_settings key/value table.
// Currently a single flag: backdated_entry_enabled (see shared/backdate-guard.ts
// for where it is enforced).
import { Pool } from 'pg';
import { BACKDATED_ENTRY_KEY, isBackdatedEntryEnabled } from '../../shared/backdate-guard';

export const SettingsService = {

  // Read the backdated-entry flag (shared reader so the guard and the
  // settings endpoint can never disagree).
  async getBackdatedEntry(db: Pool): Promise<{ enabled: boolean }> {
    const enabled = await isBackdatedEntryEnabled(db);
    return { enabled };
  },

  // Flip the backdated-entry flag. Upserts so the row survives a missing seed.
  async setBackdatedEntry(
    db: Pool,
    enabled: boolean,
    updatedBy: string
  ): Promise<{ enabled: boolean }> {
    await db.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [BACKDATED_ENTRY_KEY, JSON.stringify(enabled), updatedBy]
    );
    return { enabled };
  },
};
