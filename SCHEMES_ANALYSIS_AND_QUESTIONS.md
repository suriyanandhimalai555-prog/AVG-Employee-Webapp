# SCHEMES ARCHITECTURE & EXPERT CONSULTATION QUESTIONS
**Date:** 2026-06-04  
**Purpose:** Complete understanding of all schemes for perfection + clarifications needed from expert

---

## PART 1: WHAT ARE SCHEMES?

### Overview
Schemes are recurring financial products offered to employees/customers. The platform currently supports 5 schemes with a unified infrastructure for member management, payment tracking, and commission distribution.

### Current Schemes

| Scheme | Type | Members | Payment Flow | Earnings |
|--------|------|---------|--------------|----------|
| **Gold Scheme** | Monthly chit-like | Customers (by referrer) | Customer pays monthly | Referrer earns % on each payment |
| **Trading Academy** | Course enrollment | Customers | One-time enrollment fee | Enrollment chain (SO → ABM → BM → GM + Branch Admin) |
| **Gold Coin** | Lottery-based | Customers | Monthly participation | Customer wins full amount, referrer earns commission |
| **Chit (Agila)** | Group-based lottery | Customers (in groups) | Monthly group payments | Winner draws prize, commission walks chain |
| **LSS** | Slot-based savings | Customers | Monthly slot rent | Monthly draw with commission to referrer |

---

## PART 2: UNIFIED SCHEME BACKBONE

### Core Tables (Shared by ALL Schemes)

#### 1. **projects** (scheme registry)
```sql
id (UUID)
name (text)           — Display name (e.g., "Gold Scheme")
code (text, UNIQUE)   — Stable code (e.g., 'gold_scheme')
active (boolean)
created_at
```
- The `code` is **IMMUTABLE** — matches `scheme_code` in incentives and routes
- Central source of truth for which schemes exist

#### 2. **scheme_commission_rules** (payout rates)
```sql
id (UUID)
project_id (FK)       — Which scheme
role (text)           — sales_officer, abm, branch_manager, gm, branch_admin
amount (numeric)      — Either ₹ fixed or % for percent-based
rate_type (text)      — 'fixed' or 'percent'
created_at
```
- Each role in a scheme has one rule
- Reloaded per-payout via `IncentiveService.loadProjectRates()`
- Used by both Gold (percent mode) and Trading Academy (fixed chain mode)

#### 3. **employee_incentives** (unified ledger)
```sql
id (UUID)
user_id (FK)          — Employee who earned
amount (numeric)      — Positive credit
source_type (text)    — 'collection', 'gold_scheme', 'direct_cash', 'other'
scheme_code (text)    — Denormalized; e.g., 'gold_scheme' for cross-scheme queries
source_id (UUID)      — Points to gold_scheme_members.id, gold_coin_slots.id, etc.
source_description (text) — "Gold enrollment: Ravi Kumar – Chit #001"
payment_event (text)  — 'enrollment', 'renewal', 'monthly_draw', etc.
credited_by (FK)      — Which user recorded this payout
created_at
```
- **Single source of truth for all incentive payouts**
- Rows are APPENDED, never updated/deleted (immutable ledger)
- Wallet balance = SUM(amount) GROUP BY user_id
- Queries aggregate by scheme_code to build dashboards

#### 4. **customers** (sole source of customer truth)
```sql
id (UUID)
branch_id (FK)        — Customer belongs to one branch
name, phone, address
customer_code (text)  — Stable identifier; prefixed by branch (e.g., "BR001-CUST-0042")
created_at
```
- **Every scheme member** references `customers.id`
- No customer can appear in two schemes in different branches
- Customer data is denormalized (name, code, phone) into each scheme's _members table for performance

---

### Commission Distribution Modes

Every scheme uses **IncentiveService.distributeIncentives()** which supports two modes:

#### Mode 1: **fixed_chain** (Trading Academy)
- Walk the org hierarchy: dealMaker → manager → manager → ... → GM, then + branch_admin
- Each level earns a fixed ₹ amount per the commission rules
- **Example:** SO refers training, SO gets ₹500, ABM gets ₹300, BM gets ₹200, GM gets ₹100, plus branch_admin gets ₹250
- All credited on **enrollment date**

