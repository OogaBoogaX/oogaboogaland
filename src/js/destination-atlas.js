// A north-up, bounded 2D survey of the current scene's own terrain. No second world, renderer or terrain cache.
(() => {
  "use strict";
  const BL = window.BL, W = 720, H = 600, NS = "http://www.w3.org/2000/svg";
  const create = (canvas, overlay, pins) => {
    const ctx = canvas.getContext("2d"), markers = [];
    let data = null, bounds = null, picked = "", origin = null, layer = "all";
    const ICONS = {
      pile: "M5 14Q12 3 19 14Q12 22 5 14", lab: "M9 3h6M10 3v6L5 19h14L14 9V3M8 14h8",
      mirror: "M6 3h12v18H6zM9 15l6-6", underground: "M3 10l9-7 9 7M5 9v12h14V9M10 21v-7h4v7",
      basement: "M3 5h5v5h5v5h5v5h4", mempool: "M3 8q4-5 9 0t9 0M3 15q4-5 9 0t9 0",
      factory: "M14 2L5 13h6l-1 9 9-13h-6z", arcade: "M5 9h14l3 10-5-1-3-3h-4l-3 3-5 1zM6 10v5M4 12h5M16 11v2M19 14v2",
      bca: "M5 4h14v17H5zM8 8h8M8 12h2M14 12h2M8 16h2M14 16h2",
      gate: "M4 21V8q8-10 16 0v13M8 21V9q4-5 8 0v12", bifrost: "M3 20Q12-11 21 20M7 20Q12 0 17 20",
      repos: "M5 3h14v18H5zM8 7h8M8 12h8M8 17h8",
      timechain: "M12 2a10 10 0 1 0 .01 0M12 6v6l4 3"
    };
    const svg = (tag, attrs) => {
      const node = document.createElementNS(NS, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      return node;
    };
    const project = p => ({ x: (p.x - bounds.minX) / (bounds.maxX - bounds.minX) * W, y: (p.z - bounds.minZ) / (bounds.maxZ - bounds.minZ) * H });
    const line = (a, b, cls) => overlay.append(svg("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: cls }));
    const layout = (packed = false) => {
      if (!data || !bounds) return;
      overlay.replaceChildren();
      for (const m of markers) {
        m.button.hidden = layer !== "all" && (m.point.layer || "surface") !== layer;
        m.button.setAttribute("aria-pressed", String(m.point.name === picked));
      }
      const width = pins.clientWidth;
      if (!width) return;
      const gap = 48 * W / width, radius = gap / 2, placed = origin ? [project(origin)] : [], cells = [];
      // A crowded phone can exhaust the radial candidates despite having room for every target.
      // Repack once into evenly spaced cells instead of putting an unplaced pin over another one.
      if (packed) {
        const cols = Math.floor(W / gap), rows = Math.floor(H / gap);
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const p = { x: (W - (cols - 1) * gap) / 2 + x * gap, y: (H - (rows - 1) * gap) / 2 + y * gap };
          if (placed.every(q => Math.hypot(p.x - q.x, p.y - q.y) >= gap)) cells.push(p);
        }
      }
      // Fanned callouts keep shared x/z floors and nearby mouths individually tappable at phone widths.
      for (const m of markers) {
        if (m.button.hidden) continue;
        const at = project(m.point);
        let spot = null;
        if (packed) {
          let nearest = -1, distance = Infinity;
          for (let i = 0; i < cells.length; i++) if (cells[i]) {
            const d = Math.hypot(cells[i].x - at.x, cells[i].y - at.y);
            if (d < distance) { nearest = i; distance = d; }
          }
          if (nearest >= 0) { spot = cells[nearest]; cells[nearest] = null; }
        }
        for (let ring = 0; !packed && ring < 10 && !spot; ring++) for (let step = 0; step < (ring ? 16 : 1); step++) {
          const angle = step * Math.PI / 8, reach = ring * gap * 0.55;
          const p = { x: Math.max(radius, Math.min(W - radius, at.x + Math.cos(angle) * reach)), y: Math.max(radius, Math.min(H - radius, at.y + Math.sin(angle) * reach)) };
          if (placed.every(q => Math.hypot(p.x - q.x, p.y - q.y) >= gap)) { spot = p; break; }
        }
        if (!spot && !packed) { layout(true); return; }
        spot = spot || at; placed.push(spot);
        m.button.style.left = `${spot.x / W * 100}%`; m.button.style.top = `${spot.y / H * 100}%`;
        if (Math.hypot(spot.x - at.x, spot.y - at.y) > 4) line(at, spot, "atlas-callout");
        overlay.append(svg("circle", { cx: at.x, cy: at.y, r: 3, class: "atlas-anchor" }));
      }
      const target = markers.find(m => m.point.name === picked && !m.button.hidden);
      if (target) {
        const at = project(target.point);
        if (origin) line(project(origin), at, "atlas-route");
        overlay.append(svg("circle", { cx: at.x, cy: at.y, r: 20, class: "atlas-selected" }));
      }
      if (origin) {
        const at = project(origin);
        if (at.x >= 0 && at.x <= W && at.y >= 0 && at.y <= H) {
          overlay.append(svg("circle", { cx: at.x, cy: at.y, r: 9, class: "atlas-origin" }));
          overlay.append(svg("circle", { cx: at.x, cy: at.y, r: 3, class: "atlas-origin-core" }));
        }
      }
    };
    const resize = new ResizeObserver(() => layout()); resize.observe(pins);
    const clear = () => { data = bounds = origin = null; picked = ""; markers.length = 0; pins.replaceChildren(); overlay.replaceChildren(); ctx?.clearRect(0, 0, W, H); };
    const show = (next, names, label, select) => {
      clear(); data = next;
      if (!data || !ctx) return false;
      const b = data.bounds, span = Math.max(b.maxX - b.minX, (b.maxZ - b.minZ) * W / H) * 1.16;
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      bounds = { minX: cx - span / 2, maxX: cx + span / 2, minZ: cz - span * H / W / 2, maxZ: cz + span * H / W / 2 };
      canvas.width = W; canvas.height = H;
      ctx.fillStyle = "#112d35"; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#27434a"; ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      const tile = 4, dx = span / W, dz = (bounds.maxZ - bounds.minZ) / H;
      // At most 27,000 samples, only when opening. Each sample queries already-built scene surfaces.
      for (let y = 0; y < H; y += tile) for (let x = 0; x < W; x += tile) {
        const wx = bounds.minX + (x + tile / 2) * dx, wz = bounds.minZ + (y + tile / 2) * dz, h = data.surfaceAt(wx, wz);
        if (!Number.isFinite(h)) continue;
        const road = data.isPath?.(wx, wz), light = Math.max(27, Math.min(59, 36 + h * 1.15));
        ctx.fillStyle = road ? "#bca777" : `hsl(${h > 9 ? 52 : 102} 24% ${light}%)`;
        ctx.fillRect(x, y, tile + 0.5, tile + 0.5);
      }
      ctx.lineCap = "round";
      for (const link of data.links || []) {
        const a = project(link.from), b = project(link.to);
        ctx.strokeStyle = "#d2bd8e"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.fillStyle = "#e8ead7"; ctx.textAlign = "center"; ctx.font = "bold 16px sans-serif"; ctx.fillText("N", W - 34, 30);
      ctx.strokeStyle = "#e8ead7"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W - 34, 65); ctx.lineTo(W - 34, 39); ctx.lineTo(W - 39, 47); ctx.moveTo(W - 34, 39); ctx.lineTo(W - 29, 47); ctx.stroke();
      const metres = 20, scale = metres / span * W;
      ctx.beginPath(); ctx.moveTo(24, H - 30); ctx.lineTo(24 + scale, H - 30); ctx.stroke(); ctx.font = "12px sans-serif"; ctx.fillText(`${metres} m`, 24 + scale / 2, H - 40);
      names.forEach((name, i) => {
        const point = data.points.find(p => p.name === name);
        if (!point) return;
        const button = document.createElement("button");
        button.type = "button"; button.className = "destination-atlas-marker"; button.dataset.mapDestination = name;
        const icon = svg("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" });
        icon.append(svg("path", { d: ICONS[name] || "M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zM12 6v6" }));
        const number = document.createElement("small"), caption = document.createElement("span");
        number.textContent = String(i + 1); caption.textContent = label(name); caption.className = "destination-pin-label";
        button.append(icon, number, caption); button.title = `${label(name)}${point.level ? ` · ${point.level}` : ""}`;
        button.setAttribute("aria-label", `Preview ${button.title}`); button.addEventListener("click", () => select(name));
        pins.append(button); markers.push({ point, button });
      });
      layout(); return true;
    };
    return { show, clear, filter(value) { layer = value; layout(); }, select(name, at) { picked = name; origin = at; layout(); }, dispose() { resize.disconnect(); clear(); } };
  };
  BL.destinationAtlas = { create };
})();
