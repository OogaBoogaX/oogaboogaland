// Ooga Chat's startup, loaded last. It picks the adapter (the production one; the fixture one only on fixture.html,
// whose root says `data-adapter="fixture"` and which alone loads it), letters the title, builds the shell with the
// public tabs (Ooga Chat, Bananas, Contributing Oogas) and the contributor tabs (Online Oogas, The Commons), keeps the
// account footer under them, and moves through loading, then live, unavailable or stale. The account is
// ooga-chat-auth.js's: a sign-in return (`?signin=`) is read once and dropped from the address, the session is checked
// before any control shows, and again on the session's own deadlines, on a return to the page and on reconnecting.
// Unavailable is never a dead end: Try again asks the service again, and so does coming back online or to the page.
// A signed-in account hears its zone's audience: the adapter's feed, kept by ooga-chat-roster.js, which asks for a fresh
// snapshot after a gap; the views draw `state.audience` (`status`, `zone`, `list` in the space's order, `version`).
// The device (ooga-chat-device.js) reports the network, install help and a waiting update, and registers the service
// worker for the production entry of a staged build; M mutes or unmutes a speaker. It starts no island system: no
// renderer, scene, socket or game. A failure shows a recoverable error with Reload;
// pagehide disposes the shell, the footer, the account and the adapter.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { storageKey, sweep, parseReturn, withoutReturn, parseZone, appBuild } = BL.oogaChatConfig, { chat, account, device: deviceBar, pending } = BL.oogaChatViews;
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
  // off, `state` is always a muted listener, and there is nothing for `release`, `zone`, `mute` or `leave` to change.
  // `zone(next)` is where the client moves or ends its lease for another zone; no role shows there before the server
  // acknowledges it in the new zone's audience.
  const media = { available: false, state: Object.freeze({ role: "listener", muted: true }), release() {}, join() {}, leave() {}, mute() {}, zone() {} };
  // `relisten` is the feed's 4401 restart timer; pagehide clears it, so it lives out here with what pagehide disposes.
  let adapter = null, shell = null, footer = null, auth = null, feed = null, device = null, bar = null, relisten = 0;
  const page = new AbortController();
  try {
    // A sign-in return is a result code only; it leaves the address before anything else runs.
    const back = parseReturn(location.search);
    if (back) history.replaceState(history.state, "", `${location.pathname}${withoutReturn(location.search)}${location.hash}`);
    const query = new URLSearchParams(location.search);
    adapter = fixture ? BL.oogaChatFixtures.create({ state: query.get("state") || undefined, roster: query.get("roster") || undefined })
      : BL.oogaChatHttp.create();
    const tabKey = storageKey(adapter.kind, "tab"), zoneKey = storageKey(adapter.kind, "zone");
    let remembered, zone;
    try {
      sweep(localStorage, adapter.kind);
      remembered = localStorage.getItem(tabKey) || undefined;
      zone = parseZone(localStorage.getItem(zoneKey));
    } catch { zone = parseZone(null); /* Storage may be unavailable. */ }
    const roster = BL.oogaChatRoster.create();
    let listening = null, heard = 0, refused = 0;
    let state = { mode: "loading", boot: null, session: null, auth: "checking", notice: null, busy: false, zone, voice: media.state,
      audience: { status: "off", zone, list: [], version: 0 }, device: { online: navigator.onLine !== false, install: null, update: false } };
    const set = (patch) => {
      state = { ...state, ...patch, voice: media.state };
      shell.update(state);
      footer.update(state);
      bar.update(state);
    };
    // The audience as the views see it: the feed's status, and the list in order once a snapshot for the zone is in.
    const hear = (status) => set({ audience: { status, zone: state.zone, list: roster.ready ? roster.list(state.session?.identity.participant) : [], version: ++heard } });
    // One feed per signed-in principal, for the page's zone; none while signed out. Another principal starts again empty;
    // a feed restarted for the same one (`kept`) keeps its list until the new snapshot replaces it.
    const listen = (kept = null) => {
      const principal = state.mode === "live" && state.session ? state.session.identity.principal : null;
      if (principal === listening) return;
      clearTimeout(relisten);
      relisten = 0;
      feed?.dispose();
      feed = null;
      listening = principal;
      if (principal !== kept) roster.expect(state.zone);
      if (!principal) return hear("off");
      feed = adapter.audience(state.boot, {
        message(msg) {
          const result = roster.apply(msg);
          if (result === "gap") feed.resync();
          if (result === "applied") {
            refused = 0;
            hear("live");
          }
        },
        // A closed session (4401) is checked again, the list kept meanwhile, marked as reconnecting rather than live.
        // Then the feed starts afresh from what the check leaves: the same principal listens again, a signed-out one
        // stops. A server that keeps refusing is asked less often, up to 16 s apart.
        status(next) {
          if (next !== "signed-out") return hear(next);
          hear("reconnecting");
          const own = feed;
          refused = Math.min(refused + 1, 6);
          clearTimeout(relisten);
          relisten = setTimeout(() => {
            relisten = 0;
            if (feed !== own) return;
            Promise.resolve(auth.check("retry")).finally(() => {
              if (feed !== own) return;
              const kept = listening;
              listening = null;
              listen(kept);
            });
          }, refused > 1 ? 1000 * 2 ** (refused - 2) : 0);
        }
      });
      feed.zone(state.zone);
    };
    const contributor = () => state.mode === "live" && gates(state, Date.now()).contributor;
    // One bootstrap at a time: at start, and again from unavailable. The sign-in return is read on the first only.
    let starting = null, returned = back;
    const start = () => starting ||= (async () => {
      root.dataset.mode = "loading";
      set({ mode: "loading", auth: "checking" });
      const boot = await adapter.bootstrap();
      if (!boot.ok) {
        root.dataset.mode = boot.mode;
        set({ mode: boot.mode, auth: "signed-out" });
        return;
      }
      root.dataset.mode = "live";
      set({ mode: "live", boot });
      const once = returned;
      returned = null;
      await auth.start(boot, once);
    })().catch(() => showError("Ooga Chat couldn't start")).finally(() => { starting = null; });
    const actions = {
      signIn: (provider) => state.mode === "live" && auth.signIn(provider),
      // Signing out lands on Ooga Chat's sign-in, whatever tab was open.
      signOut: () => {
        shell.select("chat");
        return auth.signOut();
      },
      // From unavailable, ask the service again; otherwise retry what the account's notice offers.
      retry: () => state.mode === "unavailable" ? start() : auth.retry(),
      // The zone already chosen changes nothing: the microphone, hand and pending media stay as they are. Another one
      // starts its list again empty, joining until the new zone's snapshot, and hands the voice lease to the seam.
      zone: (next) => {
        if (next === state.zone || !BL.oogaChatConfig.ZONES.includes(next)) return;
        try { localStorage.setItem(zoneKey, next); } catch { /* Storage may be unavailable. */ }
        media.zone(next);
        roster.expect(next);
        state = { ...state, zone: next };
        if (feed) {
          hear("joining");
          feed.zone(next);
        } else hear("off");
      },
      mute: () => media.mute(),
      leaveVoice: () => media.leave(),
      // Asked again at the moment of the click: only the server's answer opens voice, and it decides again there.
      joinVoice: () => {
        if (media.available && gates(state, Date.now()).joinVoice) media.join(state);
      }
    };
    const ctx = { actions, media, install: () => device.install(), reload: () => device.reload() };
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
    bar = deviceBar(ctx);
    root.querySelector(".oc-frame").after(bar.node);
    auth = BL.oogaChatAuth.create({ adapter, media, onChange: (next) => {
      set(next);
      listen();
    } });
    device = BL.oogaChatDevice.create({ register: !fixture && appBuild(document) !== "dev", onChange: (next) => set({ device: next }) });
    state = { ...state, device: device.state };
    BL.signGlyphs.letter(root.querySelector(".oc-title [data-sign]"));
    root.dataset.mode = "loading";
    set({});
    // Back to the page, or back online: the service is asked again if it could not be reached, else the session and its
    // role are checked again before anything acts on them.
    const again = (why) => state.mode === "unavailable" ? start() : auth.check(why);
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && again("visible"), { signal: page.signal });
    addEventListener("online", () => again("online"), { signal: page.signal });
    addEventListener("pageshow", (event) => event.persisted && auth.resume(), { signal: page.signal });
    // M is the speaker's own microphone, never while typing, composing, holding a modifier or repeating.
    document.addEventListener("keydown", (event) => {
      if (state.voice.role !== "speaker" || !BL.oogaChatDevice.isMuteKey(event)) return;
      event.preventDefault();
      actions.mute();
    }, { signal: page.signal });
    start();
  } catch {
    showError("Ooga Chat couldn't start");
  }
  addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    page.abort();
    clearTimeout(relisten);
    feed?.dispose();
    device?.dispose();
    bar?.dispose();
    auth?.dispose();
    shell?.dispose();
    footer?.dispose();
    adapter?.dispose();
  });
})();
