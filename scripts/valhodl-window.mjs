// Bakes the picture ₿IFRÖST's Valhodl window shows (src/js/bifrost-valhodl-art.js): Castle Island seen from Portal
// Island across the candle-lit channel, at night under its storm. Valhodl's window is `lazy` (the chamber never loads
// the land), so its picture is rendered here once, from the built page in the suite's Chrome, with the land's own
// renderer, and committed. With it go the points the window's live layer needs, in the picture's 0..1 space: the lit
// windows and flames found in the picture itself and the channel's candles (`lights`, each [u, v, size]), the keep's spire tip (`spire`) and how far down the
// skyline comes (`sky`). Run after `npm run build`; `--shot <file>` also writes the raw PNG for a look.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dispose, launch } from "../test/browser.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), shotAt = args.indexOf("--shot"), shotFile = shotAt >= 0 ? args[shotAt + 1] : null;
// The window's picture is 4.8 m across and 5.25 m tall (bifrost-models.js `passage`); the shot keeps that shape.
const W = 1280, H = Math.round(W * 5.25 / 4.8), OUT = 1024;
// Where the view stands: on Portal Island's plateau a little over head height, looking north over the channel to the
// keep, and how wide it looks. The haze is drawn back for the shot so the castle reads at this distance.
const VIEW = { eye: [0, 22, 300], look: [0, 24, -82], fov: 30, fogNear: 140, fogFar: 760 };

