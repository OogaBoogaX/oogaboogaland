// One cabinet visit: approach its glass, run the real menu/scene inside it, expand, and return.
// The hall is captured once at the glass; no second scene or renderer lives behind a running game.
(() => {
  "use strict";
  const BL = window.BL;
  const AXES = ["x", "y", "z"];
  const ease = t => t * t * (3 - 2 * t);
  const copy = camera => ({ position: { ...camera.position }, target: { ...camera.target }, up: { ...(camera.up || { x: 0, y: 1, z: 0 }) }, fov: camera.fov, orthoMix: camera.orthoMix || 0, orthoHeight: camera.orthoHeight || 0 });
  const mix = (camera, a, b, k) => {
    camera.up ||= { x: 0, y: 1, z: 0 };
    for (const key of AXES) {
      camera.position[key] = a.position[key] + (b.position[key] - a.position[key]) * k;
      camera.target[key] = a.target[key] + (b.target[key] - a.target[key]) * k;
      camera.up[key] = a.up[key] + (b.up[key] - a.up[key]) * k;
    }
    camera.fov = a.fov + (b.fov - a.fov) * k;
    camera.orthoMix = a.orthoMix + (b.orthoMix - a.orthoMix) * k;
    camera.orthoHeight = a.orthoHeight + (b.orthoHeight - a.orthoHeight) * k;
  };
  // One shared board per menu visit. Scores remain server-attributed; local machine bests are never ranked.
  const leaderboard = id => {
    if (!BL.highscoreRules.cabinets.includes(id)) return null;
    const card = document.querySelector(id === "mine" ? "#mine-intro:not([hidden])" : `.game-intro[data-intro="${id}"]:not([hidden])`);
    const actions = card?.querySelector(".actions");
    if (!actions) return null;
    const section = document.createElement("section"), title = document.createElement("h3"), status = document.createElement("p");
    const list = document.createElement("ol"), toggle = document.createElement("button"), rows = [];
    section.className = "cabinet-leaderboard"; section.id = `cabinet-leaderboard-${id}`;
    title.textContent = "Shared top 10"; title.id = `${section.id}-title`;
    section.setAttribute("aria-labelledby", title.id); status.setAttribute("role", "status");
    toggle.type = "button"; toggle.className = "cabinet-leaderboard-toggle"; toggle.textContent = "Leaderboard";
    toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-controls", section.id);
    toggle.addEventListener("click", () => {
      const open = card.classList.toggle("cabinet-show-scores");
      toggle.textContent = open ? "Controls" : "Leaderboard";
      toggle.setAttribute("aria-expanded", String(open));
    });
    for (let i = 0; i < 10; i++) {
      const row = document.createElement("li"), rank = document.createElement("span"), name = document.createElement("span"), score = document.createElement("strong");
      rank.textContent = String(i + 1); rank.setAttribute("aria-hidden", "true");
      row.append(rank, name, score); list.append(row); rows.push({ row, name, score });
    }
    section.append(title, status, list); card.insertBefore(section, actions);
    actions.insertBefore(toggle, actions.lastElementChild); card.classList.add("cabinet-has-leaderboard");
    let data = null, state = "loading";
    const render = () => {
      const runs = data?.runs || [];
      status.textContent = state === "loading" ? "Loading shared scores…"
        : state === "refreshing" ? "Updating · showing last shared scores"
        : state === "stale" ? "Shared scores may be out of date · refresh unavailable"
        : state === "unavailable" ? "Shared leaderboard unavailable"
        : data && !data.runs ? "This server does not have the leaderboard yet"
        : runs.length ? "All players · highest scores"
        : "No shared runs yet. Sign in and finish a game to set a score.";
      for (let i = 0; i < rows.length; i++) {
        const { row, name, score } = rows[i], run = runs[i];
        row.classList.toggle("empty", !run);
        row.classList.toggle("you", !!run && run.username.toLowerCase() === BL.net.state.me?.login?.toLowerCase());
        name.textContent = run ? run.username : "—"; name.title = run ? run.username : "";
        score.textContent = run ? run.score.toLocaleString("en-US") : "—";
      }
    };
    const off = BL.highscores.watch(id, value => { data = value; render(); }, value => { state = value; render(); });
    return { dispose() { off(); section.remove(); toggle.remove(); card.classList.remove("cabinet-has-leaderboard", "cabinet-show-scores"); } };
  };
  const create = ({ canvas, renderer, go }) => {
    const stage = document.getElementById("stage"), backdrop = document.createElement("canvas"), paint = backdrop.getContext("2d");
    backdrop.id = "cabinet-backdrop"; backdrop.hidden = true; backdrop.setAttribute("aria-hidden", "true");
    document.body.prepend(backdrop);
    const foreground = document.createElement("canvas"), foregroundPaint = foreground.getContext("2d");
    foreground.id = "cabinet-foreground"; foreground.hidden = true; foreground.setAttribute("aria-hidden", "true");
    document.body.append(foreground);
    const exitButton = document.createElement("button");
    exitButton.type = "button"; exitButton.className = "cabinet-exit"; exitButton.textContent = "Return to arcade"; exitButton.hidden = true;
    exitButton.addEventListener("click", () => route(visit?.home || "arcade")); document.body.append(exitButton);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let scores = null;
    let visit = null, phase = "idle", age = 0, zoom = 0, dispatching = false, lost = false;
    let shownW = 0, shownH = 0, shownX = -1, shownY = -1;
    let width = innerWidth, height = innerHeight, rw = 0, rh = 0, rx = 0, ry = 0;
    const rect = () => {
      width = innerWidth; height = innerHeight;
      if (visit?.rect) { rx = visit.rect.x * width; ry = visit.rect.y * height; rw = visit.rect.w * width; rh = visit.rect.h * height; return; }
      rw = Math.min(width * 0.94, height * 0.80 * 4 / 3); rh = rw * 3 / 4;
      rx = (width - rw) / 2; ry = (height - rh) / 2;
    };
    const cloudRide = () => visit?.id === "cloud-hopper";
    const duration = () => reduced.matches ? 0 : phase === "expanding" && cloudRide() ? BL.cloudHopper.LIFT_SECONDS : 0.7;
    const setPhase = value => {
      if (value !== "menu" && scores) { scores.dispose(); scores = null; }
      phase = value; age = 0; document.body.dataset.cabinetPhase = value;
      exitButton.hidden = value !== "approach" && value !== "loading";
    };
    const screen = k => {
      zoom = k;
      rect();
      // Keep the game's viewport and the captured cabinet at one aspect throughout the trip.
      // The image starts letterboxed in the glass. A uniform push covers the viewport;
      // reversing that same push reveals the cabinet without reshaping a result card.
      if (cloudRide() && phase !== "menu") {
        const fit = Math.min(rw / width, rh / height), scale = fit + (1 - fit) * k;
        const cx = rx + rw / 2, cy = ry + rh / 2;
        stage.classList.add("cabinet-display");
        stage.style.width = `${width}px`; stage.style.height = `${height}px`;
        stage.style.left = `${(cx - width / 2) * (1 - k)}px`;
        stage.style.top = `${(cy - height / 2) * (1 - k)}px`;
        stage.style.transform = `scale(${scale})`;
        backdrop.hidden = foreground.hidden = false;
        if (foreground.parentElement !== document.body) document.body.append(foreground);
        foreground.style.position = "fixed"; foreground.style.left = foreground.style.top = "0";
        foreground.style.opacity = "1";
        backdrop.style.transformOrigin = foreground.style.transformOrigin = `${cx}px ${cy}px`;
        backdrop.style.transform = foreground.style.transform = `translate(${(width / 2 - cx) * k}px, ${(height / 2 - cy) * k}px) scale(${scale / fit})`;
        if (shownW !== width || shownH !== height) { shownW = width; shownH = height; renderer.resize(); }
        return;
      }
      const panel = cloudRide() ? document.querySelector(".cloud-hopper-panel[open]") : null;
      const parent = panel || document.body;
      const changedParent = foreground.parentElement !== parent;
      if (changedParent) parent.append(foreground);
      const w = rw + (width - rw) * k, h = rh + (height - rh) * k, x = rx * (1 - k), y = ry * (1 - k);
      if (!changedParent && w === shownW && h === shownH && x === shownX && y === shownY) return;
      foreground.hidden = false;
      foreground.style.position = panel ? "absolute" : "fixed";
      foreground.style.opacity = String(Math.max(0, 1 - k * 4));
      foreground.style.left = panel ? `${-rx * (1 - k)}px` : "0";
      foreground.style.top = panel ? `${-ry * (1 - k)}px` : "0";
      shownX = x; shownY = y;
      stage.style.left = `${rx * (1 - k)}px`; stage.style.top = `${ry * (1 - k)}px`;
      stage.style.width = `${w}px`; stage.style.height = `${h}px`;
      document.body.style.setProperty("--cabinet-width", `${w}px`);
      document.body.style.setProperty("--cabinet-height", `${h}px`);
      document.body.style.setProperty("--cabinet-center-x", `${x + w / 2}px`);
      document.body.style.setProperty("--cabinet-center-y", `${y + h / 2}px`);
      stage.classList.add("cabinet-display"); backdrop.hidden = false;
      if (w !== shownW || h !== shownH) { shownW = w; shownH = h; renderer.resize(); }
    };
    const full = () => {
      zoom = 1;
      stage.classList.remove("cabinet-display");
      stage.style.left = stage.style.top = stage.style.width = stage.style.height = stage.style.transform = "";
      backdrop.style.transform = foreground.style.transform = "";
      backdrop.style.transformOrigin = foreground.style.transformOrigin = "";
      backdrop.hidden = foreground.hidden = true;
      document.body.append(foreground);
      shownW = shownH = 0; renderer.resize();
    };
    const dispatch = (id, place) => {
      dispatching = true;
      try { return go(id, place, true); } finally { dispatching = false; }
    };
    const clear = () => {
      if (visit?.display) visit.display.visible = true;
      full(); visit = null; lost = false; setPhase("idle");
      BL.net.leaveCabinet();
      backdrop.width = backdrop.height = foreground.width = foreground.height = 1;
    };
    const unsubscribe = BL.net.subscribe(() => {
      if (visit?.live && (BL.net.state.room !== "live" || !BL.net.state.me || !BL.net.cabinet)) lost = true;
    });
    // `home` is the scene the cabinet stands in: the hall's, or the island's cave (#554).
    const begin = (id, cabinet, camera, display, { home = "arcade" } = {}) => {
      if (visit) return false;
      rect();
      const S = BL.arcadeModels.SCREEN, c = Math.cos(cabinet.turn), s = Math.sin(cabinet.turn);
      const target = { x: cabinet.x + s * S.z, y: cabinet.y + S.y, z: cabinet.z + c * S.z };
      const d = S.h / (2 * Math.tan(camera.fov / 2) * (rh / height));
      const close = { target, fov: camera.fov, up: { x: 0, y: 1, z: 0 }, orthoMix: 0, orthoHeight: camera.orthoHeight || 0, position: { x: target.x + s * Math.cos(S.lean) * d,
        y: target.y - Math.sin(S.lean) * d, z: target.z + c * Math.cos(S.lean) * d } };
      const corners = [];
      for (const x of [-S.w / 2, S.w / 2]) for (const y of [-S.h / 2, S.h / 2]) {
        const z = S.z + Math.sin(S.lean) * y;
        corners.push({ x: cabinet.x + c * x + s * z, y: cabinet.y + S.y + Math.cos(S.lean) * y, z: cabinet.z - s * x + c * z });
      }
      visit = { camera, id, cabinet, display, corners, live: !!BL.net.state.me, from: copy(camera), close, returnView: null, exit: null, home };
      exitButton.textContent = home === "arcade" ? "Return to arcade" : "Return to the island";
      zoom = 0;
      setPhase("approach");
      return true;
    };
    const route = (id, place) => {
      if (!visit || dispatching) return false;
      if (phase === "return" || phase === "shrinking" || phase === "leaving") return true;
      visit.exit = id === "arcade" || id === visit.home ? null : { id, place };
      if (phase === "approach") {
        visit.returnView = visit.from; visit.close = copy(visit.camera); setPhase("return"); return true;
      }
      visit.shrink = zoom;
      setPhase("shrinking");
      return true;
    };
    const arrived = scene => {
      if (!visit) return;
      if (phase === "loading") { setPhase("menu"); screen(0); scores = leaderboard(visit.id); }
      else if (phase === "leaving" && scene.id === visit.home) {
        visit.returnView = null; full(); setPhase("return");
        BL.net.leaveCabinet();
      }
    };
    const update = (dt, scene, menu, transitioning) => {
      if (!visit) return;
      if (lost && !transitioning && phase !== "return" && phase !== "leaving" && phase !== "shrinking") {
        BL.hud.toast(visit.home === "arcade" ? "Cabinet connection lost · returning to the arcade" : "Cabinet connection lost · returning to the island"); route(visit.home);
      }
      age += dt;
      const k = ease(duration() ? Math.min(1, age / duration()) : 1);
      if (phase === "approach") {
        mix(scene.camera, visit.from, visit.close, k);
        if (k === 1 && visit.display) visit.display.visible = false;
      }
      else if (phase === "menu") {
        screen(0);
        if (!menu) {
          BL.arcadePopular.count(visit.id);
          setPhase("expanding"); age = dt;
          screen(ease(duration() ? Math.min(1, age / duration()) : 1));
        }
      } else if (phase === "expanding") {
        screen(k);
        if (k === 1) { full(); setPhase("playing"); }
      } else if (phase === "shrinking") {
        if (transitioning) return;
        screen(visit.shrink * (1 - k));
        if (k === 1 || visit.shrink === 0) {
          setPhase("leaving");
          // Do not hand a game-world pose to the room between scenes.
          dispatch(visit.home, visit.id === "cloud-hopper" ? "cloud-hopper-return" : null);
        }
      } else if (phase === "return") {
        if (!visit.returnView) visit.returnView = copy(scene.camera);
        mix(scene.camera, visit.close, visit.returnView, k);
        if (k === 1) {
          const exit = visit.exit;
          clear();
          scene.stay?.();
          if (exit) dispatch(exit.id, exit.place);
        }
      }
    };
    const afterDraw = () => {
      if (phase !== "approach" || age < duration()) return;
      width = innerWidth; height = innerHeight;
      backdrop.width = canvas.width; backdrop.height = canvas.height;
      paint.drawImage(canvas, 0, 0);
      // Preserve the actual control geometry above the DOM menu, including inside native dialogs.
      foreground.width = canvas.width; foreground.height = canvas.height;
      foregroundPaint.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      const cabinet = visit.cabinet, c = Math.cos(cabinet.turn), s = Math.sin(cabinet.turn);
      const mesh = BL.arcadeModels.cabinet(cabinet.index).cabinetForeground, projected = [];
      for (let i = 0; i < mesh.verts.length; i += 3) {
        const x = mesh.verts[i], y = mesh.verts[i + 1], z = mesh.verts[i + 2];
        projected.push(renderer.project(cabinet.x + c * x + s * z, cabinet.y + y, cabinet.z - s * x + c * z, {}));
      }
      for (const face of mesh.faces) {
        if (face.i.some(i => !projected[i])) continue;
        foregroundPaint.beginPath();
        face.i.forEach((i, n) => { const p = projected[i]; if (n) foregroundPaint.lineTo(p.x, p.y); else foregroundPaint.moveTo(p.x, p.y); });
        foregroundPaint.closePath(); foregroundPaint.fill();
      }
      foregroundPaint.setTransform(1, 0, 0, 1, 0, 0);
      foregroundPaint.globalCompositeOperation = "source-in";
      foregroundPaint.drawImage(canvas, 0, 0);
      foregroundPaint.globalCompositeOperation = "source-over";
      // Measure the rendered glass, leaving only its narrow rim.
      const points = visit.corners.map(p => renderer.project(p.x, p.y, p.z, {}));
      if (points.every(Boolean)) {
        const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x));
        const top = Math.min(...points.map(p => p.y)), bottom = Math.max(...points.map(p => p.y));
        rx = left + (right - left) * 0.03; ry = top + (bottom - top) * 0.03;
        rw = (right - left) * 0.94; rh = (bottom - top) * 0.94;
      }
      visit.rect = { x: rx / width, y: ry / height, w: rw / width, h: rh / height };
      setPhase("loading");
      dispatch(visit.id === "cloud-hopper" ? "hub" : visit.id, visit.id === "cloud-hopper" ? "cloud-hopper" : null);
    };
    const failed = () => {
      if (!visit) return;
      if (phase === "leaving") { full(); setPhase("playing"); }
      else { visit.returnView = visit.from; full(); setPhase("return"); }
    };
    return { begin, route, arrived, update, afterDraw, failed,
      get active() { return !!visit; }, get phase() { return phase; },
      get held() { return visit && phase !== "menu" && phase !== "playing" && !(cloudRide() && phase === "expanding"); },
      dispose() { clear(); unsubscribe(); backdrop.remove(); foreground.remove(); exitButton.remove(); } };
  };
  BL.arcadeView = { create };
})();
