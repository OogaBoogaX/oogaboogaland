// Ooga Chat's audience on the island (#660): who speaks and who listens in each outdoor zone, Main Island and DSB
// Land, as the room's audience protocol reports it (docs/ooga-chat-app.md, The audience contract). Pure and loadable
// in Node: cloud-panel.js draws it, the suite checks it. The server owns every identity, role, source, character,
// picture and capability; this file only validates, orders and keeps them.
// One model a page (`create`): the view the visitor asked for (`desired`) is kept apart from the zone the room last
// confirmed (`zone`, its rows and their revision). A snapshot replaces the rows once all its parts have come; a delta
// applies only on the revision it was made from, and a gap asks the room for a fresh snapshot (`audience-resync`), shown
// stale until it comes. A snapshot or delta from an older epoch is dropped, so a reconnect's leftovers can never put
// anyone, the visitor included, in a roster twice. Rows are keyed by the server's id, so one id is one row.
// Order (`compare`): world speakers by contributions, most first; then Ooga Chat speakers, the visitor first; then
// listeners, the visitor first; names alphabetical inside each, the server's id breaking ties. Mic, speaking and hand
// changes never move a row, so the list is sorted again only when membership or a sort field changes.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const VERSION = 1, FEATURE = "audience-v1", ZONES = ["main", "dsb"], ZONE_NAMES = { main: "Main Island", dsb: "DSB Land" };
  const PAGE = 50, ID_MAX = 64, NAME_MAX = 39, PATH_MAX = 256, PARTS_MAX = 64;
  const SPEAK = ["eligible", "pending", "denied", "active", "none"];
  const isZone = (z) => ZONES.includes(z);
  const text = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v) ? v : null;
  // A picture must be a path on the page's own origin: the backend proxies profile pictures (img-src stays 'self').
  const samePath = (v) => typeof v === "string" && v.length <= PATH_MAX && /^\/(?![/\\])[^\s\\]*$/.test(v) && !v.split(/[/?#]/).includes("..") ? v : null;
  const emoji = (v) => {
    if (typeof v !== "string" || !v || v.length > 16) return "";
    const P = BL.reactionPolicy;
    return !P || P.valid(v) || P.HANDS.includes(v) ? v : "";
  };
  // One row from the wire, or null: an invalid row is dropped, never guessed at.
  const parseRow = (raw) => {
    if (!raw || typeof raw !== "object") return null;
    const id = text(raw.id, ID_MAX), login = text(raw.login, NAME_MAX);
    if (!id || !login || login.startsWith("@")) return null;
    if (raw.provider !== "github" && raw.provider !== "x") return null;
    if (raw.role !== "speaker" && raw.role !== "listener") return null;
    const speaker = raw.role === "speaker";
    if (speaker && raw.source !== "world" && raw.source !== "chat") return null;
    const display = text(raw.display, NAME_MAX) || login;
    const contributions = Number.isSafeInteger(raw.contributions) && raw.contributions >= 0 ? raw.contributions : 0;
    return {
      id, login, display, provider: raw.provider, role: raw.role,
      source: speaker ? raw.source : null,
      character: speaker && raw.source === "world" ? text(raw.character, NAME_MAX) : null,
      avatar: samePath(raw.avatar),
      contributions,
      self: raw.self === true,
      mic: speaker && (raw.mic === "on" || raw.mic === "muted") ? raw.mic : "off",
      speaking: speaker && raw.speaking === true,
      hand: speaker ? emoji(raw.hand) : "",
      name: display.toLowerCase()
    };
  };
  const rank = (r) => r.role === "speaker" ? r.source === "world" ? 0 : 1 : 2;
  const compare = (a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0 && a.contributions !== b.contributions) return b.contributions - a.contributions;
    if (ra !== 0 && a.self !== b.self) return a.self ? -1 : 1;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
  const sortKey = (r) => `${r.role}|${r.source}|${r.contributions}|${r.self}|${r.name}`;
  // The footer's controls, from the room's word on the visitor (`you.speak`) and this page's own voice session
  // (voice.js stats): a listener sees a disabled Unmute and Join Voice, enabled only when the room says eligible; a
  // speaker sees Mute or Unmute and Leave Voice. Pending or denied never enables Join Voice. `reason` is what this
  // browser lacks for voice, if anything.
  const footer = (you, voice, reason = "") => {
    const inVoice = !!(voice.enabled || voice.joining || voice.returning);
    if (inVoice) return {
      mute: { text: voice.muted || voice.returning ? "Unmute" : "Mute", disabled: !voice.publishing && !voice.returning, pressed: !!voice.muted },
      voice: { text: "Leave Voice", action: "leave", disabled: false }
    };
    return { mute: { text: "Unmute", disabled: true, pressed: false }, voice: { text: "Join Voice", action: "join", disabled: !you || you.speak !== "eligible" || !!reason } };
  };

  const create = ({ send = () => false } = {}) => {
    const rows = new Map();
    let order = [], epoch = -1, rev = -1, zone = null, desired = null, status = "off", you = null, version = 0;
    let parts = null, asked = false;
    const touch = () => { version++; };
    const resort = () => { order = [...rows.values()].sort(compare).map((r) => r.id); };
    const resync = () => {
      if (asked) return;
      asked = true;
      status = "stale";
      send("audience-resync", { zone: desired || zone, epoch, rev });
      touch();
    };
    const readYou = (raw) => raw && SPEAK.includes(raw.speak) ? { speak: raw.speak } : null;
    const swap = (msg, list) => {
      rows.clear();
      for (const raw of list) {
        const row = parseRow(raw);
        if (row) rows.set(row.id, row);
      }
      epoch = msg.epoch; rev = msg.rev; zone = msg.zone; you = readYou(msg.you);
      asked = false; parts = null;
      status = desired && zone !== desired ? "connecting" : "live";
      resort(); touch();
    };
    // `apply` takes one audience message from the room: "changed", "ignored" or "resync".
    const apply = (msg) => {
      if (!msg || msg.v !== VERSION || !isZone(msg.zone) || !Number.isSafeInteger(msg.epoch) || msg.epoch < 0) return "ignored";
      if (msg.epoch < epoch) return "ignored";
      if (msg.kind === "snapshot") {
        if (!Number.isSafeInteger(msg.rev) || msg.rev < 0 || !Array.isArray(msg.rows)) return "ignored";
        if (msg.epoch === epoch && msg.rev < rev) return "ignored";
        const count = msg.parts === undefined ? 1 : msg.parts, part = msg.part === undefined ? 0 : msg.part;
        if (!Number.isSafeInteger(count) || count < 1 || count > PARTS_MAX || !Number.isSafeInteger(part) || part < 0 || part >= count) return "ignored";
        if (count === 1) { swap(msg, msg.rows); return "changed"; }
        // A chunked snapshot shows only once whole, so the roster never mixes two revisions.
        if (!parts || parts.epoch !== msg.epoch || parts.rev !== msg.rev || parts.zone !== msg.zone || parts.list.length !== count)
          parts = { epoch: msg.epoch, rev: msg.rev, zone: msg.zone, list: new Array(count).fill(null), got: 0 };
        if (!parts.list[part]) { parts.list[part] = msg.rows; parts.got++; }
        if (parts.got < count) return "ignored";
        swap(msg, parts.list.flat());
        return "changed";
      }
      if (msg.kind === "delta") {
        if (msg.epoch !== epoch || msg.zone !== zone || !Number.isSafeInteger(msg.rev)) { resync(); return "resync"; }
        if (msg.rev <= rev) return "ignored";
        if (msg.base !== rev) { resync(); return "resync"; }
        let reorder = false;
        if (Array.isArray(msg.remove)) for (const id of msg.remove) if (rows.delete(id)) reorder = true;
        if (Array.isArray(msg.upsert)) for (const raw of msg.upsert) {
          const row = parseRow(raw);
          if (!row) continue;
          const old = rows.get(row.id);
          if (!old || sortKey(old) !== sortKey(row)) reorder = true;
          rows.set(row.id, row);
        }
        if (msg.you !== undefined) you = readYou(msg.you);
        rev = msg.rev;
        if (reorder) resort();
        touch();
        return "changed";
      }
      return "ignored";
    };
    // The visitor's choice of zone. Choosing the zone already asked for changes nothing and sends nothing.
    const setDesired = (next) => {
      if (!isZone(next) || next === desired) return false;
      desired = next;
      if (zone !== desired) { status = "connecting"; parts = null; }
      send("audience-view", { zone: desired });
      touch();
      return true;
    };
    // The room is live again (a welcome) or the visitor pressed Retry: ask for the desired view afresh.
    const ask = () => {
      if (!desired) return false;
      asked = false; parts = null;
      status = zone === desired && rev >= 0 ? status : "connecting";
      send("audience-view", { zone: desired });
      touch();
      return true;
    };
    // Signed out, or the room went away: forget every row and the epoch (a new socket may start a new one).
    const reset = (next = "off") => {
      rows.clear(); order = []; epoch = rev = -1; zone = null; you = null; parts = null; asked = false;
      if (next === "off") desired = null;
      status = next;
      touch();
    };
    const self = () => { for (const r of rows.values()) if (r.self) return r; return null; };
    return {
      apply, setDesired, ask, reset, self,
      // Only an active speaker raises or pins the hand.
      canHand: () => { const s = self(); return !!s && s.role === "speaker"; },
      page: (index, size = PAGE) => order.slice(index * size, index * size + size),
      pages: (size = PAGE) => Math.max(1, Math.ceil(order.length / size)),
      get rows() { return rows; },
      get order() { return order; },
      get zone() { return zone; },
      get desired() { return desired; },
      get status() { return status; },
      get epoch() { return epoch; },
      get rev() { return rev; },
      get you() { return you; },
      get version() { return version; }
    };
  };
  // The outdoor zone a reported island zone counts as, until #658's classifier supplies it: DSB Land's zones are
  // `dsb-*`, everything else is the main island. A private interior is not decided here.
  const zoneOfWorld = (name) => typeof name === "string" && name.startsWith("dsb-") ? "dsb" : "main";
  BL.audience = { VERSION, FEATURE, ZONES, ZONE_NAMES, PAGE, parseRow, compare, footer, create, zoneOfWorld };
})();
