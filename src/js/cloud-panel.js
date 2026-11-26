// Ooga Chat's panel on the island (#660), the sheet's last tab with the outlined cloud: who speaks and who listens in
// the outdoor conversation of Main Island or DSB Land, as the room's audience protocol reports it (audience.js;
// docs/ooga-chat-app.md, The audience contract). Listeners appear here only, never as characters in the world.
// Shown where the room's welcome lists `audience-v1` (`available`, read by sheet.js), so an older backend keeps the
// panels it had. For now the panel shows Main Island alone, named by the tag in its title's corner: it asks the room for
// that view (`audience-view`) wherever the visitor's Ooga stands, which never moves the Ooga or their microphone.
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
// Under `?debug=1&audience=fixture` the panel shows a generated roster of named samples for review, sending
// nothing. Exports available, dispose, listeners, inChats, preview (below), online, stats.
// Hosted chats (docs/ooga-chat-hosts.md): where the room's welcome lists `call-v1` (chat-call.js `available`, or
// `?debug=1&chats=fixture` for review) the tab lists the live chats in place of Main Island's roster and asks the room
// for no view: Ooga Chat's own views (chat-hosts.js) over this panel (`data-space`: "list", then "on" in a chat), the
// chat's roster in the same circles with its ranks and requests, a press on a portrait opening the tile's menu, and the
// footer working the chat's voice (chat-call.js) instead of the island's. Start a chat chooses the zone the visitor's
// Ooga stands in first. A request to speak while the panel is not attended counts on the tab (`sheet.setBadge`); every
// notice is said once, as a toast (`hud.toast`). In a chat the island room's emoji bar gives way to the chat's own
// (`#cloud-chat-reactions`, reaction-bar.js over the chat's socket, as Ooga Chat's footer has it): a tap sends a
// reaction to everyone in the chat, the right slot raises the visitor's hand (a speaker's alone), and every reaction the
// chat sends pops over that participant's circle.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const A = BL.audience, net = BL.net, voice = BL.voice;
  const $ = (id) => document.getElementById(id);
  const panel = $("cloud-panel"), sheet = $("sheet"), list = $("cloud-roster");
  const status = $("cloud-status"), statusText = $("cloud-status-text"), retry = $("cloud-retry");
  const footName = $("cloud-foot-name"), mute = $("cloud-mute"), voiceButton = $("cloud-voice"), logout = $("cloud-logout");
  const params = new URLSearchParams(location.search);
  const fixture = params.get("debug") === "1" && params.get("audience") === "fixture";
  const calls = BL.chatCall;
  // Hosted chats on (a chat already open stays through the room's reconnect), and the chat chosen (none while the list shows).
  const chatsOn = () => calls.available() || !!calls.room, inChat = () => !!calls.room;
  const subs = [];
  const set = (el, key, value) => { if (el[key] !== value) el[key] = value; };
  const attr = (el, key, value) => { if (el.getAttribute(key) !== value) el.setAttribute(key, value); };

  // The one zone the panel shows for now.
  const ZONE = "main";
  const model = A.create({ send: (type, fields) => !fixture && net.sendAudience(type, fields) });
  const available = () => fixture || chatsOn() || !!net.state.me && net.state.audience;

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
    t.id = id; t.display = row.display; t.role = row.role; t.source = row.source || ""; t.self = row.self; t.rank = t.request = ""; t.chat = false; t.reconnecting = false;
    t.face = row.character && BL.characters.get(row.character) ? faceUrl(row.character) : key ? `/api/avatar/${key}` : "";
    t.look = look; t.hand = row.hand; t.micPressed = blocked;
    // The visitor's own button works their microphone, so only while they are in voice.
    t.micDisabled = row.self && !voice.stats.enabled && !voice.stats.returning;
    t.micWords = speaker ? `${row.display}: ${BL.hud.voiceWords(look, row.self, blocked, row.login)}` : "";
  };
  // A hosted chat's row (Ooga Chat's roster, ooga-chat-roster.js) as the tiles draw it, from the chat's own voice: an
  // island account's portrait is its Ooga, or its GitHub picture; never Ooga Chat's own picture paths.
  const myId = () => { const me = calls.identity(); return me ? me.participant : null; };
  const chatDescribe = (p, t) => {
    const m = calls.state.voice, speaker = p.role === "speaker", self = p.id === myId(), own = self && m.role === "speaker";
    const muted = own ? m.muted : p.muted;
    const look = !speaker ? "" : muted ? "muted" : (own ? m.speaking : m.talking.includes(p.id)) ? "speaking" : "on";
    const blocked = speaker && !self && calls.media.mutedLocally(p.id);
    t.id = p.id; t.display = p.display; t.role = p.role; t.source = speaker ? "chat" : ""; t.self = self;
    t.face = p.character && BL.characters.get(p.character) ? faceUrl(p.character) : !calls.fixture && /^gh:\d+$/.test(p.id) ? `/api/avatar/${p.id.slice(3)}` : "";
    t.look = look; t.hand = p.hand || ""; t.micPressed = blocked; t.micDisabled = self && !own;
    t.micWords = speaker ? `${p.display}: ${BL.hud.voiceWords(look, self, blocked, p.login)}` : "";
    t.rank = p.rank || ""; t.request = p.request || ""; t.chat = true; t.walking = speaker && !!p.walking; t.reconnecting = !!p.reconnecting;
  };
  let menu = null;
  const tiles = BL.audienceTiles.create(list, { menu: (...a) => menu?.(...a), mic(id) {
    if (inChat()) {
      const m = calls.media;
      if (id === myId()) m.mute(); else m.muteLocal(id, !m.mutedLocally(id));
      return paintChat();
    }
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
  };
  const render = () => {
    if (chatsOn()) return paintChat();
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
    if (chatsOn()) return paintChat();
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
    if (showing !== was && chatsOn()) paintChat();
  };
  const watch = new MutationObserver(updateShowing);
  watch.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  watch.observe(sheet, { attributes: true, attributeFilter: ["data-open", "hidden"] });
  const onSheet = () => updateShowing();
  document.addEventListener("sheetchange", onSheet);

  // Main Island's listeners in Ooga Chat, for Online Oogas (players.js) and every "N online", while the roster is current:
  // the visitor and anyone also on the island are players, counted and listed once.
  const listeners = () => {
    if (model.zone !== "main" || model.status !== "live" && model.status !== "stale") return [];
    const out = [];
    for (const r of model.rows.values()) {
      if (r.role !== "listener" || r.self) continue;
      const gh = r.id.startsWith("gh:") ? Number(r.id.slice(3)) : 0;
      if (gh && (gh === net.state.selfId || net.remotes.has(gh))) continue;
      out.push(r);
    }
    return out;
  };
  // How many are in hosted chats through Ooga Chat's app and not on the island, each once (the room's `state.chatOnline`),
  // for every "N online": the island's own in a chat are its players already.
  const inChats = () => (net.state.room === "live" ? net.state.chatOnline || 0 : 0);
  // The roster changed: every place that lists or counts its listeners hears it.
  const listenersChanged = () => {
    if (BL.players) BL.players.refresh();
    if (BL.hud) BL.hud.showAccount(net.state);
    if (BL.chat) BL.chat.account(net.state);
  };

  // The room: live with the audience feature asks for the desired view (the visitor's own zone at first); signing out
  // forgets everything, and a dropped room keeps the choice for the next welcome.
  let ready = false, logoutEpoch = net.state.logoutEpoch;
  const account = () => {
    const s = net.state;
    if (s.logoutEpoch !== logoutEpoch) { logoutEpoch = s.logoutEpoch; model.reset("off"); listenersChanged(); }
    if (!fixture) {
      // Hosted chats replace Main Island's relay roster: no view is asked for.
      const now = available() && s.room === "live" && !chatsOn();
      if (now && !ready) { if (!model.setDesired(ZONE)) model.ask(); }
      else if (!now && ready) { model.reset(s.me ? s.room === "connecting" ? "connecting" : "unavailable" : "off"); listenersChanged(); }
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
  // Who is in a chat changed: Online Oogas and every "N online" hear it, as for Main Island's listeners.
  subs.push(net.subscribeChatMembers(listenersChanged));
  subs.push(net.subscribeAudience((msg) => {
    if (msg.kind === "react") pop(msg);
    else if (model.apply(msg) !== "ignored") { render(); paintFooter(); listenersChanged(); }
  }));
  subs.push(voice.subscribe(paintFooter));
  // The visitor's own reaction pops on their own tile at once, as Online Oogas pops it: the room never echoes it back.
  subs.push(net.subscribeReactions((id, e) => {
    const self = id === 0 && showing ? model.self() : null;
    if (self && BL.reactionPolicy.valid(e)) tiles.pop(self.id, e);
  }));

  retry.addEventListener("click", () => { model.retry(); render(); });
  mute.addEventListener("click", (e) => {
    if (e.detail) mute.blur();
    if (inChat()) return calls.media.mute();
    if (voice.stats.returning) voice.toggle();
    else voice.setMuted(!voice.stats.muted);
  });
  voiceButton.addEventListener("click", (e) => {
    if (e.detail) voiceButton.blur();
    if (inChat()) return calls.state.voice.role === "speaker" ? calls.media.leave() : calls.media.join();
    if (footerState.voice.action === "leave") voice.leave();
    else if (!footerState.voice.disabled) voice.toggle();
  });
  logout.addEventListener("click", () => net.logout());
  BL.reactions.mount($("cloud-reactions"), { handAllowed: () => model.canHand() });

  // --- hosted chats ---
  const zoneChip = $("cloud-zone");
  // The panel as the shared views take it (chat-hosts.js `create`), found once hosted chats first come on.
  const spaceOf = () => ({ parts: { list, footRow: panel.querySelector(".panel-foot"), foot: { join: voiceButton, mute, actions: panel.querySelector(".cloud-foot-actions") } },
    setMenu(fn) { menu = fn; } });
  let hosts = null, chatMode = false, chatDrawn = -1, unread = 0;
  const STATUS_CHAT = { connecting: "Joining the chat…", reconnecting: "Reconnecting… this list may be out of date.", full: "This chat is full right now. Trying again soon.",
    stale: "This page is older than the chat. Reload to keep listening." };
  // The zone the visitor's Ooga stands in, for Start a chat: DSB Land's places, else Main Island.
  const startZone = () => BL.zoneMap.landOf(net.state.zone || "outside") === "DSB Land" ? "dsb" : "main";
  const paintChat = () => {
    const on = chatsOn();
    if (on !== chatMode) {
      chatMode = on;
      tiles.clear();
      chatDrawn = drawnVersion = -1;
      if (on) hosts = BL.chatHosts.create({ node: panel, head: panel.querySelector(".panel-title"), space: spaceOf(), chats: { list: calls.list, start: calls.start, preview: calls.preview, open: (entry) => openChat(entry), leave: () => calls.leave(), request: calls.request, hear: calls.hear },
        joinVoice: () => calls.media.join(), faceOf: (c) => BL.characters.get(c) ? faceUrl(c) : "", startZone, toast: (text) => BL.hud.toast(text), shown: () => showing,
        // A preview's portraits as this panel draws a chat's: the Ooga, else the GitHub picture, never Ooga Chat's paths.
        rowFace: (p) => p.character && BL.characters.get(p.character) ? faceUrl(p.character) : !calls.fixture && /^gh:\d+$/.test(p.id) ? `/api/avatar/${p.id.slice(3)}` : "",
        speakNow: true,
        // Go there: the speaker's own Ooga onto the chat's island (chat-copy.js), the island's page alone.
        goThere: { state: (room) => BL.chatCopy.button(room), press: () => BL.chatCopy.toggle(), subscribe: BL.chatCopy.subscribe },
        // The island view: the page's own copy of the map, Live view on the renderer the page has, over the island the hub built.
        // The island view: the page's own copy of the map. The island page is the island already, so it keeps the flat view.
        islandView: { picture: BL.islandViewArt.main } });
      else {
        hosts?.dispose(); hosts = null;
        delete panel.dataset.space;
        for (const el of [voiceButton, mute]) el.hidden = false;
        set(zoneChip, "textContent", A.ZONE_NAMES[ZONE]);
        account();
        return;
      }
    }
    if (!on) return;
    const s = calls.state, room = s.room, v = s.voice, me = calls.identity();
    panel.dataset.space = room ? "on" : "list";
    if (room) BL.chatHosts.tagged(zoneChip, room.zone); else { set(zoneChip, "textContent", ""); zoneChip.title = ""; }
    hosts.update({ session: me ? { identity: me } : null, room, voice: v, device: { online: navigator.onLine !== false }, audience: s.audience });
    // The status line: the chat's socket, then what voice last said, then an empty chat.
    const words = !room ? "" : STATUS_CHAT[s.audience.status] || (s.audience.status === "live" && !s.audience.list.length ? "Nobody is here yet." : v.notice || "");
    set(statusText, "textContent", words);
    set(status, "hidden", !words);
    set(retry, "hidden", true);
    // The footer: the chat's voice, as Ooga Chat's footer works it (ooga-chat-views.js `cloudFoot`).
    set(footName, "textContent", me ? me.display : "");
    const speaker = v.role === "speaker", source = speaker ? "chat" : "";
    if (footName.dataset.source !== source) footName.dataset.source = source;
    set(mute, "disabled", !speaker || v.busy);
    set(mute, "textContent", speaker && !v.muted ? "Mute" : "Unmute");
    attr(mute, "aria-pressed", String(speaker && v.muted));
    const look = speaker && !mute.disabled ? v.muted ? "muted" : "live" : "";
    if (mute.dataset.mic !== look) mute.dataset.mic = look;
    set(voiceButton, "textContent", speaker ? "Leave Voice" : v.phase === "leaving" ? "Leaving…" : v.busy ? "Joining…" : "Join Voice");
    set(voiceButton, "disabled", !speaker && (v.busy || room?.you?.speak !== "eligible"));
    set(voiceButton, "title", "");
    set(logout, "hidden", !net.state.me);
    if (!showing) { if (chatDrawn !== s.audience.version) tiles.prune((id) => s.audience.list.some((p) => p.id === id)); return; }
    if (chatDrawn !== s.audience.version) { chatDrawn = s.audience.version; tiles.draw(s.audience.list, chatDescribe); }
    else tiles.repaint(chatDescribe);
  };
  subs.push(calls.subscribe(paintChat));
  // The chat's emoji bar: its connection is the chat's socket, in the shape reaction-bar.js takes.
  const chatBarHost = $("cloud-chat-reactions");
  const linkSubs = new Set();
  let handRequest = 0;
  const chatLink = { state: { me: null, reactions: false, room: "off", hand: false, handTone: 0, handEmoji: "", customHand: true },
    sendReaction: (emoji) => calls.request("reaction", { emoji }) > 0,
    setHand(on, tone, emoji) {
      handRequest = calls.request("hand", { on, tone, ...(emoji ? { emoji } : {}) });
      if (!handRequest) return false;
      Object.assign(chatLink.state, { hand: on, handTone: tone, handEmoji: on ? emoji || "" : "" });
      for (const fn of linkSubs) fn(chatLink.state);
      return true;
    },
    subscribe(fn) { linkSubs.add(fn); return () => linkSubs.delete(fn); } };
  // Follows the chat: shown in one, working while its socket is live, the hand the visitor's own row's as the chat keeps it.
  const syncLink = (force = false) => {
    const st = chatLink.state, me = calls.identity(), s = calls.state, in_ = !!s.room && !!me;
    const own = in_ ? s.audience.list.find((p) => p.id === me.participant) : null, hand = own ? own.hand || "" : "";
    const next = { me: in_ ? me : null, reactions: in_, room: in_ ? s.audience.status : "off", hand: !!hand, handEmoji: hand };
    if (!force && st.me === next.me && st.reactions === next.reactions && st.room === next.room && (handRequest || st.hand === next.hand && st.handEmoji === next.handEmoji)) return;
    Object.assign(st, handRequest ? { me: next.me, reactions: next.reactions, room: next.room } : next);
    for (const fn of linkSubs) fn(st);
  };
  // Made the first time a chat is open: a page with chats off never builds it.
  let chatBars = null, barRole = "";
  subs.push(calls.subscribe(() => {
    if (!calls.room && !chatBars) return;
    if (!chatBars) {
      chatBars = BL.reactionBar.create(chatLink);
      chatBars.mount(chatBarHost, { handAllowed: () => calls.state.voice.role === "speaker" });
    }
    syncLink();
    const role = calls.state.voice.role;
    if (role !== barRole) { barRole = role; chatBars.refresh(); }
  }));
  subs.push(calls.hear((msg) => {
    // The hand's own answer: the visitor's row decides from here, whatever was shown meanwhile.
    if (msg.type === "result" && msg.requestId === handRequest) { handRequest = 0; syncLink(true); return; }
    const room = calls.room;
    if (msg.type !== "reaction" || !room || !showing || msg.zone !== BL.chatHosts.rosterZone(room.zone) || typeof msg.participantId !== "string" || !BL.reactionPolicy.valid(msg.emoji)) return;
    tiles.pop(msg.participantId, msg.emoji);
  }));
  // A request to speak counts on the tab while the panel is not attended; opening the tab reads it.
  subs.push(calls.hear((msg) => {
    if (msg.type !== "notice" || msg.kind !== "asked" || BL.sheet.attending(panel)) return;
    BL.sheet.setBadge("cloud", ++unread);
  }));
  BL.sheet.watchViews(panel, () => { if (unread) { unread = 0; BL.sheet.setBadge("cloud", 0); } });

  // --- a chat previewed from Online Oogas' In Ooga Chat (players.js) ---
  // `preview(id, from)`: the chat as the live list has it now (one no longer listed is said to have ended) in the chat's
  // preview (chat-hosts.js), whose Join as listener or Join as speaker opens it here (`openChat`) and shows the Ooga Chat
  // tab; the chat the visitor is in already only shows the tab. A visitor in another chat is asked first (`Change
  // chats?`, a modal dialog, focus back on `from` as it closes): Switch chats leaves that one and opens this, Stay
  // changes nothing. The rows say which chat the visitor is in, so they are drawn again when that changes.
  let roomShown = null;
  subs.push(calls.subscribe(() => {
    const id = calls.room ? calls.room.id : null;
    if (id !== roomShown) { roomShown = id; if (BL.players) BL.players.refresh(); }
  }));
  const showPanel = () => { if (!BL.sheet.visible(panel)) BL.sheet.tabFor(panel)?.click(); };
  let switcher = null, joining = 0;
  // Made the first time it is wanted: a wood-framed modal, its words on a stone slab, Switch chats the amber action.
  const switchDialog = () => {
    if (switcher) return switcher;
    const make = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el; };
    const dialog = make("dialog", "modal hosted-switch"), head = make("div", "panel-head"), heading = make("h2", "", "Change chats?");
    const close = make("button", "modal-close"), slab = make("div", "slab hosted-switch-slab"), body = make("p", "hosted-switch-text"), note = make("p", "hosted-switch-note");
    const go = make("div", "hosted-switch-go"), stay = make("button", "foot-button", "Stay"), change = make("button", "foot-button foot-primary", "Switch chats");
    heading.id = "hosted-switch-head";
    dialog.setAttribute("aria-labelledby", heading.id);
    body.id = "hosted-switch-text";
    dialog.setAttribute("aria-describedby", body.id);
    close.type = stay.type = change.type = "button";
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";
    change.autofocus = true;
    head.append(heading, close);
    go.append(stay, change);
    slab.append(body, note, go);
    dialog.append(head, slab);
    document.body.append(dialog);
    const self = switcher = { dialog, body, note, change, stay, from: null, run: null };
    // Every way out gives the focus back to the chat row pressed at once; the close event only for any other way.
    const shut = () => {
      self.run = null;
      if (dialog.open) dialog.close();
      const to = self.from;
      self.from = null;
      if (to && to.isConnected) to.focus();
    };
    stay.addEventListener("click", shut);
    close.addEventListener("click", shut);
    change.addEventListener("click", () => { const run = self.run; shut(); run?.(); });
    // Escape closes it from the keyboard and from a pad's B (pad-focus.js) alike.
    dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); shut(); } });
    // A press outside the frame closes it; one inside the frame's own padding does not.
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) shut();
    });
    // A close event comes a task after its close, so one that lands after the dialog opened again is not for it.
    dialog.addEventListener("close", () => { if (!dialog.open) shut(); });
    return switcher;
  };
  // A host can't simply switch: they hand the chat to a co-host as they leave it (Leave chat), or end it, first.
  const hostingNow = () => calls.room?.you?.rank === "host";
  let opener = null;
  const preview = async (id, from = null) => {
    if (!calls.available()) return;
    const ticket = ++joining;
    if (calls.room && calls.room.id === id) return showPanel();
    const answer = await calls.list();
    if (ticket !== joining) return;
    if (!answer || !Array.isArray(answer.chats)) return BL.hud.toast("The chats can't be reached right now. Try again.");
    const entry = (BL.chatHosts.parseList(answer.chats) || []).find((c) => c.id === id);
    if (!entry) return BL.hud.toast("That chat has ended");
    paintChat();
    if (!hosts) return;
    opener = from;
    hosts.preview(entry, from);
  };
  // A chat chosen in a preview, from the Ooga Chat tab's list or Online Oogas'.
  const openChat = (entry) => {
    const from = opener;
    opener = null;
    const open = () => {
      if (calls.room && calls.room.id !== entry.id) calls.leave();
      calls.open(entry);
      showPanel();
    };
    if (!calls.room || calls.room.id === entry.id) return open();
    const s = switchDialog(), host = hostingNow();
    s.body.textContent = host ? `You host ${calls.room.title}. Before joining ${entry.title}, hand it to a co-host with Leave chat, or end it.`
      : `You're in ${calls.room.title}. Leave it and join ${entry.title}?`;
    s.note.textContent = "";
    s.change.hidden = host;
    s.from = from && from.isConnected ? from : null;
    s.run = host ? null : open;
    if (!s.dialog.open) s.dialog.showModal();
    (host ? s.stay : s.change).focus();
  };

  if (fixture) { model.setDesired(ZONE); model.apply(sample(model.desired)); }
  updateShowing();
  account();
  paintChat();

  const dispose = () => {
    for (const off of subs) off();
    subs.length = 0;
    watch.disconnect();
    document.removeEventListener("sheetchange", onSheet);
    hosts?.dispose();
    if (switcher) { switcher.from = null; switcher.dialog.close(); switcher.dialog.remove(); switcher = null; }
    tiles.dispose();
    linkSubs.clear();
    model.reset("off");
  };
  BL.cloudPanel = {
    available,
    dispose,
    listeners,
    inChats,
    preview,
    // Who is online, as every "N online" on the island says it: the room's players, Main Island's listeners and everyone
    // in a hosted chat through Ooga Chat's app.
    online: (state = net.state) => (state.online || 0) + (state.room === "live" ? listeners().length + inChats() : 0),
    get stats() { return { rows: model.rows.size, drawn: list.childElementCount, cached: tiles.count, status: model.status, zone: model.zone, desired: model.desired, showing }; }
  };
})();