#### Mode 2: **percent_referrer** (Gold, Chit, Gold Coin, LSS)
- Only the **dealMakerUserId** (referrer) earns
- Amount = baseAmount × (rate from commission_rules)
- **percentRole** distinguishes enrollment vs renewal (e.g., 'referrer_new', 'referrer_renewal')
- Gold: enrollment on sign-up, renewal on each month 2+
- Chit: on winner draw
- Gold Coin/LSS: on monthly draw or enrollment

---

## PART 3: INDIVIDUAL SCHEME DETAILS

### 1. GOLD SCHEME (gold_scheme)
**Status:** ✅ Shipped | **Backend:** Complete | **Frontend:** Complete

**Purpose:** Long-term savings chit where customer pays monthly, referrer earns commission.

**Tables:**
- `gold_scheme_members` — customer, chit_number, monthly_amount, total_months (default 12), referrer_id, status
- `gold_scheme_payments` — records each monthly payment

**Flow:**
1. Branch admin adds customer + referrer
2. Month 1 payment is **auto-recorded** on enrollment
3. IncentiveService credits referrer: `baseAmount × referrer_new_rate%`
4. Each subsequent month, branch admin records payment → credits referrer `baseAmount × referrer_renewal_rate%`
5. Status can be: active, completed, withdrawn

**Commission Rates (per scheme_commission_rules):**
- Referrer (new): 5% of monthly_amount
- Referrer (renewal): 2% of monthly_amount

**Queries & Aggregates:**
- `getBranchSummary()` — totals (active chits, monthly commitment, commission earned)
- `getOverviewByBranch()` — MD/Director dashboard (per-branch counts + commission)
- `getEntriesByBranch()` — drill-down list for dashboard

**Frontend:** SchemesPage → GoldSchemePage (list members, add member, record payment, view commissions)

---

### 2. TRADING ACADEMY (trading_academy)
**Status:** ✅ Shipped | **Backend:** Complete | **Frontend:** Complete

**Purpose:** One-time course enrollment; pays out across entire chain (SO → ABM → BM → GM + Branch Admin).

**Tables:**
- `trading_academy_members` — customer, course_code, enrollment_date, referrer_id, completion_date, status
- No payments table (single enrollment fee, no recurring)

**Flow:**
1. Branch admin selects customer + course + referrer
2. Fixed enrollment fee (₹1,500 or ₹2,000 per course code)
3. IncentiveService calls `fixed_chain` mode → all levels in hierarchy get fixed amounts
4. Optionally, customer marks course as complete

**Commission Rates (fixed_chain):**
- Sales Officer: ₹300
- ABM: ₹200
- Branch Manager: ₹150
- GM: ₹100
- Branch Admin: ₹250

**Special:** Branch admin is credited **in addition to** the hierarchy chain (not part of hierarchy).

**Queries:**
- `getBranchSummary()` — total enrollments, commission per referrer
- Dashboard aggregates

**Frontend:** SchemesPage → TradingAcademyPage

---

### 3. GOLD COIN SCHEME (gold_coin_scheme)
**Status:** ⚠️ Shipped but Complex | **Backend:** Refactored into sub-services | **Frontend:** Complete

**Purpose:** Monthly lottery — customer pays monthly rent, one customer wins per month, referrer earns commission.

**Sub-services (facade pattern):**
- `packages.service.ts` — package templates (₹5k, ₹10k, ₹20k)
- `rooms.service.ts` — group/room concept (20 slots per room, auto-fill)
- `slots.service.ts` — individual customer slots (held → won or refunded)
- `draws.service.ts` — monthly lottery draw logic
- `combine.service.ts` — cross-branch combining for insufficient slots

**Tables:**
- `gold_coin_packages` — templates
- `gold_coin_rooms` — group containers
- `gold_coin_slots` — customer slots (status: held, won, refunded)
- `gold_coin_draws` — draw events (date, winner_slot_id, prize_amount)

