// Ooga Chat's audience roster (#653, audience protocol 1 in docs/ooga-chat-app.md): one zone's participants as the
// server reports them, kept from a snapshot and the deltas after it, and put in the order the space shows. A
// participant is keyed by its opaque `id` (the server's principal, never a login) and its source `generation`; the
// server owns membership, roles and contribution totals, and nothing here grants a role. A delta must follow the
// revision before it in the same epoch: an older one is stale and dropped, a later one or one from a newer epoch is a
// gap, and the caller asks for a fresh snapshot. A delta is checked whole before any of it applies.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { pathOk, clean, ZONES } = BL.oogaChatConfig;
  const SOURCES = ["world", "app"], ROLES = ["speaker", "listener"];
  const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
  // One participant, or null when anything in it is out of the contract.
  const parseParticipant = (raw) => {
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !/^[\w:.-]{1,128}$/.test(raw.id)) return null;
    if (!SOURCES.includes(raw.source) || !ROLES.includes(raw.role) || count(raw.generation) === null) return null;
    if (typeof raw.login !== "string" || !/^[\w.-]{1,39}$/.test(raw.login)) return null;
    return { id: raw.id, generation: raw.generation, source: raw.source, role: raw.role, login: raw.login, display: clean(raw.display, 50) || raw.login,
      face: pathOk(raw.face) ? raw.face : null, contributions: raw.source === "world" ? count(raw.contributions) : null, muted: raw.muted === true };
  };
  const nameKey = (p) => p.login.toLowerCase();
  const byName = (a, b) => nameKey(a) < nameKey(b) ? -1 : nameKey(a) > nameKey(b) ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  // World speakers by contribution total, most first; a missing total after every known one (it is not a verified
  // zero); ties alphabetical, case-insensitive, then by id.
  const byTotal = (a, b) => {
    if (a.contributions !== b.contributions) {
      if (a.contributions === null) return 1;
      if (b.contributions === null) return -1;
      return b.contributions - a.contributions;
    }
    return byName(a, b);
  };
  // The space's one continuous order: world speakers, then app speakers (the visitor first among them, the rest
  // alphabetical), then listeners (the visitor first, the rest alphabetical). The visitor never moves ahead of a world
  // speaker. Totals sort; they grant nothing.
  const order = (participants, self) => {
    const world = [], app = [], listeners = [];
    for (const p of participants) (p.role === "listener" ? listeners : p.source === "world" ? world : app).push(p);
    const selfFirst = (sort) => (a, b) => a.id === self ? -1 : b.id === self ? 1 : sort(a, b);
    world.sort(byTotal);
    app.sort(selfFirst(byName));
    listeners.sort(selfFirst(byName));
    return world.concat(app, listeners);
  };
  const create = () => {
    let zone = null, epoch = -1, revision = -1, people = new Map();
    // A list of participants with each id once: the newer generation wins, else the first seen.
    const keyed = (list) => {
      const out = new Map();
      for (const raw of list) {
        const p = parseParticipant(raw);
        if (!p) return null;
        const had = out.get(p.id);
        if (!had || p.generation > had.generation) out.set(p.id, p);
      }
      return out;
    };
    // The zone the page asked for; anything for another zone is ignored, and the list starts again empty.
    const expect = (next) => {
      zone = ZONES.includes(next) ? next : null;
      epoch = revision = -1;
      people = new Map();
    };
    const apply = (msg) => {
      if (!msg || msg.zone !== zone || !zone || !Number.isSafeInteger(msg.epoch) || !Number.isSafeInteger(msg.revision)) return "ignored";
      if (msg.type === "snapshot") {
        if (msg.epoch < epoch || msg.epoch === epoch && msg.revision <= revision) return "stale";
        const next = Array.isArray(msg.participants) && msg.participants.length <= 5000 ? keyed(msg.participants) : null;
        if (!next) return "gap";
        people = next;
        epoch = msg.epoch;
        revision = msg.revision;
        return "applied";
      }
      if (msg.type !== "delta") return "ignored";
      if (epoch < 0 || msg.epoch > epoch) return "gap";
      if (msg.epoch < epoch || msg.revision <= revision) return "stale";
      if (msg.revision !== revision + 1) return "gap";
      const upsert = keyed(Array.isArray(msg.upsert) ? msg.upsert : []);
      const remove = Array.isArray(msg.remove) ? msg.remove : [];
      if (!upsert || !remove.every((r) => r && typeof r.id === "string" && count(r.generation) !== null)) return "gap";
      for (const r of remove) {
        const had = people.get(r.id);
        if (had && had.generation <= r.generation) people.delete(r.id);
      }
      for (const p of upsert.values()) {
        const had = people.get(p.id);
        if (!had || p.generation >= had.generation) people.set(p.id, p);
      }
      revision = msg.revision;
      return "applied";
    };
    return { expect, apply, list: (self) => order(people.values(), self), get: (id) => people.get(id) || null,
      get zone() { return zone; }, get epoch() { return epoch; }, get revision() { return revision; }, get size() { return people.size; }, get ready() { return epoch >= 0; } };
  };
  BL.oogaChatRoster = { create, order, parseParticipant, SOURCES, ROLES };
})();
