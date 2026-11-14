// Ooga Chat's outdoor voice bridge (#661, epic #650): the client side of the handshake that lets the public audience of
// Main Island or DSB Land hear this page's existing voice while, and only while, its body stands outdoors there. It is
// outdoor-scope.js's transport: it says the room can carry the handshake (`setSupported`), asks the room to admit the
// scope's current epoch (`enter`), and turns the room's `open` into `acknowledge(epoch, scope)`, which alone makes the
// scope `public`. The wire contract is "Outdoor voice bridge" in docs/auth-and-presence.md; the room advertises it as
// net.js OUTDOOR_FEATURE, and without that every call here is a no-op and the page is never public.
// Privacy first: the instant the scope leaves (a cave's doorway, a descent, a scene change, a reconnect's `reset`), the
// bridge sends `leave` for every epoch it asked for and holds the microphone track off (voice.js `setOutdoor`) until the
// room confirms with `closed` that no public listener holds the publication any more, so no private word is captured
// into it. A dropped `closed` keeps it held (retried, then held until the next connection, whose welcome the room sends
// only after the old connection's grants are gone). A stale, unasked or replayed `open` never acknowledges anything.
// It never acquires a microphone, joins voice or unmutes: being outdoors makes an OBL player who already joined voice
// a public source, as they were, and the mic controls (M, the account's button, the roster's own row) stay voice.js's.
// Reactions from the public audience (`react`) are checked, deduplicated and handed to `subscribeReactions` for the
// audience panel (#660), which shows and expires them; this module draws nothing.
// `create(deps)` takes the scope record, a transport and voice, and is what the suite drives with fakes; `attach()`
// builds the page's one bridge on BL.outdoorScope, BL.net and BL.voice for the director. Allocation only per message.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const VERSION = 1;
  // A request or a revocation the room has not answered is sent again RETRY_MS later, at most RETRY_MAX times.
  const RETRY_MS = 3000, RETRY_MAX = 3;
  // Public speakers to play at full and reaction ids remembered against replays, each bounded.
  const SOURCES_MAX = 64, SEEN_MAX = 64, AUDIENCE_MAX = 100000;
  const RID = /^[\w-]{1,64}$/;
  const validId = (id) => Number.isSafeInteger(id) && id > 0;
  const count = (n) => Number.isSafeInteger(n) && n > 0 ? Math.min(n, AUDIENCE_MAX) : 0;
  const create = ({ scope, transport, voice, validEmoji, setTimeout: later = window.setTimeout.bind(window), clearTimeout: cancel = window.clearTimeout.bind(window) }) => {
    const S = scope.state;
    // Epochs are outdoor-scope.js's, page-wide and only rising: `asked` is the last one an `enter` went out for,
    // `left` the last one given up (a `leave` sent, or due), `closed` the last the room confirmed revoked (cumulative).
    // `quiet` is an epoch not to ask for: the room refused or revoked it, so only a new move asks again.
    let asked = -1, left = -1, closed = -1, quiet = -1, wasLive = false, audience = 0;
    let syncing = false, again = false, disposed = false, retryTimer = 0, tries = 0, retryKey = "";
    // What voice.js was last told, so it hears changes only.
    let toldHeld = false, toldAudience = 0, toldSources = -1, sourcesVersion = 0;
    const sources = new Set(), seen = new Set(), seenOrder = new Array(SEEN_MAX).fill(""), subscribers = new Set(), reactors = new Set();
    let seenAt = 0;
    const stats = { version: VERSION, status: "unavailable", reason: S.reason, scope: null, epoch: S.epoch, public: false, held: false, audience: 0, sources: 0, refused: "" };
    const emit = () => { for (const fn of subscribers) fn(stats); };
    const send = (msg) => transport.send({ v: VERSION, ...msg });
    const clearReactions = () => { for (const fn of reactors) fn(null); };
    const sendLeave = (epoch) => send({ op: "leave", epoch, reason: S.reason });
    const sendEnter = () => send({ op: "enter", epoch: asked, scope: S.scope });
    // Asked for this epoch and still wanting it: not given up, not answered with a grant yet.
    const requesting = () => asked > left && asked === S.epoch && !S.public;
    // Whatever is outstanding goes again a while later, a bounded number of times; nothing runs while idle.
    const retry = () => {
      const key = left > closed ? `l${left}` : requesting() ? `e${asked}` : "";
      if (key === retryKey && (retryTimer || tries >= RETRY_MAX)) return;
      if (key !== retryKey) { retryKey = key; tries = 0; }
      cancel(retryTimer);
      retryTimer = 0;
      if (!key || !transport.live() || tries >= RETRY_MAX) return;
      retryTimer = later(() => {
        retryTimer = 0;
        tries++;
        if (disposed || !transport.live()) return;
        if (left > closed) sendLeave(left);
        if (requesting()) sendEnter();
        retry();
      }, RETRY_MS);
    };
    const step = () => {
      const live = transport.live();
      // A new connection: the room sends its welcome only once the old connection's grants are gone (the contract), and
      // the scope moves on, so nothing answered on the old one reopens it.
      if (live && !wasLive) {
        closed = left = Math.max(left, asked, closed);
        if (S.epoch <= left) scope.reset();
      }
      if (!live && wasLive) { audience = 0; dropSources(); }
      wasLive = live;
      const ok = live && transport.available();
      scope.setSupported(ok);
      // Give up whatever was asked for and is no longer this epoch's scope, before asking for anything new. With the
      // socket gone the room retires its grants itself, so outdoors there is nothing to give up until the scope leaves.
      if (asked > left && (S.scope === null || live && (S.epoch !== asked || !ok))) {
        left = asked;
        if (live) sendLeave(left);
      }
      if (ok && S.scope !== null && S.epoch !== asked && S.epoch !== quiet) {
        asked = S.epoch;
        sendEnter();
      }
    };
    // Every input ends here: the scope's record, the room's state and its frames. Re-entrant calls (setSupported, reset
    // and acknowledge all tell the scope's subscribers, this among them) run again once the current one ends.
    const sync = () => {
      if (disposed) return;
      if (syncing) { again = true; return; }
      syncing = true;
      try {
        do { again = false; step(); } while (again);
      } finally { syncing = false; }
      const open = S.public && S.epoch === asked && asked > left, held = left > closed;
      if (!open) { audience = 0; dropSources(); }
      if (held !== toldHeld || audience !== toldAudience || sourcesVersion !== toldSources) {
        toldHeld = held; toldAudience = audience; toldSources = sourcesVersion;
        voice.setOutdoor(held, audience, sources);
      }
      retry();
      const status = held ? "closing" : !transport.available() ? "unavailable" : open ? "public" : S.scope === null ? "excluded"
        : S.epoch === quiet ? "refused" : "requesting";
      const wasPublic = stats.public;
      if (status === stats.status && S.epoch === stats.epoch && S.reason === stats.reason && held === stats.held && audience === stats.audience && sources.size === stats.sources) return;
      stats.status = status; stats.reason = S.reason; stats.scope = S.scope; stats.epoch = S.epoch; stats.public = open;
      stats.held = held; stats.audience = audience; stats.sources = sources.size;
      if (wasPublic && !open) { seen.clear(); seenOrder.fill(""); clearReactions(); }
      emit();
    };
    const dropSources = () => { if (sources.size) { sources.clear(); sourcesVersion++; } };
    const takeSources = (ids) => {
      if (!Array.isArray(ids)) return;
      sources.clear();
      sourcesVersion++;
      for (const id of ids) if (validId(id) && sources.size < SOURCES_MAX) sources.add(id);
    };
    // The room's frames. Anything not answering the current request, in this version, is ignored.
    const heard = (msg) => {
      if (disposed || !msg || typeof msg !== "object") return;
      if (msg.op === "lost") { sync(); return; }
      const e = msg.epoch;
      if (msg.v !== VERSION || !Number.isSafeInteger(e) || e < 0) return;
      // Only the live connection's answer to the latest request counts; nothing arrives for an old socket.
      if (!transport.live()) return;
      const current = e === asked && asked > left;
      if (msg.op === "open") {
        if (!current || e === quiet) return;
        audience = count(msg.listeners);
        takeSources(msg.sources);
        stats.refused = "";
        // A grant for another scope than asked is no grant: give it up as any other.
        if (!scope.acknowledge(e, msg.scope)) {
          left = quiet = e;
          if (transport.live()) sendLeave(e);
        }
      } else if (msg.op === "audience") {
        if (!current || !S.public) return;
        audience = count(msg.listeners);
        takeSources(msg.sources);
      } else if (msg.op === "closed") {
        // A confirmation of epochs given up; for the current grant, the room's own revocation (#667): close it here and
        // ask again only after another move.
        if (e <= left) closed = Math.max(closed, e);
        else if (current) {
          left = closed = e;
          stats.refused = typeof msg.reason === "string" ? msg.reason.slice(0, 32) : "revoked";
          // Moving the epoch closes the scope; held off asking until this sync, which knows the new epoch is quiet.
          syncing = true;
          try { scope.reset(); } finally { syncing = false; }
          quiet = S.epoch;
        } else return;
      } else if (msg.op === "refused") {
        if (!current) return;
        left = closed = e;
        quiet = e;
        stats.refused = typeof msg.reason === "string" ? msg.reason.slice(0, 32) : "refused";
      } else if (msg.op === "react") {
        if (!current || !S.public || !validId(msg.id) || typeof msg.rid !== "string" || !RID.test(msg.rid) || !validEmoji(msg.e) || seen.has(msg.rid)) return;
        if (seenOrder[seenAt]) seen.delete(seenOrder[seenAt]);
        seenOrder[seenAt] = msg.rid;
        seenAt = (seenAt + 1) % SEEN_MAX;
        seen.add(msg.rid);
        for (const fn of reactors) fn({ rid: msg.rid, id: msg.id, emoji: msg.e, speaker: msg.speaker === true });
        return;
      } else return;
      sync();
    };
    const unsubscribeScope = scope.subscribe(sync);
    const unsubscribeRoom = transport.watch(sync);
    const unsubscribeFrames = transport.subscribe(heard);
    sync();
    const subscribe = (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); };
    // fn({ rid, id, emoji, speaker }) for each new public reaction; fn(null) when the scope stops being public.
    const subscribeReactions = (fn) => { reactors.add(fn); return () => reactors.delete(fn); };
    // Whether `id` is a public speaker the room listed for the scope this page is public in.
    const source = (id) => sources.has(id);
    const dispose = () => {
      if (disposed) return;
      // A last word for anything still granted, then stand down: no longer a transport, nothing public.
      if (asked > left) { left = asked; if (transport.live()) sendLeave(left); }
      disposed = true;
      cancel(retryTimer);
      retryTimer = 0;
      unsubscribeScope(); unsubscribeRoom(); unsubscribeFrames();
      scope.setSupported(false);
      sources.clear();
      voice.setOutdoor(false, 0, sources);
      subscribers.clear(); reactors.clear();
    };
    return { stats, subscribe, subscribeReactions, source, dispose };
  };
  let page = null;
  const attach = () => {
    if (page) return page;
    const net = BL.net;
    page = create({
      scope: BL.outdoorScope,
      voice: BL.voice,
      validEmoji: BL.reactionPolicy.valid,
      transport: {
        live: () => net.state.room === "live",
        available: () => net.state.room === "live" && net.state.outdoorVoice,
        send: net.sendOutdoor,
        watch: net.subscribe,
        subscribe: net.subscribeOutdoor
      }
    });
    const bridge = page, dispose = bridge.dispose;
    bridge.dispose = () => { dispose(); if (page === bridge) page = null; };
    return page;
  };
  BL.outdoorVoice = { VERSION, RETRY_MS, RETRY_MAX, create, attach, get page() { return page; } };
})();
