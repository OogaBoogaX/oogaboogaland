// Ooga Chat's startup, loaded last. It picks the adapter (the production one; the fixture one only on fixture.html,
// whose root says `data-adapter="fixture"` and which alone loads it), letters the title, builds the shell with the
// public tabs (Ooga Chat, Bananas, Contributing Oogas) and the contributor tabs (Online Oogas, The Commons), and moves
// through loading, then live, unavailable or stale. Unavailable is never a dead end: Try again asks again, and so does
// coming back online or back to the page. It starts no island system: no renderer, scene, socket or game.
// A failure shows a recoverable error with Reload; pagehide disposes the shell and the adapter.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { storageKey } = BL.oogaChatConfig, { chat, pending } = BL.oogaChatViews;
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
  let adapter = null, shell = null;
  const page = new AbortController();
  try {
    adapter = fixture ? BL.oogaChatFixtures.create({ state: new URLSearchParams(location.search).get("state") || undefined })
      : BL.oogaChatHttp.create();
    const key = storageKey(adapter.kind, "tab");
    let remembered;
    try { remembered = localStorage.getItem(key) || undefined; } catch { /* Storage may be unavailable. */ }
    let state = { mode: "loading", boot: null, session: null, busy: false };
    const set = (patch) => {
      state = { ...state, ...patch };
      shell.update(state);
    };
    const signedIn = () => state.mode === "live" && !!state.session;
    const contributor = () => signedIn() && state.session.capabilities.contributor;
    // One bootstrap at a time: at start, and again from unavailable.
    let starting = null;
    const start = () => starting ||= (async () => {
      root.dataset.mode = "loading";
      set({ mode: "loading" });
      const boot = await adapter.bootstrap();
      if (!boot.ok) {
        root.dataset.mode = boot.mode;
        set({ mode: boot.mode });
        return;
      }
      const session = await adapter.session(boot);
      root.dataset.mode = "live";
      set({ mode: "live", boot, session });
    })().catch(() => showError("Ooga Chat couldn't start")).finally(() => { starting = null; });
    const again = () => state.mode === "unavailable" && start();
    const actions = {
      retry: again,
      signIn(provider) {
        if (state.mode !== "live" || state.busy) return;
        const session = adapter.signIn(state.boot, provider);
        if (session) set({ session });
      },
      async signOut() {
        if (state.busy) return;
        set({ busy: true });
        try { set({ session: await adapter.signOut(state.boot), busy: false }); } catch { set({ busy: false }); showError("Sign out didn't finish"); }
      }
    };
    shell = BL.oogaChatShell.create({ root, ctx: { actions }, selected: remembered, onSelect(id) {
      try { localStorage.setItem(key, id); } catch { /* Storage may be unavailable. */ }
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
    BL.signGlyphs.letter(root.querySelector(".oc-title [data-sign]"));
    // Back online, or back to the page, while the service could not be reached: ask again without a click.
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && again(), { signal: page.signal });
    addEventListener("online", again, { signal: page.signal });
    start();
  } catch {
    showError("Ooga Chat couldn't start");
  }
  addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    page.abort();
    shell?.dispose();
    adapter?.dispose();
  });
})();
