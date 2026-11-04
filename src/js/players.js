// The Online Oogas tab beside Contributing Oogas (#361), for signed-in visitors: every player in the island room, grouped by
// the zone they are in (zone-map.js), the visitor's own group first with their own row at its head, then the other
// groups by heading and everyone in a group by name. A row keeps the roster's marks (the online dot, the host's dot,
// the voice mark, which mutes as it does there), a crosshair that turns the camera (`BL.pilot.turnToward`) and, for
// others in the visitor's own zone, how many metres away they stand, kept up to date without moving any row.
// Where people stand comes from net.js: a player's position counts in their zone only once they have moved there,
// and one who let go of their Ooga keeps their last, shown in red as their last known location. The visitor's own is
// their Ooga's last reported (`net.state.self`), kept after they let go; the visitor's row shows no distance.
// The crosshair turns toward a player in the visitor's zone, or their last known spot; toward another zone, at the
// door the route there takes first, as the scene the visitor is in names it (`setDoors`; the island's for now). It is
// greyed out, saying why, where there is no spot or no door. Nothing moves but the camera. A click checks again that
// the player is still in the room and where the row put them and that the visitor has not changed zone; if anything
// changed it does nothing, and the next event redraws the rows.
// Cost: rows are placed only when someone joins, leaves or changes zone, body or name, and only while the panel shows;
// distances and crosshairs are rewritten as positions arrive (`subscribeMoves`, a few times a second at most), and only
// what changed. No timers. An Ooga thump (thump.js) shows a mallet beside its thumper's voice mark for a moment (`pulse`): every
// row holds that mark's cell from the start, shown and hidden by visibility, so it never moves a name or a control, and its
// animation's end hides it again; `clearPulses` hides them all at once. Exports setDoors, pulse, clearPulses and stats.
// The tab always holds the visitor's hearing range (#380, `BL.voice.setRadius`), ready before joining: the slider's last
// stop is no limit, and a distance at or past the range is dimmed, since that voice is muted for them. A voice in
// another place of the group, which shows no distance, is silenced by a range without a mark here. The slider is offered
// before any audio is active; Web Audio supplies quieting and boost once the listener joins.
// Hearing range and join-reading live together under the panel's Advanced settings disclosure.
// Joins (#430, `net.subscribePresence`): a player who comes online while the visitor is in the room is named on screen
// (`hud.toast`, read out by assistive technology) and counted on the tab until the visitor looks at it
// (`sheet.watchViews`), unless they are in the panel as it happens. Those already there when the visitor (re)joins are
// not named, nor is one who comes back within REJOIN_QUIET of leaving (a reconnect, a reload, a newer tab). Joins close
// together share one message while it shows. With "Read joins aloud" ticked (this browser's choice, in localStorage) the names are
// spoken too, one utterance at a time: names that arrive while one plays wait and are said together after it, and the
// Read joins aloud checkbox alone controls it, independently of environment sound. Speech starts from the box, a gesture.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const net = BL.net, Z = BL.zoneMap;
  const $ = (id) => document.getElementById(id);
  const sheet = $("sheet"), panel = $("players-panel"), list = $("players-list"), status = $("players-status"), count = $("players-count");
  const hearing = $("players-hearing"), range = $("players-hearing-range"), rangeValue = $("players-hearing-value"), V = BL.voice;
  const speak = $("players-speak"), speakBox = $("players-speak-input"), synth = window.speechSynthesis || null, toastBox = $("toast");
  // The slider's stops run RADIUS_MIN..RADIUS_MAX metres, and one more stop past them is no limit.
  const RANGE_STEP = Number(range.step);
  range.min = String(V.RADIUS_MIN);
  range.max = String(V.RADIUS_MAX + RANGE_STEP);
  const ROOM_WORDS = { off: "Not connected.", connecting: "Joining the island…", paused: "Paused while the tab was hidden.", replaced: "Open in another tab.", full: "The island is full.", revoked: "Your account access was revoked." };
  const LOOK = { player: "Look at player", known: "Look at last known position", door: "Look toward entrance", nowhere: "Location unavailable", route: "Route unavailable" };
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

  const rows = new Map(), groups = new Map(), order = [], door = { x: 0, y: 0, z: 0 };
  let serial = 0, pass = 0, showing = false, stale = true, doors = null, shownZone = "", shownRadius = -1;
  const makeRow = () => {
    const li = document.createElement("li"), presence = document.createElement("span"), name = document.createElement("span");
    const label = document.createElement("span"), host = document.createElement("span"), marks = document.createElement("span");
    const voice = document.createElement("button"), look = document.createElement("button"), distance = document.createElement("span");
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
    volume.append(volumeLabel, slider, value);
    presence.className = "roster-presence"; presence.dataset.online = "true"; presence.setAttribute("role", "img");
    presence.setAttribute("aria-label", "Online"); presence.title = "Online";
    name.className = "players-name"; label.className = "roster-label"; label.id = id;
    host.className = "roster-host"; host.hidden = true; host.setAttribute("role", "img");
    host.setAttribute("aria-label", "Host: runs the Oogas for everyone"); host.title = "Host: runs the Oogas for everyone";
    toggle.append(label); name.append(toggle, host);
    marks.className = "roster-marks";
    voice.className = "roster-voice"; voice.type = "button"; voice.hidden = true; voice.setAttribute("aria-describedby", id); voice.append(BL.hud.voiceIcon.cloneNode(true));
    marks.append(voice);
    const thump = document.createElement("span");
    thump.className = "players-thump"; thump.dataset.on = "false"; thump.setAttribute("aria-hidden", "true");
    thump.append(BL.hud.malletIcon.cloneNode(true));
    look.className = "players-look"; look.type = "button"; look.setAttribute("aria-describedby", id); look.append(crosshair.cloneNode(true));
    distance.className = "players-distance"; distance.append("");
    note.className = "players-note"; note.textContent = ", last known location"; note.hidden = true;
    distance.append(note);
    li.append(presence, name, marks, thump, look, distance, volume);
    return { li, label, toggle, volume, slider, value, host, voice, thump, pulse: null, button: look, distance, note, id: 0, self: false, name: "", zone: "", group: "", seen: 0,
      aim: "", voiceLook: "", voiceLogin: "", voiceSelf: false, blocked: false, hostOn: false, metres: -1, lastKnown: false, far: false };
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
    const heading = Z.heading(key);
    if (group.head.textContent !== heading) group.head.textContent = heading;
    return group;
  };
  const clear = () => {
    for (const row of rows.values()) row.li.remove();
    rows.clear();
    selfRow.li.remove();
    for (const group of groups.values()) group.section.remove();
    groups.clear();
  };

  // The voice and host marks, as the roster paints them.
  const paintMarks = () => {
    if (!showing || stale) return;
    const s = net.state, voice = BL.voice.stats;
    paintMark(selfRow, voice.enabled ? voice.muted ? "muted" : voice.speaking ? "speaking" : "on" : "", "", voice.enabled, s.hostId === s.selfId);
    for (const row of rows.values()) {
      const rec = net.remotes.get(row.id);
      if (!rec) continue;
      const look = rec.voice ? rec.muted ? "muted" : BL.voice.speaking(rec.id) ? "speaking" : "on" : "";
      paintMark(row, look || "off", rec.login, false, rec.id === s.hostId);
      const level = V.volumeOf(row.id), words = `${Math.round(level * 100)}%`;
      if (row.slider.value !== String(level * 100)) row.slider.value = String(level * 100);
      if (row.value.textContent !== words) row.value.textContent = words;
      row.slider.setAttribute("aria-valuetext", words);
    }
  };
  const paintMark = (row, look, login, self, host) => {
    const blocked = !!login && BL.voice.mutedLocally(row.id);
    if (row.voiceLook !== look || row.voiceLogin !== login || row.voiceSelf !== self || row.blocked !== blocked) {
      row.voiceLook = look; row.voiceLogin = login; row.voiceSelf = self; row.blocked = blocked;
      const button = row.voice, words = BL.hud.voiceWords(look, self, blocked, login);
      button.hidden = !look;
      button.dataset.voice = look; button.dataset.login = login; button.dataset.self = String(self);
      button.disabled = !login && !self;
      button.setAttribute("aria-pressed", String(blocked));
      button.title = words; button.setAttribute("aria-label", words);
    }
    if (row.hostOn !== host) { row.hostOn = host; row.host.hidden = !host; }
  };

  // An Ooga thump's mallet beside a player's voice mark, while the tab shows (thump.js); 0 or the visitor's own id is their
  // row. Only the cell's own state changes: its place in the row is kept either way. Under Calm it holds still.
  const THUMP_MS = 1400, CALM = window.matchMedia("(prefers-reduced-motion: reduce)");
  const THUMP_PULSE = [{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "scale(1.25)", offset: 0.18 }, { opacity: 1, transform: "scale(1)", offset: 0.4 }, { opacity: 0, transform: "scale(1)" }];
  const THUMP_STILL = [{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }];
  const unmark = (row) => {
    row.pulse = null;
    row.thump.dataset.on = "false";
    row.thump.removeAttribute("role"); row.thump.removeAttribute("aria-label"); row.thump.removeAttribute("title");
    row.thump.setAttribute("aria-hidden", "true");
  };
  const pulse = (id) => {
    if (!showing || stale) return false;
    const row = id === 0 || id === net.state.selfId ? selfRow : rows.get(id);
    if (!row || !row.li.isConnected) return false;
    const mark = row.thump;
    if (row.pulse) row.pulse.cancel();
    mark.dataset.on = "true";
    mark.removeAttribute("aria-hidden"); mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", "Thumped"); mark.title = "Thumped";
    const run = row.pulse = mark.animate(CALM.matches ? THUMP_STILL : THUMP_PULSE, { duration: THUMP_MS, easing: "ease-out" });
    run.onfinish = () => { if (row.pulse === run) unmark(row); };
    return true;
  };
  // Every mallet still showing goes at once (thump.js, when the visitor's voice membership changes).
  const clearPulses = () => {
    for (const row of [selfRow, ...rows.values()]) if (row.pulse) { row.pulse.cancel(); unmark(row); }
  };

  // Distances and crosshairs, from where everyone stands now.
  const measure = () => {
    if (!showing || stale) return;
    const s = net.state, me = s.self, mine = s.zone, placed = me.zone === mine, radius = V.stats.radius;
    shownZone = mine; shownRadius = radius;
    for (const row of rows.values()) {
      const rec = net.remotes.get(row.id);
      if (!rec) continue;
      let aim = "route", metres = -1, distance = -1, lastKnown = false;
      if (rec.zone === mine) {
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
      const far = radius > 0 && distance >= radius;
      if (row.far !== far) { row.far = far; row.distance.dataset.far = String(far); }
    }
  };

  // Hearing range is ready even alone and before voice joins; changing it never acquires a microphone.
  const paintHearing = () => {
    if (!showing || stale) return;
    const voice = V.stats;
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
    const chip = live ? `${s.online} online` : "Offline";
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
      if (row.label.textContent !== row.name) row.label.textContent = row.name;
      if (!row.self) row.slider.setAttribute("aria-label", `Volume for ${row.name}`);
    }
    for (const [key, entry] of groups) if (entry.seen !== pass) { entry.section.remove(); groups.delete(key); }
    paintMarks();
    measure();
  };

  // Turn toward the row's player, or the door on the way to them, if nothing has changed since the row was drawn.
  const lookAt = (row) => {
    const s = net.state;
    if (s.room !== "live" || !s.me || s.zone !== shownZone) return;
    const rec = net.remotes.get(row.id);
    if (!rec || rec.zone !== row.zone) return;
    if (rec.zone === s.zone) {
      if (rec.poseZone === rec.zone) BL.pilot.turnToward(rec.x, rec.y + BODY_Y, rec.z);
      return;
    }
    const me = s.self, placed = me.zone === s.zone, step = Z.next(s.zone, rec.zone);
    if (step && doors && doors(s.zone, step, door, placed ? me.x : NaN, placed ? me.z : NaN)) BL.pilot.turnToward(door.x, door.y, door.z);
  };
  list.addEventListener("click", (e) => {
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
      const row = rows.get(Number(toggle.closest("li").dataset.id));
      if (row) {
        const open = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", String(open)); row.volume.hidden = !open;
      }
      return;
    }
    const look = e.target.closest(".players-look");
    if (!look) return;
    look.blur();
    const row = rows.get(Number(look.closest("li").dataset.id));
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
  const leftAt = new Map(), shown = { names: [], extra: 0 }, said = { names: [], extra: 0 };
  let unread = 0, shownAt = -Infinity, shownText = "", speaking = false, speakingAt = 0, speakOn = false, speechSerial = 0;
  const add = (list, name) => { if (list.names.length < NAMES_SHOWN) list.names.push(name); else list.extra++; };
  const words = (list) => {
    const all = list.extra ? [...list.names, `${list.extra} ${list.extra === 1 ? "other" : "others"}`] : list.names;
    return all.length === 1 ? `${all[0]} is online` : `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]} are online`;
  };
  const setUnread = (count) => { unread = count; BL.sheet.setBadge("players", count); };
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
    for (const [id, at] of leftAt) if (now - at > REJOIN_QUIET) leftAt.delete(id);
    if (!joined) { leftAt.set(rec.id, now); return; }
    if (leftAt.delete(rec.id)) return;
    if (!BL.sheet.attending(panel)) setUnread(unread + 1);
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
  BL.voice.subscribe(paintMarks);
  BL.voice.subscribe(paintHearing);
  // The scene the visitor is in names its doors (`fn(from, step, out, nearX, nearZ)`, true with `out` written), or null.
  const setDoors = (fn) => {
    doors = fn;
    measure();
  };
  BL.players = { setDoors, pulse, clearPulses, get stats() { return { showing, rows: rows.size, groups: groups.size, unread, speakOn }; } };
})();
