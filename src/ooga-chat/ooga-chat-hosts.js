// Ooga Chat's hosted chats (docs/ooga-chat-hosts.md), in a chunk of its own (`hosts`, ooga-chat-chunks.js), asked for
// once a signed-in account's service offers them: the island's shared views (chat-hosts.js, which the island's cloud tab
// draws with too) over the Ooga Chat tab (ooga-chat-views.js `chat`), with what only the app knows: its chats and
// voice (`ctx.chats`, `ctx.actions.joinVoice`), its hosts' faces from the face sheet (ooga-chat-portraits.js) and the
// chunk's own stylesheet, linked once (scripts/ooga-chat.mjs; from source it is on the page already). Start a chat
// chooses Main Island first. The island view's strip (island-view.js) shows the app's own map picture, and on it, for a
// speaker in a Main Island chat signed in with GitHub, Go there: the same chat opened on the island (the bootstrap's
// `island`, in a new tab, `?chat=<id>&mic=<0|1>`), which takes the visitor's voice there with their microphone as it was
// (chat-arrival.js on the island). This page keeps speaking until the island has the voice; once it does (its voice
// is elsewhere, `you.elsewhere`), it leaves the chat here, so the two never both play it. `create(ctx, { node, head, space })` returns `{ update(state), dispose() }`. The production
// adapter's hosted-chat calls are here too, kept off the first load: `chats(ask, json, boot)` is the live list,
// `{ chats }` (null when it can't be read), and `startChat(ask, json, boot, body)` starts one, `{ chat }` or the
// refusal's `{ code, retryable, retryAfter }` (none when there is no answer), and `chatPreview(ask, json, boot, id)` a
// chat's preview, each through that adapter's bounded `ask`.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const style = BL.oogaChatScripts && BL.oogaChatScripts["hosts.css"];
  if (style && typeof document !== "undefined" && !document.querySelector(`link[href="${style}"]`)) {
    const link = document.createElement("link");
    Object.assign(link, { rel: "stylesheet", href: style });
    document.head.append(link);
  }
  const faces = new Map();
  const faceOf = (character) => {
    if (faces.has(character)) return faces.get(character);
    const canvas = BL.oogaChatPortraits.canvas(character.toLowerCase());
    if (!canvas) return "";
    const url = canvas.toDataURL("image/png");
    faces.set(character, url);
    return url;
  };
  const create = (ctx, { node, head, space }) => {
    const c = ctx.chats, chats = { list: () => c.call("chats"), start: (body) => c.call("startChat", body), preview: (id) => c.call("chatPreview", id),
      open: c.open, leave: c.leave, request: c.request, hear: c.hear };
    // The island view's map is the app's own lazy picture; its 3D view the `live` chunk (and the island's published
    // character catalog, ooga-chat-catalog.js, before any Ooga is built), fetched only for a viewer it is
    // offered to: for now a signed-in GitHub contributor (the server's word, `gates`); other GitHub accounts and X get
    // the map, and the Audience holds their walk rate to the map's.
    const islandView = { picture: "art/island-view-main.webp", loadLive: () => Promise.resolve(BL.oogaChatChunks.load("live")).then(() => BL.oogaChatCatalog.apply()), scenery: BL.oogaChatScenery || "art", fullscreen: true,
      level: (id, self) => self ? ctx.media.ownLevel() : ctx.media.level(id),
      liveAllowed: () => !!last && last.mode === "live" && BL.oogaChatAuth.gates(last, Date.now()).contributor };
    // Go there: the chat on the island, in this same tab. A speaker on the stage asks the chat for a one-time ticket
    // (`handoff`, TICKET_MS at most) and the island's page, given it in the address's fragment, takes the voice and the
    // microphone as they were straight over with no card (chat-call.js); without one (not on the stage, or no answer)
    // the island listens and asks first. `handing` is the chat being sent there while the page goes.
    let last = null, handing = null;
    const SPEAKING = ["eligible", "pending", "active"], HAND_MS = 5 * 60 * 1000, GOING_MS = 8000, TICKET_MS = 2500;
    const goThere = {
      state(room) {
        const v = last && last.voice;
        if (!v || room.zone !== "main" || !(v.role === "speaker" || v.busy || SPEAKING.includes(room.you?.speak))) return null;
        if (handing && handing.id === room.id && Date.now() - handing.at < GOING_MS) return { label: "Going…", words: "Opening this chat on the island", disabled: true, title: "Opening on Ooga Booga Land…" };
        const why = !ctx.island() ? "The island can't be reached from here" : last.session?.identity.provider !== "github" ? "Going to the island needs a GitHub account" : "";
        return { label: BL.chatHosts.joinWords(room.zone), words: "Open this chat on the island", disabled: !!why, title: why || "Take your voice and your Ooga to this chat's island on Ooga Booga Land" };
      },
      press() {
        const room = last && last.room, island = ctx.island();
        if (!room || !island || !goThere.state(room) || goThere.state(room).disabled) return;
        const url = new URL("/", island);
        url.searchParams.set("chat", room.id);
        url.searchParams.set("mic", last.voice.role === "speaker" && !last.voice.muted ? "1" : "0");
        handing = { id: room.id, at: Date.now() };
        view.update(last);
        // The ticket in the fragment, which no server or log sees; the island takes it out of the address at once.
        let done = false, off = null, timer = 0;
        const go = (ticket) => {
          if (done) return;
          done = true;
          off?.(); clearTimeout(timer);
          if (ticket) url.hash = `handoff=${ticket}`;
          location.assign(url.href);
        };
        const asked = last.voice.role === "speaker" ? c.request("handoff", {}) : 0;
        if (!asked) return go("");
        off = c.hear((msg) => { if (msg.type === "result" && msg.requestId === asked) go(msg.ok && typeof msg.ticket === "string" ? msg.ticket : ""); });
        timer = setTimeout(() => go(""), TICKET_MS);
      },
      subscribe: () => () => {}
    };
    const view = BL.chatHosts.create({ node, head, space, chats, joinVoice: () => ctx.actions.joinVoice(), mute: () => ctx.actions.mute(), faceOf, islandView, goThere });
    // The list tabs' footers end or leave the chat as the Ooga Chat tab's does (ooga-chat-panels.js `accountRow`).
    ctx.actions.endChat = (at) => view.endFrom(at);
    ctx.actions.leaveChat = (at) => view.leaveFrom(at);
    // Every Sign out asks a chat's host first (chat-hosts.js `signOutFrom`).
    ctx.actions.signOutFrom = (at, go) => view.signOutFrom(at, go);
    // A shared chat's address (ooga-chat-app.js keeps its id in this tab): once signed in and in no chat, that chat's
    // preview opens from the live list, where the visitor chooses to join; one no longer listed is let go. Kept an hour.
    const OPEN_KEY = "ooga-chat-open", OPEN_MS = 60 * 60 * 1000;
    let opening = false;
    const openShared = (state) => {
      if (opening || state.mode !== "live" || !state.session || state.room) return;
      let kept = null;
      try { kept = JSON.parse(sessionStorage.getItem(OPEN_KEY) || "null"); sessionStorage.removeItem(OPEN_KEY); } catch { return; }
      if (!kept || typeof kept.id !== "string" || !(Date.now() - kept.at < OPEN_MS)) return;
      opening = true;
      chats.list().then(({ chats: raw }) => {
        const entry = (BL.chatHosts.parseList(raw) || []).find((e) => e.id === kept.id);
        if (entry && last && !last.room) view.preview(entry);
      }, () => {}).finally(() => { opening = false; });
    };
    const update = (state) => {
      last = state;
      openShared(state);
      // The island took the voice of the chat sent there: this page steps out of it, saying where it went.
      if (handing && state.room && state.room.id === handing.id && state.voice.elsewhere) { handing = null; c.leave("island"); return; }
      if (handing && (!state.room || state.room.id !== handing.id || Date.now() - handing.at >= HAND_MS)) handing = null;
      view.update(state);
    };
    const off = BL.oogaChatPortraits.onChange(() => { faces.clear(); view.redraw(); });
    return { update, dispose() { off(); delete ctx.actions.endChat; delete ctx.actions.leaveChat; delete ctx.actions.signOutFrom; view.dispose(); } };
  };
  const call = (ask, json, boot, init, query = "") => ask(boot.paths.chats + query, { ...init, headers: { "content-type": "application/json", accept: "application/json" } }, undefined, json)
    .then(({ response, data }) => response.ok ? data : data?.error || {}, () => ({}));
  const chats = async (ask, json, boot) => { const data = await call(ask, json, boot); return { chats: Array.isArray(data?.chats) ? data.chats : null }; };
  const startChat = async (ask, json, boot, body) => { const data = await call(ask, json, boot, { method: "POST", body: JSON.stringify(body) }); return data?.chat?.id ? { chat: data.chat } : data; };
  // A chat's preview: `{ chat, stage, listeners, requests }`, or `{ code }` (`ended` once it is gone), `{}` unanswered.
  const chatPreview = (ask, json, boot, id) => call(ask, json, boot, {}, `?chat=${encodeURIComponent(id)}`);
  BL.oogaChatHosts = { create, chats, startChat, chatPreview };
})();
