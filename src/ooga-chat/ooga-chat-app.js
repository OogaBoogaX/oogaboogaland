// Ooga Chat's startup, loaded last. It picks the adapter (the production one; the fixture one only on fixture.html,
// whose root says `data-adapter="fixture"` and which alone loads it), letters the title, builds the shell with the
// public tabs (Ooga Chat, Bananas, Contributing Oogas) and the contributor tabs (Online Oogas, The Commons), each the
// island's own panel with its account controls where the island keeps them, and moves through loading, then live, unavailable or stale. The account is
// ooga-chat-auth.js's: a sign-in return (`?signin=`) is read once and dropped from the address, the session is checked
// before any control shows, and again on the session's own deadlines, on a return to the page and on reconnecting.
// Unavailable is never a dead end: Try again asks the service again, and so does coming back online or to the page.
// A signed-in account hears its zone's audience: the adapter's feed, kept by ooga-chat-roster.js, which asks for a fresh
// snapshot after a gap; the views draw `state.audience` (`status`, `zone`, `list` in the space's order, `version`).
// The device (ooga-chat-device.js) reports the network, install help and a waiting update, and registers the service
// worker for the production entry of a staged build; M mutes or unmutes a speaker. Voice is ooga-chat-media.js's one
// controller (#654): it hears the feed's snapshots, `you`, results and media notices, and the views read its state as
// `state.voice`. A speaker whose page is hidden or leaves has the controller leave word in this tab's session storage
// (`speaker`: the account, zone, connection and time, nothing else), taken back when the page is shown again, so a page
// that comes straight back after a refresh speaks again, muted, as after a dropped socket. It starts no island system: no
// renderer, scene, socket or game. A failure shows a recoverable error with Reload;
// pagehide disposes the shell, the account and the adapter.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { storageKey, sweep, parseReturn, withoutReturn, parseZone, appBuild } = BL.oogaChatConfig, { chat, device: deviceBar, bananas, roster: contributingOogas, commons, online } = BL.oogaChatViews;
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
  // The voice seam until the controller is made (and if it can't be): a muted listener that captures nothing.
  let media = { available: false, why: "", state: BL.oogaChatMedia.IDLE, heard() {}, status() {}, release() {}, join() {}, leave() {}, mute() {}, zone() {}, stop() {}, retry() {}, remember() {}, dispose() {} };
  // `relisten` is the feed's 4401 restart timer; pagehide clears it, so it lives out here with what pagehide disposes.
  // `donating` ends the donation socket, opened once the service says its feed is live; `feeding` is Feed the Oogas,
  // the island's own donation popup, made the first time it opens; `member` is the Commons socket.
  let adapter = null, shell = null, auth = null, feed = null, device = null, bar = null, relisten = 0, donating = null, feeding = null, member = null;
  const page = new AbortController();
  try {
    // Donations here are the service's or nothing: donations.js never plays its simulated tips in the app.
    BL.donations.config.simulate = false;
    // A sign-in return is a result code only; it leaves the address before anything else runs.
    const back = parseReturn(location.search);
    if (back) history.replaceState(history.state, "", `${location.pathname}${withoutReturn(location.search)}${location.hash}`);
    const query = new URLSearchParams(location.search);
    adapter = fixture ? BL.oogaChatFixtures.create({ state: query.get("state") || undefined, roster: query.get("roster") || undefined, voice: query.get("voice") || undefined })
      : BL.oogaChatHttp.create();
    // Voice (ooga-chat-media.js): it calls the adapter's media broker under the feed's own connection, asks the feed for a
    // speaker lease, and speaks only where this deployment lets contributors speak. The fixture brings its own WebRTC.
    // A speaker's word to the page after it in this tab (a refresh): session storage, read once and removed.
    const speakerKey = storageKey(adapter.kind, "speaker");
    const memory = {
      take() {
        try {
          const raw = sessionStorage.getItem(speakerKey);
          sessionStorage.removeItem(speakerKey);
          return raw ? JSON.parse(raw) : null;
        } catch { return null; }
      },
      keep(record) {
        try {
          if (record) sessionStorage.setItem(speakerKey, JSON.stringify(record));
          else sessionStorage.removeItem(speakerKey);
        } catch { /* Storage may be unavailable. */ }
      }
    };
    media = BL.oogaChatMedia.create({
      memory,
      broker: () => state.mode === "live" && state.boot ? adapter.media(state.boot) : null,
      ...(adapter.rtc ? { rtc: adapter.rtc } : {}),
      request: (type, fields) => feed ? feed.request(type, fields) : 0,
      allowed: () => state.mode === "live" && !!state.boot && state.boot.features.speak && !!state.boot.paths.audience,
      onChange: () => { if (shell && bar) set({}); }
    });
    const tabKey = storageKey(adapter.kind, "tab"), zoneKey = storageKey(adapter.kind, "zone");
    let remembered, zone;
    try {
      sweep(localStorage, adapter.kind);
      remembered = localStorage.getItem(tabKey) || undefined;
    } catch { /* Storage may be unavailable. */ }
    // Main Island alone for now, whatever an earlier visit chose: the space has no zone buttons to change it back.
    zone = parseZone(null);
    const roster = BL.oogaChatRoster.create();
    const donor = BL.oogaChatDonor.create({ key: storageKey(adapter.kind, "donor") });
    const town = BL.oogaChatCommons.create();
    let listening = null, heard = 0, refused = 0;
    let state = { mode: "loading", boot: null, session: null, auth: "checking", notice: null, busy: false, zone, voice: media.state,
      audience: { status: "off", zone, list: [], version: 0 }, commons: { status: "off" }, device: { online: navigator.onLine !== false, install: null, update: false } };
    // The emoji bar's connection (reaction-bar.js, #655): its state follows the session and the audience feed (shown
    // signed in, working while the feed is live), its hand follows the visitor's own row as the server keeps it, and
    // what it sends goes over the audience socket as a request (#668). A hand the server refuses goes back to the row's.
    // Every reaction the server sends to the zone, the visitor's own included, pops over that participant's circle.
    const linkSubs = new Set(), pops = new Set();
    let handRequest = 0;
    const link = { state: { me: null, reactions: false, room: "off", hand: false, handTone: 0, handEmoji: "", customHand: true },
      sendReaction: (emoji) => !!feed && feed.request("reaction", { emoji }) > 0,
      setHand(on, tone, emoji) {
        handRequest = feed ? feed.request("hand", { on, tone, ...(emoji ? { emoji } : {}) }) : 0;
        if (!handRequest) return false;
        Object.assign(link.state, { hand: on, handTone: tone, handEmoji: on ? emoji || "" : "" });
        for (const fn of linkSubs) fn(link.state);
        return true;
      },
      subscribe(fn) { linkSubs.add(fn); return () => linkSubs.delete(fn); } };
    const ownHand = () => {
      const id = state.session?.identity.participant, me = id ? state.audience.list.find((p) => p.id === id) : null;
      return me ? me.hand : "";
    };
    const syncLink = (force = false) => {
      const s = link.state, who = state.mode === "live" && state.session ? state.session.identity : null, room = who ? state.audience.status : "off";
      const hand = ownHand(), next = { me: who, reactions: !!who, room, hand: !!hand, handEmoji: hand };
      if (!force && s.me === next.me && s.reactions === next.reactions && s.room === next.room && (handRequest || s.hand === next.hand && s.handEmoji === next.handEmoji)) return;
      Object.assign(s, handRequest ? { me: next.me, reactions: next.reactions, room } : next);
      for (const fn of linkSubs) fn(s);
    };
    // The voice switch prompt (voice-handoff.js): asked once a page, as it arrives, when its first audience connection
    // finds the account's voice on another device (the island's, or another Ooga Chat page's), and again whenever Join
    // Voice is pressed while it is. A voice that goes elsewhere later is the visitor's own doing and asks nothing.
    // Switch here joins with `takeover`, inside its click; Not now changes nothing.
    let handoffChecked = false;
    const handoff = BL.voiceHandoff.build({ onSwitch: () => { if (media.available && gates(state, Date.now()).joinVoice) media.join({ takeover: true }); } });
    document.body.append(handoff.node);
    page.signal.addEventListener("abort", () => handoff.node.remove());
    const set = (patch) => {
      state = { ...state, ...patch, voice: media.state };
      shell.update(state);
      bar.update(state);
      syncLink();
      const elsewhere = state.mode === "live" && !!state.session && !!state.voice.elsewhere && media.available && gates(state, Date.now()).joinVoice;
      // The voice controller has the server's word on this connection once it is past `off`: read once.
      const first = !handoffChecked && state.voice.phase !== "off";
      if (first) handoffChecked = true;
      if (!elsewhere) handoff.close();
      else if (first) handoff.open();
    };
    // The audience as the views see it: the feed's status, and the list in order once a snapshot for the zone is in.
    const hear = (status) => {
      media.status(status);
      set({ audience: { status, zone: state.zone, list: roster.ready ? roster.list(state.session?.identity.participant) : [], version: ++heard } });
    };
    // One feed per signed-in principal, for the page's zone; none while signed out. Another principal starts again empty;
    // a feed restarted for the same one (`kept`) keeps its list until the new snapshot replaces it.
    const listen = (kept = null) => {
      const principal = state.mode === "live" && state.session ? state.session.identity.principal : null;
      if (principal === listening) return;
      clearTimeout(relisten);
      relisten = 0;
      // The same account's feed starting again is a reconnect to the voice, which keeps a speaker's place (its
      // `reconnecting`); anyone else's, or none, ends it.
      if (principal && principal === kept) media.status("reconnecting");
      else media.stop();
      feed?.dispose();
      feed = null;
      handRequest = 0;
      listening = principal;
      if (principal !== kept) roster.expect(state.zone);
      if (!principal) return hear("off");
      feed = adapter.audience(state.boot, {
        message(msg) {
          if (msg && msg.type === "reaction") {
            if (msg.zone === state.zone && typeof msg.participantId === "string" && typeof msg.emoji === "string" && BL.reactionPolicy.valid(msg.emoji))
              for (const fn of pops) fn(msg.participantId, msg.emoji);
            return;
          }
          if (msg && msg.type === "result") {
            media.heard(msg);
            // The hand's own answer: the visitor's row decides from here, whatever was shown meanwhile.
            if (msg.requestId === handRequest) { handRequest = 0; syncLink(true); }
            return;
          }
          if (msg && (msg.type === "you" || msg.type === "media")) return media.heard(msg);
          const result = roster.apply(msg);
          if (result === "gap") feed.resync();
          if (result === "applied") {
            refused = 0;
            hear("live");
            // After the roster, so a new connection's voice starts from the list the views now show.
            if (msg.type === "snapshot") media.heard(msg);
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
      media.zone(state.zone);
      feed.zone(state.zone);
    };
    const contributor = () => state.mode === "live" && gates(state, Date.now()).contributor;
    // The Commons and Online Oogas (#670): one member socket per eligible contributor while the server offers it. Another
    // principal, or none, starts again empty. A closed session (4401) is checked again, and the socket ends or comes
    // back with the check's answer; a refusal (4403) waits for the next check.
    let membership = null;
    const joinCommons = () => {
      const principal = contributor() && state.boot.features.commons ? state.session.identity.principal : null;
      if (principal === membership) return;
      member?.dispose();
      member = null;
      membership = principal;
      town.reset();
      if (!principal) return set({ commons: { status: contributor() ? "closed" : "off" } });
      member = adapter.commons(state.boot, { message: town.apply, status(next) {
        set({ commons: { status: next } });
        if (next === "signed-out") Promise.resolve(auth.check("retry")).finally(() => { membership = null; joinCommons(); });
      } });
    };
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
      // The Bananas panel's figures: the island's donation socket over this origin's /donations relay (#664).
      // A paid tip this page asked for teaches the popup its name, and every donation and on-chain sighting goes to
      // the popup, which takes only its own invoice's.
      if (boot.features.feed === "live" && !donating) {
        BL.donations.useOrigin();
        donating = BL.donations.subscribe((donation, bananas) => {
          if (BL.donations.receivedOwnInvoice(donation.id)) donor.rememberHandle(donation.handle);
          feeding?.receive(donation, bananas);
        }, { onSeen: (id, sats, due, left, pricing) => feeding?.seen(id, sats, due, left, pricing) });
      }
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
      retryVoice: () => media.retry(),
      // Asked again at the moment of the click: only the server's answer opens voice, and it decides again there.
      joinVoice: () => {
        // Voice held on another device moves here only on the visitor's word: the prompt asks.
        if (state.voice.elsewhere) { if (media.available && gates(state, Date.now()).joinVoice) handoff.open(); return; }
        if (media.available && gates(state, Date.now()).joinVoice) media.join();
      }
    };
    // Feed the Oogas: real over this origin's relay while the feed is live, the simulated kiosk only on the fixture
    // entry's demo, nothing otherwise. A GitHub account's login is the real default name; an X account or a visitor
    // gives as anon unless they type a name (the server alone names a verified donor).
    const feedOogas = () => {
      const mode = state.mode === "live" ? state.boot.features.feed : "off";
      if (mode !== "live" && !(mode === "demo" && fixture)) return;
      // The fixture's demo takes the simulated kiosk's payments, so a receipt shows; a live feed, the fixture's
      // `real-payment` too, never simulates one.
      feeding ||= BL.donationPopup.create(donor, mode === "demo" ? (donation) => adapter.demo.receive(donation) : null, {
        login: () => state.session?.identity.provider === "github" ? state.session.identity.login : undefined,
        bananasFor: BL.oogaChatDonor.bananasFor, price: () => 0, link: () => `${location.origin}/`
      });
      feeding.open(mode === "demo");
    };
    const ctx = { actions, media, install: () => device.install(), reload: () => device.reload(), storageKey: (name) => storageKey(adapter.kind, name),
      demo: fixture ? adapter.demo : null, feed: feedOogas, commons: { model: town, send: (data) => !!member && member.send(data),
        // The name field: saved as the island's display name, then the Commons is joined again so the Room's welcome,
        // and every line after it, carries the new name (as an island page joins again after its own rename).
        rename: async (display) => {
          const result = await adapter.commonsName(display);
          if (result.ok) { membership = null; joinCommons(); }
          return result;
        } },
      contributors: () => adapter.contributors(),
      reactions: { bars: BL.reactionBar.create(link), onPop(fn) { pops.add(fn); return () => pops.delete(fn); } } };
    shell = BL.oogaChatShell.create({ root, ctx, selected: back ? "chat" : remembered, onSelect(id) {
      try { localStorage.setItem(tabKey, id); } catch { /* Storage may be unavailable. */ }
    }, tabs: [
      { id: "chat", label: "Ooga Chat", icon: "cloud", visible: () => true, view: chat },
      { id: "bananas", label: "Bananas", icon: "bananas", visible: () => true, view: bananas },
      { id: "roster", label: "Contributing Oogas", icon: "roster", visible: () => true, view: contributingOogas },
      { id: "players", label: "Online Oogas", icon: "players", visible: contributor, view: online },
      { id: "commons", label: "The Commons", icon: "chat", visible: contributor, view: commons }
    ] });
    bar = deviceBar(ctx);
    root.querySelector(".oc-frame").after(bar.node);
    auth = BL.oogaChatAuth.create({ adapter, media, onChange: (next) => {
      set(next);
      listen();
      joinCommons();
    } });
    device = BL.oogaChatDevice.create({ register: !fixture && appBuild(document) !== "dev", onChange: (next) => set({ device: next }) });
    state = { ...state, device: device.state };
    BL.signGlyphs.letter(root.querySelector(".oc-title [data-sign]"));
    root.dataset.mode = "loading";
    set({});
    // Back to the page, or back online: the service is asked again if it could not be reached, else the session and its
    // role are checked again before anything acts on them.
    // The audience feed is woken too: a socket that died while the page was away is found and opened again at once, so
    // a speaker who went to another app comes back to their voice.
    const again = (why) => {
      feed?.wake?.();
      return state.mode === "unavailable" ? start() : auth.check(why);
    };
    // Hidden, a speaker leaves word for a page that may replace this one; shown again, this page takes it back.
    document.addEventListener("visibilitychange", () => {
      media.remember(document.visibilityState !== "visible");
      if (document.visibilityState === "visible") again("visible");
    }, { signal: page.signal });
    addEventListener("online", () => again("online"), { signal: page.signal });
    addEventListener("pageshow", (event) => {
      if (!event.persisted) return;
      media.remember(false);
      auth.resume();
    }, { signal: page.signal });
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
    media.remember();
    if (event.persisted) return;
    page.abort();
    clearTimeout(relisten);
    media.dispose();
    feed?.dispose();
    member?.dispose();
    donating?.();
    feeding?.dispose();
    device?.dispose();
    bar?.dispose();
    auth?.dispose();
    shell?.dispose();
    adapter?.dispose();
  });
})();
