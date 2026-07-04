// frontend/src/lib/tailwindClasses.js
// Reusable Tailwind class strings. Centralised so a design tweak only edits
// one file instead of every form-input declaration across the app.

// Standard form input. Used by every scheme add page + customer picker so the
// height/border/focus ring stay identical regardless of where the input lives.
export const INPUT_BASE =
  'w-full px-4 py-3 text-base rounded-xl border border-border bg-white ' +
  'placeholder:text-navy/35 focus:outline-none focus:ring-2 focus:ring-indigo/25 ' +
  'focus:border-indigo transition-shadow';

// Tighter variant for inline pickers / chips that sit inside a list row.
export const INPUT_COMPACT =
  'px-3 py-2 text-sm rounded-lg border border-border bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo/25 focus:border-indigo';

// Section card wrapper used on dashboards.
export const CARD_BASE =
  'bg-white rounded-2xl p-5 border border-border card-shadow';
