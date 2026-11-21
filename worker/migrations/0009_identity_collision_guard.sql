-- No records move during installation. A stale/reused login must be reconciled by
-- refreshing the existing account's verified GitHub ID before a new claimant signs in.
-- Existing accounts may refresh an unchanged (case-insensitive) login even when
-- legacy duplicate player rows exist. No AFTER trigger may delete their history.
-- RAISE(ABORT) rolls back the entire statement, including every AFTER trigger.
CREATE TRIGGER players_identity_insert BEFORE INSERT ON players
WHEN NOT EXISTS (SELECT 1 FROM players WHERE id = NEW.id AND lower(login) = lower(NEW.login))
  AND (EXISTS (SELECT 1 FROM players WHERE id <> NEW.id AND lower(login) = lower(NEW.login))
  OR EXISTS (SELECT 1 FROM game_highscores
    WHERE score_type = 'ooga' AND json_extract(owners, '$.' || json_quote(lower(NEW.login))) <> NEW.id))
BEGIN
  SELECT RAISE(ABORT, 'identity collision');
END;

CREATE TRIGGER players_identity_update BEFORE UPDATE OF login ON players
WHEN lower(OLD.login) <> lower(NEW.login)
  AND (EXISTS (SELECT 1 FROM players WHERE id <> NEW.id AND lower(login) = lower(NEW.login))
  OR EXISTS (SELECT 1 FROM game_highscores
    WHERE score_type = 'ooga' AND json_extract(owners, '$.' || json_quote(lower(NEW.login))) <> NEW.id))
BEGIN
  SELECT RAISE(ABORT, 'identity collision');
END;

-- Duplicate old/new keys owned by the same ID retain the better score and its
-- original achievement time (earliest on ties), keeping matching replay pointers.
DROP TRIGGER highscores_player_rename;
CREATE TRIGGER highscores_player_rename AFTER UPDATE OF login ON players
BEGIN
  -- Revoke stale authentication even on an unchanged-login refresh. The verified
  -- current holder must not share their login with another account's live session.
  DELETE FROM sessions WHERE player_id IN
    (SELECT id FROM players WHERE id <> NEW.id AND lower(login) = lower(NEW.login));

  UPDATE game_highscores SET
    highscores = json_set(json_remove(highscores, '$.' || json_quote(lower(OLD.login))), '$.' || json_quote(lower(NEW.login)), CASE WHEN json_extract(owners, '$.' || json_quote(lower(NEW.login))) = NEW.id AND (
      (direction = 'asc' AND json_extract(highscores, '$.' || json_quote(lower(NEW.login))) < json_extract(highscores, '$.' || json_quote(lower(OLD.login))))
      OR (direction = 'desc' AND json_extract(highscores, '$.' || json_quote(lower(NEW.login))) > json_extract(highscores, '$.' || json_quote(lower(OLD.login))))
      OR (json_extract(highscores, '$.' || json_quote(lower(NEW.login))) = json_extract(highscores, '$.' || json_quote(lower(OLD.login)))
        AND json_extract(achieved, '$.' || json_quote(lower(NEW.login))) < json_extract(achieved, '$.' || json_quote(lower(OLD.login))))) THEN json_extract(highscores, '$.' || json_quote(lower(NEW.login))) ELSE json_extract(highscores, '$.' || json_quote(lower(OLD.login))) END),
    owners = json_set(json_remove(owners, '$.' || json_quote(lower(OLD.login))), '$.' || json_quote(lower(NEW.login)), NEW.id),
    achieved = json_set(json_remove(achieved, '$.' || json_quote(lower(OLD.login))), '$.' || json_quote(lower(NEW.login)), CASE WHEN json_extract(owners, '$.' || json_quote(lower(NEW.login))) = NEW.id AND (
      (direction = 'asc' AND json_extract(highscores, '$.' || json_quote(lower(NEW.login))) < json_extract(highscores, '$.' || json_quote(lower(OLD.login))))
      OR (direction = 'desc' AND json_extract(highscores, '$.' || json_quote(lower(NEW.login))) > json_extract(highscores, '$.' || json_quote(lower(OLD.login))))
      OR (json_extract(highscores, '$.' || json_quote(lower(NEW.login))) = json_extract(highscores, '$.' || json_quote(lower(OLD.login)))
        AND json_extract(achieved, '$.' || json_quote(lower(NEW.login))) < json_extract(achieved, '$.' || json_quote(lower(OLD.login))))) THEN json_extract(achieved, '$.' || json_quote(lower(NEW.login))) ELSE json_extract(achieved, '$.' || json_quote(lower(OLD.login))) END),
    revision = revision + 1, updated_at = MAX(updated_at + 1, unixepoch() * 1000)
  WHERE score_type = 'ooga' AND lower(OLD.login) <> lower(NEW.login)
    AND json_extract(owners, '$.' || json_quote(lower(OLD.login))) = NEW.id;

END;

-- New claims/renames are already guarded above. Legacy cleanup would otherwise
-- erase another numeric owner's rows during an unchanged-login session refresh.
DROP TRIGGER highscores_player_login;
CREATE TRIGGER highscores_player_login AFTER INSERT ON players
BEGIN
  DELETE FROM sessions WHERE player_id IN
    (SELECT id FROM players WHERE id <> NEW.id AND lower(login) = lower(NEW.login));
END;
DROP TRIGGER cloud_hopper_runs_login;
DROP TRIGGER cabinet_runs_login;
DROP TRIGGER cloud_hopper_runs_rename;
CREATE TRIGGER cloud_hopper_runs_rename AFTER UPDATE OF login ON players
WHEN lower(OLD.login) <> lower(NEW.login)
BEGIN
  UPDATE game_highscores SET revision = revision + 1
    WHERE game_id IN (SELECT game FROM cloud_hopper_runs WHERE player_id = NEW.id);
END;
DROP TRIGGER cabinet_runs_rename;
CREATE TRIGGER cabinet_runs_rename AFTER UPDATE OF login ON players
WHEN lower(OLD.login) <> lower(NEW.login)
BEGIN
  UPDATE game_highscores SET revision = revision + 1
    WHERE game_id IN (SELECT game FROM cabinet_runs WHERE player_id = NEW.id);
END;
