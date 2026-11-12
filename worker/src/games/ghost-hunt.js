// HALLOWEEN: the arcade's ghost hunt as the server runs it, hosted by game-host.js as kind "ghost-hunt" at the venue
// "arena": the page's own rules (src/js/ghost-sim.js, imported unchanged) on the server's clock, with every player
// presented each tick from the last pose their page sent, and every hit decided here.
//
// A page in the arena sends where its player stands (`pose`, about the arena's middle, at most ten a second and one a
// second while still), what they do (`start` and `ready` only from the arena, `leave`, `pause` from a debug account,
// and `start`'s round past 1 only from one), and each rifle round and bash (`shot`, `bash`) with the hunt time it showed
// and the target it saw them meet. A round counts only from a hunter in the hunt and standing, during a fight, from
// near where their page last said they stand, at most as fast as a rifle fires (game-host.js's bucket). It is rewound to
// the moment its page showed, at most `REWIND_MS` back: the rules' target table is kept a tick at a time in a
// game-timeline.js. The rules' own test (`resolveShot`) then finds what it met: the page's target if the line passes
// within `HINT_PAD` of it, else the nearest it meets. It lands for the rules' damage (`shotDamage`), never the page's.
// A hunter's monkeys fire with them from where the rules have them, and a bash meets what is in front of its hunter.
// The state goes out as the rules' own snapshot; the motion goes every tick as a game-wire.js frame, with each round of
// each shooter's that landed. Players are presented only from poses no older than `POSE_FRESH_MS`, inside the arena,
// and not just after a jump no Ooga runs (away `AWAY_MS`).
import "../../../src/js/ghost-sim.js";
import "../../../src/js/game-timeline.js";

const SIM = globalThis.BL.ghostSim, TIMELINE = globalThis.BL.gameTimeline, ST = SIM.STATE, A = SIM.ARENA, C = SIM.CONFIG;
const COOLDOWN_MS = 5000, POSE_FRESH_MS = 3000, REWIND_MS = 600, HISTORY = 16, MAX_CONFIRMS = 64;
const HINT_PAD = 0.3, NEAR_PAD = 0.15, MONKEY_PAD = 0.6, BASH_PAD = 0.6;
const ORIGIN_SLACK = 1.5, MAX_SPEED = 14, JUMP_SLACK = 2, AWAY_MS = 500, BOUND = 200;
// The motion frame's row types: ghosts, the gorillas' slots, spiderlings, the boss.
const ROW_GHOST = 0, ROW_BRUTE = 1, ROW_LING = 2, ROW_BOSS = 3;
// A confirmation's flags: the round killed what it met; a monkey fired it; a bash.
const KILLED = 1, MONKEY = 2, BASHED = 4;

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const vec = (a, n) => Array.isArray(a) && a.length === n && a.every(finite);
const hint = (h) => Number.isInteger(h) && h >= -1 && h <= 0x7fffffff;
const sequence = (q) => Number.isInteger(q) && q >= 0 && q <= 0xffff;

/** A page's message as the hunt reads it: false for one that is not a message at all, null for one to ignore. */
const parse = (m) => {
  if (!m || typeof m !== "object" || Array.isArray(m) || typeof m.t !== "string") return false;
  if (m.t === "pose") {
    if (!vec(m.p, 5)) return null;
    const [x, y, z, yaw, h] = m.p;
    if (Math.abs(x) > BOUND || Math.abs(z) > BOUND || y < -50 || y > 100) return null;
    return { t: "pose", p: [x, y, z, yaw, Math.min(3, Math.max(0.5, h))] };
  }
  if (m.t === "start") return { t: "start", r: Number.isInteger(m.r) && m.r > 1 && m.r <= SIM.ROUNDS.length + 1 ? m.r : 0 };
  if (m.t === "ready" || m.t === "leave" || m.t === "pause") return { t: m.t };
  if (m.t === "shot") {
    if (!sequence(m.q) || !finite(m.at) || !vec(m.o, 3) || !vec(m.d, 3) || !finite(m.l) || !Array.isArray(m.h) || m.h.length !== 3 || !m.h.every(hint)) return null;
    const len = Math.hypot(m.d[0], m.d[1], m.d[2]);
    if (!(len > 0.5 && len < 1.5) || m.o.some((v) => Math.abs(v) > BOUND)) return null;
    return { t: "shot", q: m.q, at: m.at, o: m.o, d: [m.d[0] / len, m.d[1] / len, m.d[2] / len], l: Math.min(SIM.HIT.range, Math.max(0, m.l)), h: m.h };
  }
  if (m.t === "bash") return sequence(m.q) && finite(m.at) && hint(m.h) ? { t: "bash", q: m.q, at: m.at, h: m.h } : null;
  return null;
};

