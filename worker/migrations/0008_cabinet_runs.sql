-- Attributed finishes for the eleven point-scoring video cabinets. Existing machine
-- bests have no owner, so keep them intact without inventing historical run attribution.
CREATE TABLE cabinet_runs (
  game TEXT NOT NULL REFERENCES game_highscores(game_id),
  run_id TEXT NOT NULL,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK(score > 0 AND score <= 9999999),
  achieved INTEGER NOT NULL,
  PRIMARY KEY(game, player_id, run_id),
  CHECK(game IN ('drop','orbit','mine','invaders','snake','pong','stampede','flap','breaker','dash','stacker'))
);
CREATE INDEX cabinet_runs_order ON cabinet_runs(game, score DESC, achieved, player_id, run_id);

CREATE TRIGGER cabinet_run_inserted AFTER INSERT ON cabinet_runs
BEGIN
  DELETE FROM cabinet_runs WHERE game = NEW.game AND (player_id, run_id) IN
    (SELECT player_id, run_id FROM cabinet_runs WHERE game = NEW.game
      ORDER BY score DESC, achieved, player_id, run_id LIMIT -1 OFFSET 1024);
  UPDATE game_highscores SET revision = revision + 1, updated_at = MAX(updated_at, NEW.achieved)
    WHERE game_id = NEW.game;
END;
CREATE TRIGGER cabinet_run_deleted AFTER DELETE ON cabinet_runs
BEGIN
  UPDATE game_highscores SET revision = revision + 1 WHERE game_id = OLD.game;
END;
-- Names follow their stable GitHub account. A reused login cannot inherit another
-- account's finishes; the existing identity triggers also revoke its stale sessions.
CREATE TRIGGER cabinet_runs_rename AFTER UPDATE OF login ON players
BEGIN
  DELETE FROM cabinet_runs WHERE player_id IN
    (SELECT id FROM players WHERE id <> NEW.id AND lower(login) = lower(NEW.login));
  UPDATE game_highscores SET revision = revision + 1
    WHERE game_id IN (SELECT game FROM cabinet_runs WHERE player_id = NEW.id)
      AND lower(OLD.login) <> lower(NEW.login);
END;
CREATE TRIGGER cabinet_runs_login AFTER INSERT ON players
BEGIN
  DELETE FROM cabinet_runs WHERE player_id IN
    (SELECT id FROM players WHERE id <> NEW.id AND lower(login) = lower(NEW.login));
END;
