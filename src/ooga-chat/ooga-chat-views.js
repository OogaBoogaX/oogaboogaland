// Ooga Chat's views, each `view(ctx)` returning `{ node, update(state), dispose() }` for ooga-chat-shell.js. `ctx`
// carries `actions` (`signIn(provider)`, `signOut()`); `state` is `{ mode, boot, session, busy }`, where `mode` is
// loading, live, unavailable or stale. `chat` is the Ooga Chat tab: sign-in, or the signed-in account and its
// controls. `pending(title)` stands in for a panel the shared island panels (Bananas, Contributing Oogas, Online Oogas,
// The Commons) will fill; it says so instead of showing invented data.
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
  const PROVIDER_LABELS = { github: "Continue with GitHub", x: "Continue with X" };
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
    const providers = Object.fromEntries(Object.entries(PROVIDER_LABELS).map(([provider, text]) => {
      const el = button("oc-provider", text);
      el.dataset.provider = provider;
      el.addEventListener("click", () => actions.signIn(provider), { signal });
      return [provider, el];
    }));
    const signedOut = make("div", "oc-signin",
      art,
      make("p", "oc-lede", "Listen to the island.", make("br"), "Speak from the clouds."),
      make("p", "oc-status-line", status, reload),
      make("div", "oc-providers", providers.github, providers.x),
      make("div", "oc-note", make("strong", "", "Everyone can listen."),
        make("span", "", "Team Ooga Booga contributors signed in with GitHub can also speak from a cloud.")),
      make("p", "oc-foot", "X accounts join as listeners."));
    const role = make("p", "oc-role");
    const signedIn = make("div", "oc-space", make("h2", "slab-head oc-space-head", "Outdoor audio"), role);
    const slab = make("div", "slab oc-slab", signedOut, signedIn);
    // The account footer: the name (a purple dot only while speaking from the app), a fixed-width mute that only a
    // speaker can use, Join Voice where the server allows speaking, and Sign out.
    const name = make("span", "oc-account-name"), dot = make("span", "oc-speaker-dot");
    dot.hidden = true;
    const mute = button("oc-foot-button oc-mute", "Mute"), join = button("oc-foot-button", "Join voice"), out = button("oc-signout link", "Sign out");
    mute.disabled = true;
    out.addEventListener("click", () => actions.signOut(), { signal });
    const account = make("div", "oc-account", make("p", "oc-account-who", dot, name), make("div", "oc-account-actions", mute, join, out));
    const node = make("div", "oc-chat", slab, account);
    const update = ({ mode, boot, session, busy }) => {
      const live = mode === "live", who = live && session;
      signedOut.hidden = !!who;
      signedIn.hidden = account.hidden = !who;
      status.textContent = STATUS[mode] || "";
      status.parentElement.hidden = live;
      reload.hidden = mode !== "stale" && !(live && boot.newer);
      if (live && boot.newer) {
        status.textContent = "A newer Ooga Chat is out.";
        status.parentElement.hidden = false;
      }
      for (const [provider, el] of Object.entries(providers)) el.disabled = !live || !boot.features[provider] || !!busy;
      if (!who) return;
      name.textContent = session.identity.display;
      const speaker = session.capabilities.speak;
      role.textContent = speaker ? "You're listening. Join voice to speak from a cloud once voice opens here."
        : "You're listening. Outdoor audio opens here soon.";
      // Voice itself arrives with the SFU client; until then Join Voice is shown to speakers and stays disabled.
      join.hidden = !speaker;
      join.disabled = true;
      out.disabled = !!busy;
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
  BL.oogaChatViews = { chat, pending, make };
})();
