-- One account choice, independent of the published character catalog. Deleting the account
-- removes it; an immutable item version remains pinned until the wearer explicitly changes it.
CREATE TABLE player_equipment (
  player_id INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  item TEXT,
  version TEXT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  declined TEXT,
  updated_at INTEGER NOT NULL,
  CHECK ((item IS NULL AND version IS NULL AND declined IS NULL)
    OR (item = 'none' AND version IS NULL AND declined IS NULL)
    OR (item IS NOT NULL AND item != 'none' AND version IS NOT NULL AND length(version) = 64))
);
