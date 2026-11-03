// Contextual controls reference, continuing Holo-Elfstone's native dialog in #57.
// Controllers supply rows on demand; nothing is built or polled in the frame loop.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const row = (keys, text, gesture = "") => ({ keys, text, gesture });
  const movement = text => row(BL.controls.keysFor("forward", "left", "back", "right"), text);
  const labels = { " ": "Space", arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", escape: "Esc", shift: "Shift", shiftleft: "Left Shift", shiftright: "Right Shift", enter: "Enter", tab: "Tab" };
  // Existing game coaching copy is also the reference's copy. Split only at its
  // authored separators; keycaps are annotations, never a second bindings table.
  const fromCopy = (copy, touch) => copy.split(/[·\n]/).filter(s => s.trim()).map(text => {
    const keys = [];
    if (!touch) {
      for (const word of text.match(/\b(?:WASD|[A-Z]|Space|Enter|Escape|Shift|Tab|arrows)\b/g) || []) {
        const names = word === "WASD" ? ["w", "a", "s", "d"] : word === "arrows" ? ["arrowup", "arrowleft", "arrowdown", "arrowright"] : [word === "Space" ? " " : word.toLowerCase()];
        for (const name of names) if (!keys.includes(name)) keys.push(name);
      }
    }
    return row(keys, text.trim(), touch ? "Touch" : keys.length ? "" : "Mouse");
  });
  const groupedRows = rows => {
    const moveKeys = ["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"];
    const movement = rows.filter(r => r.keys?.length && r.keys.every(k => moveKeys.includes(k)));
    if (movement.length < 2 || !["w", "a", "s", "d"].every(k => movement.some(r => r.keys.includes(k)))) return rows;
    const merged = row([...new Set(movement.flatMap(r => r.keys))], movement.map(r => r.text).join(" · "));
    return rows.flatMap(r => r === movement[0] ? [merged] : movement.includes(r) ? [] : [r]);
  };
  const create = ({ current, ready, hold }) => {
    const dialog = document.getElementById("controls-help"), button = document.getElementById("controls-help-button");
    const closeButton = document.getElementById("controls-help-close"), list = document.getElementById("controls-help-list");
    const context = document.getElementById("controls-help-context"), note = document.getElementById("controls-help-note");
    const coarse = window.matchMedia("(pointer: coarse)");
    let mode = coarse.matches ? "touch" : "keyboard", usedInput = false, owner = null, returnFocus = null;
    let caps = [], held = new Map();
    const down = new Set();
    // Keys pressed in the practice panel must be released before they can play.
    const swallowed = new Set();
    const clear = () => { held.clear(); for (const cap of caps) cap.dataset.pressed = "false"; };
    const paint = () => {
      for (const cap of caps) cap.dataset.pressed = String([...held.values()].some(key => key === cap.dataset.key || cap.dataset.key === "shift" && (key === "shiftleft" || key === "shiftright")));
    };
    const keycap = key => {
      const el = document.createElement("kbd");
      el.textContent = labels[key] || key.toUpperCase(); el.dataset.key = key; el.dataset.pressed = "false";
      if (key.startsWith("arrow")) el.setAttribute("aria-label", key.replace("arrow", "Arrow "));
      caps.push(el); return el;
    };
    const render = () => {
      clear(); caps = []; list.replaceChildren();
      const touch = mode === "touch", help = owner?.controlsHelp?.(touch) || { title: owner?.id || "Island", rows: [] };
      context.textContent = `${help.title} · ${touch ? "Touch" : "Keyboard & mouse"}`;
      note.textContent = touch ? "Use the controls shown on screen after closing this panel. Keyboard input switches this reference to keys."
        : "Try the keys here. Your character stays still while this panel is open.";
      const rows = groupedRows(help.rows).concat(row(touch ? [] : ["m"], !touch && (BL.voice.stats.enabled || BL.voice.stats.joining) ? "Mute microphone" : "Mute environment sounds", touch ? "Sound button" : ""));
      for (const entry of rows) {
        const line = document.createElement("div"), keys = document.createElement("div"), text = document.createElement("span");
        line.className = "controls-row"; keys.className = "controls-keys"; text.textContent = entry.text;
        const names = entry.keys || [], clustered = new Set();
        for (const group of [["w", "a", "s", "d"], ["arrowup", "arrowleft", "arrowdown", "arrowright"]]) {
          const arrows = group[0] === "arrowup";
          if (!(arrows ? group.some(name => names.includes(name)) : group.every(name => names.includes(name)))) continue;
          const cluster = document.createElement("span"); cluster.className = "controls-key-cluster";
          cluster.setAttribute("aria-label", arrows ? "Arrow keys" : "W A S D");
          for (const name of group) if (names.includes(name)) { cluster.append(keycap(name)); clustered.add(name); }
          keys.append(cluster);
        }
        const aliases = document.createElement("span"); aliases.className = "controls-aliases";
        for (const name of names) if (!clustered.has(name)) aliases.append(keycap(name));
        if (aliases.childElementCount) keys.append(aliases);
        if (entry.gesture) {
          const gesture = document.createElement("span"); gesture.className = "controls-gesture"; gesture.textContent = entry.gesture; keys.append(gesture);
        }
        line.append(keys, text); list.append(line);
      }
    };
    const setMode = next => {
      usedInput = true;
      if (next === mode) return;
      mode = next; clear();
      if (dialog.open) render();
    };
    const finish = () => {
      clear();
      if (!owner) return;
      const previous = owner; owner = null;
      previous.controlsHelpHold?.(false);
      BL.controls.resetAll(); hold(false);
      button.setAttribute("aria-expanded", "false");
      // A native modal restores its invoker. Keep a keyboard invoker reachable,
      // but return pointer users to the canvas, away from the sheet's typing guard.
      const target = returnFocus?.isConnected && !returnFocus.closest(".sheet") ? returnFocus : button;
      target.focus({ preventScroll: true });
      returnFocus = null;
    };
    const close = () => { if (dialog.open) dialog.close(); finish(); };
    const open = e => {
      if (dialog.open || !ready() || document.querySelector("dialog[open]")) return;
      owner = current();
      if (!owner) return;
      returnFocus = e?.detail ? document.getElementById("scene") : button;
      if (returnFocus.tagName === "CANVAS") returnFocus.tabIndex = -1;
      for (const key of down) swallowed.add(key);
      BL.controls.resetAll(); owner.controlsHelpHold?.(true); hold(true);
      if (document.pointerLockElement) document.exitPointerLock();
      render(); dialog.showModal(); dialog.focus({ preventScroll: true });
      button.setAttribute("aria-expanded", "true");
    };
    const onDown = e => {
      const physical = e.code || e.key;
      if (down.size < 64) down.add(physical);
      if (!dialog.open) {
        if (swallowed.has(physical)) {
          if (e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); return; }
          swallowed.delete(physical);
        }
        if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.isComposing && !(e.target?.isContentEditable || e.target?.closest?.("input, textarea, select"))) setMode("keyboard");
        return;
      }
      // Let the browser handle Tab, close-button activation and OS shortcuts,
      // but never deliver practice input to a scene or a later capture listener.
      e.stopImmediatePropagation();
      if (swallowed.size < 64) swallowed.add(physical);
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) { clear(); return; }
      if (e.key !== "Tab" && e.key !== "Enter" && e.key !== " ") e.preventDefault();
      if (e.key === "Tab") { clear(); return; }
      // Space on the close button remains native keyboard activation. Other
      // practice keys still light while that initial focus stays accessible.
      if ((e.key === " " || e.key === "Enter") && e.target !== closeButton) e.preventDefault();
      setMode("keyboard");
      const key = e.key.toLowerCase();
      if (held.size < 64) held.set(physical, key === "shift" ? e.code === "ShiftRight" ? "shiftright" : "shiftleft" : key);
      paint();
    };
    const onUp = e => {
      const physical = e.code || e.key;
      down.delete(physical);
      if (swallowed.delete(physical) || dialog.open) {
        e.stopImmediatePropagation();
        if (!dialog.open || e.target !== closeButton) e.preventDefault();
      }
      held.delete(physical); paint();
    };
    const onPointer = e => {
      if (e.pointerType === "touch" || e.pointerType === "pen") setMode("touch");
      else if (e.pointerType === "mouse") setMode("keyboard");
      if (!dialog.open || e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    };
    const onCancel = e => { e.preventDefault(); close(); };
    const onClose = () => { if (!dialog.open) finish(); };
    const onBlur = () => { clear(); down.clear(); BL.controls.resetAll(); };
    const onVisibility = () => { if (document.hidden) onBlur(); };
    const onMedia = () => { if (!usedInput) { mode = coarse.matches ? "touch" : "keyboard"; if (dialog.open) render(); } };
    button.addEventListener("click", open); closeButton.addEventListener("click", close);
    dialog.addEventListener("cancel", onCancel); dialog.addEventListener("close", onClose);
    window.addEventListener("keydown", onDown, true); window.addEventListener("keyup", onUp, true);
    window.addEventListener("pointerdown", onPointer, true); window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility); coarse.addEventListener("change", onMedia);
    return { close, get open() { return dialog.open; }, dispose() {
      close();
      button.removeEventListener("click", open); closeButton.removeEventListener("click", close);
      dialog.removeEventListener("cancel", onCancel); dialog.removeEventListener("close", onClose);
      window.removeEventListener("keydown", onDown, true); window.removeEventListener("keyup", onUp, true);
      window.removeEventListener("pointerdown", onPointer, true); window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility); coarse.removeEventListener("change", onMedia);
      swallowed.clear();
    } };
  };
  BL.controlsHelp = { create, row, movement, fromCopy };
})();
