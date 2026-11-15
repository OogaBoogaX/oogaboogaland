(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // The controller screen (`#pad-settings`): a diagram of the player's own controller that lights as it is pressed and
  // shows each stick against its dead zone, one tab per context with every action's buttons, remap by pressing, a
  // conflict question with Swap focused, Undo, the feel settings and, for a controller the browser doesn't know, a
  // guided setup that learns it. Opened from the controls panel, View in any menu, View and Menu together anywhere,
  // and on its own for an unknown controller. It works the gamepad's own tables (`bind`, `setFeel`, `learn`), which
  // save themselves; a frame loop runs only while the dialog is open.
  const G = BL.gamepad, B = G.BUTTON, P = G.PLACE;
  const S = 0, E = 1, W = 2, N = 3, LB = 4, RB = 5, LT = 6, RT = 7, VIEW = 8, MENU = 9, LS = 10, RS = 11, UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15, HOME = 16, PAD = 17;
  const COLORS = { xbox: ["g-xa", "g-xb", "g-xx", "g-xy"], playstation: ["g-pcross", "g-pcircle", "g-psquare", "g-ptri"], stadia: ["g-xa", "g-xb", "g-xx", "g-xy"] };
  const CONTEXT_IDS = Object.keys(G.CONTEXTS);
  const STEPS = [[S, "the bottom face button"], [E, "the right face button"], [W, "the left face button"], [N, "the top face button"],
    [LB, "the left bumper"], [RB, "the right bumper"], [LT, "the left trigger"], [RT, "the right trigger"],
    [VIEW, "the small left middle button"], [MENU, "the small right middle button"], [LS, "the left stick: click it in"], [RS, "the right stick: click it in"],
    [UP, "d-pad up"], [DOWN, "d-pad down"], [LEFT, "d-pad left"], [RIGHT, "d-pad right"],
    [-1, "the left stick: push it right"], [-2, "the left stick: push it down"], [-3, "the right stick: push it right"], [-4, "the right stick: push it down"]];
  const NS = "http://www.w3.org/2000/svg";
  const create = ({ ready, current, hold }) => {
    const $ = (id) => document.getElementById(id);
    const dialog = $("pad-settings"), svg = $("pad-diagram"), tabs = $("pad-tabs"), list = $("pad-list"), hintEl = $("pad-hint");
    const toastEl = $("pad-toast"), toastText = $("pad-toast-text"), undoButton = $("pad-toast-undo");
    let tab = "foot", capture = null, setup = null, raf = 0, owner = null, undo = null, toastTimer = 0;
    const nodes = {};
    let sticks = [];
    const family = () => G.family;
    const name = (i) => G.glyph(i);
    const def = () => G.CONTEXTS[tab];
    const glyph = (i) => {
      const el = document.createElement("span");
      const colors = COLORS[family()];
      el.className = "pad-glyph" + (i < 4 ? " round" : "") + (colors && i < 4 ? " " + colors[i] : "");
      el.textContent = name(i);
      return el;
    };
    const stickGlyph = (side) => {
      const el = document.createElement("span");
      el.className = "pad-glyph stick";
      el.textContent = side ? "R" : "L";
      el.title = side ? "Right stick" : "Left stick";
      return el;
    };
    const mk = (tag, attrs, parent) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      (parent || svg).appendChild(n);
      return n;
    };
    // The diagram in the family's layout: PlayStation's d-pad high and its sticks low, the others' offset sticks.
    const draw = () => {
      svg.replaceChildren();
      for (const k in nodes) delete nodes[k];
      const ps = family() === "playstation";
      mk("path", { class: "body", d: "M96 64 Q200 50 304 64 Q352 70 366 118 Q388 196 372 232 Q356 262 326 252 Q300 242 282 206 Q240 196 200 196 Q160 196 118 206 Q100 242 74 252 Q44 262 28 232 Q12 196 34 118 Q48 70 96 64 Z" });
      const ctl = (i, shape, x, y, w, h, small) => {
        const g = mk("g", { class: "ctl" + (small ? " small" : ""), "data-i": i });
        if (shape === "c") mk("circle", { class: "cap", cx: x, cy: y, r: w }, g);
        else mk("rect", { class: "cap", x: x - w / 2, y: y - h / 2, width: w, height: h, rx: Math.min(8, h / 2) }, g);
        const t = mk("text", { x, y }, g);
        t.textContent = i === LS || i === RS ? "" : name(i);
        if (COLORS[family()] && i < 4) t.classList.add(COLORS[family()][i]);
        nodes[i] = g;
        return g;
      };
      ctl(LT, "r", 92, 20, 58, 22); ctl(RT, "r", 308, 20, 58, 22);
      ctl(LB, "r", 92, 46, 70, 18, true); ctl(RB, "r", 308, 46, 70, 18, true);
      ctl(N, "c", 304, 94, 13); ctl(E, "c", 330, 120, 13); ctl(W, "c", 278, 120, 13); ctl(S, "c", 304, 146, 13);
      const dp = ps ? [96, 120] : [150, 176], ls = ps ? [150, 178] : [96, 120], rs = [250, 178];
      ctl(UP, "r", dp[0], dp[1] - 19, 16, 18); ctl(DOWN, "r", dp[0], dp[1] + 19, 16, 18);
      ctl(LEFT, "r", dp[0] - 19, dp[1], 18, 16); ctl(RIGHT, "r", dp[0] + 19, dp[1], 18, 16);
      if (ps) ctl(PAD, "r", 200, 98, 74, 34, true);
      ctl(VIEW, "r", ps ? 140 : 172, ps ? 84 : 110, 34, 14, true); ctl(MENU, "r", ps ? 260 : 228, ps ? 84 : 110, 34, 14, true);
      ctl(HOME, "c", 200, ps ? 140 : 84, 10, 0, true);
      sticks = [ls, rs].map(([x, y], side) => {
        const g = ctl(side ? RS : LS, "c", x, y, 24);
        const dead = mk("circle", { class: "dead", cx: x, cy: y, r: 0 }, g);
        const dot = mk("circle", { class: "stickdot", cx: x, cy: y, r: 6 }, g);
        const t = mk("text", { x, y: y + 34, class: "stick-name" }, g);
        t.textContent = side ? "R" : "L";
        return { x, y, dead, dot };
      });
      paintDead();
      paintUse();
    };
    const paintDead = () => { for (const s of sticks) s.dead.setAttribute("r", (24 * G.feel.dead).toFixed(1)); };
    // Dash the caps that do nothing in this tab, so free buttons are easy to spot.
    const paintUse = () => {
      const used = new Set([LS, RS]);
      for (const e of def().entries) if (e.stick === undefined) for (const n of G.bindings(e.id, tab)) used.add(P.indexOf(n));
      for (const i in nodes) nodes[i].classList.toggle("unused", !used.has(+i) && !(G.BUTTON[P[i]] & G.RESERVED));
    };
    const hint = (text) => { hintEl.textContent = text; };
    const idle = () => hint(capture ? "Waiting for a press…" : setup ? "" : G.state.connected ? "Press or click any button to see what it does here." : "Press any button on your controller, or click the picture.");
    const usersOf = (i) => def().entries.filter(e => e.stick === undefined ? G.bindings(e.id, tab).includes(P[i]) : (i === LS || i === RS) && e.stick === (i === RS ? 1 : 0));
    const hintFor = (i) => {
      for (const n of Object.values(nodes)) n.classList.remove("sel");
      for (const r of list.querySelectorAll(".pad-row.lit")) r.classList.remove("lit");
      if (nodes[i]) nodes[i].classList.add("sel");
      if (G.BUTTON[P[i]] & G.RESERVED) { hint(`${name(i)} is kept for your ${i === HOME ? "system" : "controller"}.`); return; }
      const users = usersOf(i);
      for (const e of users) { const row = list.querySelector(`.pad-row[data-action="${e.id}"]`); if (row) row.classList.add("lit"); }
      const what = i === LS ? "Left stick" : i === RS ? "Right stick" : name(i);
      hint(users.length ? `${what} · ${users.map(e => e.label).join(" · ")} in ${def().label}` : `${what} is free in ${def().label}. Pick an action and press Change to use it.`);
    };
    // ---- Tabs and rows ----
    for (const id of CONTEXT_IDS) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.textContent = G.CONTEXTS[id].label;
      b.dataset.tab = id;
      b.addEventListener("click", () => { tab = id; endCapture(); render(); });
      tabs.appendChild(b);
    }
    const render = () => {
      for (const b of tabs.children) b.setAttribute("aria-selected", String(b.dataset.tab === tab));
      list.replaceChildren();
      const d = def();
      if (d.note) { const p = document.createElement("p"); p.className = "pad-note"; p.textContent = d.note; list.appendChild(p); }
      for (const e of d.entries) {
        const row = document.createElement("div"), nm = document.createElement("div"), gl = document.createElement("div"), ch = document.createElement("button");
        row.className = "pad-row";
        row.dataset.action = e.id;
        nm.className = "pad-name";
        nm.textContent = e.label;
        if (e.note) { const s = document.createElement("small"); s.textContent = e.note; nm.appendChild(s); }
        gl.className = "pad-glyphs";
        if (e.stick !== undefined) gl.appendChild(stickGlyph(e.stick));
        else for (const n of G.bindings(e.id, tab)) gl.appendChild(glyph(P.indexOf(n)));
        if (!gl.childElementCount) { const none = document.createElement("span"); none.className = "pad-none"; none.textContent = "None"; gl.appendChild(none); }
        ch.type = "button";
        ch.className = "pad-change";
        ch.textContent = e.fixed ? "Fixed" : e.stick !== undefined ? "Swap" : "Change";
        ch.disabled = !!e.fixed;
        ch.setAttribute("aria-label", `${ch.textContent} ${e.label}`);
        ch.addEventListener("click", () => (e.stick !== undefined ? swapSticks() : startCapture(e.id)));
        row.append(nm, gl, ch);
        if (capture && capture.id === e.id) {
          row.classList.add("capture");
          const p = document.createElement("div");
          p.className = "pad-prompt";
          if (capture.conflict) {
            const other = d.entries.find(x => x.id === capture.conflict.with);
            p.append(`${name(capture.conflict.i)} already does ${other.label}. `);
            const swap = document.createElement("button"), keep = document.createElement("button");
            swap.type = keep.type = "button";
            swap.textContent = "Swap them";
            keep.textContent = "Keep it as it was";
            keep.className = "plain";
            swap.addEventListener("click", () => commit(capture.conflict.i, true));
            keep.addEventListener("click", endCapture);
            p.append(swap, keep);
            window.requestAnimationFrame(() => swap.focus());
          } else {
            p.id = "pad-capture-prompt";
            p.textContent = promptText(e);
          }
          row.appendChild(p);
        }
        list.appendChild(row);
      }
      for (const b of dialog.querySelectorAll("[data-family]")) b.setAttribute("aria-pressed", String((b.dataset.family || null) === (G.familyOverride || "") || !b.dataset.family && !G.familyOverride));
      paintUse();
      device();
    };
    const promptText = (e) => `Press the button you want for ${e.label} · ${name(MENU)} or Escape to cancel · ${Math.max(0, Math.ceil((capture.until - performance.now()) / 1000))}`;
    const device = () => {
      const id = G.state.id, unknown = G.state.unknown;
      $("pad-device-dot").classList.toggle("live", G.state.connected);
      $("pad-device-name").textContent = G.state.connected ? G.nameOf(id) : unknown ? G.nameOf(unknown) : "No controller yet";
      $("pad-device-sub").textContent = G.state.connected ? (G.profileOf(id) ? "Set up on this browser" : "Ready") : unknown ? "Needs a one-time setup" : "Press any button on your controller";
      const pad = G.raw();
      $("pad-setup-open").hidden = !pad || pad.mapping === "standard";
      $("pad-setup-open").textContent = pad && G.profileOf(pad.id) ? "Set up this controller again" : "Set up this controller";
    };
    // ---- Remap ----
    const toast = (text, before) => {
      toastText.textContent = text;
      toastEl.hidden = false;
      undo = before;
      undoButton.hidden = !before;
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { toastEl.hidden = true; undo = null; }, 5000);
    };
    undoButton.addEventListener("click", () => {
      if (undo) G.restore(undo);
      undo = null;
      toastEl.hidden = true;
      syncFeel();
      render();
    });
    const startCapture = (id) => {
      endSetup();
      capture = { id, armed: false, until: performance.now() + 6000, conflict: null };
      G.listen(onRaw);
      render();
      idle();
    };
    const endCapture = () => {
      if (!capture) return;
      capture = null;
      G.listen(null);
      render();
      idle();
    };
    // A press while waiting: the same button again changes nothing; a button another action uses asks first.
    const offer = (i) => {
      const e = def().entries.find(x => x.id === capture.id), now = G.bindings(e.id, tab);
      if (G.BUTTON[P[i]] & G.RESERVED) { hint(`${name(i)} belongs to your ${i === HOME ? "system" : "controller"}, so the game leaves it alone.`); return; }
      if (i === MENU) { endCapture(); hint("Nothing changed."); return; }
      if (now.length === 1 && now[0] === P[i]) { endCapture(); return; }
      const other = def().entries.find(x => x.id !== e.id && x.stick === undefined && G.bindings(x.id, tab).includes(P[i]));
      if (other && other.fixed) { hint(`${name(i)} is fixed to ${other.label}.`); return; }
      if (other) { capture.conflict = { i, with: other.id }; G.listen(null); render(); return; }
      commit(i, false);
    };
    const commit = (i, swap) => {
      const before = G.snapshot(), e = def().entries.find(x => x.id === capture.id), was = G.bindings(e.id, tab);
      if (swap) {
        const other = capture.conflict.with, theirs = G.bindings(other, tab).filter(n => n !== P[i]);
        G.bind(other, was.length ? [...new Set([...theirs, was[0]])] : theirs, tab);
      }
      G.bind(e.id, [P[i]], tab);
      capture = null;
      G.listen(null);
      render();
      idle();
      toast(swap ? `${e.label} is now ${name(i)}; swapped with the old button.` : `${e.label} is now ${name(i)}.`, before);
    };
    const swapSticks = () => {
      const before = G.snapshot();
      G.setFeel("swap", !G.feel.swap);
      syncFeel();
      toast(G.feel.swap ? "Sticks swapped: the right stick moves." : "Sticks back: the left stick moves.", before);
    };
    // Raw presses from the gamepad while waiting for one.
    const onRaw = (mask) => {
      if (setup) return;
      if (!capture || capture.conflict || !capture.armed) { if (capture && mask & B.menu) endCapture(); return; }
      let i = 0;
      while (!(mask & 1 << i)) i++;
      offer(i);
    };
    svg.addEventListener("click", (e) => {
      const g = e.target.closest(".ctl");
      if (!g) return;
      const i = +g.dataset.i;
      if (capture && !capture.conflict) { offer(i); return; }
      hintFor(i);
    });
    // ---- Feel ----
    const fields = {
      dead: [$("pad-dead"), (v) => `${Math.round(v * 100)}%`, 100],
      look: [$("pad-look"), (v) => `${v.toFixed(2)}×`, 100]
    };
    for (const k in fields) {
      const [input, fmt, scale] = fields[k];
      input.addEventListener("input", () => { G.setFeel(k, Number(input.value) / scale); $(`${input.id}-out`).textContent = fmt(G.feel[k]); if (k === "dead") paintDead(); });
    }
    const rumbleInput = $("pad-rumble");
    rumbleInput.addEventListener("input", () => { G.setStrength(Number(rumbleInput.value) / 100); $("pad-rumble-out").textContent = G.strength ? `${Math.round(G.strength * 100)}%` : "Off"; });
    for (const b of dialog.querySelectorAll("[data-feel]")) b.addEventListener("click", () => { G.setFeel(b.dataset.feel, b.dataset.value === "true"); syncFeel(); });
    for (const k of ["invertX", "invertY", "swap"]) $(`pad-${k}`).addEventListener("change", (e) => { G.setFeel(k, e.target.checked); });
    const syncFeel = () => {
      for (const k in fields) { const [input, fmt, scale] = fields[k]; input.value = String(Math.round(G.feel[k] * scale)); $(`${input.id}-out`).textContent = fmt(G.feel[k]); }
      rumbleInput.value = String(Math.round(G.strength * 100));
      $("pad-rumble-out").textContent = G.strength ? `${Math.round(G.strength * 100)}%` : "Off";
      for (const b of dialog.querySelectorAll("[data-feel]")) b.setAttribute("aria-pressed", String(G.feel[b.dataset.feel] === (b.dataset.value === "true")));
      for (const k of ["invertX", "invertY", "swap"]) $(`pad-${k}`).checked = G.feel[k];
      paintDead();
    };
    $("pad-rumble-test").addEventListener("click", () => {
      if (!G.strength) { toast("Vibration is off.", null); return; }
      if (!G.rumble(0.7, 0.7, 260)) toast("This controller or browser doesn't vibrate.", null);
    });
    for (const b of dialog.querySelectorAll("[data-family]")) b.addEventListener("click", () => { G.setFamily(b.dataset.family || null); draw(); render(); });
    $("pad-reset").addEventListener("click", () => {
      const before = G.snapshot();
      G.resetBindings(tab);
      render();
      toast(`${def().label} is back to the defaults.`, before);
    });
    $("pad-done").addEventListener("click", () => close());
    $("pad-close").addEventListener("click", () => close());
    // ---- Guided setup for a controller the browser doesn't know ----
    const showStep = () => {
      for (const n of Object.values(nodes)) n.classList.remove("target");
      $("pad-setup").hidden = !setup;
      if (!setup) { idle(); return; }
      if (setup.step >= STEPS.length) { finishSetup(); return; }
      const [i, what] = STEPS[setup.step];
      $("pad-setup-step").textContent = `Press ${what}`;
      $("pad-setup-bar").style.width = `${100 * setup.step / STEPS.length}%`;
      const at = i >= 0 ? i : i > -3 ? LS : RS;
      if (nodes[at]) nodes[at].classList.add("target");
    };
    const startSetup = () => {
      const pad = G.raw();
      if (!pad) return;
      endCapture();
      setup = { id: pad.id, step: 0, map: new Array(18).fill(null), axes: [null, null, null, null], base: null, wait: true };
      G.listen(() => {});
      showStep();
      $("pad-setup-skip").focus();
    };
    const endSetup = () => { if (!setup) return; setup = null; G.listen(null); showStep(); };
    const finishSetup = () => {
      const learned = setup.map.filter(Boolean).length + setup.axes.filter(Boolean).length;
      G.learn(setup.id, { map: setup.map, axes: setup.axes });
      setup = null;
      G.listen(null);
      showStep();
      render();
      toast(`Controller set up: ${learned} of ${STEPS.length} inputs learned.`, null);
    };
    const answer = (found) => {
      const [i] = STEPS[setup.step];
      if (i >= 0) setup.map[i] = found;
      else setup.axes[-i - 1] = { i: found.i, v: found.v };
      setup.step++;
      setup.wait = true;
      showStep();
    };
    // A snapshot at rest, then the first input that moves well away from it answers the step. Triggers resting at -1
    // and a d-pad reported as one hat axis (resting outside -1..1, stepping through eight values) both count as moved.
    // After an answer nothing is heard until every input is back at rest, so the trip back never answers the next one.
    const learnTick = () => {
      const pad = G.raw();
      if (!pad || pad.id !== setup.id) return;
      const b = pad.buttons, a = pad.axes;
      let calm = true;
      for (let k = 0; k < b.length; k++) if (b[k].value > 0.2) calm = false;
      if (!setup.base) { if (calm) setup.base = Array.from(a); return; }
      const base = setup.base;
      for (let k = 0; k < a.length; k++) if (Math.abs(a[k] - base[k]) > 0.25) calm = false;
      if (setup.wait) { if (calm) setup.wait = false; return; }
      const [i] = STEPS[setup.step];
      if (i >= 0) for (let k = 0; k < b.length; k++) if (b[k].value > 0.5) { answer({ k: "b", i: k }); return; }
      for (let k = 0; k < a.length; k++) {
        const hat = Math.abs(base[k]) > 1.05, d = a[k] - base[k];
        if (Math.abs(d) <= (hat ? 0.1 : 0.6)) continue;
        if (i < 0) { if (!hat) answer({ i: k, v: Math.sign(d) }); }
        else answer(hat ? { k: "h", i: k, at: a[k] } : { k: "a", i: k, v: Math.sign(d), rest: base[k] });
        return;
      }
    };
    $("pad-setup-open").addEventListener("click", startSetup);
    $("pad-setup-skip").addEventListener("click", () => { if (setup) { setup.step++; setup.wait = true; showStep(); } });
    $("pad-setup-cancel").addEventListener("click", endSetup);
    // ---- The live picture ----
    let shown = -1;
    const tick = () => {
      raf = window.requestAnimationFrame(tick);
      const st = G.state;
      if (setup) { learnTick(); return; }
      if (st.physical !== shown) {
        const fresh = st.physical & ~shown;
        shown = st.physical;
        for (const i in nodes) nodes[i].classList.toggle("on", !!(st.physical & 1 << i));
        if (fresh && !capture) for (let i = 0; i < 18; i++) if (fresh & 1 << i && i !== S && i !== E && i < UP) { hintFor(i); break; }
      }
      for (let s = 0; s < 2; s++) {
        const x = s ? st.rawRx : st.rawLx, y = s ? st.rawRy : st.rawLy, m = Math.hypot(x, y), stick = sticks[s];
        stick.dot.setAttribute("cx", (stick.x + x * 18).toFixed(1));
        stick.dot.setAttribute("cy", (stick.y + y * 18).toFixed(1));
        stick.dot.classList.toggle("rest", m <= G.feel.dead);
      }
      if (capture && !capture.conflict) {
        if (!capture.armed && !st.physical) capture.armed = true;
        if (performance.now() > capture.until) { endCapture(); hint("Nothing pressed, so nothing changed."); return; }
        const p = $("pad-capture-prompt");
        if (p) p.textContent = promptText(def().entries.find(x => x.id === capture.id));
      }
    };
    // Escape cancels a wait or the setup before it closes the screen.
    dialog.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !capture && !setup) return;
      e.preventDefault();
      e.stopPropagation();
      if (setup) endSetup(); else endCapture();
    });
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      if (capture || setup) { if (setup) endSetup(); else endCapture(); return; }
      close();
    });
    dialog.addEventListener("close", () => finish());
    const offDevice = G.subscribe((what) => {
      if (!dialog.open) return;
      if (what === "device" || what === "unknown") { draw(); render(); }
    });
    const open = (opts = {}) => {
      if (dialog.open) { if (opts.setup) startSetup(); return; }
      if (!ready()) return;
      const help = document.getElementById("controls-help");
      if (help && help.open) document.getElementById("controls-help-close").click();
      if (document.querySelector("dialog:modal")) return;
      owner = current();
      if (owner && owner.controlsHelpHold) owner.controlsHelpHold(true);
      hold(true);
      if (document.pointerLockElement) document.exitPointerLock();
      tab = owner && owner.padContext || "foot";
      shown = -1;
      draw();
      syncFeel();
      render();
      idle();
      dialog.showModal();
      const first = list.querySelector(".pad-change:not([disabled])");
      if (first) first.focus({ preventScroll: true });
      raf = window.requestAnimationFrame(tick);
      if (opts.setup) startSetup();
    };
    const finish = () => {
      window.cancelAnimationFrame(raf);
      raf = 0;
      capture = null;
      endSetup();
      G.listen(null);
      toastEl.hidden = true;
      if (owner && owner.controlsHelpHold) owner.controlsHelpHold(false);
      owner = null;
      hold(false);
    };
    const close = () => { if (dialog.open) dialog.close(); };
    return { open, close, get isOpen() { return dialog.open; }, dispose() { close(); offDevice(); } };
  };
  BL.padSettings = { create, open: () => {}, close: () => {} };
  // The director creates the screen; until then `open` does nothing.
  BL.padSettings.install = (screen) => { BL.padSettings.open = screen.open; BL.padSettings.close = screen.close; return screen; };
})();
