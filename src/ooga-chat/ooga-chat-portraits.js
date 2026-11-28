// A revision's face index and PNG move together. The app never loads the island's renderer.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, listeners = new Set(), canvases = new Map();
  const HASH = /^[a-f0-9]{64}$/, EVERY_MS = 120000;
  let faces = BL.oogaChatFaces, path = "art/ooga-faces.png", sheet = null, revision = "embedded", generation = 0;
  let painted = faces, sheetPath = null, loading = null, imageAt = -Infinity, wanted = false;
  let read = null, pending = false, readAt = -Infinity;
  const changed = () => { for (const fn of listeners) fn(); };
  const apply = (body) => {
    const m = body?.portraits, cast = body?.cast;
    if (!m || !Array.isArray(cast) || cast.length > 128 || !HASH.test(m.revision) || !HASH.test(m.image)
      || !/^[a-f0-9]{40}$/.test(m.baseline) || m.engine !== "island-character-data-v1" || !["staging", "production"].includes(m.environment)
      || m.version !== 1 || m.size !== 80 || m.columns !== 8 || m.fallback !== cast.length
      || m.rows !== Math.ceil((cast.length + 1) / 8) || !m.cells || typeof m.cells !== "object" || Array.isArray(m.cells)
      || !Number.isSafeInteger(body.catalogGeneration) || body.catalogGeneration <= 0 || body.catalogRevision !== m.revision) return false;
    const names = cast.map((row) => String(row?.handle || "").toLowerCase()).sort();
    if (Object.keys(m.cells).length !== names.length || new Set(names).size !== names.length
      || names.some((name, i) => !/^[a-z0-9-]{1,39}$/.test(name) || !Object.hasOwn(m.cells, name) || m.cells[name] !== i)) return false;
    if (faces.baseline === m.baseline && (body.catalogGeneration < generation || body.catalogGeneration === generation && m.revision !== revision)) return false;
    if (m.revision === revision) { generation = body.catalogGeneration; if (wanted) loadSheet(); return true; }
    faces = m; generation = body.catalogGeneration; revision = m.revision;
    path = `/api/chat/public/portraits/${m.revision}/${m.image}.png`;
    loading = null; imageAt = -Infinity; changed(); return true;
  };
  // Keep the last complete index/image pair until its replacement loads. A failed immutable URL may be retried,
  // but a busy view cannot turn a service outage into an image request on every repaint.
  const loadSheet = () => {
    if (loading || sheetPath === path || Date.now() - imageAt < EVERY_MS) return;
    const image = loading = new Image(), index = faces, source = path;
    imageAt = Date.now();
    const failed = () => { if (loading === image) { loading = null; imageAt = Date.now(); } };
    image.addEventListener("error", failed, { once: true });
    image.addEventListener("load", () => {
      if (loading !== image) return;
      if (!image.naturalWidth || image.naturalWidth !== index.columns * index.size
        || index.rows && image.naturalHeight !== index.rows * index.size) { failed(); return; }
      loading = null; sheet = image; painted = index; sheetPath = source;
      canvases.clear(); changed();
    }, { once: true });
    image.src = source;
  };
  const refresh = () => {
    if (wanted) loadSheet();
    if (!read || pending || Date.now() - readAt < EVERY_MS) return;
    pending = true; readAt = Date.now();
    Promise.resolve().then(read).then(apply, () => {}).finally(() => { pending = false; });
  };
  const canvas = (name) => {
    wanted = true;
    refresh();
    if (!sheet) return null;
    const requested = String(name).toLowerCase(), key = Object.hasOwn(painted.cells, requested) ? requested : " ";
    if (canvases.has(key)) return canvases.get(key);
    const i = painted.cells[key] ?? painted.fallback, size = painted.size, out = document.createElement("canvas");
    out.width = out.height = size;
    out.getContext("2d").drawImage(sheet, (i % painted.columns) * size, Math.floor(i / painted.columns) * size, size, size, 0, 0, size, size);
    canvases.set(key, out); return out;
  };
  BL.oogaChatPortraits = { apply, canvas, refresh, configure(fn) { read = fn; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }, get revision() { return revision; } };
})();
