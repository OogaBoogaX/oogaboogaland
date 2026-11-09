(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // One controller, read once a frame by the director's step: the last one a button was pressed on, else the first
  // one connected, so a second pad or Steam's idle virtual twin never steals play. Three layers:
  // 1. Normalize. A pad in the browser's standard mapping passes through; any other goes through the profile learned
  //    for it in the controller screen's guided setup (`learn`), keyed by its vendor and product. A pad with neither
  //    is not read (`state.unknown` names it so the screen can offer setup). After this every pad has the standard
  //    mapping's 18 places, `BUTTON` below (the d-pad and Home included).
  // 2. Bind. Each context (`CONTEXTS`: on foot, each game, menus) maps places to its actions through a table the
  //    player can edit (`bind`), saved per controller family. A scene names its context in `padContext`.
  // 3. Deliver. On-foot actions that `pilot.js`, `controls.js` and the ghost lobby read come out as `ACTION` bits in
  //    `state.actions`. Every other action is the key a keyboard player presses for it: a press dispatches that key's
  //    keydown on the page (marked `pad`), a release its keyup, so every scene's own key handling serves the pad too.
  //    While a menu layer is open (`setMenu`) the Menus context drives `BL.padFocus` instead and nothing reaches play.
  // `state.held`, `pressed` and `released` are the physical places, `actions` the same three masks over ACTION bits;
  // `frame` counts the reads that changed anything, so a reader acts on an edge once however often it looks. Sticks
  // are -1..1 with y positive pushed up, past a radial dead zone; the right stick's travel is squared for fine aim and
  // carries the inversion (`controls.js` applies the look speed after its clamp, so it raises the top turn rate). Nothing here allocates per frame; a delivered key allocates its one event
  // per press. `navigator.getGamepads` returns a new array on every call, so it is read only while a pad is
  // connected and a page without one pays nothing. Input is ignored while the window is unfocused.
  const BUTTON = { a: 1, b: 2, x: 4, y: 8, lb: 16, rb: 32, lt: 64, rt: 128, view: 256, menu: 512, ls: 1024, rs: 2048,
    up: 4096, down: 8192, left: 16384, right: 32768, home: 65536, touchpad: 131072 };
  const PLACE = Object.keys(BUTTON);
  const COUNT = 18, LT = 6, RT = 7, MENU = 9, TRIGGER_ON = 0.5, TRIGGER_OFF = 0.3, STICK_ON = 0.5, STICK_OFF = 0.35;
  // What a press means to the readers that ask for bits, named after `controls.js`'s shortcuts.
  const ACTION = { act: 1, bash: 2, back: 4, reload: 8, swapWeapon: 16, aim: 32, fire: 64, view: 128, sprint: 256, descend: 512 };
  // The system takes Home (macOS's Games overlay, Windows' Game Bar) and most pads have no touchpad: neither is bound.
  const RESERVED = BUTTON.home | BUTTON.touchpad;
  // Menu always pauses, so nobody can lock themselves out: no other action takes it and its own row cannot change.
  const FIXED = BUTTON.menu;

  // An entry is `[id, label, note, defaults, how]`: `how` is an ACTION name (`native`), a key (`key`, delivered as a
  // keyboard press), or a menu verb (`menu`). A `stick` entry only names a stick on the screen; sticks swap as a pair.
  // `fixed` marks Menu's row. Every context's first two rows are its sticks.
  const native = (id, label, note, defaults) => ({ id, label, note, defaults, native: id });
  const key = (id, label, note, defaults, k) => ({ id, label, note, defaults, key: k });
  const menu = (id, label, note, defaults) => ({ id, label, note, defaults, menu: id });
  const stick = (id, label, note, side) => ({ id, label, note, defaults: [], stick: side });
  const pause = (label = "Pause") => ({ id: "pause", label, note: "always Menu", defaults: ["menu"], key: "Escape", fixed: true });
  // `pauseKey`: what a lost controller presses in that context, so a game stops rather than running on. `stickKeys`:
  // the left stick also presses the d-pad's places, for games that read only arrow keys.
  const CONTEXTS = {
    foot: { label: "On foot", note: "The island, the caves, the arcade hall, the Mempool, the Factory, ₿IFRÖST, DSB Land", entries: [
      stick("move", "Move", "click to run", 0), stick("look", "Look and aim", "", 1),
      native("act", "Jump · use · climb", "Space", ["a"]), native("fire", "Fire · swing", "hold to charge", ["rt"]),
      native("aim", "Aim down sights", "", ["lt"]), native("bash", "Strike with rifle", "combat", ["b"]),
      native("back", "Not now · back", "lobbies", ["b"]),
      native("reload", "Swap magazine", "", ["x"]), native("swapWeapon", "Switch weapon", "", ["y"]),
      native("sprint", "Run", "", ["ls"]), native("view", "Carry · combat", "", ["view"]),
      native("descend", "Climb down · descend", "", ["down"]), key("actor", "Switch Ooga · gorilla", "", ["lb"], "t"),
      key("resetView", "Reset camera", "", ["rs"], "0"), key("jetpack", "Jetpack on · off", "", ["up"], "j"),
      key("club", "Club", "", ["left"], "1"), key("rifle", "Rifle", "", ["right"], "2"),
      key("twirl", "Twirl · face north", "", ["rb"], "n"), pause("Map · let go · back")] },
    race: { label: "Ooga Rally", note: "", pauseKey: "Escape", entries: [
      stick("move", "Steer · throttle", "", 0), stick("look", "Look round", "", 1),
      key("throttle", "Accelerate", "", ["rt"], "w"), key("brake", "Brake · reverse", "", ["lt"], "s"),
      key("drift", "Drift · hop", "release to boost", ["rb", "a"], " "), key("item", "Throw item", "", ["x"], "e"),
      key("lookBack", "Look back", "", ["y"], "q"), key("resetView", "Reset camera", "", ["rs"], "0"),
      key("start", "Start · next race", "", ["view"], "Enter"), pause()] },
    drop: { label: "Ooga Drop", note: "", entries: [
      stick("move", "Lean and steer", "", 0), stick("look", "Turn and pitch", "", 1),
      key("act", "Jump · canopy · flare", "hold to flare", ["a", "rt"], " "), key("turnLeft", "Turn left", "", ["lb"], "q"),
      key("turnRight", "Turn right", "", ["rb"], "e"), key("resetView", "Reset camera", "", ["rs"], "0"),
      key("start", "Jump again", "", ["view"], "Enter"), pause("Back to the board")] },
    orbit: { label: "Ooga Orbit", note: "", entries: [
      stick("move", "Throttle · lean", "", 0), stick("look", "Turn · look", "", 1),
      key("throttleUp", "Throttle up · pitch", "", ["rt"], "w"), key("throttleDown", "Throttle down · pitch", "", ["lt"], "s"),
      key("start", "Launch · stage · chute", "", ["a"], " "), key("autopilot", "Autopilot", "", ["y"], "g"),
      key("spacewalk", "Spacewalk", "", ["x"], "v"), key("yawLeft", "Turn left · fly down", "", ["lb"], "q"),
      key("yawRight", "Turn right · fly up", "", ["rb"], "e"), key("resetView", "Reset camera", "", ["rs"], "0"),
      pause("Back to the builder")] },
    mine: { label: "Ooga Mine", note: "", pauseKey: "p", entries: [
      stick("move", "Walk", "", 0), stick("look", "Turn", "", 1),
      key("act", "Use · act beside", "", ["a"], " "), key("crack", "Crack nearby rock", "", ["b"], "c"),
      key("sell", "Sell sats", "", ["x"], "shift+s"), key("mineView", "Overview", "", ["y"], "v"),
      key("den", "Overview of the den", "", ["rs"], "0"), key("pauseGame", "Pause", "", ["view"], "p"),
      key("start", "Start", "", ["rb"], "Enter"), pause("Close · leave")] },
    arcade: { label: "Arcade games", note: "Thro-ball to Coconut Invaders", stickKeys: true, pauseKey: "Escape", entries: [
      stick("move", "Aim · move", "also the d-pad", 0), stick("look", "Look", "", 1),
      key("act", "Throw · fire · play", "", ["a"], " "), key("start", "Start · again", "", ["view"], "Enter"),
      key("aimUp", "Up", "", ["up"], "ArrowUp"), key("aimDown", "Down", "", ["down"], "ArrowDown"),
      key("aimLeft", "Left", "", ["left"], "ArrowLeft"), key("aimRight", "Right", "", ["right"], "ArrowRight"),
      pause("Pause · back to the hall")] },
    menus: { label: "Menus", note: "Panels, title cards, results, boards, dialogs", menu: true, entries: [
      stick("move", "Move between buttons", "or the d-pad", 0), stick("look", "Scroll", "", 1),
      menu("up", "Up", "", ["up"]), menu("down", "Down", "", ["down"]), menu("left", "Left", "", ["left"]),
      menu("right", "Right", "", ["right"]), menu("select", "Select", "", ["a"]), menu("back", "Back · close", "", ["b"]),
      menu("prev", "Previous tab · page", "", ["lb"]), menu("next", "Next tab · page", "", ["rb"]),
      menu("help", "Controller settings", "", ["view"]), { ...menu("close", "Close", "always Menu", ["menu"]), fixed: true }] }
  };
  // Today's on-foot buttons, for readers that name them.
  const DEFAULT_BINDINGS = Object.freeze(Object.fromEntries(CONTEXTS.foot.entries.filter(e => e.native).map(e => [e.id, e.defaults.slice()])));

  // ---- Controller families: what each place is called on the player's controller ----
  const NAMES = {
    xbox: ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "LS", "RS", "↑", "↓", "←", "→", "Xbox", "Share"],
    playstation: ["✕", "○", "□", "△", "L1", "R1", "L2", "R2", "Create", "Options", "L3", "R3", "↑", "↓", "←", "→", "PS", "Touchpad"],
    nintendo: ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "−", "+", "LS", "RS", "↑", "↓", "←", "→", "Home", "Capture"],
    stadia: ["A", "B", "X", "Y", "L1", "R1", "L2", "R2", "Options", "Menu", "L3", "R3", "↑", "↓", "←", "→", "Stadia", "Assistant"],
    generic: ["South", "East", "West", "North", "L1", "R1", "L2", "R2", "Select", "Start", "L3", "R3", "↑", "↓", "←", "→", "Home", "Extra"]
  };
  const FAMILIES = { xbox: "Xbox", playstation: "PlayStation", nintendo: "Switch", stadia: "Stadia", generic: "Other" };
  // Chrome writes "Vendor: 054c"; Firefox and Safari a "54c-ce6-" prefix. Chrome on macOS and Safari give no vendor
  // for Xbox and PlayStation pads, so the name decides then.
  const vendorOf = (id) => {
    const s = id.toLowerCase(), m = s.match(/vendor: ?([0-9a-f]{4})/) || s.match(/^([0-9a-f]{1,4})-[0-9a-f]{1,4}-/);
    return m ? m[1].padStart(4, "0") : "";
  };
  const familyOf = (id) => {
    const s = id.toLowerCase(), vendor = vendorOf(id);
    if (vendor === "045e" || /xbox|xinput|x-box/.test(s)) return "xbox";
    if (vendor === "054c" || /dualsense|dualshock|playstation|^wireless controller/.test(s)) return "playstation";
    if (vendor === "057e" || /pro controller|joy-con|nintendo|switch/.test(s)) return "nintendo";
    if (vendor === "18d1" || /stadia/.test(s)) return "stadia";
    return "generic";
  };
  // A readable name from any browser's id: no "(STANDARD GAMEPAD …)", ID prefix or Safari's profile suffix.
  const nameOf = (id) => {
    const n = id.replace(/\s*\(.*\)\s*$/, "").replace(/^[0-9a-f]{1,4}-[0-9a-f]{1,4}-/i, "").replace(/\s*(extended )?gamepad$/i, "").trim();
    if (/^xinput$/i.test(n) || /^xbox 360 controller$/i.test(n) && /xinput/i.test(id)) return "Xbox controller";
    if (/^wireless controller$/i.test(n)) return "DualShock 4";
    return n || "Controller";
  };
  // The key a learned profile is saved under: vendor and product where the browser gives them, else the whole id.
  const profileKey = (id) => {
    const s = id.toLowerCase(), m = s.match(/vendor: ?([0-9a-f]{4}) product: ?([0-9a-f]{4})/) || s.match(/^([0-9a-f]{1,4})-([0-9a-f]{1,4})-/);
    return m ? `${m[1].padStart(4, "0")}-${m[2].padStart(4, "0")}` : id;
  };

  // ---- Saved settings: `ooga-pad-v1`, validated on load like `game.load`; a bad piece falls back to its default ----
  const STORE = "ooga-pad-v1";
  const FEEL = { dead: 0.18, look: 1, invertX: false, invertY: false, swap: false, runHold: false, aimToggle: false };
  const feel = { ...FEEL };
  const saved = { family: null, bindings: {}, profiles: {} };
  const okNames = (list) => Array.isArray(list) && list.length <= 4 && list.every(n => typeof n === "string" && n in BUTTON && !(BUTTON[n] & RESERVED));
  const okProfile = (p) => p && Array.isArray(p.map) && p.map.length === COUNT && Array.isArray(p.axes) && p.axes.length === 4
    && p.map.every(m => m === null || m && (m.k === "b" || m.k === "a" || m.k === "h") && Number.isInteger(m.i) && m.i >= 0 && m.i < 64
      && (m.k !== "a" || (m.v === 1 || m.v === -1) && Number.isFinite(m.rest)) && (m.k !== "h" || Number.isFinite(m.at)))
    && p.axes.every(a => a === null || a && Number.isInteger(a.i) && a.i >= 0 && a.i < 64 && (a.v === 1 || a.v === -1));
  const load = () => {
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(STORE) || "null");
    } catch {
      data = null;
    }
    if (!data || typeof data !== "object" || data.v !== 1) return;
    if (typeof data.family === "string" && data.family in FAMILIES) saved.family = data.family;
    const f = data.feel || {};
    if (Number.isFinite(f.dead) && f.dead >= 0.05 && f.dead <= 0.35) feel.dead = f.dead;
    if (Number.isFinite(f.look) && f.look >= 0.25 && f.look <= 2.5) feel.look = f.look;
    for (const k of ["invertX", "invertY", "swap", "runHold", "aimToggle"]) if (typeof f[k] === "boolean") feel[k] = f[k];
    for (const family in data.bindings || {}) {
      if (!(family in FAMILIES)) continue;
      for (const context in data.bindings[family] || {}) {
        const def = CONTEXTS[context], table = data.bindings[family][context];
        if (!def || !table || typeof table !== "object") continue;
        for (const id in table) {
          const entry = def.entries.find(e => e.id === id);
          if (!entry || entry.stick !== undefined || entry.fixed || !okNames(table[id]) || table[id].some(n => BUTTON[n] & FIXED)) continue;
          ((saved.bindings[family] ||= {})[context] ||= {})[id] = table[id].slice();
        }
      }
    }
    for (const k in data.profiles || {}) if (typeof k === "string" && k.length <= 200 && okProfile(data.profiles[k])) saved.profiles[k] = data.profiles[k];
  };
  const store = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ v: 1, family: saved.family, feel, bindings: saved.bindings, profiles: saved.profiles }));
    } catch {
    }
  };
  load();

  // ---- Bindings: the family's saved rows over the defaults, compiled into one table per context ----
  // `tables[c][i]` is the mask of context c's entries bound to place i; `natives[c][e]` the ACTION bit of entry e.
  const tables = {}, natives = {}, keys = {};
  const contextIds = Object.keys(CONTEXTS);
  for (const c of contextIds) {
    tables[c] = new Uint32Array(COUNT);
    natives[c] = new Uint32Array(CONTEXTS[c].entries.length);
    keys[c] = CONTEXTS[c].entries.map(e => e.key || null);
    CONTEXTS[c].entries.forEach((e, i) => { natives[c][i] = e.native ? ACTION[e.native] : 0; });
  }
  let detected = "xbox";
  const familyNow = () => saved.family || detected;
  const rowsOf = (c, id) => {
    const own = saved.bindings[familyNow()] && saved.bindings[familyNow()][c] && saved.bindings[familyNow()][c][id];
    return own || CONTEXTS[c].entries.find(e => e.id === id).defaults;
  };
  const compile = () => {
    for (const c of contextIds) {
      const table = tables[c];
      table.fill(0);
      CONTEXTS[c].entries.forEach((e, i) => { for (const n of rowsOf(c, e.id)) table[PLACE.indexOf(n)] |= 1 << i; });
    }
  };
  compile();
  const listeners = new Set();
  const emit = (what) => { for (const fn of listeners) fn(what); };
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const entryOf = (c, id) => {
    const def = CONTEXTS[c];
    if (!def) throw new Error(`gamepad: no context "${c}"`);
    const entry = def.entries.find(e => e.id === id);
    if (!entry) throw new Error(`gamepad: no action "${id}" in ${c}`);
    return entry;
  };
  // `bind(action, ["rt"], context)` gives an action its buttons (an empty list unbinds it) for the current family;
  // `bindings(action, context)` reads them back; `resetBindings(context)` restores one context, or every one. A
  // button may carry several actions and an action several buttons. Unknown names, the reserved buttons, Menu and the
  // sticks' rows throw: they come from our own settings code, never from a visitor directly.
  const bind = (id, names, context = "foot") => {
    const entry = entryOf(context, id);
    if (entry.stick !== undefined || entry.fixed) throw new Error(`gamepad: "${id}" cannot be rebound`);
    for (const name of names) {
      if (!(name in BUTTON)) throw new Error(`gamepad: no button "${name}"`);
      if (BUTTON[name] & RESERVED) throw new Error(`gamepad: "${name}" is reserved for the system`);
      if (BUTTON[name] & FIXED) throw new Error(`gamepad: "${name}" always pauses`);
    }
    ((saved.bindings[familyNow()] ||= {})[context] ||= {})[id] = [...new Set(names)];
    compile();
    store();
    emit("bindings");
  };
  const bindings = (id, context = "foot") => { entryOf(context, id); return rowsOf(context, id).slice(); };
  const resetBindings = (context) => {
    const own = saved.bindings[familyNow()];
    if (own) { if (context) delete own[context]; else delete saved.bindings[familyNow()]; }
    compile();
    store();
    emit("bindings");
  };
  // Everything the controller screen restores with Undo: the family's rows and the feel.
  const snapshot = () => JSON.stringify({ rows: saved.bindings[familyNow()] || {}, feel });
  const restore = (text) => {
    const s = JSON.parse(text);
    saved.bindings[familyNow()] = s.rows;
    Object.assign(feel, s.feel);
    compile();
    store();
    emit("bindings");
  };
  const setFeel = (k, v) => {
    if (!(k in FEEL)) throw new Error(`gamepad: no setting "${k}"`);
    feel[k] = typeof FEEL[k] === "boolean" ? !!v : Math.min(k === "dead" ? 0.35 : 2.5, Math.max(k === "dead" ? 0.05 : 0.25, +v));
    store();
    emit("feel");
  };
  const setFamily = (family) => {
    if (family !== null && !(family in FAMILIES)) throw new Error(`gamepad: no family "${family}"`);
    saved.family = family;
    compile();
    store();
    emit("family");
  };

  // ---- Reading ----
  const actions = { held: 0, pressed: 0, released: 0 };
  const state = { connected: false, frame: 0, lx: 0, ly: 0, rx: 0, ry: 0, held: 0, pressed: 0, released: 0, actions,
    physical: 0, rawLx: 0, rawLy: 0, rawRx: 0, rawRy: 0, unknown: "", id: "", lastAt: 0 };
  // The pad normalized: 18 places' values (a trigger's depth, 1 or 0 for the rest) and the four stick axes.
  const value = new Float32Array(COUNT), axis = new Float32Array(4);
  let plugged = 0, physicalHeld = 0, blocked = 0, holding = false, active = -1, focused = true;
  // Map (destination-map.js) asks for neutral sticks as it closes: a stick still deflected from the menu moves nothing
  // until both have been sampled inside the dead zone. A pad's absence is not such a sample, so the requirement waits.
  let blockedAxes = false;
  let context = "foot", menuOpen = null, capture = null, entryHeld = 0, sentHeld = 0, menuRepeat = 0, menuDir = 0;
  window.addEventListener("gamepadconnected", () => { plugged++; });
  window.addEventListener("gamepaddisconnected", (e) => {
    plugged = Math.max(0, plugged - 1);
    if (e.gamepad.index === active && state.connected) disconnected();
  });
  window.addEventListener("blur", () => { focused = false; });
  window.addEventListener("focus", () => { focused = true; });
  // A device's profile key, worked out once per id: a non-standard pad is asked about every read.
  const profileKeys = new Map();
  const keyOf = (id) => {
    let k = profileKeys.get(id);
    if (k === undefined) { k = profileKey(id); profileKeys.set(id, k); }
    return k;
  };
  const profileFor = (pad) => pad.mapping === "standard" ? null : saved.profiles[keyOf(pad.id)] || null;
  const usable = (pad) => !!pad && pad.connected && (pad.mapping === "standard" || !!profileFor(pad));
  // Each slot's raw buttons at the last read (the first 32) and whether this read pressed one afresh. Another pad
  // takes over only on a fresh press while the current one has been still for TWIN_READS reads: a button held on
  // both, or a press that Steam's twin mirrors in the same read or the next, never trades places.
  const SLOTS = 16, TWIN_READS = 3;
  const lastRaw = new Uint32Array(SLOTS), fresh = new Uint8Array(SLOTS);
  let activeStill = TWIN_READS;
  const readRaw = (pad, i) => {
    const buttons = pad.buttons, n = Math.min(32, buttons.length);
    let raw = 0;
    for (let b = 0; b < n; b++) if (buttons[b].pressed) raw |= 1 << b;
    fresh[i] = raw & ~lastRaw[i] ? 1 : 0;
    lastRaw[i] = raw;
  };
  // The pad to read: one pressed afresh that isn't the current one, once the current one is still; then the current
  // one while it stays; then the first usable one. Switching restarts trigger hysteresis, which belongs to the old pad.
  // A pad the page can't read yet is named in `unknown` the moment a button is pressed on it.
  const pick = () => {
    const pads = navigator.getGamepads(), count = Math.min(SLOTS, pads.length);
    for (let i = 0; i < count; i++) { if (pads[i] && pads[i].connected) readRaw(pads[i], i); else fresh[i] = lastRaw[i] = 0; }
    const current = active >= 0 && active < count && usable(pads[active]);
    activeStill = current && lastRaw[active] ? 0 : Math.min(TWIN_READS, activeStill + 1);
    let fallback = -1;
    for (let i = 0; i < count; i++) {
      const pad = pads[i];
      if (!pad || !pad.connected) continue;
      if (!usable(pad)) { if (fresh[i] && state.unknown !== pad.id) { state.unknown = pad.id; emit("unknown"); } continue; }
      if (i !== active && fresh[i] && (!current || activeStill >= TWIN_READS)) { switchTo(i, pad); activeStill = 0; return pad; }
      if (fallback < 0) fallback = i;
    }
    // A different controller can take the same slot: it is a new pad, with its own family.
    if (active >= 0 && usable(pads[active])) { if (pads[active].id !== state.id) switchTo(active, pads[active]); return pads[active]; }
    if (active !== fallback) { physicalHeld = 0; if (fallback >= 0) switchTo(fallback, pads[fallback]); else active = -1; }
    return active >= 0 ? pads[active] : null;
  };
  const switchTo = (i, pad) => {
    active = i;
    physicalHeld = 0;
    state.id = pad.id;
    const family = familyOf(pad.id), changed = family !== detected;
    detected = family;
    if (state.unknown === pad.id) state.unknown = "";
    if (changed && !saved.family) compile();
    emit("device");
  };
  // The pad play reads, for vibration and the controller screen.
  const current = () => {
    if (!plugged || active < 0) return null;
    const pad = navigator.getGamepads()[active];
    return pad && pad.connected ? pad : null;
  };
  // A hat d-pad steps through eight values two sevenths apart, so a learned direction also takes its two diagonals.
  const HAT_SPAN = 16 / 7, HAT_NEAR = 0.33;
  const normalize = (pad) => {
    const profile = profileFor(pad), b = pad.buttons, a = pad.axes;
    if (!profile) {
      const count = Math.min(COUNT, b.length);
      for (let i = 0; i < count; i++) value[i] = i === LT || i === RT ? b[i].value : b[i].pressed ? 1 : 0;
      for (let i = count; i < COUNT; i++) value[i] = 0;
      for (let i = 0; i < 4; i++) axis[i] = a[i] || 0;
      return;
    }
    for (let i = 0; i < COUNT; i++) {
      const m = profile.map[i];
      if (!m) { value[i] = 0; continue; }
      if (m.k === "b") { const x = b[m.i]; value[i] = !x ? 0 : i === LT || i === RT ? x.value : x.pressed ? 1 : 0; continue; }
      const v = a[m.i];
      if (v === undefined || Math.abs(v) > 1.05) { value[i] = 0; continue; }
      if (m.k === "h") {
        let d = Math.abs(v - m.at) % HAT_SPAN;
        if (d > HAT_SPAN / 2) d = HAT_SPAN - d;
        value[i] = d < HAT_NEAR ? 1 : 0;
      } else {
        const span = m.v > 0 ? 1 - m.rest : 1 + m.rest;
        value[i] = Math.min(1, Math.max(0, (v - m.rest) * m.v / (span || 1)));
      }
    }
    for (let i = 0; i < 4; i++) {
      const m = profile.axes[i];
      axis[i] = m ? (a[m.i] || 0) * m.v : a[i] || 0;
    }
  };
  // Past the dead zone a stick's travel rescales to 0..1 (squared when `curve`); the factor for both of its axes.
  const scale = (x, y, curve) => {
    const m = Math.hypot(x, y), dead = feel.dead;
    if (m <= dead) return 0;
    const s = Math.min(1, (m - dead) / (1 - dead));
    return (curve ? s * s : s) / m;
  };
  const toEntries = (bits) => {
    const table = tables[context];
    let out = 0;
    for (let i = 0; bits; i++, bits >>>= 1) if (bits & 1) out |= table[i];
    return out;
  };
  const toActions = (entries) => {
    const map = natives[context];
    let out = 0;
    for (let i = 0; entries; i++, entries >>>= 1) if (entries & 1) out |= map[i];
    return out;
  };
  // Aim as a toggle: each press flips the latch, which the readers see as the button held.
  let aimLatch = false;
  // A delivered key, as the keyboard sends it: `code` filled in for handlers that read it, Shift and Control flagged.
  // A key named "shift+s" comes with Shift held, as a keyboard sends it.
  const codeOf = (k) => k === " " ? "Space" : k.length === 1 ? (/\d/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`) : k;
  const send = (type, spec) => {
    if (typeof document === "undefined" || !document.body) return;
    const shift = spec.startsWith("shift+"), k = shift ? spec.slice(6).toUpperCase() : spec;
    const e = new KeyboardEvent(type, { key: k, code: codeOf(k), bubbles: true, cancelable: true, shiftKey: shift });
    Object.defineProperty(e, "pad", { value: true });
    document.body.dispatchEvent(e);
  };
  // Let go of every delivered key still down, as a keyboard would when its keys come up.
  const releaseSent = () => {
    if (!sentHeld) return;
    const list = keys[context];
    for (let i = 0, bits = sentHeld; bits; i++, bits >>>= 1) if (bits & 1 && list[i]) send("keyup", list[i]);
    sentHeld = 0;
  };
  const deliverKeys = (pressed, released) => {
    const list = keys[context];
    for (let i = 0, bits = released; bits; i++, bits >>>= 1) if (bits & 1 && sentHeld & 1 << i) { sentHeld &= ~(1 << i); send("keyup", list[i]); }
    for (let i = 0, bits = pressed; bits; i++, bits >>>= 1) if (bits & 1 && list[i]) { sentHeld |= 1 << i; send("keydown", list[i]); }
  };
  // Menus: a d-pad direction or the stick moves focus, repeating while held (times in seconds); the rest are one press each.
  const MENU_FIRST = 0.38, MENU_EVERY = 0.12, MENU_STICK = 0.6;
  const menuVerb = (verb) => { const f = BL.padFocus; if (f) f.verb(verb); };
  const deliverMenu = (pressed) => {
    const list = CONTEXTS.menus.entries;
    for (let i = 0, bits = pressed; bits; i++, bits >>>= 1) if (bits & 1 && list[i].menu) menuVerb(list[i].menu);
  };
  // The right stick scrolls the layer, at up to SCROLL_SPEED pixels a second past the dead zone.
  const SCROLL_SPEED = 900;
  let scrollAt = 0;
  const menuStick = (now) => {
    const dt = scrollAt ? Math.min(0.1, now - scrollAt) : 0, ry = state.rawRy;
    scrollAt = now;
    if (Math.abs(ry) > feel.dead && dt) {
      const f = BL.padFocus, s = (Math.abs(ry) - feel.dead) / (1 - feel.dead);
      if (f) f.scroll(Math.sign(ry) * s * s * SCROLL_SPEED * dt);
    }
    const x = state.rawLx, y = state.rawLy;
    const dir = Math.abs(x) < MENU_STICK && Math.abs(y) < MENU_STICK ? 0 : Math.abs(x) > Math.abs(y) ? (x > 0 ? 4 : 3) : (y > 0 ? 1 : 2);
    const held = entryHeld & 0x3c;
    const d = dir || (held & 4 ? 1 : held & 8 ? 2 : held & 16 ? 3 : held & 32 ? 4 : 0);
    if (d !== menuDir) {
      menuDir = d;
      menuRepeat = now + MENU_FIRST;
      if (dir && d) menuVerb(["", "up", "down", "left", "right"][d]);
      return;
    }
    if (d && now >= menuRepeat) { menuRepeat = now + MENU_EVERY; menuVerb(["", "up", "down", "left", "right"][d]); }
  };
  let wanted = "foot";
  const contextNow = () => menuOpen && menuOpen() ? "menus" : wanted;
  const setContext = (id) => {
    if (!(id in CONTEXTS) || id === "menus") throw new Error(`gamepad: no play context "${id}"`);
    wanted = id;
  };
  // Move to the context in force now: whatever the old one had down is let go of first, and buttons held from before
  // must come up before they mean anything here. A press made this very read counts in the new context.
  const settleContext = (fresh) => {
    const next = contextNow();
    if (next === context) return;
    releaseSent();
    context = next;
    entryHeld = 0;
    menuDir = 0;
    blocked |= physicalHeld & ~fresh;
    state.held &= ~blocked;
    if (actions.held) { actions.released = actions.held; actions.held = actions.pressed = 0; state.frame++; }
  };
  const neutral = () => {
    const changed = state.lx || state.ly || state.rx || state.ry || state.held || state.pressed || state.released;
    state.lx = state.ly = state.rx = state.ry = state.held = state.pressed = state.released = 0;
    actions.held = actions.pressed = actions.released = 0;
    entryHeld = 0;
    aimLatch = false;
    releaseSent();
    if (changed) state.frame++;
  };
  const publish = () => {
    const prev = entryHeld, now = toEntries(state.held);
    entryHeld = now;
    const pressed = now & ~prev, released = prev & ~now;
    let held = toActions(now), down = toActions(pressed);
    if (feel.aimToggle) {
      if (down & ACTION.aim) aimLatch = !aimLatch;
      held = aimLatch ? held | ACTION.aim : held & ~ACTION.aim;
      down = aimLatch ? down : down & ~ACTION.aim;
    }
    actions.pressed = down & ~actions.held;
    actions.released = actions.held & ~held;
    actions.held = held;
    if (context === "menus") deliverMenu(pressed);
    else deliverKeys(pressed, released);
  };
  const disconnected = () => {
    state.connected = false;
    neutral();
    emit("disconnected");
  };
  const poll = () => {
    const pad = plugged && focused ? pick() : null;
    const was = state.connected;
    state.connected = !!pad;
    if (was !== state.connected) emit("device");
    if (!pad) {
      physicalHeld = blocked = 0;
      state.physical = 0;
      state.rawLx = state.rawLy = state.rawRx = state.rawRy = 0;
      if (holding) { neutral(); return; }
      if (!state.held && !state.lx && !state.ly && !state.rx && !state.ry) return;
      state.lx = state.ly = state.rx = state.ry = 0;
      state.released = state.held;
      state.pressed = state.held = 0;
      publish();
      state.frame++;
      return;
    }
    normalize(pad);
    // The triggers are analogue: held past one depth, let go below a shallower one, so a half press never chatters.
    let held = 0;
    for (let i = 0; i < COUNT; i++) {
      const bit = 1 << i;
      if (i === LT || i === RT ? value[i] > (physicalHeld & bit ? TRIGGER_OFF : TRIGGER_ON) : value[i] > 0.5) held |= bit;
    }
    const swap = feel.swap;
    state.rawLx = swap ? axis[2] : axis[0]; state.rawLy = swap ? axis[3] : axis[1];
    state.rawRx = swap ? axis[0] : axis[2]; state.rawRy = swap ? axis[1] : axis[3];
    // A game that reads only arrow keys takes the left stick as the d-pad, held past one depth, let go below another.
    if (CONTEXTS[contextNow()].stickKeys && !capture) {
      const x = state.rawLx, y = state.rawLy, on = (bit, v) => v > (physicalHeld & bit ? STICK_OFF : STICK_ON) ? bit : 0;
      held |= on(BUTTON.up, -y) | on(BUTTON.down, y) | on(BUTTON.left, -x) | on(BUTTON.right, x);
    }
    const fresh = held & ~physicalHeld;
    physicalHeld = state.physical = held;
    if (fresh) state.lastAt = typeof performance === "undefined" ? 0 : performance.now();
    // The controller screen listens to raw presses while it waits for one; nothing reaches play meanwhile.
    if (capture) { if (fresh) capture(fresh); blocked = held; if (state.held || state.lx || state.ly) neutral(); return; }
    // View and Menu together open the controller screen from anywhere.
    if (fresh & (BUTTON.view | BUTTON.menu) && (held & (BUTTON.view | BUTTON.menu)) === (BUTTON.view | BUTTON.menu)) {
      blocked = held;
      neutral();
      emit("settings");
      return;
    }
    blocked &= held;
    if (holding) { blocked = held; neutral(); return; }
    settleContext(fresh);
    held &= ~blocked;
    if (blockedAxes && Math.hypot(state.rawLx, state.rawLy) <= feel.dead && Math.hypot(state.rawRx, state.rawRy) <= feel.dead) blockedAxes = false;
    let k = blockedAxes ? 0 : scale(state.rawLx, state.rawLy, false);
    state.lx = state.rawLx * k; state.ly = -state.rawLy * k;
    k = blockedAxes ? 0 : scale(state.rawRx, state.rawRy, true);
    state.rx = state.rawRx * k * (feel.invertX ? -1 : 1); state.ry = -state.rawRy * k * (feel.invertY ? -1 : 1);
    if (context === "menus") { state.lx = state.ly = state.rx = state.ry = 0; menuStick(performance.now() / 1000); }
    const pressed = held & ~state.held, released = state.held & ~held;
    if (!pressed && !released && !state.pressed && !state.released) return;
    state.pressed = pressed; state.released = released; state.held = held;
    publish();
    state.frame++;
  };
  // Keep reading physical buttons behind an entry hold, but never publish an action from it. A held button must be
  // released and pressed again afterwards; trigger hysteresis follows the physical state, not the muted one.
  const hold = (on) => {
    on = !!on;
    if (holding === on) return;
    if (!on) poll(); // Consume the current hardware state even when the hold ended between display frames.
    holding = on;
    blocked |= physicalHeld;
    neutral();
  };
  // `requireNeutral()`: publish no stick movement until both sticks have rested inside the dead zone (Map closing).
  const requireNeutral = () => { blockedAxes = true; state.lx = state.ly = state.rx = state.ry = 0; };
  // A key pressed and let go, as the pad delivers one: what a lost controller presses to pause a game.
  const tap = (spec) => { send("keydown", spec); send("keyup", spec); };
  // `setMenu(fn)`: fn says whether a menu layer is open, which hands the pad to the Menus context.
  const setMenu = (fn) => { menuOpen = fn; };
  // `listen(fn)` hands raw presses (a mask of places) to fn instead of play until `listen(null)`.
  const listen = (fn) => { capture = fn; if (!fn) blocked |= physicalHeld; };
  // What the guided setup learns from: the current pad, whatever its mapping.
  const raw = () => {
    const pads = plugged ? navigator.getGamepads() : [];
    if (active >= 0 && pads[active] && pads[active].connected) return pads[active];
    for (const pad of pads) if (pad && pad.connected && pad.id === state.unknown) return pad;
    for (const pad of pads) if (pad && pad.connected) return pad;
    return null;
  };
  // `learn(id, profile)` saves a profile for a non-standard pad (`map`: 18 places, `axes`: lx, ly, rx, ry).
  const learn = (id, profile) => {
    if (!okProfile(profile)) throw new Error("gamepad: bad profile");
    saved.profiles[keyOf(id)] = profile;
    store();
    if (state.unknown === id) state.unknown = "";
    emit("device");
  };
  const forget = (id) => { delete saved.profiles[profileKey(id)]; store(); emit("device"); };

  // Vibration, for a pad that has it (Chrome and Edge's `vibrationActuator`, Firefox's `hapticActuators`; anywhere else
  // nothing happens): `rumble(strong, weak, ms)` runs both motors for `ms`, each 0..1 times `strength`, the visitor's
  // setting (localStorage `ooga-vibration`, 0..1, full when unset), a new effect taking over from the one playing, and
  // `stop` ends it. Each call costs a `getGamepads` read and the browser's own effect, so a reader calls it a few times
  // a second, not every frame. It returns whether the pad could vibrate.
  const VIBRATION_KEY = "ooga-vibration", RUMBLE = { startDelay: 0, duration: 0, strongMagnitude: 0, weakMagnitude: 0 }, quiet = () => {};
  let strength = 1;
  try {
    const kept = localStorage.getItem(VIBRATION_KEY), v = Number(kept);
    if (kept !== null && v >= 0 && v <= 1) strength = v;
  } catch {
    strength = 1;
  }
  const settle = (done) => { if (done && done.catch) done.catch(quiet); };
  const canRumble = () => {
    const pad = current();
    return !!pad && !!(pad.vibrationActuator && pad.vibrationActuator.playEffect || pad.hapticActuators && pad.hapticActuators[0]);
  };
  const rumble = (strong, weak, ms) => {
    const pad = current();
    if (!pad || strength <= 0) return false;
    const s = Math.min(1, Math.max(0, strong)) * strength, w = Math.min(1, Math.max(0, weak)) * strength;
    const act = pad.vibrationActuator, haptic = pad.hapticActuators && pad.hapticActuators[0];
    if (act && act.playEffect) {
      RUMBLE.duration = ms; RUMBLE.strongMagnitude = s; RUMBLE.weakMagnitude = w;
      settle(act.playEffect("dual-rumble", RUMBLE));
    } else if (haptic && haptic.pulse) settle(haptic.pulse(Math.max(s, w), ms));
    else return false;
    return true;
  };
  const stop = () => {
    const pad = current(), act = pad && pad.vibrationActuator, haptic = pad && pad.hapticActuators && pad.hapticActuators[0];
    if (act && act.reset) settle(act.reset());
    else if (haptic && haptic.pulse) settle(haptic.pulse(0, 1));
  };
  const setStrength = (v) => {
    strength = Math.min(1, Math.max(0, v));
    try {
      localStorage.setItem(VIBRATION_KEY, String(strength));
    } catch {
    }
    if (!strength) stop();
    emit("feel");
    return strength;
  };
  // A place's name on the current (or a given) family's controller.
  const glyph = (place, family = familyNow()) => NAMES[family][typeof place === "number" ? place : PLACE.indexOf(place)];

  BL.gamepad = { BUTTON, PLACE, ACTION, RESERVED, FIXED, CONTEXTS, DEFAULT_BINDINGS, FAMILIES, NAMES, MENU,
    state, feel, poll, hold, requireNeutral, bind, bindings, resetBindings, snapshot, restore, setFeel, setFamily, setContext, setMenu, listen,
    raw, learn, forget, familyOf, nameOf, profileKey, glyph, subscribe, tap,
    rumble, stop, setStrength, canRumble, get strength() { return strength; },
    get family() { return familyNow(); }, get detectedFamily() { return detected; }, get familyOverride() { return saved.family; },
    get context() { return context; }, get wantedContext() { return wanted; }, profileOf: (id) => saved.profiles[profileKey(id)] || null };
})();
