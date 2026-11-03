// Compare to the authoritative board on every pointer read, including score-only writes and account removal.
export const winnerSQL = `SELECT h.key AS username, h.value AS score,
  json_extract(g.owners, '$.' || json_quote(h.key)) AS player_id,
  json_extract(g.achieved, '$.' || json_quote(h.key)) AS achieved
  FROM game_highscores g, json_each(g.highscores) h WHERE g.game_id = ?
  ORDER BY h.value ASC, achieved ASC, player_id ASC LIMIT 1`;
export const liveSQL = `SELECT w.hash FROM cloud_hopper_replay_winners w
  JOIN game_highscores g ON g.game_id = w.game
  JOIN json_each(g.highscores) h ON h.value = w.score
    AND json_extract(g.owners, '$.' || json_quote(h.key)) = w.player_id
    AND json_extract(g.achieved, '$.' || json_quote(h.key)) = w.achieved
  WHERE NOT EXISTS (SELECT 1 FROM json_each(g.highscores) other WHERE other.value < h.value
    OR (other.value = h.value AND json_extract(g.achieved, '$.' || json_quote(other.key)) < w.achieved))`;
export const winnerReplay = async (db, game) => {
  const winner = await db.prepare(winnerSQL).bind(game).first();
  if (!winner) return null;
  const row = await db.prepare(`SELECT o.hash, o.bytes, o.course_version FROM cloud_hopper_replay_winners w
    JOIN cloud_hopper_replay_objects o ON o.hash = w.hash AND o.state = 'ready'
    WHERE w.game = ? AND w.player_id = ? AND w.score = ? AND w.achieved = ?`)
    .bind(game, winner.player_id, winner.score, winner.achieved).first();
  return row ? { hash: row.hash, bytes: row.bytes, courseVersion: row.course_version, version: 1,
    username: winner.username, score: winner.score, achieved: winner.achieved } : null;
};
export const pruneCloudHopperReplays = async env => {
  if (!env.DB || !env.CLOUD_HOPPER_REPLAYS) return;
  const db = env.DB, now = Date.now();
  await db.prepare("DELETE FROM cloud_hopper_replay_tickets WHERE expires_at < ?").bind(now).run();
  // Mark first: an upload cannot attach an object being reclaimed. Failed deletes are retried next maintenance.
  // Start retirement's grace when maintenance first observes the loss, even if a daily run was missed.
  await db.prepare(`UPDATE cloud_hopper_replay_objects SET retired_at = NULL WHERE hash IN (${liveSQL})`).run();
  await db.prepare(`UPDATE cloud_hopper_replay_objects SET retired_at = ?, expires_at = MAX(expires_at, ?)
    WHERE state = 'ready' AND retired_at IS NULL AND hash NOT IN (${liveSQL})`).bind(now, now + 86400000).run();
  await db.prepare(`UPDATE cloud_hopper_replay_objects SET state = 'deleting'
    WHERE expires_at < ? AND hash NOT IN (${liveSQL})`).bind(now).run();
  const rows = await db.prepare("SELECT hash, game FROM cloud_hopper_replay_objects WHERE state = 'deleting' LIMIT 128").all();
  for (const row of rows.results) {
    await env.CLOUD_HOPPER_REPLAYS.delete(`v1/${row.game}/${row.hash}.bin`);
    await db.batch([
      db.prepare("DELETE FROM cloud_hopper_replay_winners WHERE hash = ?").bind(row.hash),
      db.prepare("DELETE FROM cloud_hopper_replay_objects WHERE hash = ? AND state = 'deleting'").bind(row.hash),
    ]);
  }
};
