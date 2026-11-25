// Ooga Chat's Contributing Oogas, Online Oogas and The Commons, in the `panels` chunk (ooga-chat-chunks.js) with the
// island's roster panel, conversation log and zones, which a staged build loads only once the page is idle or one of
// these tabs is chosen. It registers `roster`, `commons` and `online` on BL.oogaChatViews, whose `deferred` stands in
// for each until then, and builds with the views' kit.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { letter } = BL.signGlyphs, { gates } = BL.oogaChatAuth;
  const { make, button, set, attr, explain, joining, PROVIDERS, micLook, describeMic, pressMic, volumeControl, panelHead } = BL.oogaChatViews.kit;
  const micState = {};
  const paintMic = (ctx, el, p, self) => {
    set(el, "hidden", !p || p.role !== "speaker");
    if (!p || p.role !== "speaker") return;
    describeMic(ctx, p, self, micState);
    if (el.dataset.voice !== micState.look) el.dataset.voice = micState.look;
    attr(el, "data-participant", p.id);
    attr(el, "data-self", String(self));
    set(el, "disabled", micState.micDisabled);
    set(el, "title", micState.micWords);
    attr(el, "aria-label", micState.micWords);
    attr(el, "aria-pressed", String(micState.micPressed));
  };
  const playerVoice = (p) => ({ id: `gh:${p.id}`, display: p.display, role: p.voice ? "speaker" : "listener", muted: p.muted });
  // The account row the island keeps at the foot of Contributing Oogas, Online Oogas and The Commons (hud.js
  // `showAccount`): while signed out, the sign-in screen's own Continue with GitHub (the design's sign-in button, in
  // place of the island's Contributor sign-in), else the name (Ooga Chat's purple dot, with how many are on the island
  // while The Commons is live), and as the cloud tab's footer: the microphone, shown and off until speaking, Join voice
  // (Leave voice once speaking) and Sign out; with hosted chats, the microphone and Join voice only while in a chat.
  const accountRow = ({ actions, media, commons: { model } }) => {
    const listeners = new AbortController(), { signal } = listeners;
    const login = button("oc-provider oc-account-signin", PROVIDERS.github[0]);
    login.dataset.provider = "github";
    login.title = "Sign in with GitHub to see who is on the island and talk in The Commons.";
    login.addEventListener("click", () => actions.signIn("github"), { signal });
    const name = make("span", "account-name"), room = make("span", "account-room");
    const mute = button("foot-button account-mute", "Unmute"), voice = button("foot-button account-voice", "Join voice"), out = button("link", "Sign out");
    const voiceWhy = explain(voice);
    mute.setAttribute("aria-pressed", "false");
    mute.addEventListener("click", (event) => {
      if (event.detail) mute.blur();
      actions.mute();
    }, { signal });
    voice.addEventListener("click", (event) => {
      if (event.detail) voice.blur();
      if (last?.voice.role === "speaker") actions.leaveVoice();
      else actions.joinVoice();
    }, { signal });
    out.addEventListener("click", () => actions.signOut(), { signal });
    const node = make("div", "account", login, make("span", "account-who", name, room), make("span", "account-actions", mute, voice, out), voiceWhy);
    let last = null;
    const update = (state) => {
      last = state;
      const live = state.mode === "live", who = live && state.session, signing = state.busy === "signout";
      set(login, "hidden", !!who || signing || !live || !state.boot?.features.github);
      set(login, "disabled", !!state.busy || !state.device.online || state.auth === "checking");
      set(login, "textContent", state.busy === "github" ? PROVIDERS.github[1] : PROVIDERS.github[0]);
      attr(login, "aria-busy", String(state.busy === "github"));
      set(node, "hidden", !live || !who && !signing && login.hidden);
      set(name, "hidden", !who);
      set(out, "hidden", !who && !signing);
      set(out, "textContent", signing ? "Signing out…" : "Sign out");
      set(out, "disabled", !!state.busy);
      const here = !!who && state.commons.status === "live" && !!model.state.you;
      set(room, "textContent", here ? `${onlineCount(model, publicOf(state), !!state.room)} online` : "");
      set(room, "hidden", !here);
      if (node.dataset.live !== String(here)) node.dataset.live = String(here);
      if (!who) {
        set(mute, "hidden", true);
        set(voice, "hidden", true);
        return;
      }
      set(name, "textContent", who.identity.display);
      // In a chat the chat decides who may speak, as the Ooga Chat tab's footer asks it (ooga-chat-views.js `cloudFoot`).
      const speaker = state.voice.role === "speaker", allowed = state.room ? { joinVoice: state.room.you?.speak === "eligible" || !!state.voice.elsewhere, why: null } : gates(state, Date.now());
      const join = joining(state, allowed, media);
      // With hosted chats, voice is a chat's, as in the Ooga Chat tab: outside one, or in one without leave to speak (asked
      // for there), nothing to join; Unmute only for a speaker.
      const chats = !!state.boot?.features.chats;
      if (chats && !speaker && !(state.room && allowed.joinVoice)) {
        set(mute, "hidden", true);
        set(voice, "hidden", true);
        set(voiceWhy, "textContent", "");
        return;
      }
      set(mute, "hidden", chats && !speaker);
      set(mute, "disabled", !speaker || !!state.busy || state.voice.busy);
      set(mute, "textContent", speaker && !state.voice.muted ? "Mute" : "Unmute");
      attr(mute, "aria-pressed", String(speaker && state.voice.muted));
      micLook(mute, !mute.disabled && speaker, state.voice.muted);
      // A host stays on the stage while hosting, as the Ooga Chat tab's footer has it (chat-hosts.js): Mute, never Leave voice.
      set(voice, "hidden", speaker && state.room?.you?.rank === "host");
      set(voice, "textContent", speaker ? "Leave voice" : join.words || "Join voice");
      set(voice, "disabled", speaker ? !!state.busy : join.disabled);
      const why = speaker ? "" : join.why;
      set(voiceWhy, "textContent", why);
      set(voice, "title", why);
    };
    const off = model.subscribe((kind) => { if (last && (kind === "players" || kind === "welcome")) update(last); });
    const dispose = () => {
      listeners.abort();
      off();
    };
    return { node, update, dispose };
  };
  // The contributor tabs (#656, #670) draw what the Room tells a community member (`ctx.commons`: ooga-chat-commons.js's
  // `model` and `send`), and `state.commons.status` is the socket's (ooga-chat-http.js `commons`). What the status says
  // while no line can go, and the chip's word for it.
  const COMMONS_WORDS = {
    off: "The Commons is for Team Ooga Booga contributors signed in with GitHub.",
    closed: "The Commons isn't open from Ooga Chat yet.",
    connecting: "Joining the island…",
    reconnecting: "Reconnecting to the island…",
    full: "Too many Commons connections right now. Trying again shortly.",
    refused: "The Commons is for Team Ooga Booga contributors.",
    "signed-out": "Checking your sign-in…",
    "read-only": "Reading only: sending lines from Ooga Chat isn't open yet."
  };
  // With hosted chats on and no chat joined, reactions have nowhere to go: the panel's emoji bar stands down (ooga-chat.css).
  const outOfChat = (node, state) => {
    const out = !!state.boot?.features.chats && !state.room;
    if (out !== (node.dataset.chat === "none")) { if (out) node.dataset.chat = "none"; else delete node.dataset.chat; }
  };
  // The public conversation's audience, or null with hosted chats on: then `state.audience` is the chat the visitor is
  // in, whose people are no land's (a voice-only chat's too), so they are neither listed as Main Island nor counted.
  const publicOf = (state) => state.boot?.features.chats ? null : state.audience;
  // Main Island's listeners here, but the member and anyone also on the island, who are counted and listed once.
  const appListeners = (model, audience) => {
    if (!audience || audience.zone !== "main") return [];
    const you = model.state.you ? `gh:${model.state.you.id}` : "";
    return audience.list.filter((a) => a.role === "listener" && a.id !== you
      && !(a.id.startsWith("gh:") && model.state.players.has(Number(a.id.slice(3)))));
  };
  // Everyone online for a member: the island's players, everyone in hosted chats through Ooga Chat and not on the island
  // (the Room's one number, as the island counts them; the member among them while any of their pages is in a chat,
  // `chatMine`), the member, who is online here in Ooga Chat even while in no chat and their Ooga not on the island (the
  // Room lists only the island's players, worker/src/room-commons.js), and the public conversation's Main Island
  // listeners where it still runs.
  const onlineCount = (model, audience, inChat = false) => model.state.players.size + model.state.chatOnline
    + (model.state.you && !model.state.players.has(model.state.you.id) && !inChat && !model.state.chatMine ? 1 : 0) + appListeners(model, audience).length;
  const commonsChip = (status, model, audience, inChat) => status === "live" ? `${onlineCount(model, audience, inChat)} online` : status === "closed" ? "Closed" : "Offline";
  // Ooga Chat's own speakers in the audience's list: the ones on clouds, purple wherever a panel marks them.
  const appSpeakers = (list) => list.filter((p) => p.role === "speaker" && p.source === "app");
  // Shown again when its tab is opened, as a view hidden by the shell is not told.
  const onShown = (node, fn) => {
    let watching = null;
    return () => {
      if (watching || !node.parentElement) return;
      watching = new MutationObserver(fn);
      watching.observe(node.parentElement, { attributes: true, attributeFilter: ["hidden"] });
      fn();
    };
  };
  // Contributing Oogas (#656): the island's own panel (roster-panel.js), filled from the public panel data (#664: the
  // island's cast and Oogatron's reading, `ctx.contributors()`), read when the tab first shows and again when it shows
  // after two minutes, its ages kept up each minute while it shows. Each Ooga's face is the face sheet's
  // (ooga-chat-faces.js, drawn by the island's own renderer), loaded when a strip first opens. A contributor in The
  // Commons sees whose Ooga is on the island now; nobody else does. A reading that is stale or unreadable says so under
  // the list; nothing is invented.
  const rosterView = (ctx) => {
    const node = make("section", "panel oc-panel oc-roster");
    node.dataset.panel = "roster";
    BL.rosterPanel.build(node);
    for (const el of node.querySelectorAll("[data-sign]")) letter(el);
    const note = make("p", "help oc-roster-note");
    note.hidden = true;
    const account = accountRow(ctx);
    // The emoji panel under the list, as the island's Contributing Oogas has it.
    const reactions = make("div", "reactions");
    node.append(note, make("div", "panel-foot", reactions, account.node));
    ctx.reactions.bars.mount(reactions, { handAllowed: () => ctx.media.state.role === "speaker" });
    const { stateAt, ageAt } = BL.rosterPanel, town = ctx.commons.model;
    // Who speaks from Ooga Chat now, by login, from the audience's list: their dots are Ooga Chat's purple.
    let speakers = new Set(), heard = -1, audience = [], me = "", voice = null;
    const people = new Map(), voices = new Map();
    let panel = null, names = "", reading = null, fetchedAt = 0, loading = false, timer = 0;
    const paintVoices = () => {
      if (!panel) return;
      for (const row of panel.rows.values()) {
        const p = voices.get(row.contributor.login);
        paintMic(ctx, row.voice, p, !!p && p.id === me);
      }
    };
    const indexVoices = () => {
      voices.clear();
      for (const p of town.state.players.values()) if (p.voice) voices.set(p.login.toLowerCase(), playerVoice(p));
      for (const p of audience) if (p.role === "speaker" && p.id.startsWith("gh:")) voices.set(p.login.toLowerCase(), p);
      paintVoices();
    };
    const stopPortraits = BL.oogaChatPortraits.onChange(() => panel?.faceChanged(true));
    const face = (contributor) => BL.oogaChatPortraits.canvas(contributor.name);
    const stampOf = (c) => c.lastContributionAt || c.lastCommitAt;
    const online = (row) => {
      if (speakers.has(row.contributor.login)) return "cloud";
      // The visitor is online here, in Ooga Chat: their own dot is its purple.
      if (town.state.you && row.contributor.login === town.state.you.login.toLowerCase()) return "app";
      for (const p of town.state.players.values()) if (p.login.toLowerCase() === row.contributor.login) return true;
      return false;
    };
    const hooks = { stamp: stampOf, login: (c) => c.login, joinedAt: (c) => c.joinedAt, stats: () => reading, face, online,
      stateFor: (c) => stateAt(c.lastContributionAt > 0 ? c.lastContributionAt : c.lastCommitAt, Date.now()),
      ageLabel: (c) => ageAt(c.lastContributionAt > 0 ? c.lastContributionAt : c.lastCommitAt, Date.now()),
      voice: (el) => pressMic(ctx, el.dataset.participant, el.dataset.self === "true"), sortKey: ctx.storageKey("roster-sort") };
    const time = (value) => Number.isSafeInteger(value) && value > 0 ? value : 0;
    // The answer, checked: the cast's rows become contributors kept by handle (so a row holds the same one across
    // readings), each one's latest contribution from the reading's org-wide last-seen time for its GitHub login.
    const apply = (body) => {
      const cast = body && Array.isArray(body.cast) ? body.cast.filter((r) => r && typeof r.handle === "string" && /^[\w.-]{1,39}$/.test(r.handle)) : null;
      const at = Date.now();
      reading = body && body.stats ? BL.activityRepos.normalizeStats(body.stats, at) : null;
      const seen = new Map();
      if (reading && Array.isArray(reading.contributors)) for (const c of reading.contributors) {
        const t = c && typeof c.login === "string" && typeof c.last_seen_at === "string" ? Date.parse(c.last_seen_at) : NaN;
        if (t > 0 && t <= at) seen.set(c.login.toLowerCase(), Math.max(seen.get(c.login.toLowerCase()) || 0, t));
      }
      if (cast) {
        for (const row of cast) {
          const login = (typeof row.github === "string" && row.github ? row.github : row.handle).toLowerCase();
          const entry = people.get(row.handle) || { name: row.handle };
          Object.assign(entry, { display: typeof row.display === "string" && row.display ? row.display : row.handle, login,
            joinedAt: time(row.joinedAt), lastCommitAt: time(row.lastCommitAt), lastContributionAt: seen.get(login) || seen.get(row.handle.toLowerCase()) || 0 });
          people.set(row.handle, entry);
        }
        const next = cast.map((r) => r.handle).join();
        if (next !== names) {
          for (const name of people.keys()) if (!cast.some((r) => r.handle === name)) people.delete(name);
          names = next;
          panel?.dispose();
          panel = BL.rosterPanel.create(node, { ...hooks, roster: [...people.values()] });
          for (const row of panel.rows.values()) panel.showOnline(row);
        } else if (panel) {
          for (const row of panel.rows.values()) panel.setRow(row.contributor.name);
          panel.statsChanged();
        }
        paintVoices();
      }
      const stats = body?.sources?.stats?.state, castState = body?.sources?.cast?.state;
      const minutes = body?.sources?.stats?.generatedAt ? Math.max(1, Math.round((at - body.sources.stats.generatedAt) / 60000)) : 0;
      note.textContent = !body ? (panel ? "Contributing Oogas can't be reached right now; this is the last list read." : "Contributing Oogas can't be reached right now.")
        : castState && castState !== "ok" ? "The island's list of Oogas couldn't be read just now; this is the last one kept."
        : stats === "unavailable" ? "Contribution numbers are unavailable right now."
        : stats === "stale" ? `Contribution numbers are from Oogatron's reading ${minutes} minute${minutes === 1 ? "" : "s"} ago.` : "";
      note.hidden = !note.textContent;
    };
    const load = () => {
      if (loading) return;
      loading = true;
      Promise.resolve(ctx.contributors()).then(apply, () => apply(null)).finally(() => { loading = false; fetchedAt = Date.now(); });
    };
    // While it shows: read when it was last read two minutes ago or more, and keep the ages up each minute.
    const shown = () => {
      const visible = !node.closest("[hidden]");
      clearInterval(timer);
      timer = 0;
      if (!visible) return;
      if (Date.now() - fetchedAt >= 120000) load();
      timer = setInterval(() => {
        if (Date.now() - fetchedAt >= 120000) load();
        else if (panel) for (const row of panel.rows.values()) panel.setRow(row.contributor.name);
      }, 60000);
    };
    const watch = onShown(node, shown);
    const off = town.subscribe((kind) => {
      if (kind !== "players" && kind !== "welcome") return;
      if (panel) for (const row of panel.rows.values()) panel.showOnline(row);
      indexVoices();
    });
    const update = (state) => {
      watch();
      account.update(state);
      outOfChat(node, state);
      me = state.session?.identity.participant || "";
      if (state.audience.version !== heard) {
        heard = state.audience.version;
        audience = state.audience.list;
        speakers = new Set(appSpeakers(audience).map((p) => p.login.toLowerCase()));
        if (panel) for (const row of panel.rows.values()) panel.showOnline(row);
        indexVoices();
      }
      if (state.voice !== voice) { voice = state.voice; paintVoices(); }
    };
    const dispose = () => {
      clearInterval(timer);
      off();
      stopPortraits();
      panel?.dispose();
      account.dispose();
      node.remove();
    };
    return { node, update, dispose };
  };
  // The Commons: the island's one conversation, its log and composer the island's own (commons-log.js), the lines this
  // page has heard since it signed in shown when the tab first opens.
  const commons = (ctx) => {
    const { model } = ctx.commons;
    const { header, chip } = panelHead("The Commons");
    const log = make("ol", "chat-log slab");
    log.setAttribute("role", "log");
    log.setAttribute("aria-live", "off");
    log.setAttribute("aria-label", "The Commons");
    log.tabIndex = 0;
    const statusText = make("span", ""), status = make("p", "help chat-status", statusText);
    const announcement = make("span", "chat-announcement");
    announcement.setAttribute("role", "status");
    announcement.setAttribute("aria-live", "polite");
    announcement.setAttribute("aria-atomic", "true");
    const input = make("input", "");
    Object.assign(input, { type: "text", maxLength: 320, enterKeyHint: "send", spellcheck: true, disabled: true, autocomplete: "off" });
    input.setAttribute("aria-label", "Say something to everyone on the island");
    const left = make("span", "chat-left", String(BL.chatPolicy.MAX));
    left.title = "Characters left";
    const send = make("button", "chat-send", "Send");
    send.type = "submit";
    send.disabled = true;
    const form = make("form", "chat-form", make("span", "chat-field", input, left), send);
    form.autocomplete = "off";
    // The name field at its top, as the island's Commons has it (index.html `chat-identity`, chat.js): the account's island
    // display name, shown to members only, saved through the edge to the island (`ctx.commons.rename`).
    const nameInput = make("input", "");
    Object.assign(nameInput, { id: "oc-commons-name", type: "text", minLength: 3, maxLength: 24, autocomplete: "off", disabled: true });
    nameInput.setAttribute("aria-describedby", "oc-commons-name-status");
    const nameLabel = make("label", "", "Name");
    nameLabel.htmlFor = nameInput.id;
    const nameSave = make("button", "chat-display-save", "Save");
    nameSave.type = "submit";
    nameSave.disabled = true;
    const nameForm = make("form", "chat-display-form", nameLabel, nameInput, nameSave);
    nameForm.autocomplete = "off";
    const nameStatus = make("p", "chat-display-status");
    nameStatus.id = "oc-commons-name-status";
    nameStatus.setAttribute("role", "status");
    nameStatus.setAttribute("aria-live", "polite");
    const identity = make("div", "chat-identity", nameForm, nameStatus);
    identity.hidden = true;
    let nameShown = "", nameSaving = false, nameComposing = false;
    // While the Commons joins again (after a save) the last name stays shown, off until the welcome comes back.
    const showName = () => {
      const you = model.state.you;
      if (you) {
        const display = you.display || you.login;
        if (display !== nameShown) { nameInput.value = display; if (!nameSaving) nameStatus.textContent = ""; }
        nameShown = display;
      }
      identity.hidden = !you && !nameShown;
      nameInput.disabled = nameSave.disabled = !you || nameSaving;
    };
    nameForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!model.state.you || nameSaving || nameComposing) return;
      const login = model.state.you.login, clean = nameInput.value.replace(/\s+/g, " ").trim();
      if (clean.length < 3 || clean.length > 24 || /[^\w .,!?'@#:-]/.test(clean)) {
        nameStatus.textContent = "Use 3–24 letters A–Z, digits, spaces or _ . , ! ? ' @ # : -";
        return;
      }
      nameSaving = true;
      nameInput.disabled = nameSave.disabled = true;
      nameStatus.textContent = "Saving display name…";
      let result;
      try { result = await ctx.commons.rename(clean); } catch { result = { ok: false }; }
      nameSaving = false;
      if (result.ok) nameInput.value = nameShown = result.display;
      showName();
      if (result.ok || model.state.you?.login === login) nameStatus.textContent = result.ok ? "Display name saved." : result.error || "Could not save display name. Try again.";
    });
    nameInput.addEventListener("compositionstart", () => { nameComposing = true; });
    nameInput.addEventListener("compositionend", () => { nameComposing = false; });
    nameInput.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229 || nameComposing) return;
      if (event.key === "Escape") { event.preventDefault(); document.getElementById("oc-tab-commons")?.focus({ preventScroll: true }); }
    });
    const account = accountRow(ctx);
    const node = make("section", "panel oc-panel oc-commons", header, identity, log, status, announcement, form, account.node);
    node.dataset.panel = "chat";
    const conversation = BL.commonsLog.create({ log, form, input, left, send, status, statusText, announcement },
      { keep: BL.oogaChatCommons.KEEP, send: (text, clientId) => ctx.commons.send({ t: "chat", text, clientId }), unicode: () => model.state.unicode,
        escape: () => document.getElementById("oc-tab-commons")?.focus({ preventScroll: true }) });
    conversation.heard(model.state.lines, true);
    let shown = "", last = null;
    const off = model.subscribe((kind, a, b) => {
      if (kind === "lines") conversation.heard(a, b);
      else if (kind === "receipt") conversation.heard([], false, a);
      else if (kind === "welcome" && !model.state.you) conversation.clear();
      if (kind === "welcome") showName();
      if ((kind === "welcome" || kind === "players") && last) update(last);
    });
    const watch = onShown(node, () => conversation.show(!node.closest("[hidden]")));
    const update = (state) => {
      last = state;
      watch();
      account.update(state);
      showName();
      const socket = state.commons.status, live = socket === "live" && !!model.state.you;
      const words = live && !model.state.send ? COMMONS_WORDS["read-only"] : COMMONS_WORDS[socket] || "";
      const count = onlineCount(model, publicOf(state), !!state.room), key = `${socket}|${live}|${model.state.send}|${model.state.you?.login}|${count}`;
      if (key === shown) return;
      shown = key;
      chip.textContent = commonsChip(socket, model, publicOf(state), !!state.room);
      chip.dataset.tone = live ? "live" : socket === "closed" ? "closed" : "idle";
      conversation.setLive({ live: live && model.state.send, me: model.state.you?.login || "", words });
    };
    const dispose = () => {
      off();
      account.dispose();
      node.remove();
    };
    return { node, update, dispose };
  };
  // Online Oogas: everyone on the island now, grouped by where they are (zone-map.js, as the island's tab groups them),
  // with their raised hand and whether they are in voice, and the member's own row first: in their island group while
  // their Ooga is there, else under Ooga Chat. Presence without positions: no distance or crosshair, which are the
  // island's alone. No voice link: Ooga Chat's voice is a hosted chat's, which a link never reaches (the island's
  // `outdoor` route that carried linked voices is off), so the links stay the island's own. Main Island's Ooga Chat
  // listeners follow its players in gray. Mic marks and Volume share the audience's local listening choices.
  const online = (ctx) => {
    const { model } = ctx.commons;
    const APP = "ooga-chat";
    const { header, chip } = panelHead("Online Oogas");
    const muteDuels = make("input", "");
    muteDuels.type = "checkbox";
    muteDuels.id = "oc-mute-duels";
    muteDuels.setAttribute("aria-describedby", "oc-mute-duels-help");
    muteDuels.addEventListener("change", () => ctx.media.setMuteDuels(muteDuels.checked));
    const duelHelp = make("p", "help", "Until their duel ends. Your own duel pair is exempt.", make("br", ""), "Manual mute and volume choices stay unchanged.");
    duelHelp.id = "oc-mute-duels-help";
    const settings = make("details", "players-settings", make("summary", "", "Advanced settings"),
      make("div", "players-settings-content", make("label", "players-speak", muteDuels, " Automatically mute duelists"), duelHelp));
    const list = make("div", "players slab oc-players"), note = make("p", "help players-status");
    const mics = [], expanded = new Set();
    const micClick = (event) => {
      const el = event.target.closest(".roster-voice");
      if (!el || el.disabled) return;
      if (event.detail) el.blur();
      pressMic(ctx, el.dataset.participant, el.dataset.self === "true");
    };
    list.addEventListener("click", micClick);
    const account = accountRow(ctx);
    // The emoji panel under the list, as the island's Online Oogas has it.
    const reactions = make("div", "reactions");
    const node = make("section", "panel oc-panel oc-online", header, settings, list, note, make("div", "panel-foot", reactions, account.node));
    node.dataset.panel = "players";
    ctx.reactions.bars.mount(reactions, { handAllowed: () => ctx.media.state.role === "speaker" });
    // A row as the island's players.js makes one (the dots, the name, the hand's column, the voice mark), less the link,
    // the crosshair and the distance, which only the island offers. An Ooga Chat speaker's dot is purple.
    const row = (r) => {
      const p = r.p, dots = make("span", "roster-dots"), presence = make("span", "roster-presence"), host = make("span", "roster-host");
      // The visitor's own row is Ooga Chat's purple too: they are here, in Ooga Chat.
      presence.dataset.online = r.cloud || r.self ? "cloud" : "true";
      presence.setAttribute("role", "img");
      presence.setAttribute("aria-label", r.cloud ? "Speaking from Ooga Chat" : r.self ? "Online in Ooga Chat" : "Online");
      presence.title = presence.getAttribute("aria-label");
      host.hidden = true;
      dots.append(presence, host);
      const label = make("span", "roster-label", p.display);
      label.title = `@${p.login}`;
      const hand = p.hand ? p.handEmoji || BL.reactionPolicy.HANDS[p.handTone || 0] : "";
      const raised = make("span", "players-hand", hand);
      raised.hidden = !hand;
      raised.setAttribute("role", "img");
      raised.setAttribute("aria-label", hand && BL.reactionPolicy.HANDS.includes(hand) ? "Hand raised" : `Pinned emoji ${hand}`);
      const voice = make("button", "roster-voice", BL.nativeIcons.voice());
      voice.type = "button";
      if (r.listener || r.app) {
        const words = r.app ? r.speaking ? "Speaking in Ooga Chat" : "In Ooga Chat" : "Listening in Ooga Chat";
        presence.dataset.online = r.app ? "cloud" : "listener";
        presence.setAttribute("aria-label", words);
        presence.title = words;
        return make("li", r.app ? "" : "players-listener", dots, make("span", "players-name", label));
      }
      const participant = r.cloud ? r.audience : playerVoice(p);
      const control = r.self ? null : volumeControl(ctx), toggle = r.self ? null : button("roster-name players-name-toggle", "");
      const key = `${r.cloud ? "app" : "world"}:${participant.id}`;
      if (control) {
        control.select(participant);
        control.node.hidden = !expanded.has(key);
        toggle.append(label);
        attr(toggle, "aria-controls", control.node.id);
        attr(toggle, "aria-expanded", String(!control.node.hidden));
        toggle.addEventListener("click", () => {
          const open = control.node.hidden;
          control.node.hidden = !open;
          attr(toggle, "aria-expanded", String(open));
          if (open) expanded.add(key); else expanded.delete(key);
        });
      }
      mics.push({ el: voice, p: participant, self: r.self, key, control, toggle });
      paintMic(ctx, voice, participant, r.self);
      const marks = make("span", "roster-marks", voice);
      const li = make("li", "", dots, make("span", "players-name", toggle || label), make("span", "players-mark", raised), marks);
      if (control) li.append(control.node);
      if (r.self) li.dataset.self = "true";
      return li;
    };
    const draw = () => {
      if (node.closest("[hidden]")) return;
      const active = document.activeElement, held = mics.find((m) => m.control?.slider === active || m.toggle === active);
      const heldSlider = !!held && held.control?.slider === active;
      mics.length = 0;
      const you = model.state.you, rows = [];
      for (const p of model.state.players.values()) rows.push({ id: p.id, name: p.display, group: BL.zoneMap.groupOf(p.zone), self: !!you && p.id === you.id, p });
      // Ooga Chat's speakers sit on Main Island's clouds, so they are listed with the island's own, as the island lists
      // them: a row of their own with a purple dot, the member's own included while they speak.
      let speaking = false;
      for (const a of cloud) {
        const self = a.id === me;
        speaking = speaking || self;
        rows.push({ id: a.id, name: a.display, group: BL.zoneMap.groupOf("outside"), self, cloud: true, audience: a,
          p: { login: a.login, display: a.display, hand: !!a.hand, handEmoji: a.hand, voice: true, muted: a.muted } });
      }
      if (you && !speaking && !model.state.players.has(you.id)) rows.push({ id: you.id, name: you.display, group: APP, self: true, p: { ...you, hand: false, voice: false, muted: false } });
      // Everyone else in hosted chats through Ooga Chat and not on the island (the room's `chat-people`), under Ooga Chat
      // with its purple dot, as the island's Online Oogas lists them; anyone listed already is listed once.
      for (const q of model.state.chatPeople) {
        const account = q.id.startsWith("gh:") ? Number(q.id.slice(3)) : 0;
        if (q.id === me || account && (model.state.players.has(account) || you && account === you.id) || cloud.some((a) => a.id === q.id)) continue;
        rows.push({ id: -Number(q.id.slice(q.id.indexOf(":") + 1)), name: q.display, group: APP, app: true, speaking: q.speaking, p: { login: q.login, display: q.display } });
      }
      // Main Island's listeners in Ooga Chat, but the member and anyone also on the island, who are listed once.
      for (const a of appListeners(model, audience)) {
        rows.push({ id: -Number(a.id.slice(a.id.indexOf(":") + 1)), name: a.display, group: BL.zoneMap.groupOf("outside"), listener: true,
          p: { login: a.login, display: a.display } });
      }
      const mine = rows.find((r) => r.self)?.group || null;
      BL.zoneMap.arrange(rows, mine);
      const groups = [];
      for (const r of rows) {
        if (!groups.length || groups.at(-1).key !== r.group) {
          const head = make("h3", "section-head", r.group === APP ? "Ooga Chat" : BL.zoneMap.heading(r.group)), ul = make("ul", "players-rows");
          ul.setAttribute("aria-label", head.textContent);
          groups.push({ key: r.group, section: make("section", "players-group", head, ul), ul });
        }
        groups.at(-1).ul.append(row(r));
      }
      list.replaceChildren(...groups.map((g) => g.section));
      for (const key of expanded) if (!mics.some((m) => m.key === key)) expanded.delete(key);
      if (held) {
        const next = mics.find((m) => m.key === held.key);
        (heldSlider ? next?.control?.slider : next?.toggle)?.focus({ preventScroll: true });
      }
    };
    let status = "off", cloud = [], audience = null, me = "", heard = -1, voice = null, inChat = false;
    const off = model.subscribe((kind) => { if (kind === "players" || kind === "welcome") { draw(); paint(); } });
    const watch = onShown(node, draw);
    const paint = () => {
      const live = status === "live" && !!model.state.you;
      chip.textContent = commonsChip(status, model, audience, inChat);
      chip.dataset.tone = live ? "live" : status === "closed" ? "closed" : "idle";
      note.textContent = live ? "" : COMMONS_WORDS[status] || "";
      note.hidden = !note.textContent;
      // While live the list always holds at least the member's own row.
      list.hidden = !live;
    };
    const update = (state) => {
      watch();
      account.update(state);
      outOfChat(node, state);
      if (!!state.room !== inChat) { inChat = !!state.room; paint(); }
      muteDuels.checked = state.voice.muteDuels;
      muteDuels.disabled = !state.session;
      if (state.audience.version !== heard) {
        heard = state.audience.version;
        audience = publicOf(state);
        cloud = audience ? appSpeakers(audience.list) : [];
        me = state.session ? state.session.identity.participant : "";
        draw();
        paint();
      }
      if (state.voice !== voice) {
        voice = state.voice;
        for (const mark of mics) {
          paintMic(ctx, mark.el, mark.p, mark.self);
          mark.control?.refresh();
        }
      }
      if (state.commons.status === status) return;
      status = state.commons.status;
      paint();
    };
    const dispose = () => {
      off();
      account.dispose();
      list.removeEventListener("click", micClick);
      mics.length = 0;
      expanded.clear();
      node.remove();
    };
    return { node, update, dispose };
  };  Object.assign(BL.oogaChatViews, { roster: rosterView, commons, online });
})();
