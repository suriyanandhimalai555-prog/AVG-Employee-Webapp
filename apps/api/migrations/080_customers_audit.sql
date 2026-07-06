-- Migration 080: customers_audit — append-only audit trail for customer
-- consent + contact changes.
--
-- WhatsApp opt-in (has_whatsapp) is messaging CONSENT: when a customer asks
-- "why am I getting these messages?", this table answers who enabled it,
-- when, and what the value was before. Mirrors the app_settings_history
-- pattern from migration 074. Rows are written by CustomerService.update
-- inside the SAME transaction as the customer UPDATE, so an audit row
-- exists if and only if the change committed.

CREATE TABLE IF NOT EXISTS customers_audit (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID        NOT NULL REFERENCES customers(id),
  -- Which column changed: 'has_whatsapp' | 'phone' | 'address' | 'name' | 'notes'
  field        TEXT        NOT NULL,
  old_value    TEXT,                          -- null when previously unset
  new_value    TEXT,                          -- null when cleared
  changed_by   UUID        REFERENCES users(id),
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup: "who changed this customer, and when?"
CREATE INDEX IF NOT EXISTS ix_customers_audit_customer_time
  ON customers_audit (customer_id, changed_at DESC);

-- Consent disputes filter by field
CREATE INDEX IF NOT EXISTS ix_customers_audit_field_time
  ON customers_audit (field, changed_at DESC);

-- Append-only: the audit trail is evidence — nobody edits history.
REVOKE UPDATE, DELETE ON customers_audit FROM PUBLIC;
