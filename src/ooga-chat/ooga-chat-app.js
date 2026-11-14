// Ooga Chat's startup, loaded last. It picks the adapter (the production one; the fixture one only on fixture.html,
// whose root says `data-adapter="fixture"` and which alone loads it), letters the title, builds the shell with the
// public tabs (Ooga Chat, Bananas, Contributing Oogas) and the contributor tabs (Online Oogas, The Commons), keeps the
// account footer under them, and moves through loading, then live, unavailable or stale. The account is
// ooga-chat-auth.js's: a sign-in return (`?signin=`) is read once and dropped from the address, the session is checked
// before any control shows, and again on the session's own deadlines, on a return to the page and on reconnecting.
// It starts no island system: no renderer, scene, socket or game. A failure shows a recoverable error with Reload;
// pagehide disposes the shell, the footer, the account and the adapter.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { storageKey, sweep, parseReturn, withoutReturn, parseZone } = BL.oogaChatConfig, { chat, account, pending } = BL.oogaChatViews;
  const { gates } = BL.oogaChatAuth;
  const root = document.getElementById("ooga-chat");
  const fixture = root.dataset.adapter === "fixture";
  const showError = (text) => {
    const box = root.querySelector(".oc-error"), reload = document.createElement("button");
    reload.type = "button";
    reload.className = "link";
    reload.textContent = "Reload";
    reload.addEventListener("click", () => location.reload(), { once: true });
    box.replaceChildren(`${text} · `, reload);
    box.hidden = false;
  };
  // The voice seam (#654's SFU client takes its place). Until then nothing captures or publishes, so Join Voice stays
  // off and there is nothing for `release` to stop.
  const media = { available: false, release() {}, join() {} };
  let adapter = null, shell = null, footer = null, auth = null;
  const page = new AbortController();
  try {
    // A sign-in return is a result code only; it leaves the address before anything else runs.
    const back = parseReturn(location.search);
    if (back) history.replaceState(history.state, "", `${location.pathname}${withoutReturn(location.search)}${location.hash}`);
    adapter = fixture ? BL.oogaChatFixtures.create({ state: new URLSearchParams(location.search).get("state") || undefined })
      : BL.oogaChatHttp.create();
    const tabKey = storageKey(adapter.kind, "tab"), zoneKey = storageKey(adapter.kind, "zone");
    let remembered, zone;
    try {
      sweep(localStorage, adapter.kind);
      remembered = localStorage.getItem(tabKey) || undefined;
      zone = parseZone(localStorage.getItem(zoneKey));
    } catch { zone = parseZone(null); /* Storage may be unavailable. */ }
    let state = { mode: "loading", boot: null, session: null, auth: "checking", notice: null, busy: false, zone };
    const set = (patch) => {
      state = { ...state, ...patch };
      shell.update(state);
      footer.update(state);
    };
    const contributor = () => state.mode === "live" && gates(state, Date.now()).contributor;
    const actions = {
      signIn: (provider) => state.mode === "live" && auth.signIn(provider),
      // Signing out lands on Ooga Chat's sign-in, whatever tab was open.
      signOut: () => {
        shell.select("chat");
        return auth.signOut();
      },
      retry: () => auth.retry(),
      // Asked again at the moment of the click: only the server's answer opens voice, and it decides again there.
      joinVoice: () => {
        if (media.available && gates(state, Date.now()).joinVoice) media.join(state);
      }
    };
    const ctx = { actions, media };
    shell = BL.oogaChatShell.create({ root, ctx, selected: back ? "chat" : remembered, onSelect(id) {
      try { localStorage.setItem(tabKey, id); } catch { /* Storage may be unavailable. */ }
    }, tabs: [
      { id: "chat", label: "Ooga Chat", icon: "cloud", visible: () => true, view: chat },
      { id: "bananas", label: "Bananas", icon: "bananas", visible: () => true,
        view: pending("Bananas donated", "The island's Bananas panel and Feed the Oogas come here next.") },
      { id: "roster", label: "Contributing Oogas", icon: "roster", visible: () => true,
        view: pending("Contributing Oogas", "The island's full Contributing Oogas list comes here next.") },
      { id: "players", label: "Online Oogas", icon: "players", visible: contributor,
        view: pending("Online Oogas", "Online Oogas for contributors comes here next.") },
      { id: "commons", label: "The Commons", icon: "chat", visible: contributor,
        view: pending("The Commons", "The Commons, the contributors' text chat, comes here next.") }
    ] });
    footer = account(ctx);
    root.querySelector(".oc-frame").append(footer.node);
    auth = BL.oogaChatAuth.create({ adapter, media, onChange: (next) => set(next) });
    BL.signGlyphs.letter(root.querySelector(".oc-title [data-sign]"));
    root.dataset.mode = "loading";
    set({});
    // Back to the page, or back online: the session and its role are checked again before anything acts on them.
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && auth.check("visible"), { signal: page.signal });
    addEventListener("online", () => auth.check("online"), { signal: page.signal });
    addEventListener("pageshow", (event) => event.persisted && auth.resume(), { signal: page.signal });
    (async () => {
      const boot = await adapter.bootstrap();
      if (!boot.ok) {
        root.dataset.mode = boot.mode;
        set({ mode: boot.mode, auth: "signed-out" });
        return;
      }
      root.dataset.mode = "live";
      set({ mode: "live", boot });
      await auth.start(boot, back);
    })().catch(() => showError("Ooga Chat couldn't start"));
  } catch {
    showError("Ooga Chat couldn't start");
  }
  addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    page.abort();
    auth?.dispose();
    shell?.dispose();
    footer?.dispose();
    adapter?.dispose();
  });
})();