**Flow:**
1. Branch admin creates room (based on package template)
2. Customers add slots to room (₹rent per month)
3. Room auto-closes when full (20 slots) or after 30 days
4. Monthly draw: one customer wins, gets prize (**full_amount × multiplier**)
5. Referrer earns commission on draw win
6. If insufficient slots in branch for that month, **head branch admin** can combine across branches

**Commission:**
- On draw win: amount = monthly_amount × percent_rate (%)

**Special Cases:**
- **Combine logic:** Only branch_admin at HEAD BRANCH can combine rooms across branches
- **Lottery fairness:** Draw must be RANDOM, documented per compliance

**Queries:**
- Overloaded `getBranchSummary()`: single branch OR multi-branch aggregate
- Supports per-referrer scope or org-wide

**Frontend:** Complex UI for room creation, slot management, draw viewing

---

### 4. CHIT SCHEME (agila_chit_scheme) [NEWEST]
**Status:** 🔄 In Progress | **Backend:** Core logic written | **Frontend:** Pages created

**Purpose:** Group-based lottery where members form a group, pool money monthly, one member wins per draw.

**Key Constraints:**
- **MAX_MEMBERS = 20** per group
- **FILL_WINDOW_DAYS = 30** — group must fill within 30 days or transition to "pending_combine"
- Group starts with `current_month = 2` (M1 is skipped; member pays on join, draw happens M2)

**Prize Formula:**
```
winnerAmount = fullAmount × (9 + monthWon / 2)
```
- M2 win: fullAmount × 9.5
- M3 win: fullAmount × 10
- M12 win: fullAmount × 15
- Documented against scheme spec

**Tables:**
- `agila_chit_groups` — group (group_name, package_number, status, fill_deadline, current_month)
- `agila_chit_members` — group members (customer_id, monthly_amount, member_status)
- `agila_chit_payments` — monthly payments by member
- `agila_chit_draws` — draw events (group_id, month, winner_member_id, prize_amount)

**Status Transitions:**
- `forming` → `pending_combine` (lazy promotion when deadline passed)
- `forming` / `pending_combine` → `in_progress` (on first draw)
- `in_progress` → `completed` (on final draw)
- `in_progress` → `combined_into` (when combined into another group by head branch)
- `in_progress` → `expired` (if abandoned)

**Head Branch Logic:**
- Only **branch_admin at HEAD BRANCH** can:
  - Promote stale forming → pending_combine
  - Initiate combine of multiple groups
  - Assign winners across combined groups

**Commission:**
- On draw win: percent_referrer mode, credited to referrer

**Queries:**
- `getBranchSummary()` — group counts, statuses, commission
- Special handling for "pending_combine" groups

**Frontend:** Pages created (ChitSchemePage, ChitGroupDetailPage, ChitHeadBranchPage)

---

### 5. LSS SCHEME (lss_scheme)
**Status:** ✅ Shipped | **Backend:** Mirrors Gold Coin structure | **Frontend:** Pages created

**Purpose:** Monthly slot-based savings scheme; one customer wins monthly draw per 30 slots.

**Sub-services:**
- `plans.service.ts` — plan templates
- `rooms.service.ts` — group containers (30 slots per room)
- `slots.service.ts` — customer slots
- `draws.service.ts` — monthly draw
- `combine.service.ts` — cross-branch combining

**Differences from Gold Coin:**
- Slots per room: **30** (vs 20 for Gold Coin)
- Prize multiplier logic may differ (verify with expert)
- Rent per slot structure may be different

---

## PART 4: CRITICAL ARCHITECTURE QUESTIONS FOR EXPERT

### A. COMMISSION & INCENTIVE LOGIC

**Q1: Percent-based commission — how should it round?**
- Example: If monthly_amount = ₹5,001 and referrer_new rate = 5%, commission = ₹250.05
- Should we round DOWN (₹250), NEAREST (₹250), NEAREST_UP (₹251)?
- Currently: `parseFloat()` — keeps decimals. Will this cause issues in accounting reconciliation?
- **Scenario:** Over 1,000 Gold enrollments/year, decimal rounding errors could accumulate to ₹5-10k discrepancy

**Q2: Multiple referrers — what if customer already exists with a different referrer?**
- Current code allows gold_scheme_members to have referrer_id from ANY employee
- No validation that customer wasn't already referred by someone else
- Should we:
  a) Prevent duplicate customer-scheme combinations?
  b) Allow re-referrals but track first referrer separately?
  c) Allow unlimited referrals and sum all commissions?
