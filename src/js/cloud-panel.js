// Ooga Chat's panel on the island (#660), the sheet's last tab with the outlined cloud: who speaks and who listens in
// the outdoor conversation of Main Island or DSB Land, as the room's audience protocol reports it (audience.js;
// docs/ooga-chat-app.md, The audience contract). Listeners appear here only, never as characters in the world.
// Shown where the room's welcome lists `audience-v1` (`available`, read by sheet.js), so an older backend keeps the
// panels it had. Two zone buttons ask the room for a view (`audience-view`); choosing the zone already asked for does
// nothing. A choice never moves the visitor's Ooga or their microphone: what they publish stays the island's voice.
// One roster of circles, Ooga Chat's own (audience-tiles.js, which the app draws with too): speakers, then listeners,
// the whole list scrolling in its slab, each a portrait (the Ooga's face for a world speaker with a character the server
// names; else, for a GitHub account, its GitHub picture from this origin, the Worker's `/api/avatar/<id>`; else, or when
// that does not load, the native Ooga face; audience.js leaves out the room's own picture paths), the name, and Speaker or
// Listener under it after a speaker's microphone. A speaker's portrait carries the ring of where they speak from: green
// for the island, purple for Ooga Chat. The visitor's own microphone mutes them as M does; anyone else's mutes that
// voice for this visitor alone (voice.js `muteLocal`, which #661 extends to Ooga Chat's speakers). Retry, offered while
// joining, catching up or unreachable, asks the room for a fresh snapshot.
// Cost: tiles are kept by the server's id and drawn only while the panel shows; a change writes only the fields it
// changed and moves a tile only when the order moved. Portraits are drawn once a character a page. No timers, no
// frame work.
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

  // Portraits: an Ooga's face drawn once a character a page, or the native Ooga face.
  const faces = new Map();
  const faceUrl = (handle) => {
    if (!faces.has(handle)) {
      const canvas = document.createElement("canvas");
      BL.hud.renderFaceIcon(canvas, BL.models.caveman(BL.contributors.traitsFor(handle)), null, 64);
      faces.set(handle, canvas.toDataURL("image/png"));
    }
    return faces.get(handle);
  };
  // A row as the tiles draw it: its picture, its microphone's look and words, and whether this visitor muted it.
  const describe = (id, t) => {
    const row = model.rows.get(id), speaker = row.role === "speaker";
    // Speaking as Online Oogas shows it: the visitor's own from their microphone's meter (voice.js meters it even alone),
    // anyone else's from this page's meter on their voice (keyed by account, the number in their `gh:` id), and never
    // for one out of earshot. The room never says speaking.
    const key = id.startsWith("gh:") ? Number(id.slice(3)) : 0;
    const muted = row.self ? voice.stats.muted : row.mic === "muted";
    const speaking = row.self ? voice.stats.speaking : !!key && voice.inEarshot(key) && voice.speaking(key);
    const look = !speaker ? "" : muted ? "muted" : speaking ? "speaking" : "on";
    const blocked = speaker && !row.self && voice.mutedLocally(row.login);
    t.id = id; t.display = row.display; t.role = row.role; t.source = row.source || ""; t.self = row.self;
    t.face = row.character && BL.characters.get(row.character) ? faceUrl(row.character) : key ? `/api/avatar/${key}` : "";
    t.look = look; t.hand = row.hand; t.micPressed = blocked;
    // The visitor's own button works their microphone, so only while they are in voice.
    t.micDisabled = row.self && !voice.stats.enabled && !voice.stats.returning;
    t.micWords = speaker ? `${row.display}: ${BL.hud.voiceWords(look, row.self, blocked, row.login)}` : "";
  };
  const tiles = BL.audienceTiles.create(list, { mic(id) {
    const row = model.rows.get(id);
    if (!row) return;
    if (row.self) { if (voice.stats.returning) voice.toggle(); else voice.setMuted(!voice.stats.muted); }
    else voice.muteLocal(row.login, !voice.mutedLocally(row.login));
    tiles.repaint(describe);
  } });

  let drawnVersion = -1, showing = false, handGate = false;
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
    set(retry, "hidden", s !== "connecting" && s !== "stale" && s !== "unavailable");
    for (const b of zoneButtons) attr(b, "aria-pressed", String(b.dataset.cloudZone === model.desired));
  };
  const render = () => {
    paintStatus();
    if (handGate !== model.canHand()) { handGate = model.canHand(); BL.reactions.refresh(); }
    // Tiles the room dropped (or a sign-out forgot) leave at once, their pictures cancelled, shown or not.
    if (drawnVersion !== model.version) {
      if (showing) {
        tiles.draw(model.order, describe);
        drawnVersion = model.version;
      } else tiles.prune((id) => model.rows.has(id));
    }
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
    if (mute.dataset.mic !== footerState.mute.mic) mute.dataset.mic = footerState.mute.mic;
    set(voiceButton, "textContent", footerState.voice.text);
    set(voiceButton, "disabled", footerState.voice.disabled);
    set(voiceButton, "title", footerState.voice.action === "join" && reason ? reason : "");
    set(logout, "hidden", !me);
    if (showing) tiles.repaint(describe);
  };

  const updateShowing = () => {
    const was = showing;
    showing = BL.sheet.visible(panel);
    if (showing && !was) { drawnVersion = -1; render(); paintFooter(); }
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
    if (s.logoutEpoch !== logoutEpoch) { logoutEpoch = s.logoutEpoch; model.reset("off"); }
    if (!fixture) {
      const now = available() && s.room === "live";
      if (now && !ready) { if (!model.setDesired(zoneSource())) model.ask(); }
      else if (!now && ready) model.reset(s.me ? s.room === "connecting" ? "connecting" : "unavailable" : "off");
      ready = now;
    }
    render(); paintFooter();
  };
  // A reaction lasts its own time over its tile's centre, layered over the hand; a tile holds a few at once.
  const pop = (msg) => {
    if (msg.epoch !== model.epoch || msg.zone !== model.zone || !model.rows.has(msg.id) || !BL.reactionPolicy.valid(msg.e) || !showing) return;
    tiles.pop(msg.id, msg.e);
  };
  subs.push(net.subscribe(account));
  subs.push(net.subscribeAudience((msg) => {
    if (msg.kind === "react") pop(msg);
    else if (model.apply(msg) !== "ignored") { render(); paintFooter(); }
  }));
  subs.push(voice.subscribe(paintFooter));
  // The visitor's own reaction pops on their own tile at once, as Online Oogas pops it: the room never echoes it back.
  subs.push(net.subscribeReactions((id, e) => {
    const self = id === 0 && showing ? model.self() : null;
    if (self && BL.reactionPolicy.valid(e)) tiles.pop(self.id, e);
  }));

  const zoneClick = (e) => {
    const b = e.currentTarget;
    if (e.detail) b.blur();
    if (!model.setDesired(b.dataset.cloudZone)) return;
    if (fixture) model.apply(sample(b.dataset.cloudZone));
    render(); paintFooter();
  };
  for (const b of zoneButtons) b.addEventListener("click", zoneClick);
  retry.addEventListener("click", () => { model.retry(); render(); });
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
    tiles.dispose();
    model.reset("off");
  };
  BL.cloudPanel = {
    available,
    // #658's classifier hands the visitor's outdoor zone here, "main" or "dsb"; until then net.js's zone decides.
    setZoneSource(fn) { zoneSource = fn; },
    dispose,
    get stats() { return { rows: model.rows.size, drawn: list.childElementCount, cached: tiles.count, status: model.status, zone: model.zone, desired: model.desired, showing }; }
  };
})();
