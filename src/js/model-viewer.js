// A dialog that shows a model up close, beside what there is to know about it: the model on a canvas the visitor
// turns by dragging, zooms with the wheel or a pinch, or works with the keys; its kicker, name, account, stats, note
// and sources; paged through a set with the arrows. `open({ title, help, count, index, item(i) })`, an item being
// { kicker, name, text, stats: [[label, value]], note, links: [{ href, label }], geometry }. The model is drawn in
// Canvas 2D, lit as the HUD's icons are, its faces in the order a BSP tree gives from the eye: built once a model, it
// draws every face behind whatever stands in front of it from any side, where a sort by depth would let a small part
// on a big face fall behind it at some angles. It draws only when something changes, never on a timer, and holds
// nothing once closed but the trees of the models it showed, kept with their geometries.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { mat4 } = BL.math;
  // The view: the camera's turn round the model and its tilt (radians), how far in it is zoomed, and their limits;
  // a drag of one CSS pixel turns it TURN radians; the camera's field of view.
  const START = { yaw: -0.4, pitch: 0.3, zoom: 1 }, PITCH = [-0.2, 1.25], ZOOM = [0.6, 2.6], TURN = 0.009, FOV = 0.62;
  const view = { ...START };
  const eye = { x: 0, y: 0, z: 0 }, middle = { x: 0, y: 0, z: 0 }, reach = { x: 0, z: 0 }, UP = { x: 0, y: 1, z: 0 };
  const matrix = mat4.create(), V = new Float32Array(3);
  let els = null, set = null, index = 0, ctx = null, width = 0, height = 0, dpr = 1, pending = 0, radius = 1, floor = 0, tree = null;
  const pointers = new Map();
  let pinch = 0;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // The model's middle, how far round it reaches (so it fills the canvas whatever its size) and the floor it stands on.
  const frame = (geometry) => {
    const v = geometry.verts;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < v.length; i += 3) {
      if (v[i] < x0) x0 = v[i]; if (v[i] > x1) x1 = v[i];
      if (v[i + 1] < y0) y0 = v[i + 1]; if (v[i + 1] > y1) y1 = v[i + 1];
      if (v[i + 2] < z0) z0 = v[i + 2]; if (v[i + 2] > z1) z1 = v[i + 2];
    }
    middle.x = (x0 + x1) / 2; middle.y = (y0 + y1) / 2; middle.z = (z0 + z1) / 2;
    radius = Math.max(0.05, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2);
    floor = y0; reach.x = (x1 - x0) / 2; reach.z = (z1 - z0) / 2;
  };

  // ---------- the tree ----------
  // Light as the HUD's icon renderer has it, so a model looks here as its icon would: a hemisphere from sky to ground,
  // a key light, and lit faces brighter.
  const LIGHT = [0.45, 0.85, 0.3].map((c, i, a) => c / Math.hypot(...a));
  const SKY = 0.5 * 0.2126 + 0.52 * 0.7152 + 0.58 * 0.0722, GROUND = 0.22 * 0.2126 + 0.2 * 0.7152 + 0.19 * 0.0722;
  const shade = (c, emissive, nx, ny, nz) => {
    const diffuse = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
    const lit = Math.min(1, Math.max(0.3, GROUND + (SKY - GROUND) * (ny * 0.5 + 0.5)) + diffuse * 0.7);
    const k = lit + (1.1 - lit) * Math.min(1, emissive);
    return `rgb(${Math.min(255, Math.round(c[0] * k))},${Math.min(255, Math.round(c[1] * k))},${Math.min(255, Math.round(c[2] * k))})`;
  };
  // A face's plane is (n, d): a point p lies in front of it when n·p > d, and on it within EPS.
  const EPS = 1e-6;
  const polygons = (geometry) => {
    const v = geometry.verts, list = [], two = !!geometry.twoSided;
    for (const f of geometry.faces) {
      const idx = f.i, m = idx.length, p = new Float64Array(m * 3);
      for (let k = 0; k < m; k++) { p[k * 3] = v[idx[k] * 3]; p[k * 3 + 1] = v[idx[k] * 3 + 1]; p[k * 3 + 2] = v[idx[k] * 3 + 2]; }
      // Newell's normal, as the renderers take a face's.
      let nx = 0, ny = 0, nz = 0;
      for (let k = 0; k < m; k++) {
        const a = k * 3, b = (k + 1) % m * 3;
        nx += (p[a + 1] - p[b + 1]) * (p[a + 2] + p[b + 2]);
        ny += (p[a + 2] - p[b + 2]) * (p[a] + p[b]);
        nz += (p[a] - p[b]) * (p[a + 1] + p[b + 1]);
      }
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) continue;
      nx /= l; ny /= l; nz /= l;
      const e = f.emissive || 0;
      list.push({ p, nx, ny, nz, d: nx * p[0] + ny * p[1] + nz * p[2], style: shade(f.color, e, nx, ny, nz), back: two ? shade(f.color, e, -nx, -ny, -nz) : null });
    }
    return list;
  };
  // Where a polygon lies against the plane (nx, ny, nz, d): 0 on it, 1 in front, -1 behind, 2 across it.
  const side = (q, nx, ny, nz, d) => {
    const p = q.p;
    let front = false, back = false;
    for (let k = 0; k < p.length; k += 3) {
      const s = nx * p[k] + ny * p[k + 1] + nz * p[k + 2] - d;
      if (s > EPS) front = true; else if (s < -EPS) back = true;
    }
    return front && back ? 2 : front ? 1 : back ? -1 : 0;
  };
  // A polygon across a plane, cut in two along it.
  const cut = (q, nx, ny, nz, d, front, back) => {
    const p = q.p, m = p.length / 3, F = [], B = [];
    for (let k = 0; k < m; k++) {
      const a = k * 3, b = (k + 1) % m * 3;
      const sa = nx * p[a] + ny * p[a + 1] + nz * p[a + 2] - d, sb = nx * p[b] + ny * p[b + 1] + nz * p[b + 2] - d;
      if (sa >= -EPS) F.push(p[a], p[a + 1], p[a + 2]);
      if (sa <= EPS) B.push(p[a], p[a + 1], p[a + 2]);
      if (sa > EPS && sb < -EPS || sa < -EPS && sb > EPS) {
        const t = sa / (sa - sb), x = p[a] + (p[b] - p[a]) * t, y = p[a + 1] + (p[b + 1] - p[a + 1]) * t, z = p[a + 2] + (p[b + 2] - p[a + 2]) * t;
        F.push(x, y, z); B.push(x, y, z);
      }
    }
    if (F.length >= 9) front.push({ ...q, p: Float64Array.from(F) });
    if (B.length >= 9) back.push({ ...q, p: Float64Array.from(B) });
  };
  // A node splits its polygons by one of their planes: of up to twelve spread through them, the one that cuts the
  // fewest, then the one leaving its two sides the most even.
  const build = (list) => {
    if (!list.length) return null;
    const step = Math.max(1, Math.floor(list.length / 12));
    let best = list[0], score = Infinity;
    for (let c = 0; c < list.length; c += step) {
      const s = list[c];
      let cuts = 0, f = 0, b = 0;
      for (const q of list) { const w = side(q, s.nx, s.ny, s.nz, s.d); if (w === 2) cuts++; else if (w === 1) f++; else if (w === -1) b++; }
      const value = cuts * 8 + Math.abs(f - b);
      if (value < score) { score = value; best = s; }
    }
    const node = { nx: best.nx, ny: best.ny, nz: best.nz, d: best.d, on: [], front: null, back: null }, front = [], back = [];
    // The splitter lies on its own plane even if it is not quite flat, so the tree always ends.
    for (const q of list) {
      const w = q === best ? 0 : side(q, node.nx, node.ny, node.nz, node.d);
      if (w === 0) node.on.push(q); else if (w === 1) front.push(q); else if (w === -1) back.push(q);
      else cut(q, node.nx, node.ny, node.nz, node.d, front, back);
    }
    node.front = build(front);
    node.back = build(back);
    return node;
  };
  const trees = new WeakMap();
  const treeOf = (geometry) => {
    let t = trees.get(geometry);
    if (!t) { t = build(polygons(geometry)); trees.set(geometry, t); }
    return t;
  };

  // ---------- drawing ----------
  // The faces the eye sees, farthest first: at each node the side away from the eye, the node's own faces that look
  // toward it, then the side it stands on.
  const order = [], styles = [];
  let drawn = 0;
  const walk = (node) => {
    if (!node) return;
    const ahead = node.nx * eye.x + node.ny * eye.y + node.nz * eye.z - node.d >= 0;
    walk(ahead ? node.back : node.front);
    for (const q of node.on) {
      const toward = q.nx * eye.x + q.ny * eye.y + q.nz * eye.z - q.d > 0;
      if (toward || q.back) { order[drawn] = q.p; styles[drawn] = toward ? q.style : q.back; drawn++; }
    }
    walk(ahead ? node.front : node.back);
  };
  // A canvas the size it is shown at; sized again only when that changes.
  const fit = () => {
    const w = Math.max(1, Math.round(els.canvas.clientWidth)), h = Math.max(1, Math.round(els.canvas.clientHeight)), r = Math.min(window.devicePixelRatio || 1, 2);
    if (w === width && h === height && r === dpr && ctx) return;
    width = w; height = h; dpr = r;
    els.canvas.width = Math.round(w * r); els.canvas.height = Math.round(h * r);
    ctx = els.canvas.getContext("2d");
  };
  // A point onto the canvas, into V; false behind the eye (the eye never comes inside the model's reach, so never).
  const project = (x, y, z, f) => {
    mat4.transformPoint(V, matrix, x, y, z);
    if (V[2] > -1e-4) return false;
    V[0] = width / 2 + V[0] * f / -V[2];
    V[1] = height / 2 - V[1] * f / -V[2];
    return true;
  };
  const paint = () => {
    pending = 0;
    if (!els || !els.dialog.open || !tree) return;
    fit();
    const d = radius / Math.sin(FOV / 2) * 0.94 / view.zoom, c = Math.cos(view.pitch), f = height / 2 / Math.tan(FOV / 2);
    eye.x = middle.x + Math.sin(view.yaw) * c * d;
    eye.y = middle.y + Math.sin(view.pitch) * d;
    eye.z = middle.z - Math.cos(view.yaw) * c * d;
    mat4.lookAt(matrix, eye, middle, UP);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    // A soft shadow on the floor under it, seen from above only.
    if (eye.y > floor) {
      ctx.beginPath();
      for (let k = 0; k <= 32; k++) {
        const a = k / 32 * Math.PI * 2;
        if (!project(middle.x + Math.cos(a) * reach.x * 1.12, floor, middle.z + Math.sin(a) * reach.z * 1.12, f)) continue;
        if (k) ctx.lineTo(V[0], V[1]); else ctx.moveTo(V[0], V[1]);
      }
      ctx.fillStyle = "rgba(0,0,0,.3)";
      ctx.fill();
    }
    drawn = 0;
    walk(tree);
    ctx.lineJoin = "round";
    ctx.lineWidth = 1;
    for (let i = 0; i < drawn; i++) {
      const p = order[i];
      ctx.beginPath();
      let ok = true;
      for (let k = 0; k < p.length && ok; k += 3) {
        ok = project(p[k], p[k + 1], p[k + 2], f);
        if (k) ctx.lineTo(V[0], V[1]); else ctx.moveTo(V[0], V[1]);
      }
      if (!ok) continue;
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle = styles[i];
      ctx.fill();
      ctx.stroke();
    }
  };
  const redraw = () => { if (!pending) pending = requestAnimationFrame(paint); };
  // One item into the dialog: the model, and its words as text (never markup).
  const show = (i) => {
    index = (i + set.count) % set.count;
    const item = set.item(index);
    tree = treeOf(item.geometry);
    frame(item.geometry);
    Object.assign(view, START);
    els.kicker.textContent = item.kicker || "";
    els.name.textContent = item.name;
    els.text.textContent = item.text || "";
    els.canvas.setAttribute("aria-label", `${item.name}, in 3D: drag to turn it`);
    const rows = [];
    for (const [label, value] of item.stats || []) {
      const dt = document.createElement("dt"), dd = document.createElement("dd");
      dt.textContent = label; dd.textContent = value;
      rows.push(dt, dd);
    }
    els.stats.replaceChildren(...rows);
    els.note.textContent = item.note || "";
    els.note.hidden = !item.note;
    const links = (item.links || []).map((l) => {
      const a = document.createElement("a");
      a.className = "board-link"; a.href = l.href; a.textContent = l.label; a.target = "_blank"; a.rel = "noopener noreferrer";
      return a;
    });
    els.links.replaceChildren(...links);
    els.links.hidden = !links.length;
    els.count.textContent = `${index + 1} / ${set.count}`;
    els.prev.disabled = els.next.disabled = set.count < 2;
    redraw();
  };
  const turn = (dx, dy) => { view.yaw += dx; view.pitch = clamp(view.pitch + dy, PITCH[0], PITCH[1]); redraw(); };
  const zoom = (k) => { view.zoom = clamp(view.zoom * k, ZOOM[0], ZOOM[1]); redraw(); };
  // The dialog's own wiring, made the first time it opens.
  const wire = () => {
    const $ = (id) => document.getElementById(id);
    els = { dialog: $("model-modal"), title: $("model-title"), canvas: $("model-canvas"), kicker: $("model-kicker"), name: $("model-name"), text: $("model-text"),
      stats: $("model-stats"), note: $("model-note"), links: $("model-links"), count: $("model-count"), prev: $("model-prev"), next: $("model-next"), help: $("model-help"), close: $("model-close") };
    const c = els.canvas;
    c.addEventListener("pointerdown", (e) => { c.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; });
    c.addEventListener("pointermove", (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      if (pointers.size === 1) turn((e.clientX - p.x) * TURN, (e.clientY - p.y) * TURN);
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 2) {
        const [a, b] = pointers.values(), d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) zoom(d / pinch);
        pinch = d;
      }
    });
    const lift = (e) => { pointers.delete(e.pointerId); pinch = 0; };
    c.addEventListener("pointerup", lift);
    c.addEventListener("pointercancel", lift);
    c.addEventListener("wheel", (e) => { e.preventDefault(); zoom(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    els.prev.addEventListener("click", () => show(index - 1));
    els.next.addEventListener("click", () => show(index + 1));
    els.close.addEventListener("click", () => els.dialog.close());
    // A press on the backdrop, outside the dialog's box, closes it (as `hud.dismissOutside` does for the HUD's own).
    els.dialog.addEventListener("pointerdown", (e) => {
      const r = els.dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) els.dialog.close();
    });
    els.dialog.addEventListener("keydown", (e) => {
      if (e.target.closest("a, button") && (e.key === "Enter" || e.key === " ")) return;
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "arrowright") show(index + (k === "arrowleft" ? -1 : 1));
      else if (k === "a" || k === "d") turn(k === "a" ? -0.26 : 0.26, 0);
      else if (k === "w" || k === "s" || k === "arrowup" || k === "arrowdown") turn(0, k === "w" || k === "arrowup" ? 0.15 : -0.15);
      else if (k === "+" || k === "=" || k === "-") zoom(k === "-" ? 1 / 1.2 : 1.2);
      else if (k === "r") { Object.assign(view, START); redraw(); }
      else return;
      e.preventDefault();
    });
    els.dialog.addEventListener("close", () => { pointers.clear(); if (pending) cancelAnimationFrame(pending); pending = 0; set = null; tree = null; order.length = styles.length = 0; });
    window.addEventListener("resize", () => { if (els.dialog.open) redraw(); });
  };
  const open = (next) => {
    if (!els) wire();
    set = next;
    els.title.textContent = next.title;
    els.help.textContent = next.help || "Drag to turn it · scroll or pinch to zoom · ← → for the next one";
    if (document.pointerLockElement) document.exitPointerLock();
    if (!els.dialog.open) els.dialog.showModal();
    show(next.index || 0);
    els.canvas.focus({ preventScroll: true });
  };
  BL.modelViewer = {
    open,
    close: () => { if (els && els.dialog.open) els.dialog.close(); },
    get stats() { return { open: !!(els && els.dialog.open), index, width, height, drawn, view: { ...view } }; }
  };
})();
