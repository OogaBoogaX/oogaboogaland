-- Every cabinet opened to a run, counted per game per UTC day (#554), so the island's cave can show what is played most
-- lately. Scores cannot say that: a machine keeps only its record and a board only its best finishes. Nothing about who
-- played is kept. Rows older than the reading's 30 days are dropped by the write that follows them.
CREATE TABLE cabinet_plays (
  game  TEXT NOT NULL,
  day   INTEGER NOT NULL,
  plays INTEGER NOT NULL DEFAULT 0 CHECK (plays >= 0),
  PRIMARY KEY (game, day)
) WITHOUT ROWID;
