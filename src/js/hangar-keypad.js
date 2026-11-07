// The Lightning Jet Hangar's door keypads: the one by the control room's door and one by each crew room's on the right
// wall (`hangarModels.controlRoom().keypad`, `sideRooms()[i].keypad`), each a node of its own on `keypad()`. Beside
// one on the catwalk, in front of it, the act button reads KEYPAD (`actLabel`), and Space there (`useNear`), the act
// button or a tap on it (`press`) opens it on screen (`#hangar-keypad`): the room's name, a screen, and twelve keys,
// pressed by tap or click or typed (0-9, Backspace, Delete, Enter; `onKey`), each with its beep. Every code is
// refused: ENT checks it a moment, beeping, then the screen says ACCESS DENIED, the panel shakes with a buzz and the
// keypad on the wall turns red (`denied`); the third refusal in a row locks that keypad out for `LOCK` seconds, its
// screen counting down and the wall's keypad red until it lets go, open or not. While the panel is open the Ooga
// stands still (`hold`); a press outside it, its close button or Escape closes it (`hud.dismissOutside`). On a wide
// screen it opens on the side away from the keypad on the wall, so the Ooga and the keypad stay in view. Its sound
// is `hangarAudio`'s `beep` and `denied`.
//
// `create({ audio, hud, hold, across, pads })`: the hangar's sound, its HUD, `hold(on)` to still the Ooga while the
// panel is open, `across(x, y, z)` how far across the screen a point shows (0 its left edge, 1 its right), and the
// keypads, each { x, y, z, turn, floor, name }: its back's middle on the wall, the way it faces (+x
// turned by `turn`), the floor in front of it and the room it opens. Returns `nodes` (the scene stands them in the
// hall and dims them with its glass), `near` (the keypad the driven Ooga stands at, or -1), `open` (the one on screen,
// or -1), `actLabel`, `useNear`, `press(i)`, `onKey(e)`, `update(dt, driven)`, `liveGeometry(set)`, `dispose` and
// `debug`. Allocates nothing a frame.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode } = BL.scene;
  const HM = BL.hangarModels;

  // How far in front of a keypad an Ooga reaches it (m, across the floor) and how far its feet may stand off that floor.
  const REACH = 1.4, FEET = 0.5;
  // The longest code, how long ENT checks one (s) and when it beeps meanwhile, how long ACCESS DENIED stands, how many
  // refusals in a row lock it out and for how long (s).
  const MAX = 6, CHECK = 0.95, CHECK_BEEPS = [0.3, 0.6], DENY = 1.6, TRIES = 3, LOCK = 12;
  // Each sound's pitch (Hz) and length (s): a key, ENT, a key refused, a checking tick, a wake as it opens.
  const TONE = { key: [1480, 0.06], enter: [1760, 0.08], refuse: [420, 0.12], tick: [1180, 0.05], wake: [1980, 0.05] };
  // What the screen says, made once: the code as dots, checking with its dots, and the lockout's countdown.
  const DOTS = Array.from({ length: MAX + 1 }, (_, n) => (n ? "● ".repeat(n).trim() : "ENTER CODE"));
  const CHECKING = ["CHECKING", "CHECKING.", "CHECKING..", "CHECKING..."];
  const LOCKED = Array.from({ length: LOCK + 1 }, (_, n) => `LOCKED · ${n}`);

  const create = ({ audio, hud, hold, across, pads }) => {
    const K = HM.keypad(), panel = document.getElementById("hangar-keypad"), screen = document.getElementById("hangar-keypad-screen");
    const name = document.getElementById("hangar-keypad-name"), shut = document.getElementById("hangar-keypad-close");
    const keys = panel.querySelectorAll("[data-key]"), note = panel.querySelector("[data-coarse]");
    if (window.matchMedia("(pointer: coarse)").matches) note.textContent = note.dataset.coarse;
    const nodes = pads.map((p) => createNode({ position: { x: p.x, y: p.y, z: p.z }, rotation: { x: 0, y: p.turn, z: 0 }, geometry: K.body, sightHidden: true, depthBias: -0.3 }));
    // Each keypad's refusals in a row and the clock it is locked out until.
    const fails = new Float32Array(pads.length), until = new Float64Array(pads.length);
    let near = -1, open = -1, code = 0, state = "idle", t = 0, clock = 0, shown = "", ticks = 0;

    const beep = (tone) => {
      const p = pads[open];
      audio.beep(p.x, p.y, p.z, TONE[tone][0], TONE[tone][1]);
    };
    const locked = (i) => until[i] > clock;
    const go = (to) => {
      state = to;
      t = 0;
      ticks = 0;
      panel.dataset.state = to;
    };
    const text = () => {
      if (state === "check") return CHECKING[Math.min(CHECKING.length - 1, Math.floor(t / (CHECK / CHECKING.length)))];
      if (state === "deny") return "ACCESS DENIED";
      if (state === "lock") return LOCKED[Math.max(0, Math.ceil(until[open] - clock))];
      return DOTS[code];
    };
    const paint = () => {
      const s = text();
      if (s !== shown) { shown = s; screen.textContent = s; }
    };

    // The keys, by name: a digit adds to the code, `back` takes the last one off, `clear` all of them, and `enter`
    // checks it. A digit pressed while ACCESS DENIED stands starts a new code; nothing is taken while it checks or
    // while it is locked out, its last ACCESS DENIED too.
    const key = (k) => {
      if (open < 0) return false;
      if (state === "check" || locked(open)) { beep("refuse"); return true; }
      if (state === "deny") { code = 0; go("idle"); }
      if (k === "enter") {
        if (!code) beep("refuse");
        else { beep("enter"); go("check"); }
      } else if (k === "clear" || k === "back") {
        code = k === "clear" ? 0 : Math.max(0, code - 1);
        beep("key");
      } else if (code >= MAX) beep("refuse");
      else { code++; beep("key"); }
      paint();
      return true;
    };
    const onClick = (e) => {
      key(e.currentTarget.dataset.key);
      panel.focus();
    };

    const press = (i = near) => {
      if (i < 0 || open >= 0) return false;
      open = i;
      code = 0;
      go(locked(i) ? "lock" : "idle");
      const p = pads[i];
      panel.dataset.side = across(p.x, p.y, p.z) > 0.5 ? "left" : "right";
      name.textContent = p.name;
      panel.setAttribute("aria-label", `${pads[i].name} door keypad`);
      panel.show();
      panel.focus();
      paint();
      hold(true);
      beep("wake");
      return true;
    };
    const close = () => {
      if (open < 0) return;
      panel.close();
      if (state !== "lock") go("idle");
      open = -1;
      hold(false);
    };
    const useNear = () => press();
    const actLabel = () => (near >= 0 && open < 0 ? "KEYPAD" : null);
    // The keys while it is open, and every other key held from the scene. The panel keeps the focus while it is open
    // (a `<dialog>`, which the director, the HUD and Tess leave alone), so its keys come to it first (`onPanelKey`),
    // Escape closing it; the scene hands on any that reach it with the focus elsewhere, where Escape is the HUD's,
    // which closes it too. Enter or Space on one of its buttons presses that button.
    const onKey = (e) => {
      if (open < 0) return false;
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return true;
      if (e.key >= "0" && e.key <= "9" && e.key.length === 1) key(e.key);
      else if (e.key === "Enter") key("enter");
      else if (e.key === "Backspace") key("back");
      else if (e.key === "Delete") key("clear");
      else return true;
      e.preventDefault();
      return true;
    };
    const onPanelKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.target !== panel && (e.key === "Enter" || e.key === " ")) return;
      onKey(e);
    };

    // The nearest keypad an Ooga standing at (x, z), its feet at `feet`, reaches from in front of it, or -1.
    const reaches = (x, z, feet) => {
      let best = -1, bestD = REACH;
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i], dx = x - p.x, dz = z - p.z;
        if (Math.abs(feet - p.floor) > FEET || dx * Math.cos(p.turn) - dz * Math.sin(p.turn) <= 0) continue;
        const d = Math.hypot(dx, dz);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    };
    const update = (dt, driven) => {
      clock += dt;
      if (driven && !driven.camp.seat) {
        const p = driven.root.position;
        near = reaches(p.x, p.z, p.y - driven.baseY);
      } else near = -1;
      for (let i = 0; i < pads.length; i++) {
        const red = locked(i) || (i === open && state === "deny");
        nodes[i].geometry = red ? K.denied : K.body;
      }
      if (open < 0) return;
      t += dt;
      if (state === "check") {
        if (ticks < CHECK_BEEPS.length && t >= CHECK_BEEPS[ticks]) { ticks++; beep("tick"); }
        if (t >= CHECK) {
          code = 0;
          if (++fails[open] >= TRIES) { fails[open] = 0; until[open] = clock + LOCK + DENY; }
          go("deny");
          const p = pads[open];
          audio.denied(p.x, p.y, p.z);
          BL.gamepad.rumble(0.3, 0.5, 120);
        }
      } else if (state === "deny" && t >= DENY) go(locked(open) ? "lock" : "idle");
      else if (state === "lock" && !locked(open)) go("idle");
      paint();
    };

    for (const b of keys) b.addEventListener("click", onClick);
    shut.addEventListener("click", close);
    panel.addEventListener("keydown", onPanelKey);
    hud.dismissOutside(panel, close);
    return {
      nodes, actLabel, useNear, press, onKey, update,
      get near() { return near; },
      get open() { return open; },
      liveGeometry: (set) => { set.add(K.body); set.add(K.denied); },
      dispose: () => {
        close();
        for (const b of keys) b.removeEventListener("click", onClick);
        shut.removeEventListener("click", close);
        panel.removeEventListener("keydown", onPanelKey);
      },
      debug: {
        press, key, close,
        get near() { return near; }, get open() { return open; }, get state() { return state; }, get code() { return code; }, get screen() { return shown; },
        get fails() { return Array.from(fails); }, get locked() { return pads.map((_, i) => locked(i)); }
      }
    };
  };

  BL.hangarKeypad = { create, REACH, MAX, CHECK, DENY, TRIES, LOCK };
})();
