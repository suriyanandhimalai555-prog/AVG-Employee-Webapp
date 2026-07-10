# PROJECT.md — EMS (AVG Employee Management System)

> Written as a one-time deep knowledge transfer (July 2026). Read this first for
> architecture and reasoning. Read `CLAUDE.md` for operational rules and
> `GAPS.md` for known weaknesses. `APPLICATION_GUIDE.txt` covers business rules
> per screen; `API_DOCUMENTATION.md` covers endpoint contracts;
> `SCHEMES_MEETING_NOTES.md` / `SCHEMES_ANALYSIS_AND_QUESTIONS.md` capture the
> business logic of the financial schemes as told by the domain expert.

---

## 1. What this is, in plain language

EMS is the **internal workforce and money-operations platform for Agila Vetri
Groups (AVG)**, a financial-services company with roughly 1,500 employees
across branch offices in South India (Tamil Nadu region; the "head branch" is
Tiruvannamalai). It is not a public product. Every login is an employee,
a branch admin, a back-office "management" account, or a client of the company.

It does three big jobs:

1. **Attendance** — GPS-geofenced office check-in and photo-verified field
   check-in for every employee, with a branch-admin flow for employees who do
   not own smartphones, sign-off (clock-out), auto-absent marking, corrections,
   and an immutable audit trail.
2. **Money movement** — daily cash/GPay/bank collections by field staff, a
   verification chain (money passes from subordinate to direct manager),
   branch rankings, cash-holder tracking, and daily branch reconciliation.
3. **Savings/investment schemes** — seven customer-facing financial products
   (Gold, Trading Academy, Gold Coin, LSS, Agila Chit, Builders, Land), each
   with enrollment, recurring payments, draws/winners where applicable, and —
   critically — **automatic commission distribution to the employee chain**
   that referred the customer, all landing in one unified incentive ledger
   that feeds employee wallets and salaries.

The audience for the UI is field staff on cheap Android phones (mobile-first,
390 px max-width screens) plus a handful of desktop dashboards for MD /
Director / Management.

---

## 2. Tech stack and why each piece is there

| Layer | Choice | Evident reasoning |
|---|---|---|
| Monorepo | npm workspaces (`apps/*`, `frontend`, `packages/*`) | One repo, zero extra tooling (no turbo/nx). Solo-dev friendly. |
| API | **Fastify 5 + TypeScript** | Fast, plugin/decorator model maps cleanly to the db/redis/auth/socket plugin split in `apps/api/src/plugins/`. |
| Validation | **Zod 4** (`*.schema.ts` per module) | Schemas are parsed manually in route handlers (`Schema.parse(request.body)`), not via Fastify's JSON-schema pipeline. One style everywhere. |
| DB | **PostgreSQL** via `pg` (raw SQL, no ORM) | Heavy use of recursive CTEs (org tree), `ON CONFLICT` upserts, partial-update guards, `NUMERIC(12,2)` money. An ORM would fight these. Every multi-statement write goes through `runInTransaction()`. |
| Cache / queues / pub-sub | **Redis (ioredis)** — one instance, three jobs | Session + hierarchy caching, BullMQ backing store, and pub/sub for attendance confirmations. |
| Background work | **BullMQ worker** (`apps/worker`) | Absorbs the morning attendance surge (1,500 people checking in within minutes) so the API never writes attendance synchronously. Also runs scheduled jobs (auto-absent, auto-deactivate, WhatsApp sweep). |
| Real-time | **Socket.io** (Redis adapter) | Pushes "attendance confirmed ✓" to the submitting phone after the worker commits. |
| Files | **AWS S3** presigned URLs | Field check-in photos and payment proofs upload browser→S3 directly; the DB stores only S3 keys, never URLs. |
| Frontend | **React 19 + Vite 8, all `.jsx`** (deliberately no TS in frontend) | RTK Query for 100% of API calls (`store/api/apiSlice.js`), Redux Toolkit for auth state, React Router 7 with lazy routes, Tailwind 4 + framer-motion. Design tokens live in `DESIGN.md` + `frontend/src/index.css`. |
| Notifications | **WhatsApp Cloud API (Meta)** via a transactional outbox | Customers get enrollment/renewal messages. Outbox row is written inside the same DB transaction as the purchase; the worker sends and a 2-minute sweep re-drives stuck rows. Delivery receipts arrive on a public HMAC-verified webhook. |
| Deploy | **Railway** (`railway.toml`, plus one in `apps/worker/`) | API and worker are separate Railway services sharing the same Postgres + Redis. |

