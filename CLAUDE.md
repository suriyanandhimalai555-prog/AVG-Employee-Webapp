# CLAUDE.md — EMS Employee Management System

This file provides guidance to Claude Code when working 
with this repository. Read everything before touching code.

---

## WHAT THIS PROJECT IS

An internal workforce management platform for a company
with ~1,500 employees across multiple branches.

Not a public app. Every user is an employee or a client
tied to the business.

Currently shipped: attendance, money, branch management, user
management, customers, gold scheme, trading academy, incentives,
salaries, transactions. Active areas of work rotate — check
git log before assuming a module is or isn't being touched.

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

### Database migrations
```bash
node run_migrations.js
```

### Seed data
```bash
npm run seed:branches -w @attendance/api
```

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

Special role outside the chain:
- Branch Admin (1 per branch)
- Handles attendance operations for their branch only
- Not a manager, not in the reporting chain
- Cannot see other branches
- Cannot touch money or messages

How the tree is stored:
- Every user has manager_id pointing to direct boss
- This one field builds the entire company tree
- GM/Director multiple branches stored in 
  user_oversight_branches table (user_id, branch_id)

---

## WHO MARKS ATTENDANCE

Everyone marks attendance EXCEPT md and client.

| Role           | Marks attendance |
|----------------|-----------------|
| MD             | NO              |
| Director       | YES             |
| GM             | YES             |
| Branch Manager | YES             |
| ABM            | YES             |
| Sales Officer  | YES             |
| Branch Admin   | YES (own) + marks for no-smartphone employees |
| Client         | NO              |

---

## SMARTPHONE RULE

Every user has has_smartphone (true/false) on their record.
- true  → marks own attendance
- false → branch admin marks for them
- Server REJECTS self-mark if has_smartphone = false
- Only branch admin can change this flag
- Only for employees in their own branch

---

## VISIBILITY RULE

Everyone sees what the people below them are doing.

| Role           | Can see |
|----------------|---------|
| MD             | Entire org |
| Director       | All assigned branches + subtrees |
| GM             | All overseen branches + subtrees |
| Branch Manager | Their branch only |
| ABM            | Their team only |
| Sales Officer  | Own record only |
| Branch Admin   | Their branch only |
| Client         | Nothing |

Enforced using PostgreSQL recursive CTE walking
down the manager_id tree. Cached in Redis 1 hour.

---

## ARCHITECTURE

### Monorepo Structure
- `apps/api/`            — Fastify REST API (TypeScript)
- `apps/worker/`         — BullMQ background processor (TypeScript)
- `frontend/`            — React SPA with Vite
- `packages/shared-types/` — Shared TypeScript types

### Backend (apps/api)
Fastify app in `src/app.ts` registers plugins then modules.

Plugins (`src/plugins/`):
  db          → PostgreSQL pool → fastify.db
  auth        → JWT → fastify.authenticate decorator
  redis       → fastify.redis
  error-handler

Modules (`src/modules/`):
  Each module has *.routes.ts + *.service.ts (+ *.schema.ts for Zod)
  Modules: auth, attendance, branches, users, transactions, money,
           gold, gold-coin, incentives, salaries, trading-academy, customers, schemes

  The gold-coin module is intentionally decomposed into per-concern services
  (packages, rooms, slots, draws, combine) plus a status-machine helper —
  this scheme is more stateful than gold/trading-academy and the split keeps
  failure points localisable.

Shared (`src/shared/`):
  permissions.ts        → RBAC helpers
  errors.ts             → AppError subclasses
  hierarchy.ts          → recursive CTE + Redis cache (subtree + oversight)
  attendance-scope.ts   → scope-based data access by role
  route-error-handler.ts → handleError() + sendForbidden() — every route uses these
  transaction-helper.ts → runInTransaction() wrapper for BEGIN/COMMIT/ROLLBACK
  role-constants.ts     → canonical Role enum + role-set constants

### Schemes — one source of truth, one payout path

