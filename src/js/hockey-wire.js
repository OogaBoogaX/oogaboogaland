// Air hockey pilot contract shared by the page and room. Millimetres and milliseconds, never video.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const FEATURE = "hockey-v4", ZONE = "arcade.hall", HZ = 10, INPUT_HZ = 20, IDLE_MS = 15000;
  const SCALE = 1.35, SEAT = 1.1 * SCALE + 0.55;
  const MALLET_RADIUS = 0.07, MALLET_X = 0.48, MALLET_DEPTH = 0.96, LENGTH = 2.2;
  // One radius-aware rectangle for pointer presentation and host simulation. Clamp axes independently.
  const malletTarget = (x, depth, side, out) => {
    out.u = Math.max(-1, Math.min(1, x)) * MALLET_X * (side ? -1 : 1);
    const v = MALLET_RADIUS + Math.max(0, Math.min(1, depth ?? 0.13 / MALLET_DEPTH)) * MALLET_DEPTH;
    out.v = side ? LENGTH - v : v;
    return out;
  };
  const TABLES = [[16.3, -4.75], [-13.3, -14.15], [13.55, -14.15]];
  const integer = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const validFrame = a => Array.isArray(a) && a.length === 18 &&
    a.every(Number.isInteger) && integer(a[0], -600, 600) && integer(a[1], -150, 2350) &&
    integer(a[2], -8000, 8000) && integer(a[3], -8000, 8000) &&
    integer(a[4], -480, 480) && integer(a[5], 70, 1030) && integer(a[6], -480, 480) && integer(a[7], 1170, 2130) &&
    integer(a[8], 0, 7) && integer(a[9], 0, 7) && integer(a[10], -1, 180000) && integer(a[11], 0, 1400) &&
    integer(a[12], -1000, 1000) && integer(a[13], -1000, 1000) && a[14] === a[8] && a[15] === a[9] && integer(a[16], 0, 1) && integer(a[17], 0, 65535);
  const parse = m => {
    if (!integer(m.i, 0, 2)) return null;
    // Older browsers must never join or drive a v4 table. Allow their owned cleanup only.
    if (m.v !== 4 && !((m.v === undefined || m.v === 3) && (m.k === "leave" || m.k === "cancel"))) return null;
    const base = { t: "hockey", k: m.k, i: m.i };
    if (m.k === "join") { if (!integer(m.e, 0, 1)) return null; base.e = m.e; return base; }
    if (m.k === "watch" || m.k === "cancel") return base;
    if (typeof m.s !== "string" || !/^[a-f0-9]{16}$/.test(m.s)) return null;
    base.s = m.s;
    if (["ready", "leave", "beat"].includes(m.k)) return base;
    if (!integer(m.q, 0, 0x7fffffff)) return null;
    base.q = m.q;
    if (m.k === "frame" && validFrame(m.a)) return { ...base, a: m.a };
    if (m.k === "input" && integer(m.x, -1000, 1000) && integer(m.y, 0, 1000)) {
      if (m.p === undefined && m.d === undefined) return { ...base, x: m.x, y: m.y };
      if (!Array.isArray(m.p) || m.p.length < 2 || m.p.length > 12 || m.p.length % 2 || !integer(m.d, 0, 1)) return null;
      for (let i = 0; i < m.p.length; i += 2) if (!integer(m.p[i], -1000, 1000) || !integer(m.p[i + 1], 0, 1000)) return null;
      if (m.p[m.p.length - 2] !== m.x || m.p[m.p.length - 1] !== m.y) return null;
      return { ...base, x: m.x, y: m.y, p: m.p, d: m.d };
    }
    return null;
  };
  const eligible = p => p && p.zone === ZONE && !!p.body && !p.body.startsWith("gorilla:");
  const near = (p, i) => eligible(p) && Math.abs(p.y) < 0.6 && Math.hypot(p.x - TABLES[i][0], p.z - TABLES[i][1]) < 3;
  const seat = (i, side, u, out) => { out.x = TABLES[i][0] + u; out.y = 0; out.z = TABLES[i][1] + (side ? -SEAT : SEAT); out.yaw = side ? 0 : Math.PI; return out; };
  BL.hockeyWire = { FEATURE, ZONE, HZ, INPUT_HZ, IDLE_MS, SCALE, SEAT, TABLES, MALLET_RADIUS, MALLET_X, MALLET_DEPTH, malletTarget, parse, validFrame, eligible, near, seat };
})();
