// Bounded public presentation only. This never grants controls or acknowledges
// host departures. Socket ACKs release one Room delivery credit, nothing else.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {}, MAX = 32, MAX_BYTES = 32768, FEATURE = "host-body-presence-v1";
  const encoder = new TextEncoder(), positive = n => Number.isSafeInteger(n) && n > 0;
  const time = n => Number.isSafeInteger(n) && n >= 0 && Number.isSafeInteger(n + 60000);
  const id = s => typeof s === "string" && /^[A-Za-z0-9._:/-]{1,64}$/.test(s);
  const world = s => typeof s === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(s);
  const exact = (o, keys) => !!o && typeof o === "object" && !Array.isArray(o)
    && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
  const fail = () => { throw Error("invalid body presence"); };
  const bounded = (n, max) => Number.isFinite(n) && Math.abs(n) <= max;
  const motion = m => exact(m, ["x", "y", "z", "yaw", "vx", "vy", "vz", "grounded"])
    && [m.x, m.y, m.z].every(n => bounded(n, 1e6)) && bounded(m.yaw, 2 * Math.PI)
    && [m.vx, m.vy, m.vz].every(n => bounded(n, 1e4)) && typeof m.grounded === "boolean";
  const equipment = e => exact(e, ["weapon", "mode", "primaryOwned", "secondaryOwned", "selectedSlot", "unlimited", "jetpack", "jetpackOwned"])
    && [null, "primary", "gun"].includes(e.weapon) && ["carry", "combat"].includes(e.mode)
    && [1, 2].includes(e.selectedSlot) && [e.primaryOwned, e.secondaryOwned, e.unlimited, e.jetpack, e.jetpackOwned].every(b => typeof b === "boolean");
  const kind = k => k === "ooga" || k === "clanker";
  const same = (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
  };
  const freeze = value => {
    if (value && typeof value === "object") { for (const v of Object.values(value)) freeze(v); Object.freeze(value); }
    return value;
  };
  const validate = frame => {
    if (!exact(frame, ["v", "protocol", "world", "epoch", "revision", "now", "expiresAt", "views", "departures"])
      || frame.v !== 1 || frame.protocol !== "host-session-v5" || !world(frame.world)
      || !positive(frame.epoch) || !positive(frame.revision) || !time(frame.now) || !time(frame.expiresAt)
      || frame.expiresAt <= frame.now || frame.expiresAt - frame.now > 10000
      || !Array.isArray(frame.views) || !Array.isArray(frame.departures) || frame.views.length + frame.departures.length > MAX) fail();
    const bodies = new Set(), generations = new Set(), accounts = new Set(), occupants = new Set();
    const identity = row => {
      if (!positive(row.accountId) || !id(row.bodyId) || !id(row.zone) || !positive(row.generation)
        || !Number.isSafeInteger(row.generation + 1) || bodies.has(row.bodyId) || generations.has(row.generation)) fail();
      bodies.add(row.bodyId); generations.add(row.generation);
    };
    for (const v of frame.views) {
      if (!exact(v, ["accountId", "bodyId", "kind", "generation", "zone", "state", "deadline", "presentation", "motion", "equipment", "occupancy"])
        || !kind(v.kind) || !["live", "grace", "offered", "starting"].includes(v.state)
        || !motion(v.motion) || !equipment(v.equipment) || accounts.has(v.accountId)) fail();
      identity(v); accounts.add(v.accountId);
      if (v.state === "live") { if (v.deadline !== null || v.presentation !== null) fail(); }
      else if (!time(v.deadline) || v.deadline <= frame.now || frame.expiresAt > v.deadline || v.presentation !== "open-hand"
        || v.motion.vx !== 0 || v.motion.vy !== 0 || v.motion.vz !== 0) fail();
      if (v.occupancy !== null) {
        if (!exact(v.occupancy, ["kind", "id"]) || !["hammock", "cabinet"].includes(v.occupancy.kind) || !id(v.occupancy.id)) fail();
        const key = `${v.occupancy.kind}:${v.occupancy.id}`;
        if (occupants.has(key)) fail(); occupants.add(key);
      }
    }
    for (const d of frame.departures) {
      if (!exact(d, ["id", "type", "glyph", "accountId", "bodyId", "generation", "reason", "at", "handback", "zone", "body", "applied"])
        || d.type !== "depart" || d.glyph !== "green" || d.applied !== true || d.id !== `depart:${d.generation}`
        || !["expired", "release", "revoke"].includes(d.reason) || !time(d.at) || d.at > frame.now
        || d.handback !== null && (!exact(d.handback, ["npc"]) || !id(d.handback.npc))
        || !exact(d.body, ["kind", "motion", "equipment"]) || !kind(d.body.kind) || !motion(d.body.motion) || !equipment(d.body.equipment)) fail();
      identity(d);
    }
    if (encoder.encode(JSON.stringify(frame)).length > MAX_BYTES) fail();
    return frame;
  };
  const descriptor = a => exact(a, ["v", ...(a?.v === 2 ? ["format"] : []), "revision", "mode", "world", "epoch"])
    && BL.npcAuthority.descriptor(a, true);
  const create = ({ send, monotonic, wall }) => {
    if (![send, monotonic, wall].every(fn => typeof fn === "function")) fail();
    let authority = null, fence = 0, incompatible = false, enabled = false, failed = false, last = null, current = null;
    let mono = 0, date = 0, startMono = 0, startDate = 0, anchor = 0, rendered = 0;
    const clocks = () => {
      const m = monotonic(), w = wall();
      if (!Number.isFinite(m) || !Number.isFinite(w) || m < mono || w < date) { failed = true; current = null; return null; }
      mono = m; date = w; return [m, w];
    };
    const sample = () => {
      if (!enabled || failed || !current) return null;
      const c = clocks(); if (!c) return null;
      const now = Math.floor(Math.max(rendered, anchor + Math.max(c[0] - startMono, c[1] - startDate)));
      if (!time(now)) { failed = true; current = null; return null; }
      rendered = now;
      return { frame: current.frame, now, stale: current.stale || now >= current.frame.expiresAt };
    };
    return {
      setAuthority(a) {
        if (!descriptor(a)) {
          if (positive(a?.revision) && a.revision > fence) { fence = a.revision; incompatible = true; current = null; }
          return false;
        }
        if (a.revision < fence || a.revision === fence && (incompatible || !same(a, authority))) return false;
        if (a.revision === fence) return true;
        if (a.world !== authority?.world || a.mode !== "server") last = null;
        authority = freeze({ ...a }); fence = a.revision; incompatible = false; current = null; return true;
      },
      open(value) {
        enabled = value === true; failed = false; current = null; rendered = 0;
        mono = monotonic(); date = wall();
        if (!Number.isFinite(mono) || !Number.isFinite(date)) failed = true;
      },
      close() { enabled = false; current = null; },
      message(input) {
        if (!enabled || failed || incompatible || authority?.mode !== "server") return false;
        try {
          if (!exact(input, ["t", "authority", "frame", "stale", "sentAt"]) || input.t !== "body-presence"
            || !descriptor(input.authority) || !same(input.authority, authority) || typeof input.stale !== "boolean" || !time(input.sentAt)) return false;
          const f = validate(input.frame);
          if (f.world !== authority.world || f.epoch < authority.epoch || input.sentAt < f.now || input.stale !== (input.sentAt >= f.expiresAt)) return false;
          if (last) {
            if (f.epoch < last.epoch || f.epoch === last.epoch && f.revision < last.revision) return false;
            const oldRows = [...last.views, ...last.departures];
            for (const row of [...f.views, ...f.departures]) {
              const old = oldRows.find(v => v.bodyId === row.bodyId);
              if (old && row.generation < old.generation) return false;
            }
            if (f.epoch === last.epoch && f.revision === last.revision
              && (f.now < last.now || f.expiresAt < last.expiresAt || !same(f.views, last.views) || !same(f.departures, last.departures))) return false;
          }
          // Duplicate messages ACK again, but never restart the render clock.
          const previous = current && sample();
          if (failed || !clocks()) return false;
          if (!current || !same(input, current)) {
            current = freeze(JSON.parse(JSON.stringify(input))); last = current.frame;
            anchor = Math.max(input.sentAt, previous?.now || 0); rendered = anchor;
            startMono = mono; startDate = date;
          }
          try { send({ t: "body-presence-ack", authority: authority.revision, epoch: f.epoch, revision: f.revision }); } catch { /* Exact retry can release credit. */ }
          return true;
        } catch { return false; }
      },
      sample,
    };
  };
  BL.bodyPresence = { FEATURE, MAX, MAX_BYTES, validate, create };
})();
