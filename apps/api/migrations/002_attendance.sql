-- 002_attendance.sql
-- Handles attendance tracking and auditing

CREATE TABLE attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  date            DATE NOT NULL,
  mode            VARCHAR(10) NOT NULL CHECK (mode IN ('office','field')),
  status          VARCHAR(10) NOT NULL
                  CHECK (status IN ('present','absent','half_day')),
  check_in_time   TIMESTAMPTZ,
  check_out_time  TIMESTAMPTZ,
  check_in_lat    DECIMAL(9,6),
  check_in_lng    DECIMAL(9,6),
  check_out_lat   DECIMAL(9,6),
  check_out_lng   DECIMAL(9,6),
  photo_key       TEXT,
  field_note      TEXT,
  is_corrected    BOOLEAN DEFAULT false,
  corrected_by    UUID REFERENCES users(id),
  correction_note TEXT,
  corrected_at    TIMESTAMPTZ,
  marked_by       UUID NOT NULL REFERENCES users(id),
  submitted_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, date)
);

-- Immutable audit table for attendance changes
CREATE TABLE attendance_audit (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id  UUID NOT NULL REFERENCES attendance(id),
  changed_by     UUID NOT NULL REFERENCES users(id),
  change_type    VARCHAR(20) NOT NULL,
  old_data       JSONB,
  new_data       JSONB,
  changed_at     TIMESTAMPTZ DEFAULT now()
);

-- Prevent accidental deletion or modification of audit records
REVOKE UPDATE, DELETE ON attendance_audit FROM PUBLIC;

-- Create indexes for fast attendance lookups
CREATE INDEX idx_attendance_date        ON attendance(date);
CREATE INDEX idx_attendance_user_date   ON attendance(user_id, date);
CREATE INDEX idx_attendance_branch_date ON attendance(branch_id, date);
