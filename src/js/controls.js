(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp } = BL.math;
  const gamepad = BL.gamepad, { ACTION: PAD, state: pad } = gamepad, padActions = pad.actions;
  const KEYS = {
    w: "forward", s: "back", a: "left", d: "right", q: "yawLeft", e: "yawRight", r: "pitchDown", f: "pitchUp",
    z: "up", " ": "up", x: "down", arrowup: "forward", arrowdown: "back", arrowleft: "left", arrowright: "right", shift: "sprint"
  };
  // The help panel reads the same movement bindings as the input handler.
  const keysFor = (...actions) => Object.keys(KEYS).filter(key => actions.includes(KEYS[key]));
  // Discrete shortcuts shared by scene handlers and their reference rows.
  const SHORTCUTS = { view: ["x"], resetView: ["0"], weapon: ["1", "2"], swapWeapon: ["g"], attack: ["v"], reload: ["r"], bash: ["f"], jetpack: ["j"], actor: ["t"], escape: ["escape"], start: ["enter"], item: ["e", "shift"], autopilot: ["g"], spacewalk: ["v"], mineView: ["v"], crack: ["c"], pause: ["p"], act: [" ", "enter"] };
  const shortcutKeys = action => SHORTCUTS[action];
  Object.assign(SHORTCUTS, { north: ["n"], twirl: ["n"], tint: ["c"], horn: ["h"], tomato: ["t"], throwWallet: ["y"], grab: ["g"], smash: ["1"], chest: ["c"], hand: ["h"], linkAll: ["l"] });
  const matches = (e, action) => SHORTCUTS[action].includes(e.key.toLowerCase());
  const resets = new Set();
  const resetAll = () => { for (const reset of resets) reset(); };
  const KNOB = 18;
  // How long after a press's pointer lifts its own click may still arrive (a phone sends it a beat later).
  const CLICK_GRACE = 1000;
  const SHIFT_KEYS = ["ShiftLeft", "ShiftRight", "Shift"];
  const keyName = (e) => e.key === "Shift" && (e.code === "ShiftRight" || e.location === 2) ? "peek" : KEYS[e.key.toLowerCase()];
  const uiKey = (e) => e.target && (e.target.isContentEditable || e.target.closest
    && (e.target.closest("input, textarea, select, [role='dialog'], dialog, .sheet")
      || (e.key === "Tab" || e.key === "Enter" || e.key === " ") && e.target.closest("button, a[href], summary, [role='button']")));
  // Joystick state x/y track the pointer normalized to -1..1.
  const joystick = (el) => {
    const knob = el.firstElementChild;
    const s = { x: 0, y: 0, id: null };
    const onMove = (e) => {
      if (e.pointerId !== s.id) return;
      const r = el.getBoundingClientRect();
      const max = Math.max(1, r.width / 2 - KNOB);
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > max) {
        dx *= max / d;
        dy *= max / d;
      }
      knob.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
      s.x = dx / max;
      s.y = -dy / max;
    };
    const onDown = (e) => {
      if (s.id !== null) return;
      e.preventDefault();
      s.id = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.classList.add("live");
      onMove(e);
    };
    const onUp = (e) => {
      if (e.pointerId !== s.id) return;
      s.id = null;
      s.x = s.y = 0;
      knob.style.transform = "";
      el.classList.remove("live");
    };
    let listening = true;
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("lostpointercapture", onUp);
    s.reset = () => onUp({ pointerId: s.id });
    s.resume = () => {
      if (listening) return;
      listening = true;
      el.addEventListener("pointerdown", onDown);
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
      el.addEventListener("lostpointercapture", onUp);
    };
    s.dispose = () => {
      if (!listening) return;
      listening = false;
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("lostpointercapture", onUp);
      onUp({ pointerId: s.id });
    };
    return s;
  };
  // Joystick bases, a hold-to-climb button, a canvas whose mouse chord walks, and a Space handler
  // The keys physically down, whichever scene is listening. A scene's controls learn of a key only from its events, so a
  // key held across a change of scene is lost to them (at once where a later key has stopped its auto-repeat).
  const physical = new Map();
  window.addEventListener("keydown", (e) => { if (!e.metaKey && !e.ctrlKey && !e.altKey && !uiKey(e)) physical.set(e.code || e.key, e); }, true);
  window.addEventListener("keyup", (e) => physical.delete(e.code || e.key), true);
  window.addEventListener("blur", () => physical.clear());
  const create = ({ move = null, look = null, boost = null, chord = null, onAction = null, pressActions = false, tabNavigation = false, shooter = () => false, canDescend = () => true } = {}) => {
    const held = { forward: 0, back: 0, left: 0, right: 0, yawLeft: 0, yawRight: 0, pitchDown: 0, pitchUp: 0, up: 0, space: 0, down: 0, boost: 0, chord: 0, sprint: 0, peek: 0 };
    const axes = { x: 0, y: 0, up: 0, yaw: 0, pitch: 0, keyPitch: 0, orbitYaw: 0, sprint: 0, peek: 0, shiftTap: 0 };
    // `moveTap`: a movement key pressed since the last `read`, so a tap between frames still counts for `moving`.
    let pitchBorrowed = false, settled = false, moveTap = false;
    let spaceDown = false, boostPointer = null, boostClick = false, boostLift = 0, shiftAt = 0, shiftUsed = false, shiftTap = 0;
    let padFrame = -1, padUp = 0, padSprint = 0;
    const downKeys = new Set(), blockedKeys = new Set();
    let tabConsumed = false;
    let pointerButtons = 0, blockedPointerButtons = 0;
    const typing = (e) => tabNavigation ? uiKey(e) : e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA"
      || e.target.closest && e.target.closest("dialog, .sheet"));
    const consumeKey = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
    const consumeTab = (e) => { tabConsumed = true; consumeKey(e); };
    // Runs before actor shortcuts. Tab cancels held input even when the
    // browser owns navigation; those keys need a release before playing again.
    const captureKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Tab") {
        if (e.repeat) { if (tabConsumed) consumeKey(e); return; }
        tabConsumed = false;
        for (const key of downKeys) blockedKeys.add(key);
        blockedPointerButtons |= pointerButtons;
        reset();
        return;
      }
      if (uiKey(e)) return;
      const key = e.code || e.key;
      // A fresh press proves release, including a keyup missed while unfocused.
      // Repeats from an interrupted hold remain blocked.
      if (!e.repeat) {
        // Blur forgets physical holds; Tab retains them. Either fresh Shift
        // recovers stale blur blocks, but cannot release a Shift held through Tab.
        if (e.key === "Shift") for (const shift of SHIFT_KEYS) if (!downKeys.has(shift)) blockedKeys.delete(shift);
        blockedKeys.delete(key);
      }
      if (blockedKeys.has(key)
        || e.shiftKey && (blockedKeys.has("ShiftLeft") || blockedKeys.has("ShiftRight") || blockedKeys.has("Shift"))) { consumeKey(e); return; }
      // A physical keyboard has a bounded set of simultaneous presses.
      if (downKeys.size < 64) downKeys.add(key);
    };
    const captureKeyUp = (e) => {
      const key = e.code || e.key;
      downKeys.delete(key); blockedKeys.delete(key);
      if (e.key === "Tab") tabConsumed = false;
    };
    const releaseKeys = () => {
      downKeys.clear(); blockedKeys.clear(); tabConsumed = false;
      pointerButtons = blockedPointerButtons = 0;
    };
    const blurKeys = () => {
      for (const key of downKeys) blockedKeys.add(key);
      downKeys.clear(); tabConsumed = false;
      pointerButtons = blockedPointerButtons = 0;
    };
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      const name = pressActions && e.key === " " ? "space" : keyName(e);
      if (!name) return;
      if (e.key === " " || e.key.startsWith("Arrow")) e.preventDefault();
      if (settled && e.repeat && !held[name]) return;
      if (!e.repeat && (name === "forward" || name === "back" || name === "left" || name === "right")) moveTap = true;
      if (name === "peek" && !held.peek) {
        shiftAt = e.timeStamp;
        shiftUsed = !!(held.left || held.right);
      } else if ((name === "left" || name === "right") && held.peek) shiftUsed = true;
      if (pressActions && e.key === " ") {
        if (spaceDown || e.repeat) return;
        spaceDown = true;
        if (onAction && onAction()) return;
      } else if (e.key === " " && !e.repeat && onAction && onAction()) return;
      held[name] = 1;
    };
    const onKeyUp = (e) => {
      const name = pressActions && e.key === " " ? "space" : keyName(e);
      if (name === "peek" && held.peek && !shiftUsed && e.timeStamp - shiftAt <= 300) shiftTap = 1;
      if (name) held[name] = 0;
      if (e.key === " ") spaceDown = false;
    };
    const onBlur = () => {
      for (const name in held) held[name] = 0;
      spaceDown = false;
      boostPointer = null;
      // A press that acted keeps its claim on its own click, which may never come now, for CLICK_GRACE from here.
      if (boostClick) boostLift = Math.min(boostLift, performance.now());
      shiftAt = shiftTap = 0;
      shiftUsed = false;
      // A pad press not yet read is dropped too, so closing a menu never acts on the press made inside it.
      padUp = padSprint = 0;
      padFrame = pad.frame;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    if (tabNavigation) {
      window.addEventListener("keydown", captureKeyDown, true);
      window.addEventListener("keyup", captureKeyUp, true);
      window.addEventListener("blur", blurKeys);
    }
    const moveStick = move ? joystick(move) : null;
    const lookStick = look ? joystick(look) : null;
    // A pointer press has the same action/thrust priority as Space.
    // Consume its later click so a tap never acts twice or jumps on landing: the press owns its click until it
    // comes, through any reset of held input, whatever `detail` the browser gives it, and before any listener on the
    // button (the HUD's acts on a click); a click with no press, a keyboard's or an assistive tap, still acts.
    const onBoostDown = (e) => {
      if (!pressActions) { held.boost = 1; return; }
      if (boostPointer !== null) return;
      boostPointer = e.pointerId;
      boostClick = !!onAction;
      boostLift = Infinity;
      held.boost = onAction && onAction() ? 0 : 1;
    };
    const onBoostUp = (e) => {
      if (!pressActions) { held.boost = 0; return; }
      // The click follows the lift, so the grace runs from here, even after a reset of held input started it early.
      if (boostClick) boostLift = performance.now();
      if (e.pointerId !== boostPointer) return;
      boostPointer = null;
      held.boost = 0;
    };
    const onBoostClick = (e) => {
      if (!boostClick || !boost.contains(e.target)) return;
      boostClick = false;
      if (performance.now() - boostLift > CLICK_GRACE) return;
      e.preventDefault(); e.stopImmediatePropagation(); boost.blur();
    };
    if (boost) {
      boost.addEventListener("pointerdown", onBoostDown);
      boost.addEventListener("pointerup", onBoostUp);
      boost.addEventListener("pointercancel", onBoostUp);
      boost.addEventListener("pointerleave", onBoostUp);
      if (pressActions) window.addEventListener("click", onBoostClick, true);
    }
    // Both mouse buttons down means forward (as W); a chorded press arrives as a move event.
    const onChord = (e) => {
      if (e.pointerType !== "mouse") return;
      pointerButtons = e.buttons;
      // A new pointerdown means every previous mouse button was released,
      // even if that release happened outside the canvas after Tab.
      blockedPointerButtons = e.type === "pointerdown" ? 0 : blockedPointerButtons & e.buttons;
      held.chord = (e.buttons & ~blockedPointerButtons & 3) === 3 ? 1 : 0;
    };
    if (chord) {
      chord.addEventListener("pointerdown", onChord);
      chord.addEventListener("pointermove", onChord);
      chord.addEventListener("pointerup", onChord);
      chord.addEventListener("pointercancel", onChord);
    }
    // A pad's sticks are the touch sticks, its `act` button (A by default) is Space (each press acted on once, however
    // often `read` runs) and its `sprint` button (a click of the left stick) runs until the stick lets go, or while
    // held when the player chose that. Its `descend` button is X held.
    const readPad = () => {
      if (pad.frame !== padFrame) {
        padFrame = pad.frame;
        if (padActions.pressed & PAD.act) padUp = onAction && onAction() ? 0 : 1;
        if (padActions.released & PAD.act) padUp = 0;
        if (padActions.pressed & PAD.sprint) padSprint = 1;
      }
      if (gamepad.feel.runHold ? !(padActions.held & PAD.sprint) : !pad.lx && !pad.ly) padSprint = 0;
    };
    // Sign convention: yaw positive is left, pitch positive is down.
    const read = () => {
      moveTap = false;
      readPad();
      axes.x = clamp(held.right - held.left + (moveStick ? moveStick.x : 0) + pad.lx, -1, 1);
      axes.y = clamp(held.forward - held.back + (shooter() ? 0 : held.chord) + (moveStick ? moveStick.y : 0) + pad.ly, -1, 1);
      axes.up = clamp(held.up + held.space + held.boost + padUp - (canDescend() ? Math.max(held.down, padActions.held & PAD.descend ? 1 : 0) : 0), -1, 1);
      // Bird's-eye combat rotates with Q/E while its look stick aims the pointer.
      axes.orbitYaw = held.yawLeft - held.yawRight;
      // The pad's look speed scales its share after the clamp, so above 1 a full push turns faster, not just sooner.
      const look = gamepad.feel.look;
      axes.yaw = clamp((shooter() ? 0 : held.yawLeft - held.yawRight) - (lookStick ? lookStick.x : 0), -1, 1);
      axes.yaw = clamp(axes.yaw - pad.rx * look, -Math.max(1, pad.rx ? look : 1), Math.max(1, pad.rx ? look : 1));
      // R and F pitch the view unless a scene borrows them (`borrowPitch`), which reads them as `keyPitch` instead.
      axes.keyPitch = held.pitchDown - held.pitchUp;
      axes.pitch = clamp((shooter() || pitchBorrowed ? 0 : axes.keyPitch) - (lookStick ? lookStick.y : 0), -1, 1);
      axes.pitch = clamp(axes.pitch - pad.ry * look, -Math.max(1, pad.ry ? look : 1), Math.max(1, pad.ry ? look : 1));
      axes.sprint = Math.max(held.sprint, padSprint);
      axes.peek = shooter() ? held.peek : 0;
      axes.shiftTap = shiftTap;
      shiftTap = 0;
      return axes;
    };
    // Whether any movement is held now (keys, the move stick, the pad's stick or A, the mouse chord, climb or jump),
    // read without consuming a tap or a pad edge: what ends a look or a tour and goes to the Ooga instead.
    const moving = () => !!(moveTap || held.forward || held.back || held.left || held.right || held.up || held.space
      || held.chord || moveStick && (moveStick.x || moveStick.y) || pad.lx || pad.ly || padActions.held & PAD.act);
    // A forward movement still held, which a walk just ended hands back to the player: true if there is one. Keys are
    // taken up here from the physical record, with the sprint and sideways keys held with them; a stick is read live.
    const takeForward = () => {
      let forward = false;
      for (const e of physical.values()) if (keyName(e) === "forward") forward = true;
      if (forward) for (const e of physical.values()) { const name = keyName(e); if (name === "forward" || name === "left" || name === "right" || name === "sprint") held[name] = 1; }
      return forward || pad.ly > 0.2 || !!moveStick && moveStick.y > 0.2;
    };
    let listening = true;
    const dispose = () => {
      resets.delete(reset);
      if (!listening) return;
      listening = false;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (tabNavigation) {
        window.removeEventListener("keydown", captureKeyDown, true);
        window.removeEventListener("keyup", captureKeyUp, true);
        window.removeEventListener("blur", blurKeys);
      }
      releaseKeys();
      if (boost) {
        boost.removeEventListener("pointerdown", onBoostDown);
        boost.removeEventListener("pointerup", onBoostUp);
        boost.removeEventListener("pointercancel", onBoostUp);
        boost.removeEventListener("pointerleave", onBoostUp);
        if (pressActions) window.removeEventListener("click", onBoostClick, true);
      }
      if (chord) {
        chord.removeEventListener("pointerdown", onChord);
        chord.removeEventListener("pointermove", onChord);
        chord.removeEventListener("pointerup", onChord);
        chord.removeEventListener("pointercancel", onChord);
      }
      if (moveStick) moveStick.dispose();
      if (lookStick) lookStick.dispose();
      onBlur();
    };
    const clearPointer = () => {
      held.chord = held.boost = 0;
      boostPointer = null;
    };
    // `settle` also drops the auto-repeats of keys held through the reset, so only a fresh press moves again (a tour
    // that a movement ends must not end on the key that was held as it began).
    const reset = (settle = false) => { onBlur(); settled = settle; moveTap = false; if (moveStick) moveStick.reset(); if (lookStick) lookStick.reset(); };
    resets.add(reset);
    const borrowPitch = (on) => { pitchBorrowed = !!on; };
    const resume = () => {
      resets.add(reset);
      if (listening) return;
      reset();
      listening = true;
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", onBlur);
      if (tabNavigation) {
        window.addEventListener("keydown", captureKeyDown, true);
        window.addEventListener("keyup", captureKeyUp, true);
        window.addEventListener("blur", blurKeys);
      }
      if (boost) {
        boost.addEventListener("pointerdown", onBoostDown);
        boost.addEventListener("pointerup", onBoostUp);
        boost.addEventListener("pointercancel", onBoostUp);
        boost.addEventListener("pointerleave", onBoostUp);
        if (pressActions) window.addEventListener("click", onBoostClick, true);
      }
      if (chord) {
        chord.addEventListener("pointerdown", onChord);
        chord.addEventListener("pointermove", onChord);
        chord.addEventListener("pointerup", onChord);
        chord.addEventListener("pointercancel", onChord);
      }
      if (moveStick) moveStick.resume();
      if (lookStick) lookStick.resume();
    };
    return { read, moving, takeForward, axes, clearPointer, reset, consumeTab, resume, borrowPitch, dispose, get rightShift() { return !!held.peek; } };
  };
  // Whether the controller was the last thing used, for words that name its buttons: a key or pointer press from the
  // visitor (never a key the pad delivered) hands prompts back to the keyboard.
  let otherAt = 0;
  const other = (e) => { if (!e.pad) otherAt = e.timeStamp || performance.now(); };
  window.addEventListener("keydown", other, true);
  window.addEventListener("pointerdown", other, true);
  const usingPad = () => pad.connected && pad.lastAt > otherAt;
  const KEY_WORDS = { " ": "Space", enter: "Enter", escape: "Esc", shift: "Shift" };
  // What to press for an action, in the words of the last input: a controller's own button names (several joined
  // by "/"), else the key. `action` is a row of the current pad context, or a shortcut name.
  const label = (action) => {
    const shortcut = SHORTCUTS[action] ? SHORTCUTS[action][0] : action === "act" ? " " : action;
    if (usingPad()) {
      const def = gamepad.CONTEXTS[gamepad.wantedContext];
      const entry = def.entries.find(e => e.id === action) || def.entries.find(e => e.key === shortcut || e.native === action);
      const names = entry && entry.stick === undefined ? gamepad.bindings(entry.id, gamepad.wantedContext) : [];
      if (names.length) return names.map(n => gamepad.glyph(n)).join("/");
    }
    return KEY_WORDS[shortcut] || shortcut.toUpperCase();
  };
  // A prompt written for the keyboard, with "Space" named as the controller's button when the pad was last used.
  const words = (text) => usingPad() && text.includes("Space") ? text.replace(/\bSpace\b/g, label("act")) : text;
  BL.controls = { create, uiKey, keysFor, shortcutKeys, matches, resetAll, usingPad, label, words };
})();
