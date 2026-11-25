// A hosted chat from the island (docs/ooga-chat-hosts.md), like taking a call: the cloud tab's chat session, which
// cloud-panel.js draws through the views Ooga Chat shares (chat-hosts.js). On where the room's welcome lists `call-v1`
// (`net.state.chats`) for a signed-in visitor. The live chats are `GET /api/chats`, starting one `POST /api/chats`; a
// chat chosen opens its own socket, `/api/chats/<id>/live` (audience protocol 2: Ooga Chat's roster rows, kept by its
// roster, ooga-chat-roster.js), and its voice is Ooga Chat's own controller (ooga-chat-media.js) over
// `/api/chats/<id>/media/<op>`: listening at once with no microphone, speaking only when the chat's hosts let the
// visitor (`you.speak`) and they press for it. While the visitor is in a chat the island's own voice pauses: voice.js
// stops (a visitor who was in it is put back, listening and muted, once they leave the chat) and the room hears
// `{ t: "call", on }` (`net.setCall`), so other pages mark this player as in a chat. Leaving it, the chat ending or
// removing them (4404, 4403), signing out or the room's chats going away ends the call.
// `open(entry)`, `leave(kind)`, `request(type, fields)` (its id, 0 while the socket isn't open), `hear(fn)` (the chat's
// notices, request answers, reactions and the island view's `walk` frames), `subscribe(fn)` (anything changed), `list()`, `start(body)`, `preview(id)`, `identity()` (the visitor as
// the views know them), and `state` in Ooga Chat's shape for the shared views: `room` (the chat, with the server's
// `you`), `voice` (the controller's state), `audience` (`status`, `list`, `version`). `media` is the controller, for the
// panel's footer and tiles. No timer but the open chat socket's ping and reconnect; nothing per frame.
// Go there from Ooga Chat (docs/ooga-chat-hosts.md): a page opened as `?chat=<id>&mic=<0|1>` (ooga-chat-hosts.js) takes
// the address's two parameters out at once and keeps the wish in sessionStorage (`ooga-chat-arrive`, ARRIVE_MS), so a
// sign-in on the way keeps it; once signed in and the room is live it opens that chat, listening. A link anyone could
// post, so it never speaks by itself: for a visitor who may speak there it asks first (voice-handoff.js's card, "Speak
// from here?"), and only Switch here, a press on this page, takes the account's voice from Ooga Chat (`join({ takeover
// })`, inside the press), unmutes when the address said the microphone was open there (the card says so), and walks
// the Ooga into the chat's island (chat-copy.js `goSoon`). Not now leaves the voice where it is and the visitor
// listening. A host is still the host: roles belong to the account. A chat no longer listed says so; one the visitor may
// only listen in is listened to. `arrival` says where it stands.
// Under `?debug=1&chats=fixture` it runs on Ooga Chat's fixture adapter (ooga-chat-fixtures.js, a deferred group the
// page fetches then): sample chats, a contributor's account and fake WebRTC, nothing sent anywhere, for review.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const net = BL.net, voice = BL.voice;
  const PATH = "/api/chats", TIMEOUT_MS = 8000, MEDIA_TIMEOUT_MS = 12000, PING_MS = 10000, BACKOFF_MS = [1000, 30000], FULL_WAIT_MS = 30000, FRAME_MAX = 1 << 20;
  const params = new URLSearchParams(location.search);
  const fixture = params.get("debug") === "1" && params.get("chats") === "fixture";
  const subs = new Set(), heard = new Set();
  let room = null, feed = null, status = "off", version = 0, resumeVoice = false, media = null, fake = null, listed = 0, shown = null;
  const roster = BL.oogaChatRoster.create();
  const emit = () => { version++; for (const fn of subs) fn(); };

  // One bounded same-origin request: `{ status, ok, data }`, status 0 when it never answered.
  const ask = async (path, init = {}, timeout = TIMEOUT_MS) => {
    const controller = new AbortController(), cut = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(path, { credentials: "same-origin", cache: "no-store", redirect: "error", ...init, signal: controller.signal,
        headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) } });
      const data = /^application\/json\b/.test(response.headers.get("content-type") || "") ? await response.json().catch(() => null) : null;
      return { status: response.status, ok: response.ok, data };
    } catch { return { status: 0, ok: false, data: null }; } finally { clearTimeout(cut); }
  };
  // The island's own transport, in the shape of Ooga Chat's adapter (`chats`, `startChat`, `audience`, `media`), so the
  // review fixture can stand in for it.
  const island = {
    chats: async () => { const r = await ask(PATH); return { chats: r.ok && Array.isArray(r.data?.chats) ? r.data.chats : null }; },
    // A chat's preview, or the refusal (`ended` once it is gone), `{}` unanswered.
    chatPreview: async (boot, id) => { const r = await ask(`${PATH}/${encodeURIComponent(id)}`); return r.ok ? r.data || {} : r.data?.error || {}; },
    startChat: async (boot, body) => { const r = await ask(PATH, { method: "POST", body: JSON.stringify(body) }); return r.ok && r.data?.chat?.id ? { chat: r.data.chat } : r.data?.error || {}; },
    media: (boot, chat) => ({ async call(op, body) {
      const r = await ask(`${PATH}/${chat}/media/${op}`, { method: "POST", body: JSON.stringify(body) }, MEDIA_TIMEOUT_MS);
      if (r.ok && r.data && typeof r.data === "object") return r.data;
      const error = r.data?.error && typeof r.data.error.code === "string" ? r.data.error : { code: r.status ? `http_${r.status}` : "unreachable", retryable: !r.status || r.status >= 500 };
      throw Object.assign(new Error(error.code), { code: error.code, retryable: !!error.retryable, status: r.status });
    } }),
    // The chat's socket: joined with protocol 2, pinged every PING_MS (the Audience takes one silent for 45 s for gone,
    // audience.js `SILENT_MS`) and once more as the page is shown again, backed off on a drop, and never opened again
    // once removed (4403) or ended (4404).
    audience: (boot, { message, status: told }, chat) => {
      let socket = null, tries = 0, timer = 0, ping = 0, requests = 0, closed = false;
      const send = (data) => !!socket && socket.readyState === 1 && (socket.send(JSON.stringify(data)), true);
      const later = (ms) => { clearTimeout(timer); timer = setTimeout(() => { timer = 0; open(); }, ms); };
      const open = () => {
        if (closed) return;
        told(tries ? "reconnecting" : "connecting");
        const own = socket = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${PATH}/${chat}/live`);
        own.addEventListener("open", () => {
          if (own !== socket) return;
          send({ type: "join", protocol: 2 });
          clearInterval(ping);
          ping = setInterval(() => { if (own.readyState === 1) own.send("ping"); }, PING_MS);
        });
        own.addEventListener("message", (event) => {
          if (own !== socket || typeof event.data !== "string" || event.data === "pong" || event.data.length > FRAME_MAX) return;
          let data;
          try { data = JSON.parse(event.data); } catch { return; }
          tries = 0;
          message(data);
        });
        own.addEventListener("close", (event) => {
          if (own !== socket || closed) return;
          clearInterval(ping);
          ping = 0;
          socket = null;
          if (event.code === 4403 || event.code === 4404) return told(event.code === 4403 ? "removed" : "ended");
          if (event.code === 4426) return told("stale");
          if (event.code === 4429) { told("full"); return later(FULL_WAIT_MS); }
          tries++;
          told("reconnecting");
          later(Math.min(BACKOFF_MS[1], BACKOFF_MS[0] * 2 ** Math.min(tries - 1, 5)) * (0.75 + Math.random() * 0.5));
        });
      };
      // Shown again: a ping at once, since a hidden page's timers may have slowed.
      const shown = () => { if (!document.hidden && socket && socket.readyState === 1) socket.send("ping"); };
      document.addEventListener("visibilitychange", shown);
      return {
        zone() { if (!socket && !timer) open(); },
        resync: (zone) => send({ type: "resync", zone }),
        request: (type, fields) => send({ type, requestId: ++requests, ...fields }) ? requests : 0,
        wake() { if (socket && socket.readyState === 1) socket.send("ping"); },
        dispose() {
          closed = true;
          document.removeEventListener("visibilitychange", shown);
          clearTimeout(timer);
          clearInterval(ping);
          if (socket) try { socket.close(1000); } catch { /* already closed */ }
          socket = null;
        }
      };
    }
  };
  // The review fixture, once its code is here: its bootstrap and session, made once.
  let fakeReady = null;
  const fixtureAdapter = () => fakeReady ||= Promise.resolve(BL.deferred.load("chats-fixture")).then(async () => {
    const adapter = BL.oogaChatFixtures.create({ state: "contributor", chats: "on" });
    const boot = await adapter.bootstrap();
    fake = { adapter, boot, session: await adapter.session(boot) };
    emit();
    return fake;
  });
  const transport = () => fixture ? fake && fake.adapter : island;
  const boot = () => fixture ? fake && fake.boot : null;
  // The controller, made the first time a chat opens: it listens without a microphone and asks for one only on a press.
  const controller = () => media ||= BL.oogaChatMedia.create({
    broker: () => room && transport() ? transport().media(boot(), room.id) : null,
    ...(fixture && fake ? { rtc: fake.adapter.rtc } : {}),
    request: (type, fields) => request(type, fields),
    allowed: () => !!room,
    stall: () => feed && feed.wake && feed.wake(true),
    onChange: emit
  });

  // On for review from the first frame (its sample account arrives a moment later), else where the room says so.
  const available = () => fixture || !!net.state.me && net.state.chats && net.state.room === "live";
  // The visitor as the views know them (Ooga Chat's session identity).
  const identity = () => {
    if (fixture) return fake ? fake.session.identity : null;
    const me = net.state.me;
    return me ? { provider: "github", display: me.display || me.login, login: me.login, participant: `gh:${me.id}`, avatar: null } : null;
  };
  const list = () => transport() ? transport().chats(boot()) : Promise.resolve({ chats: null });
  const start = (body) => transport() ? transport().startChat(boot(), body) : Promise.resolve({});
  const preview = (id) => transport() ? transport().chatPreview(boot(), id) : Promise.resolve({});
  const request = (type, fields = {}) => room && feed ? feed.request(type, fields) : 0;
  const setStatus = (next) => { status = next; controller().status(next); emit(); };
  // What the chat says, as Ooga Chat's app hears it (ooga-chat-app.js): the visitor's standing, notices and answers to
  // the chat views, a host's mute on the microphone here, and the roster's snapshots and deltas.
  const message = (chat) => (msg) => {
    if (room !== chat || !msg || typeof msg !== "object") return;
    const m = controller();
    if (msg.you && typeof msg.you === "object") chat.you = msg.you;
    // The chat's own word (its host, co-hosts and open stage): on the snapshot, and again whenever it changes.
    if (msg.chat && typeof msg.chat === "object") chat.chat = msg.chat;
    if (msg.type === "chat") return emit();
    if (msg.type === "notice") {
      if (msg.kind === "muted" && m.state.role === "speaker" && !m.state.muted) m.mute();
      for (const fn of heard) fn(msg);
      return emit();
    }
    if (msg.type === "result") { m.heard(msg); for (const fn of heard) fn(msg); return emit(); }
    // Who its hosts removed, for a host or co-host's Allow back (chat-hosts.js).
    if (msg.type === "removed") { for (const fn of heard) fn(msg); return emit(); }
    if (msg.type === "you" || msg.type === "media") { m.heard(msg); return emit(); }
    // A reaction over a participant's circle (cloud-panel.js), the visitor's own included.
    if (msg.type === "reaction") { for (const fn of heard) fn(msg); return; }
    // The island view's walkers (chat-hosts.js, island-view.js), heard while it asked for them.
    if (msg.type === "walk") { for (const fn of heard) fn(msg); return; }
    const result = roster.apply(msg);
    if (result === "gap") feed.resync(BL.chatHosts.rosterZone(chat.zone));
    if (result === "applied") {
      listed++;
      setStatus("live");
      if (msg.type === "snapshot") m.heard(msg);
    }
  };
  // A chat chosen from the list (`entry`: its id, title and zone). The island's voice pauses first, remembered.
  const open = (entry) => {
    if (!available() || fixture && !fake || room?.id === entry.id) return;
    if (room) leave();
    const m = controller();
    if (voice.stats.enabled || voice.stats.joining || voice.stats.returning) { resumeVoice = true; voice.stop(); }
    const chat = room = { id: entry.id, title: entry.title, zone: entry.zone, you: null };
    roster.expect(BL.chatHosts.rosterZone(entry.zone));
    listed++;
    m.identify(identity()?.participant || null);
    // A Voice only chat's frames name the `main` zone: voice follows the roster's zone, never the land.
    m.zone(BL.chatHosts.rosterZone(entry.zone));
    net.setCall(true);
    feed = transport().audience(boot(), { message: message(chat), status(next) {
      if (room !== chat) return;
      // Removed by its hosts, or ended: back to the list, saying so.
      if (next === "removed" || next === "ended") return leave(next);
      setStatus(next === "signed-out" ? "reconnecting" : next);
    } }, entry.id);
    feed.zone(entry.zone);
    emit();
  };
  // The chat left (`kind`: "ended" or "removed" for the chat's own word, null for Leave): its socket and voice end, the
  // room hears the call is over and the island's voice comes back for a visitor who was in it.
  function leave(kind = null) {
    if (!room) return;
    room = null;
    const was = feed;
    feed = null;
    was?.dispose();
    media?.stop();
    roster.expect(null);
    listed++;
    status = "off";
    net.setCall(false);
    if (resumeVoice) { resumeVoice = false; voice.restart(true); }
    emit();
    if (kind) for (const fn of heard) fn({ type: "notice", kind, left: true });
  }
  // Signing out, another account or the room's chats going away ends the call; the gate's changes reach the panel.
  let account = null, gate = false;
  net.subscribe(() => {
    const me = net.state.me ? net.state.me.id : null;
    if (room && !fixture && (me !== account || !net.state.chats && net.state.room === "live")) leave();
    account = me;
    if (available() !== gate) { gate = available(); emit(); }
  });
  // --- Go there from Ooga Chat ---
  // `arrival`: `{ id, mic, at, step }`, step "open" (find the chat and open it), "ask" (the card, until it is answered),
  // "voice" (take the voice, after Switch here), "mic" (open the microphone as it was), "go" (walk into the chat's
  // island), then gone.
  const ARRIVE_KEY = "ooga-chat-arrive", ARRIVE_MS = 5 * 60 * 1000, JOIN_TRIES = 3;
  let arrival = null, arriving = false, joinTries = 0, signInSaid = false, card = null;
  // The card, made the first time it is wanted, in voice-handoff.js's look with this arrival's words.
  const askVoice = () => {
    if (!card) {
      card = BL.voiceHandoff.build({ onSwitch: () => {
        if (!arrival || arrival.step !== "ask" || !room || room.id !== arrival.id) return;
        arrival.step = "voice";
        joinTries = 1;
        // Inside the press: the gesture a microphone needs.
        controller().join({ takeover: !!(room.you && room.you.elsewhere) });
      }, onDismiss: () => arrived() });
      document.body.append(card.node);
    }
    card.node.querySelector(".voice-handoff-title").textContent = "Speak from here?";
    card.node.querySelector(".voice-handoff-body").textContent = `Your voice in ${room.title} is in Ooga Chat. Switch it here and walk your Ooga onto the chat's island?`
      + (arrival.mic ? " Your microphone will be on, as it was there." : " You'll stay muted.") + " Ooga Chat stops speaking.";
    card.open();
  };
  {
    const id = params.get("chat");
    if (id && /^[A-Za-z0-9_-]{16}$/.test(id)) {
      arrival = { id, mic: params.get("mic") === "1", at: Date.now(), step: "open" };
      try { sessionStorage.setItem(ARRIVE_KEY, JSON.stringify(arrival)); } catch { /* kept for this page alone */ }
    } else {
      try {
        const kept = JSON.parse(sessionStorage.getItem(ARRIVE_KEY) || "null");
        if (kept && /^[A-Za-z0-9_-]{16}$/.test(kept.id) && Number.isFinite(kept.at) && Date.now() - kept.at < ARRIVE_MS) arrival = { id: kept.id, mic: kept.mic === true, at: kept.at, step: "open" };
      } catch { /* none */ }
    }
    if (params.has("chat") || params.has("mic")) {
      const url = new URL(location.href);
      url.searchParams.delete("chat"); url.searchParams.delete("mic");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    }
  }
  const arrived = (words = "") => {
    arrival = null;
    card?.close();
    try { sessionStorage.removeItem(ARRIVE_KEY); } catch { /* none kept */ }
    if (words && BL.hud) BL.hud.toast(words);
  };
  const arrive = () => {
    if (!arrival || arriving || fixture) return;
    if (Date.now() - arrival.at >= ARRIVE_MS) return arrived();
    const s = net.state;
    if (!s.me) {
      if (s.backend && s.room === "off" && !signInSaid) { signInSaid = true; BL.hud?.toast("Sign in to bring your chat here"); }
      return;
    }
    if (!available()) return;
    if (arrival.step === "open") {
      if (room && room.id === arrival.id) { arrival.step = "ask"; return arrive(); }
      arriving = true;
      list().then((answer) => {
        arriving = false;
        if (!arrival || arrival.step !== "open") return;
        const entry = (BL.chatHosts.parseList(answer.chats) || []).find((c) => c.id === arrival.id);
        if (!answer.chats) return arrived("The chat couldn't be reached from here");
        if (!entry) return arrived("That chat has ended");
        open(entry);
        if (BL.cloudPanel) BL.cloudPanel.preview(entry.id);
        arrival.step = "ask";
        arrive();
      });
      return;
    }
    if (!room || room.id !== arrival.id) return arrived();
    const m = controller(), v = m.state, you = room.you;
    if (arrival.step === "ask") {
      // Until the chat's voice is connected here, Switch here could not start.
      if (!you || v.busy || v.phase === "off" || v.phase === "connecting") return;
      // Not on the stage there: listening here is all there is.
      if (you.speak !== "eligible" && !you.elsewhere) return arrived();
      if (!card || !card.shown) askVoice();
      return;
    }
    if (arrival.step === "voice") {
      if (!you) return;
      if (v.role === "speaker" && !v.busy) { arrival.step = "mic"; return arrive(); }
      if (v.busy || v.phase === "off" || v.phase === "connecting") return;
      // A join that could not start (the press's first try is counted already) is tried again a few times.
      if (you.speak !== "eligible" && !you.elsewhere) return arrived();
      if (++joinTries > JOIN_TRIES) return arrived(v.notice || "");
      m.join({ takeover: !!you.elsewhere });
      return;
    }
    if (arrival.step === "mic") {
      if (v.busy) return;
      // The step moves on first: unmuting tells every subscriber, this one included, at once.
      arrival.step = "go";
      if (arrival.mic && v.role === "speaker" && v.muted) m.mute();
      if (!arrival || arrival.step !== "go") return;
    }
    if (arrival.step === "go") {
      const id = arrival.id;
      arrived();
      if (BL.chatCopy && room.zone === "main") BL.chatCopy.goSoon(id);
    }
  };
  subs.add(arrive);
  net.subscribe(arrive);
  // deferred.js loads after this file: the fixture is fetched once the page's scripts have all run.
  if (fixture) addEventListener("DOMContentLoaded", () => fixtureAdapter().catch(() => {}), { once: true });
  BL.chatCall = {
    open, leave, request, list, start, preview, identity, available, fixture,
    hear(fn) { heard.add(fn); return () => heard.delete(fn); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    get media() { return controller(); },
    get room() { return room; },
    // The roster's order is worked out again only when it changed (`audience.version`).
    get state() {
      if (!shown || shown.version !== listed) {
        const self = room?.you?.id || identity()?.participant || null;
        shown = { version: listed, list: room && roster.ready ? roster.list(self) : [] };
      }
      return { room, voice: media ? media.state : BL.oogaChatMedia.IDLE, audience: { status, list: shown.list, version: listed } };
    },
    get arrival() { return arrival ? { ...arrival } : null; },
    get stats() { return { open: !!room, status, rows: roster.size, resumeVoice, version, fixture, arrival: arrival ? arrival.step : "" }; }
  };
})();
