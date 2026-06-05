# SCHEMES: BUSINESS LOGIC & EXPERT MEETING NOTES
**Purpose:** Understand how each scheme works, identify edge cases, clarify business rules

---

## WHAT IS A SCHEME?

A **scheme** is a savings/investment product where customers join and make regular or one-time payments. The employee who brings in the customer (referrer) earns a commission.

Think of it like: **Customer pays → Money collected → Referrer earns commission**.

---

## THE 5 SCHEMES WE HAVE

### 1. GOLD SCHEME
**What it is:** Long-term monthly savings plan

**How it works:**
- Customer joins for 12 months (or custom duration)
- Customer pays ₹5,000 every month (or custom amount)
- An employee (Sales Officer, ABM, etc.) brought in this customer = earns commission
- That employee gets 5% of the monthly amount on the first payment (₹250 from ₹5,000)
- For month 2 onwards, that employee gets 2% on each payment (₹100 per month)
- Total: 12 months × ₹5,000 = ₹60,000 collected from customer

**Example:**
- Ravi (customer) joins Gold on May 1st, referred by SO Akshay
- Ravi pays ₹5,000 on May 1st → Akshay earns ₹250 (5%)
- Ravi pays ₹5,000 on June 1st → Akshay earns ₹100 (2%)
- Ravi pays ₹5,000 on July 1st → Akshay earns ₹100 (2%)
- ... continues for 12 months

**Statuses:** Active → Completed (after 12 months) OR Withdrawn (customer quits early)

---

### 2. TRADING ACADEMY
**What it is:** One-time course enrollment

**How it works:**
- Customer pays ₹1,500 or ₹2,000 (one-time fee) for a trading course
- An employee (referrer) brought in this customer
- **Different from Gold:** The commission is NOT just to the referrer, but shared across the chain
  - Sales Officer who brought them: ₹300
  - ABM (their manager): ₹200
  - Branch Manager (ABM's manager): ₹150
  - GM (BM's manager): ₹100
  - Branch Admin (runs that branch): ₹250
- All paid from that ONE enrollment fee of ₹1,500 or ₹2,000

**Example:**
- Customer Priya enrolls in Trading Academy, referred by SO Ravi
- Enrollment fee: ₹1,500
- Ravi gets ₹300
- Ravi's ABM gets ₹200
- ABM's BM gets ₹150
- BM's GM gets ₹100
- Branch Admin gets ₹250
- Total paid out: ₹1,000 (company keeps ₹500)

**Note:** The ENTIRE chain gets paid in ONE day (enrollment day), not monthly

---

### 3. GOLD COIN SCHEME
**What it is:** Monthly lottery-style savings

**How it works:**
- A "room" is created with 20 available slots
- Customer buys one slot, pays ₹1,000 monthly rent (or custom amount)
- 20 customers = 1 room full
- Every month, one customer from the room WINS and gets ₹20,000 (or the pool amount)
- The employee who brought in that customer earns commission on their win (% of the win amount)
- Next month, another customer wins, and so on for 20 months
- After 20 months, all 20 customers have either won or missed — room ends

**Example:**
- Room "Gold Coin A" created with 20 slots at ₹1,000/month
- 20 customers join, referred by different employees
- Month 1: Customer Ravi (referred by ABM Akshay) wins ₹20,000 pool
- Akshay earns commission (let's say 5% = ₹1,000)
- Month 2: Customer Priya (referred by SO Ravi) wins ₹20,000
- Ravi earns commission
- ... continues for 20 months

**Edge case:** If only 15 slots filled after 30 days, does the room:
- Run with 15 people and adjust the prize?
- Combine with another branch's room?
- Cancel and refund everyone?
*(This is unclear — need to ask expert)*

---

### 4. CHIT SCHEME (Agila Chit)
**What it is:** Group-based monthly lottery where members form a group and pool money

**How it works:**
- A group is created with up to 20 members max
- Group has a 30-day deadline to fill all 20 slots
- Each member pays ₹5,000 monthly (or custom amount)
- Every month, ONE member of the group wins a prize
- Prize amount is NOT simple: **Prize = ₹100,000 × (9 + month_won/2)**
  - Member who wins in month 2: ₹100,000 × 9.5 = ₹950,000
  - Member who wins in month 3: ₹100,000 × 10 = ₹1,000,000
  - Member who wins in month 12: ₹100,000 × 15 = ₹1,500,000
- The employee who brought in the winner earns commission
- After all 20 members have either won or not, the group ends

**Example:**
- Chit group "Group A" created with ₹100,000 base and 30-day deadline
- 18 customers join within deadline, referred by various employees
- Group becomes "active" (past deadline, with 18 members, not 20)
- Month 2: Customer Ravi (referred by SO Akshay) wins ₹950,000
- Akshay earns commission
- Month 3: Customer Priya wins ₹1,000,000
- Her referrer earns commission
- ... continues until all 18 members have won (or some didn't win and forfeited)

**Special rules:**
- If group doesn't fill 20 slots within 30 days, what happens?
  a) Run with fewer members (18 instead of 20)?
  b) Combine with another group?
  c) Cancel and refund?
*(Unclear — need expert input)*

- What if someone joins late (day 35, after deadline)? Can they join?
*(Unclear)*

---

### 5. LSS SCHEME
**What it is:** Similar to Gold Coin but slightly different mechanics

**How it works:**
- A "room" is created with 30 slots (instead of 20 like Gold Coin)
- Customer buys one slot, pays monthly rent
- Every month, one customer wins a prize based on the pool
- The referrer earns commission

**Difference from Gold Coin:**
- More slots per room (30 vs 20)
- Prize calculation may be different (need to confirm)
- Payment/rent structure may vary

---

## EDGE CASES & QUESTIONS BY SCHEME

### GOLD SCHEME Questions

**Q1: What if customer changes their mind after month 1?**
- Customer Ravi paid month 1 (₹5,000), got invoiced commission to SO Akshay (₹250)
- On day 15 of month 1, Ravi wants a refund
- Does Akshay have to refund his ₹250 commission?
- Or is the commission "earned" and non-reversible?

**Q2: What if the same customer already has a Gold membership with a different referrer?**
- Ravi is a Gold customer, referred by SO1
- Later, ABM2 tries to add Ravi to Gold again with ABM2 as referrer
- Should we allow it (two Gold memberships)?
- Or prevent duplicates?

**Q3: What if referrer leaves the company?**
- SO Akshay refers 50 Gold customers
- Akshay gets fired on June 15
- On July 1, all 50 customers make their month 2 payment
- Does Akshay (now ex-employee) still earn the ₹100 per customer commission?
- Or does it go to someone else?

**Q4: Can customer be in multiple schemes at the same time?**
- Can Ravi be in Gold AND Trading Academy AND Gold Coin simultaneously?
- Any limits?

**Q5: Monthly amount variations — what if it changes?**
- Ravi joins at ₹5,000/month
- After 3 months, asks to lower to ₹3,000/month
- Commission recalculates based on new amount, or locked at original?

**Q6: Partial/late payments — what happens?**
- Ravi's month 2 payment is due on June 1
- He pays on June 20 (20 days late)
- Should we:
  a) Accept it as normal?
  b) Charge late fee?
  c) Disable the membership?
  d) Warn the branch admin?

