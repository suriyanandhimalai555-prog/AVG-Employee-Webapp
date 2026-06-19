// App-level settings stored in the app_settings key/value table.
// Flags:
//   backdated_entry_enabled             — branch admins may enter past-dated scheme data
//   whatsapp_messages_enabled           — WhatsApp notifications are sent to customers
//   lss_eligibility_bypass_enabled      — skip the 30-day draw wait for LSS
//   gold_coin_eligibility_bypass_enabled — skip the 30-day draw wait for Gold-Coin
//
// Flags are read via their guard helpers so enforcement and the settings endpoint always agree.
import { Pool } from 'pg';
import { BACKDATED_ENTRY_KEY, isBackdatedEntryEnabled } from '../../shared/backdate-guard';
import { WHATSAPP_MESSAGES_KEY, isWhatsappMessagesEnabled } from '../../shared/whatsapp-guard';
import {
  LSS_ELIGIBILITY_BYPASS_KEY,
  GOLD_COIN_ELIGIBILITY_BYPASS_KEY,
  isEligibilityBypassEnabled,
} from '../../shared/eligibility-bypass-guard';

export const SettingsService = {

  // ─── Backdated-entry ─────────────────────────────────────────────────────────

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

  // ─── WhatsApp messages ───────────────────────────────────────────────────────

  // Read the whatsapp-messages flag (shared reader mirrors backdate pattern).
  async getWhatsappMessages(db: Pool): Promise<{ enabled: boolean }> {
    const enabled = await isWhatsappMessagesEnabled(db);
    return { enabled };
  },

  // Flip the whatsapp-messages flag. Management enables once Meta setup is done.
  // TS: updatedBy stored on the row for audit trail
  async setWhatsappMessages(
    db: Pool,
    enabled: boolean,
    updatedBy: string
  ): Promise<{ enabled: boolean }> {
    await db.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [WHATSAPP_MESSAGES_KEY, JSON.stringify(enabled), updatedBy]
    );
    return { enabled };
  },

  // ─── LSS eligibility bypass ──────────────────────────────────────────────────

  // Read whether the LSS 30-day draw eligibility wait is bypassed.
  async getLssEligibilityBypass(db: Pool): Promise<{ enabled: boolean }> {
    const enabled = await isEligibilityBypassEnabled(db, LSS_ELIGIBILITY_BYPASS_KEY);
    return { enabled };
  },

  // Flip the LSS bypass. ON lets draws run on any slot regardless of age.
  // TS: updatedBy stored on the row for audit trail
  async setLssEligibilityBypass(
    db: Pool,
    enabled: boolean,
    updatedBy: string
  ): Promise<{ enabled: boolean }> {
    await db.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [LSS_ELIGIBILITY_BYPASS_KEY, JSON.stringify(enabled), updatedBy]
    );
    return { enabled };
  },

  // ─── Gold-Coin eligibility bypass ────────────────────────────────────────────

  // Read whether the Gold-Coin 30-day draw eligibility wait is bypassed.
  async getGoldCoinEligibilityBypass(db: Pool): Promise<{ enabled: boolean }> {
    const enabled = await isEligibilityBypassEnabled(db, GOLD_COIN_ELIGIBILITY_BYPASS_KEY);
    return { enabled };
  },

  // Flip the Gold-Coin bypass. ON lets draws run on any slot regardless of age.
  // TS: updatedBy stored on the row for audit trail
  async setGoldCoinEligibilityBypass(
    db: Pool,
    enabled: boolean,
    updatedBy: string
  ): Promise<{ enabled: boolean }> {
    await db.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [GOLD_COIN_ELIGIBILITY_BYPASS_KEY, JSON.stringify(enabled), updatedBy]
    );
    return { enabled };
  },
};
