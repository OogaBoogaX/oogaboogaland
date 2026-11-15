// Block Frenzy's match registry: one match a room, its registrations, ready marks, seats and host. The elected host's
// page runs the rules; this file checks who may say what and relays. No storage: the match rides its keeper's socket
// attachment through hibernation, rate buckets stay in memory (a socket with traffic never hibernates).
import "../../src/js/block-wire.js";
const W = globalThis.BL.blockWire;
const CONTROL_HZ = 6, CONTROL_BURST = 12, INPUT_BURST = W.INPUT_HZ + 4, FRAME_BURST = W.FRAME_HZ + 2;
const take = (p, key, rate, burst, now) => {
  const buckets = p.blockBuckets ||= {}, b = buckets[key] ||= { at: now, tokens: burst };
  b.tokens = Math.min(burst, b.tokens + Math.max(0, now - b.at) * rate / 1000); b.at = now;
  if (b.tokens < 1) return false;
  b.tokens--;
  return true;
};
const sessionId = () => { const bytes = new Uint8Array(8); crypto.getRandomValues(bytes); return Array.from(bytes, n => n.toString(16).padStart(2, "0")).join(""); };
const random = () => { const v = new Uint32Array(1); crypto.getRandomValues(v); return v[0] / 0x100000000; };
const fresh = () => ({ wire: W.WIRE, s: sessionId(), phase: "lobby", size: 2, map: 0, next: -1, reg: [], ready: [], seats: [], host: 0, epoch: 0, seed: 0, q: -1, tag: 0, start: 0, win: -1, rev: 0, keeper: 0 });
// The round's tag in every binary frame, so a frame from an earlier round or host can't be taken for this one.
const tagOf = s => parseInt(s.slice(0, 8), 16) >>> 0;
export const block = {
  restore(room) {
    room.blockMatch = null; room.blockSeen = new Map();
    let best = null;
    for (const p of room.players.values()) if (p.block && p.block.wire === W.WIRE && (!best || p.block.rev > best.rev)) best = p.block;
    if (!best) return;
    const now = Date.now(), here = id => W.eligible(room.players.get(id));
    best.seats = best.seats.map(id => here(id) ? id : 0);
    const kept = best.reg.map((id, i) => here(id) ? i : -1).filter(i => i >= 0);
    best.ready = kept.map(i => best.ready[i]); best.reg = kept.map(i => best.reg[i]);
    room.blockMatch = best;
    for (const id of [...best.reg, ...best.seats]) if (id) room.blockSeen.set(id, now);
    if (best.phase === "countdown" && !here(best.host)) block.unseat(best);
    if (best.phase !== "lobby" && !best.seats.some(Boolean)) block.finish(room, best, -1);
    else if (best.phase === "play" && !here(best.host)) block.elect(room, best);
    block.save(room, best);
  },
  // One attachment holds the match: the host's, or the first registered while none hosts.
  save(room, m) {
    m.rev++;
    const id = m.host || m.reg[0] || 0, was = m.keeper && m.keeper !== id ? room.players.get(m.keeper) : null;
    if (was) { was.block = null; was.ws.serializeAttachment(room.attachment(was)); }
    m.keeper = id;
    const p = room.players.get(id);
    if (p) { p.block = m; p.ws.serializeAttachment(room.attachment(p)); }
  },
  view(m) {
    return { t: "bf", k: "match", s: m.s, phase: m.phase, size: m.size, map: m.map, reg: m.reg, ready: m.ready, seats: m.seats, host: m.host, epoch: m.epoch, tag: m.tag, seed: m.seed, start: m.start, win: m.win, now: Date.now() };
  },
  tell(room, m, to = null) {
    if (m) block.save(room, m);
    const msg = m ? block.view(m) : { t: "bf", k: "match", phase: "empty", now: Date.now() };
    if (to) room.send(to.ws, msg); else room.broadcastZone(W.ZONE, msg);
  },
  close(room, m) {
    const k = room.players.get(m.keeper);
    if (k) { k.block = null; k.ws.serializeAttachment(room.attachment(k)); }
    room.blockMatch = null;
    room.broadcastZone(W.ZONE, { t: "bf", k: "match", phase: "empty", now: Date.now() });
  },
  // Host handover: the seated page that has been in the room longest, a page on show first (Ghost Hunter's rule).
  elect(room, m) {
    let best = null, fallback = null;
    for (const id of m.seats) {
      const p = id ? room.players.get(id) : null;
      if (!p) continue;
      if (!fallback || p.joinedAt < fallback.joinedAt) fallback = p;
      if (p.visible && (!best || p.joinedAt < best.joinedAt)) best = p;
    }
    const was = m.host;
    m.host = (best || fallback)?.id || 0;
    if (m.host !== was) { m.epoch++; m.q = -1; }
    return m.host;
  },
  // Waiters from the deck first, so a full table can't lock them out forever, then those who just played.
  finish(room, m, win) {
    const reg = m.reg.slice(0, W.MAX_PLAYERS);
    // Someone waited through this round and picked a map: the next one plays it.
    if (m.reg.length && m.next >= 0) m.map = m.next;
    m.next = -1;
    for (const id of m.seats) if (id && !reg.includes(id) && reg.length < W.MAX_PLAYERS) reg.push(id);
    m.phase = "lobby"; m.reg = reg; m.ready = reg.map(() => 0); m.seats = []; m.host = 0; m.win = win; m.start = 0;
    if (!reg.length) { block.close(room, m); return null; }
    return m;
  },
  begin(room, m, now) {
    m.size = W.sizeFor(m.size, m.reg.length);
    m.seats = W.split(m.reg, m.size, random);
    m.s = sessionId(); m.tag = tagOf(m.s); m.seed = (Math.floor(random() * 0x7ffffffe) + 1);
    m.host = 0; block.elect(room, m); m.win = -1;
    if (m.reg.length === 1) block.play(m);
    else { m.phase = "countdown"; m.start = now + W.COUNTDOWN_MS; }
  },
  play(m) { m.phase = "play"; m.start = 0; m.reg = []; m.ready = []; m.q = -1; },
  unseat(m) { m.phase = "lobby"; m.seats = []; m.host = 0; m.start = 0; },
  leave(room, id) {
    const m = room.blockMatch;
    if (!m) return;
    room.blockSeen.delete(id);
    const i = m.reg.indexOf(id), seat = W.seatOf(m, id);
    if (i < 0 && seat < 0) return;
    if (i >= 0) { m.reg.splice(i, 1); m.ready.splice(i, 1); }
    // A first waiter's map leaves with them.
    if (i === 0) m.next = -1;
    if (m.phase === "countdown") block.unseat(m);
    else if (seat >= 0 && m.phase === "play") {
      m.seats[seat] = 0;
      if (!m.seats.some(Boolean)) { if (!block.finish(room, m, -1)) return; }
      else if (m.host === id) block.elect(room, m);
    }
    if (m.phase === "lobby" && !m.reg.length) { block.close(room, m); return; }
    // Back to one person: their "ready" was for a group, so the choice to start alone or wait comes back.
    if (m.phase === "lobby" && m.reg.length === 1) m.ready[0] = 0;
    // Whoever left may have been the only one not ready.
    if (m.phase === "lobby" && W.canStart(m)) block.begin(room, m, Date.now());
    block.tell(room, m);
  },
  sweep(room) {
    const m = room.blockMatch;
    if (!m) return;
    const now = Date.now();
    for (const id of [...m.reg, ...m.seats]) if (id && (!W.eligible(room.players.get(id)) || now - (room.blockSeen.get(id) || 0) > W.IDLE_MS)) block.leave(room, id);
    // A countdown ends by the room's own clock, so nobody's page clock can hold a round back.
    const still = room.blockMatch;
    if (still && still.phase === "countdown" && now >= still.start) { block.play(still); block.tell(room, still); }
  },
  // A host whose page went hidden stops stepping the game: hand over at once if another seated page is on show.
  visibility(room, p) {
    const m = room.blockMatch;
    if (!m || m.phase !== "play" || m.host !== p.id || p.visible) return;
    if (!m.seats.some(id => id && id !== p.id && room.players.get(id)?.visible)) return;
    block.elect(room, m);
    block.tell(room, m);
  },
  arrive(room, p) {
    if (p.zone === W.ZONE) block.tell(room, room.blockMatch, p);
    else p.blockWatch = false;
  },
  message(room, p, msg) {
    const now = Date.now(), m0 = room.blockMatch;
    if (msg.k === "input") {
      if (!take(p, "input", W.INPUT_HZ, INPUT_BURST, now) || !m0 || m0.phase !== "play" || msg.s !== m0.s) return;
      const seat = W.seatOf(m0, p.id), host = room.players.get(m0.host);
      if (seat < 0 || !host || p.id === m0.host) return;
      room.blockSeen.set(p.id, now);
      const out = { t: "bf", k: "input", from: seat, s: msg.s, q: msg.q, x: msg.x, z: msg.z, f: msg.f, b: msg.b };
      if (msg.a) out.a = msg.a;
      room.send(host.ws, out);
      return;
    }
    if (!take(p, "control", CONTROL_HZ, CONTROL_BURST, now) || p.zone !== W.ZONE) return;
    if (msg.k === "hello") { block.tell(room, m0, p); return; }
    // Viewers ask for frames; anyone else in the area receives none. No body needed, nothing about them is kept but this.
    if (msg.k === "watch") {
      if (msg.on === 1 && !p.blockWatch) {
        let viewers = 0;
        for (const other of room.players.values()) if (other.blockWatch && other.zone === W.ZONE) viewers++;
        if (viewers >= W.MAX_VIEWERS) { room.send(p.ws, { t: "bf", k: "chairs-full" }); return; }
      }
      p.blockWatch = msg.on === 1;
      return;
    }
    if (!W.eligible(p)) return;
    // A host in play proves itself by its frames, so a page that only beats can't hold a round.
    if (m0 && (W.seatOf(m0, p.id) >= 0 || m0.reg.includes(p.id)) && !(m0.phase === "play" && m0.host === p.id)) room.blockSeen.set(p.id, now);
    block.sweep(room);
    let m = room.blockMatch;
    if (msg.k === "beat") return;
    if (msg.k === "reg") {
      if (!W.canRegister(m, p.id)) return;
      if (!m) m = room.blockMatch = fresh();
      // The first to register brings the map on their board; while a round runs it waits for the next one.
      if (!m.reg.length && msg.m !== undefined) { if (m.phase === "play") m.next = msg.m; else m.map = msg.m; }
      m.reg.push(p.id); m.ready.push(0);
      room.blockSeen.set(p.id, now);
      if (m.phase === "countdown") block.unseat(m);
      block.tell(room, m);
      return;
    }
    if (!m) return;
    if (msg.k === "unreg") { block.leave(room, p.id); return; }
    if (msg.k === "opt") {
      if (m.reg[0] !== p.id || m.phase === "countdown") return;
      // A round under way keeps its map and size: the first waiter's pick is for the next one.
      if (m.phase === "play") m.next = msg.m;
      else { m.size = msg.n; m.map = msg.m; }
      block.tell(room, m);
      return;
    }
    if (msg.k === "alone") {
      if (!W.canStartAlone(m, p.id)) return;
      block.begin(room, m, now);
      block.tell(room, m);
      return;
    }
    if (msg.k === "ready") {
      if (m.phase === "play") return;
      const i = m.reg.indexOf(p.id);
      if (i < 0 || m.ready[i] === msg.r) return;
      m.ready[i] = msg.r;
      if (m.phase === "countdown" && !msg.r) block.unseat(m);
      if (m.phase === "lobby" && W.canStart(m)) block.begin(room, m, now);
      block.tell(room, m);
      return;
    }
    if (msg.s !== m.s) return;
    if (msg.k === "go") {
      if (m.phase !== "countdown" || now < m.start - 300 || W.seatOf(m, p.id) < 0) return;
      block.play(m);
      block.tell(room, m);
      return;
    }
    if (msg.k === "over") {
      if (m.phase !== "play" || m.host !== p.id) return;
      if (block.finish(room, m, msg.w)) block.tell(room, m);
    }
  },
  // A binary snapshot, from the round's host only, to the seated and to viewers who asked for it.
  frame(room, p, data) {
    const m = room.blockMatch;
    if (!m || m.phase !== "play" || p.id !== m.host || p.zone !== W.ZONE || data.byteLength < W.FRAME_HEADER || data.byteLength > W.FRAME_MAX) return;
    if (!take(p, "frame", W.FRAME_HZ, FRAME_BURST, Date.now())) return;
    const view = new DataView(data), q = view.getUint32(12, true);
    if (view.getUint32(4, true) !== m.tag || view.getUint32(8, true) !== m.epoch || q <= m.q) return;
    m.q = q;
    room.blockSeen.set(p.id, Date.now());
    // Seated players take every frame; a viewer every other one (viewers cost the room half a player's frames, and nothing else).
    for (const other of room.players.values()) if (other !== p && other.zone === W.ZONE && (W.seatOf(m, other.id) >= 0 || (other.blockWatch && q % 2 === 0))) room.send(other.ws, data);
  }
};