- **Scenario:** Customer "Ravi" is a Gold member with SO1 as referrer. Later, ABM2 tries to add Ravi to same scheme with ABM2 as referrer. What happens?

**Q3: Half-amount commission — is it actually used?**
- Chit service has `half_amount` column, but I don't see it used in commission calculation
- Gold, Gold Coin, LSS don't mention half_amount at all
- Is this a legacy field, or is there a business rule I'm missing?
- **Scenario:** Group wins with half the pool size — should payout be half the commission?

**Q4: Commission timing — what if a payment is recorded out-of-order?**
- Gold allows `month_number` to be recorded any time (not strictly sequential)
- If M3 recorded before M2, do we still credit renewal commission (which triggers only on month > 1)?
- Should we enforce strict order, or allow backfill?
- **Scenario:** Branch admin forgets to record M2 payment, only records M3 later. Referrer should have earned both M2 and M3 commission, but did they?

---

### B. MEMBERSHIP & ELIGIBILITY

**Q5: Can the same customer be in multiple schemes simultaneously?**
- Current DB allows it (no unique constraint preventing it)
- Gold: customer in Gold + Trading Academy = 2 rows
- Gold Coin: customer in Gold Coin room A + Gold Coin room B = 2 rows
- Chit: customer in Chit group A + Chit group B = 2 rows
- Confusion: Should a customer be limited to **one active chit group at a time**?
- **Scenario:** Customer Ravi joins Chit group A (forming). Before group fills, he joins Chit group B (forming). Both groups deadline passes and they combine — where does Ravi go?

**Q6: Customer status — who decides when a customer becomes inactive?**
- `gold_scheme_members.status` can be: active, completed, withdrawn
- No one else checks/enforces this
- If a customer is "inactive" in one scheme, should they still be allowed to join another?
- **Scenario:** Customer "Priya" is marked "withdrawn" from Gold. Can she still join Trading Academy or Gold Coin?

**Q7: Customer code prefix — is it locked per branch?**
- Migration 020 seeds customer codes like "BR001-CUST-0001" per branch
- Code sequence is stored in `customer_code_sequences` per branch
- What if we need to:
  a) Transfer a customer to another branch?
  b) Merge two branches?
  c) Renumber codes retroactively?
- Currently, no renum logic exists

---

### C. GROUP & COMBINE LOGIC

**Q8: Chit group combine — what's the final algorithm?**
- Multiple "pending_combine" groups exist
- Head branch admin clicks "combine" — how do we decide:
  a) Which groups to combine?
  b) Which group is the "primary" (the others combine INTO it)?
  c) How do existing draw schedules merge?
  d) If combined group now has > 20 members, split again?
- Current code doesn't show the combine endpoint — is it implemented?

**Q9: Gold Coin room auto-fill logic — what happens at deadline?**
- Room created with 30-day fill window
- If only 15 slots filled after 30 days, what happens?
  a) Room closes with 15 slots and runs a 15-person draw?
  b) Room combines with another nearby room?
  c) Room is cancelled and money refunded?
- Current code doesn't show this logic

**Q10: Draw fairness & randomness — how should the draw algorithm work?**
- Chit/Gold Coin/LSS all do monthly draws
- Who validates that the draw is actually random (no favoritism)?
- Should we:
  a) Use PostgreSQL RANDOM() (not cryptographically secure)?
  b) Use a third-party RNG?
  c) Log the draw + witness sign-off?
  d) Publish draws publicly for verification?
- **Scenario:** Competitor audit claims: "Your February draw favored branch Y more than statistical chance." How do you prove it was fair?

---

### D. REFUNDS & REVERSALS

**Q11: Payment refund logic — is it implemented?**
- `gold_coin_slots` has status "refunded"
- `lss_slots` has status "refunded"
- Chit members can be marked "cancelled" (membership cancelled, not just payment)
- Who can issue refunds? How is it recorded?
- If customer refunds a payment, do we:
  a) Reverse the commission to the referrer?
  b) Keep the commission (customer already got value)?
  c) Mark as partial?
