-- At most four pointers, 128 objects (including staged/orphaned versions), and 256 live run tickets.
-- Objects precede pointers. A pointer is usable only while its account/time/achievement is still #1.
CREATE TABLE cloud_hopper_replay_objects (
  hash TEXT PRIMARY KEY CHECK(length(hash) = 64),
  game TEXT NOT NULL CHECK(game IN ('cloud-hopper-l1','cloud-hopper-l2','cloud-hopper-l3','cloud-hopper-l4')),
  player_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  course_version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  retired_at INTEGER,
  state TEXT NOT NULL CHECK(state IN ('staged','ready','deleting'))
);
CREATE TABLE cloud_hopper_replay_winners (
  game TEXT PRIMARY KEY CHECK(game IN ('cloud-hopper-l1','cloud-hopper-l2','cloud-hopper-l3','cloud-hopper-l4')),
  player_id INTEGER NOT NULL, score INTEGER NOT NULL, achieved INTEGER NOT NULL,
  hash TEXT NOT NULL REFERENCES cloud_hopper_replay_objects(hash)
);
CREATE TABLE cloud_hopper_replay_tickets (
  token TEXT PRIMARY KEY, player_id INTEGER NOT NULL, game TEXT NOT NULL,
  session_hash TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, hash TEXT,
  UNIQUE(player_id, game)
);

-- Replay-only repair changes the board revision too, so older reads cannot erase a repaired pointer.
-- The existing highscore_changed trigger queues the ordinary durable notification.
CREATE TRIGGER cloud_hopper_replay_inserted AFTER INSERT ON cloud_hopper_replay_winners
BEGIN
  UPDATE game_highscores SET revision = revision + 1 WHERE game_id = NEW.game;
END;
CREATE TRIGGER cloud_hopper_replay_replaced AFTER UPDATE OF hash ON cloud_hopper_replay_winners
WHEN OLD.hash <> NEW.hash
BEGIN
  UPDATE game_highscores SET revision = revision + 1 WHERE game_id = NEW.game;
END;