const create = () => {
  const sim = SIM.create({ seed: A.seed, spots: A.spots, lapMs: A.lapMs, pile: A.pile, elixirs: A.elixirs, maxReady: A.hunters });
  const S = sim.state;
  const now_ = new Float64Array(SIM.TARGET_SLOTS * SIM.TARGET_WIDTH), past = new Float64Array(now_.length);
  const history = TIMELINE.create({ slots: SIM.TARGET_SLOTS, width: SIM.TARGET_WIDTH, depth: HISTORY, lerp: [1, 2, 3] });
  // Account id → where their page last said they stand: { x, y, z, yaw, h, at, speed, awayUntil }.
  const poses = new Map();
  const confirm = new Float64Array(MAX_CONFIRMS * 5);
  const MET = { slot: -1, id: 0, along: 0, x: 0, y: 0, z: 0 }, FROM = { x: 0, y: 0, z: 0 }, AIM = { x: 0, y: 0, z: 0 };
  let confirms = 0, idleAt = -Infinity, was = S.state;

  const fresh = (q, now) => !!q && now - q.at <= POSE_FRESH_MS && now >= q.awayUntil;
  const inArena = (q) => q.y > -1.5 && Math.hypot(q.x, q.z) <= A.r;
  const here = (q, now) => fresh(q, now) && inArena(q);
  const fighting = () => (S.state === ST.ACTIVE || S.state === ST.BOSS) && !S.paused;

  const takePose = (id, p, now) => {
    let q = poses.get(id);
    if (!q) {
      poses.set(id, { x: p[0], y: p[1], z: p[2], yaw: p[3], h: p[4], at: now, speed: 0, awayUntil: 0 });
      return;
    }
    const dt = Math.max(0.05, (now - q.at) / 1000), moved = Math.hypot(p[0] - q.x, p[2] - q.z);
    if (moved > MAX_SPEED * dt + JUMP_SLACK) q.awayUntil = now + AWAY_MS;
    q.speed = Math.min(MAX_SPEED, moved / dt);
    q.x = p[0]; q.y = p[1]; q.z = p[2]; q.yaw = p[3]; q.h = p[4]; q.at = now;
  };
  // The target table as it stood at hunt time `at`, into `past`, at most REWIND_MS back; false with none kept.
  const rewind = (at) => {
    if (!history.count) return false;
    history.sample(Math.min(S.now, Math.max(S.now - REWIND_MS, at)), past);
    return true;
  };
  const land = (p, seq, met, damage, flags) => {
    if (!met || confirms >= MAX_CONFIRMS) return;
    const result = sim.hitBy(MET.id, damage, p.id);
    if (!result) return;
    const o = confirms++ * 5;
    confirm[o] = p.id; confirm[o + 1] = seq; confirm[o + 2] = MET.id; confirm[o + 3] = damage; confirm[o + 4] = flags | (result === "kill" ? KILLED : 0);
  };
  // Whether player `p` may land a hit now: in the hunt and standing during a fight, posed lately, and `ox, oy, oz` (where
  // the round left from) near where they stand, as far as they could have run since.
  const may = (p, q, now, ox, oy, oz) => {
    const me = sim.playerById(p.id);
    if (!fighting() || !me || !me.inGame || sim.frozen(me) || !fresh(q, now)) return false;
    const reach = ORIGIN_SLACK + q.speed * (now - q.at) / 1000;
    return Math.hypot(ox - q.x, oz - q.z) <= reach && oy >= q.y - 0.5 && oy <= q.y + 3;
  };
  const shot = (p, q, m, now) => {
    const [ox, oy, oz] = m.o, [dx, dy, dz] = m.d;
    if (!may(p, q, now, ox, oy, oz) || !rewind(m.at)) return;
    const damage = sim.shotDamage();
    land(p, m.q, SIM.resolveShot(past, ox, oy, oz, dx, dy, dz, SIM.HIT.range, m.h[0], HINT_PAD, NEAR_PAD, MET), damage, 0);
    if (!sim.playerById(p.id).monkeys) return;
    const tx = ox + dx * m.l, ty = oy + dy * m.l, tz = oz + dz * m.l;
    for (let k = 0; k < 2; k++) {
      const side = k ? -1 : 1;
      SIM.monkeyOrigin(q.x, q.y, q.z, q.yaw, q.h, side, FROM);
      SIM.monkeyAim(ox, oz, tx, ty, tz, side, AIM);
      const mx = AIM.x - FROM.x, my = AIM.y - FROM.y, mz = AIM.z - FROM.z, len = Math.hypot(mx, my, mz) || 1;
      land(p, m.q, SIM.resolveShot(past, FROM.x, FROM.y, FROM.z, mx / len, my / len, mz / len, SIM.HIT.range, m.h[1 + k], MONKEY_PAD, MONKEY_PAD, MET), damage, MONKEY);
    }
  };
  const bash = (p, q, m, now) => {
    if (!q || !may(p, q, now, q.x, q.y, q.z) || !rewind(m.at)) return;
    land(p, m.q, SIM.resolveBash(past, q.x, q.y, q.z, q.yaw, m.h, BASH_PAD, NEAR_PAD, MET), SIM.HIT.bash.damage, BASHED);
  };

  return {
    join: () => {},
    leave: (p) => { poses.delete(p.id); },
    /** A page's message, read by `parse`; true when the hunt's state changed and should go out now. */
    message: (p, m, now) => {
      const q = poses.get(p.id);
      if (m.t === "pose") { takePose(p.id, m.p, now); return false; }
      if (m.t === "start") {
        if (!here(q, now)) return false;
        if (S.state === ST.IDLE) return now - idleAt >= COOLDOWN_MS && sim.start(now, p.id, p.debug && m.r ? m.r : 1);
        return S.state === ST.GATHER && sim.ready(p.id);
      }
      if (m.t === "ready") return here(q, now) && sim.ready(p.id);
      if (m.t === "leave") return sim.leave(p.id);
      if (m.t === "pause") return p.debug && sim.pause(!S.paused, now);
      if (m.t === "shot") shot(p, q, m, now);
      else if (m.t === "bash") bash(p, q, m, now);
      return false;
    },
    /** The hunt to `now`; true when its state changed (a phase, a round). */
    step: (now) => {
      if (S.state !== ST.IDLE) {
        sim.beginPresence();
        for (const [id, q] of poses) if (here(q, now)) sim.present(id, q.x, q.y, q.z);
        sim.advance(now);
        history.push(S.now, sim.targets(now_));
      }
      if (S.state === was) return false;
      if (S.state === ST.IDLE) { idleAt = now; history.clear(); }
      was = S.state;
      return true;
    },
    running: () => S.state !== ST.IDLE,
    state: () => sim.snapshot(),
    /** Where everything that moves stands now, and the rounds landed since the last, into game-wire.js frame `f`. */
    motion: (f, now) => {
      if (S.state === ST.IDLE) { confirms = 0; return false; }
      let n = 0;
      const row = (type, slot, id, x, y, z, heading) => {
        const k = n++ * 8, r = f.rows;
        r[k] = type; r[k + 1] = slot; r[k + 2] = id; r[k + 3] = x; r[k + 4] = y; r[k + 5] = z; r[k + 6] = heading; r[k + 7] = 1;
      };
      for (let i = 0; i < sim.ghosts.length; i++) { const g = sim.ghosts[i]; if (g.on) row(ROW_GHOST, i, g.id, g.x, g.y, g.z, 0); }
      for (let i = 0; i < sim.brutes.length; i++) { const b = sim.brutes[i]; if (b.on) row(ROW_BRUTE, i, b.id, b.x, b.y, b.z, b.heading); }
      for (let i = 0; i < sim.lings.length; i++) { const l = sim.lings[i]; if (l.on) row(ROW_LING, i, l.id, l.x, 0, l.z, l.heading); }
      if (S.bossOn) row(ROW_BOSS, 0, 0, S.bossX, 0, S.bossZ, 0);
      f.kind = ghostHunt.code; f.serverMs = now; f.gameMs = S.now; f.count = n;
      f.confirms = confirms;
      f.confirm.set(confirm.subarray(0, confirms * 5));
      confirms = 0;
      return true;
    },
    /** What a restart picks up: the hunt as its snapshot, or null once it has run down. */
    save: () => S.state === ST.IDLE ? null : JSON.stringify(sim.snapshot()),
    /** Picks up a saved hunt at `now`, its clock going on from where it stopped. */
    restore: (data, now) => {
      let snap = null;
      try { snap = JSON.parse(data); } catch { return false; }
      if (!sim.load(snap) || S.state === ST.IDLE) { sim.clear(); was = S.state; return false; }
      S.epoch = now - S.now;
      was = S.state;
      history.clear();
      return true;
    },
    debug: { sim, poses, history }
  };
};

export const ghostHunt = {
  id: "ghost-hunt", code: 1, version: 1, venues: ["arena"], tickMs: C.TICK_MS, stateEvery: 5,
  limits: { sockets: 32, chars: 256 },
  buckets: { pose: { rate: 12, burst: 6 }, shot: { rate: 12, burst: 6 }, control: { rate: 2, burst: 4 } },
  bucketOf: (t) => t === "pose" ? "pose" : t === "shot" || t === "bash" ? "shot" : "control",
  parse, create
};
