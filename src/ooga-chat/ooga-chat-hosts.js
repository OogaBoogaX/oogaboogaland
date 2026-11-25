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
    // The island view's map is the app's own lazy picture; its Live view the `live` chunk, fetched only when turned on.
    const islandView = { picture: "art/island-view-main.webp", loadLive: () => BL.oogaChatChunks.load("live"), storageKey: ctx.storageKey("island-live") };
    // Go there: the chat on the island. `handing` is the chat sent there, until the island has its voice (once its
    // visitor presses Switch here) or HAND_MS passes, as long as the island keeps the wish; GOING_MS of it reads Going….
    let last = null, handing = null;
    const SPEAKING = ["eligible", "pending", "active"], HAND_MS = 5 * 60 * 1000, GOING_MS = 8000;
    const goThere = {
      state(room) {
        const v = last && last.voice;
        if (!v || room.zone !== "main" || !(v.role === "speaker" || v.busy || SPEAKING.includes(room.you?.speak))) return null;
        if (handing && handing.id === room.id && Date.now() - handing.at < GOING_MS) return { label: "Going…", words: "Opening this chat on the island", disabled: true, title: "Opening on Ooga Booga Land…" };
        const why = !ctx.island() ? "The island can't be reached from here" : last.session?.identity.provider !== "github" ? "Going to the island needs a GitHub account" : "";
        return { label: "Go there", words: "Open this chat on the island", disabled: !!why, title: why || "Take your voice and your Ooga to this chat's island on Ooga Booga Land" };
      },
      press() {
        const room = last && last.room, island = ctx.island();
        if (!room || !island || !goThere.state(room) || goThere.state(room).disabled) return;
        const url = new URL("/", island);
        url.searchParams.set("chat", room.id);
        url.searchParams.set("mic", last.voice.role === "speaker" && !last.voice.muted ? "1" : "0");
        handing = { id: room.id, at: Date.now() };
        // Inside the press, so the browser lets it open; the island has no hold on this page.
        window.open(url.href, "_blank", "noopener");
        view.update(last);
        setTimeout(() => { if (last) view.update(last); }, GOING_MS + 50);
      },
      subscribe: () => () => {}
    };
    const view = BL.chatHosts.create({ node, head, space, chats, joinVoice: () => ctx.actions.joinVoice(), faceOf, islandView, goThere });
    const update = (state) => {
      last = state;
      // The island took the voice of the chat sent there: this page steps out of it, saying where it went.
      if (handing && state.room && state.room.id === handing.id && state.voice.elsewhere) { handing = null; c.leave("island"); return; }
      if (handing && (!state.room || state.room.id !== handing.id || Date.now() - handing.at >= HAND_MS)) handing = null;
      view.update(state);
    };
    const off = BL.oogaChatPortraits.onChange(() => { faces.clear(); view.redraw(); });
    return { update, dispose() { off(); view.dispose(); } };
  };
  const call = (ask, json, boot, init, query = "") => ask(boot.paths.chats + query, { ...init, headers: { "content-type": "application/json", accept: "application/json" } }, undefined, json)
    .then(({ response, data }) => response.ok ? data : data?.error || {}, () => ({}));
  const chats = async (ask, json, boot) => { const data = await call(ask, json, boot); return { chats: Array.isArray(data?.chats) ? data.chats : null }; };
  const startChat = async (ask, json, boot, body) => { const data = await call(ask, json, boot, { method: "POST", body: JSON.stringify(body) }); return data?.chat?.id ? { chat: data.chat } : data; };
  // A chat's preview: `{ chat, stage, listeners, requests }`, or `{ code }` (`ended` once it is gone), `{}` unanswered.
  const chatPreview = (ask, json, boot, id) => call(ask, json, boot, {}, `?chat=${encodeURIComponent(id)}`);
  BL.oogaChatHosts = { create, chats, startChat, chatPreview };
})();
