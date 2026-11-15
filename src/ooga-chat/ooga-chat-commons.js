// The Commons and Online Oogas in Ooga Chat (#656, #670): what the island's Room tells a community member
// (docs/ooga-chat-backend.md, The Commons and Online Oogas), checked at the boundary and kept for the two tabs, which may
// be built after it has heard things. `create()` returns `apply(frame)`, taking one parsed frame from the adapter's
// `commons` socket, and the state the tabs draw: `you` ({ id, login, display }), `send` (whether lines may go from
// here; false while the Commons is read-only from Ooga Chat), `epoch`, `unicode` (the room takes extended text),
// `players` (a Map by id of `{ id, login, display, zone, voice, muted, hand, handTone, handEmoji }`, presence without a
// position, as the Room shows it) and `lines` (the last CHAT_KEEP, by id). `subscribe(fn)` hears
// `fn("welcome" | "players")`, `fn("lines", list, joined)` and `fn("receipt", receipt)`; `reset()` forgets everything on
// a sign-out or another account. Anything malformed is dropped as the island's own page drops it.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const KEEP = 100, LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
  const id = (value) => Number.isSafeInteger(value) && value > 0;
  const clientId = (value) => typeof value === "string" && /^[\w-]{1,64}$/.test(value);
  const words = (value, max) => typeof value === "string" && value.length <= max && !/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/.test(value);
  // A line, as the island's net.js keeps one: the room already sanitized the text and named the speaker.
  const lineOf = (m) => m && Number.isSafeInteger(m.id) && typeof m.login === "string" && typeof m.text === "string" && !BL.chatPolicy.error(m.text)
    ? { id: m.id, at: Number.isFinite(m.at) ? m.at : 0, login: m.login, name: typeof m.name === "string" && m.name ? m.name : m.login, text: BL.chatPolicy.text(m.text) }
    : null;
  const handOf = (on, tone, emoji) => ({ hand: on === true, handTone: Number.isInteger(tone) && tone >= 0 && tone < BL.reactionPolicy.TONES ? tone : 0,
    handEmoji: words(emoji, BL.reactionPolicy.MAX) ? emoji : "" });
  const playerOf = (p) => p && id(p.id) && typeof p.login === "string" && LOGIN.test(p.login) ? {
    id: p.id, login: p.login, display: words(p.display, 50) && p.display.trim() ? p.display : p.login,
    zone: words(p.zone, 64) && p.zone ? p.zone : "none", voice: p.voice === true, muted: p.muted === true, ...handOf(p.hand, p.handTone, p.handEmoji)
  } : null;
  const create = () => {
    const state = { you: null, send: false, epoch: 0, unicode: false, players: new Map(), lines: [] };
    const subscribers = new Set();
    const emit = (...args) => { for (const fn of subscribers) fn(...args); };
    const keep = (list, joined) => {
      if (joined) {
        const seen = new Set(state.lines.map((line) => line.id));
        for (const line of list) if (!seen.has(line.id)) state.lines.push(line);
        state.lines.sort((a, b) => a.id - b.id);
      } else state.lines.push(...list);
      if (state.lines.length > KEEP) state.lines.splice(0, state.lines.length - KEEP);
      emit("lines", list, joined);
    };
    const apply = (frame) => {
      if (!frame || typeof frame !== "object") return;
      if (frame.t === "community" && frame.op === "welcome" && frame.v === 1) {
        const you = frame.you && id(frame.you.id) && typeof frame.you.login === "string" && LOGIN.test(frame.you.login) ? frame.you : null;
        if (!you || !Array.isArray(frame.players)) return;
        state.you = { id: you.id, login: you.login, display: words(you.display, 50) && you.display.trim() ? you.display : you.login };
        state.send = frame.send === true;
        state.epoch = Number.isSafeInteger(frame.epoch) ? frame.epoch : 0;
        state.unicode = Array.isArray(frame.features) && frame.features.includes(BL.chatPolicy.FEATURE);
        state.players.clear();
        for (const raw of frame.players.slice(0, 256)) {
          const p = playerOf(raw);
          if (p) state.players.set(p.id, p);
        }
        emit("welcome");
      } else if (frame.t === "chat-history") {
        if (!Array.isArray(frame.messages)) return;
        const lines = [];
        for (const m of frame.messages.slice(-KEEP)) {
          const line = lineOf(m);
          if (line) lines.push(line);
        }
        keep(lines, true);
      } else if (frame.t === "chat") {
        const line = lineOf(frame);
        if (line) keep([line], false);
      } else if (frame.t === "chat-ack" || frame.t === "chat-rejected") {
        if (clientId(frame.clientId)) emit("receipt", { clientId: frame.clientId, accepted: frame.t === "chat-ack", conflict: frame.reason === "conflict", readOnly: frame.reason === "read_only" });
      } else if (frame.t === "join") {
        const p = playerOf(frame.p);
        if (!p) return;
        state.players.set(p.id, p);
        emit("players");
      } else if (frame.t === "leave") {
        if (state.players.delete(frame.id)) emit("players");
      } else if (frame.t === "zone") {
        const p = state.players.get(frame.id);
        if (!p || !words(frame.name, 64) || !frame.name) return;
        p.zone = frame.name;
        emit("players");
      } else if (frame.t === "vstate") {
        const p = state.players.get(frame.id);
        if (!p) return;
        p.voice = frame.voice === true;
        p.muted = frame.muted === true;
        emit("players");
      } else if (frame.t === "hand") {
        const p = state.players.get(frame.id);
        if (!p) return;
        Object.assign(p, handOf(frame.on, frame.tone, frame.e));
        emit("players");
      }
    };
    const reset = () => {
      state.you = null; state.send = false; state.epoch = 0; state.unicode = false;
      state.players.clear();
      state.lines.length = 0;
      emit("welcome");
    };
    const subscribe = (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    };
    return { state, apply, reset, subscribe };
  };
  BL.oogaChatCommons = { create, KEEP };
})();
