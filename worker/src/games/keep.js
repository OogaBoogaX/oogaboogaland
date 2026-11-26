// The Byzantine Keep as the server holds it, hosted by game-host.js as kind "keep" at the venue "keep": one Durable
// Object of its own (`keep:keep:v1`), apart from the island's room, which nothing reaches until a page walks through
// the land's ₿IFRÖST window. It runs the page's own quest rules (src/js/keep-rules.js, imported unchanged), so every
// puzzle is checked here and a passage opens for everyone in the land at once.
//
// A page sends `act` (a puzzle's id and which of its parts it worked) and, once a minute while it stands in the land,
// `here`. Nothing here runs on a timer: the object wakes for a message and sleeps again. The rules' state is saved
// with each change and each `here` while anything has been touched, so the land keeps its open passages while anyone
// is in it and for game-host.js's `RESUME_MS` after the last has gone; then it is as it was first found. `here` also
// sends the state round again, which puts a page right after the object was restarted under it. The record names no
// account.
import "../../../src/js/keep-rules.js";

const RULES = globalThis.BL.keepRules;

/** A page's message as the land reads it: false for one that is not a message at all, null for one to ignore. */
const parse = (m) => {
  if (!m || typeof m !== "object" || Array.isArray(m) || typeof m.t !== "string") return false;
  if (m.t === "here") return { t: "here" };
  if (m.t === "act") return typeof m.id === "string" && RULES.has(m.id) && Number.isInteger(m.part) && m.part >= 0 && m.part < RULES.MAX_PARTS ? { t: "act", id: m.id, part: m.part } : null;
  return null;
};

const create = () => {
  const rules = RULES.create();
  return {
    join: () => {},
    leave: () => {},
    /** A page's message, read by `parse`; true when the state should go out and be saved now. */
    message: (p, m) => m.t === "act" ? rules.act(m.id, m.part) : !rules.pristine(),
    step: () => false,
    running: () => false,
    state: () => rules.snapshot(),
    motion: () => false,
    /** What a restart picks up, or null while nothing has been touched. */
    save: () => rules.pristine() ? null : JSON.stringify(rules.snapshot()),
    restore: (data) => {
      let snap = null;
      try { snap = JSON.parse(data); } catch { return false; }
      return rules.load(snap);
    },
    debug: { rules }
  };
};

export const keep = {
  id: "keep", code: 2, version: 1, venues: ["keep"], tickMs: 1000, stateEvery: 30,
  limits: { sockets: 40, chars: 128 },
  buckets: { act: { rate: 4, burst: 8 }, here: { rate: 0.1, burst: 2 } },
  bucketOf: (t) => t === "here" ? "here" : "act",
  parse, create
};
