-- One shared high-score dictionary per game. Machines keep their own unattributed record;
-- attributed boards key their scores by GitHub login and retain the numeric owner privately.
-- A monotonic revision lets the page discard a read that arrived after a newer submission.
CREATE TABLE game_highscores (
  game_id       TEXT PRIMARY KEY,
  score_type    TEXT NOT NULL CHECK (score_type IN ('machine', 'ooga')),
  direction     TEXT NOT NULL CHECK (direction IN ('asc', 'desc')),
  unit          TEXT NOT NULL CHECK (unit IN ('points', 'milliseconds')),
  rules_version INTEGER NOT NULL DEFAULT 1,
  highscores    TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(highscores) AND json_type(highscores) = 'object'),
  owners        TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(owners) AND json_type(owners) = 'object'),
  achieved      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(achieved) AND json_type(achieved) = 'object'),
  revision      INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL DEFAULT 0
);

INSERT INTO game_highscores (game_id, score_type, direction, unit) VALUES
  ('cloud-hopper', 'ooga', 'asc', 'milliseconds'),
  ('race', 'machine', 'asc', 'milliseconds'),
  ('drop', 'machine', 'desc', 'points'),
  ('orbit', 'machine', 'desc', 'points'),
  ('mine', 'machine', 'desc', 'points'),
  ('skee', 'machine', 'desc', 'points'),
  ('hoops', 'machine', 'desc', 'points'),
  ('shy', 'machine', 'desc', 'points'),
  ('claw', 'machine', 'desc', 'points'),
  ('hockey', 'machine', 'desc', 'points'),
  ('billiards', 'machine', 'desc', 'points'),
  ('darts', 'machine', 'desc', 'points'),
  ('pinball', 'machine', 'desc', 'points'),
  ('ride', 'machine', 'desc', 'points'),
  ('invaders', 'machine', 'desc', 'points'),
  ('snake', 'machine', 'desc', 'points'),
  ('pong', 'machine', 'desc', 'points'),
  ('stampede', 'machine', 'desc', 'points'),
  ('flap', 'machine', 'desc', 'points'),
  ('breaker', 'machine', 'desc', 'points'),
  ('dash', 'machine', 'desc', 'points'),
  ('stacker', 'machine', 'desc', 'points');

-- GitHub logins can change or be reused. A login change moves only the score owned by
-- that numeric GitHub id. A newly claimed login never inherits its previous owner's score.
-- Its previous owner's sessions are stale too: sign-in must refresh their current GitHub name.
CREATE TRIGGER highscores_player_rename AFTER UPDATE OF login ON players
BEGIN
  DELETE FROM sessions WHERE player_id IN
    (SELECT id FROM players WHERE id <> NEW.id AND lower(login) = lower(NEW.login));

  UPDATE game_highscores SET
    highscores = json_set(json_remove(highscores, '$.' || json_quote(lower(OLD.login))), '$.' || json_quote(lower(NEW.login)), json_extract(highscores, '$.' || json_quote(lower(OLD.login)))),
    owners = json_set(json_remove(owners, '$.' || json_quote(lower(OLD.login))), '$.' || json_quote(lower(NEW.login)), NEW.id),
    achieved = json_set(json_remove(achieved, '$.' || json_quote(lower(OLD.login))), '$.' || json_quote(lower(NEW.login)), json_extract(achieved, '$.' || json_quote(lower(OLD.login)))),
    revision = revision + 1, updated_at = MAX(updated_at + 1, unixepoch() * 1000)
  WHERE score_type = 'ooga' AND lower(OLD.login) <> lower(NEW.login)
    AND json_extract(owners, '$.' || json_quote(lower(OLD.login))) = NEW.id;

  UPDATE game_highscores SET
    highscores = json_remove(highscores, '$.' || json_quote(lower(NEW.login))),
    owners = json_remove(owners, '$.' || json_quote(lower(NEW.login))),
    achieved = json_remove(achieved, '$.' || json_quote(lower(NEW.login))),
    revision = revision + 1, updated_at = MAX(updated_at + 1, unixepoch() * 1000)
  WHERE score_type = 'ooga' AND json_extract(owners, '$.' || json_quote(lower(NEW.login))) <> NEW.id;
END;

CREATE TRIGGER highscores_player_login AFTER INSERT ON players
BEGIN
  DELETE FROM sessions WHERE player_id IN
    (SELECT id FROM players WHERE id <> NEW.id AND lower(login) = lower(NEW.login));

  UPDATE game_highscores SET
    highscores = json_remove(highscores, '$.' || json_quote(lower(NEW.login))),
    owners = json_remove(owners, '$.' || json_quote(lower(NEW.login))),
    achieved = json_remove(achieved, '$.' || json_quote(lower(NEW.login))),
    revision = revision + 1, updated_at = MAX(updated_at + 1, unixepoch() * 1000)
  WHERE score_type = 'ooga' AND json_extract(owners, '$.' || json_quote(lower(NEW.login))) <> NEW.id;
END;

-- Account deletion clears its attributed entries in the same transaction as the player.
-- Anonymous machine records have no owner and survive account deletion.
CREATE TRIGGER highscores_player_delete AFTER DELETE ON players
BEGIN
  UPDATE game_highscores SET
    highscores = (SELECT json_group_object(h.key, h.value) FROM json_each(highscores) h
      WHERE json_extract(owners, '$.' || json_quote(h.key)) <> OLD.id),
    achieved = (SELECT json_group_object(a.key, a.value) FROM json_each(achieved) a
      WHERE json_extract(owners, '$.' || json_quote(a.key)) <> OLD.id),
    owners = (SELECT json_group_object(o.key, o.value) FROM json_each(owners) o WHERE o.value <> OLD.id),
    revision = revision + 1, updated_at = MAX(updated_at + 1, unixepoch() * 1000)
  WHERE score_type = 'ooga' AND EXISTS (SELECT 1 FROM json_each(owners) o WHERE o.value = OLD.id);
END;
