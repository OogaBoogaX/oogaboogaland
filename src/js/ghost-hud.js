// HALLOWEEN: the ghost hunt's HUD (`#ghost-hud`, `#ghost-flash` in index.html): the round line, the visitor's own
// bar, the banners the lab showed ("Round 3", "THE BOSS is here", ...), the boss's health and the flash when a ghost
// gets you. The markup carries no data-scene (the director would show it on every arrival); this module alone shows
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

  // How to play, on the lobby: each line its keys and what they do, for a keyboard and mouse or for touch.
  const INTRO = {
    keys: [[["W", "A", "S", "D"], "Move your Ooga"], [["Mouse"], "Aim, and click to fire"], [["G"], "Switch weapons"]],
    touch: [[["Left stick"], "Move your Ooga"], [["Ready"], "Start in combat mode"], [["Hold fire"], "Shoot the ghosts"]]
  };
  /**
   * The HUD; `coarse` for touch words, `onMusic` when the visitor flips the mini player's switch, `onSkip` when they
   * skip to the next track, `onReady` and `onDecline` from the lobby, `onLobby` when its menu opens or closes.
   */
  const create = ({ coarse = false, onMusic = null, onSkip = null, onReady = null, onDecline = null, onLobby = null } = {}) => {
    loadFace();
    const el = {
      hud: document.getElementById("ghost-hud"), top: document.getElementById("ghost-top"), lives: document.getElementById("ghost-lives"), health: document.getElementById("ghost-health"),
      banner: document.getElementById("ghost-banner"), title: document.getElementById("ghost-banner-title"), sub: document.getElementById("ghost-banner-sub"),
      boss: document.getElementById("ghost-boss"), bar: document.getElementById("ghost-boss-bar"), flash: document.getElementById("ghost-flash"),
      player: document.getElementById("ghost-player"), playerTitle: document.getElementById("ghost-player-title"), playerToggle: document.getElementById("ghost-player-toggle"),
      playerSkip: document.getElementById("ghost-player-skip"),
      lobby: document.getElementById("ghost-lobby"), lobbyGoal: document.getElementById("ghost-lobby-goal"), lobbyPlayers: document.getElementById("ghost-lobby-players"),
      lobbyNote: document.getElementById("ghost-lobby-note"), lobbyHow: document.getElementById("ghost-lobby-how"), lobbyReady: document.getElementById("ghost-lobby-ready"), lobbyDecline: document.getElementById("ghost-lobby-decline")
    };
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
    // The lobby's player rows, made as needed and kept; its controls, written once.
    const lobbyRows = [];
    el.lobbyHow.replaceChildren(...(coarse ? INTRO.touch : INTRO.keys).map(([keys, what]) => {
      const li = document.createElement("li");
      for (const k of keys) { const kbd = document.createElement("kbd"); kbd.textContent = k; li.append(kbd); }
      li.append(` ${what}`);
      return li;
    }));
    // The switch, let go of after a press so the island's keys keep working.
    const flip = () => { if (onMusic) onMusic(); el.playerToggle.blur(); };
    el.playerToggle.addEventListener("click", flip);
    const skip = () => { if (onSkip) onSkip(); el.playerSkip.blur(); };
    el.playerSkip.addEventListener("click", skip);
    const last = { shown: false, top: null, lives: null, title: null, sub: null, boss: -1, livesState: "", health: -2, player: null, playing: null, on: null, skips: null };
    const cells = el.health.children;
    const text = (node, key, value) => {
      if (last[key] === value) return;
      last[key] = value;
      node.textContent = value;
    };
    const show = (on) => {
      if (last.shown === on) return;
      last.shown = on;
      el.hud.hidden = !on;
      if (!on) { banner(null); boss(-1); health(-1); player(null); el.flash.hidden = true; }
    };
    const top = (value) => text(el.top, "top", value);
    // `state` styles the bar: "", "frozen" or "away".
    const lives = (value, state = "") => {
      text(el.lives, "lives", value);
      if (last.livesState !== state) { last.livesState = state; el.lives.dataset.state = state; }
    };
    const banner = (title, sub = "") => {
      if (title === null) {
        if (last.title !== null) { last.title = null; el.banner.hidden = true; }
        return;
      }
      if (last.title === null) el.banner.hidden = false;
      text(el.title, "title", title);
      text(el.sub, "sub", sub);
    };
    // The visitor's health, `filled` cells of the bar lit, or below 0 to hide it; two or fewer lit go red.
    const health = (filled) => {
      if (filled === last.health) return;
      if ((filled < 0) !== (last.health < 0)) el.health.hidden = filled < 0;
      last.health = filled;
      if (filled < 0) return;
      for (let i = 0; i < cells.length; i++) cells[i].toggleAttribute("data-on", i < filled);
      el.health.toggleAttribute("data-low", filled <= 2);
      el.health.setAttribute("aria-valuenow", String(filled));
    };
    // A round's start: the bar glows orange and its cells fill back one after another (the stagger only while it glows,
    // so a hit after it empties a cell at once).
    const healed = () => el.health.classList.remove("healing");
    el.health.addEventListener("animationend", healed);
    const heal = () => {
      el.health.classList.remove("healing");
      void el.health.offsetWidth;
      el.health.classList.add("healing");
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
      el.lobbyReady.removeEventListener("click", readyUp);
      el.lobbyDecline.removeEventListener("click", decline);
      el.lobby.removeEventListener("keydown", lobbyKey);
      hideLobby(false);
      el.playerToggle.removeEventListener("click", flip);
      el.playerSkip.removeEventListener("click", skip);
      el.health.removeEventListener("animationend", healed);
      healed();
      show(false);
      el.flash.classList.remove("on");
    };
    return { show, top, lives, health, heal, lobby, player, banner, boss, flash, soul, dispose };
  };

  BL.ghostHud = { create };
})();
