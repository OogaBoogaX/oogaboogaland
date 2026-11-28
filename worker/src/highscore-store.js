// Public score projections only. D1's ordinary binding reads the primary (no unconstrained sessions).
import "../../src/js/highscore-rules.js";
import { sha256Hex } from "./crypto.js";

const rules = globalThis.BL.highscoreRules;
const COLUMNS = "game_id, highscores, achieved, score_type, direction, unit, rules_version, revision";
const view = row => {
  const rule = row && rules.get(row.game_id);
  if (!rule || row.rules_version !== rule.version || row.score_type !== rule.scoreType || row.direction !== rule.direction || row.unit !== rule.unit)
    throw new Error("Unavailable score rules");
  // The write rules bound these dictionaries; also bound frames before parsing unexpected database data.
  if (row.highscores.length > 100000 || row.achieved.length > 100000) throw new Error("Oversized scores");
  return { game: row.game_id, highscores: JSON.parse(row.highscores), achieved: JSON.parse(row.achieved), version: rule.version,
    scoreType: rule.scoreType, direction: rule.direction, unit: rule.unit, revision: row.revision,
    ...(row.runs == null ? {} : { runs: JSON.parse(row.runs) }) };
};
const cabinetRuns = `(SELECT json_group_array(json_object('username', username, 'score', score,
  'achieved', achieved, 'runId', run_id, 'playerId', player_id)) FROM (
    SELECT r.run_id, lower(p.login) AS username, r.score, r.achieved, r.player_id FROM cabinet_runs r
    JOIN players p ON p.id = r.player_id WHERE r.game = game_highscores.game_id
    ORDER BY score DESC, achieved, player_id, run_id LIMIT 10))`;
const publicBoard = async row => {
  const board = view(row);
  // Fingerprints reconcile retries without publishing raw run tickets or account IDs.
  if (board.runs) board.runs = await Promise.all(board.runs.map(async ({ runId, playerId, ...run }) =>
    ({ ...run, id: await sha256Hex(JSON.stringify([board.game, playerId, runId])) })));
  return board;
};
export const readHighscores = async (db, game) => {
  // Read the run list and revision in one SQLite snapshot; a delayed list cannot carry a newer revision.
  const runs = /^cloud-hopper-l[1-4]$/.test(game) ? `, (SELECT json_group_array(json_object(
    'username', username, 'score', score, 'achieved', achieved, 'runId', run_id, 'playerId', player_id)) FROM (
      SELECT r.run_id, lower(p.login) AS username, r.score, r.achieved, r.player_id FROM cloud_hopper_runs r
      JOIN players p ON p.id = r.player_id WHERE r.game = game_highscores.game_id
      UNION ALL
      SELECT 'best', h.key, h.value, json_extract(g.achieved, '$.' || json_quote(h.key)),
        json_extract(g.owners, '$.' || json_quote(h.key))
      FROM game_highscores g, json_each(g.highscores) h WHERE g.game_id = game_highscores.game_id
        AND NOT EXISTS (SELECT 1 FROM cloud_hopper_runs r WHERE r.game = g.game_id
          AND r.player_id = json_extract(g.owners, '$.' || json_quote(h.key)) AND r.score = h.value
          AND r.achieved = json_extract(g.achieved, '$.' || json_quote(h.key)))
      ORDER BY score, achieved, player_id, run_id LIMIT 10)) AS runs` : rules.cabinets.includes(game) ? `, ${cabinetRuns} AS runs` : "";
  return publicBoard(await db.prepare(`SELECT ${COLUMNS}${runs} FROM game_highscores WHERE game_id = ?`).bind(game).first());
};
export const readArcade = async db => {
  const { results } = await db.prepare(`SELECT ${COLUMNS}, CASE WHEN game_id IN (${rules.cabinets.map(id => "'" + id + "'").join(",")}) THEN ${cabinetRuns} END AS runs FROM game_highscores WHERE game_id IN (${rules.arcade.map(() => "?").join(",")})`)
    .bind(...rules.arcade).all();
  if (results.length !== rules.arcade.length) throw new Error("Incomplete arcade scores");
  return Promise.all(results.map(publicBoard));
};

// The trigger records a change in the score's transaction, including rename/removal. A failed
// notification or a crash after commit leaves it here for the room's existing maintenance alarm.
// A later commit cannot be acknowledged by an older delivery. No event history grows over time.
export const deliverHighscores = async (db, publish, game = null) => {
  if (game !== null && !rules.get(game)) return;
  const { results } = await db.prepare("SELECT game_id, revision FROM highscore_notifications" + (game === null ? " LIMIT ?" : " WHERE game_id = ?"))
    .bind(game === null ? Object.keys(rules.games).length : game).all();
  for (const pending of results) {
    if (!rules.get(pending.game_id)) continue;
    const board = await readHighscores(db, pending.game_id);
    if (board.revision < pending.revision || !publish(board)) continue;
    await db.prepare("DELETE FROM highscore_notifications WHERE game_id = ? AND revision <= ?").bind(board.game, board.revision).run();
  }
};
