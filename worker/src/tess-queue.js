// One opt-in guide on the island. Only queue leases are durable; questions, answers and camera poses
// never enter this protocol. The active visitor supplies a bounded visual pose, like the NPC host.
const FEATURE = "tess-guide-v1", KEY = "tessQueue", CAP = 32;
const READY = 20000, GRACE = 15000, IDLE = 60000, TURN = 300000;
const state = room => room.tessQueue || (room.tessQueue = { entries: [], pose: null });
const eligible = p => p && p.inHub && p.visible !== false && p.zone === "outside";
// Present visitors keep their FIFO place; only absence and the ready/active turn have deadlines.
const expires = e => e.phase === "wait" ? e.away || Infinity : Math.min(e.until, e.end, e.away || Infinity);
const parse = m => {
  if (!["watch", "join", "cancel", "accept", "touch", "pose"].includes(m.op)) return null;
  const out = { t: "tess-guide", op: m.op };
  if (m.op === "watch" || m.op === "join") return out;
  if (typeof m.token !== "string" || m.token.length > 64 || !m.token.length) return null;
  out.token = m.token;
  if (m.op === "pose") {
    const a = m.a;
    if (!Array.isArray(a) || a.length !== 12 || !a.every(v => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 512)
      || !Number.isInteger(a[3]) || a[3] < 0 || a[3] > 2 || ![0, 1].includes(a[10]) || ![0, 1].includes(a[11])) return null;
    out.a = a;
  }
  return out;
};
const view = (room, p) => {
  const s = state(room), i = s.entries.findIndex(e => e.id === p.id), e = s.entries[i];
  return { t: "tess-guide", op: "state", count: s.entries.length, busy: s.entries[0]?.phase === "active",
    position: i < 0 ? 0 : i + 1, phase: e?.phase || "none", token: e?.token || "",
    until: e && Number.isFinite(expires(e)) ? expires(e) : 0, pose: s.pose };
};
const tell = (room, p = null) => {
  if (p) room.send(p.ws, view(room, p));
  else for (const peer of room.players.values()) if (eligible(peer)) room.send(peer.ws, view(room, peer));
};
const deadline = room => {
  let at = Infinity;
  for (const e of room.tessQueue?.entries || []) at = Math.min(at, expires(e));
  return at;
};
const save = room => {
  if (!room.ctx?.storage) return;
  // Snapshot at the mutation, ordered behind previous writes; an old save must never resurrect a cancelled turn.
  const entries = state(room).entries.map(e => ({ ...e }));
  room.tessSaving = (room.tessSaving || Promise.resolve()).catch(() => {}).then(() => room.ctx.storage.put(KEY, entries));
  room.background(room.tessSaving);
  if (Number.isFinite(deadline(room))) room.background(room.scheduleAlarm());
};
const advance = (room, now) => {
  const s = state(room), first = s.entries[0];
  let changed = false;
  for (let i = s.entries.length - 1; i >= 0; i--) {
    const e = s.entries[i];
    if (expires(e) <= now) { s.entries.splice(i, 1); changed = true; }
  }
  if (s.entries[0] !== first) s.pose = null;
  const e = s.entries[0];
  if (e && e.phase === "wait" && !e.away && eligible(room.players.get(e.id))) {
    e.phase = "ready"; e.end = e.until = now + READY; changed = true;
  }
  return changed;
};
const sweep = (room, now = Date.now()) => { if (advance(room, now)) { save(room); tell(room); } };
const presence = (room, p, gone = false, revoked = false) => {
  const s = state(room), now = Date.now(), e = s.entries.find(e => e.id === p.id);
  let changed = advance(room, now);
  if (e && s.entries.includes(e)) {
    if (revoked) { s.entries.splice(s.entries.indexOf(e), 1); s.pose = null; changed = true; }
    else if (gone || !eligible(p)) { if (!e.away) { e.away = now + GRACE; changed = true; } }
    else if (e.away) { e.away = 0; changed = true; }
  }
  changed = advance(room, now) || changed;
  if (changed) { save(room); tell(room); }
  else if (!gone && eligible(p)) tell(room, p);
};
const restore = async room => {
  const stored = await room.ctx.storage.get(KEY), s = state(room), now = Date.now(), ids = new Set();
  s.entries = (Array.isArray(stored) ? stored : []).filter(e => {
    if (!e || !Number.isSafeInteger(e.id) || e.id <= 0 || ids.has(e.id) || typeof e.token !== "string" || !e.token.length || e.token.length > 64
      || !["wait", "ready", "active"].includes(e.phase) || ![e.until, e.end, e.away].every(Number.isFinite)) return false;
    ids.add(e.id); return true;
  }).slice(0, CAP);
  // A deployment can drop every socket. Hold each place briefly for its account to reconnect.
  for (let i = 0; i < s.entries.length; i++) {
    const e = s.entries[i];
    if (i && e.phase !== "wait") { e.phase = "wait"; e.until = e.end = 0; }
    if (!eligible(room.players.get(e.id))) e.away = Math.min(e.away || now + GRACE, now + GRACE);
  }
  advance(room, now);
  if (stored !== undefined || s.entries.length) save(room);
  tell(room);
};
const message = (room, p, m) => {
  const s = state(room), now = Date.now();
  sweep(room, now);
  if (!eligible(p) && m.op !== "cancel") return;
  if (m.op === "pose") {
    const e = s.entries[0];
    if (!e || e.id !== p.id || e.token !== m.token || e.phase !== "active" || e.away || now - (p.tessPoseAt || 0) < 240) return;
    p.tessPoseAt = now; s.pose = m.a;
    for (const peer of room.players.values()) if (peer !== p && eligible(peer)) room.send(peer.ws, { t: "tess-guide", op: "pose", a: m.a });
    return;
  }
  // Separate from pose traffic: at most four queue actions per second per connection.
  const second = Math.floor(now / 1000);
  if (p.tessSecond !== second) { p.tessSecond = second; p.tessActions = 0; }
  if (++p.tessActions > 4) return;
  if (m.op === "watch") { tell(room, p); return; }
  let e = s.entries.find(e => e.id === p.id), changed = false;
  if (m.op === "join") {
    if (!e && s.entries.length < CAP) {
      e = { id: p.id, token: crypto.randomUUID(), phase: "wait", until: 0, end: 0, away: 0 };
      s.entries.push(e); changed = true;
    }
  } else if (e && e.token === m.token) {
    if (m.op === "cancel") {
      if (s.entries[0] === e) s.pose = null;
      s.entries.splice(s.entries.indexOf(e), 1); changed = true;
    } else if (s.entries[0] === e && !e.away) {
      if (m.op === "accept" && e.phase === "ready") {
        e.phase = "active"; e.end = now + TURN; e.until = now + IDLE; changed = true;
      } else if (m.op === "touch" && e.phase === "active" && e.until - now < IDLE - 10000) {
        e.until = Math.min(now + IDLE, e.end); changed = true;
      }
    }
  }
  changed = advance(room, now) || changed;
  if (changed) { save(room); tell(room); } else tell(room, p);
};
export const tessQueue = { FEATURE, parse, restore, message, presence, sweep, deadline };
