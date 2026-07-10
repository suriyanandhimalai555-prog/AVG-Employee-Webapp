# CLAUDE.md — EMS Employee Management System

This file provides guidance to Claude Code when working with this repository.
Read everything before touching code.

**Companion docs:**
- `PROJECT.md` — architecture, data flow, design decisions, critical paths. Read it before any non-trivial change.
- `GAPS.md` — known weaknesses, ordered by severity, each with a scoped fix. Check it before "fixing" something — it may already be documented, and don't reintroduce a listed gap.
- `APPLICATION_GUIDE.txt` — per-screen business rules. `API_DOCUMENTATION.md` — endpoint contracts. `DESIGN.md` — design tokens and motion rules. `SCHEMES_MEETING_NOTES.md` — scheme business logic from the domain expert. When docs and code disagree, code wins; fix the doc.

---

## WHAT THIS PROJECT IS

Internal workforce + money-operations platform for a company with ~1,500
employees across branches in South India. Not a public app. Every user is an
employee, branch admin, back-office management account, or client.

Shipped modules (API `src/modules/` is the source of truth): auth, attendance,
branches, users, transactions, money, customers, gold, trading-academy,
gold-coin, lss, chit (Agila Chit), builders, land, incentives, salaries,
schemes (cross-scheme aggregate), pending-enrollments, settings,
reconciliation, notifications (WhatsApp webhook). Active areas rotate — check
`git log` before assuming a module is or isn't being touched.

---

## COMMANDS

### Development (from repo root)
```bash
npm run dev          # Runs API, Worker, and Frontend together
```

### Individual workspaces
```bash
npm run dev -w @attendance/api      # API only (port 3001)
npm run dev -w @attendance/worker   # Worker only
npm run dev -w frontend             # Frontend only (port 5173/5174)
```

### Build / test / lint
```bash
npm run build                       # shared-types first, then all workspaces
npm test -w @attendance/api         # vitest (currently only shared/ helper tests)
npm run lint -w frontend            # ESLint (frontend only; API has no lint script)
```

