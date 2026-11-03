// Public score projections only. D1's ordinary binding reads the primary (no unconstrained sessions).
import "../../src/js/highscore-rules.js";

const rules = globalThis.BL.highscoreRules;
const COLUMNS = "game_id, highscores, achieved, score_type, direction, unit, rules_version, revision";
const view = row => {
  const rule = row && rules.get(row.game_id);
  if (!rule || row.rules_version !== rule.version || row.score_type !== rule.scoreType || row.direction !== rule.direction || row.unit !== rule.unit)
    throw new Error("Unavailable score rules");
  // The write rules bound these dictionaries; also bound frames before parsing unexpected database data.
  if (row.highscores.length > 100000 || row.achieved.length > 100000) throw new Error("Oversized scores");
  return { game: row.game_id, highscores: JSON.parse(row.highscores), achieved: JSON.parse(row.achieved), version: rule.version,
    scoreType: rule.scoreType, direction: rule.direction, unit: rule.unit, revision: row.revision };
};
export const readHighscores = async (db, game) => view(await db.prepare(`SELECT ${COLUMNS} FROM game_highscores WHERE game_id = ?`).bind(game).first());
export const readArcade = async db => {
  const { results } = await db.prepare(`SELECT ${COLUMNS} FROM game_highscores WHERE game_id IN (${rules.arcade.map(() => "?").join(",")})`)
    .bind(...rules.arcade).all();
  if (results.length !== rules.arcade.length) throw new Error("Incomplete arcade scores");
  return results.map(view);
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
