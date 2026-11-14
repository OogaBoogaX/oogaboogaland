// Block Frenzy's live round, the page's side of worker/src/block.js. The room's registry says who is seated and who
// hosts; the host's page runs block-sim.js and sends the whole visible state as a binary frame ten times a second, the
// guests send their sticks and buttons twenty times a second, and a page on the watch deck only listens. Every page's
// sim keeps "my Ooga is actors[0]": a seat (blue's then red's) is turned into that page's own actor order by `seatMap`,
// so the scene's rules for "me" stand unchanged. Frames carry seats, never a page's own numbering. Encode and decode
// write in place; only the session's control messages allocate.
(() => {
  "use strict";
  const BL = window.BL, W = BL.blockWire, SIM = BL.blockSim;
  // Every event block-sim emits, by index on the wire. An unlisted one is dropped; the suite checks the list is whole.
  // `rifle` and `unrifle` are no longer raised (the sniper rifle is always in hand); they keep their places.
  const EVENT_TYPES = ["goldhook", "gunfire", "boing", "bolt", "boltwarn", "boo", "build", "burn", "cache", "callride", "capture", "chute", "chuteoff", "clean", "climbed", "cooled", "edgedrop", "enemycat", "ghostback", "ghostpop", "go", "gold", "goldsteal", "gorillahit", "gorillahooked", "grab", "homers", "hookbite", "hookbounce", "hookget", "hookhide", "hookrelease", "hooksteal", "hookthrow", "hookwarn", "hopoff", "hopon", "jump", "jump2", "land", "landed", "laseroff", "laseron", "launch", "lift", "mined", "miss", "net", "netsteal", "newblock", "pass", "pickup", "power", "puddle", "refill", "reload", "reloaded", "rescue", "respawn", "return", "set", "slip", "smash", "splat", "steady", "struggle", "thrown", "touchdown", "trap", "unnet", "unzip", "waiting", "weather", "win", "winded", "windup", "yank", "zip", "fire", "throw", "bonk", "boom", "pop", "breakfree", "letgo", "netmiss", "rifle", "unrifle", "drop", "knock", "escape", "timeout", "hookmiss", "ziptrap"];
  const EVENT_INDEX = new Map(EVENT_TYPES.map((t, i) => [t, i]));
  // Events the rules only ever raise for a real Ooga; the suite checks the list against block-sim.js.
  const ACTOR_EVENTS = ["goldhook", "boing", "boltwarn", "boo", "build", "burn", "cache", "callride", "capture", "chute", "chuteoff", "clean", "climbed", "cooled", "edgedrop", "enemycat", "gold", "gorillahooked", "grab", "homers", "hookbite", "hookbounce", "hookget", "hookrelease", "hookthrow", "hopoff", "hopon", "jump", "jump2", "land", "laseroff", "laseron", "launch", "lift", "netsteal", "pass", "pickup", "power", "puddle", "refill", "reload", "reloaded", "rescue", "respawn", "slip", "steady", "struggle", "thrown", "touchdown", "trap", "unnet", "unzip", "waiting", "win", "winded", "windup", "yank", "zip", "ziptrap"];
  const NEEDS_ACTOR = EVENT_TYPES.map(t => ACTOR_EVENTS.includes(t));
  const SHOT_KINDS = ["paint", "grenade", "rocket", "net", "sniper", "ak", "gold", "crate", "homer"];
  const FLAG_STATES = ["home", "carried", "dropped", "flying"];
  const WEATHER = ["clear", "rain", "wind", "snow", "storm", "fog"];
  const NUMBERS = [["x", 64, 2], ["z", 64, 2], ["y", 64, 2], ["heading", 1000, 2], ["vx", 6, 1], ["vz", 6, 1], ["vy", 6, 1], ["moving", 20, 0],
    ["splat", 10, 0], ["guard", 10, 0], ["trapped", 10, 0], ["netted", 10, 0], ["boots", 10, 0], ["laser", 10, 0], ["monkeys", 10, 0], ["knock", 10, 0], ["spooked", 10, 0], ["slip", 10, 0], ["beam", 10, 0], ["cooldown", 20, 0], ["stamina", 20, 0], ["fuel", 20, 0], ["akReload", 20, 0], ["grabFill", 8, 0],
    ["flight", 1, 0], ["jumps", 1, 0], ["hk", 1, 0], ["hookT", 100, 0], ["hookLen", 4, 0], ["hook", 1, 0], ["grabbed", 1, 0], ["burnt", 1, 0], ["akMag", 1, 0], ["grenade", 1, 0], ["rocket", 1, 0], ["net", 1, 0], ["sniper", 1, 0], ["crates", 1, 0],
    ["captures", 1, 0], ["splats", 1, 0], ["hits", 1, 0], ["longShot", 1, 0], ["rescues", 1, 0]];
  const SWITCHES = ["crouch", "grounded", "jetting", "sprinting", "riding", "climbing", "holding", "tired", "gold", "bonked", "flung", "waiting"];
  const TEAM_CODE = t => t === "blue" ? 1 : t === "red" ? 2 : 0, TEAM_NAME = [null, "blue", "red"];
  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  // Seat to this page's actor index and back, for `size` a side and this page's own seat (-1 on the deck): its own side
  // first, its own Ooga at actor 0, so the scene's "me is actors[0]" holds for host, guest and watcher alike.
  const seatMap = (size, me) => {
    const n = size * 2, toLocal = new Array(n), toSeat = new Array(n);
    const ownFirst = me < size ? 0 : size, slot = me < 0 ? 0 : me % size;
    for (let s = 0; s < n; s++) {
      let local = ownFirst ? (s + size) % n : s;
      if (me >= 0) { if (local === slot) local = 0; else if (local === 0) local = slot; }
      toLocal[s] = local; toSeat[local] = s;
    }
    return { toLocal, toSeat, team: me >= size ? "red" : "blue" };
  };
  let dv = null, at = 0;
  const u8 = v => dv.setUint8(at++, clamp(Math.round(v), 0, 255));
  const i8 = v => dv.setInt8(at++, clamp(Math.round(v), -128, 127));
  const i16 = v => { dv.setInt16(at, clamp(Math.round(v), -32768, 32767), true); at += 2; };
  const u32 = v => { dv.setUint32(at, v >>> 0, true); at += 4; };
  const r8 = () => dv.getUint8(at++), r8s = () => dv.getInt8(at++), r16 = () => { const v = dv.getInt16(at, true); at += 2; return v; }, r32 = () => { const v = dv.getUint32(at, true); at += 4; return v; };
  const pos = (o) => { i16(o.x * 64); i16(o.y * 64); i16(o.z * 64); };
  const readPos = (o) => { o.x = r16() / 64; o.y = r16() / 64; o.z = r16() / 64; };
  const dark = (list) => { for (let i = 0; i < list.length; i++) u8(list[i].dark * 4); };
  const readDark = (list) => { for (let i = 0; i < list.length; i++) list[i].dark = r8() / 4; };
  const seatRef = (v, map) => u8(v == null || v < 0 ? 255 : map.toSeat[v]);
  const localRef = (map) => { const v = r8(); return v === 255 ? -1 : map.toLocal[v]; };
  const BUDGET = W.FRAME_MAX - 64, MAX_SHOTS = 32, MAX_EVENTS = 24;
  // Each actor: its numbers, two bytes of switches, its ride and rider, the hook's tip and end, and one byte for what
  // is in hand (`HELD`).
  const ACTOR_BYTES = NUMBERS.reduce((n, f) => n + (f[2] === 2 ? 2 : 1), 0) + 2 + 2 + 12 + 1;
  const ACTOR_AT = {}; NUMBERS.reduce((n, f) => { ACTOR_AT[f[0]] = n; return n + (f[2] === 2 ? 2 : 1); }, 0);
  const SWITCH_AT = NUMBERS.reduce((n, f) => n + (f[2] === 2 ? 2 : 1), 0);
  // A frame is the host's word: every count, enum and seat is checked against this page's pools before anything is
  // written, so a corrupt or hostile frame is dropped whole and never touches the sim. Allocates nothing.
  const validFrame = (v, sim, map) => {
    const len = v.byteLength, seats = map.toLocal.length, seatOk = b => b === 255 || b < seats, teamOk = b => b <= 2;
    let o = W.FRAME_HEADER;
    if (o + 21 > len || !teamOk(v.getUint8(o + 8)) || v.getUint8(o + 10) >= WEATHER.length) return false;
    o += 21;
    for (let i = 0; i < 2; i++) { if (o + 8 > len || v.getUint8(o) >= FLAG_STATES.length || !seatOk(v.getUint8(o + 7))) return false; o += 8; }
    for (let s = 0; s < seats; s++) {
      if (o + ACTOR_BYTES > len) return false;
      const grabbed = v.getUint8(o + ACTOR_AT.grabbed), hk = v.getUint8(o + ACTOR_AT.hk), flight = v.getUint8(o + ACTOR_AT.flight);
      const ride = v.getUint8(o + SWITCH_AT + 2), rider = v.getUint8(o + SWITCH_AT + 3), carried = v.getUint16(o + SWITCH_AT, true) >> 14;
      const held = v.getUint8(o + ACTOR_BYTES - 1);
      if (grabbed > sim.gorillas.length || hk > 5 || flight > 2 || ride > seats || rider > seats || carried > 2 || (held >> 4) > SIM.WIELD.length || (held & 15) >= SIM.WIELD.length) return false;
      o += ACTOR_BYTES;
    }
    if (o + 4 > len) return false;
    const mask = v.getUint32(o, true);
    o += 4;
    for (let i = 0; i < 32; i++) if (mask >>> i & 1) { if (i >= sim.crates.length || o + 7 > len || !teamOk(v.getUint8(o))) return false; o += 7; }
    if (o + 1 > len) return false;
    let n = v.getUint8(o++);
    if (n > sim.shots.length) return false;
    for (let i = 0; i < n; i++) { if (o + 15 > len || v.getUint8(o) >= SHOT_KINDS.length || !teamOk(v.getUint8(o + 1)) || !seatOk(v.getUint8(o + 2))) return false; o += 15; }
    if (o + sim.gorillas.length * 10 + sim.ghosts.length * 9 + sim.hooks.length * 8 > len) return false;
    for (let i = 0; i < sim.gorillas.length; i++) { if (!seatOk(v.getUint8(o + 9))) return false; o += 10; }
    o += sim.ghosts.length * 9;
    for (let i = 0; i < sim.hooks.length; i++) { if (!seatOk(v.getUint8(o + 7))) return false; o += 8; }
    o += sim.traps.length + sim.caches.length + sim.peels.length + sim.puddles.length + sim.powers.length * 2;
    if (o + 1 > len) return false;
    n = v.getUint8(o++);
    if (n > MAX_EVENTS || o + n * 10 !== len) return false;
    for (let i = 0; i < n; i++) { if (v.getUint8(o) >= EVENT_TYPES.length || !teamOk(v.getUint8(o + 1)) || !seatOk(v.getUint8(o + 2)) || !seatOk(v.getUint8(o + 3)) || NEEDS_ACTOR[v.getUint8(o)] && v.getUint8(o + 2) === 255) return false; o += 10; }
    return true;
  };
  // The whole visible state of a sim, in seat order, into `buffer`. Returns the byte length. Allocates nothing.
  const encode = (sim, map, tag, epoch, q, buffer, events = sim.events, eventCount = sim.eventCount) => {
    dv = buffer; at = 0;
    u32(W.MAGIC); u32(tag); u32(epoch); u32(q);
    u8(sim.prep * 4); u32(Math.round(sim.time * 1000)); u8(sim.score.blue); u8(sim.score.red); u8(sim.over ? 1 : 0); u8(TEAM_CODE(sim.winner)); u8(sim.goldLeft);
    u8(Math.max(0, WEATHER.indexOf(sim.weather.kind))); u8(sim.weather.strength * 100); u8(sim.weather.boltWarn * 20); i16(sim.weather.boltX * 64); i16(sim.weather.boltZ * 64);
    u8(sim.halving.blue * 4); u8(sim.halving.red * 4); u8(sim.cold.blue * 4); u8(sim.cold.red * 4);
    for (const t of SIM.TEAMS) { const f = sim.flags[t]; u8(FLAG_STATES.indexOf(f.state)); pos(f); seatRef(f.carrier, map); }
    for (let s = 0; s < map.toLocal.length; s++) {
      const a = sim.actors[map.toLocal[s]];
      for (let k = 0; k < NUMBERS.length; k++) { const f = NUMBERS[k], v = (a[f[0]] || 0) * f[1]; if (f[2] === 2) i16(v); else if (f[2] === 1) i8(v); else u8(v); }
      let bits = 0;
      for (let k = 0; k < SWITCHES.length; k++) if (a[SWITCHES[k]]) bits |= 1 << k;
      if (a.carrying) bits |= TEAM_CODE(a.carrying) << 14;
      dv.setUint16(at, bits, true); at += 2;
      u8(a.ride ? map.toSeat[a.ride - 1] + 1 : 0); u8(a.rider ? map.toSeat[a.rider - 1] + 1 : 0);
      pos(a.hookTip); pos(a.hookEnd);
      // What is in hand (`HELD`): the tool chosen, plus one (0 for none, a bot's), over the last one fired. Guests draw
      // it, and a page that takes over as host decides steals by it (`blockSim.heldOf`).
      u8((SIM.WIELD.indexOf(a.wield) + 1) << 4 | Math.max(0, SIM.WIELD.indexOf(a.lastKind)));
    }
    let mask = 0;
    for (let i = 0; i < sim.crates.length; i++) if (sim.crates[i].live) mask |= 1 << i;
    u32(mask);
    for (let i = 0; i < sim.crates.length; i++) { const c = sim.crates[i]; if (c.live) { u8(TEAM_CODE(c.team)); pos(c); } }
    let countAt = at, count = 0; at++;
    for (let i = 0; i < sim.shots.length && count < MAX_SHOTS && at < BUDGET; i++) {
      const s = sim.shots[i];
      if (!s.live) continue;
      u8(Math.max(0, SHOT_KINDS.indexOf(s.kind))); u8(TEAM_CODE(s.team)); seatRef(s.owner, map); pos(s); i16(s.vx * 16); i16(s.vy * 16); i16(s.vz * 16);
      count++;
    }
    dv.setUint8(countAt, count);
    for (let i = 0; i < sim.gorillas.length; i++) { const g = sim.gorillas[i]; pos(g); i16(g.heading * 1000); u8(g.state); seatRef(g.holding, map); }
    for (let i = 0; i < sim.ghosts.length; i++) { const g = sim.ghosts[i]; pos(g); i16(g.heading * 1000); u8(g.state); }
    for (let i = 0; i < sim.hooks.length; i++) { const h = sim.hooks[i]; u8(h.state); pos(h); seatRef(h.holder, map); }
    dark(sim.traps); dark(sim.caches); dark(sim.peels); dark(sim.puddles);
    for (let i = 0; i < sim.powers.length; i++) { u8(sim.powers[i].dark * 4); u8(sim.powers[i].kind); }
    countAt = at; count = 0; at++;
    for (let i = 0; i < eventCount && count < MAX_EVENTS && at < W.FRAME_MAX - 12; i++) {
      const e = events[i], type = EVENT_INDEX.get(e.type);
      if (type === undefined) continue;
      u8(type); u8(TEAM_CODE(e.team)); seatRef(e.actor, map); seatRef(e.by, map); i16(e.x * 64); i16(e.y * 64); i16(e.z * 64);
      count++;
    }
    dv.setUint8(countAt, count);
    return at;
  };
  // A frame's state into this page's sim: everything direct, actor positions into `next` for the interpolation.
  const decode = (buffer, sim, map, next) => {
    dv = buffer; at = W.FRAME_HEADER;
    sim.prep = r8() / 4; sim.time = r32() / 1000; sim.score.blue = r8(); sim.score.red = r8(); sim.over = r8() === 1; sim.winner = TEAM_NAME[r8()]; sim.goldLeft = r8();
    sim.weather.kind = WEATHER[r8()]; sim.weather.strength = r8() / 100; sim.weather.boltWarn = r8() / 20; sim.weather.boltX = r16() / 64; sim.weather.boltZ = r16() / 64;
    sim.halving.blue = r8() / 4; sim.halving.red = r8() / 4; sim.cold.blue = r8() / 4; sim.cold.red = r8() / 4;
    for (const t of SIM.TEAMS) { const f = sim.flags[t]; f.state = FLAG_STATES[r8()]; readPos(f); const c = localRef(map); f.carrier = c < 0 ? null : c; }
    for (let s = 0; s < map.toLocal.length; s++) {
      const local = map.toLocal[s], a = sim.actors[local];
      for (let k = 0; k < NUMBERS.length; k++) {
        const f = NUMBERS[k], v = (f[2] === 2 ? r16() : f[2] === 1 ? r8s() : r8()) / f[1], name = f[0];
        if (name === "x" || name === "z" || name === "y" || name === "heading") { const o = local * 4 + (name === "x" ? 0 : name === "z" ? 1 : name === "y" ? 2 : 3); next[o] = v; }
        else a[name] = v;
      }
      const bits = dv.getUint16(at, true); at += 2;
      for (let k = 0; k < SWITCHES.length; k++) a[SWITCHES[k]] = !!(bits >> k & 1);
      a.carrying = TEAM_NAME[bits >> 14 & 3];
      const ride = r8(), rider = r8();
      a.ride = ride ? map.toLocal[ride - 1] + 1 : 0; a.rider = rider ? map.toLocal[rider - 1] + 1 : 0;
      readPos(a.hookTip); readPos(a.hookEnd);
      const held = r8();
      a.wield = held >> 4 ? SIM.WIELD[(held >> 4) - 1] : ""; a.lastKind = SIM.WIELD[held & 15];
    }
    const mask = r32();
    for (let i = 0; i < sim.crates.length; i++) { const c = sim.crates[i]; c.live = !!(mask >>> i & 1); if (c.live) { c.team = TEAM_NAME[r8()]; readPos(c); } }
    for (let i = 0; i < sim.shots.length; i++) sim.shots[i].live = false;
    for (let i = 0, n = r8(); i < n; i++) { const s = sim.shots[i]; s.live = true; s.kind = SHOT_KINDS[r8()]; s.team = TEAM_NAME[r8()]; s.owner = localRef(map); readPos(s); s.vx = r16() / 16; s.vy = r16() / 16; s.vz = r16() / 16; }
    for (let i = 0; i < sim.gorillas.length; i++) { const g = sim.gorillas[i]; readPos(g); g.heading = r16() / 1000; g.state = r8(); g.holding = localRef(map); }
    for (let i = 0; i < sim.ghosts.length; i++) { const g = sim.ghosts[i]; readPos(g); g.heading = r16() / 1000; g.state = r8(); }
    for (let i = 0; i < sim.hooks.length; i++) { const h = sim.hooks[i]; h.state = r8(); readPos(h); h.holder = localRef(map); }
    readDark(sim.traps); readDark(sim.caches); readDark(sim.peels); readDark(sim.puddles);
    for (let i = 0; i < sim.powers.length; i++) { sim.powers[i].dark = r8() / 4; sim.powers[i].kind = r8(); }
    for (let i = 0, n = r8(); i < n; i++) {
      if (sim.eventCount >= sim.events.length) { at += 10; continue; }
      const e = sim.events[sim.eventCount++];
      e.type = EVENT_TYPES[r8()]; e.team = TEAM_NAME[r8()]; e.actor = localRef(map); e.by = localRef(map); e.x = r16() / 64; e.y = r16() / 64; e.z = r16() / 64;
    }
    dv = null;
  };
  // What a guest's action call does on the host: `yaw` and `pitch` are sent, `kind` only by a shot.
  const ACTION_CALLS = {
    fire: (s, id, y, p, k) => SIM.fire(s, id, y, p, W.KINDS[k]), grapple: (s, id, y, p) => SIM.grapple(s, id, y, p), build: (s, id, y) => SIM.build(s, id, y), grab: (s, id, y) => SIM.grab(s, id, y),
    pass: (s, id, y) => SIM.pass(s, id, y), launch: (s, id) => SIM.launch(s, id), zip: (s, id, y) => SIM.zip(s, id, y), hopOn: (s, id) => SIM.hopOn(s, id), callRide: (s, id) => SIM.callRide(s, id),
    drop: (s, id) => SIM.drop(s, id), wield: (s, id, y, p, k) => SIM.wield(s, id, k), escape: (s, id) => SIM.escape(s, id), cutChute: (s, id) => SIM.cutChute(s, id)
  };
  const blankInput = () => ({ x: 0, z: 0, sprint: 0, jump: 0, jet: 0, crouch: 0, face: 0 });
  const STALE_MS = 500;
  const create = ({ net = BL.net, onMatch, onStart, onHost, onChairsFull = () => {}, now = () => performance.now(), resolveBody = (a, r) => SIM.resolve(a, r) }) => {
    let match = null, sim = null, map = null, role = "none", seat = -1, startedTag = -1, epochSeen = 0, lastQ = -1, q = 0, inputQ = 0, sendWait = 0, beatWait = 0, goSent = false, lastAt = 0, jump = 0, frameAge = 0, frameGap = 1 / W.HZ, haveFrame = false;
    const buffer = new DataView(new ArrayBuffer(W.FRAME_MAX)), bytes = new Uint8Array(buffer.buffer), actions = [], remote = [], sendViews = [];
    // The events of every simulated frame since the last send, so none is lost to the 10 Hz cadence.
    const pending = Array.from({ length: MAX_EVENTS }, () => ({ type: "", team: null, actor: -1, by: -1, x: 0, y: 0, z: 0 }));
    let pendingCount = 0;
    let prev = new Float32Array(0), next = new Float32Array(0), inputs = [];
    const self = () => net.state.selfId;
    const beginRound = () => {
      seat = W.seatOf(match, self());
      role = seat >= 0 ? (match.host === self() ? "host" : "guest") : "watch";
      map = seatMap(match.size, seat);
      startedTag = match.tag; epochSeen = match.epoch; lastQ = -1; q = 0; inputQ = 0; sendWait = 0; haveFrame = false; actions.length = 0; jump = 0;
      onStart(match, role, map);
    };
    // The scene has built the round's sim: size the buffers and mark who is an NPC.
    const bind = (s) => {
      sim = s;
      const n = s.actors.length;
      prev = new Float32Array(n * 4); next = new Float32Array(n * 4);
      inputs = Array.from({ length: n }, () => null);
      remote.length = 0;
      for (let i = 0; i < n; i++) remote.push({ q: -1, at: 0, input: blankInput(), queue: [] });
      markBots();
      for (let i = 0; i < n; i++) { const a = s.actors[i]; next[i * 4] = prev[i * 4] = a.x; next[i * 4 + 1] = prev[i * 4 + 1] = a.z; next[i * 4 + 2] = prev[i * 4 + 2] = a.y; next[i * 4 + 3] = prev[i * 4 + 3] = a.heading; }
      s.inputs = role === "host" ? inputs : null;
    };
    const markBots = () => {
      if (!sim || !map) return;
      for (let s = 0; s < map.toLocal.length; s++) {
        const local = map.toLocal[s], human = !!match.seats[s];
        sim.actors[local].bot = !human;
        if (inputs.length) inputs[local] = human && local !== 0 ? remote[local]?.input ?? null : null;
      }
    };
    const receiveMatch = (m) => {
      if (m.phase === "empty") { match = null; if (role !== "none") endRound(); onMatch(null); return; }
      const hostChanged = match && match.tag === m.tag && match.host !== m.host;
      match = m;
      if (m.phase === "play") {
        if (startedTag !== m.tag) beginRound();
        else {
          markBots();
          if (hostChanged && role === "guest" && m.host === self()) { role = "host"; if (sim) { sim.inputs = inputs; for (let i = 0; i < sim.actors.length; i++) settle(i); sim.acc = 0; SIM.settleHooks(sim); } lastQ = -1; q = 0; pendingCount = 0; epochSeen = m.epoch; onHost(); }
          else if (hostChanged && role === "host" && m.host !== self()) { role = "guest"; if (sim) { sim.inputs = null; for (let i = 0; i < sim.actors.length; i++) hold(i); } epochSeen = m.epoch; lastQ = -1; haveFrame = false; sendWait = 0; }
          else if (hostChanged) { epochSeen = m.epoch; lastQ = -1; haveFrame = false; }
          if (m.host === self() && role === "host") epochSeen = m.epoch;
          if (role !== "watch" && role !== "none" && W.seatOf(m, self()) < 0) endRound();
        }
      } else if (role !== "none") endRound();
      if (m.phase === "countdown") goSent = false;
      onMatch(m);
    };
    const endRound = () => { role = "none"; seat = -1; map = null; startedTag = -1; if (sim) { sim.inputs = null; for (const a of sim.actors) a.bot = a.id > 0; } sim = null; };
    const hold = (i) => { const a = sim.actors[i], o = i * 4; next[o] = prev[o] = a.x; next[o + 1] = prev[o + 1] = a.z; next[o + 2] = prev[o + 2] = a.y; next[o + 3] = prev[o + 3] = a.heading; };
    const settle = (i) => { const a = sim.actors[i]; a.x = next[i * 4]; a.z = next[i * 4 + 1]; a.y = next[i * 4 + 2]; a.heading = next[i * 4 + 3]; };
    const receiveFrame = (data) => {
      if (!sim || !map || role === "host" || !match) return;
      const view = new DataView(data), tag = view.getUint32(4, true), epoch = view.getUint32(8, true), frameQ = view.getUint32(12, true);
      if (tag !== match.tag || epoch !== epochSeen || frameQ <= lastQ) return;
      if (!validFrame(view, sim, map)) return;
      lastQ = frameQ;
      const t = now();
      if (haveFrame) { const gap = (t - lastAt) / 1000; frameGap = clamp(gap, 0.05, 0.3); }
      lastAt = t; frameAge = 0;
      for (let i = 0; i < prev.length; i++) prev[i] = next[i];
      decode(view, sim, map, next);
      if (!haveFrame) { for (let i = 0; i < prev.length; i++) prev[i] = next[i]; haveFrame = true; }
    };
    const receiveInput = (m) => {
      if (role !== "host" || !sim || !match || m.s !== match.s || !integerSeat(m.from)) return;
      const local = map.toLocal[m.from], r = remote[local];
      if (local === 0 || !r || m.q <= r.q || match.seats[m.from] === 0) return;
      r.q = m.q; r.at = now();
      r.input.x = m.x / 1000; r.input.z = m.z / 1000; r.input.face = m.f / 1000;
      r.input.crouch = m.b >> 1 & 1; r.input.sprint = m.b >> 2 & 1; r.input.jet = m.b >> 3 & 1;
      if (m.b & 1) r.input.jump = 1;
      if (m.a) for (let i = 0; i < m.a.length; i += 4) if (r.queue.length < 16) r.queue.push(m.a[i], m.a[i + 1] / 1000, m.a[i + 2] / 1000, m.a[i + 3]);
    };
    const integerSeat = v => Number.isInteger(v) && v >= 0 && map && v < map.toLocal.length;
    const offs = [net.subscribeBf(m => m.k === "match" ? receiveMatch(m) : m.k === "input" ? receiveInput(m) : m.k === "chairs-full" ? onChairsFull() : m.k === "lost" ? (match = null, role !== "none" && endRound(), onMatch(null)) : undefined), net.subscribeBfFrame(receiveFrame)];
    const command = (k, extra) => net.sendBf(extra ? Object.assign({ k }, extra) : { k });
    // The guest's action, or the host's own: a guest asks its host, and its own page shows the outcome when the next
    // frame says so. Returns what the scene would branch on: true on a page that decides, true-ish for a guest.
    const act = (name, id, a = 0, b = 0, c) => {
      if (role !== "host" && role !== "guest") return false;
      // The kind slot (0 to `KINDS.length - 1`) carries a shot's kind, or for `wield` the tool's own index (`SIM.WIELD`,
      // as many), never the yaw slot, whose range a tool's index times 1000 would pass.
      const k = name === "wield" ? Math.round(a) : c === undefined ? 0 : Math.max(0, W.KINDS.indexOf(c));
      if (role !== "guest") return ACTION_CALLS[name](sim, id, a, b, k);
      if (actions.length < 16) actions.push(W.ACTIONS.indexOf(name), name === "wield" ? 0 : Math.round(a * 1000), Math.round(b * 1000), k);
      return true;
    };
    const INPUT_MSG = { t: "bf", v: W.WIRE, k: "input", s: "", q: 0, x: 0, z: 0, f: 0, b: 0, a: undefined };
    // Before the host's step: each guest's queued actions, and a silent guest stands still.
    const hostStep = () => {
      const t = now();
      for (let i = 1; i < remote.length; i++) {
        const r = remote[i];
        if (!inputs[i]) continue;
        if (t - r.at > STALE_MS) { r.input.x = r.input.z = r.input.sprint = r.input.crouch = r.input.jet = r.input.jump = 0; }
        for (let k = 0; k < r.queue.length; k += 4) ACTION_CALLS[W.ACTIONS[r.queue[k]]](sim, i, r.queue[k + 1], r.queue[k + 2], r.queue[k + 3]);
        r.queue.length = 0;
      }
    };
    const hostSend = (dt) => {
      for (let i = 0; i < sim.eventCount && pendingCount < MAX_EVENTS; i++) Object.assign(pending[pendingCount++], sim.events[i]);
      sendWait -= dt;
      if (sendWait > 0 && !sim.over) return;
      sendWait = 1 / W.HZ;
      // Viewers take even frames: the last frame of a round is always one of them.
      if (sim.over && q % 2 === 0) q++;
      const n = encode(sim, map, match.tag, match.epoch, ++q, buffer, pending, pendingCount);
      pendingCount = 0;
      net.sendBfFrame(sendViews[n] ||= bytes.subarray(0, n));
      if (sim.over) net.sendBf({ k: "over", s: match.s, w: sim.winner === null ? -1 : sim.winner === "blue" ? 0 : 1 });
    };
    // Guest and watcher: others glide between frames, and shots fly on between them too.
    const interpolate = (dt) => {
      frameAge += dt;
      const k = haveFrame ? clamp(frameAge / frameGap, 0, 1.25) : 1;
      for (let i = 0; i < sim.actors.length; i++) {
        if (i === 0 && role === "guest") continue;
        const a = sim.actors[i], o = i * 4;
        a.x = prev[o] + (next[o] - prev[o]) * k; a.z = prev[o + 1] + (next[o + 1] - prev[o + 1]) * k; a.y = prev[o + 2] + (next[o + 2] - prev[o + 2]) * k;
        let turn = next[o + 3] - prev[o + 3];
        if (turn > Math.PI) turn -= 2 * Math.PI; else if (turn < -Math.PI) turn += 2 * Math.PI;
        a.heading = prev[o + 3] + turn * Math.min(1, k);
      }
      for (let i = 0; i < sim.shots.length; i++) { const s = sim.shots[i]; if (s.live) { s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; } }
    };
    // The guest's own Ooga runs ahead on its own input and is eased back to what the host last said.
    const predict = (dt, move) => {
      const a = sim.actors[0], C = SIM.CONFIG;
      const free = a.splat <= 0 && a.trapped <= 0 && !a.grabbed && !a.ride && !a.riding && !a.flight && a.slip <= 0 && a.knock <= 0;
      if (free) { const speed = C.SPEED * (move.sprint && !a.tired ? C.SPRINT : 1) * (a.netted > 0 ? C.NET_SLOW : 1); a.x += move.x * speed * dt; a.z += move.z * speed * dt; a.heading = move.face; }
      resolveBody(a, C.BODY_R);
      const dx = next[0] - a.x, dz = next[1] - a.z, far = Math.abs(dx) > 3 || Math.abs(dz) > 3, k = far ? 1 : Math.min(1, dt * 8);
      a.x += dx * k; a.z += dz * k;
      a.y += (next[2] - a.y) * Math.min(1, dt * 14);
    };
    const guestSend = (dt, move) => {
      if (move.jump) { jump = 1; move.jump = 0; }
      sendWait -= dt;
      if (sendWait > 0) return;
      sendWait = 1 / W.INPUT_HZ;
      INPUT_MSG.s = match.s; INPUT_MSG.q = inputQ++; INPUT_MSG.x = Math.round(clamp(move.x, -1, 1) * 1000); INPUT_MSG.z = Math.round(clamp(move.z, -1, 1) * 1000);
      INPUT_MSG.f = clamp(Math.round((move.face || 0) * 1000), -7000, 7000);
      INPUT_MSG.b = jump | (move.crouch ? 2 : 0) | (move.sprint ? 4 : 0) | (move.jet ? 8 : 0);
      INPUT_MSG.a = actions.length ? actions : undefined;
      if (net.sendBfInput(INPUT_MSG)) { jump = 0; actions.length = 0; }
    };
    const lobbyTick = (dt) => {
      if (!match) return;
      beatWait -= dt;
      if (beatWait <= 0 && (match.reg.includes(self()) || W.seatOf(match, self()) >= 0)) { beatWait = 2; command("beat"); }
      if (match.phase === "countdown" && !goSent && W.seatOf(match, self()) >= 0 && net.serverNow() + 200 >= match.start) { goSent = command("go", { s: match.s }); }
    };
    return {
      get hasFrame() { return haveFrame; }, get role() { return role; }, get match() { return match; }, get seat() { return seat; }, get map() { return map; },
      bind, act, lobbyTick, hostStep,
      // A frame's work on a live round, after the host stepped it (or in place of stepping, on a guest or the deck).
      after(dt, move) {
        if (role === "host") hostSend(dt);
        else if (sim && role === "guest") { guestSend(dt, move); predict(dt, move); interpolate(dt); }
        else if (sim && role === "watch") interpolate(dt);
      },
      watchNow() { if (match && match.phase === "play") { startedTag = -1; beginRound(); } },
      watchFeed: (on) => command("watch", { on: on ? 1 : 0 }),
      hello: () => command("hello"), register: (m) => command("reg", { m }), unregister: () => command("unreg"), setReady: (r) => command("ready", { r: r ? 1 : 0 }), startAlone: () => command("alone"),
      setOptions: (n, m, r) => command("opt", r === undefined ? { n, m } : { n, m, r }),
      dispose() { endRound(); offs.forEach(off => off()); }
    };
  };
  // The one way in for a visitor who only came to watch: pass a scene's `go` (the director's or the arcade's `open`).
  // Signed-in Oogas land on the watch deck, round or no round; signed out or on an older Worker, the ordinary menu.
  const openWatchDeck = (go) => go("block", W.WATCH_DECK_PLACE);
  BL.blockLive = { create, seatMap, encode, decode, validFrame, EVENT_TYPES, openWatchDeck, ACTOR_EVENTS };
})();