---

### TRADING ACADEMY Questions

**Q1: What if referrer leaves before payout?**
- SO Ravi brings in customer, enrollment is processed
- Before the commission is paid, Ravi gets fired on the same day
- Does Ravi still get ₹300 commission, or is it forfeited?

**Q2: Multiple enrollments by same customer?**
- Customer Priya enrolls in "Basic Trading" course
- Later, she enrolls in "Advanced Trading" course with same referrer
- Does referrer get commission twice?

**Q3: Course completion — does commission depend on it?**
- Customer is charged ₹1,500 enrollment fee, referrer gets commission
- Customer completes 1 week of course, then drops out
- Should the commission be reversed?
- Or is it earned at enrollment (non-reversible)?

**Q4: Referrer eligibility — who can refer?**
- Can an MD refer a customer?
- Can a Director refer?
- Only Sales Officers and ABMs?

**Q5: Chain completion — what if a manager is missing?**
- SO Ravi brings in customer
- But Ravi doesn't have an ABM assigned (orphaned in org)
- The commission chain is: SO → ABM (missing) → BM → GM
- What happens to the ABM's ₹200 commission?
- Does it skip to BM?
- Does it stay in a pool?

---

### GOLD COIN Questions

**Q1: Incomplete room — what's the final rule?**
- Room has 20 slots available
- After 30 days, only 15 slots sold
- Options:
  a) Run draws with 15 people (so 15 winners, 5 slots wasted)?
  b) Combine room with another branch (add 5 more people)?
  c) Cancel and refund everyone?
- **Expert decision needed**

**Q2: Customer wins multiple times — possible?**
- Customer Ravi has 2 slots in same room (bought 2)
- Month 3: Slot 1 wins
- Month 7: Slot 2 also wins
- Does customer get prize twice?
- Or is there a "once per customer" rule?