Node >= 22.12 is required (root `package.json` engines).

---

## 3. Architecture — how it fits together

```
                         ┌────────────────────────────┐
                         │  frontend (React SPA)      │
                         │  RTK Query → /api/*        │
                         │  Socket.io client          │
                         └───────┬─────────▲──────────┘
                                 │ REST    │ socket push
                                 ▼         │
   S3 ◄──presigned upload── ┌────────────────────────────┐
   (photos, proofs)         │  apps/api (Fastify)        │
                            │  plugins: db,redis,auth,   │
                            │  rate-limit,socket,errors  │
                            │  modules: auth,attendance, │
                            │  users,branches,money,     │
                            │  transactions,customers,   │
                            │  gold,trading-academy,     │
                            │  gold-coin,lss,chit,       │
                            │  builders,land,incentives, │
                            │  salaries,schemes(agg),    │
                            │  pending-enrollments,      │
                            │  settings,reconciliation,  │
                            │  notifications(webhook)    │
                            └──┬───────────┬─────────────┘
              writes (txn)     │           │ enqueue jobs / NX dupe keys
                   ┌───────────▼──┐   ┌────▼─────┐
                   │ PostgreSQL   │   │  Redis   │◄─── pub/sub 'attendance:confirmed'
                   │ 80 migrations│   │ BullMQ + │
                   └───────▲──────┘   │ caches   │
                           │          └────▲─────┘
                     writes│               │ consumes 'attendance' +
                           │               │ 'notifications' queues
                        ┌──┴───────────────┴──┐
                        │  apps/worker        │
                        │  processors:        │
                        │   mark-attendance   │
                        │   sign-off          │
                        │   auto-absent (cron)│
                        │   auto-deactivate   │
                        │   send-whatsapp     │
                        │   whatsapp-sweep    │──► Meta WhatsApp Cloud API
                        └─────────────────────┘
```

### The attendance write path (the flagship design decision)

1. Phone POSTs check-in → API validates role, smartphone flag, **geofence**
   (Haversine vs `branches.latitude/longitude/geofence_radius_m`, tolerance
   widened by capped GPS accuracy).
2. Redis atomic `SET att:{userId}:{date} NX EX 86400` — duplicate → 409
   without touching the DB.
3. Job pushed to BullMQ `attendance` queue → API returns **202** immediately.
4. Worker (20 concurrent, ≤100 writes/sec, 3 retries, stall recovery) inserts
   with `ON CONFLICT (user_id, date) DO UPDATE ... WHERE attendance.status =
   'absent'` — a real check-in beats an auto-absent row, but never overwrites
   a genuine present/field record. An `attendance_audit` row is written in the
   same transaction (audit table has UPDATE/DELETE revoked — immutable).
5. Worker publishes `attendance:confirmed` on Redis pub/sub → API's Socket.io
   relays to the user's room → the phone flips spinner → green checkmark.

If Redis is down, the dupe check is skipped and the DB `ON CONFLICT` guard is
the authority ("Redis is an optimisation, Postgres is the truth"). The
geofence check deliberately fails **closed** on DB errors and open only when a
branch has no coordinates configured.

### The org tree and visibility (the second load-bearing idea)

Hierarchy: `MD → Director → GM → Branch Manager → ABM → Sales Officer`, plus
three roles outside the chain: `branch_admin` (one per branch, operations
only), `management` (back-office data entry, no branch, MD-level authority
over scheme data), `oa`, and `client` (login only).

- The whole tree is a single `users.manager_id` column, walked with a
  **recursive CTE** in `apps/api/src/shared/hierarchy.ts`, cached in Redis for
  1 hour (`hier:subtree:{id}`, `hier:oversight:{id}`,
  `hier:oversight-branches:{id}`), and busted upward along the ancestor chain
  by `bustHierarchyCache(userId)` whenever anyone is created/moved/deactivated.
- Directors/GMs additionally oversee branches through
  `user_oversight_branches`; `getOversightScopeIds()` unions subtree +
  oversight-branch members + a live "GM cascade" query specifically to survive
  stale subtree caches. Peers/higher roles are explicitly excluded.
- Role sets live in `apps/api/src/shared/role-constants.ts` — this file is the
  **single source of truth for RBAC**, together with helpers
  `resolveWriterBranch` / `resolveReadBranch` / `resolveCorrectionBranch` that
  encode the "management has no branch_id, so branch comes from the
  body/query" rule.

