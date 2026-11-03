-- Keep distinct level finishes without changing the personal bests used by replay pointers.
-- Retain at most 1,024 runs per level; public boards expose the first ten.
CREATE TABLE cloud_hopper_runs (
  game TEXT NOT NULL REFERENCES game_highscores(game_id),
  run_id TEXT NOT NULL,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK(score > 0 AND score <= 3600000),
  achieved INTEGER NOT NULL,
  PRIMARY KEY(game, player_id, run_id),
  CHECK(game IN ('cloud-hopper-l1','cloud-hopper-l2','cloud-hopper-l3','cloud-hopper-l4'))
);
CREATE INDEX cloud_hopper_runs_order ON cloud_hopper_runs(game, score, achieved, player_id, run_id);

-- Import only records that still exist. No missing run history is reconstructed.
INSERT INTO cloud_hopper_runs(game, run_id, player_id, score, achieved)
  SELECT g.game_id, 'legacy:' || p.id || ':' || h.value || ':' || json_extract(g.achieved, '$.' || json_quote(h.key)),
    p.id, h.value, json_extract(g.achieved, '$.' || json_quote(h.key))
  FROM game_highscores g, json_each(g.highscores) h
  JOIN players p ON p.id = json_extract(g.owners, '$.' || json_quote(h.key))
  WHERE g.game_id IN ('cloud-hopper-l1','cloud-hopper-l2','cloud-hopper-l3','cloud-hopper-l4');

CREATE TRIGGER cloud_hopper_run_inserted AFTER INSERT ON cloud_hopper_runs
BEGIN
  DELETE FROM cloud_hopper_runs WHERE game = NEW.game AND (player_id, run_id) IN
    (SELECT player_id, run_id FROM cloud_hopper_runs WHERE game = NEW.game
      ORDER BY score, achieved, player_id, run_id LIMIT -1 OFFSET 1024);
  UPDATE game_highscores SET revision = revision + 1, updated_at = MAX(updated_at, NEW.achieved)
    WHERE game_id = NEW.game;
END;
CREATE TRIGGER cloud_hopper_run_deleted AFTER DELETE ON cloud_hopper_runs
BEGIN
  UPDATE game_highscores SET revision = revision + 1 WHERE game_id = OLD.game;
END;
-- Names are joined from the current account. A reused login removes the previous owner's
-- attribution, matching the existing personal-best and stale-session cleanup triggers.
CREATE TRIGGER cloud_hopper_runs_rename AFTER UPDATE OF login ON players
BEGIN
  DELETE FROM cloud_hopper_runs WHERE player_id IN
    (SELECT id FROM players WHERE id <> NEW.id AND lower(login) = lower(NEW.login));
  UPDATE game_highscores SET revision = revision + 1
    WHERE game_id IN (SELECT game FROM cloud_hopper_runs WHERE player_id = NEW.id)
      AND lower(OLD.login) <> lower(NEW.login);
END;
CREATE TRIGGER cloud_hopper_runs_login AFTER INSERT ON players
BEGIN
  DELETE FROM cloud_hopper_runs WHERE player_id IN
    (SELECT id FROM players WHERE id <> NEW.id AND lower(login) = lower(NEW.login));
END;
