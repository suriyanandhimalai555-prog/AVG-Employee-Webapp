// frontend/src/lib/schemeConstants.js
// Scheme-domain constants. Kept separate from constants.js because scheme payment
// modes (gpay, bank_receipt) differ from the money-module modes (upi, bank) —
// merging them would break the existing money-module contract.

import {
  Gem, Building2, Landmark, CircleDollarSign, Layers,
  Briefcase, Banknote, MoreHorizontal, Coins, Wallet,
} from 'lucide-react';

// ─── Payment modes ────────────────────────────────────────────────────────────

export const SCHEME_PAYMENT_MODES = [
  { value: 'cash',         label: 'Cash' },
  { value: 'gpay',         label: 'GPay' },
  { value: 'bank_receipt', label: 'Bank' },
];

export const SCHEME_MODE_LABELS = {
  cash:         'Cash',
  gpay:         'GPay',
  bank_receipt: 'Bank',
};

export const SCHEME_MODE_STYLES = {
  cash:         'text-amber-600 bg-amber-50',
  gpay:         'text-indigo bg-indigo/10',
  bank_receipt: 'text-emerald-600 bg-emerald-50',
};

// ─── Gold scheme member statuses ──────────────────────────────────────────────

export const GOLD_STATUS_STYLES = {
  active:    'text-emerald-600 bg-emerald-50',
  completed: 'text-indigo bg-indigo/10',
  withdrawn: 'text-red-500 bg-red-50',
};

// ─── Role labels ──────────────────────────────────────────────────────────────

// Full labels used in the commission panel (includes scheme-specific pseudo-roles)
export const COMMISSION_ROLE_LABELS = {
  sales_officer:    'Sales Officer',
  abm:              'ABM',
  branch_manager:   'Branch Manager',
  gm:               'GM (Pillar)',
  branch_admin:     'Branch Admin',
  referrer_new:     'New enrollment',
  referrer_renewal: 'Renewal (month 2+)',
};

export const COMMISSION_ROLE_ORDER = [
  'sales_officer', 'abm', 'branch_manager', 'gm',
  'branch_admin', 'referrer_new', 'referrer_renewal',
];

// Abbreviated labels used in Trading Academy member cards
export const TRADING_ROLE_LABELS = {
  sales_officer:  'SO',
  abm:            'ABM',
  branch_manager: 'BM',
};

// ─── Referrer roles ───────────────────────────────────────────────────────────

// Roles that see "My Referrals" view instead of the full branch list.
// Mirrors the backend REFERRER_ONLY_ROLES (everyone in the chain below Management;
// branch_admin sees the full branch, md/management see the whole org).
export const REFERRER_ROLES = new Set([
  'director', 'gm', 'branch_manager', 'abm', 'sales_officer',
]);

// ─── Schemes hub ──────────────────────────────────────────────────────────────

// Maps project code (stable, never changes) to the frontend route.
// If a project is in this map its card navigates directly; otherwise it expands inline.
// Use project.code — never project.name — so admin renames don't break navigation.
export const NAVIGABLE_SCHEMES = {
  'gold_scheme':       '/money/schemes/gold',
  'trading_academy':   '/money/schemes/trading-academy',
  'gold_coin_scheme':  '/money/schemes/gold-coin',
  'lss_scheme':        '/money/schemes/lss',
  'agila_chit_scheme': '/money/schemes/agila-chit',
  'builders_scheme':   '/money/schemes/builders',
  'land_scheme':       '/money/schemes/land',
};

export const SCHEME_CARD_STYLES = {
  gold:      { Icon: Gem,              gradient: 'bg-gradient-to-br from-amber-400 to-amber-500' },
  gold_coin: { Icon: Coins,            gradient: 'bg-gradient-to-br from-yellow-500 to-amber-600' },
  lss:       { Icon: Layers,           gradient: 'bg-gradient-to-br from-violet-500 to-fuchsia-600' },
  land:      { Icon: Landmark,         gradient: 'bg-gradient-to-br from-stone-500 to-stone-600' },
  builders:  { Icon: Building2,        gradient: 'bg-gradient-to-br from-sky-500 to-sky-600' },
  agila_chit: { Icon: CircleDollarSign, gradient: 'bg-gradient-to-br from-violet-500 to-violet-600' },
  chit:       { Icon: CircleDollarSign, gradient: 'bg-gradient-to-br from-violet-500 to-violet-600' },
  jewel:     { Icon: Gem,              gradient: 'bg-gradient-to-br from-rose-400 to-rose-500' },
  trading:   { Icon: Building2,        gradient: 'bg-gradient-to-br from-indigo to-indigo/80' },
  default:   { Icon: Layers,           gradient: 'bg-gradient-to-br from-indigo to-indigo/80' },
};

