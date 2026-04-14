# CLAUDE.md — EMS Employee Management System

This file provides guidance to Claude Code when working 
with this repository. Read everything before touching code.

---

## WHAT THIS PROJECT IS

An internal workforce management platform for a company
with ~1,500 employees across multiple branches.

Not a public app. Every user is an employee or a client
tied to the business.

Currently building: ATTENDANCE MODULE only.
Next after attendance: Money tracking module.
After that: Messaging module.

---

## COMMANDS

### Development (from repo root)
```bash
npm run dev          # Runs API, Worker, and Frontend together
```

### Individual workspaces
```bash
npm run dev -w @attendance/api      # API only (port 3000)
npm run dev -w @attendance/worker   # Worker only
npm run dev -w frontend             # Frontend only (port 5173)
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
  Each module has *.routes.ts + *.service.ts
  Modules: auth, attendance, branches, users, transactions

Shared (`src/shared/`):
  permissions.ts     → RBAC helpers
  errors.ts          → AppError subclasses
  hierarchy.ts       → recursive CTE + Redis cache
  attendance-scope.ts → scope-based data access by role

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

Migrations in `apps/api/migrations/`:
1. 001_init.sql               — users, branches
2. 002_attendance.sql         — attendance, attendance_audit
3. 003_transactions_messages.sql — transactions, messages
4. 004_user_oversight_branches.sql — director/gm multi-branch

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
sess:{userId}              JWT session cache       TTL: 8h
user:{userId}              User data cache         TTL: 30min
hier:subtree:{userId}      Subtree IDs cache       TTL: 1h
att:{userId}:{date}        Dupe guard              TTL: 24h
att:summary:{branchId}     Branch summary cache    TTL: 5min
rl:{userId}                Rate limit counter      TTL: 60s
```

---

## ENVIRONMENT VARIABLES

apps/api/.env
```
DATABASE_URL=
REDIS_URL=
JWT_SECRET=          (min 32 characters)
JWT_EXPIRES_IN=8h
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET_NAME=
FRONTEND_URL=http://localhost:5173
PORT=3000
```

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

### Existing files
```
frontend/src/
├── components/
│   ├── Button.jsx
│   ├── Card.jsx
│   ├── GlassModal.jsx
│   ├── StatusChip.jsx
│   └── HistoryCalendar.jsx
├── pages/
│   ├── AttendanceHome.jsx  ← main page for all roles
│   ├── AdminDashboard.jsx  ← overview for admin roles
│   ├── UserManagement.jsx  ← staff management
│   └── Login.jsx
├── store/
│   ├── api/apiSlice.js     ← ALL RTK Query endpoints here
│   └── slices/authSlice.js ← auth state
├── App.jsx                 ← routing and layout
└── main.jsx
```

### Design system (never change these)
Colors: navy (#0B1C30), indigo, emerald, surface
CSS classes: gradient-primary, gradient-yellow,
             card-shadow, glass, tactile-press
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

Not built yet.
Show a clean "Coming soon" placeholder.
Do not wire any logic.

── ALERTS tab ─────────────────────────────────────────

Not built yet.
Show empty state placeholder.
Do not wire any logic.

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

## WHAT IS BUILT

- ✅ Monorepo + npm workspaces
- ✅ Shared TypeScript types
- ✅ Database migrations (all 4 SQL files)
- ✅ API config (env, db, redis, s3)
- ✅ Shared utilities (hierarchy, permissions, errors)
- ✅ Attendance schema, queue, service, routes
- ✅ Fastify app.ts + index.ts + auth routes
- ✅ BullMQ worker (separate service)
- ✅ Login page
- ✅ AttendanceHome (office + field flows)
- ✅ AdminDashboard
- ✅ UserManagement
- ✅ Redux store + RTK Query

## WHAT STILL NEEDS BUILDING

- ⬜ Fix App.jsx — all roles go to AttendanceHome on login
- ⬜ Add director to admin roles list in App.jsx
- ⬜ Remove floating top-right tab bar from App.jsx
- ⬜ Add profile section top-right (name, role, logout)
- ⬜ Add bottom nav with 4 tabs (Home, Attendance, Money, Alerts)
- ⬜ Make Home tab content role-aware
- ⬜ Make Attendance tab content role-aware
- ⬜ Money tab placeholder
- ⬜ Alerts tab placeholder
- ⬜ WebSocket confirmation (spinner → green checkmark)
- ⬜ Branch admin attendance panel

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