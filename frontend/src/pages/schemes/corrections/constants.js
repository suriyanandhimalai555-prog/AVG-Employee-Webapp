// frontend/src/pages/schemes/corrections/constants.js
// Static configuration for the Corrections Center: the scheme list, per-scheme
// editable fields, payment-mode labels and shared input styling.
// Part of the Corrections Center (../SchemeCorrectionsPage.jsx).

// ─── Scheme list ──────────────────────────────────────────────────────────────

export const SCHEMES = [
  { code: 'gold_scheme',       label: 'Gold Scheme' },
  { code: 'trading_academy',   label: 'Trading Academy' },
  { code: 'builders_scheme',   label: 'Builders Scheme' },
  { code: 'agila_chit_scheme', label: 'Agila Chit' },
  { code: 'gold_coin_scheme',  label: 'Gold Coin' },
  { code: 'lss_scheme',        label: 'LSS' },
  { code: 'land_scheme',       label: 'Land Sales' },
];

// Scheme codes that have per-entry recorded payments the admin can manage
export const PAYMENT_SCHEMES = new Set(['gold_scheme', 'builders_scheme', 'agila_chit_scheme', 'land_scheme']);

// ─── Shared field configs per scheme ─────────────────────────────────────────
export const SCHEME_FIELDS = {
  gold_scheme: [
    { key: 'chitNumber',    label: 'Chit Number',   type: 'text',       entryKey: 'chit_number' },
    { key: 'customerId',    label: 'Customer',       type: 'customer',   entryKey: null },
    { key: 'referrerId',    label: 'Referred by',    type: 'referrer',   entryKey: 'referrer_id' },
    { key: 'monthlyAmount', label: 'Monthly Amount', type: 'number',     entryKey: 'monthly_amount' },
    { key: 'startDate',     label: 'Start Date',     type: 'date',       entryKey: 'start_date' },
    { key: 'totalMonths',   label: 'Total Months',   type: 'number',     entryKey: 'total_months' },
    { key: 'notes',         label: 'Notes',          type: 'textarea',   entryKey: 'notes' },
  ],
  trading_academy: [
    { key: 'customerId',      label: 'Customer',       type: 'customer', entryKey: null },
    { key: 'enrolledBy',      label: 'Enrolled by',    type: 'referrer', entryKey: 'enrolled_by' },
    { key: 'amount',          label: 'Amount',         type: 'number',   entryKey: 'amount' },
    { key: 'enrollmentDate',  label: 'Enrollment Date',type: 'date',     entryKey: 'enrollment_date' },
    { key: 'paymentMode',     label: 'Payment Mode',   type: 'mode',     entryKey: 'payment_mode', proofField: 'proofKey', txnField: 'transactionId', cashField: 'cashAmount', bankField: 'bankAmount', cashEntryKey: 'cash_amount', bankEntryKey: 'bank_amount', amountFormKey: 'amount', amountEntryKey: 'amount' },
    { key: 'notes',           label: 'Notes',          type: 'textarea', entryKey: 'notes' },
  ],
  builders_scheme: [
    { key: 'customerId',   label: 'Customer',    type: 'customer', entryKey: null },
    { key: 'referrerId',   label: 'Referred by', type: 'referrer', entryKey: 'referrer_id' },
    { key: 'lumpSumDate',  label: 'Lump Sum Date',type: 'date',    entryKey: 'lump_sum_date' },
    { key: 'lumpSumMode',  label: 'Payment Mode',type: 'mode',     entryKey: 'lump_sum_mode', proofField: 'lumpSumProofKey', txnField: 'lumpSumTransactionId', cashField: 'lumpSumCashAmount', bankField: 'lumpSumBankAmount', cashEntryKey: 'lump_sum_cash_amount', bankEntryKey: 'lump_sum_bank_amount', amountEntryKey: 'investment_amount' },
    { key: 'notes',        label: 'Notes',       type: 'textarea', entryKey: 'notes' },
  ],
  agila_chit_scheme: [
    { key: 'customerId',  label: 'Customer',    type: 'customer', entryKey: null },
    { key: 'referrerId',  label: 'Referred by', type: 'referrer', entryKey: 'referrer_id' },
    { key: 'notes',       label: 'Notes',       type: 'textarea', entryKey: 'notes' },
  ],
  gold_coin_scheme: [
    { key: 'customerId',  label: 'Customer',    type: 'customer', entryKey: null },
    { key: 'referrerId',  label: 'Referred by', type: 'referrer', entryKey: 'referrer_id' },
    { key: 'paymentMode', label: 'Payment Mode',type: 'mode',     entryKey: 'payment_mode', proofField: 'proofKey', txnField: 'transactionId', cashField: 'cashAmount', bankField: 'bankAmount', cashEntryKey: 'cash_amount', bankEntryKey: 'bank_amount', amountEntryKey: 'amount_paid' },
    { key: 'notes',       label: 'Notes',       type: 'textarea', entryKey: 'notes' },
  ],
  lss_scheme: [
    { key: 'customerId',  label: 'Customer',    type: 'customer', entryKey: null },
    { key: 'referrerId',  label: 'Referred by', type: 'referrer', entryKey: 'referrer_id' },
    { key: 'paymentMode', label: 'Payment Mode',type: 'mode',     entryKey: 'payment_mode', proofField: 'proofKey', txnField: 'transactionId', cashField: 'cashAmount', bankField: 'bankAmount', cashEntryKey: 'cash_amount', bankEntryKey: 'bank_amount', amountEntryKey: 'amount_paid' },
    { key: 'notes',       label: 'Notes',       type: 'textarea', entryKey: 'notes' },
  ],
  land_scheme: [
    { key: 'bookingRef',      label: 'Booking Ref',       type: 'text',     entryKey: 'booking_ref' },
    { key: 'bookingDate',     label: 'Booking Date',      type: 'date',     entryKey: 'booking_date' },
    { key: 'customerId',      label: 'Customer',          type: 'customer', entryKey: null },
    { key: 'referrerId',      label: 'Referred by',       type: 'referrer', entryKey: 'referrer_id' },
    // Land bookings use their own payment-mode enum, not cash/gpay/bank_receipt
    { key: 'paymentMode',     label: 'Payment Mode',      type: 'landMode', entryKey: 'payment_mode' },
    { key: 'advanceAmount',   label: 'Advance Amount',    type: 'number',   entryKey: 'advance_amount' },
    { key: 'advanceDate',     label: 'Advance Date',      type: 'date',     entryKey: 'advance_date' },
    { key: 'fullAmount',      label: 'Full Amount',       type: 'number',   entryKey: 'full_amount' },
    { key: 'fullPaymentDate', label: 'Full Payment Date', type: 'date',     entryKey: 'full_payment_date' },
    { key: 'loanTaken',       label: 'Loan Taken',        type: 'boolean',  entryKey: 'loan_taken' },
    { key: 'loanAmount',      label: 'Loan Amount',       type: 'number',   entryKey: 'loan_amount' },
    { key: 'notes',           label: 'Notes',             type: 'textarea', entryKey: 'notes' },
  ],
};

