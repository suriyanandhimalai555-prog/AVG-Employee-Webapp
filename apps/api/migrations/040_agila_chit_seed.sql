-- Migration 040: Register Agila Chit Fund in the projects table.
--
-- Winners are customers (not employees), so there are no commission rules to seed.
-- Winner payouts and cancelled-member refunds are tracked in agila_chit_winners
-- and agila_chit_members respectively — separate from the employee incentive wallet.

INSERT INTO projects (name, code)
VALUES ('Agila Chit', 'agila_chit_scheme')
ON CONFLICT (code) DO NOTHING;
