// The Lightning Jet Hangar's hall as the server runs it for everyone in it, hosted by game-host.js as kind "hangar" at
// the venue "hall", optional (on only where the Worker's GAME_FEATURES names it). It keeps the hall's clock and decides
// what happens there and when, from the timings every page plays (src/js/hangar-hall.js, imported unchanged), so
// everyone in the hall sees the same thing at the same moment; each page plays what the state names from its start
// (`at`, on the server's clock), however far into it that page arrives.
//
// The engine anomalies: one at a time, a gap at random from the end of one to the start of the next (the first a gap
// after the hall's first player arrives), each kind in its turn from a bag shuffled each time it runs out, as on a page
// alone. A lightning ends in the jump to a room now and then, never while the last jump's fire still burns, the room
// given as a fraction each page turns into one of its rooms; the fire it lights there (`room`: the lightning's id, when
// the bolt lands, the room) is named while it burns, which is longer than the lightning, so a page arriving after the
// lightning still lights it from as far in as it has got.
//
// The static fire test: a page's press (`fire`) starts it for everyone (`test`: its id, when, and who pressed, whose page
// alone hands the test its controls), never while one runs or cools down, nor while an anomaly plays; and no anomaly
// starts while it runs or for a while after it hands back (`ANOMALY.afterFire`), as on a page alone.
//
// What it hears: `jet`, a page's word on whether anything it knows stands on the Jet (`on`) or within the shuffle's
// reach (`near`), sent on a change. The lowrider never starts with anyone on the Jet nor the shuffle with anything near
// (the next in the bag instead, or the failed start), and either stops for everyone the moment a page says so. Nothing
// it keeps names a player but those two words, kept while their page is connected and never saved, and the test's
// presser's account id, kept while the test runs and cools down.
import "../../../src/js/hangar-hall.js";

const HALL = globalThis.BL.hangarHall, A = HALL.ANOMALY;

/** A page's message as the hall reads it: false for one that is not a message at all, null for one to ignore. */
const parse = (m) => {
  if (!m || typeof m !== "object" || Array.isArray(m) || typeof m.t !== "string") return false;
  if (m.t === "jet") return typeof m.on === "boolean" && typeof m.near === "boolean" ? { t: "jet", on: m.on, near: m.near } : null;
  if (m.t === "fire") return { t: "fire" };
  return null;
};