- **Scenario:** Customer paid 3 months of ₹5k Gold, then decides to quit. Refund all ₹15k. Referrer already earned ₹750 commission. Reverse it?

**Q12: Partial payment — can a customer pay ₹2k when ₹5k is due?**
- Current schema just records `amount` paid, no "overdue" logic
- If customer is consistently late, who chases them?
- Is there a write-off after X months?
- **Scenario:** Chit member should pay ₹5k monthly, but after M3 they disappear. They owe M4-M12 (9 months = ₹45k). Can we force-refund them, or are they stuck as "in_progress" forever?

**Q13: Refunds and scheme_code — how do we track them?**
- Currently, reversal would be a NEW negative row? Or UPDATE the existing?
- If refund is a new row with negative amount, it shows in the ledger as separate transaction
- If update, we lose audit trail
- Is there a formal refund mechanism, or just "we'll credit them back via direct_cash source_type"?

---

### E. CROSS-SCHEME AGGREGATION

**Q14: Admin dashboard aggregation — should it exclude refunds/reversals?**
- `getOverviewByBranch()` sums collected payments for a scheme
- If 100 customers paid and 5 refunded, is the total: sum_all_paid - sum_refunds, or just sum_paid?
- **Scenario:** Gold collected ₹500k (100 customers × ₹5k), but 10 customers refunded ₹5k each. Dashboard shows ₹500k or ₹450k?

**Q15: Multiple schemes, same customer — what's the dashboard story?**
- Ravi is in Gold, Gold Coin, and Trading Academy
- When we build the customer view, do we:
  a) Show all three memberships?
  b) Allow filters by scheme?
  c) Aggregate commission across schemes?
- **Scenario:** Ravi's total incentive across all schemes is ₹15,000. Is there a "wallet" view showing it, or just per-scheme?

**Q16: Commission rates — how often can they change?**
- Currently, rates are in scheme_commission_rules and can be updated anytime
- If we change Gold referrer_new rate from 5% to 3% on June 1, does it apply retroactively to May enrollments?
- Should historical rates be locked per enrollment?
- **Scenario:** On June 1, you lower referrer rates. On June 5, auditor asks: "Why is May 28 enrollment charged at 5% and June 2 at 3%?" Can you explain?

---

### F. PAYMENT MODES & DELIVERY

**Q17: Payment mode variety — are there hidden assumptions?**
- Gold supports payment modes: cash, upi, bank_transfer (etc.?)
- What modes are actually valid? Is there a canonical list?
- If customer pays via UPI but we record as cash, does it break reconciliation with bank statements?
- **Scenario:** Customer pays ₹5k via UPI, but branch admin marks it as "cash" in the system. Auditor can't find the UPI receipt. How do we fix?

**Q18: Commission payout mechanism — how do employees actually receive their earnings?**
- Incentives are credited to `employee_incentives` table (a ledger)
- But how does "Ravi earned ₹500 commission" turn into "Ravi receives ₹500"?
- Is there a cash-out flow? A separate payout batch? Integration with salary?
- **Scenario:** Ravi earned ₹5,000 Gold commission in May. When does he get paid? June salary? On-demand? Never?

**Q19: Incentive taxation — should commissions be taxed?**
- Are the values in `employee_incentives` gross or net?
- If taxed, who calculates and deducts?
- Is there a separate tax table, or just a percentage deduction?
- **Scenario:** Ravi earns ₹5,000 commission. Is his taxable income ₹5,000 (before deductions), or is it already net?

---

### G. DATA INTEGRITY & VALIDATION

**Q20: Scheme stale promotion — is it scheduled or manual?**
- Chit `isStaleForming()` promotes forming → pending_combine lazily on read
- This means a group stuck in "forming" state won't auto-transition until someone queries it
- What if no one queries? Group stays "forming" forever?
- Should there be a scheduled job that runs nightly?

**Q21: Duplicate payment detection — is it robust?**
- Gold has a UNIQUE (member_id, month_number) constraint
- But what if two branch admins submit M2 payment simultaneously?
- Race condition: both pass the duplicate check, both try to INSERT, one fails with 23505
- Error handling converts to ConflictError, but the UI may not handle it gracefully
- **Scenario:** Network is slow, user clicks "Record Payment" twice. Does the second click fail, or silently succeed?

