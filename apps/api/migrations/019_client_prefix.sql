-- Migration 019: Add client_prefix to branches and auto-generate client codes
--
-- Every branch gets a short alphabetic prefix (e.g. Veppur → VPR).
-- Algorithm: strip non-letters, uppercase, take consonants skipping consecutive
-- duplicates, grab first 3. Fallback to first 3 letters if < 3 consonants found.
--
-- client_code on users (added in 009) will be set automatically when role = 'client'.

-- Step 1: Add column (nullable first so we can populate it)
ALTER TABLE branches ADD COLUMN IF NOT EXISTS client_prefix VARCHAR(5);

-- Step 2: Helper function to derive a 3-letter prefix from any branch name
CREATE OR REPLACE FUNCTION derive_branch_prefix(branch_name TEXT) RETURNS TEXT AS $$
DECLARE
  cleaned TEXT;
  result  TEXT := '';
  ch      CHAR;
  prev_ch CHAR := '';
  i       INT;
BEGIN
  -- Uppercase, letters only
  cleaned := regexp_replace(upper(branch_name), '[^A-Z]', '', 'g');

  -- Walk chars: collect non-vowel, non-consecutive-duplicate consonants
  FOR i IN 1..length(cleaned) LOOP
    ch := substring(cleaned, i, 1);
    IF ch NOT IN ('A','E','I','O','U') AND ch != prev_ch THEN
      result  := result || ch;
      prev_ch := ch;
    END IF;
    EXIT WHEN length(result) >= 3;
  END LOOP;

  -- Fallback: if we couldn't collect 3 consonants, just use first 3 letters
  IF length(result) < 3 THEN
    result := left(cleaned, 3);
  END IF;

  RETURN left(result, 3);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 3: Populate existing branches
UPDATE branches SET client_prefix = derive_branch_prefix(name) WHERE client_prefix IS NULL;

-- Step 4: In case two branches collide on the same prefix, append a digit to disambiguate.
-- We do this in a single pass using ROW_NUMBER() over branches sharing a prefix.
WITH ranked AS (
  SELECT id, client_prefix,
         ROW_NUMBER() OVER (PARTITION BY client_prefix ORDER BY created_at) AS rn
  FROM branches
)
UPDATE branches b
SET client_prefix = r.client_prefix || (r.rn)::text
FROM ranked r
WHERE b.id = r.id AND r.rn > 1;

-- Step 5: Make the column NOT NULL now that every row has a value
ALTER TABLE branches ALTER COLUMN client_prefix SET NOT NULL;

-- Step 6: Unique constraint — each prefix must be distinct across branches
ALTER TABLE branches ADD CONSTRAINT branches_client_prefix_unique UNIQUE (client_prefix);
