-- Migration 050: Land Sales Management System
--
-- Agila Vetri Groups land plot sales system.
--   land_sites        → project locations managed by MD
--   land_plots        → individual plot units per site (MD-owned financials)
--   land_customers    → customers per branch (admin-managed)
--   land_bookings     → booking lifecycle: booked → advance_paid → full_paid → completed
--   land_buyback_payouts → 60-month payout schedule auto-created on full_paid
--   land_audit_log    → append-only audit trail for every state change

-- ─── Sites ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS land_sites (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(200) NOT NULL,
  layout_name    VARCHAR(200),
  location       TEXT,
  address        TEXT,
  state          VARCHAR(100),
  loan_enabled   BOOLEAN     NOT NULL DEFAULT false,
  status         VARCHAR(20) NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'inactive')),
  created_by     UUID        NOT NULL REFERENCES users(id),
  updated_by     UUID        REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_land_sites_status ON land_sites(status);

-- ─── Plots ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS land_plots (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id               UUID        NOT NULL REFERENCES land_sites(id),
  -- site_number is alphanumeric (e.g. "81A", "90", "76A"), set by MD at creation
  site_number           VARCHAR(50) NOT NULL,
  area_sqft             NUMERIC(12,2) NOT NULL CHECK (area_sqft > 0),
  land_cost             NUMERIC(14,2) NOT NULL CHECK (land_cost > 0),
  -- Monthly amount the company pays to the customer during the 60-month buyback period
  buyback_bonus_monthly NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (buyback_bonus_monthly >= 0),
  status                VARCHAR(20) NOT NULL DEFAULT 'available'
                        CHECK (status IN ('available', 'booked', 'cancelled', 'completed')),
  created_by            UUID        NOT NULL REFERENCES users(id),
  updated_by            UUID        REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  -- A plot can only have one site_number per site
  UNIQUE (site_id, site_number)
);

CREATE INDEX IF NOT EXISTS idx_land_plots_site   ON land_plots(site_id);
CREATE INDEX IF NOT EXISTS idx_land_plots_status ON land_plots(status);

-- ─── Customers ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS land_customers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- customer_ref is manually entered by the branch admin (not auto-generated)
  customer_ref  VARCHAR(50) NOT NULL UNIQUE,
  branch_id     UUID        NOT NULL REFERENCES branches(id),
  name          VARCHAR(255) NOT NULL,
  phone         VARCHAR(20),
  address       TEXT,
  id_proof      TEXT,
  email         VARCHAR(255),
  created_by    UUID        NOT NULL REFERENCES users(id),
  updated_by    UUID        REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_land_customers_branch ON land_customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_land_customers_ref    ON land_customers(customer_ref);

-- ─── Bookings ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS land_bookings (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- booking_ref is manually entered by the branch admin (not auto-generated)
  booking_ref             VARCHAR(50) NOT NULL UNIQUE,
  branch_id               UUID        NOT NULL REFERENCES branches(id),
  customer_id             UUID        NOT NULL REFERENCES land_customers(id),
  plot_id                 UUID        NOT NULL REFERENCES land_plots(id),
  payment_mode            VARCHAR(30) NOT NULL
                          CHECK (payment_mode IN ('full_payment', 'advance_full_payment')),
  booking_date            DATE        NOT NULL,

  -- Advance payment (advance_full_payment mode only)
  advance_amount          NUMERIC(14,2) CHECK (advance_amount > 0),
  advance_date            DATE,
  -- Deadline is booking_date + 30 days; admin can extend up to 2 times
  advance_deadline        DATE,
  advance_extensions_used INTEGER     NOT NULL DEFAULT 0
                          CHECK (advance_extensions_used BETWEEN 0 AND 2),

  -- Full payment
  full_amount             NUMERIC(14,2) CHECK (full_amount > 0),
  full_payment_date       DATE,

  -- Loan (only applicable when site.loan_enabled = true)
  loan_taken              BOOLEAN     NOT NULL DEFAULT false,
  loan_amount             NUMERIC(14,2) CHECK (loan_amount > 0),

  -- Buyback window start (full_payment_date + 60 days)
  buyback_start_date      DATE,

  -- Booking lifecycle
  status                  VARCHAR(20) NOT NULL DEFAULT 'booked'
                          CHECK (status IN (
                            'booked',         -- initial state; payment not yet recorded
                            'advance_paid',   -- advance recorded; awaiting full payment
                            'full_paid',      -- full payment done; buyback schedule active
                            'cancelled',      -- booking cancelled; advance forfeited
                            'completed'       -- all 60 buyback payouts marked paid
                          )),
  cancellation_reason     TEXT,
  notes                   TEXT,
  created_by              UUID        NOT NULL REFERENCES users(id),
  updated_by              UUID        REFERENCES users(id),
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_land_bookings_branch   ON land_bookings(branch_id);
CREATE INDEX IF NOT EXISTS idx_land_bookings_customer ON land_bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_land_bookings_plot     ON land_bookings(plot_id);
CREATE INDEX IF NOT EXISTS idx_land_bookings_status   ON land_bookings(status);

-- ─── Buyback payouts ──────────────────────────────────────────────────────────
-- Auto-created (60 rows) when a booking transitions to full_paid.
-- amount = plot.buyback_bonus_monthly at the time of creation (snapshot).
-- due_date = buyback_start_date + (month_number - 1) months.

CREATE TABLE IF NOT EXISTS land_buyback_payouts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID        NOT NULL REFERENCES land_bookings(id),
  month_number INTEGER     NOT NULL CHECK (month_number BETWEEN 1 AND 60),
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date     DATE        NOT NULL,
  paid_date    DATE,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'paid')),
  paid_by      UUID        REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (booking_id, month_number)
);

CREATE INDEX IF NOT EXISTS idx_land_buyback_booking  ON land_buyback_payouts(booking_id);
CREATE INDEX IF NOT EXISTS idx_land_buyback_due_date ON land_buyback_payouts(due_date);
CREATE INDEX IF NOT EXISTS idx_land_buyback_status   ON land_buyback_payouts(status);

-- ─── Audit log ────────────────────────────────────────────────────────────────
-- Append-only. Never deleted. Captures every state-changing action across all land tables.
-- old_values / new_values carry JSONB snapshots for MD review.

CREATE TABLE IF NOT EXISTS land_audit_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity     VARCHAR(50) NOT NULL
             CHECK (entity IN ('site', 'plot', 'customer', 'booking', 'payout')),
  record_id  UUID        NOT NULL,
  action     VARCHAR(30) NOT NULL
             CHECK (action IN (
               'create', 'update', 'cancel',
               'advance_payment', 'full_payment',
               'deadline_extended', 'payout_paid'
             )),
  changed_by UUID        NOT NULL REFERENCES users(id),
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_land_audit_record     ON land_audit_log(entity, record_id);
CREATE INDEX IF NOT EXISTS idx_land_audit_changed_by ON land_audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_land_audit_created_at ON land_audit_log(created_at);
