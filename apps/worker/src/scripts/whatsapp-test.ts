// Standalone WhatsApp test-send script.
//
// Bypasses the 5-minute dispatch sweep so you can immediately verify that the
// token, phone number, and a given template all work together before enrolling
// a real customer.
//
// Usage:
//   npx tsx apps/worker/src/scripts/whatsapp-test.ts <phone> [template_name]
//
// Examples:
//   npx tsx apps/worker/src/scripts/whatsapp-test.ts 9876543210
//   npx tsx apps/worker/src/scripts/whatsapp-test.ts 9876543210 scheme_enrollment
//
// The phone number can be 10 digits (prepends WHATSAPP_DEFAULT_COUNTRY_CODE),
// 12 digits (used as-is), or E.164 with leading + (stripped).
//
// Loads env from: apps/worker/.env (then root .env as fallback via dotenv).

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// TS: load worker .env first, fall back to root .env
const workerEnvPath = path.resolve(__dirname, '../../.env');
const rootEnvPath   = path.resolve(__dirname, '../../../../.env');

if (fs.existsSync(workerEnvPath)) {
  dotenv.config({ path: workerEnvPath });
}
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath, override: false });
}

// ── Config ─────────────────────────────────────────────────────────────────────

const PHONE_NUMBER_ID  = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN     = process.env.WHATSAPP_ACCESS_TOKEN;
const API_VERSION      = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
const COUNTRY_CODE     = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? '91';

// ── Args ───────────────────────────────────────────────────────────────────────

const rawPhone    = process.argv[2];
const templateArg = process.argv[3] ?? 'hello_world';

if (!rawPhone) {
  console.error('Usage: npx tsx apps/worker/src/scripts/whatsapp-test.ts <phone> [template_name]');
  process.exit(1);
}

// ── Phone normalisation ───────────────────────────────────────────────────────

function normalizePhone(raw: string, countryCode: string): string {
  // TS: strip the leading + if the user typed E.164 form
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `${countryCode}${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `${countryCode}${digits.slice(1)}`;
  // TS: 12-digit number already has the country code
  return digits;
}

const phone = normalizePhone(rawPhone, COUNTRY_CODE);

// ── Guard ──────────────────────────────────────────────────────────────────────

if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
  console.error(
    '❌  Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN.\n' +
    '   Check apps/worker/.env — both must be set.'
  );
  process.exit(1);
}

// ── Sample message bodies ─────────────────────────────────────────────────────
// TS: maps event/template names to sample plain-text message bodies for testing

const SAMPLE_MESSAGES: Record<string, string> = {
  enrollment:        'Hi Test Customer, your enrollment in Gold Savings Scheme for ₹5000 on 22 Jun 2026 is confirmed. Welcome to Agilavetri PrimeTech! 🎉',
  renewal:           'Hi Test Customer, we received your Gold Savings Scheme payment of ₹5000 for month 3 on 22 Jun 2026. Thank you! 🙏',
  scheme_enrollment: 'Hi Test Customer, your enrollment in Gold Savings Scheme for ₹5000 on 22 Jun 2026 is confirmed. Welcome to Agilavetri PrimeTech! 🎉',
  scheme_renewal:    'Hi Test Customer, we received your Gold Savings Scheme payment of ₹5000 for month 3 on 22 Jun 2026. Thank you! 🙏',
  hello_world:       'Hello! This is a test message from Agilavetri PrimeTech.',
};

// ── Send ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const messageBody = SAMPLE_MESSAGES[templateArg]
    ?? `Hello! Test message for event type "${templateArg}" from Agilavetri PrimeTech.`;

  const url = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  // TS: send as free-form text (no template needed)
  const body = {
    messaging_product: 'whatsapp',
    to:                phone,
    type:              'text',
    text: {
      preview_url: false,
      body:        messageBody,
    },
  };

  console.log(`\n📱 WhatsApp test-send (free-form text)`);
  console.log(`   Event : ${templateArg}`);
  console.log(`   To    : +${phone}`);
  console.log(`   Body  : ${messageBody}`);
  console.log(`   URL      : ${url}`);
  console.log('');

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  // TS: always parse the full response body for diagnostics
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  if (res.ok) {
    console.log('✅ SUCCESS — Meta accepted the message:');
    console.log(JSON.stringify(parsed, null, 2));
  } else {
    console.error(`❌ FAILED (HTTP ${res.status}) — Meta response:`);
    console.error(JSON.stringify(parsed, null, 2));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
