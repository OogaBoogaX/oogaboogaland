// The live players tab beside Ooga Boogas (#361), for signed-in visitors: every player in the island room, grouped by
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
// what changed. No timers. Exports setDoors and stats.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const net = BL.net, Z = BL.zoneMap;
  const $ = (id) => document.getElementById(id);
  const sheet = $("sheet"), panel = $("players-panel"), list = $("players-list"), status = $("players-status"), count = $("players-count");
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
  let serial = 0, pass = 0, showing = false, stale = true, doors = null, shownZone = "";
  const makeRow = () => {
    const li = document.createElement("li"), presence = document.createElement("span"), name = document.createElement("span");
    const label = document.createElement("span"), host = document.createElement("span"), marks = document.createElement("span");
    const voice = document.createElement("button"), look = document.createElement("button"), distance = document.createElement("span");
    const note = document.createElement("span"), id = `players-name-${++serial}`;
    presence.className = "roster-presence"; presence.dataset.online = "true"; presence.setAttribute("role", "img");
    presence.setAttribute("aria-label", "Online"); presence.title = "Online";
    name.className = "players-name"; label.className = "roster-label"; label.id = id;
    host.className = "roster-host"; host.hidden = true; host.setAttribute("role", "img");
    host.setAttribute("aria-label", "Host: runs the Oogas for everyone"); host.title = "Host: runs the Oogas for everyone";
    name.append(label, host);
    marks.className = "roster-marks";
    voice.className = "roster-voice"; voice.type = "button"; voice.hidden = true; voice.append(BL.hud.voiceIcon.cloneNode(true));
    marks.append(voice);
    look.className = "players-look"; look.type = "button"; look.setAttribute("aria-describedby", id); look.append(crosshair.cloneNode(true));
    distance.className = "players-distance"; distance.append("");
    note.className = "players-note"; note.textContent = ", last known location"; note.hidden = true;
    distance.append(note);
    li.append(presence, name, marks, look, distance);
    return { li, label, host, voice, button: look, distance, note, id: 0, self: false, name: "", zone: "", group: "", seen: 0,
      aim: "", voiceLook: "", voiceLogin: "", voiceSelf: false, blocked: false, hostOn: false, metres: -1, lastKnown: false };
  };
  const selfRow = makeRow();
  selfRow.self = true;
  selfRow.button.hidden = true;
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
      paintMark(row, look, rec.voice ? rec.login : "", false, rec.id === s.hostId);
    }
  };
  const paintMark = (row, look, login, self, host) => {
    const blocked = !!login && BL.voice.mutedLocally(login);
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

  // Distances and crosshairs, from where everyone stands now.
  const measure = () => {
    if (!showing || stale) return;
    const s = net.state, me = s.self, mine = s.zone, placed = me.zone === mine;
    shownZone = mine;
    for (const row of rows.values()) {
      const rec = net.remotes.get(row.id);
      if (!rec) continue;
      let aim = "route", metres = -1, lastKnown = false;
      if (rec.zone === mine) {
        if (rec.poseZone === rec.zone) {
          lastKnown = !rec.body;
          aim = lastKnown ? "known" : "player";
          if (placed) metres = Math.round(Math.hypot(rec.x - me.x, rec.y - me.y, rec.z - me.z));
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
    }
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
      voice.blur();
      if (voice.disabled) return;
      // The visitor's own mark mutes and unmutes their microphone; anyone else's mutes them for this visitor.
      if (voice.dataset.self === "true") BL.voice.toggle();
      else BL.voice.muteLocal(voice.dataset.login, voice.getAttribute("aria-pressed") !== "true");
      return;
    }
    const look = e.target.closest(".players-look");
    if (!look) return;
    look.blur();
    const row = rows.get(Number(look.closest("li").dataset.id));
    if (row && look.getAttribute("aria-disabled") !== "true") lookAt(row);
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
  net.subscribe(render);
  net.subscribeRoster(render);
  net.subscribeMoves(measure);
  BL.voice.subscribe(paintMarks);
  // The scene the visitor is in names its doors (`fn(from, step, out, nearX, nearZ)`, true with `out` written), or null.
  const setDoors = (fn) => {
    doors = fn;
    measure();
  };
  BL.players = { setDoors, get stats() { return { showing, rows: rows.size, groups: groups.size }; } };
})();
