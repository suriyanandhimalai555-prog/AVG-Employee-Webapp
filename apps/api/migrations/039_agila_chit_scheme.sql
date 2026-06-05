-- Migration 039: Agila Chit Fund Scheme
--
-- Agila Vetri Groups chit fund:
--   - 20 members per group, 20 months duration
--   - 5 fixed packages (₹5k / ₹10k / ₹15k / ₹20k / ₹25k)
--   - Month 1: company payment — no member winner
--   - Months 2-19: branch admin manually selects one winner per month
--   - Month 20: last eligible member auto-wins
--   - Months 1-10: full package amount; months 11-20: half amount
--   - Winner before month 11: starts paying half from their winning month
--   - Cancelled cards: excluded from winner selection; money held
--   - Group completes at month 20; cancelled members get exact-paid refund

CREATE TABLE IF NOT EXISTS agila_chit_groups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id      UUID NOT NULL REFERENCES branches(id),
  group_name     VARCHAR(100) NOT NULL,
  package_number INTEGER NOT NULL CHECK (package_number BETWEEN 1 AND 5),
  full_amount    NUMERIC(12, 2) NOT NULL CHECK (full_amount > 0),
  half_amount    NUMERIC(12, 2) NOT NULL CHECK (half_amount > 0),
  start_date     DATE NOT NULL,
  -- next month awaiting winner selection (starts at 2 — month 1 is company payment)
  current_month  INTEGER NOT NULL DEFAULT 2 CHECK (current_month BETWEEN 2 AND 21),
  status         VARCHAR(20) NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'completed')),
  notes          TEXT,
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agila_chit_groups_branch ON agila_chit_groups(branch_id);
CREATE INDEX IF NOT EXISTS idx_agila_chit_groups_status ON agila_chit_groups(status);

CREATE TABLE IF NOT EXISTS agila_chit_members (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id                 UUID NOT NULL REFERENCES agila_chit_groups(id),
  customer_id              UUID NOT NULL REFERENCES customers(id),
  status                   VARCHAR(20) NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'cancelled')),
  has_won                  BOOLEAN NOT NULL DEFAULT false,
  won_month                INTEGER CHECK (won_month BETWEEN 2 AND 20),
  winner_amount            NUMERIC(12, 2) CHECK (winner_amount > 0),
  -- true once winner selected before month 11; flips their future payments to half
  paying_half              BOOLEAN NOT NULL DEFAULT false,
  -- months that caused the most recent cancellation (for reinstatement tracking)
  cancellation_due_month_1 INTEGER,
  cancellation_due_month_2 INTEGER,
  -- whether the refund has been paid to this cancelled member after group closes
  refund_credited_at       TIMESTAMPTZ,
  entered_by               UUID NOT NULL REFERENCES users(id),
  created_at               TIMESTAMPTZ DEFAULT now(),
  UNIQUE (group_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_agila_chit_members_group    ON agila_chit_members(group_id);
CREATE INDEX IF NOT EXISTS idx_agila_chit_members_customer ON agila_chit_members(customer_id);
CREATE INDEX IF NOT EXISTS idx_agila_chit_members_status   ON agila_chit_members(status);

CREATE TABLE IF NOT EXISTS agila_chit_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES agila_chit_groups(id),
  member_id    UUID NOT NULL REFERENCES agila_chit_members(id),
  month_number INTEGER NOT NULL CHECK (month_number BETWEEN 1 AND 20),
  amount       NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL,
  payment_mode VARCHAR(20) NOT NULL DEFAULT 'cash'
               CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt')),
  notes        TEXT,
  entered_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (member_id, month_number)
);

CREATE INDEX IF NOT EXISTS idx_agila_chit_payments_group  ON agila_chit_payments(group_id);
CREATE INDEX IF NOT EXISTS idx_agila_chit_payments_member ON agila_chit_payments(member_id);

CREATE TABLE IF NOT EXISTS agila_chit_winners (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES agila_chit_groups(id),
  member_id     UUID NOT NULL REFERENCES agila_chit_members(id),
  month_number  INTEGER NOT NULL CHECK (month_number BETWEEN 2 AND 20),
  winner_amount NUMERIC(12, 2) NOT NULL CHECK (winner_amount > 0),
  notes         TEXT,
  selected_by   UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  -- one winner per month per group
  UNIQUE (group_id, month_number),
  -- a member can only win once per group
  UNIQUE (member_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_agila_chit_winners_group  ON agila_chit_winners(group_id);
CREATE INDEX IF NOT EXISTS idx_agila_chit_winners_member ON agila_chit_winners(member_id);
