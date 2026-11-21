-- One pending revision per game, committed atomically with each actual leaderboard change.
CREATE TABLE highscore_notifications (
  game_id TEXT PRIMARY KEY REFERENCES game_highscores(game_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL
);
CREATE TRIGGER highscore_changed AFTER UPDATE OF revision ON game_highscores
WHEN NEW.revision > OLD.revision
BEGIN
  INSERT INTO highscore_notifications (game_id, revision) VALUES (NEW.game_id, NEW.revision)
    ON CONFLICT(game_id) DO UPDATE SET revision = MAX(revision, excluded.revision);
END;
