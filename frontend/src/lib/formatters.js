// frontend/src/lib/formatters.js
// Shared display formatters. Every page that shows currency, counts, or dates
// must import from here so the company-wide formatting stays consistent.

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const INR_DECIMAL = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

// Format a number as INR. Pass `decimals: true` when displaying payment amounts
// that should keep the paise breakdown (e.g. cash transfers, scheme dues).
export const formatCurrency = (value, { decimals = false } = {}) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return decimals ? '₹0.00' : '₹0';
  return decimals ? INR_DECIMAL.format(n) : INR.format(n);
};

// Format a rupee value in compact Indian short-scale for narrow stat cells.
// >= 1 crore → "₹2.05 Cr"; >= 1 lakh → "₹9.50 L"; else falls back to formatCurrency.
export const formatCurrencyCompact = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₹0';
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)} L`;
  return formatCurrency(n);
};

// Format a plain integer (counts, days) with Indian grouping.
const INT = new Intl.NumberFormat('en-IN');
export const formatNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? INT.format(n) : '0';
};

// Format an ISO date or Date instance. `style: 'short' | 'long' | 'datetime'`.
export const formatDate = (input, style = 'short') => {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  if (style === 'long') {
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  if (style === 'datetime') {
    return d.toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
