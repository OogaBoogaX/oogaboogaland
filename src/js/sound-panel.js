// The speaker button's long press (and its right click, the context-menu key or Shift+F10): a panel with a level for
// everything and one for each sound this place holds (sound.js's channels), so its rows change with the place. The
// levels are sound.js's, kept in this browser. A short press still mutes. `create({ button })` wires the button and
// the `#sound-mixer` markup once a page; `open`, `close`, `dispose`.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // How long a press is held before the panel opens, and how long after it a context-menu event is the same press
  // (a phone sends one for its own long press).
  const HOLD_MS = 450, SAME_PRESS_MS = 700;
  const create = ({ button }) => {
    const sound = BL.sound, $ = (id) => document.getElementById(id);
    const panel = $("sound-mixer"), list = $("sound-mixer-list"), empty = $("sound-mixer-empty"), toggle = $("sound-mixer-toggle");
    const rows = new Map();
    let shown = [], timer = 0, swallow = false, flippedAt = -Infinity, offWatch = null;
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
    const everything = makeRow("everything", "Everything", sound.setMaster);
    everything.el.classList.add("sound-mixer-everything");
    $("sound-mixer-all").append(everything.el);
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
      offWatch = sound.watch(render);
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
      offWatch(); offWatch = null;
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", onOutside, true);
    };
    const flip = () => {
      flippedAt = performance.now();
      if (panel.hidden) open(); else close();
    };
    const cancel = () => { clearTimeout(timer); timer = 0; };
    const onDown = (e) => {
      cancel(); swallow = false;
      if (e.button !== 0) return;
      // The click that ends a long press is the press that opened the panel, not a mute.
      timer = setTimeout(() => { timer = 0; swallow = true; flip(); }, HOLD_MS);
    };
    const onClick = () => {
      cancel();
      if (swallow) { swallow = false; return; }
      sound.toggle();
    };
    const onMenu = (e) => {
      e.preventDefault(); cancel();
      if (performance.now() - flippedAt > SAME_PRESS_MS) flip();
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); e.stopPropagation();
      close();
    };
    const onToggle = () => { sound.toggle(); toggle.blur(); };
    const onReset = (e) => { sound.resetLevels(); e.currentTarget.blur(); };
    const offMute = sound.subscribe(render);
    button.addEventListener("pointerdown", onDown);
    button.addEventListener("pointerup", cancel);
    button.addEventListener("pointerleave", cancel);
    button.addEventListener("pointercancel", cancel);
    button.addEventListener("click", onClick);
    button.addEventListener("contextmenu", onMenu);
    panel.addEventListener("keydown", onKey);
    toggle.addEventListener("click", onToggle);
    $("sound-mixer-close").addEventListener("click", close);
    $("sound-mixer-reset").addEventListener("click", onReset);
    const dispose = () => {
      cancel(); close(); offMute();
      button.removeEventListener("pointerdown", onDown);
      button.removeEventListener("pointerup", cancel);
      button.removeEventListener("pointerleave", cancel);
      button.removeEventListener("pointercancel", cancel);
      button.removeEventListener("click", onClick);
      button.removeEventListener("contextmenu", onMenu);
      panel.removeEventListener("keydown", onKey);
      toggle.removeEventListener("click", onToggle);
      $("sound-mixer-close").removeEventListener("click", close);
      $("sound-mixer-reset").removeEventListener("click", onReset);
    };
    return { open, close, dispose, get shown() { return !panel.hidden; } };
  };
  BL.soundPanel = { create };
})();
