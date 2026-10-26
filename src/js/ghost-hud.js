// HALLOWEEN: the ghost hunt's HUD (`#ghost-hud`, `#ghost-flash` in index.html): the banners the lab showed ("Round 3",
// "THE BOSS is here", ...), the boss's health and the flash when a ghost gets you (the visitor's own health is drawn
// over their Ooga, ghost-game.js `drawHealth`). The markup carries no data-scene (the director would show it on every arrival); this module alone shows
// and hides it. Every setter writes the DOM only when its value changed, so calling them each frame costs nothing.
// The banners are set in Creepster (ghost-font-data.js), the lab's face, added once from its bytes: a FontFace made from
// a buffer fetches nothing, so the content policy needs no font source. Until it is ready they show in the fallback.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  let face = null;
  const loadFace = () => {
    if (face || typeof FontFace === "undefined" || !BL.ghostFontData) return;
    const raw = atob(BL.ghostFontData), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    face = new FontFace("Creepster", bytes.buffer);
    face.load().then(() => document.fonts.add(face), () => {});
  };

  // How to play, on the lobby: each line its keys and what they do, for a keyboard and mouse, for touch or for a pad.
  const INTRO = {
    keys: [[["W", "A", "S", "D"], "Move your Ooga"], [["Mouse"], "Aim, and click to fire"], [["G"], "Switch weapons"]],
    touch: [[["Left stick"], "Move your Ooga"], [["Ready"], "Start in combat mode"], [["Hold fire"], "Shoot the ghosts"]],
    pad: [[["Left stick"], "Move your Ooga"], [["Right stick", "RT"], "Aim, and pull to fire"], [["Y"], "Switch weapons"], [["A"], "Ready"]]
  };
  const pad = BL.gamepad.state;
  /**
   * The HUD; `coarse` for touch words, `onMusic` when the visitor flips the mini player's switch, `onSkip` when they
   * skip to the next track, `onReady` and `onDecline` from the lobby, `onLobby` when its menu opens or closes,
   * `onSpectate(mode)` and `onSpectateNext` from the spectator menu while the visitor is down.
   */
  const create = ({ coarse = false, onMusic = null, onSkip = null, onReady = null, onDecline = null, onLobby = null, onSpectate = null, onSpectateNext = null } = {}) => {
    loadFace();
    const el = {
      hud: document.getElementById("ghost-hud"),
      banner: document.getElementById("ghost-banner"), title: document.getElementById("ghost-banner-title"), sub: document.getElementById("ghost-banner-sub"),
      boss: document.getElementById("ghost-boss"), bar: document.getElementById("ghost-boss-bar"), flash: document.getElementById("ghost-flash"),
      player: document.getElementById("ghost-player"), playerTitle: document.getElementById("ghost-player-title"), playerToggle: document.getElementById("ghost-player-toggle"),
      playerSkip: document.getElementById("ghost-player-skip"), minimap: document.getElementById("ghost-minimap"),
      topbar: document.querySelector(".topbar"), equipment: document.getElementById("equipment-hud"),
      lobby: document.getElementById("ghost-lobby"), lobbyGoal: document.getElementById("ghost-lobby-goal"), lobbyPlayers: document.getElementById("ghost-lobby-players"),
      lobbyNote: document.getElementById("ghost-lobby-note"), lobbyHow: document.getElementById("ghost-lobby-how"), lobbyReady: document.getElementById("ghost-lobby-ready"), lobbyDecline: document.getElementById("ghost-lobby-decline"),
      spec: document.getElementById("ghost-spectate"), specModes: document.querySelectorAll("#ghost-spectate [data-spec]"),
      specWatch: document.getElementById("ghost-spectate-watch"), specName: document.getElementById("ghost-spectate-name"), specNext: document.getElementById("ghost-spectate-next"),
      scores: document.getElementById("ghost-scores"), results: document.getElementById("ghost-results"), halving: document.getElementById("ghost-halving"),
      resultsGoal: document.getElementById("ghost-results-goal"), resultsPlayers: document.getElementById("ghost-results-players"),
      steps: [1, 2, 3].map((place) => document.querySelector(`#ghost-podium [data-place="${place}"]`)),
      intro: document.getElementById("ghost-intro"), introKicker: document.getElementById("ghost-intro-kicker"), introName: document.getElementById("ghost-intro-name"),
      introText: document.getElementById("ghost-intro-text"), introArt: document.querySelectorAll("#ghost-intro .ghost-intro-art canvas:not(.ghost-intro-solo)"),
      introSolo: document.querySelectorAll("#ghost-intro .ghost-intro-solo")
    };
    // The spectator menu's buttons, let go of after a press so the turn keys keep working.
    const pickSpec = (e) => { if (onSpectate) onSpectate(e.currentTarget.dataset.spec); e.currentTarget.blur(); };
    const nextSpec = () => { if (onSpectateNext) onSpectateNext(); el.specNext.blur(); };
    for (const b of el.specModes) b.addEventListener("click", pickSpec);
    el.specNext.addEventListener("click", nextSpec);
    // The lobby's buttons, and its own keys (inside a dialog the island leaves keys alone): Enter or R readies, Escape
    // declines.
    el.lobby.tabIndex = -1;
    const readyUp = () => { if (onReady) onReady(); if (!el.lobby.hidden) el.lobby.focus({ preventScroll: true }); else el.lobbyReady.blur(); };
    const decline = () => { if (onDecline) onDecline(); el.lobbyDecline.blur(); };
    const lobbyKey = (e) => {
      if (e.repeat) return;
      if (e.key === "Enter" || e.key === "r" || e.key === "R") { e.preventDefault(); readyUp(); }
      else if (e.key === "Escape") { e.preventDefault(); decline(); }
    };
    el.lobbyReady.addEventListener("click", readyUp);
    el.lobbyDecline.addEventListener("click", decline);
    el.lobby.addEventListener("keydown", lobbyKey);
    // The lobby's player rows, made as needed and kept; its controls, written again only when the visitor's change:
    // a pad's once one is connected, else touch or the keyboard's.
    const lobbyRows = [];
    let howShown = null;
    const writeHow = () => {
      const how = pad.connected ? INTRO.pad : coarse ? INTRO.touch : INTRO.keys;
      if (how === howShown) return;
      howShown = how;
      el.lobbyHow.replaceChildren(...how.map(([keys, what]) => {
        const li = document.createElement("li");
        for (const k of keys) { const kbd = document.createElement("kbd"); kbd.textContent = k; li.append(kbd); }
        li.append(` ${what}`);
        return li;
      }));
    };
    // The switch, let go of after a press so the island's keys keep working.
    const flip = () => { if (onMusic) onMusic(); el.playerToggle.blur(); };
    el.playerToggle.addEventListener("click", flip);
    const skip = () => { if (onSkip) onSkip(); el.playerSkip.blur(); };
    el.playerSkip.addEventListener("click", skip);
    const last = { shown: false, title: null, sub: null, win: false, high: false, intro: null, introPicture: null, boss: -1, player: null, playing: null, on: null, skips: null, spec: null, specName: null };
    const text = (node, key, value) => {
      if (last[key] === value) return;
      last[key] = value;
      node.textContent = value;
    };
    // The minimap follows the actual banner and touch fire button, including a wrapped equipment row. Layout is
    // measured on show and layout changes only, never by the hunt's frame loop; `map.font` is its canvas lettering.
    const map = { canvas: el.minimap, font: "" };
    let mapFrame = 0;
    const layoutMap = () => {
      mapFrame = 0;
      if (el.minimap.hidden) return;
      if (coarse) {
        const top = `${Math.ceil(Math.max(el.topbar.getBoundingClientRect().bottom, el.equipment.getBoundingClientRect().bottom) + 12)}px`;
        if (el.minimap.style.getPropertyValue("--ghost-map-top") !== top) el.minimap.style.setProperty("--ghost-map-top", top);
      }
      const k = Math.min(2, window.devicePixelRatio || 1), w = Math.round(el.minimap.clientWidth * k);
      if (w > 0 && (el.minimap.width !== w || el.minimap.height !== w)) el.minimap.width = el.minimap.height = w;
      map.font = `700 ${Math.round(10 * k)}px sans-serif`;
    };
    const scheduleMap = () => { if (!el.minimap.hidden && !mapFrame) mapFrame = window.requestAnimationFrame(layoutMap); };
    const mapResize = new ResizeObserver(scheduleMap), mapEquipment = new MutationObserver(scheduleMap);
    mapResize.observe(el.topbar);
    mapResize.observe(el.equipment);
    mapEquipment.observe(el.equipment, { attributes: true, attributeFilter: ["style", "data-banner"] });
    window.addEventListener("resize", scheduleMap);
    const show = (on) => {
      if (last.shown === on) return;
      last.shown = on;
      el.hud.hidden = el.minimap.hidden = !on;
      window.cancelAnimationFrame(mapFrame);
      mapFrame = 0;
      if (on) layoutMap();
      if (!on) { banner(null); boss(-1); player(null); spectate(null); scores(null); results(null); halving(false); intro(null); el.flash.hidden = true; }
    };
    // A round's new-enemy card: `card` (`kicker`, `name`, `text`, `layout`) with `picture` (an image or canvas, null until
    // it is ready) on it, or null to hide it: "trio" three of it hovering, "float" one large hovering, "clip" one large
    // and still (the caller hands a new picture for each frame of its motion). Its words and pictures are written only
    // when they change.
    const intro = (card, picture = null) => {
      if (!card) {
        if (last.intro) { last.intro = last.introPicture = null; el.intro.hidden = true; }
        return;
      }
      if (card !== last.intro) {
        el.introKicker.textContent = card.kicker;
        el.introName.setAttribute("aria-label", card.name);
        el.introName.replaceChildren(BL.hud.signLettering(card.name));
        el.introText.textContent = card.text;
        el.intro.dataset.art = card.layout;
        el.intro.dataset.enemy = card.art;
      }
      if (picture !== last.introPicture || card !== last.intro) {
        for (const canvas of card.layout === "trio" ? el.introArt : el.introSolo) {
          const g = canvas.getContext("2d");
          g.clearRect(0, 0, canvas.width, canvas.height);
          if (!picture) continue;
          // A lone hovering ghost keeps room over it to rise into, standing on the card's foot.
          const fill = card.layout === "float" ? 0.8 : 1, w = picture.naturalWidth || picture.width, h = picture.naturalHeight || picture.height;
          const k = Math.min(canvas.width / w, canvas.height / h) * fill;
          g.drawImage(picture, (canvas.width - w * k) / 2, fill < 1 ? canvas.height - h * k : (canvas.height - h * k) / 2, w * k, h * k);
        }
      }
      if (!last.intro) el.intro.hidden = false;
      last.intro = card; last.introPicture = picture;
    };
    // The halving notice, shown while an hourglass stands (`on`).
    const halving = (on) => { if (el.halving.hidden === on) el.halving.hidden = !on; };
    // The hunters' scoreboard: `rows` (`cave` the Ooga whose face shows, `name`, `points`, `lead` for the point leader)
    // of which `count` show; null hides it. The caller passes rows only when something on it changed. Each place's face
    // is painted again only when the Ooga in it changes.
    const scoreRows = [];
    const scores = (rows, count = 0) => {
      if (rows === null) { el.scores.hidden = true; return; }
      el.scores.hidden = false;
      while (scoreRows.length < count) {
        const li = document.createElement("li"), canvas = document.createElement("canvas"), points = document.createElement("b");
        li.className = "ghost-score";
        canvas.setAttribute("aria-hidden", "true");
        li.append(canvas, points);
        scoreRows.push({ li, canvas, points, cave: null });
      }
      for (let i = 0; i < scoreRows.length; i++) {
        const r = scoreRows[i];
        if (i >= count) { if (r.li.parentNode) r.li.remove(); continue; }
        const row = rows[i];
        if (!r.li.parentNode) el.scores.append(r.li);
        if (r.cave !== row.cave) {
          r.cave = row.cave;
          if (row.cave) BL.hud.renderFaceIcon(r.canvas, row.cave, null, 68);
          else r.canvas.getContext("2d").clearRect(0, 0, r.canvas.width, r.canvas.height);
        }
        r.points.textContent = String(row.points);
        r.li.title = row.name;
        r.li.toggleAttribute("data-lead", !!row.lead);
      }
    };
    // A won hunt's results card: `goal` its line, the podium's three steps from `top` (`cave`, `name`, `points`, first
    // to third; a step past `rows`' count stands empty), and every hunter's tally from `rows` (`name`, `foes` the
    // enemies they killed, `points`), best first, of which `count` show; null takes it down. Each on the podium stands
    // whole, square to the view (BL.hud.renderBodyIcon).
    const resultRows = [];
    const results = (goal, top = null, rows = null, count = 0) => {
      if (goal === null) { el.results.hidden = true; return; }
      el.resultsGoal.textContent = goal;
      for (let i = 0; i < el.steps.length; i++) {
        const step = el.steps[i], here = i < count, canvas = step.querySelector("canvas");
        step.toggleAttribute("data-empty", !here);
        if (here && top[i].cave) BL.hud.renderBodyIcon(canvas, top[i].cave, 240, 320);
        else canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
        step.querySelector("b").textContent = here ? top[i].name : "";
        step.querySelector("small").textContent = here ? `${top[i].points} points` : "";
      }
      while (resultRows.length < count) {
        const li = document.createElement("li"), place = document.createElement("span"), name = document.createElement("b"), tally = document.createElement("small");
        place.className = "ghost-results-place"; place.setAttribute("aria-hidden", "true");
        li.append(place, name, tally);
        resultRows.push({ li, place, name, tally });
      }
      for (let i = 0; i < resultRows.length; i++) {
        const r = resultRows[i];
        if (i >= count) { if (r.li.parentNode) r.li.remove(); continue; }
        if (!r.li.parentNode) el.resultsPlayers.append(r.li);
        r.place.textContent = String(i + 1);
        r.name.textContent = rows[i].name;
        r.tally.textContent = `${rows[i].foes} enemies · ${rows[i].points} points`;
      }
      el.results.hidden = false;
    };
    // The spectator menu, bottom centre while the visitor is down: `mode` the view they watch from ("grave", "free" or
    // "players"; null hides it) and, watching players, `name` the one watched.
    const spectate = (mode, name = "") => {
      if (mode === last.spec && name === last.specName) return;
      if (mode !== last.spec) {
        if (mode === null || last.spec === null) el.spec.hidden = mode === null;
        for (const b of el.specModes) b.setAttribute("aria-pressed", b.dataset.spec === mode ? "true" : "false");
        el.specWatch.hidden = mode !== "players";
        last.spec = mode;
      }
      if (name !== last.specName) { last.specName = name; el.specName.textContent = name; }
    };
    // The banner: `title` (null hides it) over `sub`, green instead of red for a `win`, smaller and higher when `high`
    // (over a card).
    const banner = (title, sub = "", win = false, high = false) => {
      if (title === null) {
        if (last.title !== null) { last.title = null; el.banner.hidden = true; }
        return;
      }
      if (last.title === null) el.banner.hidden = false;
      if (win !== last.win) { last.win = win; el.banner.toggleAttribute("data-win", win); }
      if (high !== last.high) { last.high = high; el.banner.toggleAttribute("data-high", high); }
      text(el.title, "title", title);
      text(el.sub, "sub", sub);
    };
    // The mini player: shown while the hunt's music runs (`track` its title and maker, null to hide), its switch `on`,
    // and its skip while the music is on and the list has more than one track (`skips`).
    const player = (track, on, skips = false) => {
      const shown = !!track;
      if (shown !== last.player) { last.player = shown; el.player.hidden = !shown; }
      if (!shown) return;
      const name = on ? `${track.title} · ${track.by}` : "Music off";
      if (name !== last.playing) { last.playing = name; el.playerTitle.textContent = name; }
      if (on !== last.on) {
        last.on = on;
        el.playerToggle.textContent = on ? "Music on" : "Music off";
        el.playerToggle.setAttribute("aria-pressed", on ? "true" : "false");
        el.player.toggleAttribute("data-off", !on);
      }
      const canSkip = skips && on;
      if (canSkip !== last.skips) { last.skips = canSkip; el.playerSkip.hidden = !canSkip; }
    };
    // The lobby: `goal` its line (the seconds left), `rows` the players there (`name`, `ready`, `host`) of which `count` are
    // shown, `meReady` whether this page's player is in, `signIn` the note for a visitor not signed in; null to hide.
    // The caller passes a fresh `key` only when something changed.
    let lobbyKey_ = null;
    const hideLobby = (restore = true) => {
      if (lobbyKey_ === null) return;
      lobbyKey_ = null;
      el.lobby.hidden = true;
      if (el.lobby.contains(document.activeElement)) document.activeElement.blur();
      if (onLobby) onLobby(false, restore);
    };
    const lobby = (key, goal, rows, count, meReady, signIn) => {
      if (key === null) { hideLobby(); return; }
      const opening = lobbyKey_ === null;
      if (key === lobbyKey_) return;
      lobbyKey_ = key;
      writeHow();
      el.lobbyGoal.textContent = goal;
      while (lobbyRows.length < count) {
        const li = document.createElement("li"), mark = document.createElement("span"), name = document.createElement("b"), state = document.createElement("small");
        mark.className = "ghost-lobby-mark"; mark.setAttribute("aria-hidden", "true");
        li.append(mark, name, state);
        lobbyRows.push({ li, mark, name, state });
      }
      for (let i = 0; i < lobbyRows.length; i++) {
        const r = lobbyRows[i];
        if (i >= count) { if (r.li.parentNode) r.li.remove(); continue; }
        if (!r.li.parentNode) el.lobbyPlayers.append(r.li);
        r.name.textContent = rows[i].name;
        r.mark.textContent = rows[i].ready ? "✓" : "…";
        r.state.textContent = (rows[i].host ? "Host · " : "") + (rows[i].ready ? "Ready" : "Not ready yet");
        r.li.toggleAttribute("data-ready", !!rows[i].ready);
      }
      el.lobbyNote.hidden = !signIn;
      el.lobbyReady.textContent = meReady ? "You're in" : "Ready";
      el.lobbyReady.disabled = meReady;
      el.lobbyDecline.hidden = meReady;
      if (opening) {
        el.lobby.hidden = false;
        if (onLobby) onLobby(true);
        (meReady ? el.lobby : el.lobbyReady).focus({ preventScroll: true });
      }
    };
    // The boss's health, 0..1, or below 0 to hide the bar.
    const boss = (fraction) => {
      const v = fraction < 0 ? -1 : Math.round(fraction * 200) / 200;
      if (v === last.boss) return;
      if ((v < 0) !== (last.boss < 0)) el.boss.hidden = v < 0;
      last.boss = v;
      if (v >= 0) el.bar.value = v;
    };
    // A ghost got you ("hurt") or a wraith has your soul ("soul"); the CSS animation fades it.
    const flash = (kind) => {
      el.flash.hidden = false;
      el.flash.dataset.kind = kind;
      el.flash.classList.remove("on");
      void el.flash.offsetWidth;
      el.flash.classList.add("on");
    };
    const soul = (on) => {
      if (on) { if (el.flash.dataset.kind !== "soul" || el.flash.hidden) { el.flash.hidden = false; el.flash.dataset.kind = "soul"; el.flash.classList.remove("on"); } }
      else if (el.flash.dataset.kind === "soul" && !el.flash.hidden) el.flash.hidden = true;
    };
    const dispose = () => {
      mapResize.disconnect();
      mapEquipment.disconnect();
      window.removeEventListener("resize", scheduleMap);
      window.cancelAnimationFrame(mapFrame);
      el.minimap.style.removeProperty("--ghost-map-top");
      el.lobbyReady.removeEventListener("click", readyUp);
      el.lobbyDecline.removeEventListener("click", decline);
      el.lobby.removeEventListener("keydown", lobbyKey);
      for (const b of el.specModes) b.removeEventListener("click", pickSpec);
      el.specNext.removeEventListener("click", nextSpec);
      spectate(null);
      hideLobby(false);
      // The rows go with the visit: the next one's card makes its own, and these would stand beside them.
      for (const r of lobbyRows) r.li.remove();
      lobbyRows.length = 0;
      for (const r of scoreRows) r.li.remove();
      scoreRows.length = 0;
      for (const r of resultRows) r.li.remove();
      resultRows.length = 0;
      el.banner.removeAttribute("data-win");
      el.banner.removeAttribute("data-high");
      el.playerToggle.removeEventListener("click", flip);
      el.playerSkip.removeEventListener("click", skip);
      show(false);
      el.flash.classList.remove("on");
    };
    return { show, map, lobby, player, banner, boss, flash, soul, spectate, scores, results, halving, intro, dispose };
  };

  BL.ghostHud = { create };
})();
