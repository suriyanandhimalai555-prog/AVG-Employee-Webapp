// Phone number normalization to E.164 format required by Meta WhatsApp Cloud API.
//
// customers.phone is a free VARCHAR(20) — Indian numbers are often stored as:
//   9876543210        (10 digits, no country code)
//   919876543210      (12 digits with country code, no +)
//   +919876543210     (E.164, already correct)
//   +91 98765 43210   (E.164 with spaces)
//   091-98765-43210   (0-prefixed with dashes)
//
// Meta rejects non-E.164 numbers silently — normalization happens here, once,
// in the worker, so scheme services stay unaware of the formatting detail.
import { env } from '../config/env';

/**
 * Normalize a raw phone string to E.164 (e.g. "919876543210" — no leading +).
 *
 * Meta Cloud API requires the number WITHOUT the leading "+"; just the digits.
 * Returns null when the input is empty or cannot be reduced to a plausible number.
 */
export function normalizeToE164(raw: string | null | undefined): string | null {
  if (!raw) return null;

  // Strip everything except digits
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 0) return null;

  const countryCode = env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? '91';

  // Already has the full country code prefix (e.g. 919876543210 = 12 digits for India)
  if (digits.startsWith(countryCode) && digits.length === countryCode.length + 10) {
    return digits;
  }

  // Leading zero (common in India: 09876543210) — strip the zero, prepend country code
  if (digits.startsWith('0') && digits.length === 11) {
    return `${countryCode}${digits.slice(1)}`;
  }

  // 10-digit local number (most common storage in this app)
  if (digits.length === 10) {
    return `${countryCode}${digits}`;
  }

  // Anything else: return as-is (may still be valid for non-IN numbers)
  return digits;
}