**Q3: Draw randomness — how do we ensure fairness?**
- Monthly draw: one customer wins from 20
- How is the winner selected? Truly random?
- What if auditor questions: "Feb draw favored Branch A unfairly"?
- How do we prove it was fair?

**Q4: Cross-branch combining — when/how does it happen?**
- Branch A: Gold Coin room has 15 slots (not enough for viable draw)
- Branch B: Gold Coin room has 8 slots
- Can we combine them (23 total)?
- Who decides which rooms combine?
- Do customers get notified?
- What about referrer commissions when members from 2 branches mix?

**Q5: Refund during active draw — what happens?**
- Room is in month 5 of 20
- Customer Ravi (who has 1 slot) asks for refund
- His refund: ₹1,000 × 5 months paid = ₹5,000 back
- His referrer already earned commission on those 5 months (let's say ₹500)
- Does referrer refund the ₹500?

**Q6: Prize calculation — is it fixed or variable?**
- Prize pool = 20 × ₹1,000 = ₹20,000
- Customer wins ₹20,000 always?
- Or does it scale (₹25,000 in month 1, ₹15,000 in month 20)?

---

### CHIT SCHEME Questions

**Q1: Group doesn't fill by deadline — what happens?**
- Group deadline is 30 days
- After 30 days, only 18 members signed up (not 20)
- Do we:
  a) Run draws with 18 members (18 total winners)?
  b) Keep waiting for 2 more members?
  c) Combine with another group?
  d) Cancel?
- **Critical decision needed**

**Q2: Late join — can someone join after 30 days?**
- Deadline passed with 18 members
- Day 35, someone wants to join as member 19
- Should we allow it?
- Or is it locked?

**Q3: Winner selection fairness — especially important in Chit**
- Monthly draw should be random
- But prize amounts increase each month (₹950k in M2, ₹1.5M in M12)
- Members who join later have higher prize months
- Is there a fairness rule (each member rotates, not random)?
- Or truly random selection?

**Q4: Member cancels mid-cycle**
- 18 members in group, month 5 happening
- Member Ravi decides to quit
- He's paid 5 months × ₹5,000 = ₹25,000 so far
- Should he get refunded?
- What about his referrer's commission (₹2,500 so far)?

**Q5: Group combining — complex!**
- Branch A has 2 groups that won't fill (12 members + 15 members = 27 total)
- Branch B has 1 group with 18 members
- Total across 3 groups: 45 members
- Head branch admin wants to combine all 3
- How do we split 45 into groups of 20?
  - Option A: 2 groups of 20, 1 group of 5 (incomplete)
  - Option B: 2 groups of 20, cancel the 5 members
  - Option C: 2 groups of 22, 1 group of 1 (overcomplicate)
- **Which is the rule?**

**Q6: Combine timing — when is it allowed?**
- Can we combine groups before the 30-day deadline?
- Only after deadline?
- Only if a group is stale/stuck?

**Q7: Winner announcement — is there a process?**
- How is the monthly winner selected and announced?
- Are members notified?
- Does winner get cash immediately or credited to their wallet?

---

### LSS SCHEME Questions

**Q1: Same as Gold Coin questions**
- Incomplete room handling
- Cross-branch combine rules
- Draw fairness
- Prize calculation

**Q2: Unique to LSS — payment structure**
- Is monthly rent same throughout, or does it change?
- What happens to customers who didn't win (they paid but didn't win anything)?

---

## CROSS-SCHEME QUESTIONS (Apply to Multiple Schemes)

### Commission & Payment

**Q1: Commission timing — when is money actually paid?**
- System says "referrer earned ₹500"
- But when does Ravi actually receive the ₹500?
- On what date?
- As cash? Credited to salary? Manual transfer? Never?
- **This is unclear — need to ask**

**Q2: Commission rounding — edge case**
- Gold customer pays ₹5,001
- Referrer gets 5% = ₹250.05
- Do we round down to ₹250? Round up to ₹251? Keep decimals?
- Over 1,000 customers, rounding errors can add up

**Q3: Tax on commission — who handles it?**
- Referrer earns ₹5,000 commission
- Company needs to withhold 10% tax (TDS)
- So referrer actually gets ₹4,500
- Is the system showing ₹5,000 (gross) or ₹4,500 (net)?
- Who calculates and deducts the tax?

**Q4: Multiple referrers — is it possible?**
- Can a customer have 2 referrers?
- If so, who gets commission?
- Split 50-50?
- First referrer only?

---

### Membership & Eligibility

