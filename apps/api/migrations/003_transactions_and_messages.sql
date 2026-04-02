-- 003_transactions_and_messages.sql
-- Handles financial transactions, transaction auditing, and messages scaffolding

CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id       UUID NOT NULL REFERENCES users(id),
  receiver_id     UUID NOT NULL REFERENCES users(id),
  amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  category        VARCHAR(20) NOT NULL
                  CHECK (category IN ('expense','advance','reimbursement',
                                      'collection','other')),
  note            TEXT,
  status          VARCHAR(30) NOT NULL DEFAULT 'pending_acknowledgment'
                  CHECK (status IN ('pending_acknowledgment','acknowledged',
                                    'rejected','flagged')),
  submitted_at    TIMESTAMPTZ DEFAULT now(),
  acknowledged_at TIMESTAMPTZ
);

-- Trigger to emulate the direct_manager_only constraint (CHECK constraints cannot contain subqueries in Postgres)
CREATE OR REPLACE FUNCTION check_direct_manager() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.receiver_id != (SELECT manager_id FROM users WHERE id = NEW.sender_id) THEN
    RAISE EXCEPTION 'Receiver must be the direct manager of the sender';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_direct_manager
BEFORE INSERT OR UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION check_direct_manager();

-- Immutable audit table for transaction state changes
CREATE TABLE transaction_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id),
  changed_by      UUID NOT NULL REFERENCES users(id),
  old_status      VARCHAR(30),
  new_status      VARCHAR(30),
  note            TEXT,
  changed_at      TIMESTAMPTZ DEFAULT now()
);

-- Prevent accidental deletion or modification of audit records
REVOKE UPDATE, DELETE ON transaction_audit FROM PUBLIC;

-- Messages scaffold
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id       UUID NOT NULL REFERENCES users(id),
  recipient_id    UUID REFERENCES users(id),
  broadcast_scope VARCHAR(20) CHECK (broadcast_scope IN ('direct','dept','org')),
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  read_at         TIMESTAMPTZ
);

-- Create indexes for fast queries
CREATE INDEX idx_transactions_sender    ON transactions(sender_id);
CREATE INDEX idx_transactions_receiver  ON transactions(receiver_id);
CREATE INDEX idx_transactions_status    ON transactions(status);
