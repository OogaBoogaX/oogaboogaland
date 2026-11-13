// What each Durable Object tells the Inspector (inspector.js), the app's own view of its objects for the admin page at
// /inspect (inspect.js). Cloudflare can list a namespace's object ids but not which are running, their sockets or what
// they hold, and its analytics show a socket only once it has closed, so each object reports itself.
//
// Never in the way of play: a report is one fire-and-forget RPC inside `ctx.waitUntil`, its failure only counted, and
// nothing at all runs unless INSPECTOR_IDS names an account (and the INSPECTOR binding exists): every method returns at
// its first line otherwise. No timers: events go out on the next microtask, and `tick` rides calls the object already
// makes (a snapshot, an alarm, a game tick), sending state at most once a second while someone watches and once a
// minute otherwise, so a room with nothing happening still hibernates. Each report's answer says whether a viewer is
// watching (`watchUntil`), which is how an object learns to send its per-socket rows; memory goes with hibernation, so
// the first report after a wake learns it again.
import { listed, listedIds } from "./allowlist.js";

export const INSPECT_FEATURE = "inspect-v1";
export const INSPECTOR_NAME = "global";
// Why a page says its last socket ended (net.js), on the close frame and in the `back` message after it rejoins.
export const BACK_WHY = ["socket", "heartbeat", "paused", "kicked", "signout", "other"];

const QUIET_MS = 60000, WATCHED_MS = 1000, QUEUE_MAX = 64;

export const inspectorOn = (env) => !!(env && env.INSPECTOR) && listedIds(env.INSPECTOR_IDS).length > 0;
export const inspectorAllowed = (env, id) => inspectorOn(env) && listed(env.INSPECTOR_IDS, id);

// `nameOf()` is the object's name (empty holds its reports until it has one); `stateOf(detail)` its state, with one row
// per socket when `detail` (someone is watching).
export const inspectReporter = (ctx, env, cls, nameOf, stateOf) => {
  const on = inspectorOn(env);
  const version = (on && env.CF_VERSION_METADATA && env.CF_VERSION_METADATA.id) || "";
  let counters = Object.create(null), peaks = Object.create(null);
  const queue = [];
  let dropped = 0, failed = 0, lastSent = 0, watchUntil = 0, scheduled = false, wake = null;
  const watched = (now) => now < watchUntil;

  const send = () => {
    scheduled = false;
    const name = nameOf();
    if (!name) return;
    const now = Date.now(), detail = watched(now);
    const report = { cls, name, at: now, span: lastSent ? now - lastSent : 0, version, wake, state: stateOf(detail),
      counters, peaks, events: queue.splice(0), dropped, failed };
    counters = Object.create(null); peaks = Object.create(null);
    wake = null; dropped = 0; lastSent = now;
    ctx.waitUntil(env.INSPECTOR.getByName(INSPECTOR_NAME).report(report).then((answer) => {
      watchUntil = answer && Number.isFinite(answer.watchUntil) ? answer.watchUntil : 0;
      // Someone has just started watching: send the rows at once rather than at the next tick.
      if (!detail && watched(Date.now())) soon();
    }).catch(() => { failed++; }));
  };
  const soon = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(send);
  };

  return {
    on,
    watched: () => on && watched(Date.now()),
    // A line in the Inspector's log; `p` is the player it is about (its id and login), or null.
    event(kind, p, fields = null) {
      if (!on) return;
      if (queue.length >= QUEUE_MAX) dropped++;
      else queue.push({ at: Date.now(), kind, id: p ? p.id : 0, login: p ? p.login : "", fields });
      soon();
    },
    count(key, n = 1) {
      if (on) counters[key] = (counters[key] || 0) + n;
    },
    peak(key, value) {
      if (on && !(peaks[key] >= value)) peaks[key] = value;
    },
    tick() {
      if (!on || scheduled) return;
      const now = Date.now();
      if (now - lastSent >= (watched(now) ? WATCHED_MS : QUIET_MS)) soon();
    },
    // The constructor ran: the object woke from hibernation, or started for the first time or after a reset.
    woke(sockets) {
      if (!on) return;
      wake = { sockets };
      soon();
    },
    // The Inspector asking for detail now, because a viewer has just connected.
    watch(until) {
      if (!on) return;
      watchUntil = Math.max(watchUntil, until);
      soon();
    },
  };
};

// The Worker's own refusals (a rate limiter's 429), which no object sees. At most one report every two seconds per
// isolate, counting the ones held back, so a client hammering a limiter cannot turn each refusal into a billed request.
let edgeAt = 0, edgeHeld = 0;
export const inspectEdge = (env, ctx, kind, player, fields) => {
  if (!inspectorOn(env)) return;
  const now = Date.now();
  if (now - edgeAt < 2000) { edgeHeld++; return; }
  edgeAt = now;
  const report = { cls: "Worker", name: "edge", at: now, span: 0, version: (env.CF_VERSION_METADATA && env.CF_VERSION_METADATA.id) || "",
    wake: null, state: { status: "edge" }, counters: {}, peaks: {}, dropped: edgeHeld, failed: 0,
    events: [{ at: now, kind, id: player ? player.id : 0, login: player ? player.login : "", fields }] };
  edgeHeld = 0;
  ctx.waitUntil(env.INSPECTOR.getByName(INSPECTOR_NAME).report(report).catch(() => {}));
};