**Q22: Referrer validity — is a referrer always still employed?**
- Gold stores referrer_id pointing to users.id
- No FK constraint, and no check that user is is_active = true
- If referrer is deactivated/fired, commission still goes to that user_id
- Should we:
  a) Prevent enrollments with inactive referrers?
  b) Auto-reassign commissions to someone else?
  c) Flag warnings in the dashboard?
- **Scenario:** SO1 refers 50 Gold customers, then gets fired. All 50 members still have referrer_id pointing to ex-SO1. When they pay, ex-SO1 earns commission — is that intended?

**Q23: Branch admin as branch_admin — role-based validation**
- Many operations check `role !== 'branch_admin'` or similar
- But what if a user's role changes?
- Are there any cached checks that don't reflect the new role?
- **Scenario:** GM1 is promoted to Director. Old cached permissions still treat him as GM for the next 1 hour (hierarchy cache TTL). Does he see branches he shouldn't?

---

### H. MISSING FEATURES & GAPS

**Q24: Scheme membership audit trail — do we log who changed what?**
- When a member status changes from "active" to "withdrawn", there's no audit log
- Who made the change? When? Why?
- If auditor asks, we can't answer
- Should every status change be logged to an `audit_log` table?

**Q25: Refund reason tracking — why was a customer refunded?**
- Current refund logic allows status="refunded" but doesn't log reason
- Was it customer request? Complaint? Fraud? Admin correction?
- **Scenario:** Auditor questions 10 refunds in March. You can't tell them why each happened.

**Q26: Commission dispute resolution — is there a workflow?**
- What if a customer claims: "I was the one who referred, not the person you have on file"?
- Or: "The referrer shouldn't get commission because I'm an internal transfer, not a new customer"?
- Is there a dispute mechanism, or just manual DB fixes?

**Q27: Multi-currency support — are all amounts in INR?**
- All amounts stored as NUMERIC without a currency field
- Are we ever expanding internationally?
- If so, we need currency per transaction, not just amount

**Q28: Incentive clawback — if a scheme fails, can we reverse commissions?**
- Example: Chit group is in progress, then customer disputes the whole scheme
- Refund all members. But referrers already earned commission.
- Do we clawback their earnings?
- **Scenario:** Chit group "XYZ" is scammed (fake group). All customers refunded. Do referrers refund their ₹5k commission, or keep it?

---

### I. FRONTEND & UX CONCERNS

**Q29: Form validation — are there edge cases?**
- Add member form requires: customer, referrer, amount, dates
- What if referrer is inactive? Form should warn
- What if customer is already in this scheme? Form should prevent
- What if amount is > ₹1,000,000 (seems unrealistic)? Warning?
- Are these validated on frontend or just backend?

**Q30: Date inputs — what's the scope?**
- `PeriodDateInput` is clamped to current 7-to-7 period
- Some schemes may need historical date entry (backfill)
- Should we allow dates outside the current period? With approval?

**Q31: Commission display — gross or net?**
- When Ravi sees his commission, is it before or after tax/deductions?
- If he earned ₹1,000 but gets ₹750 after tax, which number does he see?

**Q32: Partial member list display — how many rows?**
- `getEntriesByBranch()` has LIMIT 500
- If a branch has 5,000 Gold members, we only show 500
- Should we paginate? Show a warning?

---

### J. BUSINESS RULE QUESTIONS

**Q33: Scheme exclusivity — can a customer be in competing schemes?**
- Can Ravi be in Gold AND Trading Academy simultaneously?
- Can Ravi be in Chit group A AND Chit group B?
- **Scenario:** Ravi is in Active Gold group (promise of 12 months). He joins Chit group and promises 12 months there too. Both schemes claim priority. What's the rule?

