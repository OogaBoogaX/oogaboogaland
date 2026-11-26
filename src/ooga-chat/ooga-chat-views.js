// Ooga Chat's views, each `view(ctx)` returning `{ node, update(state), dispose() }` for ooga-chat-shell.js. `ctx`
// carries `actions` (`signIn(provider)`, `signOut()`, `retry()`, `joinVoice()`, `leaveVoice()`, `mute()`, `retryVoice()`,
// `zone(id)`) and `media`, the voice controller (ooga-chat-media.js); `state` is `{ mode, boot, session, auth, notice, busy, zone, voice, audience, commons }`
// (docs/ooga-chat-app.md), where `mode` is loading, live, unavailable or stale and `auth` is ooga-chat-auth.js's. Every
// tab is the island's own panel (#656), in its markup and its rules: `chat` is the Ooga Chat tab, sign-in or the island's
// Ooga Chat panel with its footer. Bananas (ooga-chat-bananas.js), and Contributing Oogas, The Commons and Online Oogas
// (ooga-chat-panels.js, the island's account row at their foot) come in chunks of their own and register `bananas`,
// `roster`, `commons` and `online` here; `deferred` stands in for each until its chunk is here. `pending(title)` stands
// in for a panel not built yet; it says so instead of showing invented data.
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
  // Join voice while not speaking (ooga-chat-media.js's state): its words while joining or leaving, whether it can be
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
    // Smaller copies for a screen that shows it smaller or at a lower density: up to 420px wide it spans the page less
    // 86px, then less 114px, up to 506px (ooga-chat.css; scripts/ooga-chat.mjs ALTERNATE_ART).
    art.srcset = "art/sign-in-island-520.webp 520w, art/sign-in-island-680.webp 680w, art/sign-in-island.webp 1005w";
    art.sizes = "(max-width: 420px) calc(100vw - 86px), (max-width: 620px) calc(100vw - 114px), 506px";
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
    // Its words follow the service: with hosted chats anyone signed in may ask to speak and contributors start chats.
    const ledeOne = make("span", ""), ledeTwo = make("span", ""), lede = make("p", "oc-lede", ledeOne, make("br"), ledeTwo);
    const noteText = make("span", ""), foot = make("p", "oc-foot");
    const signedOut = make("div", "slab oc-slab oc-signin",
      art, lede,
      make("div", "oc-providers", providers.github, providers.x),
      make("div", "oc-note", make("strong", "", "Everyone can listen."), noteText), foot);
    let wordsFor = null;
    const sayWelcome = (chats) => {
      if (wordsFor === chats) return;
      wordsFor = chats;
      ledeOne.textContent = chats ? "Voice chats from the island." : "Listen to the island.";
      ledeTwo.textContent = chats ? "Join one and ask to speak." : "Speak from the clouds.";
      noteText.textContent = chats ? "Anyone signed in can ask to speak. Team Ooga Booga contributors signed in with GitHub can also start a chat."
        : "Team Ooga Booga contributors signed in with GitHub can also speak from a cloud.";
      foot.textContent = chats ? "" : "X accounts join as listeners.";
      foot.hidden = chats;
    };
    sayWelcome(false);
    const space = audience(ctx);
    // The tag in the title's corner names the one zone the space shows for now, as the island's panel does.
    const head = panelHead("Ooga Chat");
    // Hosted chats (ooga-chat-hosts.js), once here.
    let hosts = null, hostsAsked = false, last = null;
    const hostsHere = () => {
      if (hosts || !BL.oogaChatHosts || listeners.signal.aborted) return;
      hosts = BL.oogaChatHosts.create(ctx, { node, head: head.header, space });
      if (last) update(last);
    };
    const node = make("section", "panel oc-panel oc-chat", head.header, line, alert.el, signedOut, ...space.nodes);
    node.dataset.panel = "cloud";
    node.dataset.space = "off";
    let principal = null, refocus = false, portraitTimer = 0, portraitWatch = null;
    // A quiet Listen view can keep the same cached speaker tiles indefinitely. Refresh their source even with no
    // audience/voice changes, only while this signed-in tab and document show; the portrait reader shares its throttle.
    const watchPortraits = () => {
      if (document.hidden || !principal || node.closest("[hidden]")) {
        clearInterval(portraitTimer); portraitTimer = 0; return;
      }
      if (!portraitTimer) {
        BL.oogaChatPortraits.refresh();
        portraitTimer = setInterval(() => BL.oogaChatPortraits.refresh(), 120000);
      }
    };
    document.addEventListener("visibilitychange", watchPortraits, { signal });
    const update = (state) => {
      if (!portraitWatch && node.parentElement) {
        portraitWatch = new MutationObserver(watchPortraits);
        portraitWatch.observe(node.parentElement, { attributes: true, attributeFilter: ["hidden"] });
      }
      last = state;
      const { mode, boot, session, auth, notice: shown, busy } = state;
      const live = mode === "live", who = live && session, chats = !!who && boot.features.chats;
      if (chats && !hosts && !hostsAsked) {
        hostsAsked = true;
        BL.oogaChatChunks.ready("hosts", hostsHere);
        BL.oogaChatChunks.load("hosts")?.catch(() => setTimeout(() => { hostsAsked = false; }, 30000));
      }
      // Sign-in shows once signed out is known: loading and the session check show only the title and status. Signing
      // out keeps the space's footer, which says so, until the server confirms.
      signedOut.hidden = !!who || mode === "loading" || live && auth === "checking";
      node.dataset.space = who ? chats && !state.room ? "list" : "on" : busy === "signout" ? "foot" : "off";
      // In a chat its land; on the chats list none (no zone is shown there), even before the chats' views have loaded.
      if (who && state.room && BL.chatHosts) BL.chatHosts.tagged(head.chip, state.room.zone);
      else { set(head.chip, "textContent", who && !chats ? ZONE_NAMES[state.zone] : ""); head.chip.title = ""; }
      if (live) sayWelcome(!!boot.features.chats);
      let words = STATUS[mode] || "";
      if (live && auth === "checking") words = "Checking your sign-in…";
      if (chats && !hosts) words = "Opening chats…";
      if (live && boot.newer) words = "A newer Ooga Chat is out.";
      if (!state.device.online) words = OFFLINE;
      set(status, "textContent", words);
      line.hidden = !words;
      reload.hidden = mode !== "stale" && !(live && boot.newer);
      again.hidden = mode !== "unavailable";
      alert.update(live ? shown : null, busy);
      // A provider that is off is not offered, while another is on; with none on, each says it is unavailable.
      const anyOn = live && Object.keys(providers).some((p) => boot.features[p]);
      for (const [provider, el] of Object.entries(providers)) {
        const on = live && boot.features[provider], [label, opening, off] = PROVIDERS[provider];
        el.hidden = anyOn && !on;
        el.disabled = !on || auth === "checking" || !!busy || !state.device.online;
        el.textContent = busy === provider ? opening : on || !live ? label : off;
        el.setAttribute("aria-busy", String(busy === provider));
      }
      space.update(state);
      hosts?.update(state);
      // Focus follows the account: into the space on signing in, onto the first way back in on leaving it, and only
      // when the control that held it went away.
      const lost = !node.ownerDocument.activeElement || node.ownerDocument.activeElement === node.ownerDocument.body;
      const was = principal;
      if (!who) {
        if (was) refocus = true;
        principal = null;
        watchPortraits();
        const first = Object.values(providers).find((el) => !el.disabled);
        if (refocus && first) {
          refocus = false;
          if (lost) first.focus();
        }
        return;
      }
      refocus = false;
      principal = session.identity.principal;
      watchPortraits();
      if (was !== principal && lost) space.focus();
    };
    const dispose = () => {
      listeners.abort();
      clearInterval(portraitTimer);
      portraitWatch?.disconnect();
      hosts?.dispose();
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
    joining: (zone, chat) => chat ? "Joining the chat…" : `Joining ${ZONE_NAMES[zone]}…`,
    reconnecting: () => "Reconnecting… this list may be out of date.",
    full: (zone, chat) => `${chat ? "This chat" : ZONE_NAMES[zone]} is full right now. Ooga Chat will try again.`,
    closed: () => "Listening is off right now. Ooga Chat will try again in a few minutes.",
    unavailable: () => "Live audio isn't open here yet.",
    stale: () => "This page is older than Ooga Chat's service. Reload to keep listening."
  };
  const VOICE_WORDS = { on: "In voice", speaking: "Speaking", muted: "Muted their microphone" };
  // All three player panels share the island's mic semantics and words. A remote mark changes only what this
  // listener hears; the own mark controls only a microphone held here, never one on another device.
  const describeMic = (ctx, p, self, t) => {
    const voice = ctx.media.state, speaker = p.role === "speaker", own = self && voice.role === "speaker";
    const muted = own ? voice.muted : p.muted;
    t.look = !speaker ? "" : muted ? "muted" : (own ? voice.speaking : voice.talking.includes(p.id)) ? "speaking" : "on";
    t.micPressed = speaker && !self && ctx.media.mutedLocally(p.id);
    t.micDisabled = self && !own;
    const words = own ? muted ? "Your microphone is muted: click to unmute" : "Your microphone: click to mute"
      : self ? "Your microphone is on another device" : `${VOICE_WORDS[t.look]}${t.micPressed ? ". Muted for you: click to unmute" : ". Click to mute for you"}`;
    t.micWords = speaker ? `${p.display}: ${words}${!self && ctx.media.mutedByDuel(p.id) ? ". Automatically muted until their duel ends" : ""}` : "";
  };
  const pressMic = (ctx, id, self) => {
    if (self) ctx.actions.mute();
    else ctx.media.muteLocal(id, !ctx.media.mutedLocally(id));
  };
  // The island's per-player Volume row, with the same range, steps and accessible percentage. Mute stays separate.
  const volumeControl = (ctx) => {
    const id = `oc-volume-${++described}`, label = make("label", "players-hearing-label", "Volume");
    const slider = make("input", "players-volume-range"), value = make("output", "players-volume-value");
    Object.assign(slider, { id, type: "range", min: "0", max: String(ctx.media.VOLUME_MAX * 100), step: "5" });
    label.htmlFor = value.htmlFor = id;
    const node = make("div", "players-volume", label, slider, value);
    node.id = `${id}-row`;
    let participant = null;
    const refresh = () => {
      const level = participant ? ctx.media.volumeOf(participant.id) : 1, words = `${Math.round(level * 100)}%`;
      set(slider, "value", String(level * 100));
      set(value, "textContent", words);
      attr(slider, "aria-valuetext", words);
    };
    slider.addEventListener("input", () => {
      if (participant) ctx.media.setVolume(participant.id, Number(slider.value) / 100);
      refresh();
    });
    const select = (p) => {
      participant = p;
      attr(slider, "aria-label", `Volume for ${p.display}`);
      refresh();
    };
    return { node, slider, select, refresh };
  };
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
    // The emoji panel (reaction-bar.js, the island's own, #655) over the account controls, or beside them on a panel wide
    // enough for both (style.css `.panel-foot`); its hand is an active speaker's alone.
    const reactions = make("div", "reactions");
    const foot = cloudFoot(ctx), footRow = make("div", "panel-foot oc-chat-foot", reactions, foot.node);
    ctx.reactions.bars.mount(reactions, { handAllowed: () => !!voice && voice.role === "speaker" });
    const offPop = ctx.reactions.onPop((id, emoji) => tiles.pop(id, emoji));
    let version = -1, frame = 0, self = null, voice = null, people = [];
    // A speaker's name opens the same Volume control as Online Oogas. Keep it below the grid so the slider has
    // room on a phone; listeners who cannot open the contributor tabs can use it here too.
    const volume = volumeControl(ctx), volumeName = make("span", "oc-volume-name"), closeVolume = button("link", "Close");
    const volumeBox = make("div", "oc-volume", make("div", "oc-volume-head", volumeName, closeVolume), volume.node);
    volumeBox.id = `${volume.node.id}-box`;
    volumeBox.hidden = true;
    const volumeButtons = new Map();
    let selected = null;
    const chooseVolume = (p, focus = false) => {
      if (selected) volumeButtons.get(selected)?.setAttribute("aria-expanded", "false");
      selected = p ? p.id : null;
      volumeBox.hidden = !p;
      if (!p) return;
      volumeButtons.get(selected)?.setAttribute("aria-expanded", "true");
      set(volumeName, "textContent", p.display);
      set(volumeName, "title", p.display);
      volume.select(p);
      if (focus) volume.slider.focus();
    };
    const dismissVolume = () => {
      const toggle = volumeButtons.get(selected);
      chooseVolume(null);
      if (toggle && !toggle.disabled) toggle.focus();
      else foot.focus();
    };
    closeVolume.addEventListener("click", dismissVolume, { signal });
    volumeBox.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); dismissVolume();
    }, { signal });
    list.addEventListener("click", (event) => {
      const toggle = event.target.closest(".oc-volume-toggle");
      if (!toggle || toggle.disabled) return;
      const p = people.find((p) => p.id === toggle.closest(".cloud-tile").dataset.id);
      if (p && p.role === "speaker" && p.id !== self) chooseVolume(selected === p.id ? null : p, !event.detail);
    }, { signal });
    // An Ooga's face from the face sheet (art/ooga-faces.png, ooga-chat-faces.js), cut once a handle and kept as a
    // data URL, for anyone the server names a character for and gives no picture: an island speaker's own Ooga. The
    // tiles draw again once the sheet has loaded.
    const sheetFaces = new Map();
    const changedFaces = BL.oogaChatPortraits.onChange(() => {
      sheetFaces.clear();
      if (!frame) frame = requestAnimationFrame(render);
    });
    listeners.signal.addEventListener("abort", changedFaces, { once: true });
    const sheetFace = (handle) => {
      if (!handle) return "";
      const key = handle.toLowerCase();
      if (sheetFaces.has(key)) return sheetFaces.get(key);
      const canvas = BL.oogaChatPortraits.canvas(key);
      if (!canvas) return "";
      const url = canvas.toDataURL("image/png");
      sheetFaces.set(key, url); return url;
    };
    const describe = (p, t) => {
      // A speaker's mark lights while this page hears them speak, as Online Oogas does on the island: the visitor's own
      // from their microphone's meter (ooga-chat-media.js `speaking`, alone or not), anyone else's from their voice's
      // (`talking`).
      const speaker = p.role === "speaker", you = p.id === self;
      t.id = p.id; t.display = p.display; t.role = p.role; t.source = !speaker ? "" : p.source === "world" && !p.via ? "world" : "chat";
      t.face = p.face || sheetFace(p.character); t.hand = p.hand || ""; t.self = you; t.rank = p.rank || ""; t.request = p.request || ""; t.chat = !!p.via; t.walking = speaker && !!p.walking; t.reconnecting = !!p.reconnecting;
      describeMic(ctx, p, you, t);
    };
    let menu = null;
    const tiles = BL.audienceTiles.create(list, { mic: (id) => pressMic(ctx, id, id === self), menu: (...a) => menu?.(...a) });
    // The speakers' marks fill with their voices' levels on each meter read (ooga-chat-media.js `subscribeLevels`).
    const offLevels = ctx.media.subscribeLevels(() => tiles.levels((id) => id === self ? ctx.media.ownLevel() : ctx.media.level(id)));
    const render = () => {
      frame = 0;
      tiles.draw(people, describe);
      for (const [id, toggle] of volumeButtons) if (!list.contains(toggle)) volumeButtons.delete(id);
      for (const li of list.children) {
        const enabled = li.dataset.role === "speaker" && li.dataset.id !== self;
        let toggle = volumeButtons.get(li.dataset.id);
        if (!toggle && enabled) {
          const text = li.querySelector(".cloud-name-text");
          toggle = button("oc-volume-toggle", "");
          text.replaceWith(toggle);
          toggle.append(text);
          attr(toggle, "aria-controls", volumeBox.id);
          volumeButtons.set(li.dataset.id, toggle);
        }
        if (toggle) {
          set(toggle, "disabled", !enabled);
          attr(toggle, "aria-expanded", String(selected === li.dataset.id));
          set(toggle, "title", enabled ? `Volume for ${toggle.textContent}` : toggle.textContent);
        }
      }
      if (selected) {
        const p = people.find((p) => p.id === selected && p.role === "speaker" && p.id !== self);
        if (!p && volumeBox.contains(document.activeElement)) dismissVolume();
        else chooseVolume(p || null);
      }
    };
    const update = (state) => {
      foot.update(state);
      if (!state.session) { chooseVolume(null); return; }
      const { audience: now, zone } = state;
      // The feed's state first; then voice's (playback the browser held back, a receiver that gave up, what the last try
      // to speak said, which in a Main Island chat floats over the island view instead, chat-hosts.js); then an empty zone.
      const failed = now.status === "live" && state.voice.phase === "failed";
      const place = state.room ? "chat" : "zone";
      const words = HEARD[now.status]?.(zone, !!state.room) || (now.status !== "live" ? "" : state.voice.blocked ? `Tap anywhere to hear this ${place}.`
        : failed ? `Can't hear this ${place} right now. ` : (state.room && state.room.zone === "main" ? "" : state.voice.notice) || (!now.list.length ? "Nobody is here yet." : ""));
      set(statusText, "textContent", words);
      set(retryVoice, "hidden", !failed);
      set(heard, "hidden", !words);
      const who = state.session.identity.participant, moved = who !== self, mics = moved || state.voice !== voice, role = voice && voice.role;
      self = who;
      voice = state.voice;
      if (moved) chooseVolume(null);
      if (mics && selected) volume.refresh();
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
      offLevels();
      tiles.dispose();
      volumeButtons.clear();
      foot.dispose();
    };
    return { nodes: [heard, list, volumeBox, footRow], update, focus, dispose, parts: { list, footRow, foot: foot.parts }, setMenu(fn) { menu = fn; } };
  };
  // The Ooga Chat panel's footer, the island's: the visitor's name (Ooga Chat's purple dot while signed in), the
  // fixed-width microphone, always first and off for a listener, Join voice for a listener the server allows to speak
  // (Leave voice for a speaker), and Sign out. A disabled button says why on itself. The voice state is the seam's
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
    const mute = button("foot-button cloud-mute", "Unmute"), join = button("foot-button cloud-voice", "Join voice"), out = button("link", "Sign out");
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
    out.addEventListener("click", () => actions.signOutFrom ? actions.signOutFrom(out, actions.signOut) : actions.signOut(), { signal });
    // The voice buttons, then the name with Sign out beside it on a line of its own under them, in a chat too, as the
    // island's footer has it.
    const footActions = make("span", "cloud-foot-actions", mute, join);
    const node = make("div", "cloud-foot", footActions, muteWhy, joinWhy, make("span", "cloud-foot-who", name, out));
    const update = (state) => {
      set(out, "textContent", state.busy === "signout" ? "Signing out…" : "Sign out");
      set(out, "disabled", !!state.busy);
      const who = state.mode === "live" && state.session;
      if (!who) return;
      set(name, "textContent", who.identity.display);
      const speaker = state.voice.role === "speaker", allowed = state.room ? { joinVoice: state.room.you?.speak === "eligible" || !!state.voice.elsewhere, why: null } : gates(state, Date.now());
      const source = "chat";
      if (name.dataset.source !== source) name.dataset.source = source;
      set(mute, "disabled", !speaker || !!state.busy || state.voice.busy);
      BL.nativeIcons.label(mute, speaker && !state.voice.muted ? "Mute" : "Unmute");
      attr(mute, "aria-pressed", String(speaker && state.voice.muted));
      micLook(mute, !mute.disabled && speaker, state.voice.muted);
      set(muteWhy, "textContent", speaker ? "" : "Join voice first to unmute.");
      const going = joining(state, allowed, media);
      join.dataset.voice = speaker ? "speaker" : "listener";
      set(join, "textContent", speaker ? "Leave voice" : going.words || "Join voice");
      set(join, "disabled", speaker ? !!state.busy : going.disabled);
      const why = speaker ? "" : going.why;
      set(joinWhy, "textContent", why);
      set(join, "title", why);
    };
    const dispose = () => listeners.abort();
    // Where focus lands on signing in: the first of the footer's buttons that can be pressed.
    const focus = () => [mute, join, out].find((el) => !el.disabled && !el.hidden).focus();
    return { node, update, focus, dispose, parts: { mute, join, actions: footActions } };
  };
  // Under the frame: install help the browser actually offers (its own prompt, or Safari's Share menu), and a waiting
  // update, which never reloads by itself and waits while the visitor speaks. Each line has its own × to hide it: the
  // install offer for good in this browser (localStorage `ooga-chat-install-hidden`; the browser's own menu still
  // installs), the update until this page loads again.
  const INSTALL_HIDDEN = "ooga-chat-install-hidden";
  const device = ({ install, reload }) => {
    const listeners = new AbortController(), { signal } = listeners;
    const offer = button("link", "Install Ooga Chat"), hint = make("span", "", "To install Ooga Chat, tap Share, then Add to Home Screen.");
    const fresh = make("span", ""), take = button("link", "Reload");
    const closer = (words) => { const b = button("oc-device-close", "×"); b.setAttribute("aria-label", words); b.title = words; return b; };
    const hideInstall = closer("Hide the install offer"), hideUpdate = closer("Hide this until the page reloads");
    let installHidden = false, updateHidden = false, last = null;
    try { installHidden = localStorage.getItem(INSTALL_HIDDEN) === "1"; } catch { /* shown */ }
    offer.addEventListener("click", () => install(), { signal });
    take.addEventListener("click", () => reload(), { signal });
    hideInstall.addEventListener("click", () => {
      installHidden = true;
      try { localStorage.setItem(INSTALL_HIDDEN, "1"); } catch { /* hidden for this page */ }
      if (last) update(last);
    }, { signal });
    hideUpdate.addEventListener("click", () => { updateHidden = true; if (last) update(last); }, { signal });
    const installLine = make("p", "oc-device-line", offer, hint, hideInstall), updateLine = make("p", "oc-device-line", fresh, take, hideUpdate);
    updateLine.setAttribute("role", "status");
    const node = make("div", "oc-device", updateLine, installLine);
    const update = (state) => {
      last = state;
      const { install: way, update: waiting } = state.device, speaking = state.voice.role === "speaker";
      offer.hidden = way !== "prompt";
      hint.hidden = way !== "ios";
      installLine.hidden = !way || installHidden;
      updateLine.hidden = !waiting || updateHidden;
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
  const panelHead = (title) => {
    const heading = make("span", "", title), chip = make("span", "panel-chip");
    heading.dataset.sign = "";
    letter(heading, title);
    return { header: make("header", "panel-title", make("h2", "", heading), chip), chip };
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
  // A tab whose view comes in a chunk of its own (ooga-chat-chunks.js): `deferred(title, group, name)` is the view
  // `BL.oogaChatViews[name]` registers once `group` is here, standing in under its title while the chunk loads (most
  // often already prefetched), then replaced in place by the real view, given the last state. A chunk that can't be had
  // offers Try again, or Reload once Ooga Chat was deployed since this page loaded.
  const deferred = (title, group, name) => (ctx) => {
    const listeners = new AbortController(), { signal } = listeners;
    const heading = make("span", "", title);
    heading.dataset.sign = "";
    letter(heading, title);
    const text = make("span", ""), again = button("link", "");
    const line = make("p", "", text, " ", again);
    line.setAttribute("role", "status");
    const node = make("div", "panel oc-panel", make("header", "panel-title", make("h2", "", heading)), make("div", "slab oc-slab oc-pending", line));
    let view = null, last = null, disposed = false;
    const show = () => {
      if (disposed || view) return;
      view = BL.oogaChatViews[name](ctx);
      node.replaceWith(view.node);
      if (last) view.update(last);
    };
    const failed = () => {
      if (disposed) return;
      const stale = BL.oogaChatChunks.stale;
      text.textContent = stale ? "A newer Ooga Chat is out." : "This panel couldn't load.";
      again.textContent = stale ? "Reload" : "Try again";
      again.hidden = false;
      // A copy that was only slow may still land: the view then takes this message's place.
      if (!stale) BL.oogaChatChunks.ready(group, show);
    };
    const open = () => {
      text.textContent = "Opening…";
      again.hidden = true;
      const loading = BL.oogaChatChunks.load(group);
      if (loading) loading.then(show, failed);
      else show();
    };
    again.addEventListener("click", () => BL.oogaChatChunks.stale ? location.reload() : open(), { signal });
    open();
    const update = (state) => {
      last = state;
      view?.update(state);
    };
    const dispose = () => {
      disposed = true;
      listeners.abort();
      if (view) view.dispose();
      node.remove();
    };
    return { get node() { return view ? view.node : node; }, update, dispose };
  };
  // What the views in their own chunks (ooga-chat-bananas.js, ooga-chat-panels.js) build with.
  const kit = { make, button, set, attr, explain, joining, PROVIDERS, micLook, describeMic, pressMic, volumeControl, panelHead };
  BL.oogaChatViews = { chat, device, deferred, pending, make, kit };
})();
