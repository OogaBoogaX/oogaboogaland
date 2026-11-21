// The island's loose props (physics.js) in step for signed-in players, on the crew's host (npc-sync.js): the room's
// elected page (`net.state.hostId`) simulates them as always and sends what moved; every other page showing the
// island stops simulating and plays them back, and sends its own rounds, blows and pokes at a prop to the host.
// Signed out, with no room, or under a host that sends nothing this page can read (another build, Canvas 2D, which
// has no props), each page simulates its own, as before.
//
// A frame (little-endian): u32 MAGIC, u32 the bodies' signature (physics.js `signature`), u8 flags (FULL), u8 count,
// then RECORD bytes a body: u8 index, u8 state (HOME, MOVING or REST) with the turn's largest component in bits 2-3,
// three i16 of its centre from where it rests (1/256 m) and three i16 of its turn (the smallest three). The host
// sends at most SEND_S apart, only while a page follows, and only the bodies awake or whose state changed since the
// last frame, so resting props cost nothing. A FULL frame lists every body out of place (the rest are home): on
// election, whenever the room's followers change (a page arriving catches up) and every FULL_S while anything is out.
//
// A follower eases each body from where it shows to the newest record over EASE_S, a little over a send interval, so
// evenly arriving frames play a steady move; its bodies are held asleep where shown (`physics.place`), still met by
// rays and feet. Elected host, it carries on from exactly what it shows.
// An input is JSON `{ t: "prop", k, a: [six numbers] }`, relayed by the room to the host alone: "s" a round (from, to),
// "b" a blow (x, feet, z, height, yaw, charge), "k" a poke (body, from x, from z, power), "r" every prop home, and
// "f", a page that has not heard this host yet asking for a FULL frame (again after ASK_S, doubling to ASK_MAX_S).
// Nothing here allocates a frame; a sent frame reuses one buffer and a view per length, a heard one costs its view.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const MAGIC = 0x31504f52, HEADER = 10, RECORD = 14, FULL = 1;
  const HOME = 0, MOVING = 1, REST = 2, UNSENT = 255;
  const SEND_S = 1 / 15, EASE_S = SEND_S * 1.2, FULL_S = 3, HANDOVER_S = 2, SNAP = 4, ASK_S = 2, ASK_MAX_S = 32;
  const POS = 256, TURN = 32767 / Math.SQRT1_2;

  const create = ({ physics, net = BL.net, onHome = null }) => {
    const N = BL.physics.MAX_BODIES;
    const buffer = new ArrayBuffer(HEADER + N * RECORD), out = new DataView(buffer), views = new Array(N + 1).fill(null);
    const SENT = new Uint8Array(N).fill(UNSENT), ACTIVE = new Uint8Array(N), SEEN = new Uint8Array(N), HEARD = new Uint8Array(N);
    const FROM = new Float64Array(7 * N), TO = new Float64Array(7 * N), AT = new Float32Array(N);
    const S = new Float64Array(7), HOME_AT = new Float64Array(3), HIT = { body: -1, t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
    const A = { x: 0, y: 0, z: 0 }, B = { x: 0, y: 0, z: 0 };
    const stats = { sent: 0, bytes: 0, heard: 0, inputs: 0, mode: "solo" };
    let world = null, sig = 0, sigCount = -1;
    let hosting = false, following = false, confirmed = 0, handover = 0, snap = true;
    let clock = 0, sinceFull = 0, epoch = -1, wantFull = false, asked = 0, askIn = 0, askEvery = ASK_S;

    const bodies = () => {
      world = physics();
      if (!world || !world.count) return false;
      if (world.count !== sigCount) { sigCount = world.count; sig = world.signature(); }
      return true;
    };
    const live = () => net.state.room === "live" && net.state.props && net.state.hostId > 0;

    // ---- the host ----
    const encode = (o, i, state) => {
      out.setUint8(o, i);
      if (state === HOME) { out.setUint8(o + 1, HOME); for (let k = 2; k < RECORD; k += 2) out.setInt16(o + k, 0, true); return; }
      world.read(i, S); world.restAt(i, HOME_AT);
      let m = 3;
      for (let k = 4; k < 7; k++) if (Math.abs(S[k]) > Math.abs(S[m])) m = k;
      const sign = S[m] < 0 ? -TURN : TURN;
      out.setUint8(o + 1, state | (m - 3) << 2);
      for (let k = 0; k < 3; k++) out.setInt16(o + 2 + 2 * k, Math.max(-32767, Math.min(32767, Math.round((S[k] - HOME_AT[k]) * POS))), true);
      for (let k = 3, w = o + 8; k < 7; k++) if (k !== m) { out.setInt16(w, Math.max(-32767, Math.min(32767, Math.round(S[k] * sign))), true); w += 2; }
    };
    const publish = (dt) => {
      if (!hosting) return;
      const state = net.state;
      if (state.hostEpoch !== epoch) { epoch = state.hostEpoch; wantFull = true; }
      clock += dt; sinceFull += dt;
      if (!state.followers) { clock = 0; return; }
      if (!wantFull && clock < SEND_S) return;
      clock = 0;
      const full = wantFull || sinceFull >= FULL_S;
      let n = 0, changed = false;
      for (let i = 0; i < world.count; i++) {
        const now = !world.asleep(i) ? MOVING : world.displaced(i) || !world.atHome(i) ? REST : HOME;
        if (now !== SENT[i]) changed = true;
        if (full ? now !== HOME : now === MOVING || now !== SENT[i]) encode(HEADER + RECORD * n++, i, now);
        SENT[i] = now;
      }
      if (full) sinceFull = 0;
      // Nothing moving and nothing changed says nothing new; an empty FULL still says the last prop went home.
      if (!n && !wantFull && !changed) return;
      wantFull = false;
      out.setUint32(0, MAGIC, true); out.setUint32(4, sig, true); out.setUint8(8, full ? FULL : 0); out.setUint8(9, n);
      const view = views[n] || (views[n] = new Uint8Array(buffer, 0, HEADER + RECORD * n));
      net.sendProps(view);
      stats.sent++; stats.bytes += view.byteLength;
    };
    // A follower's own round, blow or poke, applied to this page's simulation.
    const input = (msg) => {
      if (!hosting || !bodies()) return;
      const a = msg.a;
      stats.inputs++;
      if (msg.k === "s") { A.x = a[0]; A.y = a[1]; A.z = a[2]; B.x = a[3]; B.y = a[4]; B.z = a[5]; world.shot(A, B); }
      else if (msg.k === "b") world.blow(a[0], a[1], a[2], Math.max(0.5, Math.min(4, a[3])), a[4], Math.max(-1, Math.min(1, a[5])));
      else if (msg.k === "k") { if (Number.isInteger(a[0]) && a[0] >= 0 && a[0] < world.count) world.knock(a[0], a[1], a[2], Math.max(0, Math.min(40, a[3]))); }
      else if (msg.k === "r") world.reset(onHome);
      else if (msg.k === "f") wantFull = true;
    };

    // ---- a follower ----
    const settle = (i) => {
      if (!ACTIVE[i]) return;
      const t = 7 * i;
      ACTIVE[i] = 0;
      world.place(i, TO[t], TO[t + 1], TO[t + 2], TO[t + 3], TO[t + 4], TO[t + 5], TO[t + 6]);
    };
    // This page simulates again: each body where it was last heard, and one heard moving awake to fall on from there.
    const release = () => {
      if (!world) return;
      for (let i = 0; i < world.count; i++) { settle(i); if (HEARD[i] === MOVING) world.wake(i); HEARD[i] = HOME; }
      world.sync();
    };
    const frame = (data) => {
      const state = net.state;
      if (!live() || state.hostId === state.selfId || !bodies()) return;
      const view = new DataView(data), n = data.byteLength >= HEADER ? view.getUint8(9) : -1;
      if (n < 0 || data.byteLength !== HEADER + RECORD * n || view.getUint32(4, true) !== sig) return;
      const full = (view.getUint8(8) & FULL) !== 0;
      // The first frame from a host is where everything is now; a delta alone could leave a body behind.
      if (confirmed !== state.hostId) { if (!full) return; confirmed = state.hostId; snap = !following; }
      stats.heard++;
      if (full) SEEN.fill(0);
      for (let r = 0, o = HEADER; r < n; r++, o += RECORD) {
        const i = view.getUint8(o), flags = view.getUint8(o + 1), kind = flags & 3;
        if (i >= world.count) continue;
        SEEN[i] = 1;
        if (kind === HOME) {
          if (ACTIVE[i] || world.displaced(i) || !world.asleep(i)) { ACTIVE[i] = 0; if (onHome) onHome(i); world.home(i); }
          HEARD[i] = HOME;
          continue;
        }
        const t = 7 * i, m = 3 + (flags >> 2 & 3);
        world.read(i, FROM, t); world.restAt(i, S);
        let rest = 1, dot = 0, far = 0;
        for (let k = 0; k < 3; k++) { TO[t + k] = S[k] + view.getInt16(o + 2 + 2 * k, true) / POS; far = Math.max(far, Math.abs(TO[t + k] - FROM[t + k])); }
        for (let k = 3, w = o + 8; k < 7; k++) if (k !== m) { const v = view.getInt16(w, true) / TURN; TO[t + k] = v; rest -= v * v; w += 2; }
        TO[t + m] = Math.sqrt(Math.max(0, rest));
        // A unit turn whatever was sent, the short way round from the one shown.
        const unit = Math.hypot(TO[t + 3], TO[t + 4], TO[t + 5], TO[t + 6]) || 1;
        for (let k = 3; k < 7; k++) { TO[t + k] /= unit; dot += TO[t + k] * FROM[t + k]; }
        if (dot < 0) for (let k = 3; k < 7; k++) TO[t + k] = -TO[t + k];
        ACTIVE[i] = 1; AT[i] = 0; HEARD[i] = kind;
        if (snap || far > SNAP) settle(i);
      }
      if (full) for (let i = 0; i < world.count; i++) if (!SEEN[i] && (ACTIVE[i] || world.displaced(i) || !world.asleep(i))) { ACTIVE[i] = 0; HEARD[i] = HOME; world.home(i); }
      snap = false;
    };
    const play = (dt) => {
      for (let i = 0; i < world.count; i++) {
        if (!ACTIVE[i]) continue;
        const t = 7 * i, k = Math.min(1, (AT[i] += dt) / EASE_S), j = 1 - k;
        if (k >= 1) { settle(i); continue; }
        const qx = FROM[t + 3] * j + TO[t + 3] * k, qy = FROM[t + 4] * j + TO[t + 4] * k, qz = FROM[t + 5] * j + TO[t + 5] * k, qw = FROM[t + 6] * j + TO[t + 6] * k;
        const l = Math.hypot(qx, qy, qz, qw) || 1;
        world.place(i, FROM[t] * j + TO[t] * k, FROM[t + 1] * j + TO[t + 1] * k, FROM[t + 2] * j + TO[t + 2] * k, qx / l, qy / l, qz / l, qw / l);
      }
      world.sync();
    };

    // Once a frame, before the scene steps its props: true when another page simulates them and they were played back.
    const update = (dt) => {
      const state = net.state, on = bodies() && live(), host = on && state.hostId === state.selfId;
      if (host && !hosting) {
        // Elected: carry on from exactly what this page shows, and say where everything is.
        release();
        SENT.fill(UNSENT); wantFull = true; clock = 0; epoch = state.hostEpoch;
      }
      hosting = host;
      let next = false;
      if (on && !host) {
        if (confirmed === state.hostId) { next = true; handover = 0; }
        // A new host's first frame is waited for a moment where this page was already following, rather than
        // simulating a second copy in between.
        else {
          if (following && (handover += dt) <= HANDOVER_S) next = true;
          // Its first FULL frame may have gone by before this page listened, or been refused: ask, ever less often.
          if (asked !== state.hostId) { asked = state.hostId; askIn = ASK_S; askEvery = 2 * ASK_S; }
          if ((askIn -= dt) <= 0) { askIn = askEvery; askEvery = Math.min(ASK_MAX_S, askEvery * 2); tell("f", 0, 0, 0, 0, 0, 0); }
        }
      } else { confirmed = 0; handover = 0; asked = 0; }
      if (following && !next) release();
      following = next;
      stats.mode = hosting ? "host" : following ? "follow" : "solo";
      if (following) play(dt);
      return following;
    };

    // ---- this page's own rounds, blows and pokes while it follows: each true when the host was told instead ----
    const tell = (k, a, b, c, d, e, f) => net.sendPropInput(k, a, b, c, d, e, f);
    // The round stops on the first prop on its line as this page shows it (`to` is moved); the host knocks it.
    const shot = (from, to) => {
      if (!following) return false;
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, len = Math.hypot(dx, dy, dz);
      if (len < 1e-4 || !world.raycast(from.x, from.y, from.z, dx / len, dy / len, dz / len, len, HIT)) return true;
      tell("s", from.x, from.y, from.z, to.x, to.y, to.z);
      to.x = HIT.x; to.y = HIT.y; to.z = HIT.z;
      return true;
    };
    const blow = (x, feet, z, height, yaw, charge) => {
      if (!following) return false;
      // Only a blow with a prop in reach is worth the host's while.
      for (let i = 0; i < world.count; i++) {
        world.read(i, S);
        if (Math.abs(S[0] - x) < 3 && Math.abs(S[2] - z) < 3 && Math.abs(S[1] - feet) < 4) { tell("b", x, feet, z, height, yaw, charge); break; }
      }
      return true;
    };
    const knock = (i, fromX, fromZ, power) => following && (tell("k", i, fromX, fromZ, power, 0, 0), true);
    const reset = () => following && (tell("r", 0, 0, 0, 0, 0, 0), true);

    const unsubscribe = net.subscribeProps((data, msg) => { if (data) frame(data); else input(msg); });
    // A kept island put away keeps listening (the room sends it nothing meanwhile) and starts over when it is back.
    const suspend = () => {
      if (following) release();
      hosting = following = false; confirmed = asked = 0; handover = 0;
    };
    const dispose = () => { suspend(); unsubscribe(); world = null; };
    return { update, publish, shot, blow, knock, reset, suspend, dispose, stats, get following() { return following; }, get hosting() { return hosting; } };
  };
  BL.propSync = { create, MAGIC, HEADER, RECORD, SEND_S };
})();