export const SCHEME_PAYMENT_MODES = ['cash', 'gpay', 'bank_receipt', 'cash_bank', 'cash_gpay'];
export const MODE_LABEL = { cash: 'Cash', gpay: 'GPay', bank_receipt: 'Bank Receipt', cash_bank: 'Cash + Bank', cash_gpay: 'Cash + GPay' };
export const LAND_PAYMENT_MODES = ['full_payment', 'advance_full_payment'];
export const LAND_MODE_LABEL = { full_payment: 'Full Payment', advance_full_payment: 'Advance + Full Payment' };

// ─── Shared input class ───────────────────────────────────────────────────────

export const IC = 'w-full px-3 py-2.5 bg-navy/3 rounded-xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20';

// Search runs on the SERVER (each scheme's getEntriesByBranch) across the whole branch.
// It used to filter the already-loaded list in the browser, which silently hid every
// entry that was not loaded — a branch with 577 gold members could not find its older
// chits here at all. These placeholders mirror the fields each scheme matches.
export const SEARCH_PLACEHOLDER = {
  gold_scheme:       'Search name, chit #, phone, code, referrer…',
  trading_academy:   'Search name, phone, code, enrolled by…',
  builders_scheme:   'Search name, phone, code, referrer…',
  agila_chit_scheme: 'Search group or member name, phone, code…',
  gold_coin_scheme:  'Search room #, package, or slot customer…',
  lss_scheme:        'Search room #, plan, or slot customer…',
  land_scheme:       'Search name, phone, booking ref, site…',
};

// Delay between the last keystroke and the server search request.
export const SEARCH_DEBOUNCE_MS = 350;