### The scheme backbone (the third load-bearing idea)

Every scheme, current and future, shares one skeleton:

- `projects` — the scheme registry; `projects.code` (e.g. `gold_scheme`,
  `agila_chit_scheme`) is **immutable** and is the join key everywhere.
- `scheme_commission_rules` — per-project, per-role rates
  (`rate_type = 'fixed' | 'percent'`).
- `customers` — the single customer registry (all schemes reference it).
- `employee_incentives` — the **unified wallet ledger**. Rows carry
  `scheme_code` + `payment_event` (`enrollment` / `renewal` / `monthly`).
- `IncentiveService.distributeIncentives(client, args)` — the sanctioned write
  path, with two modes:
  - `fixed_chain` — walks dealMaker → GM crediting each role's fixed ₹, plus
    the branch admin; a higher-role dealmaker absorbs the amounts of the
    levels below them (Trading Academy behaviour).
  - `percent_referrer` — credits the referrer `baseAmount × rate%` (Gold
    behaviour; rate row keyed by `percentRole` like `referrer_new` /
    `referrer_renewal`).
- Each scheme owns its member/payment tables and a `<scheme>.service.ts` that
  implements the `SchemeService` contract (`modules/schemes/scheme.contract.ts`)
  and is registered in `modules/schemes/scheme.registry.ts` so the MD/Director
  cross-scheme dashboard (`aggregate.routes.ts`) picks it up automatically.

**Known sanctioned exceptions:** Builders and Land have per-package,
per-type incentive matrices that don't fit the 1-D
`scheme_commission_rules` table, so `builders-incentives.service.ts` and
`land-incentives.service.ts` insert into `employee_incentives` directly (with
the same `scheme_code`/`payment_event` columns, so wallets still work). If you
see a rule elsewhere saying "never insert into employee_incentives directly,"
these two files are the deliberate, documented exceptions — do not add a third
without the same justification.

### The seven schemes at a glance

| Scheme | Code | Shape | Notable mechanics |
|---|---|---|---|
| Gold | `gold_scheme` | Monthly savings, per-customer | Referrer gets % (higher on month 1, lower on renewals) |
| Trading Academy | `trading_academy` | One-time course fee | Fixed-chain payout SO→ABM→BM→GM + branch admin |
| Gold Coin | `gold_coin_scheme` | 16-slot rooms, monthly draws | Rooms owned by **branches**; under-filled rooms are **combined at the head branch**; status machine forming→active→… |
| LSS | `lss_scheme` | 20-slot rooms, monthly draws | Near-clone of Gold Coin with level-based payouts (see GAPS — duplication) |
| Agila Chit | `agila_chit_scheme` | 20-member groups, 20 months | Manual winner selection; prize = `fullAmount × (9 + monthWon/2)`; stale `forming` groups lazily promoted to `pending_combine` |
| Builders | `builders_scheme` | Individual lump-sum plans | 60-month payout, house-or-cash choice, tiered incentive matrix (own rules table) |
| Land | `land_scheme` | Sites → layouts → plots → bookings | 60-month buyback; plot-level booking constraints; own incentive + audit services |

Cross-cutting scheme machinery:

- **Pending enrollments** (`pending-enrollments` module) — a staging layer for
  partial/installment enrollments across all schemes except Land.
- **Scheme corrections** — MD/Management-only edit/unpay/delete endpoints with
  an audit trail (`scheme-audit.ts`, migrations 059/060/063). The frontend
  `SchemeCorrectionsPage.jsx` is the console for this.
- **Payment proofs** — photo(s) + transaction ID(s) per payment; both were
  later widened to arrays (migrations 068/069/071/075) and a cash/bank split
  (076).
- **Feature flags** — `app_settings` JSONB rows read fresh on every check (no
  cache, so toggles are instant): backdated entry, per-scheme draw-eligibility
  bypass, WhatsApp messaging, daily reconciliation enforcement. Each has a
  guard file in `apps/api/src/shared/*-guard.ts`.

### Time, the sneaky fourth pillar

Two rules interact everywhere and will bite you if you forget either:

1. **The company runs on a 7-to-7 business calendar.** A "period" is the 7th
   of one month through the 6th of the next. All salaries, incentives, and
   scheme dashboards filter by period, not calendar month. Helpers:
   `apps/api/src/shared/scheme-period.ts` (server) and
   `frontend/src/lib/schemePeriod.js` (client) — intentionally decoupled twins;
   change both or neither.