**Q34: Chit winner selection — is it actually random?**
- How are winners selected each month?
- Is it truly random, or does the system have say?
- Are there constraints (e.g., can't win twice)?

**Q35: Referrer eligibility — can any employee refer?**
- Currently, any user with a role can be a referrer
- Should we restrict referrals to certain roles (SO, ABM only)?
- Can MD refer? Director? Branch Admin?
- **Scenario:** MD1 refers a Gold customer. Does MD1 earn commission? (Policy says no, but code doesn't prevent it.)

**Q36: Commission timing for fixed_chain — is it immediate or batched?**
- Trading Academy uses fixed_chain mode
- All credits happen at enrollment time
- What if SO is deactivated before credits are applied? Do they still get paid?

**Q37: Scheme lifecycle — what defines "complete"?**
- Gold member is "completed" when?
  a) All 12 months paid?
  b) After 12 months (regardless of payment)?
  c) Customer marks it complete?
- **Scenario:** Gold customer paid 6 months, then cancelled. Status is "withdrawn" not "completed". Correct?

**Q38: Transfer between schemes — is it supported?**
- Can a customer's commitment in Gold be moved to Trading Academy (credited back)?
- Or is each scheme separate and transfers are manual refund + re-enrollment?

---

## PART 5: EXAMPLE SCENARIOS FOR EXPERT DISCUSSION

### Scenario 1: Gold Scheme Referral Dispute
**Context:**
- Customer "Ravi" enrolls in Gold on May 1, referred by SO1
- SO1 earns ₹250 (5% of ₹5,000 monthly) on enrollment
- Later, on June 10, SO1 is fired for misconduct
- On June 15, ABM2 claims: "Actually, I referred Ravi, not SO1"
- Both SO1 and ABM2 want the commission

**Questions:**
- Who gets the May 1 enrollment commission?
- Should we check who actually brought the customer in?
- Once paid, is it reversible?
- Is there an "edit referrer" feature, or is it locked at enrollment?
- Who has authority to change it?

---

### Scenario 2: Chit Group Combine at Deadline
**Context:**
- Head Branch has 3 forming Chit groups:
  - Group A: 12 members, deadline passed (should combine)
  - Group B: 18 members, deadline passed (should combine)
  - Group C: 8 members, deadline passed (should combine)
- Total: 38 members (can split into 2 groups of 20 + 18, but who decides?)
- Group A's referrer earned commission on 12 members
- If combined, referrer commission should follow the members

**Questions:**
- How do we decide which groups combine?
- Is it manual (head admin picks)? Automatic (algorithm)?
- When groups combine, do referrer commissions move with members?
- What if combined group > 20? Do we auto-split, or reject the combine?
- Are members notified of the change?
- Can a member opt out of the combined group?

---

### Scenario 3: Payment Refund & Commission Reversal
**Context:**
- Customer "Priya" enrolls in Gold, pays ₹5,000 month 1
- Referrer earns ₹250 commission immediately
- On day 20 of month 1, Priya requests a refund (changed her mind)
- ₹5,000 refunded to Priya
- Referrer's commission was already paid (credited to employee_incentives)

**Questions:**
- Should the referrer refund the ₹250 commission?
- Or is the commission "earned" once member pays (non-reversible)?
- If we reverse it, do we INSERT a negative row, or UPDATE the original?
- What if referrer already withdrew part of their commission (requested cash-out)?
- Is there a business rule: "Refunds only if requested within X days"?

---

### Scenario 4: Commission Rate Change Mid-Scheme
**Context:**
- Gold referrer_new rate is currently 5%
- On June 1, Company decides to drop it to 3% to reduce costs
- Existing members with 5% rate continue at 5%
- New members get 3%
- Question: What about members who enrolled on May 30 but payment was recorded on June 2?

**Questions:**
- Should we lock the rate at enrollment, or apply the current rate at payment time?
- How do we handle the transition?
- Should old rate apply to old members' renewals (M2+)?
- Or does rate apply per-payment-date?
- What's the audit trail? Who approved the rate change?

---

### Scenario 5: Inactive Referrer & Orphaned Commission
**Context:**
- ABM "Suresh" refers 20 Gold customers
- Suresh is deactivated on June 15 (voluntary departure)
- July 1st, all 20 customers' month 2 payments are recorded
- Commission should be credited to Suresh's account
- But Suresh is no longer with the company

