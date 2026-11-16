// Ooga Chat's views, each `view(ctx)` returning `{ node, update(state), dispose() }` for ooga-chat-shell.js. `ctx`
// carries `actions` (`signIn(provider)`, `signOut()`, `retry()`, `joinVoice()`, `leaveVoice()`, `mute()`, `retryVoice()`,
// `zone(id)`) and `media`, the voice controller (ooga-chat-media.js); `state` is `{ mode, boot, session, auth, notice, busy, zone, voice, audience, commons }`
// (docs/ooga-chat-app.md), where `mode` is loading, live, unavailable or stale and `auth` is ooga-chat-auth.js's. Every
// tab is the island's own panel (#656), in its markup and its rules: `chat` is the Ooga Chat tab, sign-in or the island's
// Ooga Chat panel with its footer; `bananas`, `roster`, `commons` and `online` are Bananas, Contributing Oogas, The Commons
// and Online Oogas, the last three with the island's account row at their foot. `pending(title)` stands in for a panel
// not built yet; it says so instead of showing invented data.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { letter } = BL.signGlyphs;
  // A small builder: tag, class, then text or child nodes.
  const make = (tag, className, ...children) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    for (const child of children) el.append(child);
    return el;
  };
  const button = (className, text) => {
    const el = make("button", className, text);
    el.type = "button";
    return el;
  };
  const STATUS = {
    loading: "Opening Ooga Chat…",
    unavailable: "Ooga Chat can't reach its service from here right now.",
    stale: "This page is older than Ooga Chat's service."
  };
  const OFFLINE = "You're offline. Ooga Chat reconnects when you're back.";
  // Join Voice while not speaking (ooga-chat-media.js's state): its words while joining or leaving, whether it can be
  // pressed, and why not, or what the last attempt said (a blocked microphone, a full zone).
  const joining = (state, allowed, media) => {
    const voice = state.voice, why = !state.device.online ? OFFLINE : allowed.why || (media.available ? voice.notice : media.why || "Voice opens here soon.");
    return { words: voice.phase === "leaving" ? "Leaving…" : voice.busy ? "Joining…" : "",
      disabled: !allowed.joinVoice || !media.available || !!state.busy || voice.busy || !state.device.online, why };
  };
  const PROVIDERS = { github: ["Continue with GitHub", "Opening GitHub…", "GitHub sign-in is unavailable"], x: ["Continue with X", "Opening X…", "X sign-in is unavailable"] };
  const { gates } = BL.oogaChatAuth;
  // A visually hidden explanation a control names with aria-describedby.
  let described = 0;
  const explain = (control) => {
    const note = make("span", "oc-sr");
    note.id = `oc-why-${++described}`;
    control.setAttribute("aria-describedby", note.id);
    return note;
  };
  // The notice line: an expired sign-in, a failed check or sign-in, an unconfirmed sign-out, with its retry.
  const notice = (actions, signal) => {
    const text = make("span", ""), retry = button("link", "");
    retry.addEventListener("click", () => actions.retry(), { signal });
    const el = make("p", "oc-notice", text, retry);
    el.setAttribute("role", "alert");
    const update = (value, busy) => {
      el.hidden = !value;
      if (!value) return;
      if (text.textContent !== value.text) text.textContent = value.text;
      retry.textContent = value.action || "";
      retry.hidden = !value.action;
      retry.disabled = !!busy;
    };
    return { el, update };
  };
  // Writes a property or an attribute only when it changes, as the island's panels do.
  const set = (el, key, value) => { if (el[key] !== value) el[key] = value; };
  const attr = (el, key, value) => { if (el.getAttribute(key) !== value) el.setAttribute(key, value); };
  // The Ooga Chat tab, laid out as the island's Ooga Chat panel (cloud-panel.js) in its markup and its own rules
  // (scripts/ooga-chat.mjs ISLAND_RULES): the carved title, then sign-in while signed out, or the space while signed in.
  // Every sign-in lands here as a listener.
  const chat = (ctx) => {
    const { actions } = ctx;
    const listeners = new AbortController(), { signal } = listeners;
    const art = make("img", "oc-art");
    art.src = "art/sign-in-island.webp";
    art.width = 1005;
    art.height = 670;
    art.alt = "Cavemen on clouds above a floating island, round a pile of bananas";
    art.decoding = "async";
    // Lazy and hidden until the session answers, so a signed-in visit, which never shows it, never fetches it.
    art.loading = "lazy";
    const status = make("span", "oc-status");
    status.setAttribute("role", "status");
    const reload = button("oc-reload link", "Reload");
    reload.addEventListener("click", () => location.reload(), { signal });
    const again = button("oc-retry link", "Try again");
    again.addEventListener("click", () => actions.retry(), { signal });
    const line = make("p", "help oc-status-line", status, reload, again);
    const alert = notice(actions, signal);
    const providers = Object.fromEntries(Object.keys(PROVIDERS).map((provider) => {
      const el = button("oc-provider", PROVIDERS[provider][0]);
      el.dataset.provider = provider;
      el.addEventListener("click", () => actions.signIn(provider), { signal });
      return [provider, el];
    }));
    const signedOut = make("div", "slab oc-slab oc-signin",
      art,
      make("p", "oc-lede", "Listen to the island.", make("br"), "Speak from the clouds."),
      make("div", "oc-providers", providers.github, providers.x),
      make("div", "oc-note", make("strong", "", "Everyone can listen."),
        make("span", "", "Team Ooga Booga contributors signed in with GitHub can also speak from a cloud.")),
      make("p", "oc-foot", "X accounts join as listeners."));
    const space = audience(ctx);
    // The tag in the title's corner names the one zone the space shows for now, as the island's panel does.
    const head = panelHead("Ooga Chat");
    const node = make("section", "panel oc-panel oc-chat", head.header, line, alert.el, signedOut, ...space.nodes);
    node.dataset.panel = "cloud";
    node.dataset.space = "off";
    let principal = null, refocus = false;
    const update = (state) => {
      const { mode, boot, session, auth, notice: shown, busy } = state;
      const live = mode === "live", who = live && session;
      // Sign-in shows once signed out is known: loading and the session check show only the title and status. Signing
      // out keeps the space's footer, which says so, until the server confirms.
      signedOut.hidden = !!who || mode === "loading" || live && auth === "checking";
      node.dataset.space = who ? "on" : busy === "signout" ? "foot" : "off";
      set(head.chip, "textContent", who ? ZONE_NAMES[state.zone] : "");
      let words = STATUS[mode] || "";
      if (live && auth === "checking") words = "Checking your sign-in…";
      if (live && boot.newer) words = "A newer Ooga Chat is out.";
      if (!state.device.online) words = OFFLINE;
      set(status, "textContent", words);
      line.hidden = !words;
      reload.hidden = mode !== "stale" && !(live && boot.newer);
      again.hidden = mode !== "unavailable";
      alert.update(live ? shown : null, busy);
      for (const [provider, el] of Object.entries(providers)) {
        const on = live && boot.features[provider], [label, opening, off] = PROVIDERS[provider];
        el.disabled = !on || auth === "checking" || !!busy || !state.device.online;
        el.textContent = busy === provider ? opening : on || !live ? label : off;
        el.setAttribute("aria-busy", String(busy === provider));
      }
      space.update(state);
      // Focus follows the account: into the space on signing in, onto the first way back in on leaving it, and only
      // when the control that held it went away.
      const lost = !node.ownerDocument.activeElement || node.ownerDocument.activeElement === node.ownerDocument.body;
      const was = principal;
      if (!who) {
        if (was) refocus = true;
        principal = null;
        const first = Object.values(providers).find((el) => !el.disabled);
        if (refocus && first) {
          refocus = false;
          if (lost) first.focus();
        }
        return;
      }
      refocus = false;
      principal = session.identity.principal;
      if (was !== principal && lost) space.focus();
    };
    const dispose = () => {
      listeners.abort();
      space.dispose();
      node.remove();
    };
    return { node, update, dispose };
  };
  // The space a signed-in account listens in, as the island's panel draws it: a status line only
  // when the list is not simply live (or is empty), one roster of circles of everyone the server reports there,
  // speakers first (ooga-chat-roster.js orders it; audience-tiles.js draws it, as on the island), scrolling in its slab,
  // the reactions slot (#655 fills it) and the footer. A tile's portrait is the server's same-origin picture, else the
  // island's Ooga face; the visitor's own microphone mutes them while they speak.
  const ZONE_NAMES = { main: "Main Island", dsb: "DSB Land" };
  const HEARD = {
    connecting: () => "Connecting…",
    joining: (zone) => `Joining ${ZONE_NAMES[zone]}…`,
    reconnecting: () => "Reconnecting… this list may be out of date.",
    full: (zone) => `${ZONE_NAMES[zone]} is full right now. Ooga Chat will try again.`,
    closed: () => "Listening is off right now. Ooga Chat will try again in a few minutes.",
    unavailable: () => "Live audio isn't open here yet.",
    stale: () => "This page is older than Ooga Chat's service. Reload to keep listening."
  };
  const VOICE_WORDS = { on: "In voice", speaking: "Speaking", muted: "Muted their microphone" };
  // The visitor stands in the zone they picked: their own circle, a listener, while the server's list doesn't hold them
  // (listening off, connecting, or no snapshot yet), first among the listeners as the roster orders them. The server's
  // own row for them, keyed by the same participant id, takes its place once it comes.
  const withSelf = (list, identity) => {
    if (!identity.participant || list.some((p) => p.id === identity.participant)) return list;
    const me = { id: identity.participant, role: "listener", source: "app", login: identity.login, display: identity.display || identity.login, face: identity.avatar,
      muted: false, hand: "" };
    const at = list.findIndex((p) => p.role === "listener");
    return at < 0 ? [...list, me] : [...list.slice(0, at), me, ...list.slice(at)];
  };
  const audience = (ctx) => {
    const { actions } = ctx;
    const listeners = new AbortController(), { signal } = listeners;
    // A receiver that gave up offers its own retry here, beside what the line says.
    const retryVoice = button("link", "Try again");
    retryVoice.hidden = true;
    retryVoice.addEventListener("click", () => actions.retryVoice(), { signal });
    const statusText = make("span", ""), heard = make("p", "help cloud-status", statusText, retryVoice);
    heard.setAttribute("role", "status");
    heard.setAttribute("aria-live", "polite");
    heard.hidden = true;
    const list = make("ul", "cloud-roster slab");
    list.setAttribute("aria-label", "Speakers and listeners");
    // The emoji panel (reaction-bar.js, the island's own, #655) left of the account controls where there is room and above
    // them where not, as the design has it; its hand is an active speaker's alone.
    const reactions = make("div", "reactions");
    const foot = cloudFoot(ctx), footRow = make("div", "oc-chat-foot", reactions, foot.node);
    ctx.reactions.bars.mount(reactions, { handAllowed: () => !!voice && voice.role === "speaker" });
    const offPop = ctx.reactions.onPop((id, emoji) => tiles.pop(id, emoji));
    let version = -1, frame = 0, self = null, voice = null, people = [];
    // An Ooga's face from the face sheet (art/ooga-faces.png, ooga-chat-faces.js), cut once a handle and kept as a
    // data URL, for anyone the server names a character for and gives no picture: an island speaker's own Ooga. The
    // tiles draw again once the sheet has loaded.
    const faces = BL.oogaChatFaces, sheetFaces = new Map();
    let sheet = null;
    const sheetFace = (handle) => {
      if (!handle) return "";
      const key = handle.toLowerCase();
      if (sheetFaces.has(key)) return sheetFaces.get(key);
      if (!sheet) {
        sheet = new Image();
        sheet.addEventListener("load", () => { if (!frame) frame = requestAnimationFrame(render); }, { once: true, signal: listeners.signal });
        sheet.src = "art/ooga-faces.png";
      }
      if (!sheet.complete || !sheet.naturalWidth) return "";
      const i = faces.cells[key] ?? faces.fallback, size = faces.size, canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      canvas.getContext("2d").drawImage(sheet, (i % faces.columns) * size, Math.floor(i / faces.columns) * size, size, size, 0, 0, size, size);
      const url = canvas.toDataURL("image/png");
      sheetFaces.set(key, url);
      return url;
    };
    const describe = (p, t) => {
      // A speaker's mark lights while this page hears them speak, as Online Oogas does on the island: the visitor's own
      // from their microphone's meter (ooga-chat-media.js `speaking`, alone or not), anyone else's from their voice's
      // (`talking`).
      const speaker = p.role === "speaker", you = p.id === self;
      const look = !speaker ? "" : p.muted ? "muted" : (you ? voice.speaking : voice.talking.includes(p.id)) ? "speaking" : "on";
      t.id = p.id; t.display = p.display; t.role = p.role; t.source = !speaker ? "" : p.source === "world" ? "world" : "chat";
      t.face = p.face || sheetFace(p.character); t.look = look; t.hand = p.hand || ""; t.self = you; t.micPressed = false;
      t.micDisabled = !you || voice.role !== "speaker";
      t.micWords = !speaker ? "" : `${p.display}: ${you ? look === "muted" ? "Your microphone is muted: click to unmute" : "Your microphone: click to mute" : VOICE_WORDS[look]}`;
    };
    // A speaker's voice mark: the visitor's own works their microphone; anyone else's will mute that voice for this
    // visitor once Ooga Chat plays them (#661).
    const tiles = BL.audienceTiles.create(list, { mic: (id) => { if (id === self) actions.mute(); } });
    const render = () => {
      frame = 0;
      tiles.draw(people, describe);
    };
    const update = (state) => {
      foot.update(state);
      if (!state.session) return;
      const { audience: now, zone } = state;
      // The feed's state first; then voice's (playback the browser held back, a receiver that gave up, what the last try
      // to speak said); then an empty zone.
      const failed = now.status === "live" && state.voice.phase === "failed";
      const words = HEARD[now.status]?.(zone) || (now.status !== "live" ? "" : state.voice.blocked ? "Tap anywhere to hear this zone."
        : failed ? "Can't hear this zone right now. " : state.voice.notice || (!now.list.length ? "Nobody is here yet." : ""));
      set(statusText, "textContent", words);
      set(retryVoice, "hidden", !failed);
      set(heard, "hidden", !words);
      const who = state.session.identity.participant, moved = who !== self, mics = moved || state.voice !== voice, role = voice && voice.role;
      self = who;
      voice = state.voice;
      if (voice.role !== role) ctx.reactions.bars.refresh();
      if (now.version !== version || moved) {
        version = now.version;
        people = withSelf(now.list, state.session.identity);
        if (!frame) frame = requestAnimationFrame(render);
      } else if (mics && !frame) tiles.repaint(describe);
    };
    const focus = () => foot.focus();
    const dispose = () => {
      listeners.abort();
      cancelAnimationFrame(frame);
      offPop();
      tiles.dispose();
      foot.dispose();
    };
    return { nodes: [heard, list, footRow], update, focus, dispose };
  };
  // The Ooga Chat panel's footer, the island's: the visitor's name (a purple dot only while speaking from Ooga Chat), the
  // fixed-width microphone, always first and off for a listener, Join Voice for a listener the server allows to speak
  // (Leave Voice for a speaker), and Sign out. A disabled button says why on itself. The voice state is the seam's
  // (`state.voice`); nothing here opens a microphone.
  // A microphone button's colour (style.css `data-mic`): green on Mute while the microphone is live, red on an enabled
  // Unmute, none while it is disabled or not a microphone button.
  const micLook = (el, on, muted) => {
    const look = on ? muted ? "muted" : "live" : "";
    if (el.dataset.mic !== look) el.dataset.mic = look;
  };
  const cloudFoot = ({ actions, media }) => {
    const listeners = new AbortController(), { signal } = listeners;
    const name = make("span", "cloud-foot-name");
    const mute = button("foot-button cloud-mute", "Unmute"), join = button("foot-button cloud-voice", "Join Voice"), out = button("link", "Sign out");
    const muteWhy = explain(mute), joinWhy = explain(join);
    mute.setAttribute("aria-pressed", "false");
    mute.addEventListener("click", (event) => {
      if (event.detail) mute.blur();
      actions.mute();
    }, { signal });
    join.addEventListener("click", (event) => {
      if (event.detail) join.blur();
      if (join.dataset.voice === "speaker") actions.leaveVoice();
      else actions.joinVoice();
    }, { signal });
    out.addEventListener("click", () => actions.signOut(), { signal });
    const node = make("div", "cloud-foot", name, make("span", "cloud-foot-actions", mute, join, out), muteWhy, joinWhy);
    const update = (state) => {
      set(out, "textContent", state.busy === "signout" ? "Signing out…" : "Sign out");
      set(out, "disabled", !!state.busy);
      const who = state.mode === "live" && state.session;
      if (!who) return;
      set(name, "textContent", who.identity.display);
      const speaker = state.voice.role === "speaker", allowed = gates(state, Date.now());
      const source = speaker ? "chat" : "";
      if (name.dataset.source !== source) name.dataset.source = source;
      set(mute, "disabled", !speaker || !!state.busy || state.voice.busy);
      set(mute, "textContent", speaker && !state.voice.muted ? "Mute" : "Unmute");
      attr(mute, "aria-pressed", String(speaker && state.voice.muted));
      micLook(mute, !mute.disabled && speaker, state.voice.muted);
      set(muteWhy, "textContent", speaker ? "" : "Join voice first to unmute.");
      const going = joining(state, allowed, media);
      join.dataset.voice = speaker ? "speaker" : "listener";
      set(join, "textContent", speaker ? "Leave Voice" : going.words || "Join Voice");
      set(join, "disabled", speaker ? !!state.busy : going.disabled);
      const why = speaker ? "" : going.why;
      set(joinWhy, "textContent", why);
      set(join, "title", why);
    };
    const dispose = () => listeners.abort();
    // Where focus lands on signing in: the first of the footer's buttons that can be pressed.
    const focus = () => [mute, join, out].find((el) => !el.disabled).focus();
    return { node, update, focus, dispose };
  };
  // The account row the island keeps at the foot of Contributing Oogas, Online Oogas and The Commons (hud.js
  // `showAccount`): while signed out, the sign-in screen's own Continue with GitHub (the design's sign-in button, in
  // place of the island's Contributor sign-in), else the name (a green dot while The Commons is live, with how many are
  // on the island), Join voice (Mute or Unmute once speaking), Leave voice and Sign out.
  const accountRow = ({ actions, media, commons: { model } }) => {
    const listeners = new AbortController(), { signal } = listeners;
    const login = button("oc-provider oc-account-signin", PROVIDERS.github[0]);
    login.dataset.provider = "github";
    login.title = "Contributors can sign in with GitHub to speak from a cloud.";
    login.addEventListener("click", () => actions.signIn("github"), { signal });
    const name = make("span", "account-name"), room = make("span", "account-room");
    const voice = button("foot-button", "Join voice"), leave = button("foot-button", "Leave voice"), out = button("link", "Sign out");
    const voiceWhy = explain(voice);
    voice.setAttribute("aria-pressed", "false");
    voice.addEventListener("click", (event) => {
      if (event.detail) voice.blur();
      if (last?.voice.role === "speaker") actions.mute();
      else actions.joinVoice();
    }, { signal });
    leave.addEventListener("click", () => actions.leaveVoice(), { signal });
    out.addEventListener("click", () => actions.signOut(), { signal });
    const node = make("div", "account", login, make("span", "account-who", name, room), make("span", "account-actions", voice, leave, out), voiceWhy);
    let last = null;
    const update = (state) => {
      last = state;
      const live = state.mode === "live", who = live && state.session, signing = state.busy === "signout";
      set(login, "hidden", !!who || signing || !live || !state.boot.features.github);
      set(login, "disabled", !!state.busy || !state.device.online || state.auth === "checking");
      set(login, "textContent", state.busy === "github" ? PROVIDERS.github[1] : PROVIDERS.github[0]);
      attr(login, "aria-busy", String(state.busy === "github"));
      set(node, "hidden", !live || !who && !signing && login.hidden);
      set(name, "hidden", !who);
      set(out, "hidden", !who && !signing);
      set(out, "textContent", signing ? "Signing out…" : "Sign out");
      set(out, "disabled", !!state.busy);
      const here = !!who && state.commons.status === "live" && !!model.state.you;
      set(room, "textContent", here ? `${onlineCount(model)} online` : "");
      set(room, "hidden", !here);
      if (node.dataset.live !== String(here)) node.dataset.live = String(here);
      if (!who) {
        set(voice, "hidden", true);
        set(leave, "hidden", true);
        return;
      }
      set(name, "textContent", who.identity.display);
      const speaker = state.voice.role === "speaker", allowed = gates(state, Date.now()), join = joining(state, allowed, media);
      set(voice, "hidden", false);
      set(voice, "textContent", speaker ? state.voice.muted ? "Unmute" : "Mute" : join.words || "Join voice");
      set(voice, "disabled", speaker ? !!state.busy : join.disabled);
      attr(voice, "aria-pressed", String(speaker && !state.voice.muted));
      micLook(voice, !voice.disabled && speaker, state.voice.muted);
      const why = speaker ? "" : join.why;
      set(voiceWhy, "textContent", why);
      set(voice, "title", why);
      set(leave, "hidden", !speaker);
    };
    const off = model.subscribe((kind) => { if (last && (kind === "players" || kind === "welcome")) update(last); });
    const dispose = () => {
      listeners.abort();
      off();
    };
    return { node, update, dispose };
  };
  // Under the frame: install help the browser actually offers (its own prompt, or Safari's Share menu), and a waiting
  // update, which never reloads by itself and waits while the visitor speaks.
  const device = ({ install, reload }) => {
    const listeners = new AbortController(), { signal } = listeners;
    const offer = button("link", "Install Ooga Chat"), hint = make("span", "", "To install Ooga Chat, tap Share, then Add to Home Screen.");
    const fresh = make("span", ""), take = button("link", "Reload");
    offer.addEventListener("click", () => install(), { signal });
    take.addEventListener("click", () => reload(), { signal });
    const installLine = make("p", "oc-device-line", offer, hint), updateLine = make("p", "oc-device-line", fresh, take);
    updateLine.setAttribute("role", "status");
    const node = make("div", "oc-device", updateLine, installLine);
    const update = (state) => {
      const { install: way, update: waiting } = state.device, speaking = state.voice.role === "speaker";
      offer.hidden = way !== "prompt";
      hint.hidden = way !== "ios";
      installLine.hidden = !way;
      updateLine.hidden = !waiting;
      const words = speaking ? "A newer Ooga Chat is ready. Reload once you've left voice." : "A newer Ooga Chat is ready.";
      if (fresh.textContent !== words) fresh.textContent = words;
      take.disabled = speaking;
      node.hidden = installLine.hidden && updateLine.hidden;
    };
    const dispose = () => {
      listeners.abort();
      node.remove();
    };
    return { node, update, dispose };
  };
  // The Bananas tab (#656): the island's own panel (banana-panel.js, native.css), filled from donations.js over this
  // origin's /donations relay while the service's feed is live (the app subscribes, ooga-chat-app.js), or on the
  // fixture entry alone from its labelled demo (`ctx.demo`). With no feed (off, loading or unreachable) it says
  // donations aren't open here, never zeros or a demo, and Feed the Oogas, the island's own popup (`ctx.feed`), shows
  // only while they are. The panel's price is the tally's, so it is shown afresh whenever the tab is opened.
  const bananas = (ctx) => {
    const node = make("section", "panel oc-panel oc-bananas");
    node.dataset.panel = "bananas";
    BL.bananaPanel.build(node);
    for (const el of node.querySelectorAll("[data-sign]")) letter(el);
    const chip = node.querySelector(".panel-title .panel-chip"), slab = node.querySelector(".banana-slab");
    const feedButton = node.querySelector('[data-action="feed"]');
    feedButton.addEventListener("click", () => ctx.feed());
    const closed = make("div", "slab oc-slab oc-pending", make("p", "", "Donations aren't open on Ooga Chat right now."));
    node.append(closed);
    const visible = () => !node.closest("[hidden]");
    let panel = null, feed = null, watching = null;
    // The fixture's demo tells the panel of each simulated payment, so its receipt shows in the tally and lists.
    const offDemo = ctx.demo?.subscribe ? ctx.demo.subscribe(() => { if (feed === "demo") panel?.refresh(true); }) : () => {};
    const update = (state) => {
      if (!watching && node.parentElement) {
        watching = new MutationObserver(() => panel?.showRate());
        watching.observe(node.parentElement, { attributes: true, attributeFilter: ["hidden"] });
      }
      const next = state.mode !== "live" ? "off" : state.boot.features.feed === "demo" && ctx.demo ? "demo" : state.boot.features.feed;
      if (next === feed) return;
      feed = next;
      panel?.dispose();
      panel = null;
      const open = feed === "live" || feed === "demo";
      slab.hidden = chip.hidden = feedButton.hidden = !open;
      closed.hidden = open;
      if (!open) return;
      const storageKey = ctx.storageKey("recent-bar");
      panel = BL.bananaPanel.create(node, feed === "demo" ? { ...ctx.demo, storageKey, visible } : { storageKey, visible });
    };
    const dispose = () => {
      watching?.disconnect();
      offDemo();
      panel?.dispose();
      node.remove();
    };
    return { node, update, dispose };
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
    node.append(reactions, note, account.node);
    ctx.reactions.bars.mount(reactions, { handAllowed: () => ctx.media.state.role === "speaker" });
    const { stateAt, ageAt } = BL.rosterPanel, faces = BL.oogaChatFaces, town = ctx.commons.model;
    // Who speaks from Ooga Chat now, by login, from the audience's list: their dots are Ooga Chat's purple.
    let speakers = new Set(), heard = -1;
    const people = new Map();
    let panel = null, names = "", reading = null, fetchedAt = 0, loading = false, timer = 0, sheet = null;
    const face = (contributor) => {
      if (!sheet) {
        sheet = new Image();
        sheet.addEventListener("load", () => panel?.faceChanged(), { once: true });
        sheet.src = "art/ooga-faces.png";
      }
      if (!sheet.complete || !sheet.naturalWidth) return null;
      const i = faces.cells[contributor.name.toLowerCase()] ?? faces.fallback, size = faces.size, canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      canvas.getContext("2d").drawImage(sheet, (i % faces.columns) * size, Math.floor(i / faces.columns) * size, size, size, 0, 0, size, size);
      return canvas;
    };
    const stampOf = (c) => c.lastContributionAt || c.lastCommitAt;
    const online = (row) => {
      if (speakers.has(row.contributor.login)) return "cloud";
      for (const p of town.state.players.values()) if (p.login.toLowerCase() === row.contributor.login) return true;
      return false;
    };
    const hooks = { stamp: stampOf, login: (c) => c.login, joinedAt: (c) => c.joinedAt, stats: () => reading, face, online,
      stateFor: (c) => stateAt(c.lastContributionAt > 0 ? c.lastContributionAt : c.lastCommitAt, Date.now()),
      ageLabel: (c) => ageAt(c.lastContributionAt > 0 ? c.lastContributionAt : c.lastCommitAt, Date.now()),
      voice() {}, sortKey: ctx.storageKey("roster-sort") };
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
      if (panel && (kind === "players" || kind === "welcome")) for (const row of panel.rows.values()) panel.showOnline(row);
    });
    const update = (state) => {
      watch();
      account.update(state);
      if (state.audience.version === heard) return;
      heard = state.audience.version;
      const next = appSpeakers(state.audience.list).map((p) => p.login.toLowerCase());
      if (next.length === speakers.size && next.every((login) => speakers.has(login))) return;
      speakers = new Set(next);
      if (panel) for (const row of panel.rows.values()) panel.showOnline(row);
    };
    const dispose = () => {
      clearInterval(timer);
      off();
      panel?.dispose();
      account.dispose();
      node.remove();
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
  // Everyone online for a member: the island's players, and the member, who is online here in Ooga Chat even while their
  // Ooga is not on the island (the Room lists only the island's players, worker/src/room-commons.js).
  const onlineCount = (model) => model.state.players.size + (model.state.you && !model.state.players.has(model.state.you.id) ? 1 : 0);
  const commonsChip = (status, model) => status === "live" ? `${onlineCount(model)} online` : status === "closed" ? "Closed" : "Offline";
  // Ooga Chat's own speakers in the audience's list: the ones on clouds, purple wherever a panel marks them.
  const appSpeakers = (list) => list.filter((p) => p.role === "speaker" && p.source === "app");
  const panelHead = (title) => {
    const heading = make("span", "", title), chip = make("span", "panel-chip");
    heading.dataset.sign = "";
    letter(heading, title);
    return { header: make("header", "panel-title", make("h2", "", heading), chip), chip };
  };
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
      const key = `${socket}|${live}|${model.state.send}|${model.state.you?.login}|${model.state.players.size}`;
      if (key === shown) return;
      shown = key;
      chip.textContent = commonsChip(socket, model);
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
  // their Ooga is there, else under Ooga Chat. Presence without positions: no distance, crosshair, voice
  // link or volume, which are the island's alone (docs/ooga-chat-backend.md, the capability matrix).
  const online = (ctx) => {
    const { model } = ctx.commons;
    const APP = "ooga-chat";
    const { header, chip } = panelHead("Online Oogas");
    const list = make("div", "players slab oc-players"), note = make("p", "help players-status");
    const account = accountRow(ctx);
    // The emoji panel under the list, as the island's Online Oogas has it.
    const reactions = make("div", "reactions");
    const node = make("section", "panel oc-panel oc-online", header, list, reactions, note, account.node);
    node.dataset.panel = "players";
    ctx.reactions.bars.mount(reactions, { handAllowed: () => ctx.media.state.role === "speaker" });
    // A row as the island's players.js makes one (the dots, the name, the hand's column, the voice mark), less the link,
    // the crosshair, the distance and the volume, which only the island offers. An Ooga Chat speaker's dot is purple.
    const row = (r) => {
      const p = r.p, dots = make("span", "roster-dots"), presence = make("span", "roster-presence"), host = make("span", "roster-host");
      presence.dataset.online = r.cloud ? "cloud" : "true";
      presence.setAttribute("role", "img");
      presence.setAttribute("aria-label", r.cloud ? "Speaking from Ooga Chat" : "Online");
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
      const voice = make("span", "roster-voice", BL.nativeIcons.voice());
      const look = p.voice ? p.muted ? "muted" : "on" : "";
      voice.hidden = !look;
      voice.dataset.voice = look;
      voice.setAttribute("role", "img");
      voice.setAttribute("aria-label", p.muted ? "Muted their microphone" : "In voice");
      voice.title = voice.getAttribute("aria-label");
      const li = make("li", "", dots, make("span", "players-name", label), make("span", "players-mark", raised), make("span", "roster-marks", voice));
      if (r.self) li.dataset.self = "true";
      return li;
    };
    const draw = () => {
      if (node.closest("[hidden]")) return;
      const you = model.state.you, rows = [];
      for (const p of model.state.players.values()) rows.push({ id: p.id, name: p.display, group: BL.zoneMap.groupOf(p.zone), self: !!you && p.id === you.id, p });
      // Ooga Chat's speakers sit on Main Island's clouds, so they are listed with the island's own, as the island lists
      // them: a row of their own with a purple dot, the member's own included while they speak.
      let speaking = false;
      for (const a of cloud) {
        const self = a.id === me;
        speaking = speaking || self;
        rows.push({ id: a.id, name: a.display, group: BL.zoneMap.groupOf("outside"), self, cloud: true,
          p: { login: a.login, display: a.display, hand: !!a.hand, handEmoji: a.hand, voice: true, muted: a.muted } });
      }
      if (you && !speaking && !model.state.players.has(you.id)) rows.push({ id: you.id, name: you.display, group: APP, self: true, p: { ...you, hand: false, voice: false, muted: false } });
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
    };
    let status = "off", cloud = [], me = "", heard = -1;
    const off = model.subscribe((kind) => { if (kind === "players" || kind === "welcome") { draw(); paint(); } });
    const watch = onShown(node, draw);
    const paint = () => {
      const live = status === "live" && !!model.state.you;
      chip.textContent = commonsChip(status, model);
      chip.dataset.tone = live ? "live" : status === "closed" ? "closed" : "idle";
      note.textContent = live ? "" : COMMONS_WORDS[status] || "";
      note.hidden = !note.textContent;
      // While live the list always holds at least the member's own row.
      list.hidden = !live;
    };
    const update = (state) => {
      watch();
      account.update(state);
      if (state.audience.version !== heard) {
        heard = state.audience.version;
        cloud = appSpeakers(state.audience.list);
        me = state.session ? state.session.identity.participant : "";
        draw();
      }
      if (state.commons.status === status) return;
      status = state.commons.status;
      paint();
    };
    const dispose = () => {
      off();
      account.dispose();
      node.remove();
    };
    return { node, update, dispose };
  };
  const pending = (title, note) => () => {
    const heading = make("span", "", title);
    heading.dataset.sign = "";
    letter(heading, title);
    const node = make("div", "panel oc-panel",
      make("header", "panel-title", make("h2", "", heading)),
      make("div", "slab oc-slab oc-pending", make("p", "", note)));
    return { node, update() {}, dispose() { node.remove(); } };
  };
  BL.oogaChatViews = { chat, device, bananas, roster: rosterView, commons, online, pending, make };
})();
