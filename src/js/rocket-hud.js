// Ooga Orbit HUD: builder, flight strip and meters, clamp gauge, calls/notices, results board.
// Text and bars change only when their value does.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { rocketParts, rocketModels } = BL;
  const { createNode } = BL.scene;
  const $ = (id) => document.getElementById(id);
  const MEDALS = { gold: 3600, silver: 2600, bronze: 1500 };
  const medalFor = (score) => score >= MEDALS.gold ? "gold" : score >= MEDALS.silver ? "silver" : score >= MEDALS.bronze ? "bronze" : null;
  const KIND_TAB = { pod: "Pods", shield: "Shields", engine: "Engines", tank: "Fuel", sep: "Knots", fins: "Fins" };
  // Each part icon drawn once per visit; tiles and the stack show copies, so the cache never holds a tile.
  // Emptied when the builder goes.
  const ICONS = new Map();
  const iconFor = (id) => {
    let icon = ICONS.get(id);
    if (!icon) ICONS.set(id, icon = BL.hud.renderIcon({ buildNode: () => createNode({ geometry: rocketModels.partGeometry(id) }) }));
    return icon;
  };
  const iconCopy = (id, className = "") => {
    const src = iconFor(id), c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    c.className = className;
    c.getContext("2d").drawImage(src, 0, 0);
    return c;
  };
  const keyStat = (p) => p.kind === "engine" ? `push ${p.thrust}` : p.kind === "tank" ? `fuel ${p.fuel}` : p.kind === "shield" ? `shield ${p.ablate}` : p.kind === "pod" ? `hull ${p.heatTol}` : p.kind === "fins" ? `steady ${p.stability}` : "drops a stage";
  // Pointer events only: a mouse drag starts after DRAG_START 6px, a touch after a still LONG_PRESS 380ms.
  const DRAG_START = 6, LONG_PRESS = 380;
  // onInsert(id, at) / onMoveTo(from, at) take stack indices, 0 at the bottom.
  // slots() gives the rocket's part boundaries on screen, bottom up, as { x, reach, ys } or null.
  const create = ({ best, onAdd, onMove, onRemove, onSelect, onPreset, onPilot, onInsert, onMoveTo, slots }) => {
    const el = {
      root: $("orbit"), build: $("orbit-build"), clear: $("orbit-clear"), tabs: $("orbit-tabs"), dv: $("orbit-dv"), dvFill: $("orbit-dv-fill"), twr: $("orbit-twr"), twrFill: $("orbit-twr-fill"), rocket: $("orbit-rocket"), palette: $("orbit-parts"), stack: $("orbit-stack"), presets: $("orbit-presets"),
      stats: $("orbit-stats"), problems: $("orbit-problems"), bill: $("orbit-bill"), launch: $("orbit-launch"), medal: $("orbit-medal"), help: $("orbit-help"),
      strip: $("orbit-strip"), alt: $("orbit-alt"), speed: $("orbit-speed"), stage: $("orbit-stage"), stages: $("orbit-stages"),
      fuel: $("orbit-fuel"), push: $("orbit-push"), heat: $("orbit-heat"), shield: $("orbit-shield"), stress: $("orbit-stress"), altFill: $("orbit-alt-fill"), altNow: $("orbit-alt-now"),
      center: $("orbit-center"), notice: $("orbit-notice"), gauge: $("orbit-gauge"), needle: $("orbit-needle"),
      results: $("orbit-results"), score: $("orbit-score"), summary: $("orbit-summary"), final: $("orbit-final"), finalScore: $("orbit-final-score"), finalMedal: $("orbit-final-medal"), finalBest: $("orbit-final-best"), buildBtn: $("orbit-build-btn"), mute: $("orbit-mute"), pilot: $("orbit-pilot"), pilotName: $("orbit-pilot-name"), evaBtn: $("orbit-eva"), mission: $("orbit-mission")
    };
    const listeners = [];
    const on = (target, type, fn) => {
      target.addEventListener(type, fn);
      listeners.push(() => target.removeEventListener(type, fn));
    };
    for (const node of [el.alt, el.speed, el.stage, el.center, el.bill, el.pilotName]) if (!node.firstChild) node.append("");
    on(el.pilot, "click", () => {
      el.pilot.blur();
      onPilot();
    });
    const setPilot = (name) => {
      el.pilotName.firstChild.data = name;
    };
    const button = (text, className, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      if (className) b.className = className;
      b.textContent = text;
      on(b, "click", () => {
        b.blur();
        fn();
      });
      return b;
    };
    const span = (text, className) => {
      const s = document.createElement("span");
      s.className = className;
      s.textContent = text;
      return s;
    };
    const partLine = (p) => {
      const bits = [];
      if (p.fuel) bits.push(`fuel ${p.fuel}`);
      if (p.thrust) bits.push(`push ${p.thrust}`);
      if (p.ve) bits.push(`exhaust ${p.ve}`);
      if (p.ablate) bits.push(`shield ${p.ablate}`);
      if (p.heatTol) bits.push(`hull ${p.heatTol}`);
      if (p.stability) bits.push(`steady ${p.stability}`);
      bits.push(`${p.dry + (p.fuel || 0)}t`);
      return bits.join(" · ");
    };
    let activeKind = "engine";
    const groups = new Map(), tabs = new Map();
    const showKind = (kind) => {
      activeKind = kind;
      for (const [k, g] of groups) g.hidden = k !== kind;
      for (const [k, t] of tabs) t.setAttribute("aria-pressed", String(k === kind));
    };
    const presetCards = [];
    on(el.clear, "click", () => {
      el.clear.blur();
      onPreset(null);
    });
    const buildPalette = () => {
      el.tabs.replaceChildren(...rocketParts.KINDS.map((kind) => {
        const t = button(KIND_TAB[kind], "orbit-tab", () => showKind(kind));
        tabs.set(kind, t);
        return t;
      }));
      el.palette.replaceChildren(...rocketParts.KINDS.map((kind) => {
        const grid = document.createElement("div");
        grid.className = "orbit-tiles";
        for (const p of rocketParts.PARTS) {
          if (p.kind !== kind) continue;
          const b = document.createElement("button");
          b.type = "button";
          b.className = "orbit-tile";
          b.dataset.id = p.id;
          b.title = `${p.note} · ${p.price} bananas`;
          b.append(iconCopy(p.id), span(p.name, "orbit-tile-name"), span(keyStat(p), "orbit-tile-stat"), span(`${p.price}`, "orbit-price"));
          on(b, "click", () => {
            b.blur();
            onAdd(p.id);
          });
          grid.append(b);
        }
        groups.set(kind, grid);
        return grid;
      }));
      showKind(activeKind);
      presetCards.length = 0;
      el.presets.replaceChildren(...rocketParts.PRESETS.map((preset) => {
        const st = rocketParts.stats(preset.stack), b = button("", "orbit-preset", () => onPreset(preset.name));
        b.append(span(preset.name, "orbit-preset-name"), span(`${st.stages.filter((x) => x.dv > 0).length} stage${st.stages.filter((x) => x.dv > 0).length > 1 ? "s" : ""} · ${Math.round(st.dv)} to spend`, "orbit-preset-note"));
        presetCards.push({ b, stack: preset.stack.join(",") });
        return b;
      }));
    };
    // Stack rows are rebuilt on every change, so buttons carry an op and index that one delegated listener reads.
    const tool = (text, className, op, index) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = className;
      b.textContent = text;
      b.dataset.op = op;
      b.dataset.index = String(index);
      return b;
    };
    on(el.stack, "click", (e) => {
      const b = e.target.closest("button[data-op]");
      if (!b) return;
      b.blur();
      const i = Number(b.dataset.index), op = b.dataset.op;
      if (op === "select") onSelect(i);
      else if (op === "up") onMove(i, 1);
      else if (op === "down") onMove(i, -1);
      else if (op === "remove") onRemove(i);
    });
    const row = (label, value, warn) => {
      const li = document.createElement("li");
      if (warn) li.dataset.warn = warn;
      li.append(span(label, ""), span(value, ""));
      return li;
    };
    const STAGE_HUES = ["#ff9a2a", "#7fe0ff", "#b58cff", "#8fdc6a"];
    const renderStack = (stack, selected, check, stats) => {
      const rows = [], stages = rocketParts.stagesOf(stack);
      let stageAt = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        const p = rocketParts.partOf(stack[i]);
        const si = stages.findIndex((st) => i >= st.from && i < st.to);
        if (si !== stageAt) {
          stageAt = si;
          const st = stages[si], head = document.createElement("li");
          head.className = "orbit-stage-head";
          head.style.setProperty("--hue", STAGE_HUES[si % STAGE_HUES.length]);
          head.textContent = st.engine ? `Stage ${si + 1} · ${Math.round(stats.stages[si].dv)} to spend · ${Math.round(stats.stages[si].burn)}s burn` : si === stages.length - 1 ? "Pod section · comes home" : `Stage ${si + 1} · no engine`;
          rows.push(head);
        }
        const li = document.createElement("li");
        li.dataset.kind = p.kind;
        li.dataset.index = String(i);
        li.dataset.id = p.id;
        li.style.setProperty("--hue", STAGE_HUES[si % STAGE_HUES.length]);
        if (i === selected) li.dataset.selected = "true";
        const name = tool(p.name, "orbit-row-name", "select", i);
        name.prepend(iconCopy(p.id, "orbit-mini"));
        const tools = document.createElement("span");
        tools.className = "orbit-tools";
        tools.append(tool("↑", "orbit-tool", "up", i), tool("↓", "orbit-tool", "down", i), tool("×", "orbit-tool orbit-remove", "remove", i));
        li.append(name, tools);
        rows.push(li);
      }
      if (!rows.length) {
        const li = document.createElement("li");
        li.className = "orbit-empty";
        li.textContent = "Empty pad. Pick a preset below, or tap an engine, fuel and a pod.";
        rows.push(li);
      }
      el.stack.replaceChildren(...rows);
      const current = stack.join(",");
      for (const card of presetCards) card.b.setAttribute("aria-pressed", String(card.stack === current));
      // Readiness bars: dv against 2x TOP_DV (mark at the middle), push against 3x (mark at 1x).
      el.dv.textContent = `${Math.round(stats.dv)} of ~${rocketParts.TOP_DV}`;
      el.dvFill.style.width = `${Math.min(100, stats.dv / (rocketParts.TOP_DV * 2) * 100)}%`;
      el.dvFill.dataset.state = stats.dv < rocketParts.TOP_DV ? "bad" : stats.dv < rocketParts.TOP_DV * 1.25 ? "warn" : "ok";
      el.twr.textContent = stack.length ? `${stats.liftoff.toFixed(2)}×` : "–";
      el.twrFill.style.width = `${Math.min(100, stats.liftoff / 3 * 100)}%`;
      el.twrFill.dataset.state = stats.liftoff < 1 ? "bad" : stats.liftoff < 1.3 ? "warn" : "ok";
      const fact = (label, value, warn) => {
        const li = document.createElement("li");
        if (warn) li.dataset.warn = warn;
        li.append(span(label, ""), span(value, ""));
        return li;
      };
      el.stats.replaceChildren(
        fact("Height", `${stats.height.toFixed(1)}`),
        fact("Mass", `${stats.mass.toFixed(1)}t`),
        fact("Stages", `${stats.stages.filter((st) => st.dv > 0).length}`),
        fact("Steady", stats.stability >= 0 ? "yes" : "wobbly", stats.stability < 0 ? "warn" : ""),
        fact("Bill", `${stats.cost}`)
      );
      el.bill.firstChild.data = stack.length ? `${stack.length} parts` : "";
      el.problems.replaceChildren(...check.problems.map((t) => {
        const li = document.createElement("li");
        li.dataset.warn = "bad";
        li.textContent = t;
        return li;
      }), ...check.warnings.map((t) => {
        const li = document.createElement("li");
        li.dataset.warn = "warn";
        li.textContent = t;
        return li;
      }));
      if (!check.problems.length && stack.length) {
        const li = document.createElement("li");
        li.dataset.warn = "ok";
        li.textContent = "The bill is only for show. Ready to fly.";
        el.problems.append(li);
      }
      el.launch.disabled = !check.ok;
    };
    const refreshBest = () => {
      const b = best();
      const medal = b ? medalFor(b.score) : null;
      el.medal.hidden = !medal;
      if (medal) {
        el.medal.dataset.medal = medal;
        el.medal.textContent = `${medal.toUpperCase()} · ${b.score}`;
      }
    };
    const show = (section) => {
      el.build.hidden = el.rocket.hidden = section !== "build";
      el.strip.hidden = section !== "flight";
      el.results.hidden = section !== "results";
      el.buildBtn.hidden = section === "build";
      if (section !== "flight") {
        el.center.hidden = true;
        el.notice.hidden = true;
        el.gauge.hidden = true;
      }
    };
    // Compare as numbers so an unchanged value builds no string.
    const last = { alt: NaN, speed: NaN, stage: NaN };
    const setNumber = (key, node, n) => {
      if (last[key] === n) return;
      last[key] = n;
      node.firstChild.data = String(n);
    };
    const setAlt = (v) => setNumber("alt", el.alt, Math.max(0, Math.round(v)));
    const setSpeed = (v) => setNumber("speed", el.speed, Math.round(v));
    const setStage = (n, total) => {
      setNumber("stage", el.stage, n);
      el.stages.textContent = `/${total}`;
    };
    // Mission rows are built once; each changes only when its state or text does.
    const MISSION = ["Launch", "Climb and arc", "Reach low orbit", "Spacewalk", "Drop home", "Shield first", "Chute and land"];
    const missionRows = [], missionState = [], missionText = [];
    const buildMission = () => {
      el.mission.replaceChildren(...MISSION.map((name, i) => {
        const li = document.createElement("li");
        const title = span(name, "orbit-step");
        const detail = span("", "orbit-detail");
        detail.append("");
        li.append(title, detail);
        missionRows[i] = { li, detail: detail.firstChild };
        missionState[i] = "";
        missionText[i] = "";
        return li;
      }));
    };
    const setStep = (i, state, text = "") => {
      const row = missionRows[i];
      if (missionState[i] !== state) {
        missionState[i] = state;
        row.li.dataset.state = state;
      }
      if (missionText[i] !== text) {
        missionText[i] = text;
        row.detail.data = text;
      }
    };
    let altPct = NaN;
    const setAltimeter = (alt, top) => {
      const pct = Math.round(Math.max(0, Math.min(1.04, alt / top)) * 400) / 4;
      if (pct === altPct) return;
      altPct = pct;
      el.altFill.style.height = `${Math.min(100, pct)}%`;
      el.altNow.style.bottom = `${pct}%`;
    };
    const setEva = (on) => {
      if (el.evaBtn.hidden === !on) return;
      el.evaBtn.hidden = !on;
    };
    const bars = new Map();
    // Bar state is one of '' (plain), 'warn', 'bad', 'ok'.
    const setBar = (node, value, state = "") => {
      let b = bars.get(node);
      if (!b) bars.set(node, b = { pct: -1, state: null });
      const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
      if (pct !== b.pct) {
        b.pct = pct;
        node.style.width = `${pct}%`;
      }
      if (state !== b.state) {
        b.state = state;
        node.dataset.state = state;
      }
    };
    const setGauge = (value) => {
      el.gauge.hidden = value < 0;
      if (value >= 0) setBar(el.needle, value);
    };
    let centerTimer = 0, noticeTimer = 0;
    const center = (text, ms = 900) => {
      el.center.firstChild.data = text;
      el.center.hidden = !text;
      window.clearTimeout(centerTimer);
      if (text && ms > 0) centerTimer = window.setTimeout(() => {
        el.center.hidden = true;
      }, ms);
    };
    // Keys named in the text become key caps; rebuilt only when the text changes.
    const KEYS = /\b(Space|W A S D Q E|W A S D|W S|A D|Q E|V|G|Enter)\b/;
    let lastNotice = "";
    const notice = (text, ms = 1600) => {
      if (text !== lastNotice) {
        lastNotice = text;
        el.notice.replaceChildren(...text.split(KEYS).map((part, i) => {
          if (i % 2 === 0) return part;
          const k = document.createElement("kbd");
          k.textContent = part;
          return k;
        }));
      }
      el.notice.hidden = !text;
      window.clearTimeout(noticeTimer);
      if (text && ms > 0) noticeTimer = window.setTimeout(() => {
        el.notice.hidden = true;
      }, ms);
    };
    const results = (rows, summary, { score, medal, improved }) => {
      el.finalScore.textContent = String(score);
      el.finalMedal.hidden = !medal;
      if (medal) {
        el.finalMedal.dataset.medal = medal;
        el.finalMedal.textContent = medal.toUpperCase();
      }
      const b = best();
      el.finalBest.textContent = improved ? "NEW BEST" : b ? `best ${b.score}` : "";
      el.final.classList.toggle("is-best", improved);
      el.final.classList.remove("is-shown");
      el.score.replaceChildren(...rows.map(([label, value]) => row(label, value)));
      el.summary.textContent = summary;
      refreshBest();
      show("results");
      void el.final.offsetWidth;
      el.final.classList.add("is-shown");
    };
    // A ghost follows the pointer and a line shows the target; a row dragged clear of both is taken off the rocket.
    const ghost = document.createElement("div");
    ghost.className = "orbit-ghost";
    const line = document.createElement("div");
    line.className = "orbit-drop-line";
    const drag = { armed: false, active: false, source: "", id: "", from: -1, x0: 0, y0: 0, at: -1, timer: 0, pointer: -1, touch: false };
    let swallowClick = false, clickTimer = 0;
    const place = (node, x, y) => {
      node.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    const inside = (node, x, y) => {
      const r = node.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    const overPanel = (x, y) => (!el.build.hidden && inside(el.build, x, y)) || (!el.rocket.hidden && inside(el.rocket, x, y));
    const begin = () => {
      drag.active = true;
      const p = rocketParts.partOf(drag.id);
      ghost.replaceChildren(iconCopy(drag.id, "orbit-mini"), span(p.name, ""));
      ghost.dataset.remove = "false";
      el.root.append(ghost, line);
      document.body.classList.add("orbit-dragging");
    };
    const aim = (x, y) => {
      line.hidden = true;
      drag.at = -1;
      if (!el.rocket.hidden && inside(el.stack, x, y)) {
        const rows = el.stack.querySelectorAll("li[data-index]");
        let at = 0, lineY = 0, r0 = null;
        for (const row of rows) {
          const r = row.getBoundingClientRect();
          if (!r0) r0 = r;
          if (y < r.top + r.height / 2) {
            at = Number(row.dataset.index) + 1;
            lineY = r.top;
            break;
          }
          lineY = r.bottom;
        }
        if (!rows.length) {
          const r = el.stack.getBoundingClientRect();
          lineY = r.top + 8;
        }
        drag.at = at;
        const sr = el.stack.getBoundingClientRect();
        line.hidden = false;
        line.style.width = `${Math.round(sr.width - 16)}px`;
        place(line, sr.left + 8, lineY - 2);
        return;
      }
      if (overPanel(x, y)) return;
      const slot = slots();
      if (!slot || Math.abs(x - slot.x) > slot.reach) return;
      let best = 0, gap = Infinity;
      for (let k = 0; k < slot.ys.length; k++) {
        const g = Math.abs(y - slot.ys[k]);
        if (g < gap) {
          gap = g;
          best = k;
        }
      }
      drag.at = best;
      line.hidden = false;
      line.style.width = "140px";
      place(line, slot.x - 70, slot.ys[best] - 2);
    };
    const finish = (drop) => {
      window.clearTimeout(drag.timer);
      const was = drag.active;
      if (was) {
        ghost.remove();
        line.remove();
        document.body.classList.remove("orbit-dragging");
        // Only the click from this very release is eaten; a release elsewhere makes none.
        swallowClick = true;
        window.clearTimeout(clickTimer);
        clickTimer = window.setTimeout(() => {
          swallowClick = false;
        }, 0);
        if (drop) {
          if (drag.source === "tile" && drag.at >= 0) onInsert(drag.id, drag.at);
          else if (drag.source === "row" && drag.at >= 0) onMoveTo(drag.from, drag.at);
          else if (drag.source === "row") onRemove(drag.from);
        }
      }
      drag.armed = drag.active = false;
      drag.pointer = -1;
    };
    const press = (e, source, node) => {
      if (e.button > 0 || drag.armed) return;
      drag.armed = true;
      drag.active = false;
      drag.source = source;
      drag.id = node.dataset.id;
      drag.from = source === "row" ? Number(node.dataset.index) : -1;
      drag.x0 = e.clientX;
      drag.y0 = e.clientY;
      drag.pointer = e.pointerId;
      drag.touch = e.pointerType === "touch";
      window.clearTimeout(drag.timer);
      if (drag.touch) drag.timer = window.setTimeout(() => {
        if (!drag.armed) return;
        begin();
        place(ghost, drag.x0 + 12, drag.y0 - 40);
        aim(drag.x0, drag.y0);
      }, LONG_PRESS);
    };
    on(el.palette, "pointerdown", (e) => {
      const tile = e.target.closest(".orbit-tile");
      if (tile) press(e, "tile", tile);
    });
    on(el.stack, "pointerdown", (e) => {
      const row = e.target.closest("li[data-index]");
      if (row && !e.target.closest(".orbit-tool")) press(e, "row", row);
    });
    on(window, "pointermove", (e) => {
      if (!drag.armed || e.pointerId !== drag.pointer) return;
      if (!drag.active) {
        // A touch that moves before the long press is a scroll, not a drag.
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_START) return;
        if (drag.touch) {
          finish(false);
          return;
        }
        begin();
      }
      place(ghost, e.clientX + 12, e.clientY - 40);
      aim(e.clientX, e.clientY);
      ghost.dataset.remove = String(drag.source === "row" && drag.at < 0 && !overPanel(e.clientX, e.clientY));
    });
    on(window, "pointerup", (e) => {
      if (e.pointerId === drag.pointer) finish(true);
    });
    on(window, "pointercancel", (e) => {
      if (e.pointerId === drag.pointer) finish(false);
    });
    // Once a touch drag is going, the page must not scroll under it (preventDefault).
    const holdScroll = (e) => {
      if (drag.active) e.preventDefault();
    };
    window.addEventListener("touchmove", holdScroll, { passive: false });
    listeners.push(() => window.removeEventListener("touchmove", holdScroll, { passive: false }));
    const eatClick = (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    };
    el.root.addEventListener("click", eatClick, true);
    listeners.push(() => el.root.removeEventListener("click", eatClick, true));
    const dispose = () => {
      finish(false);
      window.clearTimeout(clickTimer);
      window.clearTimeout(centerTimer);
      window.clearTimeout(noticeTimer);
      for (const off of listeners) off();
      listeners.length = 0;
      el.palette.replaceChildren();
      el.tabs.replaceChildren();
      groups.clear();
      tabs.clear();
      ICONS.clear();
      el.mission.replaceChildren();
      missionRows.length = missionState.length = missionText.length = 0;
      el.stack.replaceChildren();
      el.presets.replaceChildren();
      el.stats.replaceChildren();
      el.problems.replaceChildren();
      el.score.replaceChildren();
      el.bill.textContent = el.pilotName.textContent = "";
      bars.clear();
      show(null);
      el.buildBtn.hidden = true;
    };
    return { el, MISSION, buildPalette, buildMission, setStep, renderStack, refreshBest, setPilot, setEva, setAltimeter, show, setAlt, setSpeed, setStage, setBar, setGauge, center, notice, results, medalFor, dispose };
  };
  BL.rocketHud = { create, medalFor, MEDALS };
})();
