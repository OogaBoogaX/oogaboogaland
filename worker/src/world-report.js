// The room's side of the World Map's live socket (world-watch.js, the WorldWatch object the map's viewers connect to).
// The room tells WorldWatch who stands where as it changes, so an open map shows a join, a leave or a move within a
// moment, and never asks the room itself.
//
// Never in the way of play, on inspect-report.js's pattern: a report is one fire-and-forget RPC inside
// `ctx.waitUntil`, its failure only counted, and nothing runs without the WORLD binding. Changes in one turn of the
// event loop go out as one report, and reports are at least GAP_MS apart (a one-shot timer sends the last change of a
// burst, so none is lost). Each answer says whether anyone is watching: once one says nobody is, the room sends nothing
// more until WorldWatch asks again (`watch`, as a viewer connects), so a room with no map open costs nothing. Memory
// goes with hibernation, so the first change after a wake asks again. `tick` rides calls the room already makes (a
// snapshot, an alarm) to refresh the CPU and sockets while watched, at most every TICK_MS.
export const WORLD_NAME = "world";
const GAP_MS = 250, TICK_MS = 2000;

export const worldReporter = (ctx, env, viewOf) => {
  const on = !!(env && env.WORLD);
  let quiet = false, scheduled = false, timer = 0, lastSent = 0, failed = 0, sent = 0, gen = 0;

  const send = () => {
    scheduled = false;
    const now = Date.now(), since = now - lastSent;
    if (since < GAP_MS) {
      timer = setTimeout(() => { timer = 0; soon(); }, GAP_MS - since);
      return;
    }
    lastSent = now;
    sent++;
    const asked = gen;
    ctx.waitUntil(env.WORLD.getByName(WORLD_NAME).report(viewOf()).then((answer) => {
      // A viewer connected while this was out (`watch`): its word stands over this answer's.
      if (asked === gen) quiet = !(answer && answer.watching);
    }).catch(() => { failed++; }));
  };
  const soon = () => {
    if (!on || quiet || scheduled || timer) return;
    scheduled = true;
    queueMicrotask(send);
  };

  return {
    on,
    // Someone joined, left or changed zone.
    changed: soon,
    tick() {
      if (on && !quiet && Date.now() - lastSent >= TICK_MS) soon();
    },
    // WorldWatch asking, because a viewer has connected: report from now on, and here is the view as it stands.
    watch() {
      gen++;
      quiet = false;
      return viewOf();
    },
    stats: () => ({ on, quiet, sent, failed }),
  };
};
