(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // The first pad in the standard mapping (an Xbox pad in Chrome, Edge, Firefox and Safari), read once a frame by the
  // director's step. `BUTTON` is each button's bit in `held`, `pressed` and `released`; the last two are this read's
  // edges, and `frame` counts the reads that changed anything, so a reader acts on an edge once however often it
  // looks. Sticks are -1..1 with y positive pushed up, past a radial dead zone; the right stick's travel is squared
  // for fine aim. `connected` is whether the last read found a pad, for words that name its buttons.
  // `navigator.getGamepads` returns a new array on every call, so it is read only while a standard pad is plugged in
  // and a page without one (or with only a wheel or flight stick) pays nothing.
  const BUTTON = { a: 1, b: 2, x: 4, y: 8, lb: 16, rb: 32, lt: 64, rt: 128, view: 256, menu: 512, ls: 1024, rs: 2048 };
  const COUNT = 12, LT = 6, RT = 7, DEAD = 0.18, TRIGGER_ON = 0.5, TRIGGER_OFF = 0.3;
  const state = { connected: false, frame: 0, lx: 0, ly: 0, rx: 0, ry: 0, held: 0, pressed: 0, released: 0 };
  let plugged = 0;
  window.addEventListener("gamepadconnected", (e) => { if (e.gamepad.mapping === "standard") plugged++; });
  window.addEventListener("gamepaddisconnected", (e) => { if (e.gamepad.mapping === "standard") plugged = Math.max(0, plugged - 1); });
  const first = () => {
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (pad && pad.connected && pad.mapping === "standard") return pad;
    }
    return null;
  };
  // Past the dead zone a stick's travel rescales to 0..1 (squared when `curve`); the factor for both of its axes.
  const scale = (x, y, curve) => {
    const m = Math.hypot(x, y);
    if (m <= DEAD) return 0;
    const s = Math.min(1, (m - DEAD) / (1 - DEAD));
    return (curve ? s * s : s) / m;
  };
  const poll = () => {
    const pad = plugged ? first() : null;
    state.connected = !!pad;
    if (!pad) {
      if (!state.held && !state.lx && !state.ly && !state.rx && !state.ry) return;
      state.lx = state.ly = state.rx = state.ry = 0;
      state.released = state.held;
      state.pressed = state.held = 0;
      state.frame++;
      return;
    }
    const a = pad.axes;
    let k = scale(a[0], a[1], false);
    state.lx = a[0] * k; state.ly = -a[1] * k;
    k = scale(a[2], a[3], true);
    state.rx = a[2] * k; state.ry = -a[3] * k;
    // The triggers are analogue: held past one depth, let go below a shallower one, so a half press never chatters.
    let held = 0;
    for (let i = 0; i < COUNT; i++) {
      const b = pad.buttons[i], bit = 1 << i;
      if (i === LT || i === RT ? b.value > (state.held & bit ? TRIGGER_OFF : TRIGGER_ON) : b.pressed) held |= bit;
    }
    const pressed = held & ~state.held, released = state.held & ~held;
    if (!pressed && !released && !state.pressed && !state.released) return;
    state.pressed = pressed; state.released = released; state.held = held;
    state.frame++;
  };
  BL.gamepad = { BUTTON, state, poll };
})();
