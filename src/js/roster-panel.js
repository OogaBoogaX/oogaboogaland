// Contributing Oogas, the island's (hud.js) and Ooga Chat's (#656) alike: `build(section, { ids })` writes the panel's
// title, its Sorted by choice and its list into a panel section (ids only on the island's copy, which its tests and
// labels name), and `create(section, hooks)` fills it. A row a contributor: the online dot with the host's dot behind it,
// the name, which opens a darker strip of their stats under the row, the voice mark, how long ago they last contributed
// and their state (clank, chill, sleep, away), every row in the chosen order (latest contribution by default, or most
// contributions in the newest oogatron reading, this browser's choice), the away rows behind their Show away button.
// The strip: their Ooga's face, their total across the five kinds and the day of their first contribution side by
// side (its year shortened to ’26 on every strip at once when the roster's longest total and longest date would not
// fit), then the kinds and a chip linking each repository they contributed to (not the org's `.github`) with their
// count there. A section's rows are made once and kept for the page life, reused on every visit.
// The hooks are what differs between the pages: `roster` (the contributors: `name`, `display`), `stateFor(c)` and
// `ageLabel(c)` (their contribution's state and age, `stateAt` and `ageAt` below), `stamp(c)` (when they last
// contributed), `login(c)` and `joinedAt(c)`, `stats()` (the newest oogatron reading, normalized), `face(c)` (a canvas or
// image of their Ooga's face, null for none yet), `online(row)` (whether a row's dot is lit), `voice(button)` (a press
// on a voice mark) and `sortKey` (where the choice is kept). It reads nothing at load but window.BL, so Ooga Chat shares
// it; `stateAt` and `ageAt` are contributors.js's too.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const STATE_LABELS = { working: "clank", chilling: "chill", sleeping: "sleep", away: "away", online: "online" };
  const ROSTER_ORDER = { working: 0, chilling: 1, sleeping: 2, away: 3 };
  // Clanking (working) within one hour, chillin until a day has passed, asleep through 30 days, then away.
  const MINUTE = 60 * 1e3, HOUR = 60 * MINUTE, WORK_WINDOW = HOUR, CHILL_WINDOW = 24 * HOUR, AWAY_WINDOW = 30 * 24 * HOUR;
  const stateAt = (stamp, at) => {
    const age = at - stamp;
    if (!Number.isFinite(age) || stamp <= 0 || age < 0) return "sleeping";
    if (age < WORK_WINDOW) return "working";
    return age < CHILL_WINDOW ? "chilling" : age <= AWAY_WINDOW ? "sleeping" : "away";
  };
  const ageAt = (stamp, at) => {
    if (!Number.isFinite(stamp) || stamp <= 0) return "no activity";
    const minutes = Math.max(0, Math.floor((at - stamp) / MINUTE));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };
  const STAT_KINDS = [["commits", "commit", "commits"], ["prs", "PR", "PRs"], ["reviews", "review", "reviews"], ["issues", "issue", "issues"], ["comments", "comment", "comments"]];
  // The org's .github repository holds its profile and templates, not a project, so it gets no chip.
  const REPO_URL = "https://github.com/OogaBoogaX/", UNLISTED_REPOS = new Set([".github"]);
  const SINCE = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });
  const shortYear = (t) => SINCE.formatToParts(t).map((p) => p.type === "year" ? `’${p.value.slice(-2)}` : p.value).join("");
  const statCount = (n) => n >= 1e4 ? BL.formatLarge(n) : n.toLocaleString();
  const countIn = (board, login) => {
    if (Array.isArray(board)) for (const entry of board) if (entry.login.toLowerCase() === login) return entry.count;
    return 0;
  };
  const countFor = (boards, login) => {
    let n = 0;
    if (boards) for (const [kind] of STAT_KINDS) n += countIn(boards[kind], login);
    return n;
  };

  // ---- the markup ----------------------------------------------------------------------------------------------
  const build = (section, { ids = false } = {}) => {
    const doc = section.ownerDocument;
    if (section.querySelector("[data-roster]")) return section;
    const make = (tag, className, ...children) => {
      const el = doc.createElement(tag);
      if (className) el.className = className;
      for (const child of children) el.append(child);
      return el;
    };
    const title = make("span", "", "Contributing Oogas");
    title.dataset.sign = "";
    const count = make("span", "panel-chip");
    count.dataset.tone = "idle";
    count.dataset.roster = "count";
    const select = make("select", "");
    for (const [value, text] of [["recent", "Most recent contributions"], ["most", "Most contributions"]]) {
      const option = make("option", "", text);
      option.value = value;
      select.append(option);
    }
    select.dataset.roster = "sort";
    const label = make("label", "roster-sort-label", "Sorted by");
    const list = make("ul", "roster slab");
    list.setAttribute("aria-label", "Contributing Oogas");
    list.dataset.roster = "list";
    if (ids) {
      count.id = "roster-count"; select.id = "roster-sort"; list.id = "roster";
      label.htmlFor = "roster-sort";
    } else select.setAttribute("aria-label", "Sorted by");
    section.prepend(make("header", "panel-title", make("h2", "", title), count), make("div", "roster-sort", label, select), list);
    return section;
  };

  // ---- the controller ----------------------------------------------------------------------------------------
  // A section's rows, its Show away row, its faces and its strips' fitting, kept with the section for the page life.
  const kept = new WeakMap();
  const create = (section, { roster, stateFor, ageLabel, stamp: stampOf, login: loginOf, joinedAt, stats, face, online, voice, sortKey = "ooga-roster-sort" }) => {
    const doc = section.ownerDocument;
    const list = section.querySelector('[data-roster="list"]'), count = section.querySelector('[data-roster="count"]'), select = section.querySelector('[data-roster="sort"]');
    let own = kept.get(section);
    if (!own) {
      const li = doc.createElement("li"), button = doc.createElement("button");
      li.className = "roster-away"; button.type = "button"; li.append(button);
      own = { nodes: new Map(), away: { li, button }, faces: new Map(), sinceFits: new Map(), sinceResize: null, sinceShort: false, sort: "recent", rows: null,
        tally: { data: null, totals: new Map() } };
      try { if (localStorage.getItem(sortKey) === "most") own.sort = "most"; } catch { /* Storage may be unavailable. */ }
      kept.set(section, own);
    }
    const listeners = new AbortController(), { signal } = listeners;
    const on = (target, type, fn) => target.addEventListener(type, fn, { signal });
    const rosterRank = (state) => own.sort === "recent" || state === "away" ? ROSTER_ORDER[state] : 0;
    // Every login's contributions across the five kinds in the newest reading, worked out once a reading.
    const totals = () => {
      const data = stats(), tally = own.tally;
      if (tally.data === data) return tally.totals;
      tally.data = data;
      tally.totals.clear();
      const boards = data && data.leaderboards;
      if (boards) for (const [kind] of STAT_KINDS) {
        if (!Array.isArray(boards[kind])) continue;
        for (const entry of boards[kind]) {
          const login = entry.login.toLowerCase();
          tally.totals.set(login, (tally.totals.get(login) || 0) + entry.count);
        }
      }
      return tally.totals;
    };
    const contributionsOf = (contributor) => totals().get(loginOf(contributor)) || 0;
    const rosterKey = (contributor) => own.sort === "most" ? contributionsOf(contributor) : stampOf(contributor);
    const rosterRows = new Map();
    let showAway = false, awayCount = 0, awayShownCount = -1, awayShownShow = null;
    const awayRow = own.away.li, awayButton = own.away.button, rosterNodes = own.nodes;
    awayButton.setAttribute("aria-expanded", "false");
    awayRow.remove();
    const names = new Set(roster.map(contributor => contributor.name));
    for (const [name, row] of rosterNodes) if (!names.has(name)) { row.li.remove(); rosterNodes.delete(name); }
    // countAway rescans on every roster state flip and online toggle; skip the writes until they change.
    count.textContent = `${roster.length} Oogas`;
    const updateAwayButton = () => {
      if (awayCount === awayShownCount && showAway === awayShownShow) return;
      awayShownCount = awayCount;
      awayShownShow = showAway;
      awayRow.hidden = awayCount === 0;
      awayButton.textContent = `${showAway ? "Hide" : "Show"} away (${awayCount})`;
    };
    const orderedRoster = [...roster].sort((a, b) =>
      rosterRank(stateFor(a)) - rosterRank(stateFor(b)) || rosterKey(b) - rosterKey(a) || stampOf(b) - stampOf(a));
    for (let rosterIndex = 0; rosterIndex < orderedRoster.length; rosterIndex++) {
      const contributor = orderedRoster[rosterIndex];
      let nodes = rosterNodes.get(contributor.name);
      if (!nodes) {
        const li = doc.createElement("li"), dots = doc.createElement("span"), presence = doc.createElement("span"), name = doc.createElement("button");
        li.dataset.name = contributor.name;
        // The online dot, with the host's outlined dot centred behind it.
        dots.className = "roster-dots";
        presence.className = "roster-presence"; presence.setAttribute("role", "img");
        const label = doc.createElement("span"), host = doc.createElement("span");
        host.className = "roster-host";
        host.setAttribute("role", "img"); host.setAttribute("aria-label", "Host: runs the Oogas for everyone");
        host.title = "Host: runs the Oogas for everyone";
        dots.append(presence, host);
        // The name, on one line and cut short with an ellipsis, opens the row onto the contributor's stats.
        name.className = "roster-name"; name.type = "button"; label.className = "roster-label";
        name.append(label);
        const marks = doc.createElement("span"), mark = doc.createElement("button");
        marks.className = "roster-marks";
        mark.className = "roster-voice"; mark.type = "button"; mark.append(BL.nativeIcons.voice());
        marks.append(mark);
        const age = doc.createElement("span"), state = doc.createElement("span");
        age.className = "roster-age"; age.append(""); state.className = "roster-state"; state.append("");
        li.append(dots, name, marks, age, state);
        nodes = { li, presence, name, label, host, voice: mark, age, state, stats: null };
        rosterNodes.set(contributor.name, nodes);
      }
      const { li, presence, name, label, host, voice: mark, age, state } = nodes;
      if (label.textContent !== contributor.display) { label.textContent = contributor.display; label.title = contributor.display; }
      presence.dataset.online = "false"; presence.setAttribute("aria-label", "Offline"); presence.title = "Offline";
      host.hidden = mark.hidden = true; mark.disabled = false;
      if (nodes.stats) nodes.stats.box.hidden = true;
      name.setAttribute("aria-expanded", "false");
      mark.dataset.voice = mark.dataset.login = ""; mark.dataset.self = "false";
      const activity = stateFor(contributor), ageText = ageLabel(contributor);
      if (age.firstChild.data !== ageText) age.firstChild.data = ageText;
      state.dataset.state = activity;
      if (state.firstChild.data !== STATE_LABELS[activity]) state.firstChild.data = STATE_LABELS[activity];
      li.hidden = activity === "away";
      if (activity === "away") { if (!awayRow.parentElement) list.append(awayRow); awayCount++; }
      list.append(li);
      rosterRows.set(contributor.name, { li, presence, state, age, contributor, rosterIndex, online: false, sceneOnline: false, remoteOnline: false, netOnline: false, nextOnline: false, placedStamp: stampOf(contributor), host, voice: mark, look: "", login: "", hostOn: false, blocked: false, self: false, nextLook: "", nextLogin: "", nextHost: false, nextSelf: false, name, nodes, open: false });
    }
    own.rows = rosterRows;
    if (!awayRow.parentElement) list.append(awayRow);
    updateAwayButton();

    // ---- the stats strip ----
    // The total and the first contribution stand side by side next to the face: the day with its whole year while they
    // fit, "’26" once a narrow panel would wrap them, and only past that do they wrap. One answer for the whole roster,
    // measured with its longest total beside its longest date, so no two strips differ and opening another never changes
    // one. Fitted again when a total or the strip's width changes; a hidden strip (width 0) takes the last answer.
    const fitSince = () => {
      let probe = null;
      for (const fit of own.sinceFits.values()) if (fit.fitWidth) { probe = fit; break; }
      if (probe) {
        let total = "", since = "";
        for (const row of rosterRows.values()) {
          const joined = joinedAt(row.contributor);
          const n = statCount(totals().get(loginOf(row.contributor)) || 0), day = joined > 0 ? SINCE.format(joined) : "";
          if (n.length > total.length) total = n;
          if (day.length > since.length) since = day;
        }
        const shown = probe.total.textContent;
        probe.facts.dataset.fit = "line";
        probe.total.textContent = total; probe.since.textContent = since;
        own.sinceShort = probe.facts.scrollWidth > probe.facts.clientWidth;
        probe.total.textContent = shown;
      }
      for (const fit of own.sinceFits.values()) {
        fit.since.textContent = own.sinceShort ? fit.short : fit.long;
        if (!fit.fitWidth) continue;
        fit.facts.dataset.fit = "line";
        if (fit.facts.scrollWidth > fit.facts.clientWidth) fit.facts.dataset.fit = "wrap";
      }
    };
    const buildStats = (row) => {
      const box = doc.createElement("div"), faceCanvas = doc.createElement("canvas"), facts = doc.createElement("dl");
      const total = doc.createElement("dd"), since = doc.createElement("dd"), kinds = doc.createElement("p"), repos = doc.createElement("div");
      box.className = "roster-stats"; box.id = `roster-stats-${row.rosterIndex}-${row.contributor.name}`;
      faceCanvas.className = "roster-stats-face"; faceCanvas.setAttribute("role", "img"); faceCanvas.setAttribute("aria-label", `${row.contributor.display}'s Ooga`);
      facts.className = "roster-stats-facts";
      for (const [term, value] of [["Contributions", total], ["Since", since]]) {
        const pair = doc.createElement("div"), dt = doc.createElement("dt");
        dt.textContent = term;
        pair.append(dt, value);
        facts.append(pair);
      }
      kinds.className = "roster-stats-kinds";
      // Links in a group, not list items: the roster's own rows are its <li>s.
      repos.className = "roster-stats-repos"; repos.setAttribute("role", "group"); repos.setAttribute("aria-label", "Repositories");
      box.append(faceCanvas, facts, kinds, repos);
      const strip = row.nodes.stats = { box, face: faceCanvas, facts, total, since, kinds, repos, long: "", short: "", fitWidth: 0 };
      row.li.append(box);
      own.sinceFits.set(facts, strip);
      if (!own.sinceResize) own.sinceResize = new ResizeObserver((entries) => {
        let moved = false;
        for (const entry of entries) {
          const fit = own.sinceFits.get(entry.target), width = Math.round(entry.contentRect.width);
          if (width === fit.fitWidth) continue;
          fit.fitWidth = width;
          moved = true;
        }
        if (moved) fitSince();
      });
      own.sinceResize.observe(facts);
      row.name.setAttribute("aria-controls", box.id);
    };
    // The face is drawn once a page a contributor, when there is one to draw (the app's face sheet may still be coming:
    // a face drawn later fills every open strip again through `faceChanged`).
    const paintFace = (row) => {
      const strip = row.nodes.stats, contributor = row.contributor;
      if (!own.faces.has(contributor.name)) {
        const art = face(contributor);
        if (art) own.faces.set(contributor.name, art);
      }
      const art = own.faces.get(contributor.name);
      if (!art) return;
      const ctx = strip.face.getContext("2d");
      strip.face.width = strip.face.height = art.width;
      ctx.drawImage(art, 0, 0);
    };
    const fillStats = (row) => {
      const strip = row.nodes.stats, contributor = row.contributor, login = loginOf(contributor);
      paintFace(row);
      const joined = joinedAt(contributor);
      strip.long = joined > 0 ? SINCE.format(joined) : "—";
      strip.short = joined > 0 ? shortYear(joined) : "—";
      const data = stats();
      const kinds = [];
      let sum = 0;
      for (const [kind, one, many] of STAT_KINDS) {
        const n = countIn(data && data.leaderboards && data.leaderboards[kind], login);
        sum += n;
        if (n) kinds.push(`${statCount(n)} ${n === 1 ? one : many}`);
      }
      strip.total.textContent = statCount(sum);
      fitSince();
      // Each count stays on one line with its label (and the dot after it), so the line wraps only between them.
      strip.kinds.replaceChildren();
      kinds.forEach((text, i) => {
        const item = doc.createElement("span");
        item.textContent = i < kinds.length - 1 ? `${text} ·` : text;
        strip.kinds.append(item, i < kinds.length - 1 ? " " : "");
      });
      strip.kinds.hidden = !kinds.length;
      const repoList = [];
      for (const repo of data && Array.isArray(data.repos) ? data.repos : []) {
        if (UNLISTED_REPOS.has(repo.name)) continue;
        const listed = Array.isArray(repo.contributors) && repo.contributors.some((c) => c.login.toLowerCase() === login);
        const n = countFor(repo.leaderboards, login);
        if (listed || n) repoList.push({ name: repo.name, n });
      }
      repoList.sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : 1));
      strip.repos.replaceChildren();
      for (const { name, n } of repoList) {
        const a = doc.createElement("a"), b = doc.createElement("b");
        a.href = REPO_URL + name; a.target = "_blank"; a.rel = "noopener";
        a.title = `${name}: ${n.toLocaleString()} contribution${n === 1 ? "" : "s"}`;
        b.textContent = statCount(n);
        a.append(name, b);
        strip.repos.append(a);
      }
      if (!repoList.length) {
        const none = doc.createElement("span");
        none.className = "roster-stats-none"; none.textContent = "No repositories in the latest reading";
        strip.repos.append(none);
      }
    };
    const openStats = (row, open) => {
      row.open = open;
      if (open && !row.nodes.stats) buildStats(row);
      if (open) fillStats(row);
      if (row.nodes.stats) row.nodes.stats.box.hidden = !open;
      row.name.setAttribute("aria-expanded", String(open));
    };

    on(list, "click", (e) => {
      const who = e.target.closest(".roster-name");
      if (who) {
        who.blur();
        const row = rosterRows.get(who.parentElement.dataset.name);
        if (row) openStats(row, !row.open);
        return;
      }
      const button = e.target.closest(".roster-voice");
      if (!button || button.disabled) return;
      button.blur();
      voice(button);
    });
    on(awayButton, "click", () => {
      showAway = !showAway;
      awayButton.setAttribute("aria-expanded", String(showAway));
      for (const row of rosterRows.values()) if (row.state.dataset.state === "away") row.li.hidden = !showAway && !row.online;
      updateAwayButton();
    });
    // The Sorted by choice orders the roster; online presence never changes a row's rank.
    const rankOf = (row) => rosterRank(row.state.dataset.state);
    const countAway = () => {
      awayCount = 0;
      for (const row of rosterRows.values()) if (!row.online && row.state.dataset.state === "away") awayCount++;
      updateAwayButton();
    };
    const placeRosterRow = (row) => {
      const rank = rankOf(row), stamp = rosterKey(row.contributor);
      let before = rank === ROSTER_ORDER.away ? null : awayRow;
      for (const sibling of list.children) {
        if (sibling === row.li || sibling === awayRow) continue;
        const other = rosterRows.get(sibling.dataset.name);
        const otherRank = rankOf(other), otherStamp = rosterKey(other.contributor);
        if (otherRank > rank) { before = otherRank === ROSTER_ORDER.away ? awayRow : sibling; break; }
        if (otherRank === rank && (otherStamp < stamp || otherStamp === stamp && other.rosterIndex > row.rosterIndex)) { before = sibling; break; }
      }
      if (before) {
        if (row.li.nextElementSibling !== before) list.insertBefore(row.li, before);
      } else if (list.lastElementChild !== row.li) list.append(row.li);
    };
    // Every row in the chosen order, the away rows behind their button, moving only what is out of place.
    const sortRoster = () => {
      const rows = [...rosterRows.values()].sort((a, b) => rankOf(a) - rankOf(b) || rosterKey(b.contributor) - rosterKey(a.contributor) || stampOf(b.contributor) - stampOf(a.contributor));
      let at = list.firstElementChild, awayPlaced = false;
      const place = (li) => { if (li === at) at = at.nextElementSibling; else list.insertBefore(li, at); };
      rows.forEach((row, index) => {
        row.rosterIndex = index;
        if (!awayPlaced && rankOf(row) === ROSTER_ORDER.away) { place(awayRow); awayPlaced = true; }
        place(row.li);
      });
      if (!awayPlaced) place(awayRow);
    };
    select.value = own.sort;
    on(select, "change", () => {
      own.sort = select.value === "most" ? "most" : "recent";
      try { localStorage.setItem(sortKey, own.sort); } catch { /* Storage may be unavailable. */ }
      select.blur();
      sortRoster();
    });
    // A change of presence repaints the dot without moving the row.
    const showOnline = (row) => {
      // `online(row)` is false, true, or "cloud" for an Ooga Chat speaker, whose dot is Ooga Chat's purple.
      const lit = online(row);
      if (row.online === lit) return;
      row.online = lit;
      row.presence.dataset.online = lit === "cloud" ? "cloud" : lit ? "true" : "false";
      row.presence.title = lit === "cloud" ? "Speaking from Ooga Chat" : lit ? "Online" : "Offline";
      row.presence.setAttribute("aria-label", row.presence.title);
      row.li.hidden = row.state.dataset.state === "away" && !showAway && !lit;
      countAway();
    };
    // A row's contribution state and age now, and its presence as the page reports it (`online` and `remoteOnline`, kept
    // on the row for `online(row)`); it moves only when its state or its latest contribution changed.
    const setRow = (name, _stateKey, _ageText, sceneOnline = false, remoteOnline = false) => {
      const row = rosterRows.get(name);
      if (!row) return;
      // Gameplay can put an Ooga to work or sleep; this board follows the contributor's latest recorded activity instead.
      const activity = stateFor(row.contributor);
      const ageText = ageLabel(row.contributor);
      let moved = false;
      if (row.state.dataset.state !== activity) {
        row.state.dataset.state = activity;
        row.state.firstChild.data = STATE_LABELS[activity] || activity;
        row.li.hidden = activity === "away" && !showAway && !row.online;
        countAway();
        moved = true;
      }
      if (row.age.firstChild.data !== ageText) row.age.firstChild.data = ageText;
      row.sceneOnline = sceneOnline;
      row.remoteOnline = remoteOnline;
      showOnline(row);
      const stamp = stampOf(row.contributor);
      if (row.placedStamp !== stamp) {
        row.placedStamp = stamp;
        moved = true;
      }
      if (moved) placeRosterRow(row);
    };
    // A fresh oogatron reading refills every open strip and, sorted by most, the order.
    const statsChanged = () => {
      for (const row of rosterRows.values()) if (row.open) fillStats(row);
      fitSince();
      if (own.sort === "most") sortRoster();
    };
    // Faces that arrived after a strip opened.
    const faceChanged = () => {
      for (const row of rosterRows.values()) if (row.open) paintFace(row);
    };
    const dispose = () => listeners.abort();
    return { rows: rosterRows, setRow, showOnline, statsChanged, faceChanged, contributionsOf, dispose };
  };
  BL.rosterPanel = { build, create, stateAt, ageAt, STATE_LABELS, ROSTER_ORDER, STAT_KINDS };
})();