**Q1: Customer in multiple schemes — limits?**
- Customer Ravi is in:
  - Gold (pays ₹5,000/month for 12 months)
  - Chit group (pays ₹5,000/month for 12 months)
  - Gold Coin (pays ₹1,000/month for 20 months)
- He's committed to ₹11,000+ monthly
- Any limit on how many schemes a customer can join?

**Q2: Inactive customer — can they join new schemes?**
- Customer was in Gold, withdrew after 6 months
- Later, wants to join Trading Academy
- Should we allow it?
- Or have a "customer status" that blocks new enrollments?

**Q3: Referrer qualifications — any rules?**
- Currently, any employee can be a referrer
- Should there be restrictions (only SO/ABM)?
- Can MD refer? Director?
- Policy says MD shouldn't earn commission, but code doesn't prevent it

---

### Refunds & Disputes

**Q1: Refund policy — is there one?**
- Customer paid for 3 months, wants full refund
- Who approves?
- What's the time limit (within 7 days? 30 days? anytime)?
- What if they paid 11 months (almost done)?

**Q2: Partial refund — is it allowed?**
- Customer paid ₹5,000, wants ₹2,500 back
- Or just full refunds?

**Q3: Chargeback risk — what if customer disputes bank payment?**
- Customer pays ₹5,000 via credit card
- Referrer earns ₹250 commission immediately
- Week later, customer disputes charge with bank
- Money comes back
- Does referrer refund the ₹250?

**Q4: Referrer dispute — what if claim is wrong?**
- System shows SO Akshay as referrer
- Customer claims: "I was introduced by ABM Ravi, not Akshay"
- How do we resolve?
- Is there an audit trail? A correction process?

---

### Commission & Rates

**Q1: Rate changes — how do they apply?**
- Current Gold referrer rate: 5% for new, 2% for renewal
- On June 1, company decides to lower to 3% and 1%
- Customer enrolled May 30, pays May 31 (after rate change)
- Which rate applies?
- Rate at enrollment? Or rate at payment?

**Q2: Historical rates — are they locked?**
- If rates changed in the past, can we still see what rate applied on day X?
- Or is it a single current rate that overwrites history?

**Q3: Rate approval — who can change rates?**
- Can any manager change commission rates?
- Or only MD/Director?
- Is there a change log/approval process?

---

### Data Integrity

**Q1: Duplicate submissions — can it happen?**
- Customer submits month 2 payment twice (network delay, clicks submit twice)
- Can the same month be recorded twice?
- Or is there protection against duplicates?

**Q2: Missing referrer — what if referrer is deleted?**
- Customer was referred by SO Akshay (ID: abc123)
- Akshay is deactivated, user record deleted
- Customer's referrer_id now points to a deleted user
- Can we look up who the referrer was?
- Can we still pay commission?

**Q3: Invalid amounts — any limit checks?**
- Customer monthly amount: ₹10,000,000 (unrealistic)
- Does system accept it?
- Any validation (max ₹500,000? min ₹1,000)?

**Q4: Date validation — edge cases**
- Can branch admin record a payment dated 6 months ago (backfill)?
- Or only current/recent dates?
- Can they record future dates?

---

## BUSINESS RULES TO CLARIFY

**Q1: Priority if customer is in competing products**
- Customer joined Gold (12-month commitment at ₹5k/month)
- Then joined Chit group (12-month commitment at ₹5k/month)
- Both claim priority
- If money is tight, which takes priority?
- Any pre-defined order?

**Q2: Scheme lifecycle — what marks "complete"?**
- Gold member: complete after 12 months? Or after all 12 payments made?
- If customer paid only 10 months (then quit), status is "withdrawn" not "complete" — correct?

**Q3: Overlapping schemes — allowed?**
- Customer in Gold (12 months) and Chit group (12 months), same months
- Is this allowed?
- Or should customer finish one before joining another?

**Q4: Scheme transfer — can customer move their commitment?**
- Customer has 6 months left in Gold but wants to switch to Trading Academy
- Can we credit back ₹30,000 (6 × ₹5,000) and move them?
- Or are schemes separate?

---

## APPROVAL QUESTIONS (For Expert Decision)

**Decision 1: Incomplete Group Filling**
- When a Chit group doesn't fill 20 members by deadline, which rule?
  - [ ] Run with fewer members (18 members = 18 winners)
  - [ ] Combine with another group
  - [ ] Cancel and refund

**Decision 2: Refund & Commission Reversal**
- When customer is refunded, does referrer refund their commission?
  - [ ] Yes, always (commission is reversible)
  - [ ] No, never (commission is earned)
  - [ ] Depends on reason (customer request vs fault?)

