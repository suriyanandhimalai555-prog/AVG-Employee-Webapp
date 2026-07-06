# TODOS

Deferred work items with context. Each entry captures motivation and a starting
point so it can be picked up months later without re-derivation.

## 1. Branch Manager entry point for Customers page

- **What:** Render the existing `CustomersCard` in the Branch Manager section of
  `frontend/src/pages/attendance/HomeTab.jsx` (BMs currently have no UI door to `/customers`).
- **Why:** The 2026-07-05 eng review tightened `PATCH /customers` to
  branch_manager + branch_admin + management — BMs now hold edit power but can
  only reach the screen by typing the URL.
- **Pros:** Policy and UI stay consistent; BMs can fix customer contact data without
  escalating to their branch admin.
- **Cons:** One more card on BM home; promoting the workflow to BMs is a product
  call (they may be intended as API-parity only).
- **Context:** `/customers` (CustomersPage.jsx) is the WhatsApp opt-in manager.
  Entry cards exist for branch_admin (slim `CustomersCard` row) and management
  (home grid tile). The route guard (`CustomersRoute` in App.jsx, eng-review task T7)
  already admits branch_manager.
- **Depends on / blocked by:** Eng-review tasks T2 (RBAC tightening) and T7 (route
  guard) landing first.

## 2. Frontend unit-test infrastructure (Vitest + React Testing Library)

- **What:** Add Vitest + RTL to `frontend/`, seed with CustomersPage tests
  (toggle-disable matrix, phone validation, error-state rendering, edit-clears-phone
  → opt-out).
- **Why:** The frontend has zero unit tests; UI logic is only exercised through slow
  browser E2E. The 2026-07-05 eng review added an API suite but deferred frontend
  unit coverage.
- **Pros:** Seconds-fast deterministic feedback on component logic; catches
  regressions without a browser.
- **Cons:** New dev-dependency surface and ongoing test maintenance for a solo dev;
  E2E already covers the critical journeys.
- **Context:** API already runs `vitest` (`apps/api`, `npm test`). Frontend is Vite,
  so Vitest slots in with the same config family. First target file:
  `frontend/src/pages/CustomersPage.jsx`.
- **Depends on / blocked by:** Nothing — independent of the API test suite.

## 3. App-wide muted-text contrast sweep (WCAG AA)

- **What:** Apply the DESIGN.md muted-text tiers across all pages: informational
  text (amounts, dates, names, phones) at `text-navy/60`+ (≈4.6:1), `/35–/45`
  reserved for decorative labels only, 11px floor for informational text.
- **Why:** The 2026-07-05 design review measured `text-navy/40` at ~2.8:1 on the
  `#F8FAFC` canvas — below the 4.5:1 AA minimum. The review fixed the Customers
  screen + shared components (design task D-T6a); ~80 other files (money/scheme
  pages especially) still show figures and dates below AA.
- **Pros:** Whole app hits AA; money figures readable in bad lighting on cheap screens.
- **Cons:** Large mechanical diff over just-settled restyle files; needs its own
  visual QA pass afterward (money pages especially).
- **Context:** Find offenders with `grep -rE 'text-navy/(3[05]|4[05])' frontend/src/pages`
  and judge informational-vs-decorative per hit. Tier rule lives in DESIGN.md
  (created by design task D-T4).
- **Depends on / blocked by:** DESIGN.md tiers (design review task D-T4) landing first.