2. **"Today" means IST.** The server runs in UTC on Railway; naive
   `new Date()` date-strings are wrong for 5.5 hours a day. Every server-side
   "today" must come from `getCompanyToday()` (`apps/api/src/shared/date.ts`).

---

## 4. Critical paths — what is load-bearing

Ranked by blast radius if broken:

1. **`IncentiveService.distributeIncentives` + `employee_incentives` writes**
   (`modules/incentives/`, `modules/builders/builders-incentives.service.ts`,
   `modules/land/land-incentives.service.ts`). This is people's pay. Money is
   rounded via `roundMoney()` to paise; everything runs inside the caller's
   transaction. A bug here silently misroutes commissions.
2. **`shared/hierarchy.ts` + `role-constants.ts` + per-route role guards.**
   Every list endpoint scopes data through these. A regression leaks one
   branch's money data to another, or hides a Director's org.
3. **The attendance queue pipeline** (API `attendance.service.ts` → BullMQ →
   `worker/processors/attendance.ts` → pub/sub → `socket.plugin.ts`). It is
   built to survive Redis outages and worker crashes; preserve the exact
   `NX` / `ON CONFLICT ... WHERE status='absent'` semantics and the audit
   insert.
4. **Migrations + `run_migrations.js`.** 80 sequential SQL files; the runner
   records filenames in `schema_migrations`. Never edit an applied migration;
   always add a new numbered file (the history itself shows the pattern:
   033 reverts 032, 049 restores what 048 removed).
5. **Scheme services' write paths** (`addMember`, `recordPayment`, winner
   selection, combine). These move customer money and trigger incentives +
   WhatsApp outbox rows in one transaction.

Safe to change casually: presentational frontend components
(`components/*`), page layout/styling (within `DESIGN.md` tokens), scheme list
pages, formatters, seed scripts, docs. Anything under `shared/` on the API, the
worker processors, and migrations is **not** casual territory.

---

## 5. Surprises and non-obvious things

- **The repo name lies.** "AVG-Employee-Webapp" and the workspace name
  `attendance-management` both undersell it — the majority of the code (by
  line count and by risk) is the seven financial schemes, not attendance.
- **Frontend is JavaScript on purpose.** The API is strict TS; the frontend is
  100% `.jsx` and must stay that way (explicit rule). Don't "helpfully"
  convert files to `.tsx`.
- **TS files carry line-by-line comments by convention.** Rule 11 in CLAUDE.md
  requires a one-line comment above TS-specific lines. It looks like
  AI-generated noise; it is the house style. Match it.
- **`AnimatePresence` around `<Outlet/>` causes a blank-screen bug** with
  React Router 7 lazy routes (mid-exit Suspense tear). The `page` motion
  variant is enter-only for this reason. Documented in CLAUDE.md/DESIGN.md;
  people rediscover this the hard way.
- **Rooms belong to branches, not users.** Gold Coin / LSS / Chit visibility
  is scoped by `getOversightBranchIds`, not user subtrees.
- **The "head branch"** (`branches.is_head_branch`, set by migrations 035/036,
  read-only at runtime) is where under-filled rooms/groups get combined. Only
  a branch admin *at the head branch* may combine — see
  `assertHeadBranchAdmin` in chit/gold-coin/lss combine services.
- **`markedByAdmin` / 202-vs-200 duality:** self check-ins are async (202 +
  socket confirm); admin marks and corrections are synchronous writes.
- **Zod parse in handlers, not Fastify schemas.** Fastify's own
  validation/serialization is unused; the response envelope
  `{ success, data | error }` is hand-built and enforced by
  `route-error-handler.ts` (`handleError`) + `error-handler.plugin.ts`.
- **`AGENTS.md` is a near-copy of `CLAUDE.md`** for Codex. If you change one,
  mirror the other or they will drift (they already have).
- **The `.claude/projects/.../memory/` folder is checked in** and contains the
  7-to-7 calendar note. It's harmless but unusual; don't delete it blindly —
  it feeds Claude Code's project memory on the author's machine.
- **Docs are unusually good but partially stale.** `APPLICATION_GUIDE.txt` and
  `API_DOCUMENTATION.md` were verified against code at time of writing but
  predate the newest schemes in places; trust code over docs when they
  disagree, then fix the doc.