**Questions:**
- Does commission still go to Suresh's ID? (He may cash it out later via HR)
- Or should it be reassigned to a manager/replacement?
- Is there a "handled by" field (a new person takes over)?
- What if Suresh disputes later: "I was deactivated unfairly, I deserve the June commission"?
- Is there a time-lock on commission claims?

---

### Scenario 6: Cross-Branch Gold Coin Combine
**Context:**
- Branch A: 3 Gold Coin rooms in progress (15 slots + 18 slots + 12 slots = 45 slots)
- Branch B: 2 Gold Coin rooms in progress (20 slots + 8 slots = 28 slots)
- Total: 73 slots (enough for multiple monthly draws)
- Head Branch admin wants to combine Branches A + B into one draw pool

**Questions:**
- What's the combine logic for Gold Coin?
- Do we physically move slots, or just link rooms?
- Do existing draws get recalculated?
- If referrers are from different branches, how are commissions handled?
- Should customers be notified?
- What if a room in Branch A is closed/refunded before combine? Does it still merge?

---

### Scenario 7: Tax Deduction on Commission
**Context:**
- Ravi earns ₹5,000 Gold commission in May
- Company policy: 10% TDS (tax deducted at source) on all commissions
- So Ravi should receive ₹4,500 net, ₹500 goes to tax authority
- Current system just shows ₹5,000 in employee_incentives (no tax field)

**Questions:**
- Should the ₹5,000 be gross or net?
- Who calculates and deducts the tax?
- Is it handled in the incentives module, or separate (salary system)?
- How do we track tax-deducted amounts per employee?
- Is there a monthly tax return filed?
- Does the system integrate with income tax portal?

---

## PART 6: SUMMARY OF KEY ISSUES TO RAISE

### Critical (Affects Business Logic)
1. ✅ **Commission rounding** — potential ₹5-10k discrepancies annually
2. ✅ **Referrer changeability** — can commissions be reassigned retroactively?
3. ✅ **Duplicate memberships** — same customer in same scheme twice?
4. ✅ **Refund reversal** — are commissions clawed back?
5. ✅ **Chit combine algorithm** — is the final logic sound?
6. ✅ **Draw fairness & randomness** — how is it verified?

### High Priority (Compliance & Audit)
7. ✅ **Audit trail** — who changed what and when?
8. ✅ **Tax handling** — gross vs net in system?
9. ✅ **Commission payout mechanism** — how does earnings → cash work?
10. ✅ **Historical rates** — should they be locked at enrollment?

### Medium Priority (UX & Data)
11. ✅ **Inactive referrer handling** — orphaned commissions?
12. ✅ **Stale group promotion** — scheduled vs lazy?
13. ✅ **Refund reason tracking** — why was customer refunded?
14. ✅ **Partial member list display** — pagination for > 500 members?

### Low Priority (Future-Proofing)
15. ✅ **Multi-currency support** — in case of international expansion?
16. ✅ **Scheme transfer** — can commitments move between schemes?
17. ✅ **Payment mode validation** — is the list canonical?

---

## FINAL CHECKLIST: Questions to Ask Expert

- [ ] Commission rounding strategy (down, nearest, up)?
- [ ] Multiple referrers per customer — allowed?
- [ ] Half-amount usage in chit/schemes?
- [ ] Out-of-order payment recording — enforce sequence?
- [ ] Customer in multiple schemes simultaneously?
- [ ] Customer status change rules?
- [ ] Chit combine final algorithm?
- [ ] Draw randomness validation method?
- [ ] Refund reversal policy (clawback commissions)?
- [ ] Commission payout mechanism (salary? batch? on-demand)?
- [ ] Tax handling (gross/net)?
- [ ] Rate lock (enrollment vs payment time)?
- [ ] Inactive referrer handling?
- [ ] Stale group promotion (scheduled vs lazy)?
- [ ] Refund reason audit trail?
- [ ] Duplicate payment prevention (race conditions)?
- [ ] Referrer validity checks (active/inactive)?
- [ ] Role change cache invalidation?
- [ ] Historical rate tracking?
- [ ] Multi-customer scheme transfers?

---

**Next Step:** Schedule meeting with expert, bring these scenarios + specific code examples
