# DESIGN.md — EMS Design System

Source of truth for visual design decisions. Use this alongside CLAUDE.md.
CLAUDE.md sections on colours and motion defer to this file.

---

## Colour tokens (`frontend/src/index.css` @theme)

| Token            | Value     | Usage                                      |
|------------------|-----------|--------------------------------------------|
| `navy`           | #0F1C2E   | Ink colour for text, sidebar background    |
| `indigo`         | #2563EB   | Primary action / active state              |
| `yellow`         | #D97706   | Amber highlight / warning                  |
| `emerald`        | #059669   | Success / WhatsApp opt-in                  |
| `surface`        | #F8FAFC   | Page canvas                                |
| `surface-container` | #EEF2F7 | Section backgrounds inside a card        |
| `surface-container-low` | #F1F5F9 | Light tinted rows                    |
| `border`         | #E2E8F0   | Hairline dividers (default)                |
| `border-strong`  | #CBD5E1   | Stronger divider when needed               |

---

## Muted-text tiers (WCAG AA floor = 4.5:1 on #F8FAFC canvas)

| Class         | Composite contrast | When to use                                 |
|---------------|--------------------|---------------------------------------------|
| `text-navy/60` | ≈ 4.6:1           | **Informational minimum** — phone numbers, amounts, dates, counts, descriptions people will act on |
| `text-navy/40` | ≈ 2.8:1           | **Decorative only** — field labels (UPPERCASE tracking), pagination prefixes ("Page X of"), supplementary chip tags |
| `text-navy/30` | < 2.0:1           | Icons only (never text)                     |

Rule: if removing the element would make the UI less clear, it is informational → must be ≥ /60.

---

## Card vs list

**Card** (`bg-white rounded-2xl card-shadow border border-border`):
- Use for standalone summary blocks, stat tiles, hero cards.
- Never stack cards as a list (stacked card-shadow looks broken and heavy).

**List rows** (inside a single container):
- One wrapper: `bg-white rounded-2xl card-shadow border border-border divide-y divide-border overflow-hidden`.
- Rows have no individual card-shadow, no individual border.
- Row padding: `px-4 py-3.5` (standard), `px-4 py-4` (comfortable when rows carry more info).

---

## Radii

| Token        | px  | Usage                                  |
|--------------|-----|----------------------------------------|
| `rounded-xl`  | 12  | Inputs, small chips, row icon avatars  |
| `rounded-2xl` | 16  | Cards, modals (desktop), list wrappers |
| `rounded-3xl` | 20  | Modal bottom-sheet (mobile top edge), hero blobs |

---

## Motion vocabulary (`frontend/src/lib/motion.js`)

All motion constants live in `lib/motion.js`. Import from there — do not write ad-hoc `transition` objects inline.

| Export   | What it does                                    | When to use                          |
|----------|-------------------------------------------------|--------------------------------------|
| `DURATION.fast` | 0.15 s                                   | Exit fades, micro-feedback           |
| `DURATION.base` | 0.22 s                                   | Standard enter fades                 |
| `DURATION.slow` | 0.32 s                                   | Deliberate reveals                   |
| `EASE`   | [0.22, 1, 0.36, 1] ease-out-quart               | All non-spring transitions           |
| `SPRING` | `{ type: 'spring', damping: 30, stiffness: 300 }` | Physical surfaces (modals, sheets) |
| `fade`   | opacity fade in + out                           | Tooltips, banners                    |
| `fadeUp` | opacity + 8px rise                              | Content blocks, list items           |
| `page`   | enter-only opacity fade (NO exit)               | Route-level `Layout.jsx` only        |
| `modal`  | spring slide-up (enter + exit)                  | `GlassModal`, bottom sheets          |

**Critical rule**: `page` has no `exit` variant intentionally. Never wrap `<Outlet/>` in `<AnimatePresence>`. An exiting keyed wrapper re-renders the live Outlet (which re-resolves to the new lazy route) and causes a mid-exit Suspense tear — the new page never mounts. Enter-only fades are the safe pattern for route transitions with React Router 7 + lazy routes.

---

## Touch target floors

Interactive elements must be at minimum **44 × 44 px** (iOS HIG / WCAG 2.5.5).

- Icon buttons: `w-11 h-11` (44px) with `flex items-center justify-center`.
- Toggle buttons: `w-11 h-11 flex items-center justify-center` wrapping the icon.
- Inline text-link buttons (e.g. "No phone — add one"): exception — uses inline hit area, acceptable for secondary affordances.

---

## Accessibility floors

- Text contrast: see muted-text tiers above.
- Font size: 11px minimum for informational text; 10px for decorative UPPERCASE labels only.
- Focus ring: `focus-visible:ring-2 focus-visible:ring-indigo focus-visible:ring-offset-1` (defined globally in `index.css`).
- Disabled states: `opacity-40` + `cursor-not-allowed`.
- `prefers-reduced-motion`: handled globally by the `MotionConfig` in `main.jsx` and the CSS block in `index.css`.