// Resolve card style by stable code first, then fall back to name-keyword matching
// for projects without a dedicated code style.
export const getSchemeStyle = (name, code) => {
  if (code === 'gold_scheme')       return SCHEME_CARD_STYLES.gold;
  if (code === 'gold_coin_scheme')  return SCHEME_CARD_STYLES.gold_coin;
  if (code === 'lss_scheme')        return SCHEME_CARD_STYLES.lss;
  if (code === 'trading_academy')   return SCHEME_CARD_STYLES.trading;
  if (code === 'agila_chit_scheme') return SCHEME_CARD_STYLES.agila_chit;
  if (code === 'builders_scheme')   return SCHEME_CARD_STYLES.builders;
  if (code === 'land_scheme')       return SCHEME_CARD_STYLES.land;
  const lower = (name || '').toLowerCase();
  if (lower.includes('gold'))    return SCHEME_CARD_STYLES.gold;
  if (lower.includes('land'))    return SCHEME_CARD_STYLES.land;
  if (lower.includes('builder')) return SCHEME_CARD_STYLES.builders;
  if (lower.includes('chit'))    return SCHEME_CARD_STYLES.chit;
  if (lower.includes('jewel'))   return SCHEME_CARD_STYLES.jewel;
  return SCHEME_CARD_STYLES.default;
};

// ─── Incentive wallet ─────────────────────────────────────────────────────────

// Keyed by either source_type (collection / direct_cash / other / scheme)
// or by scheme_code for scheme rows (gold_scheme / trading_academy / future).
// Lookup precedence in the UI: schemeCode first, then sourceType.
export const SOURCE_META = {
  collection:       { label: 'Collections',      color: 'text-indigo',       bg: 'bg-indigo/10',    Icon: Briefcase },
  direct_cash:      { label: 'Direct Cash',      color: 'text-emerald-600',  bg: 'bg-emerald-100',  Icon: Banknote },
  scheme:           { label: 'Schemes',          color: 'text-violet-600',   bg: 'bg-violet-100',   Icon: Layers },
  gold_scheme:      { label: 'Gold Scheme',      color: 'text-amber-600',    bg: 'bg-amber-100',    Icon: Gem },
  gold_coin_scheme: { label: 'Gold Coin',        color: 'text-yellow-700',   bg: 'bg-yellow-100',   Icon: Coins },
  lss_scheme:        { label: 'LSS',              color: 'text-violet-600',   bg: 'bg-violet-100',   Icon: Layers },
  trading_academy:   { label: 'Trading Academy',  color: 'text-indigo',       bg: 'bg-indigo/10',    Icon: Building2 },
  agila_chit_scheme: { label: 'Agila Chit',       color: 'text-violet-700',   bg: 'bg-violet-100',   Icon: Wallet },
  builders_scheme:   { label: 'Builders',         color: 'text-sky-600',      bg: 'bg-sky-100',      Icon: Building2 },
  land_scheme:       { label: 'Land Sales',        color: 'text-stone-600',    bg: 'bg-stone-100',    Icon: Landmark },
  other:            { label: 'Other',            color: 'text-navy/60',      bg: 'bg-navy/5',       Icon: MoreHorizontal },
};

// ─── Form helpers ─────────────────────────────────────────────────────────────

// Standard input class for scheme add/edit forms (bg-white variant).
// AddPaymentModal intentionally uses bg-navy/2 — see that file.
// TradingAcademyPage's AddMemberSheet uses focus:border-indigo — see that file.
export const SCHEME_INPUT_CLASS =
  'w-full px-4 py-3 bg-white rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20 placeholder:text-navy/30';

// Curried form field setter. Usage: const set = createFormSetter(setForm); ... onChange={set('fieldName')}
export const createFormSetter = (setForm) =>
  (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

// Returns today's date as an ISO yyyy-mm-dd string
export const getTodayISO = () => new Date().toISOString().split('T')[0];