// `random` for the checks; the server's own otherwise.
const create = (_now, random = Math.random) => {
  // Account id → what their page last said of the Jet: { on, near }.
  const players = new Map();
  const bag = [...HALL.KINDS];
  // The anomaly playing ({ id, kind, at, jump, room }, at in ms) or null; the room fire its jump lit ({ id, at, room },
  // at when the bolt lands) or null, and until when it burns; when the next anomaly may start; the last one's id; how
  // many kinds are left in the bag.
  let anomaly = null, fire = null, roomUntil = -Infinity, nextAt = 0, id = 0, left = 0;
  // The static fire test running or cooling down ({ id, at, by }) or null.
  let test = null;
  const testing = (now) => !!test && now < test.at + (HALL.FIRE.result + A.afterFire) * 1000;

  const gap = () => (A.gap[0] + random() * (A.gap[1] - A.gap[0])) * 1000;
  const next = () => {
    if (left === 0) {
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)), s = bag[i]; bag[i] = bag[j]; bag[j] = s; }
      left = bag.length;
    }
    return bag[--left];
  };
  const any = (key) => {
    for (const f of players.values()) if (f[key]) return true;
    return false;
  };
  const unfit = (k) => k === "lowrider" && any("on") || k === "shuffle" && any("near");
  const begin = (now) => {
    let k = next();
    if (unfit(k)) k = next();
    if (unfit(k)) k = "misfire";
    const jump = k === "lightning" && now >= roomUntil && random() < A.jump;
    anomaly = { id: ++id, kind: k, at: now, jump, room: jump ? random() : 0 };
    if (jump) {
      fire = { id, at: now + A.lands * 1000, room: anomaly.room };
      roomUntil = fire.at + HALL.ROOM_FIRE.done * 1000;
    }
  };
  const end = (now) => { anomaly = null; nextAt = now + gap(); };
  // Whether the anomaly playing must stop now: its end, or someone where it may not go on.
  const over = (now) => now >= anomaly.at + A.length[anomaly.kind] * 1000 || anomaly.kind === "lowrider" && any("on") || anomaly.kind === "shuffle" && any("near");

  return {
    join: (p, now) => {
      players.set(p.id, { on: false, near: false });
      if (players.size === 1 && !anomaly && nextAt < now) nextAt = now + gap();
    },
    leave: (p) => { players.delete(p.id); },
    /** A page's message, read by `parse`; true when the hall's state changed and should go out now. */
    message: (p, m, now) => {
      const f = players.get(p.id);
      if (!f) return false;
      if (m.t === "fire") {
        if (test || anomaly) return false;
        test = { id: ++id, at: now, by: p.id };
        return true;
      }
      f.on = m.on; f.near = m.near;
      if (anomaly && over(now)) { end(now); return true; }
      return false;
    },
    /** The hall to `now`; true when its state changed. */
    step: (now) => {
      let changed = false;
      if (fire && now >= roomUntil) { fire = null; changed = true; }
      if (test && now >= test.at + HALL.FIRE.ready * 1000) { test = null; changed = true; }
      if (anomaly) {
        if (!over(now)) return changed;
        end(now);
        return true;
      }
      if (now < nextAt || testing(now)) return changed;
      begin(now);
      return true;
    },
    running: () => players.size > 0,
    state: () => ({ anomaly, room: fire, test }),
    motion: () => false,
    /** What a restart picks up: the schedule, or null once the hall is empty. */
    save: () => players.size ? JSON.stringify({ anomaly, fire, test, nextAt, roomUntil, id, bag, left }) : null,
    /** Picks up a saved hall: its schedule goes on where it stopped, on the same clock. */
    restore: (data) => {
      let s = null;
      try { s = JSON.parse(data); } catch { return false; }
      if (!s || typeof s !== "object" || !Array.isArray(s.bag) || s.bag.length !== bag.length || !s.bag.every((k) => HALL.KINDS.includes(k))) return false;
      const a = s.anomaly;
      anomaly = a && HALL.KINDS.includes(a.kind) && Number.isFinite(a.at) ? { id: a.id | 0, kind: a.kind, at: a.at, jump: !!a.jump, room: Math.min(0.999, Math.max(0, +a.room || 0)) } : null;
      const f = s.fire;
      fire = f && Number.isFinite(f.at) ? { id: f.id | 0, at: f.at, room: Math.min(0.999, Math.max(0, +f.room || 0)) } : null;
      const x = s.test;
      test = x && Number.isFinite(x.at) && Number.isSafeInteger(x.by) ? { id: x.id | 0, at: x.at, by: x.by } : null;
      nextAt = +s.nextAt || 0; roomUntil = Number.isFinite(s.roomUntil) ? s.roomUntil : -Infinity; id = s.id | 0;
      bag.splice(0, bag.length, ...s.bag);
      left = Math.min(bag.length, Math.max(0, s.left | 0));
      return true;
    },
    debug: { players, get anomaly() { return anomaly; }, get nextAt() { return nextAt; }, begin, end }
  };
};

export const hangar = {
  id: "hangar", code: 2, version: 1, venues: ["hall"], optional: true, tickMs: 250, stateEvery: 40,
  limits: { sockets: 32, chars: 256 },
  buckets: { jet: { rate: 4, burst: 4 }, press: { rate: 1, burst: 2 } },
  bucketOf: (t) => t === "jet" ? "jet" : "press",
  parse, create
};
