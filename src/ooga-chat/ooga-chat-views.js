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
    // The space: for now the visitor alone, as a listener; the zone roster (#653) fills it.
    const space = make("h2", "slab-head oc-space-head", "Outdoor audio");
    space.tabIndex = -1;
    const name = make("span", "oc-person-name"), self = make("figure", "oc-person", make("span", "oc-face"),
      make("figcaption", "", name, make("span", "oc-person-role", "Listener")));
    const signedIn = make("div", "oc-space", space, make("div", "oc-people", self));
    const slab = make("div", "slab oc-slab", make("p", "oc-status-line", status, reload), alert.el, signedOut, signedIn);
    const node = make("div", "oc-chat", slab);
    let principal = null, avatar = null, refocus = false;
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
        principal = avatar = null;
        const first = Object.values(providers).find((el) => !el.disabled);
        if (refocus && first) {
          refocus = false;
          if (lost) first.focus();
        }
        return;
      }
      refocus = false;
      const identity = session.identity;
      if (identity.principal !== principal || identity.avatar !== avatar) {
        self.firstChild.replaceWith(face(identity));
        principal = identity.principal;
        avatar = identity.avatar;
      }
      // A rename changes the words only; the face and anything keyed by the principal stay.
      if (name.textContent !== identity.display) {
        name.textContent = identity.display;
        self.title = identity.display;
        self.setAttribute("aria-label", `${identity.display}, listening (you)`);
      }
      if (was !== principal && lost) space.focus();
    };
    const dispose = () => {
      listeners.abort();
      node.remove();
    };
    return { node, update, dispose };
  };
  // The account footer under every tab while signed in, and nothing while signed out: the name (a purple dot only while
  // speaking from the app), the fixed-width microphone (off for a listener), Join Voice where the server allows
  // speaking and the voice seam is ready, and Sign out. A disabled button says why on itself.
  const account = ({ actions, media }) => {
    const listeners = new AbortController(), { signal } = listeners;
    const name = make("span", "oc-account-name"), dot = make("span", "oc-speaker-dot");
    dot.hidden = true;
    const mute = button("oc-foot-button oc-mute", "Unmute"), join = button("oc-foot-button oc-join", "Join voice"), out = button("oc-signout link", "Sign out");
    const muteWhy = explain(mute), joinWhy = explain(join);
    mute.disabled = true;
    muteWhy.textContent = "Join voice first to unmute.";
    join.addEventListener("click", () => actions.joinVoice(), { signal });
    out.addEventListener("click", () => actions.signOut(), { signal });
    const node = make("footer", "oc-account", make("p", "oc-account-who", dot, name),
      make("div", "oc-account-actions", mute, join, out, muteWhy, joinWhy));
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
      const allowed = gates(state, Date.now());
      join.disabled = !allowed.joinVoice || !media.available || !!state.busy;
      const why = allowed.why || (media.available ? "" : "Voice opens here soon.");
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