const page = `file://${join(root, "oogaboogaland.html")}?debug=1&nosim=1&pos=0&welcome=0&wip=keep&scene=keep&keepcache=0`;
const b = await launch({ w: W, h: H });
try {
  await b.open(page);
  const t0 = Date.now();
  while (!(await b.evaluate(`!!window.__ooga && document.body.dataset.activeScene === "keep" && !__ooga.transitioning && __ooga.renderedFrames >= 4 && !document.getElementById("curtain")`).catch(() => false))) {
    if (Date.now() - t0 > 120000) throw new Error("valhodl-window: Valhodl did not draw");
    await b.sleep(200);
  }
  await b.sleep(2500);
  const out = await b.evaluate(`(() => {
    const S = BL.scenes.keep, R = __ooga.renderer, L = BL.keepLayout, V = ${JSON.stringify(VIEW)};
    const cam = BL.scene.createCamera({ fov: V.fov, near: 0.5, far: 1200 });
    cam.position = { x: V.eye[0], y: V.eye[1], z: V.eye[2] }; cam.target = { x: V.look[0], y: V.look[1], z: V.look[2] };
    const player = S.debug && S.debug.crew && S.debug.crew.player;
    if (player) player.root.visible = false;
    const opts = Object.assign({}, S.renderOpts, { fogNear: V.fogNear, fogFar: V.fogFar, shadowCenter: { x: 0, y: 2, z: -40 }, shadowExtent: 140 });
    R.render(S.root, cam, opts);
    const png = document.getElementById("scene").toDataURL("image/png");
    const c = document.getElementById("scene"), w = c.width, h = c.height, P = {};
    const at = (x, y, z) => { const p = R.project(x, y, z, P); return p ? [p.x / R.size.width, p.y / R.size.height] : null; };
    const lights = [], keep = (x, y, z, size) => { const p = at(x, y, z); if (p && p[0] > 0.01 && p[0] < 0.99 && p[1] > 0.01 && p[1] < 0.99) lights.push([+p[0].toFixed(4), +p[1].toFixed(4), size]); };
    // The channel's candles, too dim to find in the picture; the lit windows are found in it below.
    for (const [x, z] of L.CANDLES) keep(x, L.SEA + 0.3, z, 0.6);
    const spire = at(L.KEEP.x, L.KEEP.roof + L.KEEP.arcade + L.KEEP.spire, L.CZ - 5);
    const sky = at(0, L.KEEP.roof, L.CZ);
    return { png, w, h, lights, spire, sky: sky ? sky[1] : 0.4 };
  })()`);
  if (shotFile) writeFileSync(shotFile, Buffer.from(out.png.split(",")[1], "base64"));
  // The picture scaled to `OUT` across and encoded as WebP in the page's own canvas.
  const webp = await b.evaluate(`new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Cut to the window's own shape, about the middle, whatever the canvas came out as.
      const A = 4.8 / 5.25, iw = img.naturalWidth, ih = img.naturalHeight, sw = Math.min(iw, ih * A), sh = sw / A, sx = (iw - sw) / 2, sy = (ih - sh) / 2;
      const c = document.createElement("canvas"); c.width = ${OUT}; c.height = Math.round(${OUT} / A);
      const g = c.getContext("2d");
      g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      // The lit windows and flames: warm bright pixels, gathered into spots a few pixels across (each [u, v, size]).
      const d = g.getImageData(0, 0, c.width, c.height).data, cell = 4, cols = Math.ceil(c.width / cell), rows = Math.ceil(c.height / cell), hot = new Uint8Array(cols * rows), spots = [];
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4, r = d[i], gg = d[i + 1], bb = d[i + 2];
        if (r > 190 && gg > 95 && bb < 120 && r > bb + 110) hot[Math.floor(y / cell) * cols + Math.floor(x / cell)]++;
      }
      const seen = new Uint8Array(cols * rows);
      for (let k = 0; k < hot.length; k++) {
        if (hot[k] < 2 || seen[k]) continue;
        let n = 0, sx = 0, sy = 0, sum = 0;
        const stack = [k]; seen[k] = 1;
        while (stack.length) {
          const q = stack.pop(), qx = q % cols, qy = (q / cols) | 0;
          n++; sx += qx * hot[q]; sy += qy * hot[q]; sum += hot[q];
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ax = qx + dx, ay = qy + dy, a = ay * cols + ax; if (ax >= 0 && ax < cols && ay >= 0 && ay < rows && !seen[a] && hot[a] >= 2) { seen[a] = 1; stack.push(a); } }
        }
        if (n > 40) continue;
        spots.push([+((sx / sum + 0.5) * cell / c.width).toFixed(4), +((sy / sum + 0.5) * cell / c.height).toFixed(4), +Math.min(3, Math.sqrt(n)).toFixed(2)]);
      }
      resolve({ src: c.toDataURL("image/webp", 0.82), width: c.width, height: c.height, spots, crop: [sx / iw, sw / iw, sy / ih, sh / ih] }); };
    img.src = ${JSON.stringify(out.png)};
  })`);
  const [cx, cw, cy, ch] = webp.crop, cut = ([u, v]) => [+((u - cx) / cw).toFixed(4), +((v - cy) / ch).toFixed(4)];
  const candles = out.lights.map((l) => [...cut(l), l[2]]).filter(([u, v]) => u > 0.01 && u < 0.99 && v > 0.01 && v < 0.99);
  const art = { src: webp.src, width: webp.width, height: webp.height, lights: [...webp.spots, ...candles].slice(0, 160), spire: cut(out.spire), sky: cut([0.5, out.sky])[1] };
  const text = `// Generated by scripts/valhodl-window.mjs: the picture ₿IFRÖST's Valhodl window shows, and the points its live layer
// needs (bifrost-valhodl.js). Rebake with \`node scripts/valhodl-window.mjs\` after \`npm run build\`; do not edit by hand.
(function () {
  "use strict";
  const BL = window.BL;
  BL.bifrostArt = Object.assign(BL.bifrostArt || {}, { valhodl: ${JSON.stringify(art)} });
})();
`;
  const file = join(root, "src", "js", "bifrost-valhodl-art.js");
  writeFileSync(file, text);
  console.log(`src/js/bifrost-valhodl-art.js: ${art.width}x${art.height}, ${(art.src.length / 1024).toFixed(0)} KB, ${art.lights.length} lights, spire ${art.spire}, sky ${art.sky}`);
  if (readFileSync(file, "utf8").length < 1000) throw new Error("valhodl-window: the picture is empty");
} finally {
  b.close();
  await dispose();
}
