-- 006_gm_director_links.sql
-- Explicit many-to-many reporting links: GM can report to multiple Directors.

CREATE TABLE gm_director_links (
  gm_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  director_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (gm_id, director_id)
);

CREATE INDEX idx_gm_director_links_gm ON gm_director_links(gm_id);
CREATE INDEX idx_gm_director_links_director ON gm_director_links(director_id);

