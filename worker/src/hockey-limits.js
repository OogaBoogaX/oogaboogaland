// Only admission/replay debt is durable. No simulation frames, timers, or database migration.
// Default Durable Object output gates hold replies until put() succeeds; never allowUnconfirmed.
const KEY = "hockeyLimitsV1", KEEP_MS = 60000, MAX_ACCOUNTS = 64;
const bucket = (rate, burst) => ({ at: Date.now(), tokens: burst, rate, burst });
const available = (b, now) => Math.min(b.burst, b.tokens + Math.max(0, now - b.at) * b.rate / 1000);
const spend = (b, count, now) => { b.tokens = available(b, now) - count; b.at = now; };
export const hockeyLimits = {
  async load(room) {
    const saved = await room.ctx.storage.get(KEY);
    room.hockeyLimits = saved || { admission: bucket(2, 2), replay: bucket(8, 8), nextCreate: [0, 0, 0], proofs: [null, null, null], accounts: [] };
    room.hockeyLimits.proofs ||= [null, null, null];
    room.hockeyLimitsFailed = false;
  },
  account(room, id, now) {
    const l = room.hockeyLimits;
    if (!l || room.hockeyLimitsFailed) return null;
    // Expired entries have fully repaid both cooldown and replay debt. Never evict live debt for capacity.
    l.accounts = l.accounts.filter(a => a.until > now);
    let a = l.accounts.find(a => a.id === id);
    if (!a && l.accounts.length < MAX_ACCOUNTS) { a = { id, until: now + KEEP_MS, nextSeat: 0, replay: bucket(1, 3) }; l.accounts.push(a); }
    return a || null;
  },
  persist(room) {
    try {
      // Snapshot before returning to the event loop; no async admission queue or admission/cancel race.
      const write = room.ctx.storage.put(KEY, structuredClone(room.hockeyLimits));
      room.background(write.catch(() => { room.hockeyLimitsFailed = true; }));
      return true;
    } catch { room.hockeyLimitsFailed = true; return false; }
  },
  admit(room, p, slot, creating, proof) {
    const now = Date.now(), l = room.hockeyLimits;
    if (!l || room.hockeyLimitsFailed || creating && now < l.nextCreate[slot] || available(l.admission, now) < 1) return false;
    const a = hockeyLimits.account(room, p.id, now);
    if (!a || now < a.nextSeat) return false;
    spend(l.admission, 1, now); a.nextSeat = now + 2000; a.until = now + KEEP_MS;
    if (creating) l.nextCreate[slot] = now + 5000;
    l.proofs[slot] = proof;
    return hockeyLimits.persist(room);
  },
  replay(room, p, count) {
    if (!count) return false;
    const now = Date.now(), l = room.hockeyLimits;
    if (!l || room.hockeyLimitsFailed || available(l.replay, now) < count) return false;
    const a = hockeyLimits.account(room, p.id, now);
    if (!a || available(a.replay, now) < count) return false;
    spend(a.replay, count, now); spend(l.replay, count, now); a.until = now + KEEP_MS;
    return hockeyLimits.persist(room);
  }
};
