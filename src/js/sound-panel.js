// The speaker button opens and closes this panel: a level for every game sound (all but voices), one for all music
// anywhere (sound.js's `setMusic`), one for every other player's voice while signed in (voice.js's `setPlayersLevel`),
// and one for each sound this place holds (sound.js's channels), so its rows change with the place. The levels are kept in this browser; M still mutes the game sounds.
// `create({ button })` wires the button and the `#sound-mixer` markup once a page; `open`, `close`, `dispose`.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const create = ({ button }) => {
    const sound = BL.sound, voice = BL.voice, $ = (id) => document.getElementById(id);
    const panel = $("sound-mixer"), list = $("sound-mixer-list"), empty = $("sound-mixer-empty"), toggle = $("sound-mixer-toggle");
    const rows = new Map();
    let shown = [], offWatch = null, offVoice = null, offNet = null;
    // A row is kept once made: at most one a channel for the page life.
    const makeRow = (id, label, set) => {
      const el = document.createElement("div"), name = document.createElement("label"), range = document.createElement("input"), value = document.createElement("output");
      el.className = "sound-mixer-row";
      range.type = "range"; range.min = "0"; range.max = "100"; range.step = "5"; range.id = `sound-mixer-level-${id}`;
      name.htmlFor = value.htmlFor = range.id; name.textContent = label;
      range.addEventListener("input", () => set(Number(range.value) / 100));
      el.append(name, range, value);
      return { el, range, value, percent: -1 };
    };
    const paint = (row, level) => {
      const percent = Math.round(level * 100);
      if (row.percent === percent) return;
      row.percent = percent;
      row.range.value = String(percent);
      row.range.style.setProperty("--fill", `${percent}%`);
      row.value.textContent = percent ? `${percent}%` : "Off";
    };
    const everything = makeRow("everything", "All sounds except voices", sound.setMaster);
    const music = makeRow("music", "Music", sound.setMusic);
    const players = makeRow("players", "All online players' voices", voice.setPlayersLevel);
    everything.el.classList.add("sound-mixer-everything");
    music.el.classList.add("sound-mixer-music");
    players.el.classList.add("sound-mixer-players");
    $("sound-mixer-all").append(everything.el, music.el, players.el);
    const render = () => {
      if (panel.hidden) return;
      const active = sound.channels();
      let same = active.length === shown.length;
      for (let i = 0; same && i < active.length; i++) same = shown[i] === active[i].id;
      if (!same) {
        shown = active.map(channel => channel.id);
        for (const channel of active) if (!rows.has(channel.id)) rows.set(channel.id, makeRow(channel.id, channel.label, (level) => sound.setLevel(channel.id, level)));
        list.replaceChildren(...shown.map(id => rows.get(id).el));
        empty.hidden = active.length > 0;
      }
      paint(everything, sound.master);
      paint(music, sound.music);
      players.el.hidden = !(BL.net && BL.net.state.me);
      paint(players, voice.stats.playersLevel);
      for (const channel of active) paint(rows.get(channel.id), channel.level);
      toggle.textContent = sound.muted ? "Sound off" : "Sound on";
      toggle.setAttribute("aria-pressed", String(!sound.muted));
      panel.dataset.muted = String(sound.muted);
    };
    // Under the button, its right edge on the button's.
    const place = () => {
      const r = button.getBoundingClientRect();
      panel.style.setProperty("--sound-mixer-top", `${Math.round(r.bottom + 8)}px`);
      panel.style.setProperty("--sound-mixer-right", `${Math.round(window.innerWidth - r.right)}px`);
    };
    const onOutside = (e) => { if (!panel.contains(e.target) && !button.contains(e.target)) close(); };
    const open = () => {
      if (!panel.hidden) return;
      place();
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      // A sign-in or sign-out while open shows or hides the players' row at once.
      offWatch = sound.watch(render); offVoice = voice.subscribe(render); offNet = BL.net ? BL.net.subscribe(render) : null;
      render();
      window.addEventListener("resize", place);
      document.addEventListener("pointerdown", onOutside, true);
      panel.focus({ preventScroll: true });
    };
    const close = () => {
      if (panel.hidden) return;
      if (panel.contains(document.activeElement)) document.activeElement.blur();
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
      offWatch(); offVoice(); if (offNet) offNet();
      offWatch = offVoice = offNet = null;
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", onOutside, true);
    };
    const onClick = () => { if (panel.hidden) open(); else close(); };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopPropagation();
      close();
    };
    const onToggle = () => { sound.toggle(); toggle.blur(); };
    const onReset = (e) => { sound.resetLevels(); voice.setPlayersLevel(1); e.currentTarget.blur(); };
    const offMute = sound.subscribe(render);
    button.addEventListener("click", onClick);
    panel.addEventListener("keydown", onKey);
    toggle.addEventListener("click", onToggle);
    $("sound-mixer-close").addEventListener("click", close);
    $("sound-mixer-reset").addEventListener("click", onReset);
    const dispose = () => {
      close(); offMute();
      button.removeEventListener("click", onClick);
      panel.removeEventListener("keydown", onKey);
      toggle.removeEventListener("click", onToggle);
      $("sound-mixer-close").removeEventListener("click", close);
      $("sound-mixer-reset").removeEventListener("click", onReset);
    };
    return { open, close, dispose, get shown() { return !panel.hidden; } };
  };
  BL.soundPanel = { create };
})();
