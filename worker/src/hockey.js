// Three bounded tables; the authenticated first seat simulates. No scores or currency are trusted here.
// Hibernation attachments preserve sessions; separate bounded storage holds admission/replay debt.
import "../../src/js/hockey-wire.js";
import { hockeyLimits } from "./hockey-limits.js";
const W = globalThis.BL.hockeyWire;
export const hockey = {
  loadLimits: hockeyLimits.load,
  restore(room) {
    room.hockeyTables = [null, null, null];
    for (const p of room.players.values()) {
      const s = p.hockey;
      if (s && s.ids[0] === p.id && s.i >= 0 && s.i < 3) {
        const proof = room.hockeyLimits?.proofs[s.i];
        if (s.wire === 4 && (s.e === 0 || s.e === 1) && proof && proof.s === s.s && proof.v === 2 && s.ids.every((id, side) => id === proof.ids[side] && (!id || room.players.get(id)?.connectionToken === proof.tokens[side]))) room.hockeyTables[s.i] = s;
        else hockey.clear(room, s); // An attachment alone cannot prove that an admission write committed.
      }
    }
    hockey.sweep(room);
  },
  tell(room, s, to = null) {
    const msg = { t: "hockey", k: "table", i: s.i, s: s.s, ids: s.ids, ready: s.ready, e: s.e, phase: s.phase, start: s.start || 0, q: s.q, a: s.a, now: Date.now() };
    if (to) room.send(to.ws, msg); else room.broadcastZone(W.ZONE, msg);
  },
  save(room, s) {
    const host = room.players.get(s.ids[0]);
    if (host) { host.hockey = s; host.ws.serializeAttachment(room.attachment(host)); }
  },
  clear(room, s) {
    const host = room.players.get(s.ids[0]);
    if (host) { host.hockey = null; host.ws.serializeAttachment(room.attachment(host)); }
    room.hockeyTables[s.i] = null;
    room.broadcastZone(W.ZONE, { t: "hockey", k: "table", i: s.i, s: s.s, ids: [], phase: "closed", now: Date.now() });
  },
  leave(room, id) {
    for (const s of room.hockeyTables || []) if (s && s.ids.includes(id)) hockey.clear(room, s);
  },
  sweep(room) {
    const now = Date.now();
    for (const s of room.hockeyTables || []) if (s && ((s.wire !== 4 || (s.e !== 0 && s.e !== 1)) || ((s.phase !== "play" && now - (s.doneAt || s.created) > 240000) || s.ids.some((id, side) => id && (!W.near(room.players.get(id), s.i) || now - s.seen[side] > W.IDLE_MS))))) hockey.clear(room, s);
  },
  arrive(room, p) {
    hockey.sweep(room);
    const count = room.hockeyTables.reduce((n, s) => n + !!s, 0);
    if (p.zone === W.ZONE && hockeyLimits.replay(room, p, count)) for (const s of room.hockeyTables) if (s) hockey.tell(room, s, p);
  },
  message(room, p, m) {
    const now = Date.now();
    // Releasing an owned seat must work even just after join + ready consumed the control burst.
    const leaving = room.hockeyTables[m.i];
    if (leaving && leaving.ids.includes(p.id) && (m.k === "leave" && leaving.s === m.s || m.k === "cancel" && leaving.phase === "lobby")) { hockey.clear(room, leaving); return; }
    // Separate control and traffic budgets; persisted with seat state across hibernation.
    const rate = m.k === "frame" ? 10 : m.k === "input" ? 20 : 2;
    const key = m.k === "frame" ? "frame" : m.k === "input" ? "input" : "control";
    const buckets = p.hockeyBuckets ||= {};
    const b = buckets[key] ||= { at: now, tokens: rate };
    b.tokens = Math.min(rate, b.tokens + Math.max(0, now - b.at) * rate / 1000); b.at = now;
    if (b.tokens < 1) return;
    b.tokens--;
    hockey.sweep(room);
    let s = room.hockeyTables[m.i];
    if (m.k === "watch") {
      if (p.zone !== W.ZONE || !hockeyLimits.replay(room, p, 1)) return;
      if (s) hockey.tell(room, s, p);
      else room.send(p.ws, { t: "hockey", k: "table", i: m.i, ids: [], phase: "closed", now });
      return;
    }
    if (!W.eligible(p)) return;
    if (m.k === "join") {
      if (!W.near(p, m.i)) return;
      for (const other of room.hockeyTables) if (other && other.ids.includes(p.id)) { if (hockeyLimits.replay(room, p, 1)) hockey.tell(room, other, p); return; }
      if (s && (s.phase !== "lobby" || s.ids[1])) { room.send(p.ws, { t: "hockey", k: "busy", i: m.i }); return; }
      let sid = s?.s;
      if (!sid) { const bytes = new Uint8Array(8); crypto.getRandomValues(bytes); sid = Array.from(bytes, n => n.toString(16).padStart(2, "0")).join(""); }
      const ids = s ? [s.ids[0], p.id] : [p.id, 0];
      const proof = { s: sid, ids, tokens: ids.map(id => id ? room.players.get(id).connectionToken : null), v: 2 };
      if (!hockeyLimits.admit(room, p, m.i, !s, proof)) return;
      if (!s) {
        s = { wire: 4, e: m.e, created: now, i: m.i, s: sid, ids: [p.id, 0], ready: [false, false], seen: [now, now], phase: "lobby", q: -1, inputQ: -1, a: null };
        room.hockeyTables[m.i] = s;
      } else if (s.phase === "lobby" && !s.ids[1]) { s.ids[1] = p.id; s.seen[1] = now; s.ready = [false, false]; }
      else { room.send(p.ws, { t: "hockey", k: "busy", i: m.i }); return; }
      hockey.save(room, s); hockey.tell(room, s); return;
    }
    const side = s ? s.ids.indexOf(p.id) : -1;
    if (!s || m.s !== s.s || side < 0 || !W.near(p, m.i)) return;
    s.seen[side] = now;
    if (m.k === "ready" && s.phase === "lobby") {
      if (s.ready[side]) { hockey.save(room, s); return; }
      s.ready[side] = true;
      if (s.ready[0] && (!s.ids[1] || s.ready[1])) { s.phase = "play"; s.start = now; }
      hockey.save(room, s); hockey.tell(room, s); return;
    }
    if (m.k === "frame" && side === 0 && s.phase === "play" && m.q > s.q) {
      // Untimed, first to seven, one point per goal. The host remains a physics trust boundary.
      const before = s.a, goals = before ? before[8] + before[9] : 0;
      if (m.a[10] !== -1 || m.a[16] !== (Math.max(m.a[8], m.a[9]) < 7 ? 1 : 0) || m.a[8] + m.a[9] > goals + 1 || before && (m.a[8] < before[8] || m.a[9] < before[9]) || !before && !m.a[16]) return;
      s.q = m.q; s.a = m.a;
      if (!m.a[16]) { s.phase = "done"; s.doneAt = now; }
      hockey.save(room, s);
      room.broadcastZone(W.ZONE, { t: "hockey", k: "frame", i: s.i, s: s.s, q: s.q, a: s.a, now });
      if (s.phase === "done") hockey.tell(room, s);
      return;
    }
    if (m.k === "input" && side === 1 && s.phase === "play" && m.q > s.inputQ) {
      s.inputQ = m.q;
      const input = { t: "hockey", k: "input", i: s.i, s: s.s, q: m.q, x: m.x, y: m.y, v: 4 };
      if (m.p) { input.p = m.p; input.d = m.d; }
      room.send(room.players.get(s.ids[0]).ws, input);
    }
    hockey.save(room, s);
  }
};
