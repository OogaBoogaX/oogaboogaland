// The Online Oogas tab beside Contributing Oogas (#361), for signed-in visitors: every player in the island room, grouped by
// the zone they are in (zone-map.js), the visitor's own group first with their own row at its head, then the other
// groups by heading and everyone in a group by name. A row keeps the roster's marks (the online dot, the host's dot,
// the voice mark, which mutes as it does there), a crosshair that turns the camera (`BL.pilot.turnToward`) and, for
// others standing in the visitor's own coordinates (the whole main world, `BL.voiceBlend.sameFrame`), how many metres away they stand, kept up to date without moving any row.
// Where people stand comes from net.js: a player's position counts in their zone only once they have moved there,
// and one who let go of their Ooga keeps their last, shown in red as their last known location. The visitor's own is
// their Ooga's last reported (`net.state.self`), kept after they let go; the visitor's row shows no distance.
// The crosshair turns toward a player in those coordinates, or their last known spot; toward anywhere else, at the
// door the route there takes first, as the scene the visitor is in names it (`setDoors`; the island's for now). It is
// greyed out, saying why, where there is no spot or no door. Nothing moves but the camera. A click checks again that
// the player is still in the room and where the row put them and that the visitor has not changed zone; if anything
// changed it does nothing, and the next event redraws the rows.
// Cost: rows are placed only when someone joins, leaves or changes zone, body or name, and only while the panel shows;
// distances and crosshairs are rewritten as positions arrive (`subscribeMoves`, a few times a second at most), and only
// what changed. No timers. Exports setDoors and stats.
// The tab always holds the visitor's hearing range (#380, `BL.voice.setRadius`), ready before joining: the slider's last
// stop is no limit, and a distance at or past the range is dimmed, since that voice is muted for them. The voice mark of
// anyone this visitor cannot hear where they stand, in another zone or past the range (`BL.voice.inEarshot`), fades and
// never shows them speaking, kept up as the slider moves. The slider is offered before any audio is active; Web Audio
// supplies quieting and boost once the listener joins.
// A voice link (`net.voiceLink`, `net.toggleVoiceLink`): the link on another player's row asks them for one, in any
// zone. Pale with nothing asked, pulsing amber while this visitor's own ask waits, green once both have asked; the room
// never tells the other player of an ask, so their link stays pale until they ask too. A click toggles this visitor's
// ask. L (director.js, `net.linkEveryone`) links everyone waiting on them, or with nobody waiting unlinks everyone.
// Hearing range and join-reading live together under the panel's Advanced settings disclosure.
// The persistent slot (reactions.js, `rec.hand` and `net.state.hand`) shows in its own column after the player's name:
// `handEmoji`, or the raised hand in their skin tone. Each transient reaction pops up there, over the persistent one.
// Joins (#430, `net.subscribePresence`): a player who comes online while the visitor is in the room is named on screen
// (`hud.toast`, read out by assistive technology) and counted on the tab until the visitor looks at it
// (`sheet.watchViews`), unless they are in the panel as it happens. Those already there when the visitor (re)joins are
// not named, nor is one who comes back within REJOIN_QUIET of leaving (a reconnect, a reload, a newer tab). Joins close
// together share one message while it shows. Each counted join is a line under the panels' bell, "Bea signed in"
// (`sheet.note`), and so is each leave, "Bea signed out", counted with the joins and never said in a message or aloud; a
// return within REJOIN_QUIET takes that leave's line and count back (`sheet.unnote`). With "Read joins aloud" ticked (this browser's choice, in localStorage) the names are
// spoken too, one utterance at a time: names that arrive while one plays wait and are said together after it, and the
// Read joins aloud checkbox alone controls it, independently of environment sound. Speech starts from the box, a gesture.
// In Ooga Chat (chat-summary-v1, docs/ooga-chat-hosts.md): the last group, after every zone's: each live hosted chat
// with how many speak and listen in it, a press opening its preview with the way in (cloud-panel.js `preview`).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const net = BL.net, Z = BL.zoneMap;
  const $ = (id) => document.getElementById(id);
  const sheet = $("sheet"), panel = $("players-panel"), list = $("players-list"), status = $("players-status"), count = $("players-count");
  const hearing = $("players-hearing"), range = $("players-hearing-range"), rangeValue = $("players-hearing-value"), V = BL.voice;
  const speak = $("players-speak"), speakBox = $("players-speak-input"), synth = window.speechSynthesis || null, toastBox = $("toast");
  const muteDuels = $("players-mute-duels");
  muteDuels.addEventListener("change", () => V.setMuteDuels(muteDuels.checked));
  net.subscribeDuel(V.duel);
  // The slider's stops run RADIUS_MIN..RADIUS_MAX metres, and one more stop past them is no limit.
  const RANGE_STEP = Number(range.step);
  range.min = String(V.RADIUS_MIN);
  range.max = String(V.RADIUS_MAX + RANGE_STEP);
  const ROOM_WORDS = { off: "Not connected.", connecting: "Joining the island…", paused: "Paused while the tab was hidden.", replaced: "Open in another tab.", full: "The island is full.", revoked: "Your account access was revoked." };
  const LOOK = { player: "Look at player", cloud: "Look at their cloud", known: "Look at last known position", door: "Look toward entrance", nowhere: "Location unavailable", route: "Route unavailable" };
  // A player is turned toward at about their middle; a door at the height the scene gives.
  const BODY_Y = 1;
  const SVG = "http://www.w3.org/2000/svg";
  const crosshair = document.createElementNS(SVG, "svg");
  crosshair.setAttribute("viewBox", "0 0 9 9");
  crosshair.setAttribute("aria-hidden", "true");
  const crosshairPath = document.createElementNS(SVG, "path");
  crosshairPath.setAttribute("fill", "currentColor");
  crosshairPath.setAttribute("d", "M3 1h3v1H3zM3 7h3v1H3zM1 3h1v3H1zM7 3h1v3H7zM2 2h1v1H2zM6 2h1v1H6zM2 6h1v1H2zM6 6h1v1H6zM4 0h1v3H4zM4 6h1v3H4zM0 4h3v1H0zM6 4h3v1H6zM4 4h1v1H4z");
  crosshair.append(crosshairPath);
  // A voice link's mark and its words, shared with Ooga Chat's Online Oogas (native-icons.js).
  const linkIcon = BL.nativeIcons.link(), LINK_WORDS = BL.nativeIcons.LINK_WORDS;

  const rows = new Map(), groups = new Map(), order = [], door = { x: 0, y: 0, z: 0 };
  let serial = 0, pass = 0, showing = false, stale = true, doors = null, shownZone = "", shownRadius = -1;
  // Ooga Chat speakers on clouds (#659, `net.state.clouds`), rows of their own keyed by their audience id: a purple dot
  // where a player's is green, in the group of the land their cloud is over, their mic as the room says it (muted or
  // not, nothing to press), their raised hand, and their reactions from the room's audience feed. The crosshair turns
  // toward their Ooga on its cloud where the scene seats it (`setCloudSpot(fn)`, `fn(id, out)` true with `out` written,
  // the hub's); elsewhere it says the route is unavailable. A row's numeric `id` is minus the account's, for sorting.
  const cloudRows = new Map(), spot = { x: 0, y: 0, z: 0 };
  let cloudSpot = null;
  const cloudOf = (id) => {
    const list = net.state.clouds;
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };
  // Ooga Chat's listeners on Main Island (the Ooga Chat tab's roster, cloud-panel.js `listeners`), in gray in its group
  // after its players: in the conversation without a body, so no mark, link, crosshair or distance. Anyone also on the
  // island, the visitor included, is listed once, as a player (cloud-panel.js decides who).
  const listenerRows = new Map();
  // A gray row for someone in Ooga Chat, by their audience id; `account` is set while they are a linked partner.
  const listenerRow = (key) => {
    let row = listenerRows.get(key);
    if (row) return row;
    row = makeRow();
    row.listener = true; row.account = 0; row.id = -Number(key.slice(key.indexOf(":") + 1));
    row.li.dataset.id = String(row.id); row.li.dataset.listener = key; row.li.classList.add("players-listener");
    const dot = row.li.querySelector(".roster-presence");
    dot.dataset.online = "listener"; dot.title = "Listening in Ooga Chat"; dot.setAttribute("aria-label", "Listening in Ooga Chat");
    row.toggle.disabled = true; row.toggle.removeAttribute("aria-expanded"); row.toggle.removeAttribute("aria-controls");
    row.button.hidden = true;
    listenerRows.set(key, row);
    return row;
  };
  // A listener row's mark: gray for Main Island's listeners, Ooga Chat's purple for someone in a hosted chat through the
  // app (`state.chatPeople`), whose name is not grayed: they are online, in Ooga Chat.
  const markListener = (row, app, speaking = false) => {
    const dot = row.li.querySelector(".roster-presence"), kind = app ? "cloud" : "listener";
    const words = !app ? "Listening in Ooga Chat" : speaking ? "Speaking in Ooga Chat" : "In Ooga Chat";
    if (dot.dataset.online !== kind) dot.dataset.online = kind;
    if (dot.title !== words) { dot.title = words; dot.setAttribute("aria-label", words); }
    row.li.classList.toggle("players-listener", !app);
  };
  // In Ooga Chat: each live hosted chat (net.js `state.chatMembers`, the room's word), a group of its own after every
  // zone's: one button a chat, its title (wrapping, never cut short) and its counts under it ("3 speaking · 12 listening",
  // a count of nobody left out), "You're in this chat" on the one the visitor is in; busiest first, then by title. A press
  // opens the chat's preview (cloud-panel.js `preview`), whose Join as listener or Join as speaker opens it in the Ooga
  // Chat tab; the chat the visitor is in only shows that tab.
  const IN_CHATS = "in-ooga-chat", chatRows = new Map(), chatOrder = [], COLLATE = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  const chatRow = (id) => {
    let row = chatRows.get(id);
    if (row) return row;
    const li = document.createElement("li"), button = document.createElement("button"), title = document.createElement("span");
    const counts = document.createElement("span"), here = document.createElement("span");
    li.className = "players-chat";
    button.type = "button"; button.className = "players-chat-open"; button.dataset.chat = id;
    title.className = "players-chat-title"; counts.className = "players-chat-counts";
    here.className = "players-chat-here"; here.textContent = "You're in this chat"; here.hidden = true;
    button.append(title, counts, here); li.append(button);
    row = { li, title, counts, here, name: "", busy: 0, seen: 0, shown: "" };
    chatRows.set(id, row);
    return row;
  };
  const chatCounts = (c) => [c.speakers ? `${c.speakers} speaking` : "", c.listeners ? `${c.listeners} listening` : ""].filter(Boolean).join(" · ");
  const rowOf = (li) => li.dataset.cloud ? cloudRows.get(li.dataset.cloud) : li.dataset.listener ? listenerRows.get(li.dataset.listener) : rows.get(Number(li.dataset.id));
  const makeRow = () => {
    const li = document.createElement("li"), dots = document.createElement("span"), presence = document.createElement("span"), name = document.createElement("span");
    const label = document.createElement("span"), host = document.createElement("span"), marks = document.createElement("span");
    const voice = document.createElement("button"), look = document.createElement("button"), distance = document.createElement("span");
    const link = document.createElement("button"), call = document.createElement("span");
    const note = document.createElement("span"), id = `players-name-${++serial}`;
    const toggle = document.createElement("button"), volume = document.createElement("div"), volumeLabel = document.createElement("label");
    const slider = document.createElement("input"), value = document.createElement("output");
    toggle.type = "button"; toggle.className = "roster-name players-name-toggle";
    toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-controls", `${id}-volume`);
    volume.className = "players-volume"; volume.id = `${id}-volume`; volume.hidden = true;
    volumeLabel.className = "players-hearing-label"; volumeLabel.htmlFor = `${id}-range`; volumeLabel.textContent = "Volume";
    slider.type = "range"; slider.className = "players-volume-range"; slider.id = `${id}-range`;
    slider.min = "0"; slider.max = String(V.VOLUME_MAX * 100); slider.step = "5"; slider.value = "100";
    value.className = "players-volume-value"; value.htmlFor = slider.id; value.textContent = "100%";
    // A duel (duel.js), offered under another player's name while the island can hold one.
    const duel = document.createElement("button");
    duel.type = "button"; duel.className = "duel-button players-duel"; duel.textContent = "Challenge to a duel"; duel.hidden = true;
    volume.append(volumeLabel, slider, value, duel);
    dots.className = "roster-dots";
    presence.className = "roster-presence"; presence.dataset.online = "true"; presence.setAttribute("role", "img");
    presence.setAttribute("aria-label", "Online"); presence.title = "Online";
    name.className = "players-name"; label.className = "roster-label"; label.id = id;
    host.className = "roster-host"; host.hidden = true; host.setAttribute("role", "img");
    host.setAttribute("aria-label", "Host: runs the Oogas for everyone"); host.title = "Host: runs the Oogas for everyone";
    const mark = document.createElement("span"), hand = document.createElement("span"), react = document.createElement("span");
    mark.className = "players-mark";
    hand.className = "players-hand"; hand.hidden = true; hand.setAttribute("role", "img"); hand.setAttribute("aria-label", "Hand raised"); hand.title = "Hand raised";
    react.className = "players-react"; react.hidden = true; react.setAttribute("aria-hidden", "true");
    mark.append(hand, react);
    toggle.append(label); name.append(toggle); dots.append(presence, host);
    marks.className = "roster-marks";
    voice.className = "roster-voice"; voice.type = "button"; voice.hidden = true; voice.setAttribute("aria-describedby", id); voice.append(BL.hud.voiceIcon.cloneNode(true));
    // A voice link, offered where the room keeps them; never on the visitor's own row.
    link.className = "players-link"; link.type = "button"; link.hidden = true; link.append(linkIcon.cloneNode(true));
    // In a hosted chat's voice (call-v1): the island voice paused, so a cloud where the voice mark would be.
    call.className = "call-mark"; call.hidden = true; call.setAttribute("role", "img"); call.setAttribute("aria-label", "In a chat"); call.title = "In a chat";
    call.append(BL.nativeIcons.svg("cloud"));
    marks.append(call, voice, link);
    look.className = "players-look"; look.type = "button"; look.setAttribute("aria-describedby", id); look.append(crosshair.cloneNode(true));
    distance.className = "players-distance"; distance.append("");
    note.className = "players-note"; note.textContent = ", last known location"; note.hidden = true;
    distance.append(note);
    li.append(dots, name, mark, marks, look, distance, volume);
    return { li, label, toggle, volume, slider, value, duel, host, voice, call, callOn: false, link, linkShown: "", linkName: "", mark, hand, handShown: "", react, reacting: null, button: look, distance, note, id: 0, self: false, name: "", zone: "", group: "", seen: 0,
      aim: "", voiceLook: "", voiceLogin: "", voiceSelf: false, blocked: false, hostOn: false, metres: -1, lastKnown: false, far: false, faded: false };
  };
  const selfRow = makeRow();
  selfRow.self = true;
  selfRow.button.hidden = true;
  selfRow.toggle.disabled = true;
  selfRow.toggle.removeAttribute("aria-expanded"); selfRow.toggle.removeAttribute("aria-controls");
  const groupFor = (key) => {
    let group = groups.get(key);
    if (!group) {
      const section = document.createElement("section"), head = document.createElement("h3"), ul = document.createElement("ul");
      section.className = "players-group"; head.className = "section-head"; head.id = `players-group-${++serial}`;
      ul.className = "players-rows"; ul.setAttribute("aria-labelledby", head.id);
      section.append(head, ul);
      group = { key, section, head, ul, seen: 0 };
      groups.set(key, group);
    }
    // Linked partners away from the island are listed under Ooga Chat, which is no zone of the game's.
    const heading = key === "ooga-chat" ? "Ooga Chat" : key === IN_CHATS ? "In Ooga Chat" : Z.heading(key);
    if (group.head.textContent !== heading) group.head.textContent = heading;
    return group;
  };
  const clear = () => {
    for (const row of rows.values()) row.li.remove();
    rows.clear();
    for (const row of cloudRows.values()) row.li.remove();
    cloudRows.clear();
    for (const row of listenerRows.values()) row.li.remove();
    listenerRows.clear();
    for (const row of chatRows.values()) row.li.remove();
    chatRows.clear();
    selfRow.li.remove();
    for (const group of groups.values()) group.section.remove();
    groups.clear();
  };

  // The voice and host marks, as the roster paints them.
  const paintMarks = () => {
    if (!showing || stale) return;
    const s = net.state, voice = BL.voice.stats, inVoice = voice.enabled || voice.returning;
    paintMark(selfRow, inVoice ? voice.muted ? "muted" : voice.speaking ? "speaking" : "on" : "", "", inVoice, s.hostId === s.selfId, s.hand ? (s.handEmoji || BL.reactionPolicy.HANDS[s.handTone]) : "");
    paintCall(selfRow, !!s.call);
    for (const row of rows.values()) {
      const rec = net.remotes.get(row.id);
      if (!rec) continue;
      // A player out of voice shows no mic at all.
      const look = rec.voice ? rec.muted ? "muted" : !row.faded && BL.voice.speaking(rec.id) ? "speaking" : "on" : "";
      paintMark(row, look, rec.login, false, rec.id === s.hostId, rec.hand ? (rec.handEmoji || BL.reactionPolicy.HANDS[rec.handTone]) : "");
      paintCall(row, !!rec.call);
      paintLink(row, s.voiceLinks ? net.voiceLink(rec.id) : "", rec.display);
      const level = V.volumeOf(row.id), words = `${Math.round(level * 100)}%`;
      if (row.slider.value !== String(level * 100)) row.slider.value = String(level * 100);
      if (row.value.textContent !== words) row.value.textContent = words;
      row.slider.setAttribute("aria-valuetext", words);
    }
    // A cloud speaker's mark as a player's: green while this page hears them speak, faded and never green out of earshot.
    for (const row of cloudRows.values()) {
      const c = cloudOf(row.cloud);
      if (!c) continue;
      const key = row.cloud.startsWith("gh:") ? Number(row.cloud.slice(3)) : 0, out = !key || !V.inEarshot(key);
      if (row.faded !== out) { row.faded = out; row.voice.dataset.far = String(out); }
      paintMark(row, c.mic === "muted" ? "muted" : !out && V.speaking(key) ? "speaking" : "on", "", false, false, c.hand);
      paintLink(row, key ? appLink(key) : "", row.name);
    }
    for (const row of listenerRows.values()) paintLink(row, row.account ? appLink(row.account) : "", row.name);
  };
  // Someone in Ooga Chat shows the link only while linked or asked: only a player on the island can be asked.
  const appLink = (id) => {
    if (!net.state.voiceLinks) return "";
    const state = net.voiceLink(id);
    return state === "none" ? "" : state;
  };
  // A row's link, offered where the room keeps them (`state` empty hides it), painted again only when it or the name moves.
  const paintLink = (row, state, name) => {
    if (row.linkShown === state && row.linkName === name) return;
    row.linkShown = state; row.linkName = name; row.link.hidden = !state;
    if (!state) return;
    const words = LINK_WORDS[state](name);
    row.link.dataset.link = state;
    row.link.setAttribute("aria-pressed", String(state !== "none"));
    row.link.title = words; row.link.setAttribute("aria-label", words);
  };
  const paintCall = (row, on) => { if (row.callOn !== on) { row.callOn = on; row.call.hidden = !on; } };
  const paintMark = (row, look, login, self, host, hand = "") => {
    if (row.handShown !== hand) {
      row.handShown = hand; row.hand.textContent = hand; row.hand.hidden = !hand;
      const words = hand && BL.reactionPolicy.HANDS.includes(hand) ? "Hand raised" : `Pinned emoji ${hand}`;
      row.hand.title = words; row.hand.setAttribute("aria-label", words);
    }
    const blocked = !!login && BL.voice.mutedLocally(row.id), duelMuted = !self && V.mutedByDuel(row.id);
    if (row.voiceLook !== look || row.voiceLogin !== login || row.voiceSelf !== self || row.blocked !== blocked || row.duelMuted !== duelMuted) {
      row.duelMuted = duelMuted;
      row.voiceLook = look; row.voiceLogin = login; row.voiceSelf = self; row.blocked = blocked;
      const button = row.voice, words = BL.hud.voiceWords(look, self, blocked, login) + (duelMuted ? ". Automatically muted until their duel ends" : "");
      button.hidden = !look;
      button.dataset.voice = look; button.dataset.login = login; button.dataset.self = String(self);
      button.disabled = !login && !self;
      button.setAttribute("aria-pressed", String(blocked));
      button.title = words; button.setAttribute("aria-label", words);
    }
    if (row.hostOn !== host) { row.hostOn = host; row.host.hidden = !host; }
  };
  // A reaction (`net.subscribeReactions`, 0 for the visitor's own) pops up on its sender's row where a raised hand stands,
  // over the hand when one is up, rises a little and fades, as it does over their Ooga (reaction-bar.js `pop`, which
  // Ooga Chat's tiles play too); the newest replaces the one before. Rows are not kept up while the panel is hidden, so
  // then it shows nowhere.
  const reacted = (id, emoji) => {
    if (!showing || stale) return;
    popRow(id === 0 ? selfRow : rows.get(id), emoji);
  };
  // A cloud speaker's reaction, from the room's audience feed (`kind: "react"`, for the zone they speak in).
  const cloudReacted = (msg) => {
    if (msg.kind !== "react" || !showing || stale || typeof msg.id !== "string") return;
    const row = cloudRows.get(msg.id), c = row && cloudOf(msg.id);
    if (c && c.zone === msg.zone && BL.reactionPolicy.valid(msg.e)) popRow(row, msg.e);
  };
  const popRow = (row, emoji) => {
    if (!row || !row.li.isConnected) return;
    if (row.reacting) row.reacting.cancel();
    row.react.textContent = emoji; row.react.hidden = false;
    const run = row.reacting = BL.reactionBar.pop(row.react);
    run.onfinish = () => {
      if (row.reacting !== run) return;
      row.reacting = null; row.react.hidden = true;
    };
  };

  // Distances and crosshairs, from where everyone stands now.
  const measure = () => {
    if (!showing || stale) return;
    const s = net.state, me = s.self, mine = s.zone, placed = me.zone === mine, radius = V.stats.radius;
    shownZone = mine; shownRadius = radius;
    let faded = false;
    for (const row of rows.values()) {
      const rec = net.remotes.get(row.id);
      if (!rec) continue;
      let aim = "route", metres = -1, distance = -1, lastKnown = false;
      if (BL.voiceBlend.sameFrame(rec.zone, mine)) {
        if (rec.poseZone === rec.zone) {
          lastKnown = !rec.body;
          aim = lastKnown ? "known" : "player";
          if (placed) { distance = Math.hypot(rec.x - me.x, rec.y - me.y, rec.z - me.z); metres = Math.round(distance); }
        } else aim = "nowhere";
      } else {
        const step = Z.next(mine, rec.zone);
        if (step && doors && doors(mine, step, door, placed ? me.x : NaN, placed ? me.z : NaN)) aim = "door";
      }
      if (row.aim !== aim) {
        row.aim = aim;
        const words = LOOK[aim];
        row.button.title = words; row.button.setAttribute("aria-label", words);
        row.button.setAttribute("aria-disabled", String(aim === "nowhere" || aim === "route"));
      }
      if (row.metres !== metres || row.lastKnown !== lastKnown) {
        row.metres = metres; row.lastKnown = lastKnown;
        row.distance.firstChild.data = metres < 0 ? "" : `${metres} m`;
        row.distance.dataset.known = lastKnown ? "last" : "live";
        row.distance.title = lastKnown && metres >= 0 ? "Last known location" : "";
        row.note.hidden = !(lastKnown && metres >= 0);
      }
      const far = radius > 0 && distance >= radius && net.voiceLink(rec.id) !== "linked";
      if (row.far !== far) { row.far = far; row.distance.dataset.far = String(far); }
      const out = !V.inEarshot(row.id);
      if (row.faded !== out) { row.faded = out; row.voice.dataset.far = String(out); faded = true; }
    }
    for (const row of cloudRows.values()) {
      let aim = "route", metres = -1;
      if (cloudSpot && cloudSpot(row.cloud, spot)) {
        aim = "cloud";
        if (placed && BL.voiceBlend.sameFrame(row.zone, mine)) metres = Math.round(Math.hypot(spot.x - me.x, spot.y - me.y, spot.z - me.z));
      }
      if (row.aim !== aim) {
        row.aim = aim;
        const words = LOOK[aim];
        row.button.title = words; row.button.setAttribute("aria-label", words);
        row.button.setAttribute("aria-disabled", String(aim === "route"));
      }
      if (row.metres !== metres) {
        row.metres = metres;
        row.distance.firstChild.data = metres < 0 ? "" : `${metres} m`;
        row.distance.dataset.known = "live";
      }
    }
    // A voice that fades stops showing as speaking at once, and shows it again on coming back.
    if (faded) paintMarks();
  };

  // Hearing range is ready even alone and before voice joins; changing it never acquires a microphone.
  const paintHearing = () => {
    if (!showing || stale) return;
    const voice = V.stats;
    muteDuels.checked = voice.muteDuels;
    muteDuels.disabled = !net.state.me;
    hearing.hidden = false;
    const words = voice.radius ? `${voice.radius} m` : "No limit", value = String(voice.radius || V.RADIUS_MAX + RANGE_STEP);
    if (rangeValue.textContent !== words) { rangeValue.textContent = words; range.setAttribute("aria-valuetext", words); }
    if (range.value !== value && document.activeElement !== range) range.value = value;
    if (voice.radius !== shownRadius) measure();
  };

  // Who is in the room and where: rows placed by group and name, groups by the visitor's own first, then heading.
  const render = () => {
    if (!showing) { stale = true; return; }
    stale = false;
    const s = net.state, live = s.room === "live" && !!s.me;
    const words = !s.me || live ? "" : ROOM_WORDS[s.room] || "";
    if (status.textContent !== words) status.textContent = words;
    status.hidden = !words;
    list.hidden = !live;
    paintHearing();
    const chip = live ? `${BL.cloudPanel ? BL.cloudPanel.online(s) : s.online} online` : "Offline";
    if (count.textContent !== chip) count.textContent = chip;
    count.dataset.tone = live ? "live" : "idle";
    if (!s.me) { clear(); return; }
    if (!live) return;
    pass++;
    order.length = 0;
    selfRow.id = s.selfId; selfRow.name = s.me.display; selfRow.zone = s.zone; selfRow.group = Z.groupOf(s.zone);
    order.push(selfRow);
    for (const rec of net.remotes.values()) {
      let row = rows.get(rec.id);
      if (!row) {
        row = makeRow();
        row.id = rec.id; row.li.dataset.id = String(rec.id);
        rows.set(rec.id, row);
      }
      row.name = rec.display; row.zone = rec.zone; row.group = Z.groupOf(rec.zone); row.seen = pass;
      order.push(row);
    }
    for (const [id, row] of rows) if (row.seen !== pass) { row.li.remove(); rows.delete(id); }
    for (const c of s.clouds) {
      let row = cloudRows.get(c.id);
      if (!row) {
        row = makeRow();
        row.cloud = c.id; row.id = -Number(c.id.slice(c.id.indexOf(":") + 1));
        row.li.dataset.id = String(row.id); row.li.dataset.cloud = c.id;
        const dot = row.li.querySelector(".roster-presence");
        dot.dataset.online = "cloud"; dot.title = "Speaking from Ooga Chat"; dot.setAttribute("aria-label", "Speaking from Ooga Chat");
        row.toggle.disabled = true; row.toggle.removeAttribute("aria-expanded"); row.toggle.removeAttribute("aria-controls");
        cloudRows.set(c.id, row);
      }
      row.name = c.display; row.zone = c.zone === "main" ? "outside" : "dsb-outside"; row.group = Z.groupOf(row.zone); row.seen = pass;
      order.push(row);
    }
    for (const [id, row] of cloudRows) if (row.seen !== pass) { row.li.remove(); cloudRows.delete(id); }
    const listening = BL.cloudPanel ? BL.cloudPanel.listeners() : null;
    if (listening) for (const l of listening) {
      const row = listenerRow(l.id);
      row.name = l.display; row.zone = "outside"; row.group = Z.groupOf("outside"); row.seen = pass; row.account = 0;
      markListener(row, false);
      order.push(row);
    }
    // Linked partners in Ooga Chat (`net.state.linkApp`), who can hear this visitor wherever they stand: each listed with
    // the link, under Main Island while listening there, else under Ooga Chat, and on its cloud while speaking.
    for (const q of s.linkApp) {
      const key = `gh:${q.id}`;
      if (q.id === s.selfId || net.remotes.has(q.id) || cloudRows.has(key)) continue;
      const row = listenerRow(key);
      if (row.seen !== pass) { row.name = q.display; row.zone = "ooga-chat"; row.group = "ooga-chat"; row.seen = pass; order.push(row); }
      row.account = q.id;
    }
    // Everyone in hosted chats through Ooga Chat and not on the island (the room's `chat-people`), under Ooga Chat with
    // its purple dot: the names behind the "N online" the chats add. Anyone listed already (a player, a linked partner,
    // a speaker on a cloud) is listed once.
    for (const q of s.chatPeople) {
      const account = q.id.startsWith("gh:") ? Number(q.id.slice(3)) : 0;
      if (account && (account === s.selfId || net.remotes.has(account)) || cloudRows.has(q.id)) continue;
      const row = listenerRow(q.id);
      if (row.seen === pass) continue;
      row.name = q.display; row.zone = "ooga-chat"; row.group = "ooga-chat"; row.seen = pass; row.account = 0;
      markListener(row, true, q.speaking);
      order.push(row);
    }
    for (const [id, row] of listenerRows) if (row.seen !== pass) { row.li.remove(); listenerRows.delete(id); }
    Z.arrange(order, selfRow.group);
    let group = null, groupIndex = 0, rowIndex = 0;
    for (const row of order) {
      if (!group || group.key !== row.group) {
        group = groupFor(row.group);
        group.seen = pass;
        if (list.children[groupIndex] !== group.section) list.insertBefore(group.section, list.children[groupIndex] || null);
        groupIndex++; rowIndex = 0;
      }
      if (group.ul.children[rowIndex] !== row.li) group.ul.insertBefore(row.li, group.ul.children[rowIndex] || null);
      rowIndex++;
      if (row.label.textContent !== row.name) { row.label.textContent = row.name; row.label.title = row.name; }
      if (!row.self) row.slider.setAttribute("aria-label", `Volume for ${row.name}`);
    }
    // In Ooga Chat comes last, after every zone's group.
    chatOrder.length = 0;
    const inChat = BL.chatCall && BL.chatCall.room ? BL.chatCall.room.id : "";
    for (const [id, c] of s.chatMembers) {
      const row = chatRow(id), here = id === inChat, shown = `${c.title}\n${chatCounts(c)}\n${here}`;
      row.name = c.title || "Untitled chat"; row.busy = c.speakers + c.listeners; row.seen = pass;
      if (row.shown !== shown) {
        row.shown = shown;
        row.title.textContent = row.name; row.counts.textContent = chatCounts(c); row.here.hidden = !here;
      }
      chatOrder.push(row);
    }
    for (const [id, row] of chatRows) if (row.seen !== pass) { row.li.remove(); chatRows.delete(id); }
    if (chatOrder.length) {
      chatOrder.sort((a, b) => b.busy - a.busy || COLLATE.compare(a.name, b.name));
      const chats = groupFor(IN_CHATS);
      chats.seen = pass;
      if (list.children[groupIndex] !== chats.section) list.insertBefore(chats.section, list.children[groupIndex] || null);
      chatOrder.forEach((row, i) => { if (chats.ul.children[i] !== row.li) chats.ul.insertBefore(row.li, chats.ul.children[i] || null); });
    }
    for (const [key, entry] of groups) if (entry.seen !== pass) { entry.section.remove(); groups.delete(key); }
    measure();
    paintMarks();
  };

  // Turn toward the row's player, or the door on the way to them, if nothing has changed since the row was drawn.
  const lookAt = (row) => {
    const s = net.state;
    if (s.room !== "live" || !s.me || s.zone !== shownZone) return;
    if (row.cloud) {
      if (cloudSpot && cloudSpot(row.cloud, spot)) BL.pilot.turnToward(spot.x, spot.y + BODY_Y, spot.z);
      return;
    }
    const rec = net.remotes.get(row.id);
    if (!rec || rec.zone !== row.zone) return;
    if (BL.voiceBlend.sameFrame(rec.zone, s.zone)) {
      if (rec.poseZone === rec.zone) BL.pilot.turnToward(rec.x, rec.y + BODY_Y, rec.z);
      return;
    }
    const me = s.self, placed = me.zone === s.zone, step = Z.next(s.zone, rec.zone);
    if (step && doors && doors(s.zone, step, door, placed ? me.x : NaN, placed ? me.z : NaN)) BL.pilot.turnToward(door.x, door.y, door.z);
  };
  list.addEventListener("click", (e) => {
    const link = e.target.closest(".players-link");
    if (link) {
      link.blur();
      const li = link.closest("li"), key = li.dataset.cloud || li.dataset.listener || "";
      net.toggleVoiceLink(key.startsWith("gh:") ? Number(key.slice(3)) : Number(li.dataset.id));
      return;
    }
    const voice = e.target.closest(".roster-voice");
    if (voice) {
      if (e.detail) voice.blur();
      if (voice.disabled) return;
      // The visitor's own mark mutes and unmutes their microphone; anyone else's mutes them for this visitor.
      if (voice.dataset.self === "true") BL.voice.toggle();
      else BL.voice.muteLocal(Number(voice.closest("li").dataset.id), voice.getAttribute("aria-pressed") !== "true");
      return;
    }
    const toggle = e.target.closest(".players-name-toggle");
    if (toggle && !toggle.disabled) {
      const row = rowOf(toggle.closest("li"));
      if (row && !row.cloud) {
        const open = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", String(open)); row.volume.hidden = !open;
        row.duel.hidden = !(open && BL.duel && BL.duel.offered(row.id));
      }
      return;
    }
    // A chat in In Ooga Chat: its preview, the focus coming back here as it closes.
    const chat = e.target.closest(".players-chat-open");
    if (chat) {
      if (BL.cloudPanel) BL.cloudPanel.preview(chat.dataset.chat, chat);
      return;
    }
    const duel = e.target.closest(".players-duel");
    if (duel) {
      if (e.detail) duel.blur();
      BL.duel.challenge(Number(duel.closest("li").dataset.id));
      return;
    }
    const look = e.target.closest(".players-look");
    if (!look) return;
    look.blur();
    const row = rowOf(look.closest("li"));
    if (row && look.getAttribute("aria-disabled") !== "true") lookAt(row);
  });

  list.addEventListener("input", (e) => {
    if (!e.target.matches(".players-volume-range")) return;
    const row = rows.get(Number(e.target.closest("li").dataset.id));
    if (!row || !net.remotes.has(row.id)) return;
    V.setVolume(row.id, Number(row.slider.value) / 100);
    const words = `${Math.round(V.volumeOf(row.id) * 100)}%`;
    row.value.textContent = words; row.slider.setAttribute("aria-valuetext", words);
  });

  // Marks and distances are not kept up while hidden, so the panel is drawn afresh whenever it shows again.
  const updateShowing = () => {
    const was = showing;
    showing = BL.sheet.visible(panel);
    if (showing && (stale || !was)) render();
  };
  const watch = new MutationObserver(updateShowing);
  watch.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  watch.observe(sheet, { attributes: true, attributeFilter: ["data-open", "hidden"] });
  document.addEventListener("sheetchange", updateShowing);
  // The slider's last stop is past RADIUS_MAX, which setRadius takes as no limit. A pointer lets go of it once set, so M and
  // the other keys reach the page again; from the keyboard it keeps the focus to step on.
  range.addEventListener("input", () => V.setRadius(Number(range.value)));
  range.addEventListener("pointerup", () => range.blur());
  // Joins: named, counted until looked at, and spoken when asked.
  const REJOIN_QUIET = 120000, TOAST_MS = 2800, SPEECH_STUCK_MS = 15000, NAMES_SHOWN = 3, SPEAK_KEY = "oogaboogaland.players.speak";
  // `leftNoted`: who has a sign-out on the bell that a quick return would take back.
  const leftAt = new Map(), leftNoted = new Set(), shown = { names: [], extra: 0 }, said = { names: [], extra: 0 };
  let unread = 0, shownAt = -Infinity, shownText = "", speaking = false, speakingAt = 0, speakOn = false, speechSerial = 0;
  const add = (list, name) => { if (list.names.length < NAMES_SHOWN) list.names.push(name); else list.extra++; };
  const words = (list) => {
    const all = list.extra ? [...list.names, `${list.extra} ${list.extra === 1 ? "other" : "others"}`] : list.names;
    return all.length === 1 ? `${all[0]} is online` : `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]} are online`;
  };
  const setUnread = (count) => { unread = count; leftNoted.clear(); BL.sheet.setBadge("players", count); };
  // One sign-in or sign-out, counted on the tab and listed under the bell.
  const note = (text, kind, key) => { unread++; BL.sheet.note("players", text, key, kind); };
  const utter = (text) => {
    const line = new SpeechSynthesisUtterance(text);
    const serial = ++speechSerial;
    line.onend = line.onerror = () => { if (serial === speechSerial) sayNext(); };
    speaking = true; speakingAt = performance.now();
    synth.speak(line);
  };
  const sayNext = () => {
    speaking = false;
    if (!said.names.length) return;
    const text = words(said);
    said.names.length = 0; said.extra = 0;
    if (speakOn) utter(text);
  };
  const say = (name) => {
    if (!synth || !speakOn) return;
    add(said, name);
    if (!speaking || performance.now() - speakingAt > SPEECH_STUCK_MS) sayNext();
  };
  const hush = () => {
    said.names.length = 0; said.extra = 0;
    const active = speaking;
    speechSerial++; speaking = false;
    if (synth && active) synth.cancel();
  };
  net.subscribePresence((rec, joined) => {
    const now = performance.now();
    for (const [id, at] of leftAt) if (now - at > REJOIN_QUIET) { leftAt.delete(id); leftNoted.delete(id); }
    if (!joined) {
      leftAt.set(rec.id, now);
      if (!BL.sheet.attending(panel)) { leftNoted.add(rec.id); note(`${rec.display} signed out`, "out", rec.id); }
      return;
    }
    if (leftAt.delete(rec.id)) {
      // Back within REJOIN_QUIET they never really left, so their sign-out leaves the bell and the count.
      if (leftNoted.delete(rec.id)) { unread--; BL.sheet.unnote("players", rec.id); }
      return;
    }
    if (!BL.sheet.attending(panel)) note(`${rec.display} signed in`, "in");
    // A join adds to the message only while it is still the one on screen.
    if (now - shownAt > TOAST_MS || toastBox.hidden || toastBox.textContent !== shownText) { shown.names.length = 0; shown.extra = 0; }
    add(shown, rec.display);
    shownAt = now; shownText = words(shown);
    BL.hud.toast(shownText);
    say(rec.display);
  });
  BL.sheet.watchViews(panel, () => { if (unread) setUnread(0); });
  net.subscribe(() => {
    if (net.state.me) return;
    if (unread) setUnread(0);
    leftAt.clear(); hush();
  });
  // The keyboard noise filter (voice.js `setKeyFilter`), offered only where the page has its worklet to load.
  const keys = $("players-keys"), keysBox = $("players-keys-input");
  if (V.stats.keyFilterOffered) {
    keysBox.checked = V.stats.keyFilter;
    keys.hidden = false;
    keysBox.addEventListener("change", () => V.setKeyFilter(keysBox.checked));
    keysBox.addEventListener("click", (e) => { if (e.detail) keysBox.blur(); });
  }
  if (synth) {
    try { speakOn = localStorage.getItem(SPEAK_KEY) === "on"; } catch { /* Storage may be unavailable. */ }
    speakBox.checked = speakOn;
    speak.hidden = false;
    speakBox.addEventListener("change", () => {
      speakOn = speakBox.checked;
      try { localStorage.setItem(SPEAK_KEY, speakOn ? "on" : "off"); } catch { /* Storage may be unavailable. */ }
      hush();
      // Said from the tick itself, the gesture a phone's browser needs before it speaks the joins that follow.
      if (speakOn) utter("Joins will be read aloud");
    });
    speakBox.addEventListener("click", (e) => { if (e.detail) speakBox.blur(); });
  }
  net.subscribe(render);
  net.subscribeRoster(render);
  net.subscribeMoves(measure);
  net.subscribeReactions(reacted);
  net.subscribeAudience(cloudReacted);
  net.subscribeClouds(render);
  BL.voice.subscribe(paintMarks);
  BL.voice.subscribe(paintHearing);
  // The scene the visitor is in names its doors (`fn(from, step, out, nearX, nearZ)`, true with `out` written), or null.
  const setDoors = (fn) => {
    doors = fn;
    measure();
  };
  const setCloudSpot = (fn) => {
    cloudSpot = fn;
    measure();
  };
  BL.players = { setDoors, setCloudSpot, refresh: () => render(), get stats() { return { showing, rows: rows.size, clouds: cloudRows.size, listeners: listenerRows.size, chats: chatRows.size, groups: groups.size, unread, speakOn }; } };
})();
