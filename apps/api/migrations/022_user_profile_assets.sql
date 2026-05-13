-- 007_user_profile_assets.sql
-- Adds optional profile image and proof document S3 keys per user.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS profile_photo_key TEXT,
ADD COLUMN IF NOT EXISTS profile_proof_key TEXT;
