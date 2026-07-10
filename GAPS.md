# GAPS.md — Honest audit of weaknesses

> Ordered by severity, most important first. Every entry has: what, where,
> why it matters, and a fix scoped small enough to execute as one task.
> Companion docs: `PROJECT.md` (architecture), `CLAUDE.md` (operational rules).

---

## SEVERITY: CRITICAL

### 1. Real-looking credentials committed to a public repository
- **What:** Seed scripts contain hardcoded passwords that look like (or are)
  production credentials, and print them to the console:
  - `apps/api/scripts/seed_md.ts` → `MD@Admin2026` (the MD account)
  - `apps/api/scripts/seed_management.ts` → `Mgmt@Avg2026`
  - `apps/api/scripts/seed_branch_admins.ts` → `BranchAdmin@123` (shared by
    every branch admin)
  - `apps/api/scripts/seed_gmail_branch_admins.ts`, `seed_hierarchy.ts`,
    `seed_thirupathi_and_sutha.ts` (→ `qwertyuiop`, seeding what appear to be
    real named employees)
  - `apps/api/seed.js` → `password123`
- **Where:** `apps/api/scripts/*.ts`, `apps/api/seed.js`
- **Why it matters:** This repository is public on GitHub. If any of these
  passwords were ever used on the deployed Railway instance (the naming and
  the real branch/employee names strongly suggest they were), anyone can log
  in as MD or Management and read/modify payroll, incentives, and customer
  financial data. Even if since rotated, the pattern will repeat on the next
  seed run.
- **Fix (single task):** Change every seed script to read the password from an
  env var (`SEED_PASSWORD` or per-script vars) and exit with an error if
  unset; delete the `console.log` lines that print credentials. Then, as an
  operational follow-up outside the code: rotate the MD, Management, and all
  branch-admin passwords in production, and consider making the repo private —
  it also contains real employee names, branch locations, and commission
  amounts.

### 2. Migration runner can permanently skip half of a migration file
- **What:** `run_migrations.js` wraps each file in BEGIN/COMMIT (good), but on
  failure it checks for "already exists" error codes (42P07 etc.) and, if
  matched, **records the whole file as applied and continues**. Because the
  transaction was rolled back, any statements *after* the duplicate-object
  statement in that file were undone — yet the file is now marked applied and
  will never run again.
