// Block Frenzy live match contract, shared unchanged by the page and the room. One match a room: the registry (who is
// signed up for the next round, the seats of the one in play, its host) lives in the Worker; the host's page runs
// block-sim.js and the Worker only relays it, as Ghost Hunter's arena does. Nothing here touches storage.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const FEATURE = "block-v1", ZONE = "block-frenzy", WIRE = 4;
  // The `place` that arrives on the watch deck to spectate, for a portal or anything else that opens the game to watch.
  const WATCH_DECK_PLACE = "watch-deck";
  // The most a side may hold: change this one number to change the cap on the page and in the Worker.
  const MAX_SIDE = 4, MIN_SIDE = 2, MAX_PLAYERS = MAX_SIDE * 2;
  // The viewing chairs: at most this many viewers a match, enforced by the room. Bounds their share of the frames.
  const MAX_VIEWERS = 5;
  const HZ = 10, INPUT_HZ = 20, IDLE_MS = 15000, COUNTDOWN_MS = 3000;
  // The binary snapshot's header: "BFZ1", then u32 round tag, u32 host epoch, u32 sequence (all little-endian).
  const MAGIC = 0x315a4642, FRAME_HEADER = 16, FRAME_MAX = 2048, FRAME_HZ = 12;
  // Indexes on the wire; the sim's ARENAS keys are checked against these in the suite.
  // The wire numbers the maps by this list. Fort Chaos (0) is retired from play and keeps its number, so no other map's
  // changes: a round is on `FIRST_MAP` or later.
  const MAPS = ["fort", "town", "jungle", "haunted"];
  const FIRST_MAP = 1;
  // A map still offered for play, by id (a saved pick of a retired one is ignored).
  const playable = (id) => MAPS.indexOf(id) >= FIRST_MAP;
  // What a guest asks its host to do for it, by index on the wire: `yaw` and `pitch` go in thousandths of a radian.
  const ACTIONS = ["fire", "grapple", "build", "grab", "pass", "launch", "zip", "hopOn", "callRide", "drop", "escape", "cutChute", "wield"];
  const KINDS = ["paint", "grenade", "rocket", "net", "sniper", "ak", "gold", "crate", "homer"];
  const integer = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const session = v => typeof v === "string" && /^[a-f0-9]{16}$/.test(v);
  const eligible = p => !!p && p.zone === ZONE && !!p.body && !p.body.startsWith("gorilla:");
  // The side size a round runs at: the size picked, grown if more have registered than it seats.
  // The size a match will start at, as things stand: its pick grown to seat everyone who has joined.
  const plannedSize = (m) => sizeFor(m.size, m.reg.length);
  const sizeFor = (wanted, count) => Math.min(MAX_SIDE, Math.max(MIN_SIDE, wanted, Math.ceil(count / 2)));
  // The live players dealt at random as evenly as possible across the two sides (two face each other, three split
  // 2-1, four 2-2), in a side's first seats. `seats` is 2 * size long: blue's seats, then red's; a 0 is an NPC.
  const split = (ids, size, rand) => {
    const deck = ids.slice();
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)), t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    const seats = new Array(size * 2).fill(0), first = rand() < 0.5 ? 0 : 1, used = [0, 0];
    for (let i = 0; i < deck.length; i++) { const side = (i + first) & 1; seats[side * size + used[side]++] = deck[i]; }
    return seats;
  };
  // The scoring rule, by index on the wire: your own block must be home to score (classic), or needn't be. A match
  // plays the first in's pick (`pick` 0 or 1, by `opt`); until they pick (-1), two people, who are dealt one a side and
  // would otherwise each sit on the other's block, play "needn't be home" and any other count plays classic.
  const RULES = ["home", "any"];
  const ruleFor = (pick, count) => pick === 0 || pick === 1 ? pick : count === 2 ? 1 : 0;
  const allReady = m => m.reg.length > 0 && m.ready.length === m.reg.length && m.ready.every(Boolean);
  // A round only starts itself with two humans all ready; one person alone starts by choosing to (`alone`).
  const canStart = m => m.reg.length >= 2 && allReady(m);
  const canStartAlone = (m, id) => m.phase === "lobby" && m.reg.length === 1 && m.reg[0] === id;
  const seatOf = (m, id) => m && m.seats ? m.seats.indexOf(id) : -1;
  // The watch-deck rule: only a seat in the round under way enters the play area; everyone else watches until it ends.
  const canEnter = (m, id) => !!m && (m.phase === "play" || m.phase === "countdown") && id > 0 && seatOf(m, id) >= 0;
  const watching = (m, id) => !!m && m.phase === "play" && seatOf(m, id) < 0;
  const canRegister = (m, id) => !m || (m.reg.length < MAX_PLAYERS && !m.reg.includes(id) && !(m.phase === "play" && seatOf(m, id) >= 0));
  const parse = m => {
    if (m.v !== WIRE) return null;
    const base = { t: "bf", k: m.k };
    if (["hello", "unreg", "beat", "alone"].includes(m.k)) return base;
    // The map already picked on the board, by index: only the first to register's counts.
    // A retired map (an older page's default) is no pick at all, so its Register still registers; `opt` stays strict.
    if (m.k === "reg") return m.m === undefined || integer(m.m, 0, FIRST_MAP - 1) ? base : integer(m.m, FIRST_MAP, MAPS.length - 1) ? { ...base, m: m.m } : null;
    if (m.k === "watch") return integer(m.on, 0, 1) ? { ...base, on: m.on } : null;
    if (m.k === "ready") return integer(m.r, 0, 1) ? { ...base, r: m.r } : null;
    // `r`, the scoring rule, only when the first in chooses it: left out, the match's rule stays as it is.
    if (m.k === "opt") return integer(m.n, MIN_SIDE, MAX_SIDE) && integer(m.m, FIRST_MAP, MAPS.length - 1) && (m.r === undefined || integer(m.r, 0, RULES.length - 1)) ? (m.r === undefined ? { ...base, n: m.n, m: m.m } : { ...base, n: m.n, m: m.m, r: m.r }) : null;
    if (!session(m.s)) return null;
    base.s = m.s;
    if (m.k === "go") return base;
    if (m.k === "over") return integer(m.w, -1, 1) ? { ...base, w: m.w } : null;
    if (m.k === "input") {
      // Bits of b: jump, crouch, sprint, jet. a: up to four [action, yaw, pitch, kind] groups, the wire's whole budget.
      if (!integer(m.q, 0, 0x7fffffff) || !integer(m.x, -1000, 1000) || !integer(m.z, -1000, 1000) || !integer(m.f, -7000, 7000) || !integer(m.b, 0, 15)) return null;
      const out = { ...base, q: m.q, x: m.x, z: m.z, f: m.f, b: m.b };
      if (m.a === undefined) return out;
      if (!Array.isArray(m.a) || m.a.length === 0 || m.a.length > 16 || m.a.length % 4) return null;
      for (let i = 0; i < m.a.length; i += 4) if (!integer(m.a[i], 0, ACTIONS.length - 1) || !integer(m.a[i + 1], -7000, 7000) || !integer(m.a[i + 2], -2000, 2000) || !integer(m.a[i + 3], 0, KINDS.length - 1)) return null;
      out.a = m.a;
      return out;
    }
    return null;
  };
  BL.blockWire = { FEATURE, ZONE, WATCH_DECK_PLACE, WIRE, MAX_SIDE, MAX_VIEWERS, MIN_SIDE, MAX_PLAYERS, HZ, INPUT_HZ, IDLE_MS, COUNTDOWN_MS, MAGIC, FRAME_HEADER, FRAME_MAX, FRAME_HZ, MAPS, FIRST_MAP, playable, plannedSize, ACTIONS, KINDS, parse, eligible, sizeFor, split, RULES, ruleFor, allReady, canStart, canStartAlone, seatOf, canEnter, watching, canRegister };
})();