**Decision 3: Commission Payout Mechanism**
- When referrer earns ₹500, how do they get it?
  - [ ] Added to salary (next paycheck)
  - [ ] On-demand cash transfer
  - [ ] Batched monthly payout
  - [ ] Credited to wallet (shown in app, not cash)

**Decision 4: Rate Lock Policy**
- When commission rates change, which applies?
  - [ ] Lock at enrollment date (old rate applies to all payments)
  - [ ] Apply at payment date (new rate applies immediately)
  - [ ] Lock at enrollment for that month (mixed based on when payment made)

**Decision 5: Referrer Eligibility**
- Who can be a referrer?
  - [ ] Any employee
  - [ ] Only SO/ABM
  - [ ] Only SO/ABM/BM
  - [ ] No MD, but everyone else

**Decision 6: Draw Fairness Verification**
- How do we ensure draws are random?
  - [ ] Use standard random number generator
  - [ ] Third-party verification
  - [ ] Logged draws with witness sign-off
  - [ ] Not verified (trust system)

---

## SAMPLE SCENARIOS TO DISCUSS

### Scenario 1: Commission Timing
**Question:** "When Ravi earns ₹5,000 Gold commission, when does he actually get paid?"

- Is it automatic (credited next salary)?
- Does he request a payout?
- Is it paid monthly, quarterly, or annually?
- Can he check balance in the app?
- Is there a minimum amount before payout (e.g., wait until ₹10,000)?

**Why this matters:** If referrer doesn't see money for 6 months, they lose motivation.

---

### Scenario 2: Rate Change Fairness
**Question:** "Rates drop from 5% to 3% on June 1. Customer A enrolled May 30, Customer B on June 2. Same referrer. Should they pay different commission?"

**Why this matters:** Fairness and predictability. If referrer knows rates change, they might rush enrollments (game the system).

---

### Scenario 3: Refund & Chargeback
**Question:** "Customer paid ₹5,000, referrer earned ₹250. Then customer asked for refund. Should referrer refund the ₹250?"

**Why this matters:** If referrer keeps commission after customer leaves, they're incentivized to over-enroll marginal customers.

---

### Scenario 4: Group Not Filling
**Question:** "Chit group deadline: 30 days. Only 18 of 20 members joined. What happens?"

**Why this matters:** Either way has consequences:
- If you run with 18: Someone gets fewer prizes (unfair)
- If you combine: Members didn't choose their groupmates
- If you cancel: Waste 30 days of effort

---

### Scenario 5: Referrer Leaves
**Question:** "SO Akshay refers 50 Gold customers. Gets fired. All 50 make their month 2 payment. Does fired Akshay earn ₹5,000 commission?"

**Why this matters:** Defines whether commission is a "right" (once earned, yours forever) or a "privilege" (conditional on employment).

---

## CHECKLIST FOR EXPERT MEETING

### Bring These Questions:

**Gold Scheme:**
- [ ] Refund → commission reversal? (Yes/No/Conditional)
- [ ] Duplicate customer → same scheme? (Allow/Prevent/Edit)
- [ ] Monthly amount change → recalculate commission? (Yes/Lock)
- [ ] Late payment → how handle?
- [ ] Referrer leaves → still earn commission?

**Trading Academy:**
- [ ] Commission depends on completion? (Yes/No)
- [ ] Chain missing → skip ABM commission?
- [ ] Multiple enrollments same customer?

**Gold Coin:**
- [ ] Incomplete room (15/20) → run anyway / combine / cancel?
- [ ] Customer with 2 slots → can win twice?
- [ ] Draw randomness → how verify?
- [ ] Cross-branch combine → when allowed?
- [ ] Refund during active → referrer refund commission?

**Chit Group:**
- [ ] Doesn't fill by deadline → run with 18 / combine / cancel?
- [ ] Late join after deadline?
- [ ] Draw method → random / rotating / other?
- [ ] Combine multiple groups → how split 45 into 20s?
- [ ] Cancel midway → refund policy?

**LSS:**
- [ ] Same as Gold Coin?
- [ ] Anything unique?

**Cross-Scheme:**
- [ ] Commission payout method → salary / on-demand / batch / wallet?
- [ ] Commission rounding → down / nearest / up?
- [ ] Tax handling → gross / net?
- [ ] Rate changes → lock at enrollment / apply at payment?
- [ ] Referrer eligibility → restrictions?
- [ ] Multiple schemes → customer limits?
- [ ] Duplicate submissions → protected against?

---

**End of Notes — Ready for Expert Meeting**
