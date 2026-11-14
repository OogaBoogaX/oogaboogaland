// Ooga Chat's views, each `view(ctx)` returning `{ node, update(state), dispose() }` for ooga-chat-shell.js. `ctx`
// carries `actions` (`signIn(provider)`, `signOut()`, `retry()`, `joinVoice()`) and `media`, the voice seam; `state` is
// `{ mode, boot, session, auth, notice, busy, zone }` (docs/ooga-chat-app.md), where `mode` is loading, live,
// unavailable or stale and `auth` is ooga-chat-auth.js's. `chat` is the Ooga Chat tab: sign-in, or the space the
// account listens in. `account` is the footer the app keeps under every tab while signed in. `pending(title)` stands in
// for a panel the shared island panels (Bananas, Contributing Oogas, Online Oogas, The Commons) will fill; it says so
// instead of showing invented data.
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
  // A person's face: the server's same-origin picture, or the island's own Ooga face when there is none or it fails.
  // Its size is fixed before anything loads, and a failed picture is never asked for again.
  const face = (identity) => {
    const el = make("span", "oc-face");
    el.setAttribute("aria-hidden", "true");
    const ooga = () => el.replaceChildren(BL.nativeIcons.svg("roster"));
    if (!identity.avatar) ooga();
    else {
      const img = make("img");
      img.width = img.height = 56;
      img.alt = "";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", ooga, { once: true });
      img.src = identity.avatar;
      el.append(img);
    }
    return el;
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
  // The Ooga Chat tab: sign-in while signed out, the space while signed in. Every sign-in lands here as a listener.
  const chat = ({ actions }) => {
    const listeners = new AbortController(), { signal } = listeners;
    const art = make("img", "oc-art");
    art.src = "art/sign-in-island.jpg";
    art.width = 430;
    art.height = 287;
    art.alt = "Cavemen on clouds above a floating island, round a pile of bananas";
    art.decoding = "async";
    // Lazy, so a signed-in visit, which never shows it, never fetches it.
    art.loading = "lazy";
    const status = make("p", "oc-status");
    status.setAttribute("role", "status");
    const reload = button("oc-reload link", "Reload");
    reload.addEventListener("click", () => location.reload(), { signal });
    const alert = notice(actions, signal);
    const providers = Object.fromEntries(Object.keys(PROVIDERS).map((provider) => {
      const el = button("oc-provider", PROVIDERS[provider][0]);
      el.dataset.provider = provider;
      el.addEventListener("click", () => actions.signIn(provider), { signal });
      return [provider, el];
    }));
    const signedOut = make("div", "oc-signin",
      art,
      make("p", "oc-lede", "Listen to the island.", make("br"), "Speak from the clouds."),
      make("div", "oc-providers", providers.github, providers.x),
      make("div", "oc-note", make("strong", "", "Everyone can listen."),
        make("span", "", "Team Ooga Booga contributors signed in with GitHub can also speak from a cloud.")),
      make("p", "oc-foot", "X accounts join as listeners."));
    const space = audience(actions);
    const signedIn = space.node;
    const slab = make("div", "slab oc-slab", make("p", "oc-status-line", status, reload), alert.el, signedOut, signedIn);
    const node = make("div", "oc-chat", slab);
    let principal = null, refocus = false;
    const update = (state) => {
      const { mode, boot, session, auth, notice: shown, busy } = state;
      const live = mode === "live", who = live && session;
      signedOut.hidden = !!who;
      signedIn.hidden = !who;
      let line = STATUS[mode] || "";
      if (live && auth === "checking") line = "Checking your sign-in…";
      if (live && boot.newer) line = "A newer Ooga Chat is out.";
      if (status.textContent !== line) status.textContent = line;
      status.parentElement.hidden = !line;
      reload.hidden = mode !== "stale" && !(live && boot.newer);
      alert.update(live ? shown : null, busy);
      for (const [provider, el] of Object.entries(providers)) {
        const on = live && boot.features[provider], [label, opening, off] = PROVIDERS[provider];
        el.disabled = !on || auth === "checking" || !!busy;
        el.textContent = busy === provider ? opening : on || !live ? label : off;
        el.setAttribute("aria-busy", String(busy === provider));
      }
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
      space.update(state);
      if (was !== principal && lost) space.focus();
    };
    const dispose = () => {
      listeners.abort();
      space.dispose();
      node.remove();
    };
    return { node, update, dispose };
  };
  // The space a signed-in account listens in: the two zone buttons, a status line only when the list is not simply
  // live, and one continuous four-column list of everyone the server reports there, speakers first (ooga-chat-roster.js
  // orders it). Tiles are keyed by participant and source generation and reused, so an update moves and changes only
  // what changed, coalesced to one pass a frame, and focus stays on the tile that had it. Arrow keys, Home and End move
  // through the list from its one tab stop.
  const ZONE_BUTTONS = { main: "Main Island", dsb: "DSB Land" };
  const HEARD = {
    connecting: () => "Connecting…",
    joining: (zone) => `Joining ${ZONE_BUTTONS[zone]}…`,
    reconnecting: () => "Reconnecting… this list may be out of date.",
    full: (zone) => `${ZONE_BUTTONS[zone]} is full right now. Ooga Chat will try again.`,
    unavailable: () => "Live audio isn't open here yet.",
    stale: () => "This page is older than Ooga Chat's service. Reload to keep listening."
  };
  const audience = (actions) => {
    const listeners = new AbortController(), { signal } = listeners;
    const zones = make("div", "oc-zones");
    zones.setAttribute("role", "group");
    zones.setAttribute("aria-label", "Outdoor zone");
    const zoneButtons = Object.entries(ZONE_BUTTONS).map(([id, label]) => {
      let icon;
      if (id === "main") {
        icon = make("img", "oc-zone-icon");
        icon.src = "art/main-island.png";
        icon.width = icon.height = 64;
        icon.alt = "";
      } else icon = BL.nativeIcons.svg("dsb");
      icon.classList.add("oc-zone-icon");
      const el = make("button", "oc-zone", icon, make("span", "", label));
      el.type = "button";
      el.dataset.zone = id;
      el.addEventListener("click", () => actions.zone(id), { signal });
      zones.append(el);
      return el;
    });
    const heard = make("p", "oc-heard");
    heard.setAttribute("role", "status");
    const grid = make("ul", "oc-people");
    const node = make("div", "oc-space", zones, heard, grid);
    const tiles = new Map();
    let pending = null, frame = 0, version = -1, current = null, self = null;
    const keyOf = (p) => `${p.id}:${p.generation}`;
    const tile = (p) => {
      const li = make("li", "oc-person"), dot = make("span", "oc-source-dot"), text = make("span", "oc-person-text"), voice = BL.nativeIcons.voice();
      voice.setAttribute("class", "oc-voice");
      const role = make("span", "oc-person-role", voice, make("span", ""));
      li.tabIndex = -1;
      li.dataset.key = keyOf(p);
      li.append(make("span", "oc-face"), make("span", "oc-person-name", dot, text), role);
      return { li, text, role, face: undefined, shown: "" };
    };
    // A tile's words, ring and face, changed only where they differ from what it shows.
    const dress = (t, p) => {
      const speaker = p.role === "speaker", you = p.id === self;
      const words = `${p.display}|${p.role}|${p.source}|${p.muted}|${you}`;
      if (t.face !== p.face) {
        t.li.firstChild.replaceWith(face({ avatar: p.face }));
        t.face = p.face;
      }
      if (t.shown === words) return;
      t.shown = words;
      t.li.dataset.role = p.role;
      t.li.dataset.source = p.source;
      t.li.dataset.muted = String(speaker && p.muted);
      t.text.textContent = p.display;
      t.li.title = p.display;
      t.role.lastChild.textContent = speaker ? "Speaker" : "Listener";
      const where = speaker ? p.source === "world" ? "speaking from the island" : "speaking from Ooga Chat" : "listening";
      t.li.setAttribute("aria-label", `${p.display}${you ? " (you)" : ""}, ${where}${speaker && p.muted ? ", muted" : ""}`);
    };
    // One pass: tiles for the list in order, reused by key, moved only when out of place; the rest go.
    const render = () => {
      frame = 0;
      const list = pending;
      pending = null;
      if (!list) return;
      const doc = node.ownerDocument, held = doc.activeElement?.parentElement === grid ? doc.activeElement.dataset.key : null;
      const keep = new Set();
      list.forEach((p, i) => {
        const key = keyOf(p);
        keep.add(key);
        let t = tiles.get(key);
        if (!t) tiles.set(key, t = tile(p));
        dress(t, p);
        if (grid.children[i] !== t.li) grid.insertBefore(t.li, grid.children[i] || null);
      });
      for (const [key, t] of tiles) if (!keep.has(key)) {
        t.li.remove();
        tiles.delete(key);
      }
      if (!tiles.has(current)) current = list.length ? keyOf(list[0]) : null;
      for (const [key, t] of tiles) t.li.tabIndex = key === current ? 0 : -1;
      if (held && tiles.has(held) && doc.activeElement !== tiles.get(held).li) tiles.get(held).li.focus({ preventScroll: true });
    };
    grid.addEventListener("keydown", (event) => {
      const items = [...grid.children], at = items.indexOf(event.target);
      if (at < 0) return;
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[event.key];
      const to = step ? items[Math.max(0, Math.min(items.length - 1, at + step))] : event.key === "Home" ? items[0] : event.key === "End" ? items.at(-1) : null;
      if (!to) return;
      event.preventDefault();
      event.target.tabIndex = -1;
      to.tabIndex = 0;
      current = to.dataset.key;
      to.focus();
    }, { signal });
    grid.addEventListener("focusin", (event) => {
      if (event.target.parentElement === grid) current = event.target.dataset.key;
    }, { signal });
    const update = (state) => {
      const { audience: heardState, zone } = state;
      self = state.session.identity.principal;
      for (const el of zoneButtons) el.setAttribute("aria-pressed", String(el.dataset.zone === zone));
      grid.setAttribute("aria-label", `People in ${ZONE_BUTTONS[zone]}`);
      const words = HEARD[heardState.status]?.(zone) || "";
      if (heard.textContent !== words) heard.textContent = words;
      heard.hidden = !words;
      node.dataset.audience = heardState.status;
      if (heardState.version === version) return;
      version = heardState.version;
      pending = heardState.list;
      if (!frame) frame = requestAnimationFrame(render);
    };
    const focus = () => (zoneButtons.find((el) => el.getAttribute("aria-pressed") === "true") || zoneButtons[0]).focus();
    const dispose = () => {
      listeners.abort();
      cancelAnimationFrame(frame);
      tiles.clear();
      node.remove();
    };
    return { node, update, focus, dispose };
  };
  // The account footer under every tab while signed in, and nothing while signed out: the reactions slot (#655 fills
  // it; empty until then) left of the account where there is room and above it where not, then the name (a purple dot
  // only while speaking from the app), the fixed-width microphone, always first and off for a listener, Join Voice for
  // a listener the server allows to speak (Leave Voice for a speaker), and Sign out. A disabled button says why on
  // itself. The voice state is the seam's (`state.voice`); nothing here opens a microphone.
  const account = ({ actions, media }) => {
    const listeners = new AbortController(), { signal } = listeners;
    const name = make("span", "oc-account-name"), dot = make("span", "oc-speaker-dot");
    dot.hidden = true;
    const mute = button("oc-foot-button oc-mute", "Unmute"), join = button("oc-foot-button oc-join", "Join voice"), out = button("oc-signout link", "Sign out");
    const muteWhy = explain(mute), joinWhy = explain(join);
    mute.addEventListener("click", () => actions.mute(), { signal });
    join.addEventListener("click", () => (join.dataset.voice === "speaker" ? actions.leaveVoice() : actions.joinVoice()), { signal });
    out.addEventListener("click", () => actions.signOut(), { signal });
    const reactions = make("div", "oc-reactions");
    reactions.hidden = true;
    const node = make("footer", "oc-account", reactions, make("div", "oc-account-main", make("p", "oc-account-who", dot, name),
      make("div", "oc-account-actions", mute, join, out, muteWhy, joinWhy)));
    node.hidden = true;
    const update = (state) => {
      const who = state.mode === "live" && state.session;
      node.hidden = !who && state.busy !== "signout";
      out.textContent = state.busy === "signout" ? "Signing out…" : "Sign out";
      out.disabled = !!state.busy;
      if (!who) return;
      if (name.textContent !== who.identity.display) {
        name.textContent = who.identity.display;
        name.title = who.identity.display;
      }
      const speaker = state.voice.role === "speaker", allowed = gates(state, Date.now());
      dot.hidden = !speaker;
      mute.disabled = !speaker || !!state.busy;
      mute.textContent = speaker && !state.voice.muted ? "Mute" : "Unmute";
      mute.setAttribute("aria-pressed", String(speaker && state.voice.muted));
      muteWhy.textContent = speaker ? "" : "Join voice first to unmute.";
      join.dataset.voice = speaker ? "speaker" : "listener";
      join.textContent = speaker ? "Leave voice" : "Join voice";
      join.disabled = speaker ? !!state.busy : !allowed.joinVoice || !media.available || !!state.busy;
      const why = speaker ? "" : allowed.why || (media.available ? "" : "Voice opens here soon.");
      joinWhy.textContent = why;
      join.title = why;
    };
    const dispose = () => {
      listeners.abort();
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
  BL.oogaChatViews = { chat, account, pending, face, make };
})();
