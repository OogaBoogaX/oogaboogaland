// A north-up, bounded 2D survey of the current scene's own terrain. No second world, renderer or terrain cache.
(() => {
  "use strict";
  const BL = window.BL, W = 720, H = 600, NS = "http://www.w3.org/2000/svg";
  const create = (canvas, overlay, pins) => {
    const ctx = canvas.getContext("2d"), markers = [];
    let data = null, bounds = null, picked = "", origin = null;
    const svg = (tag, attrs) => {
      const node = document.createElementNS(NS, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      return node;
    };
    const project = p => ({ x: (p.x - bounds.minX) / (bounds.maxX - bounds.minX) * W, y: (p.z - bounds.minZ) / (bounds.maxZ - bounds.minZ) * H });
    const line = (a, b, cls) => overlay.append(svg("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: cls }));
    const layout = () => {
      if (!data || !bounds) return;
      overlay.replaceChildren();
      const width = pins.clientWidth;
      if (!width) return;
      const gap = 48 * W / width, radius = gap / 2, placed = origin ? [project(origin)] : [];
      // Fanned callouts keep shared x/z floors and nearby mouths individually tappable at phone widths.
      for (const m of markers) {
        const at = project(m.point);
        let spot = null;
        for (let ring = 0; ring < 10 && !spot; ring++) for (let step = 0; step < (ring ? 16 : 1); step++) {
          const angle = step * Math.PI / 8, reach = ring * gap * 0.55;
          const p = { x: Math.max(radius, Math.min(W - radius, at.x + Math.cos(angle) * reach)), y: Math.max(radius, Math.min(H - radius, at.y + Math.sin(angle) * reach)) };
          if (placed.every(q => Math.hypot(p.x - q.x, p.y - q.y) >= gap)) { spot = p; break; }
        }
        spot = spot || at; placed.push(spot);
        m.button.style.left = `${spot.x / W * 100}%`; m.button.style.top = `${spot.y / H * 100}%`;
        m.button.setAttribute("aria-pressed", String(m.point.name === picked));
        if (Math.hypot(spot.x - at.x, spot.y - at.y) > 4) line(at, spot, "atlas-callout");
        overlay.append(svg("circle", { cx: at.x, cy: at.y, r: 3, class: "atlas-anchor" }));
      }
      const target = markers.find(m => m.point.name === picked);
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
    const resize = new ResizeObserver(layout); resize.observe(pins);
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
        button.textContent = String(i + 1); button.title = `${label(name)}${point.level ? ` · ${point.level}` : ""}`;
        button.setAttribute("aria-label", `Preview ${button.title}`); button.addEventListener("click", () => select(name));
        pins.append(button); markers.push({ point, button });
      });
      layout(); return true;
    };
    return { show, clear, select(name, at) { picked = name; origin = at; layout(); }, dispose() { resize.disconnect(); clear(); } };
  };
  BL.destinationAtlas = { create };
})();
