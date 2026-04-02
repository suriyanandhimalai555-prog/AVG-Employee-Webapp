-- 001_init.sql
-- Handles the initial base tables: users and branches

-- We must handle the circular foreign key dependency between users and branches.
-- 1. Create users table without branch_id
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(200) NOT NULL,
  email         VARCHAR(200) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL
                CHECK (role IN ('md','director','gm','branch_manager',
                                'abm','sales_officer','client','branch_admin')),
  manager_id    UUID REFERENCES users(id),
  client_code   VARCHAR(20) UNIQUE,
  has_smartphone BOOLEAN DEFAULT true,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. Create branches table (which references users)
CREATE TABLE branches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(200) NOT NULL,
  gm_id         UUID REFERENCES users(id),
  admin_id      UUID REFERENCES users(id),
  shift_start   TIME NOT NULL DEFAULT '09:00',
  shift_end     TIME NOT NULL DEFAULT '18:00',
  timezone      VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 3. Add branch_id to users to complete the circular reference
ALTER TABLE users ADD COLUMN branch_id UUID REFERENCES branches(id);

-- 4. Create indexes for users
CREATE INDEX idx_users_manager ON users(manager_id);
CREATE INDEX idx_users_branch ON users(branch_id);
