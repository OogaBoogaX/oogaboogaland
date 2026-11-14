// The Inspector's rules (inspector.js), pure so the tests run them in Node: what a report may hold, how a report
// becomes an object's row and log lines, and when rows go stale or are dropped.

export const CLASSES = ["Room", "GameHost", "Worker"];
export const KINDS = ["wake-lost", "join", "full", "leave", "zone", "visible", "host", "back", "kick",
  "voice-fail", "voice-refused", "voice-restart", "limited", "dropped"];
// Statuses that mean someone is there: a row that says so and then goes quiet this long is marked stale. The room
// sweeps once a minute while anyone is in it, so five minutes without a word means it stopped answering.
export const BUSY = new Set(["live", "running", "open"]);
export const STALE_MS = 5 * 60000;
// The log and every row are kept a day at most; the log keeps its last LOG_KEEP lines.
export const KEEP_MS = 24 * 3600000;
export const LOG_KEEP = 500;
// How long a report's answer says someone is watching; viewers keep it extended while they stay.
export const WATCH_MS = 90000;
// Objects heard from this recently are asked for detail when a viewer connects.
export const RECENT_MS = 120000;
// The platform's limits the page sets load against (developers.cloudflare.com/durable-objects/platform/limits/).
export const LIMITS = { requestsPerSecond: 1000, hibernatableSockets: 32768, attachmentBytes: 16384, memoryMB: 128, cpuSeconds: 30, sfuCallsPerSecond: 50 };

const NAME = /^[A-Za-z0-9:._-]{1,64}$/;
const finite = Number.isFinite;
const str = (v, max) => typeof v === "string" ? v.slice(0, max) : "";

// A bounded copy of plain data: strings cut, numbers finite, arrays and objects capped, nothing deeper than `depth`.
export const cleanValue = (v, depth = 3) => {
  if (v === null || typeof v === "boolean") return v;
  if (typeof v === "number") return finite(v) ? v : null;
  if (typeof v === "string") return v.slice(0, 120);
  if (depth <= 0 || typeof v !== "object") return undefined;
  if (Array.isArray(v)) return v.slice(0, 64).map((x) => cleanValue(x, depth - 1)).filter((x) => x !== undefined);
  const out = {};
  let n = 0;
  for (const [k, x] of Object.entries(v)) {
    if (n >= 48 || k.length > 48) continue;
    const c = cleanValue(x, depth - 1);
    if (c !== undefined) { out[k] = c; n++; }
  }
  return out;
};

const numbers = (v) => {
  const out = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, x] of Object.entries(v).slice(0, 32)) if (k.length <= 32 && finite(x)) out[k] = x;
  return out;
};

const cleanEvent = (e) => {
  if (!e || typeof e !== "object" || !KINDS.includes(e.kind) || !finite(e.at)) return null;
  const id = Number.isSafeInteger(e.id) && e.id > 0 ? e.id : 0;
  return { at: e.at, kind: e.kind, id, login: str(e.login, 40), fields: e.fields ? cleanValue(e.fields, 1) : null };
};

export const keyOf = (r) => `${r.cls}:${r.name}`;

export const cleanReport = (raw) => {
  if (!raw || typeof raw !== "object" || !CLASSES.includes(raw.cls) || typeof raw.name !== "string" || !NAME.test(raw.name)) return null;
  const state = raw.state && typeof raw.state === "object" && !Array.isArray(raw.state) ? cleanValue(raw.state) : null;
  const wake = raw.wake && Number.isSafeInteger(raw.wake.sockets) && raw.wake.sockets >= 0 ? { sockets: raw.wake.sockets } : null;
  const events = Array.isArray(raw.events) ? raw.events.slice(0, 64).map(cleanEvent).filter(Boolean) : [];
  return { cls: raw.cls, name: raw.name, span: finite(raw.span) && raw.span > 0 ? raw.span : 0, version: str(raw.version, 64),
    wake, state, counters: numbers(raw.counters), peaks: numbers(raw.peaks), events,
    dropped: Number.isSafeInteger(raw.dropped) && raw.dropped > 0 ? raw.dropped : 0,
    failed: Number.isSafeInteger(raw.failed) && raw.failed > 0 ? raw.failed : 0 };
};

// A report into the object's row and the lines it adds to the log. Rates are per second over the time since the
// object's last report; a wake carries how many sockets came through it, which is how a reset is told from a nap.
export const absorb = (prev, r, now) => {
  const key = keyOf(r), events = [];
  const state = r.state || (prev ? prev.state : null);
  const rates = {};
  if (r.span >= 500) for (const [k, n] of Object.entries(r.counters)) rates[k] = n / (r.span / 1000);
  const row = {
    key, cls: r.cls, name: r.name,
    status: state && typeof state.status === "string" ? state.status : prev ? prev.status : "unknown",
    state, firstSeen: prev ? prev.firstSeen : now, lastSeen: now,
    wakes: (prev ? prev.wakes : 0) + (r.wake && prev ? 1 : 0),
    slept: r.wake && prev ? now - prev.lastSeen : prev ? prev.slept : 0,
    version: r.version || (prev ? prev.version : ""),
    rates: r.span >= 500 ? rates : prev ? prev.rates : {},
    peaks: r.span >= 500 || !prev ? r.peaks : { ...prev.peaks, ...r.peaks },
    failed: r.failed,
  };
  // A socket counted before the object slept and gone when it woke was closed while it slept, or the object was reset
  // (a deploy, a runtime update, an eviction), which closes every socket it held.
  const before = prev && prev.state && Number.isSafeInteger(prev.state.sockets) ? prev.state.sockets : 0;
  if (r.wake && before > r.wake.sockets) {
    events.push({ at: now, kind: "wake-lost", id: 0, login: "", fields: { lost: before - r.wake.sockets, kept: r.wake.sockets,
      deployed: !!(prev.version && r.version && prev.version !== r.version) } });
  }
  for (const e of r.events) events.push(e);
  if (r.dropped) events.push({ at: now, kind: "dropped", id: 0, login: "", fields: { lines: r.dropped } });
  return { row, events: events.map((e) => ({ ...e, key })) };
};

export const deadline = (row) => BUSY.has(row.status) ? row.lastSeen + STALE_MS : row.lastSeen + KEEP_MS;

// Rows past their deadline: a busy one is marked stale (its last status kept as `was`), any other dropped.
export const sweep = (rows, now) => {
  const stale = [], removed = [];
  for (const row of rows) {
    if (deadline(row) > now) continue;
    if (BUSY.has(row.status)) stale.push({ ...row, status: "stale", was: row.status });
    else removed.push(row.key);
  }
  return { stale, removed };
};

// Reports from different objects can arrive out of order. Expire every old line, not just a prefix.
export const expiredEvents = (events, now) => {
  const overflow = Math.max(0, events.length - LOG_KEEP);
  return events.filter((e, i) => i < overflow || e.at <= now - KEEP_MS);
};

export const nextAlarm = (rows, events, now) => {
  let next = Infinity;
  for (const row of rows) next = Math.min(next, deadline(row));
  for (const event of events) next = Math.min(next, event.at + KEEP_MS);
  return finite(next) ? Math.max(next, now) : null;
};
