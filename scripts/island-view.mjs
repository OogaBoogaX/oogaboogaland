// Bakes the island view's map (docs/ooga-chat-hosts.md, "The island view"): `node scripts/island-view.mjs`, after `npm run
// build`. The built hub in the suite's Chrome, its Oogas, gorillas, Tess and clouds left out, seen straight down at
// midday on a fixed day through an orthographic camera over Main Island alone, in a chat's copy mode (the hub's debug
// `copyMode`), as a chat's copy carries it. It writes the picture at W x H
// to src/ooga-chat/art/island-view-main.webp (Ooga Chat's lazy art, scripts/ooga-chat.mjs LAZY_ART) and the same bytes
// into src/js/island-view-art.js (the island page's copy, a hosted page serving it as a file under art/,
// scripts/distribution-modules.mjs PICTURE_MODULES), and the capture camera's world-to-picture matrix, with the light
// and sea the hub showed, into src/js/island-view-data.js, so a face drawn on the picture lands where its Ooga stands
// and the 3D view (island-view-live.js) looks like the island at that hour. Run it again when the island's look changes.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dispose, launch } from "../test/browser.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// The picture's size (4:3, the strip's shape) and the ground it covers: Main Island with the sea round it, metres
// across and its middle, north (-z) up. Round it the picture carries `PAD` more pixels of the same sea at the same
// scale each side (left and right, top and bottom), so a strip wider or taller than 4:3 shows the ocean itself out to
// its edges (island-view.js); the matrix is the inner 4:3's, as before.
const W = 512, H = 384, SPAN = 96, MIDDLE = { x: 0, z: 0 }, PAD = [448, 128], TW = W + PAD[0] * 2, TH = H + PAD[1] * 2;
const page = `file://${join(root, "oogaboogaland.html")}?debug=1&nosim=1&net=0&pos=0&welcome=0&hour=12&time=1200&day=80&rain=0&solo=1&islandworld=0`;
process.env.TZ = "UTC";
const b = await launch({ w: TW * 2, h: TH * 2 + 240 });
let shot;
try {
  await b.open(page);
  const t0 = Date.now();
  while (!(await b.evaluate(`!!window.__ooga && __ooga.renderedFrames >= 4 && __ooga.scene === "hub" && !document.getElementById("curtain")`).catch(() => false))) {
    if (Date.now() - t0 > 90000) throw new Error("the hub did not draw");
    await b.sleep(100);
  }
  // Merge Rock's totems and the island's slow builds finish in idle time; then a few quiet frames.
  const t1 = Date.now();
  while (!(await b.evaluate(`(() => { const s = BL.scenes.hub.debug.repoIsland?.stats(); return !s || s.built === s.chunks; })()`)) && Date.now() - t1 < 60000) await b.sleep(250);
  await b.sleep(1500);
  shot = JSON.parse(await b.evaluate(`(() => {
    const hub = BL.scenes.hub, d = hub.debug, R = __ooga.renderer, M = BL.math.mat4, root = hub.root;
    // A chat's copy of the island: Main Island alone.
    d.copyMode(true);
    // Nothing that moves or speaks: the clouds (the island's own and the Mempool island's deck), Tess and any Ooga or gorilla (solo=1 with no character builds none).
    const hidden = [];
    const hide = (node) => { if (node && node.visible) { node.visible = false; hidden.push(node); } };
    const walk = (node) => { if (node.matrixCloud) hide(node); else for (const child of node.children) walk(child); };
    walk(root);
    d.weather.hold(true);
    hide(d.tess && d.tess.root);
    for (const cave of __ooga.crew.list) hide(cave.root);
    for (const entry of __ooga.clankers.list) hide(entry.root);
    // Drawn across the canvas's whole width, then cut to the picture's shape from its middle.
    const cw = R.size.width, ch = R.size.height, aspect = ${W} / ${H}, span = ${SPAN}, outer = span * ${TW} / ${W}, cut = cw * ${TH} / ${TW};
    if (ch < cut) throw new Error("island-view: the window is too short for the picture");
    const camera = BL.scene.createCamera({ fov: 30, near: 20, far: 700, orthoMix: 1, orthoHeight: outer * ch / cw });
    camera.position = { x: ${MIDDLE.x}, y: 320, z: ${MIDDLE.z} };
    camera.target = { x: ${MIDDLE.x}, y: 0, z: ${MIDDLE.z} };
    camera.up = { x: 0, y: 0, z: -1 };
    const opts = { ...hub.renderOpts, lightCount: 0, cameraFeeds: null, birdsEyeCutaway: false, cutawayFade: 0, cutawayRegionCount: 0, clouds: 0, fog: null, seaFog: false };
    BL.scene.updateWorld(root);
    R.render(root, camera, opts);
    const canvas = document.getElementById("scene"), out = document.createElement("canvas"), sx = canvas.width / cw;
    out.width = ${TW}; out.height = ${TH};
    const g = out.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(canvas, 0, (ch - cut) / 2 * sx, cw * sx, cut * sx, 0, 0, ${TW}, ${TH});
    const url = out.toDataURL("image/webp", 0.82);
    for (const node of hidden) node.visible = true;
    d.copyMode(false);
    d.weather.hold(false);
    // The picture's own matrix: the same view, its projection the picture's shape and span. Checked against the
    // renderer's projection of the canvas, cut as the picture was.
    const view = new Float64Array(16), proj = new Float64Array(16), vp = new Float64Array(16);
    M.lookAt(view, camera.position, camera.target, camera.up);
    BL.scene.cameraProjection(proj, { ...camera, orthoHeight: span / aspect }, aspect);
    M.multiply(vp, proj, view);
    const at = (x, y, z) => { const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      return [((vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w * 0.5 + 0.5) * ${W}, (0.5 - (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w * 0.5) * ${H}]; };
    let worst = 0;
    for (const [x, y, z] of [[0, 0, 0], [40, 5, -30], [-60, 2, 50], [70, 6, 20]]) {
      const p = R.project(x, y, z, {}), q = at(x, y, z);
      worst = Math.max(worst, p ? Math.hypot(p.x * ${TW} / cw - ${PAD[0]} - q[0], (p.y - (ch - cut) / 2) * ${TW} / cw - ${PAD[1]} - q[1]) : Infinity);
    }
    const o = hub.renderOpts, pick = (v) => Array.isArray(v) || ArrayBuffer.isView(v) ? Array.from(v, (n) => Math.round(n * 1e4) / 1e4) : typeof v === "number" ? Math.round(v * 1e4) / 1e4 : v;
    const light = {};
    for (const key of ["clear", "horizon", "zenith", "sky", "ground", "sun", "direct", "light", "sunDirection", "directStrength", "directionalLightStrength", "sunStrength", "ambientFloor", "diffuseFloor", "shadowStrength", "shadowFloor", "shadowBias", "day", "twilight", "sea", "bloomStrength", "sunAltitude", "sunAzimuth", "time"])
      if (o[key] !== undefined && o[key] !== null) light[key] = pick(o[key]);
    return JSON.stringify({ url, matrix: Array.from(vp, (n) => +n.toPrecision(9)), worst, light });
  })()`));
} finally {
  b.close();
  await dispose();
}
if (!(shot.worst < 0.5)) throw new Error(`island-view: the stored matrix misses the renderer's projection by ${shot.worst} px`);
const bytes = Buffer.from(shot.url.slice(shot.url.indexOf(",") + 1), "base64");
writeFileSync(join(root, "src", "ooga-chat", "art", "island-view-main.webp"), bytes);
const header = (what) => `// Generated by scripts/island-view.mjs from the built hub; do not edit.\n// ${what}\n`;
writeFileSync(join(root, "src", "js", "island-view-art.js"), `${header("The island view's map of Main Island (island-view.js), the same picture as src/ooga-chat/art/island-view-main.webp; a hosted page serves it as a file under art/.")}(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  BL.islandViewArt = { main: "data:image/webp;base64,${bytes.toString("base64")}" };
})();
`);
writeFileSync(join(root, "src", "js", "island-view-data.js"), `${header("The island view's map (island-view.js): the picture's size, the capture camera's world-to-picture matrix (column-major, as the renderer's) and the hub's light and sea at that hour,\n// which the opt-in Live view draws under (island-view-live.js); `w` and `h` are the inner 4:3 the matrix maps\n// to, the picture `pad` pixels of sea larger each side.")}(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  BL.islandViewData = Object.freeze({ main: Object.freeze({ w: ${W}, h: ${H}, pad: Object.freeze(${JSON.stringify(PAD)}), matrix: Object.freeze(${JSON.stringify(shot.matrix)}),
    light: Object.freeze(${JSON.stringify(shot.light)}) }) });
})();
`);
console.log(`island-view: src/ooga-chat/art/island-view-main.webp (${(bytes.length / 1024).toFixed(1)} KB), src/js/island-view-art.js, src/js/island-view-data.js; matrix within ${shot.worst.toFixed(3)} px`);