- **Where:** `run_migrations.js` (the `ALREADY_EXISTS_CODES` catch branch)
- **Why it matters:** A multi-statement migration like `CREATE TABLE x; ALTER
  TABLE y ADD COLUMN z;` where `x` already exists leaves `y` silently missing
  column `z`, with no error anywhere. On an 80-file, frequently-hotfixed
  migration set (see #12), this is a live footgun for schema drift between
  environments.
- **Fix (single task):** In the catch branch, only auto-record the file if it
  contains a **single** SQL statement (or drop the tolerance entirely and
  instead provide a `--mark-applied <file>` flag for the legacy-DB case).
  Print a loud warning telling the operator to verify the schema manually.

### 3. JWTs cannot be revoked; logout and password change don't invalidate tokens
- **What:** Logout only deletes the Redis profile cache (`user:{id}`); the JWT
  itself remains valid for its full 8-hour life. Changing a password, or an
  admin deactivating an account, does not invalidate outstanding tokens
  either — `authenticate` only does `jwtVerify()`, and `is_active` is checked
  at login, not per request (services that hit the cached profile won't notice
  deactivation for up to 30 min, and pure-JWT routes never will within 8 h).
- **Where:** `apps/api/src/plugins/auth.plugin.ts`,
  `apps/api/src/modules/auth/auth.service.ts` (login/logout/changePassword)
- **Why it matters:** A stolen phone or a terminated employee keeps full API
  access for up to 8 hours in a system holding customer money data. The
  `sess:{userId}` key documented in CLAUDE.md's Redis table isn't actually
  used as a session gate.
- **Fix (single task):** Add a `token_version` (integer) column to `users`;
  include it in the JWT payload at login; in `fastify.authenticate`, after
  `jwtVerify()`, compare against a Redis-cached copy of the user's current
  version (fallback to DB on miss, 60 s TTL) and 401 on mismatch. Bump the
  version on logout-all, password change, and deactivation.

---

## SEVERITY: HIGH

### 4. Per-user rate limiting almost certainly keys by IP instead
- **What:** `@fastify/rate-limit` is registered globally with
  `keyGenerator: (request) => request.user?.id ?? request.ip`, and a comment
  claims registering it after the auth plugin makes `request.user` available.
  But the auth plugin only *decorates* `fastify.authenticate`; JWT
  verification runs as a **route-level** `onRequest` hook, and global plugin
  hooks run **before** route-level hooks. So `request.user` is undefined when
  the limiter runs, and everyone falls back to `request.ip`.
- **Where:** `apps/api/src/app.ts` (rate-limit registration)
- **Why it matters:** A whole branch office behind one NAT shares a single
  300 req/min bucket — morning check-in surges plus dashboard polling can
  429 legitimate users; conversely, an attacker rotating IPs is barely
  limited. The comment also actively misleads future maintainers.
- **Fix (single task):** In `keyGenerator`, decode the bearer token directly
  (e.g. `fastify.jwt.decode(request.headers.authorization?.slice(7))`) and
  key on its `id`, falling back to IP for anonymous routes; or add a global
  `onRequest` hook before the limiter that runs `jwtVerify()` leniently.
  Verify with a two-user test from one IP.

### 5. Essentially zero automated test coverage on money-moving code
- **What:** The entire API test suite is two pure-helper files:
  `shared/geo.test.ts` and `shared/scheme-period.test.ts`. The frontend has no
  tests at all (acknowledged in `TODOS.md` item 2). Nothing covers:
  incentive distribution (both modes, higher-role absorption, rounding),
  hierarchy scoping (peer exclusion, GM cascade, cache busting), the
  attendance `ON CONFLICT`/absent-overwrite semantics, backdate/reconciliation
  guards, chit prize formula, room combine, or scheme corrections.
- **Where:** `apps/api/src/**` (vitest is already wired: `npm test -w
  @attendance/api`)
- **Why it matters:** These are the load-bearing paths from PROJECT.md §4.
  Every scheme added so far has touched `employee_incentives`; a regression
  pays people wrongly and is discovered by an angry employee, not a CI run.
- **Fix (single task, repeatable):** Start with one file:
  `modules/incentives/incentives.service.test.ts` covering
  `distributeIncentives` fixed_chain (SO dealmaker, BM dealmaker absorbing
  SO+ABM+BM, missing rules → zero + warn) and percent_referrer (rounding via
  `roundMoney`). Mock `db.query` per statement or run against a disposable
  Postgres. Each subsequent task adds one service's tests.

### 6. No CI whatsoever
- **What:** There is no `.github/workflows/`, no lint/build/test gate. `tsc`
  errors, ESLint violations, and broken builds reach `main` unchecked.
- **Where:** repo root
- **Why it matters:** With one developer and no reviews, CI is the only safety
  net. The existing (tiny) test suite isn't even executed automatically.
- **Fix (single task):** Add `.github/workflows/ci.yml` with one job: checkout,
  Node 22, `npm ci`, `npm run build` (root script builds shared-types + all
  workspaces), `npm test -w @attendance/api`, `npm run lint -w frontend`.

### 7. Worker dependencies are all `"latest"`
- **What:** `apps/worker/package.json` pins every dependency and devDependency
  to `latest` (bullmq, pg, ioredis, dotenv, typescript…).
- **Where:** `apps/worker/package.json`
- **Why it matters:** Railway runs `npm install` at build time; a breaking
  major release of BullMQ or pg lands in production silently on the next
  deploy. Also drifts from the API's pinned versions of the *same* libraries
  (two BullMQ versions talking to the same queues is a real incompatibility
  risk).
- **Fix (single task):** Copy the caret-pinned versions from
  `apps/api/package.json` for the shared libraries (bullmq, pg, ioredis,
  dotenv) and pin the dev deps similarly; run `npm install` to update the
  lockfile; deploy and watch worker logs.

---

## SEVERITY: MEDIUM

### 8. Gold Coin and LSS modules are ~4,800 lines of near-duplicate code
- **What:** `modules/gold-coin/` and `modules/lss/` each contain
  rooms/slots/draws/combine services plus a status machine with the same
  structure and largely the same logic (rooms of N slots, forming →
  pending_combine → active, monthly draws, head-branch combine). Chit repeats
  parts of the pattern a third time (its comments even say "exactly as
  GoldCoin/LSS do").
- **Where:** `apps/api/src/modules/gold-coin/*`, `apps/api/src/modules/lss/*`,
  parts of `apps/api/src/modules/chit/chit.service.ts`
- **Why it matters:** Bug fixes must be applied 2–3 times and historically
  weren't always (compare the two `status-machine.ts` files). Any new
  room-based scheme will clone a third copy.
- **Fix (single task, incremental):** Don't attempt a big-bang merge. Extract
  ONE shared helper first — e.g. a generic
  `shared/room-scheme/status-machine.ts` parameterised by slot count and
  status names — and make both modules import it. Repeat per concern
  (combine, stale-forming promotion) only after each extraction ships clean.

### 9. Socket.io CORS ignores `ALLOWED_ORIGINS`
- **What:** REST CORS unions `FRONTEND_URL` + `ALLOWED_ORIGINS` + localhost;
  the Socket.io server only allows `FRONTEND_URL` + localhost.
- **Where:** `apps/api/src/plugins/socket.plugin.ts` vs `apps/api/src/app.ts`
- **Why it matters:** Any additional origin (staging domain, second frontend)
  gets REST but silently fails websockets — attendance confirmations never
  arrive and users see eternal spinners; a class of "works in prod, broken on
  staging" bugs.
- **Fix (single task):** Build the same `[...new Set([FRONTEND_URL,
  ...ALLOWED_ORIGINS])], localhost-regex` array in the socket plugin (extract
  a tiny `shared/cors-origins.ts` used by both).

### 10. Localhost origins are allowed by CORS in production
- **What:** The `/^http:\/\/localhost:\d+$/` regex is unconditionally in the
  REST and socket origin lists, regardless of `NODE_ENV`.
- **Where:** `apps/api/src/app.ts`, `apps/api/src/plugins/socket.plugin.ts`
- **Why it matters:** With `credentials: true`, any malicious page served from
  an attacker's local process (or a victim's compromised localhost app) can
  make credentialed calls to the production API from a logged-in browser.
  Low exploitability (tokens are in Redux, not cookies) but it's free to fix.
- **Fix (single task):** Include the localhost regex only when
  `env.NODE_ENV !== 'production'`.

### 11. Attendance dupe key can lock a user out for 24 h if enqueue fails
- **What:** `submitAttendance` sets `att:{userId}:{date}` with NX **before**
  `addAttendanceJob()`. If the BullMQ enqueue throws after the key is set
  (Redis blip between the two calls, queue full), the request 500s but the
  key survives → every retry is a 409 "already marked" until midnight+.
  `recoverFailedAttendanceJobs` only re-drives jobs that made it into the
  queue.
- **Where:** `apps/api/src/modules/attendance/attendance.service.ts`
  (Step 4/5), same pattern in the admin-mark and sign-off paths
- **Why it matters:** Rare but unrecoverable by the user; support burden lands
  on branch admins who have no tool to clear the key (only correction flows
  delete it).
- **Fix (single task):** Wrap `addAttendanceJob(jobData)` in try/catch; on
  failure `redis.del(dupeKey)` (best-effort) before rethrowing. Apply to all
  three enqueue sites.

### 12. Migration churn shows schema is being designed against production
- **What:** The migration history contains full reverts and re-fixes:
  `032_gold_coin_full_packages` → `033_revert_gold_coin_full_packages`,
  `048_builders_fix_cash_payout` → `049_builders_restore_cash_bonus`,
  `027_fix_project_codes`, `055_builders_remove_stale_commission_rule`,
  `064_fix_void_status_checks`, plus environment-specific data migrations
  (`035/036_set_head_branch_*`) baked into the schema history.
- **Where:** `apps/api/migrations/`
- **Why it matters:** Mostly historical (can't rewrite applied migrations),
  but it signals there is no staging database: schema experiments run live.
  Data migrations that reference environment-specific rows (a branch named
  "Tiruvannamalai", a specific admin) will break on a fresh database if that
  data doesn't exist.
- **Fix (single task):** Verify migrations 035/036 are written defensively
  (no-op with a NOTICE when the target row is absent — fix if not), and add a
  `migrations/README.md` stating the rules: never edit applied files,
  environment-specific data changes must be idempotent no-ops elsewhere,
  and reverts get a new numbered file.

### 13. Frontend period helper uses device-local time; server uses IST
- **What:** `frontend/src/lib/schemePeriod.js` computes "today's period" from
  `new Date()` in the browser's timezone; the server uses
  `getCompanyToday()` (Asia/Kolkata). The server file's comment says only
  "keep PERIOD_START_DAY in sync" — timezone divergence is unhandled.
- **Where:** `frontend/src/lib/schemePeriod.js`,
  `frontend/src/lib/date.js` vs `apps/api/src/shared/date.ts`
- **Why it matters:** On the 6th/7th of each month, a user whose phone is not
  on IST (traveling, wrong device TZ) sees a different "current period" than
  the server enforces — backdate guards will reject entries the UI presents
  as valid, and dashboards can show the wrong period's numbers.
- **Fix (single task):** Add an IST-now helper to `frontend/src/lib/date.js`
  (`Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })`, mirroring the
  server) and use it inside `getPeriodForDate`'s default argument.

### 14. `SchemeCorrectionsPage.jsx` (2,029 lines) and `apiSlice.js` (2,277 lines) are monoliths
- **What:** The corrections console implements per-scheme edit/unpay/delete UI
  for seven schemes in one file; `apiSlice.js` holds ~230 endpoints in one
  file. `ManagementControlCenter.jsx` (1,194 lines) is close behind.
- **Where:** `frontend/src/pages/schemes/SchemeCorrectionsPage.jsx`,
  `frontend/src/store/api/apiSlice.js`,
  `frontend/src/pages/ManagementControlCenter.jsx`
- **Why it matters:** For smaller models especially, these files exceed
  comfortable edit windows; unrelated schemes' UI regress together; RTK Query
  supports `injectEndpoints` precisely to avoid the single-file slice.
- **Fix (single task):** Split `apiSlice.js` only: keep `createApi` +
  tagTypes in `apiSlice.js`, move endpoints into
  `store/api/endpoints/<domain>.js` files using
  `apiSlice.injectEndpoints({ endpoints })`, re-export the hooks. No behaviour
  change; page splits can follow later per scheme.

### 15. `hasSmartphone`/role changes leave stale 30-min profile cache
- **What:** `user:{userId}` profile cache (30 min TTL) is written at login and
  read by `/me`. Admin-side changes (deactivate, role change, smartphone flag)
  bust hierarchy caches but a stale profile can persist unless every mutation
  path remembers to `redis.del(user:{id})` — verify coverage is complete;
  at least deactivation relies on next-login checks (see #3).
- **Where:** `apps/api/src/modules/auth/auth.service.ts`,
  `apps/api/src/modules/users/user.service.ts`
- **Why it matters:** A user toggled to no-smartphone may still self-mark via
  a client that trusts `/me`; server-side re-checks catch the write, but the
  UX contradicts itself for up to 30 min.
- **Fix (single task):** Grep every UPDATE on `users` in `user.service.ts` and
  ensure each is followed by `redis.del(\`user:${id}\`)`; add the missing ones.

---

## SEVERITY: LOW (tech debt, hygiene, inconsistencies)

### 16. Dead one-off scripts and artifacts in the repo root
- **What:** `query.js`–`query4.js` (ad-hoc prod-debugging scripts with
  hardcoded UUIDs of "Admin Super"/"HQ San Francisco" test users),
  `scratch/scratch.txt` (a stray sentence), `EMS_Collection_Example.xlsx`,
  and `packages/shared-types/src/index.js` (a compiled build artifact checked
  into `src/` next to `index.ts`).
- **Where:** repo root, `scratch/`, `packages/shared-types/src/`
- **Why it matters:** Noise for every future agent; the compiled `index.js`
  in `src/` can shadow/confuse builds and will silently go stale versus
  `index.ts`.
- **Fix (single task):** Delete `query*.js`, `scratch/`, and
  `packages/shared-types/src/index.js`; add `packages/shared-types/src/*.js`
  to `.gitignore`; move the xlsx into a `docs/` folder if still needed.

### 17. CLAUDE.md/AGENTS.md contained stale and garbled content
- **What:** Before this update, CLAUDE.md claimed migrations span "001 through
  022" (actual: 080), omitted the lss/chit/builders/land/reconciliation/
  pending-enrollments modules from its lists, contained a duplicated,
  free-floating "using react-router-dom" note and a doubled gstack section.
  `AGENTS.md` is a diverging near-copy.
- **Where:** `CLAUDE.md` (fixed by this knowledge transfer), `AGENTS.md`
  (still stale)
- **Why it matters:** These files steer every AI session; wrong facts get
  confidently repeated into code.
- **Fix (single task):** Regenerate `AGENTS.md` as a thin pointer: keep the
  Codex-specific preamble, then "see CLAUDE.md" — or copy the updated
  CLAUDE.md body verbatim. Do not maintain two divergent rulebooks.

### 18. Root `.env.example` disagrees with the API
- **What:** Root `.env.example` sets `PORT=3000` and omits `ALLOWED_ORIGINS`
  and all `WHATSAPP_*` vars; the API defaults to and documents 3001 and
  validates the WhatsApp vars in `env.ts`.
- **Where:** `.env.example`, `apps/api/.env.example`, `apps/api/src/config/env.ts`
- **Why it matters:** First-run friction; CLAUDE.md explicitly asks that
  `.env.example` stay in sync with new variables — it hasn't.
- **Fix (single task):** Sync both `.env.example` files with the full
  `envSchema` field list (empty values, comments), `PORT=3001`.

### 19. Two parallel permission systems
- **What:** `shared/permissions.ts` (boolean fns + assert fns) and
  `shared/role-constants.ts` (role sets + `hasRole` + resolve helpers) overlap;
  some routes use one, some the other, some inline `['md','gm'].includes(role)`
  checks.
- **Where:** `apps/api/src/shared/permissions.ts`, `role-constants.ts`, and
  scattered route files
- **Why it matters:** New RBAC rules get added to whichever file the author
  saw last; the CUSTOMER_EDITOR / SCHEME_ADMIN style sets are the newer,
  better pattern.
- **Fix (single task):** Add a header comment to `permissions.ts` declaring it
  frozen ("attendance-era helpers; add new rules as role sets in
  role-constants.ts"), and convert any raw inline `.includes` role arrays
  found by `grep -rn "\.includes(.*role" apps/api/src/modules` to named sets —
  one module per task.

### 20. Response-shape drift risk: three error paths
- **What:** Errors can be shaped by (a) `handleError()` in per-route
  try/catch, (b) the global `error-handler.plugin.ts`, and (c) ad-hoc
  `reply.code(...).send(...)` (e.g. auth plugin's 401, rate limiter's
  builder). They currently agree on `{ success:false, error:{code,message} }`
  but only by discipline.
- **Where:** `apps/api/src/shared/route-error-handler.ts`,
  `apps/api/src/plugins/error-handler.plugin.ts`, `auth.plugin.ts`, `app.ts`
- **Why it matters:** One divergent handler breaks the frontend's uniform
  `response.error.code` handling.
- **Fix (single task):** Export a `errorEnvelope(code, message, details?)`
  factory from `route-error-handler.ts` and use it in all four sites.

### 21. Frontend has ESLint but its findings aren't enforced anywhere
- **What:** `npm run lint -w frontend` exists; nothing runs it (no CI, no
  husky/pre-commit). The API has no lint script at all.
- **Where:** `frontend/package.json`, `apps/api/package.json`
- **Why it matters:** Style/quality rules exist only aspirationally.
- **Fix (single task):** Covered by #6 (CI); additionally add
  `"lint": "tsc --noEmit"` to the API package as a cheap type-check gate.

### 22. `TODOS.md` items are real and still open
- **What:** Three well-specified deferred tasks: BM entry card for the
  Customers page, frontend Vitest+RTL infrastructure, and an app-wide WCAG AA
  muted-text sweep (~80 files still use `text-navy/40` for informational text,
  ≈2.8:1 contrast).
- **Where:** `TODOS.md`, `frontend/src/pages/**`
- **Why it matters:** The accessibility item affects readability of money
  figures on cheap screens — a stated product concern.
- **Fix:** Execute as written in `TODOS.md`; each item is already scoped as a
  single task with grep commands and file targets. Start with item 1
  (smallest).
