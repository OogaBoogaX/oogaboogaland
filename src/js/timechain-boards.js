// Six permanent wall sections inside the Timechain Sphere; no screen furniture or tabs.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { createNode, addChild } = BL.scene;
  const W = 384, RADIUS = 12.72, WIDTH = 10.8, HEIGHT = 9.4, BOTTOM = 1.1, BG = [19, 32, 45];
  const ANGLES = [-0.49, -1.47, -2.45, 0.49, 1.47, 2.45];
  const COLORS = ["#ffbd53", "#8bdfa3", "#60dbef", "#bd98ed", "#ec927f", "#bad57b"];
  const bend = geo => {
    for (let i = 0; i < geo.verts.length; i += 3) {
      const longitude = geo.verts[i] / RADIUS, latitude = (geo.verts[i + 1] - 3) / RADIUS;
      const r = RADIUS - geo.verts[i + 2], ring = r * Math.cos(latitude);
      geo.verts[i] = ring * Math.sin(longitude);
      geo.verts[i + 1] = 3 + r * Math.sin(latitude);
      geo.verts[i + 2] = -ring * Math.cos(longitude);
    }
    return geo;
  };
  const wall = BL.models.cached(() => {
    const geo = { verts: [], faces: [], lines: [], castShadow: false };
    for (let y = 0; y < 20; y++) for (let x = 0; x < 24; x++) {
      const left = (x / 24 - 0.5) * WIDTH, right = ((x + 1) / 24 - 0.5) * WIDTH;
      const bottom = BOTTOM + y / 20 * HEIGHT, top = BOTTOM + (y + 1) / 20 * HEIGHT, base = geo.verts.length / 3;
      geo.verts.push(left, bottom, 0, right, bottom, 0, right, top, 0, left, top, 0);
      geo.faces.push({ i: [base, base + 1, base + 2, base + 3], color: BG, emissive: 0.45 });
    }
    return bend(geo);
  });
  const projectPanel = flat => {
    const geo = { verts: [], faces: [], lines: [], castShadow: false };
    for (const face of flat.faces) {
      const a = face.i[0] * 3, b = face.i[1] * 3, c = face.i[2] * 3;
      const left = flat.verts[a] - WIDTH / 2, right = flat.verts[b] - WIDTH / 2;
      const bottom = flat.verts[a + 1] + BOTTOM, top = flat.verts[c + 1] + BOTTOM;
      const count = Math.max(1, Math.ceil((right - left) / 0.3));
      for (let i = 0; i < count; i++) {
        const lo = left + (right - left) * i / count, hi = left + (right - left) * (i + 1) / count, base = geo.verts.length / 3;
        geo.verts.push(lo, bottom, 0.025, hi, bottom, 0.025, hi, top, 0.025, lo, top, 0.025);
        geo.faces.push({ i: [base, base + 1, base + 2, base + 3], color: face.color, emissive: face.emissive });
      }
    }
    return bend(geo);
  };
  const create = (parent, renderer, onChange) => {
    let selected = 0;
    const entries = ANGLES.map(angle => {
      const node = createNode({ geometry: wall(), rotation: { x: 0, y: -angle, z: 0 } }), panel = createNode();
      const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = 384;
      addChild(node, panel); addChild(parent, node);
      return { node, panel, canvas, ctx: canvas.getContext("2d", { willReadFrequently: true }), caption: "", rowCount: 0, angle };
    });
    const feed = BL.timechainData.create(index => { paint(index); if (index === selected && onChange) onChange(index); });
    const inverse = BL.math.mat4.create(), localRay = new Float64Array(6);
    const pickScreen = (ray, index) => {
      BL.math.mat4.invert(inverse, entries[index].node.world);
      const m = inverse, r = localRay;
      r[0] = m[0] * ray.ox + m[4] * ray.oy + m[8] * ray.oz + m[12];
      r[1] = m[1] * ray.ox + m[5] * ray.oy + m[9] * ray.oz + m[13] - 3;
      r[2] = m[2] * ray.ox + m[6] * ray.oy + m[10] * ray.oz + m[14];
      r[3] = m[0] * ray.dx + m[4] * ray.dy + m[8] * ray.dz;
      r[4] = m[1] * ray.dx + m[5] * ray.dy + m[9] * ray.dz;
      r[5] = m[2] * ray.dx + m[6] * ray.dy + m[10] * ray.dz;
      const a = r[3] * r[3] + r[4] * r[4] + r[5] * r[5], b = r[0] * r[3] + r[1] * r[4] + r[2] * r[5];
      const d = b * b - a * (r[0] * r[0] + r[1] * r[1] + r[2] * r[2] - RADIUS * RADIUS);
      if (a < 1e-12 || d < 0) return Infinity;
      for (let side = -1; side <= 1; side += 2) {
        const t = (-b + side * Math.sqrt(d)) / a;
        const x = r[0] + t * r[3], y = r[1] + t * r[4], z = r[2] + t * r[5];
        const longitude = Math.atan2(x, -z), latitude = Math.atan2(y, Math.hypot(x, z));
        if (t >= 0 && Math.abs(longitude) <= WIDTH / (2 * RADIUS) && latitude >= (BOTTOM - 3) / RADIUS && latitude <= (BOTTOM + HEIGHT - 3) / RADIUS) return t;
      }
      return Infinity;
    };
    const paint = index => {
      const data = feed.boards[index], entry = entries[index], ctx = entry.ctx, text = BL.jumbotron.text;
      const rows = [];
      for (const raw of data.table || []) {
        const value = raw.toUpperCase();
        if (!value.length) rows.push("");
        for (let start = 0; start < value.length; start += 60) rows.push(value.slice(start, start + 60));
      }
      const h = Math.max(384, 104 + rows.length * 9);
      entry.canvas.height = h; entry.rowCount = rows.length;
      ctx.fillStyle = "#13202d"; ctx.fillRect(0, 0, W, h);
      const line = (s, x, y, color, scale = 1) => text.drawText(ctx, String(s).toUpperCase(), x, y, color, scale);
      const centred = (s, y, color, scale = 1) => line(s, Math.floor((W - text.measureText(String(s), scale)) / 2), y, color, scale);
      centred("TIMECHAIN SPHERE / " + String(index + 1).padStart(2, "0"), 7, COLORS[index]);
      centred(data.title, 25, "#edf4f7", 2);
      centred(data.asof || data.status, 45, "#97b4c6");
      centred(data.lines[0] || data.status, 63, COLORS[index]);
      rows.forEach((row, i) => line(row, 12, 85 + i * 9, "#e0edf4"));
      if (data.status !== "LIVE API") line(data.status, 12, h - 24, "#97b4c6");
      centred("EXPLORE DATA AND SOURCES", h - 12, COLORS[index]);
      if (entry.panel.geometry) renderer.releaseGeometry(entry.panel.geometry);
      entry.panel.geometry = projectPanel(BL.poolModels.panelFrom(ctx, W, h, WIDTH / W, HEIGHT / h, BG));
      entry.caption = data.title + " — " + (data.asof || data.status) + ". " + data.lines.join("; ") + ". " + data.note + (data.checked ? "\nLast fetched " + new Date(data.checked).toISOString() + "." : "");
    };
    const select = index => {
      if (!Number.isInteger(index) || index < 0 || index >= entries.length || index === selected) return;
      selected = index;
      if (onChange) onChange(index);
    };
    feed.start(); entries.forEach((entry, index) => paint(index));
    return { entries, pickScreen, get index() { return selected; }, select, refresh: feed.refresh,
      get data() { return feed.boards; }, dispose() {
        feed.dispose();
        for (const entry of entries) {
          if (entry.panel.geometry) renderer.releaseGeometry(entry.panel.geometry);
          entry.panel.geometry = null;
        }
      }
    };
  };
  BL.timechainBoards = { create };
})();