### Database migrations
```bash
node run_migrations.js              # from repo root; idempotent via schema_migrations
```
⚠️ The runner tolerates "already exists" errors by recording the file as
applied — on a multi-statement file this can permanently skip the remaining
statements (GAPS.md #2). If a migration partially fails, verify the schema by
hand before trusting `schema_migrations`.

### Seed data
```bash
npm run seed:branches -w @attendance/api
```
Seed scripts currently hardcode passwords (GAPS.md #1). Do not add new
hardcoded credentials; read from env vars.

### Deploy
Railway. Root `railway.toml` builds shared-types + api + worker; the worker
has its own `apps/worker/railway.toml`. There is no CI (GAPS.md #6) — build
locally before pushing.

---

## COMPANY HIERARCHY
```
MD (1 person only)
└── Director (many, MD creates them)
    └── GM (manages multiple branches, across regions)
        └── Branch Manager (runs one branch)
            └── ABM (assistant branch manager)
                └── Sales Officer (field staff)
                    └── Client (login only, no attendance)
```

Roles outside the chain:
- **Branch Admin** (1 per branch): attendance ops + scheme data entry for
  their branch only. Not in the reporting chain. Cannot see other branches.
- **Management**: back-office data-entry account with MD-level (or greater)
  authority over scheme data. Has **no branch_id** — branch always comes from
  the request body/query (see `resolveWriterBranch`/`resolveReadBranch` in
  `shared/role-constants.ts`). Never marks attendance. Exempt from backdate
  and reconciliation guards.
- **OA**, **Client**: limited/no access.

How the tree is stored:
- Every user has `manager_id` pointing to their direct boss — this one field
  builds the entire company tree (recursive CTE in `shared/hierarchy.ts`).
- GM/Director multi-branch oversight lives in `user_oversight_branches`.
- The **head branch** (`branches.is_head_branch`, set by migration, read-only
  at runtime) is where under-filled Gold Coin / LSS rooms and Chit groups are
  combined. Only a branch admin at the head branch may combine.

## WHO MARKS ATTENDANCE

Everyone marks attendance EXCEPT md, management, and client.

| Role           | Marks attendance |
|----------------|-----------------|
| MD             | NO              |
| Management     | NO              |
| Director       | YES             |
| GM             | YES             |
| Branch Manager | YES             |
| ABM            | YES             |
| Sales Officer  | YES             |
| Branch Admin   | YES (own) + marks for no-smartphone employees |
| Client         | NO              |

## SMARTPHONE RULE

Every user has `has_smartphone` (true/false).
- true  → marks own attendance
- false → branch admin marks for them; server REJECTS self-mark
- Only branch admin can change this flag, only for their own branch.

## VISIBILITY RULE

Everyone sees what the people below them are doing — descendants only, never
peers or superiors.

| Role           | Can see |
|----------------|---------|
| MD / Management| Entire org |
| Director       | Subtree + oversight branches + GM cascade |
| GM             | Subtree + overseen branches |
| Branch Manager | Their branch only |
| ABM            | Their team only |
| Sales Officer  | Own record only (schemes: entries they referred, any branch) |
| Branch Admin   | Their branch only |
| Client         | Nothing |

Enforced via PostgreSQL recursive CTE (`shared/hierarchy.ts`), cached in
Redis 1 hour, busted upward along the ancestor chain by
`bustHierarchyCache(userId)` on create/move/deactivate. Room-based schemes
(Gold Coin / LSS / Chit) scope by **branch** via `getOversightBranchIds`, not
by user subtree.

---

## ARCHITECTURE (summary — full detail in PROJECT.md)

### Monorepo
- `apps/api/`              — Fastify REST API (TypeScript)
- `apps/worker/`           — BullMQ background processor (TypeScript)
- `frontend/`              — React SPA with Vite (JavaScript, .jsx only)
- `packages/shared-types/` — Shared TypeScript types

### Backend (apps/api)
`src/app.ts` registers plugins then modules.

Plugins (`src/plugins/`): db → `fastify.db` · redis → `fastify.redis` ·
auth → `fastify.authenticate` (JWT) · rate-limit · socket (Socket.io) ·
error-handler.

Modules (`src/modules/`): each has `*.routes.ts` + `*.service.ts` +
`*.schema.ts` (Zod). Zod schemas are `.parse()`d inside handlers — Fastify's
own schema validation is NOT used; keep that convention.

Bigger schemes are decomposed per concern: gold-coin and lss each have
rooms/slots/draws/combine services + a status machine; land has
sites/bookings/incentives/audit services; builders has its own incentives
service.

Shared (`src/shared/`) — the load-bearing directory:
- `role-constants.ts`      → canonical Role enum + role sets + resolve helpers. **Add new RBAC rules here** (permissions.ts is the older, frozen system).
- `hierarchy.ts`           → recursive CTE + Redis cache + cache busting
- `errors.ts` / `route-error-handler.ts` → AppError subclasses; every route catch does `return handleError(error, reply)`
- `transaction-helper.ts`  → `runInTransaction()` — use for any multi-statement write
- `date.ts`                → `getCompanyToday()` (IST). **Never** derive a server-side "today" any other way.
- `scheme-period.ts`       → 7-to-7 period math (mirror of frontend `schemePeriod.js`)
- `backdate-guard.ts`, `reconciliation-guard.ts`, `eligibility-bypass-guard.ts`, `whatsapp-guard.ts` → app_settings feature-flag guards, read fresh every call (no cache — toggles must be instant)
- `scheme-audit.ts`        → correction audit rows

### Schemes — one source of truth, one payout path
Backbone tables shared by every scheme: `projects` (registry; `.code` is
immutable), `scheme_commission_rules`, `customers`, `employee_incentives`
(unified wallet ledger; rows carry `scheme_code` + `payment_event`).

`IncentiveService.distributeIncentives(client, args)` is the standard way to
write incentives. Modes: `fixed_chain` (walk dealMaker → GM + branch admin;
higher-role dealmaker absorbs lower levels' amounts) and `percent_referrer`
(referrer gets baseAmount × rate%).

**Sanctioned exceptions:** `builders-incentives.service.ts` and
`land-incentives.service.ts` insert into `employee_incentives` directly
because their tier×role×type rate matrices don't fit the 1-D rules table.
Do NOT create a third direct-insert path without equivalent justification —
and any direct insert MUST still write `scheme_code` + `payment_event`.

### Adding a new scheme
1. New migration: `<scheme>_members` (+ `<scheme>_payments` if recurring).
   Reference `customer_id`, `branch_id`, `entered_by` like existing schemes.
2. Insert one `projects` row with a stable `code`; seed
   `scheme_commission_rules`.
3. Create `modules/<scheme>/` (routes + service + Zod schema), template on
   gold (simple) or gold-coin (room-based).
4. Service exports `schemeCode` + `getBranchSummary(...)` per
   `schemes/scheme.contract.ts`.
5. Inside addMember/addPayment call
   `IncentiveService.distributeIncentives(client, {...})` inside the same
   transaction; add a WhatsApp outbox row via
   `notifications.outbox.ts` if customers should be notified.
6. Register in `modules/schemes/scheme.registry.ts` and `src/app.ts`.
7. Frontend: route in `App.jsx` (lazy), scheme entry in `NAVIGABLE_SCHEMES` +
   `SOURCE_META` in `frontend/src/lib/schemeConstants.js`, endpoints in
   `apiSlice.js`.
8. Guards on write routes, in order: role check → `resolveWriterBranch` →
   `assertBackdateAllowed` → `assertReconciliationSubmitted` (see existing
   scheme routes for the exact pattern).

### Async processing (1,500-user surge)
Attendance self check-ins never write directly to DB:
submit → Redis `SET att:{userId}:{date} NX EX 86400` (exists → 409, no DB
hit) → BullMQ job → **202** + spinner → worker (20 concurrent, ≤100/sec,
3 retries) → `INSERT ... ON CONFLICT (user_id,date) DO UPDATE ... WHERE
attendance.status='absent'` + audit row in one txn → Redis pub/sub → Socket.io
→ green checkmark. Admin marks/corrections are synchronous.

### Frontend (frontend/)
- Redux Toolkit for auth state; **RTK Query for ALL API calls** — never raw
  fetch/axios in components. All endpoints in `store/api/apiSlice.js`
  (2,200+ lines; see GAPS.md #14 before adding — consider `injectEndpoints`).
- React Router 7, lazy routes from `App.jsx`. Everyday flow (Login,
  AttendanceHome, Profile) is eager; everything else lazy.
- Socket hook: `pages/attendance/hooks/useAttendanceSocket.js` invalidates
  RTK Query caches on `attendance:confirmed`.

---

## DATABASE

Migrations in `apps/api/migrations/` are numbered SQL files, currently
**001 through 080** (plus `007b`). Run with `node run_migrations.js`.
Coverage: core users/branches/attendance/transactions/money (001–011), gold +
salaries + incentives + commission rules + trading academy (012–018),
customers (019–021), profile assets (022), scheme unification (023–029),
gold-coin (030–036), lss (037–038), chit (039–044), builders (045–049,
054–055, 057), land (050–055, 061–062), management role (056), corrections
audit (059–060, 063–064), payment events/proofs/txn IDs/splits (065, 068–069,
071, 075–076), app settings + geofence + WhatsApp (066–067, 070, 072–074),
pending enrollments (077), slot batches (078), reconciliation (079),
customers audit (080).

Rules:
- NEVER edit an applied migration — add a new numbered file (history shows
  the pattern: 033 reverts 032, 049 restores 048).
- Key constraints: attendance `UNIQUE (user_id, date)`; transactions
  receiver must be sender's direct manager; `attendance_audit` has
  UPDATE/DELETE revoked (immutable).
- All timestamps are TIMESTAMPTZ. Money columns are NUMERIC(12,2); round in
  JS with `roundMoney()` before writing.

## API RESPONSE FORMAT

```json
{ "success": true, "data": {} }
{ "success": false, "error": { "code": "...", "message": "...", "details": {} } }
```
202 = accepted and queued, not yet in DB; confirmation via WebSocket
`attendance:confirmed`.

## REDIS KEY CONVENTIONS
```
user:{userId}                     Profile cache                 TTL: 30min
hier:subtree:{userId}             Subtree IDs                   TTL: 1h
hier:oversight:{userId}           Director/GM oversight scope   TTL: 1h
hier:oversight-branches:{userId}  Visible branch IDs            TTL: 1h
att:{userId}:{date}               Self-mark dupe guard          TTL: 24h
att:absent:{userId}:{date}        Self-absent dupe guard        TTL: 24h
att:summary:{branchId}            Branch summary cache          TTL: 5min
geo:{branchId}                    Geofence coords cache         TTL: 10min
```
All three `hier:*` families are busted together by
`bustHierarchyCache(userId)`. After ANY `UPDATE users ...`, also
`redis.del('user:{id}')` (GAPS.md #15).

## ENVIRONMENT VARIABLES

apps/api/.env (validated by Zod in `src/config/env.ts` — the schema there is
the authoritative list):
```
DATABASE_URL=  REDIS_URL=  JWT_SECRET= (min 32 chars)  JWT_EXPIRES_IN=8h
AWS_ACCESS_KEY_ID=  AWS_SECRET_ACCESS_KEY=  AWS_REGION=  S3_BUCKET_NAME=
S3_PRESIGN_EXPIRES=300  FRONTEND_URL=  ALLOWED_ORIGINS=  PORT=3001  NODE_ENV=
WHATSAPP_* (optional; worker-side WHATSAPP_ENABLED gates sending)
```
frontend/.env: `VITE_API_URL=http://localhost:3001/api`

Never commit live secrets. `.gitignore` excludes `.env*`. Keep both
`.env.example` files in sync with `env.ts` when adding variables.

---

## GOTCHAS — things that look right but aren't

1. **IST dates.** The server runs UTC. `new Date().toISOString().slice(0,10)`
   is the wrong date for 5.5 h/day. Server: use `getCompanyToday()`.
   Frontend period math currently uses device-local time (GAPS.md #13).
2. **7-to-7 business calendar.** A "period" runs the 7th → 6th of next month
   ("May 2026 period" = May 7–Jun 6). All salaries/incentives/scheme
   dashboards filter by period. Helpers: `shared/scheme-period.ts` (API) and
   `lib/schemePeriod.js` (frontend) — deliberately decoupled twins; if the
   cutoff day ever changes, update BOTH.
3. **Never wrap `<Outlet/>` in `<AnimatePresence>`** — mid-exit Suspense tear
   with React Router 7 lazy routes → blank screen. The `page` motion variant
   is enter-only for this reason. All motion constants import from
   `lib/motion.js`; no ad-hoc transition objects.
4. **Rate limiting is effectively per-IP**, despite the comment in `app.ts`
   claiming per-user (GAPS.md #4). Don't trust `request.user` inside global
   hooks — route-level `onRequest: [fastify.authenticate]` runs later.
5. **Logout doesn't invalidate JWTs** — it only clears the Redis profile
   cache. Tokens live their full 8 h (GAPS.md #3). Don't build features that
   assume server-side session termination.
6. **`ON CONFLICT ... DO UPDATE ... WHERE status='absent'`** in the worker is
   deliberate: a real check-in overwrites an auto-absent row but never a
   genuine present/field record. rowCount 0 = duplicate, still publish the
   socket confirm with `duplicate: true`.
7. **Management has no branch_id.** Any branch-scoped route must accept a
   body/query branchId for management via the `resolve*Branch` helpers —
   copying a branch_admin-only pattern will 403 management.
8. **Feature-flag guards read app_settings on every call — never cache them.**
9. **pg returns DECIMAL/NUMERIC as strings.** `parseFloat` at the read site
   (see geofence lat/lng, all money aggregations).
10. **S3: store keys, never URLs.** Presigned URLs are generated on demand
    (`populateAvatarUrls`, upload-url endpoints).
11. **Socket.io CORS only honours FRONTEND_URL** — extra origins in
    ALLOWED_ORIGINS get REST but not websockets (GAPS.md #9).
12. **`AGENTS.md` is a stale near-copy of this file** — treat this file as
    authoritative; mirror changes there or slim it into a pointer.

## STRICT CODE RULES

1. ALL frontend files are .jsx — never .tsx. Do not restructure existing
   components or change existing styling; work with what exists. Import
   shared primitives (Button, Card, GlassModal, StatusChip, LoadingSpinner,
   EmptyState, PeriodDateInput, CustomerPicker, layout/*) instead of
   re-creating them. Formatters from `lib/formatters.js`; constants from
   `lib/constants.js` / `lib/schemeConstants.js`; Tailwind snippets from
   `lib/tailwindClasses.js`. Design tokens: see DESIGN.md.
2. Never put business logic in route handlers; never put DB queries outside
   service files.
3. Every async route handler has try/catch ending in
   `return handleError(error, reply)`.
4. All frontend API calls go through RTK Query in apiSlice.js.
5. Multi-statement writes use `runInTransaction()`; incentive writes go
   through `IncentiveService.distributeIncentives` (exceptions: builders,
   land — see PROJECT.md).
6. Never store S3 URLs — only S3 keys.
7. Never overwrite original attendance data; corrections append audit rows.
8. Worker attendance INSERT keeps the exact `ON CONFLICT` semantics above.
9. Redis dupe checks use the NX flag; null result = duplicate = 409.
10. All timestamps TIMESTAMPTZ; server "today" = `getCompanyToday()`.
11. TypeScript files: one-line comment above every TS-specific line
    explaining what it does and why (house style — match it).
12. New RBAC rules = named role sets in `shared/role-constants.ts`, not
    inline `.includes` arrays.
13. Generated/derived files: `packages/shared-types/dist/` (and the stray
    `src/index.js` — slated for deletion, GAPS.md #16), `apps/*/dist/`,
    `frontend/dist/`. Never edit them.
14. Migrations are append-only; data migrations must be idempotent and no-op
    safely on databases lacking the referenced rows.

## SUB-100-LINE MAP OF WHERE THINGS LIVE

```
apps/api/src/
├── app.ts                 ← plugin + module registration (route prefixes)
├── config/                ← env (Zod-validated), db pool, redis, s3
├── plugins/               ← db, redis, auth(JWT), socket, error-handler
├── shared/                ← RBAC, hierarchy, guards, txn helper, dates  ★ load-bearing
└── modules/<name>/        ← routes + service + schema per domain
apps/worker/src/
├── worker.ts              ← 2 BullMQ workers: 'attendance' + 'notifications'
├── scheduler.ts           ← repeatable jobs + failed-job recovery
└── processors/            ← attendance, signOff, autoAbsent, autoDeactivate, whatsapp*
frontend/src/
├── App.jsx                ← routing + lazy boundaries + route guards
├── store/api/apiSlice.js  ← ALL endpoints (RTK Query)
├── store/slices/authSlice.js
├── lib/                   ← formatters, constants, schemePeriod, motion, date
├── components/            ← shared primitives (+ money/, attendance/, branches/, layout/)
└── pages/                 ← role-aware screens; schemes/ holds all scheme UIs
```

## NAVIGATION — EXACT BEHAVIOR REQUIRED

- EVERY role lands on AttendanceHome after login — no exceptions, even MD.
- Profile lives at the TOP RIGHT (name, role badge, branch, logout). Not in
  bottom nav.
- Bottom nav is the ONLY main navigation, 4 tabs:
  `[ Home ] [ Attendance ] [ Money ] [ Alerts ]`
  - **Home**: role-aware dashboard (own stats for SO/ABM; team summary for BM;
    branch overviews for GM/Director/MD; needs-action counts for Branch Admin).
  - **Attendance**: office GPS check-in + 3-step field wizard + history;
    Branch Admin gets the no-smartphone marking list + correction panel;
    MD sees the org-wide report instead of self-marking.
  - **Money**: MoneyManagementPage deep-links to collections, history, wallet,
    rankings, all schemes, incentives, salaries.
  - **Alerts**: AlertsTab — pending sign-offs, no-smartphone employees
    awaiting action, operational reminders.
- Mobile-first, max-width 390px for attendance flows; AdminDashboard and
  ManagementControlCenter are full-width desktop.

## GSTACK (author's local tooling — optional)

The repo author uses [gstack](https://github.com/garrytan/gstack) skills in
Claude Code. If installed (`~/.claude/skills/gstack`), prefer `/browse` for
all web browsing (never `mcp__claude-in-chrome__*` directly), and route:
bugs → `/investigate`; QA → `/qa`; code review → `/review`; ship/deploy →
`/ship` or `/land-and-deploy`; architecture review → `/plan-eng-review`;
design polish → `/design-review`; full pipeline → `/autoplan`. Known
limitation: `/browse` headless mode is blocked in sandboxes but works
locally. If gstack is not installed, ignore this section.