Every scheme (gold, trading academy, future chit funds / insurance / SIP …)
shares the same backbone and writes to the same ledger:

  projects                  → scheme registry (one row per scheme; .code is stable)
  scheme_commission_rules   → per-scheme per-role rates (rate_type='fixed'|'percent')
  customers                 → sole source of truth for customer data
  employee_incentives       → unified wallet ledger (source_type='scheme',
                              scheme_code + payment_event identify the source)
  IncentiveService.distributeIncentives(client, args)
                            → the ONLY way to write incentive rows. Modes:
                                fixed_chain      — walk dealMaker → GM + branch admin
                                percent_referrer — credit referrer baseAmount × rate%

Each scheme also has:
  <scheme>_members          → its own table (chit_number, monthly_amount, etc.)
  <scheme>_payments         → optional, if the scheme is recurring
  <scheme>.service.ts       → implements SchemeService contract (schemes/scheme.contract.ts)
  <scheme>.routes.ts        → REST surface (kept per-scheme; no /schemes/:code/* unified routes)

The registry at `modules/schemes/scheme.registry.ts` maps schemeCode → service
for cross-scheme code (admin dashboards, aggregate reports).

### Adding a new scheme

1. New migration: create <scheme>_members + optional <scheme>_payments tables.
   Reference customer_id, branch_id, entered_by like the existing schemes do.
2. Insert one row into `projects` with a stable `code` (e.g. 'chit_fund')
   and seed `scheme_commission_rules` for that project.
3. Create modules/<scheme>/ with routes + service + schema (Zod) files,
   following gold or trading-academy as templates.
4. The service exports `schemeCode` + `getBranchSummary(...)` to satisfy
   the SchemeService contract.
5. Inside addMember (and addPayment if recurring), call
   `IncentiveService.distributeIncentives(client, { schemeCode, mode, ... })`.
   Do NOT INSERT INTO employee_incentives directly.
6. Register the service in modules/schemes/scheme.registry.ts.
7. Register the routes in src/app.ts.
8. Frontend: add the route to `NAVIGABLE_SCHEMES` and an icon/colour entry
   to `SOURCE_META` in frontend/src/lib/schemeConstants.js.

### Async Processing (1,500 user surge)
Attendance submissions never write directly to DB.
Flow:
  1. Employee submits
  2. Redis atomic check: SET att:{userId}:{date} NX EX 86400
     - key exists → 409, stop (no DB hit)
     - key set    → continue
  3. Push job to BullMQ queue
  4. Return 202 immediately → user sees spinner
  5. Worker processes at 100 writes/sec max
  6. Worker writes to PostgreSQL
  7. Worker publishes to Redis pub/sub
  8. Socket.io pushes confirmation to user
  9. User sees green checkmark ✓

Worker: 20 concurrent jobs, max 100/sec, 3 retries.

### Frontend (frontend/)
- Redux Toolkit for global state
- RTK Query for ALL API calls (never raw axios in components)
- All endpoints defined in store/api/apiSlice.js
- Auth state in store/slices/authSlice.js

---

## DATABASE SCHEMA

Migrations in `apps/api/migrations/` are numbered SQL files. Run all of them
with `node run_migrations.js` from the repo root — the runner wraps each file
in BEGIN/COMMIT and records applied versions in `schema_migrations`, so
re-running is idempotent.

The migration set currently spans 001 through 022 and covers: core users
+ branches, attendance tables, transactions, money projects + collections,
user oversight branches, profile assets, employee salaries, incentives,
commission rules, trading academy, client prefix, customers, customer code
sequences.

Key constraints:
- attendance: UNIQUE (user_id, date)
- transactions: receiver_id must be sender's direct manager
- attendance_audit: REVOKE UPDATE/DELETE (immutable)

---

## API RESPONSE FORMAT

All endpoints return:
```json
{ "success": true, "data": {} }
{ "success": false, "error": { "code": "...", "message": "..." } }
```

202 = accepted and queued, not yet in DB.
Confirmation comes via WebSocket: attendance:confirmed

---

## REDIS KEY CONVENTIONS
```
sess:{userId}                JWT session cache              TTL: 8h
user:{userId}                User data cache                TTL: 30min
hier:subtree:{userId}        Subtree IDs cache              TTL: 1h
hier:oversight:{userId}      Director/GM oversight scope    TTL: 1h
att:{userId}:{date}          Self-mark dupe guard           TTL: 24h
att:absent:{userId}:{date}   Self-absent dupe guard         TTL: 24h
att:summary:{branchId}       Branch summary cache           TTL: 5min
rl:{userId}                  Rate limit counter             TTL: 60s
```
Hierarchy caches (`hier:subtree:*` and `hier:oversight:*`) are busted
together by `bustHierarchyCache(userId)` whenever a subordinate is
created, deactivated, or moved.

---

## ENVIRONMENT VARIABLES

apps/api/.env
```
DATABASE_URL=
REDIS_URL=
JWT_SECRET=                 (min 32 characters)
JWT_EXPIRES_IN=8h
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET_NAME=
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
PORT=3001
```
Never commit live secrets. The repo's `.gitignore` already excludes
`.env`, `.env.*`, and `apps/*/.env`. Keep `.env.example` files in sync
with any new variable added here.

frontend/.env
```
VITE_API_URL=http://localhost:3001/api
```

---

## EXISTING FRONTEND — READ BEFORE TOUCHING

### Rules
- ALL files are .jsx — new files must also be .jsx
- Never use .tsx in the frontend
- Do not rebuild or restructure existing components
- Do not change existing styling or CSS classes
- Work with what exists

### Shared frontend primitives (import from these, don't re-create)
```
frontend/src/
├── components/
│   ├── Button.jsx, Card.jsx, GlassModal.jsx, StatusChip.jsx
│   ├── HistoryCalendar.jsx, SchemeCalendar.jsx
│   ├── PeriodDateInput.jsx     ← clamped to current 7-to-7 period
│   ├── LoadingSpinner.jsx      ← all spinners go through this
│   ├── EmptyState.jsx          ← all "no data" panels go through this
│   ├── CustomerPicker.jsx
│   └── layout/                 ← Layout, Sidebar, Navbar, ScrollManager
├── lib/
│   ├── formatters.js           ← formatCurrency / formatDate / formatNumber
│   ├── constants.js            ← ROLES, ROLE_LABELS, PAYMENT_MODES, STATUS_COLORS
│   ├── tailwindClasses.js      ← INPUT_BASE, INPUT_COMPACT, CARD_BASE
│   ├── schemePeriod.js         ← 7-to-7 period helpers
│   └── date.js
├── pages/                      ← role-aware screens; lazy-loaded from App.jsx
├── store/
│   ├── api/apiSlice.js         ← ALL RTK Query endpoints here
│   └── slices/authSlice.js
├── App.jsx                     ← routing + lazy boundaries
└── main.jsx
```

### Design system
See **DESIGN.md** (repo root) for the authoritative design token table, muted-text
contrast tiers, card-vs-list rules, radii, and motion vocabulary.

Summary of active tokens (values live in `frontend/src/index.css` @theme):
- navy #0F1C2E · indigo #2563EB · emerald #059669 · surface #F8FAFC · border #E2E8F0
- CSS utilities: gradient-primary, gradient-yellow, card-shadow, glass, tactile-press

Motion rules (see DESIGN.md § Motion vocabulary):
- All motion constants import from `frontend/src/lib/motion.js` — no ad-hoc transition objects.
- `page` variant is enter-only (no exit). Never wrap `<Outlet/>` in `<AnimatePresence>` —
  doing so causes a mid-exit Suspense tear with React Router 7 lazy routes (blank screen bug).
- `GlassModal` uses the `modal` + `fade` variants from lib/motion.js.

Mobile-first, max-width 390px for AttendanceHome
AdminDashboard is full-width desktop layout

---

## NAVIGATION — EXACT BEHAVIOR REQUIRED

### After login — where each role lands
EVERY role lands on AttendanceHome first.
No exceptions. Even MD opens AttendanceHome on login.

### Profile
Profile is shown at the TOP RIGHT of the screen.
Shows: name, role badge, branch name, logout button.
Profile is NOT in the bottom nav.

### Bottom nav — 4 tabs
Located at the bottom of the screen.
This is the ONLY main navigation.
Remove the existing floating top-right tab bar 
(Overview/Staff buttons) from App.jsx.

Tabs: [ Home ] [ Attendance ] [ Money ] [ Alerts ]

── HOME tab ──────────────────────────────────────────

All roles land here after login.

  Sales Officer / ABM:
    Today's attendance status card
    Monthly stats (present, absent, field days)
    History calendar

  Branch Manager:
    Today's team attendance summary
    Present / absent / not marked counts
    Link to full team list

  GM / Director:
    All overseen branches overview
    Today's attendance % per branch
    Staff management card (opens UserManagement)

  MD:
    Org-wide stats
    All branches overview
    Staff management card (opens UserManagement)

  Branch Admin:
    Today's branch summary
    "Needs action" count — no-smartphone employees
    not yet marked today
    Staff management card (opens UserManagement)

── ATTENDANCE tab ─────────────────────────────────────

  Sales Officer / ABM / Branch Manager / GM / Director:
    Office check-in flow (existing GPS flow)
    Field check-in flow (existing 3-step wizard)
    Own attendance history

  Branch Admin:
    List of no-smartphone employees to mark
    Full branch attendance list
    Correction panel

  MD:
    Does NOT mark own attendance
    Shows org-wide attendance report

── MONEY tab ──────────────────────────────────────────

Implemented. Routes the user into the MoneyManagementPage which
in turn deep-links to collections, history, wallet, rankings,
schemes (gold + trading academy), incentives, and salaries.

── ALERTS tab ─────────────────────────────────────────

Implemented as `AlertsTab`. Shows pending sign-offs, no-smartphone
employees awaiting action, and operational reminders.

---

## EXISTING AttendanceHome.jsx — HOW IT WORKS

Internal views controlled by `view` state:
  'dashboard' → today status, stats, calendar
  'office'    → GPS check-in flow
  'field'     → 3-step wizard (photo → note → confirm)

Already working:
  GPS capture (navigator.geolocation)
  Photo capture via file input
  Direct S3 upload via presigned URL
  RTK Query submission
  Optimistic UI after submit
  Monthly history calendar

Existing RTK Query hooks:
  useGetSummaryQuery
  useSubmitAttendanceMutation
  useLazyGetUploadUrlQuery
  useGetHistoryQuery
  useGetMeQuery
  useLogoutMutation

New API calls must be added to apiSlice.js.
Never call the API directly from a component.

---

## BUILD STATE

The original "what's built / what's left" list was retired once
attendance + the money/scheme stack landed. Treat the codebase as
the source of truth: `apps/api/src/modules/*` lists every shipped
module, `frontend/src/pages/*` lists every shipped page, and
`apps/api/migrations/*` lists every applied schema change. Use
`git log` for recent work and the in-flight task list (if any)
for current direction.

---

## STRICT CODE RULES

1. ALL frontend files are .jsx — never .tsx
2. Never put business logic in route handlers
3. Never put DB queries outside service files
4. Every async function has try/catch
5. All API calls go through RTK Query in apiSlice.js
6. Never store S3 URLs — only S3 keys
7. Never overwrite original attendance data
8. Worker INSERT: ON CONFLICT (user_id, date) DO NOTHING
9. Redis dupe check: NX flag, null = already submitted = 409
10. All timestamps in PostgreSQL are TIMESTAMPTZ
11. TypeScript files: add one-line comment above every
    TS-specific line explaining what it does and why



    make everything a component like how a professional react dev do 
    using react-router-dom

---

## GSTACK

- Use the `/browse` skill from gstack for **all web browsing** — never use `mcp__claude-in-chrome__*` tools directly.

### Available gstack skills

`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`,
`/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`,
`/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`,
`/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`,
`/setup-gbrain`, `/retro`, `/investigate`, `/document-release`,
`/document-generate`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`,
`/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`,
`/learn`
    using react-router-dom

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
## gstack (recommended)

This project uses [gstack](https://github.com/garrytan/gstack) for AI-assisted workflows.
Install it for the best experience:

```bash
git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup --team
```

Skills like /qa, /ship, /review, /investigate, and /browse become available after install.
Use /browse for all web browsing. Use ~/.claude/skills/gstack/... for gstack file paths.
