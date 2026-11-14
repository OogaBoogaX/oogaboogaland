// Ooga Chat's panel on the island (#660), the sheet's last tab with the outlined cloud: who speaks and who listens in
// the outdoor conversation of Main Island or DSB Land, as the room's audience protocol reports it (audience.js;
// docs/ooga-chat-app.md, The audience contract). Listeners appear here only, never as characters in the world.
// Shown where the room's welcome lists `audience-v1` (`available`, read by sheet.js), so an older backend keeps the
// panels it had. Two zone buttons ask the room for a view (`audience-view`); choosing the zone already asked for does
// nothing. A choice never moves the visitor's Ooga or their microphone: what they publish stays the island's voice.
// One roster: speakers, then listeners, each row a portrait (the Ooga's face for a world speaker with a character
// the server names, else the account picture the server serves, else the native Ooga face), the name with Speaker or
// Listener under it, a reaction column and the microphone. A speaker's portrait carries the ring of where they speak
// from: green for the island, purple for Ooga Chat. The visitor's own microphone mutes them as M does; anyone else's
// mutes that voice for this visitor alone (voice.js `muteLocal`, which #661 extends to Ooga Chat's speakers).
// Cost: rows are kept by the server's id and drawn a page (audience.js PAGE) at a time, only while the panel shows; a
// change touches only the rows and fields it changed, and paging or a delta never rebuilds the list unless its order
// moved. Portraits are drawn once a character a page. No timers, no frame work.
// The emoji bar (reactions.js `mount`, the same state as the other bars; the hand an active speaker's alone) sits
// under the roster, the footer under it: the visitor's name, Mute or Unmute (always there), Join or Leave Voice and
// Sign out, all through the island's own voice session (voice.js), never a second one.
// The visitor's outdoor zone comes from `setZoneSource` (#658 supplies the classifier), the zone net.js reports until
// then. Under `?debug=1&audience=fixture` the panel shows a generated roster of named samples for review, sending
// nothing. Exports available, setZoneSource, dispose, stats.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const A = BL.audience, net = BL.net, voice = BL.voice;
  const $ = (id) => document.getElementById(id);
  const panel = $("cloud-panel"), sheet = $("sheet"), list = $("cloud-roster");
  const status = $("cloud-status"), statusText = $("cloud-status-text"), retry = $("cloud-retry");
  const pagesNav = $("cloud-pages"), prev = $("cloud-prev"), next = $("cloud-next"), pageLabel = $("cloud-page");
  const footName = $("cloud-foot-name"), mute = $("cloud-mute"), voiceButton = $("cloud-voice"), logout = $("cloud-logout");
  const zoneButtons = [...panel.querySelectorAll("[data-cloud-zone]")];
  // DSB Land's button wears the destination button's own DSB island.
  {
    const icon = document.querySelector("#destination-hud .dsb-island-icon").cloneNode(true);
    icon.setAttribute("class", "cloud-zone-icon");
    zoneButtons[1].prepend(icon);
  }
  const params = new URLSearchParams(location.search);
  const fixture = params.get("debug") === "1" && params.get("audience") === "fixture";
  const subs = [];
  const set = (el, key, value) => { if (el[key] !== value) el[key] = value; };
  const attr = (el, key, value) => { if (el.getAttribute(key) !== value) el.setAttribute(key, value); };

  let zoneSource = () => A.zoneOfWorld(net.state.zone);
  const model = A.create({ send: (type, fields) => !fixture && net.sendAudience(type, fields) });
  const available = () => fixture || !!net.state.me && net.state.audience;

  // Named samples, never real people, for reviewing the panel at scale: four world speakers, two Ooga Chat speakers,
  // the visitor and three hundred listeners.
  const sample = (zone) => {
    const rows = [], tag = zone === "dsb" ? "dsb" : "main";
    for (let i = 1; i <= 4; i++) rows.push({ id: `sample:${tag}:w${i}`, login: `world-speaker-${i}`, provider: "github", role: "speaker", source: "world", contributions: 60 - i * 9, mic: i === 2 ? "muted" : "on", speaking: i === 1, hand: i === 3 ? "✋" : "" });
    for (let i = 1; i <= 2; i++) rows.push({ id: `sample:${tag}:c${i}`, login: `cloud-speaker-${i}`, provider: "github", role: "speaker", source: "chat", mic: "on" });
    rows.push({ id: `sample:${tag}:you`, login: net.state.me ? net.state.me.login : "you", provider: "github", role: "listener", self: true });
    for (let i = 1; i <= 300; i++) rows.push({ id: `sample:${tag}:l${i}`, login: `listener-${String(i).padStart(3, "0")}`, provider: i % 3 ? "github" : "x", role: "listener" });
    return { t: "audience", v: A.VERSION, kind: "snapshot", epoch: 1, rev: 1, zone, you: { speak: "eligible" }, rows };
  };

  // Portraits: an Ooga's face drawn once a character a page, the server's picture, or the native Ooga face.
  const faces = new Map();
  const faceUrl = (handle) => {
    if (!faces.has(handle)) {
      const canvas = document.createElement("canvas");
      BL.hud.renderFaceIcon(canvas, BL.models.caveman(BL.contributors.traitsFor(handle)), null, 64);
      faces.set(handle, canvas.toDataURL("image/png"));
    }
    return faces.get(handle);
  };
  const portraitKey = (row) => row.character && BL.characters.get(row.character) ? `c:${row.character}` : row.avatar ? `a:${row.avatar}` : "d";
  const showDefault = (entry) => {
    if (entry.img) { entry.img.onerror = null; entry.img.removeAttribute("src"); entry.img = null; }
    entry.portrait.replaceChildren(BL.nativeIcons.svg("roster"));
  };
  const showPortrait = (entry, row) => {
    const key = portraitKey(row);
    if (entry.face === key) return;
    entry.face = key;
    if (key === "d") { showDefault(entry); return; }
    if (!entry.img) {
      entry.img = document.createElement("img");
      entry.img.alt = "";
      entry.img.decoding = "async";
      entry.portrait.replaceChildren(entry.img);
    }
    entry.img.onerror = () => { entry.face = "d"; showDefault(entry); };
    entry.img.src = key[0] === "c" ? faceUrl(row.character) : row.avatar;
  };

  // Rows by the server's id, built the first time a page shows them and dropped when the room drops them.
  const cache = new Map();
  const entryFor = (id) => {
    let entry = cache.get(id);
    if (entry) return entry;
    const li = document.createElement("li"), portrait = document.createElement("span"), who = document.createElement("span");
    const name = document.createElement("span"), role = document.createElement("span"), react = document.createElement("span");
    const hand = document.createElement("span"), mic = document.createElement("button");
    li.className = "cloud-row"; li.dataset.id = id;
    portrait.className = "cloud-portrait";
    who.className = "cloud-who"; name.className = "cloud-name"; role.className = "cloud-role";
    who.append(name, role);
    react.className = "cloud-react"; hand.className = "cloud-hand";
    react.append(hand);
    mic.type = "button"; mic.className = "roster-voice cloud-mic";
    mic.append(BL.hud.voiceIcon.cloneNode(true));
    li.append(portrait, who, react, mic);
    entry = { li, portrait, name, role, react, hand, mic, img: null, face: "", row: null, pops: 0 };
    cache.set(id, entry);
    return entry;
  };
  const drop = (id, entry) => {
    if (entry.img) { entry.img.onerror = null; entry.img.removeAttribute("src"); }
    entry.li.remove();
    cache.delete(id);
  };
  const paintMic = (entry, row) => {
    const speaker = row.role === "speaker", look = row.mic === "muted" ? "muted" : row.speaking ? "speaking" : "on";
    const blocked = speaker && !row.self && voice.mutedLocally(row.login);
    set(entry.mic, "hidden", !speaker);
    if (!speaker) return;
    if (entry.mic.dataset.voice !== look) entry.mic.dataset.voice = look;
    attr(entry.mic, "aria-pressed", String(blocked));
    // The visitor's own button works their microphone, so only while they are in voice.
    set(entry.mic, "disabled", row.self && !voice.stats.enabled && !voice.stats.returning);
    const words = `${row.display}: ${BL.hud.voiceWords(look, row.self, blocked, row.login)}`;
    attr(entry.mic, "aria-label", words);
    set(entry.mic, "title", words);
  };
  const paintRow = (entry, row) => {
    entry.row = row;
    if (entry.li.dataset.role !== row.role) entry.li.dataset.role = row.role;
    set(entry.name, "textContent", row.display);
    set(entry.role, "textContent", row.role === "speaker" ? "Speaker" : "Listener");
    const source = row.source || "";
    if (entry.portrait.dataset.source !== source) entry.portrait.dataset.source = source;
    showPortrait(entry, row);
    set(entry.hand, "textContent", row.hand);
    set(entry.hand, "title", row.hand ? `${row.display} has ${row.hand} up` : "");
    paintMic(entry, row);
  };

  let page = 0, drawn = "", drawnVersion = -1, showing = false, handGate = false;
  const STATUS = {
    connecting: () => `Joining ${A.ZONE_NAMES[model.desired] || "the conversation"}…`,
    stale: () => "Catching up with the room…",
    unavailable: () => "Ooga Chat can't be reached right now."
  };
  const paintStatus = () => {
    const s = model.status, empty = s === "live" && !model.rows.size;
    const words = STATUS[s] ? STATUS[s]() : empty ? "Nobody is here yet." : "";
    set(statusText, "textContent", words);
    set(status, "hidden", !words);
    set(retry, "hidden", s !== "stale" && s !== "unavailable");
    for (const b of zoneButtons) attr(b, "aria-pressed", String(b.dataset.cloudZone === model.desired));
  };
  const render = () => {
    paintStatus();
    if (handGate !== model.canHand()) { handGate = model.canHand(); BL.reactions.refresh(); }
    // Rows the room dropped (or a sign-out forgot) leave at once, their pictures cancelled, shown or not.
    if (drawnVersion !== model.version) {
      for (const [id, entry] of cache) if (!model.rows.has(id)) drop(id, entry);
      drawnVersion = model.version;
    }
    if (!showing) return;
    const pages = model.pages();
    if (page >= pages) page = pages - 1;
    const ids = model.page(page), seq = ids.join("\n");
    for (const id of ids) {
      const entry = entryFor(id), row = model.rows.get(id);
      if (entry.row !== row) paintRow(entry, row);
    }
    if (seq !== drawn) {
      list.replaceChildren(...ids.map((id) => cache.get(id).li));
      drawn = seq;
    }
    const total = model.order.length, start = page * A.PAGE;
    set(pagesNav, "hidden", pages < 2);
    set(pageLabel, "textContent", total ? `${start + 1}–${Math.min(total, start + A.PAGE)} of ${total}` : "");
    set(prev, "disabled", page === 0);
    set(next, "disabled", page >= pages - 1);
  };

  // The footer, from the room's word on the visitor and this page's own voice session.
  const support = voice.support();
  const reason = !support.secure ? "Voice needs a secure page" : !support.webrtc ? "This browser has no WebRTC" : !support.mic ? "This browser has no microphone" : "";
  let footerState = null;
  const paintFooter = () => {
    const me = net.state.me, self = model.self();
    set(footName, "textContent", me ? me.display || me.login : "");
    const dot = self && self.role === "speaker" && self.source === "chat" ? "chat" : "";
    if (footName.dataset.source !== dot) footName.dataset.source = dot;
    footerState = A.footer(model.you, voice.stats, reason);
    set(mute, "textContent", footerState.mute.text);
    set(mute, "disabled", footerState.mute.disabled);
    attr(mute, "aria-pressed", String(footerState.mute.pressed));
    set(voiceButton, "textContent", footerState.voice.text);
    set(voiceButton, "disabled", footerState.voice.disabled);
    set(voiceButton, "title", footerState.voice.action === "join" && reason ? reason : "");
    set(logout, "hidden", !me);
    if (showing) for (const id of model.page(page)) { const entry = cache.get(id); if (entry && entry.row) paintMic(entry, entry.row); }
  };

  const updateShowing = () => {
    const was = showing;
    showing = BL.sheet.visible(panel);
    if (showing && !was) { render(); paintFooter(); }
  };
  const watch = new MutationObserver(updateShowing);
  watch.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  watch.observe(sheet, { attributes: true, attributeFilter: ["data-open", "hidden"] });
  const onSheet = () => updateShowing();
  document.addEventListener("sheetchange", onSheet);

  // The room: live with the audience feature asks for the desired view (the visitor's own zone at first); signing out
  // forgets everything, and a dropped room keeps the choice for the next welcome.
  let ready = false, logoutEpoch = net.state.logoutEpoch;
  const account = () => {
    const s = net.state;
    if (s.logoutEpoch !== logoutEpoch) { logoutEpoch = s.logoutEpoch; model.reset("off"); page = 0; }
    if (!fixture) {
      const now = available() && s.room === "live";
      if (now && !ready) { if (!model.setDesired(zoneSource())) model.ask(); }
      else if (!now && ready) model.reset(s.me ? s.room === "connecting" ? "connecting" : "unavailable" : "off");
      ready = now;
    }
    render(); paintFooter();
  };
  // A reaction lasts its own time in its row's column, layered over the hand; a row holds a few at once.
  const POPS = 4;
  const pop = (msg) => {
    if (msg.epoch !== model.epoch || msg.zone !== model.zone || !model.rows.has(msg.id) || !BL.reactionPolicy.valid(msg.e)) return;
    const entry = cache.get(msg.id);
    if (!entry || !showing || !entry.li.isConnected || entry.pops >= POPS) return;
    const el = document.createElement("span");
    el.className = "cloud-pop"; el.textContent = msg.e; el.setAttribute("aria-hidden", "true");
    entry.pops++;
    el.addEventListener("animationend", () => { el.remove(); entry.pops--; }, { once: true });
    entry.react.append(el);
  };
  subs.push(net.subscribe(account));
  subs.push(net.subscribeAudience((msg) => {
    if (msg.kind === "react") pop(msg);
    else if (model.apply(msg) !== "ignored") { render(); paintFooter(); }
  }));
  subs.push(voice.subscribe(paintFooter));

  const zoneClick = (e) => {
    const b = e.currentTarget;
    if (e.detail) b.blur();
    if (!model.setDesired(b.dataset.cloudZone)) return;
    page = 0;
    if (fixture) model.apply(sample(b.dataset.cloudZone));
    render(); paintFooter();
  };
  for (const b of zoneButtons) b.addEventListener("click", zoneClick);
  retry.addEventListener("click", () => { model.ask(); render(); });
  prev.addEventListener("click", () => { page = Math.max(0, page - 1); render(); });
  next.addEventListener("click", () => { page++; render(); });
  list.addEventListener("click", (e) => {
    const button = e.target.closest(".cloud-mic"), li = button && button.closest(".cloud-row");
    if (!li || button.disabled) return;
    const row = model.rows.get(li.dataset.id);
    if (!row) return;
    if (row.self) { if (voice.stats.returning) voice.toggle(); else voice.setMuted(!voice.stats.muted); }
    else voice.muteLocal(row.login, !voice.mutedLocally(row.login));
    paintMic(cache.get(row.id), row);
  });
  mute.addEventListener("click", (e) => {
    if (e.detail) mute.blur();
    if (voice.stats.returning) voice.toggle();
    else voice.setMuted(!voice.stats.muted);
  });
  voiceButton.addEventListener("click", (e) => {
    if (e.detail) voiceButton.blur();
    if (footerState.voice.action === "leave") voice.leave();
    else if (!footerState.voice.disabled) voice.toggle();
  });
  logout.addEventListener("click", () => net.logout());
  BL.reactions.mount($("cloud-reactions"), { handAllowed: () => model.canHand() });

  if (fixture) { model.setDesired(zoneSource()); model.apply(sample(model.desired)); }
  updateShowing();
  account();

  const dispose = () => {
    for (const off of subs) off();
    subs.length = 0;
    watch.disconnect();
    document.removeEventListener("sheetchange", onSheet);
    for (const [id, entry] of cache) drop(id, entry);
    model.reset("off");
  };
  BL.cloudPanel = {
    available,
    // #658's classifier hands the visitor's outdoor zone here, "main" or "dsb"; until then net.js's zone decides.
    setZoneSource(fn) { zoneSource = fn; },
    dispose,
    get stats() { return { rows: model.rows.size, drawn: list.childElementCount, cached: cache.size, page, pages: model.pages(), status: model.status, zone: model.zone, desired: model.desired, showing }; }
  };
})();
