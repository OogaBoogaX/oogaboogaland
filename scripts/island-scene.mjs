// Bakes the island view's 3D scenery (src/js/island-scene.js; docs/ooga-chat-hosts.md, "The island view"):
// `node scripts/island-scene.mjs`, after `npm run build`. The built hub in the suite's Chrome at midday on a fixed day,
// switched into a chat's copy mode (the hub's debug `copyMode`: Main Island alone, HQ's ramps open, every other mouth
// sealed, no other island, bridge, Oogatron, mirror or sign over a sealed mouth), with its Oogas, gorillas and Tess
// left out. Every node still drawn is sorted into the layers island-scene.js names: `base` the ground and the banana
// pile, `trees` and `trees-medium` the trees and bushes with foliage detail at their whole and medium meshes, `grass` the
// lawn's tufts (the hub's one instanced batch, each tuft a place), `props` everything else a metre and more across,
// `details` the rest, and `sky` the copy's clouds (no places: their meshes, plain and benched, each benched shape's seat
// glows, and the deal, which the view moves by the clock). The paths' tiles (25,000-odd instances the renderer cuts to
// their outline by each tile's neighbours) are baked into `base` as one road mesh already cut the same way (marching
// squares at the half line), full tiles merged along their rows. Any other instanced batch that holds still over a
// second and a half (the altar's rings) is a place an instance. Pictures, glass, clipped and projected surfaces, lines,
// anything that moves (a fire's flame is kept as where it burns), anything out at sea (FAR) and anything buried (HQ, its
// basement, the caves' insides: more than 3 m under the ground on every side) are left out. Each layer keeps the hub's
// own models, each once with its normals, smooth shading, block detail, shadow casting and wind, and every place one
// stands, and as its meta the hub's lamps whose glow stands there (and in `props` those that only light), the glow of
// any other place whose glow is not 1, and the fires; written gzipped to src/ooga-chat/art/island-scene-<layer>.bin.gz
// (Ooga Chat's lazy art). The clouds' deal is checked against the hub's own placing at three moments. Run it again when
// the island's look changes.
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { dispose, launch } from "../test/browser.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// How far from the island's middle a mesh may stand (its rim is about 56 m out).
const FAR = 90;
const page = `file://${join(root, "oogaboogaland.html")}?debug=1&nosim=1&net=0&pos=0&welcome=0&hour=12&time=1200&day=80&rain=0&solo=1&islandworld=0`;
process.env.TZ = "UTC";
const b = await launch({ w: 800, h: 600 });
let baked;
try {
  await b.open(page);
  const t0 = Date.now();
  while (!(await b.evaluate(`!!window.__ooga && __ooga.renderedFrames >= 4 && __ooga.scene === "hub" && !document.getElementById("curtain")`).catch(() => false))) {
    if (Date.now() - t0 > 90000) throw new Error("island-scene: the hub did not draw");
    await b.sleep(100);
  }
  await b.sleep(1500);
  await b.evaluate(readFileSync(join(root, "src", "js", "island-scene.js"), "utf8"));
  await b.evaluate(readFileSync(join(root, "src", "js", "island-view-live.js"), "utf8"));
  // Copy mode, and every instanced batch drawn as it stands now, to tell the still ones from the moving.
  await b.evaluate(`(() => {
    const d = BL.scenes.hub.debug;
    if (typeof d.copyMode !== "function" || !d.copy.sky) throw new Error("island-scene: the hub has no copyMode debug handle");
    d.copyMode(true);
    const still = window.__ivStill = new Map();
    const walk = (node) => { if (!node || node.visible === false) return; if (node.instanceData && node.geometry) still.set(node, node.instanceData.slice(0, node.instanceCount * 20)); for (const child of node.children || []) walk(child); };
    walk(BL.scenes.hub.root);
  })()`);
  await b.sleep(1500);
  baked = JSON.parse(await b.evaluate(`(() => {
    const hub = BL.scenes.hub, d = hub.debug, root = hub.root, C = BL.compactGeometry, S = BL.islandScene, M = BL.math.mat4;
    const hidden = [];
    const hide = (node) => { if (node && node.visible) { node.visible = false; hidden.push(node); } };
    hide(d.tess && d.tess.root);
    for (const cave of __ooga.crew.list) hide(cave.root);
    for (const entry of __ooga.clankers.list) hide(entry.root);
    BL.scene.updateWorld(root);
    // An instanced batch that held still: the same instances, unmoved.
    const held = (node) => { const was = window.__ivStill.get(node), now = node.instanceData; if (!was || was.length !== node.instanceCount * 20) return false; for (let i = 0; i < was.length; i++) if (was[i] !== now[i]) return false; return true; };
    // What a distant view never needs, or cannot draw from colours alone.
    const skipped = (node, g) => node.matrixCloud || node.smokeOpacity !== undefined && node.smokeOpacity < 1 || g.characterPart || g.imageSurface || g.glass || g.glassShell
      || g.glassOpacity || g.projective || g.clipSlab || g.clipSlab2 || g.clipMinY !== undefined || g.clipMaxY !== undefined || g.clipPlane || g.lightBeam
      || g.reflector || g.mirrorRippleOnly || g.portalSurface || g.matrixGlyph || g.lakeBody || g.lakeWaves || g.surfaceOverlay
      || g.meshRig || g.dynamic;
    // The ground: the island's terrain (its meshes all share the largest one's vertices) and the banana pile.
    let terrain = null, most = 0;
    const largest = (node) => { if (!node || node.visible === false) return; const g = node.geometry, c = g && (g.compactGeometry ? g.compactGeometry.count : g.faces ? g.faces.length : 0);
      if (c > most) { most = c; terrain = g.verts; } for (const child of node.children || []) largest(child); };
    largest(root);
    const ground = (g) => g.verts === terrain || !!g.cutawaySource || !!g.pileRings;
    // Each layer: its models (the hub's own geometries, each once), every place one stands and its meta.
    const layers = {}; for (const name of S.LAYERS) layers[name] = { index: new Map(), meshes: [], places: [], meta: {} };
    let taken = 0, left = 0, deep = 0;
    // Underground, out of any view from above (HQ, its basement and the caves' insides): more than DEEP metres under the
    // island's ground on every side. A cliff's wall, open to the air on one side, stays. A model used once (the ground)
    // loses its buried faces; any other is dropped where it stands buried.
    const DEEP = 3, isl = d.island;
    const buried = (x, y, z) => isl.onLand(x, z) && [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].every(([dx, dz]) => isl.heightAt(x + dx, z + dz) > y + DEEP);
    const count = (g) => g.compactGeometry ? g.compactGeometry.count : g.faces ? g.faces.length : 0;
    // How many places each geometry stands in, for the buried faces' rule.
    const uses = new Map();
    const tally = (node) => { if (!node || node.visible === false) return; if (node.geometry) uses.set(node.geometry, (uses.get(node.geometry) || 0) + 1); for (const child of node.children || []) tally(child); };
    tally(root);
    // A geometry as a model: only the vertices its faces use, its faces (all drawn ones; supportOnly faces are collision),
    // its colours and emissive values, and the sidecars the renderer reads.
    const model = (g, m) => {
      const v = g.verts, remap = new Int32Array(v.length / 3).fill(-1), cur = C.createCursor(g), n = count(g), once = (uses.get(g) || 0) <= 1;
      const out = { smooth: !!g.smooth, castShadow: g.castShadow !== false, voxel: g.voxel ? Array.from(g.voxel) : null, sway: g.sway || 0, swing: g.swing || 0, depthOffset: !!g.depthOffset,
        positions: [], normals: g.normals ? [] : null, corners: [], indices: [], colors: [], emissive: [] };
      for (let f = 0; f < n; f++) {
        const face = C.readFace(g, f, cur);
        if (face.supportOnly) continue;
        const k = face.i.length;
        if (k < 3 || k > 255) continue;
        if (once && m) {
          let cx = 0, cy = 0, cz = 0;
          for (let j = 0; j < k; j++) { const i = face.i[j], x = v[i * 3], y = v[i * 3 + 1], z = v[i * 3 + 2]; cx += m[0] * x + m[4] * y + m[8] * z + m[12]; cy += m[1] * x + m[5] * y + m[9] * z + m[13]; cz += m[2] * x + m[6] * y + m[10] * z + m[14]; }
          if (buried(cx / k, cy / k, cz / k)) { deep++; continue; }
        }
        out.corners.push(k);
        for (let j = 0; j < k; j++) {
          const i = face.i[j];
          if (remap[i] < 0) {
            remap[i] = out.positions.length / 3;
            out.positions.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
            if (out.normals) out.normals.push(g.normals[i * 3] || 0, g.normals[i * 3 + 1] || 0, g.normals[i * 3 + 2] || 0);
          }
          out.indices.push(remap[i]);
        }
        const c = face.color;
        out.colors.push(c[0] | 0, c[1] | 0, c[2] | 0);
        out.emissive.push(typeof face.emissive === "number" && face.emissive > 0 ? face.emissive : 0);
      }
      return out.corners.length ? out : null;
    };
    // A geometry's model in a layer, made the first time it is seen there (-1: nothing of it is drawn).
    const meshOf = (name, g, m) => {
      const L = layers[name];
      let index = L.index.get(g);
      if (index === undefined) {
        const made = model(g, m);
        index = made ? L.meshes.push(made) - 1 : -1;
        L.index.set(g, index);
      }
      return index;
    };
    // Where each node stands (its layer and place), for its lamp or its glow.
    const placeOf = new Map();
    // A geometry standing under a node's world matrix, into a layer.
    const add = (name, g, m, node) => {
      const index = meshOf(name, g, m);
      if (index < 0) return -1;
      const L = layers[name];
      L.places.push({ mesh: index, matrix: Array.from(m) });
      if (node && !placeOf.has(node)) placeOf.set(node, { name, place: L.places.length - 1 });
      taken++;
      return L.places.length - 1;
    };
    // The paths: the island's path tiles as one road mesh, in world space, each tile cut to the part the renderer keeps
    // (gl-renderer.js \`roadCut\`: each corner the share of road among the four tiles meeting there, from the tile's
    // eight-neighbour mask in its glow as 1 + mask, kept where the bilinear share is at least a half), the cut taken
    // straight between the corners (marching squares), full tiles at one height merged along their rows. Drawn with
    // every neighbour set (a glow of 256), so nothing more is cut.
    const ROAD_GLOW = 256;
    const roadOf = (node) => {
      const data = node.instanceData, unit = Math.abs(node.geometry.verts[3] - node.geometry.verts[0]), h = unit / 2, out = [], cell = new Map();
      const keyOf = (x) => Math.round(x / unit * 2);
      const quad = (pts, y) => { if (pts.length >= 3) out.push({ pts, y }); };
      for (let i = 0; i < node.instanceCount; i++) {
        const o = i * 20, x = data[o + 12], y = data[o + 13], z = data[o + 14], mask = Math.round(data[o + 16]) - 1, b = (k) => (mask >> k) & 1;
        const c00 = (1 + b(1) + b(3) + b(7)) / 4, c10 = (1 + b(0) + b(3) + b(6)) / 4, c01 = (1 + b(1) + b(2) + b(5)) / 4, c11 = (1 + b(0) + b(2) + b(4)) / 4;
        if (c00 >= 0.5 && c10 >= 0.5 && c01 >= 0.5 && c11 >= 0.5) {
          const row = keyOf(z) + ":" + Math.round(y * 1000);
          (cell.get(row) || cell.set(row, { z, y, xs: [] }).get(row)).xs.push(x);
          continue;
        }
        // Round the tile from its -x -z corner: each corner kept, and the crossing of the half line on each edge.
        const corners = [[-h, -h, c00], [h, -h, c10], [h, h, c11], [-h, h, c01]], pts = [];
        for (let k = 0; k < 4; k++) {
          const [ax, az, fa] = corners[k], [bx, bz, fb] = corners[(k + 1) % 4];
          if (fa >= 0.5) pts.push([x + ax, z + az]);
          if (fa >= 0.5 !== fb >= 0.5) { const t = (0.5 - fa) / (fb - fa); pts.push([x + ax + (bx - ax) * t, z + az + (bz - az) * t]); }
        }
        const clean = pts.filter((p, k) => { const q = pts[(k + 1) % pts.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6; });
        quad(clean, y);
      }
      for (const { z, y, xs } of cell.values()) {
        xs.sort((a, b) => a - b);
        for (let i = 0; i < xs.length;) {
          let j = i;
          while (j + 1 < xs.length && Math.abs(xs[j + 1] - xs[j] - unit) < unit * 0.01) j++;
          quad([[xs[i] - h, z - h], [xs[j] + h, z - h], [xs[j] + h, z + h], [xs[i] - h, z + h]], y);
          i = j + 1;
        }
      }
      // As the tile's own face: wound to face up (PATH_TILE's corners run -x -z, -x +z, +x +z, +x -z), its colour.
      const color = node.geometry.faces[0].color, mesh = { smooth: false, castShadow: node.geometry.castShadow !== false, voxel: null, sway: 0, swing: 0, road: true, depthOffset: true,
        positions: [], normals: null, corners: [], indices: [], colors: [], emissive: [] };
      for (const { pts, y } of out) {
        const at = mesh.positions.length / 3;
        for (let k = pts.length - 1; k >= 0; k--) mesh.positions.push(pts[k][0], y, pts[k][1]);
        mesh.corners.push(pts.length);
        for (let k = 0; k < pts.length; k++) mesh.indices.push(at + k);
        mesh.colors.push(color[0] | 0, color[1] | 0, color[2] | 0);
        mesh.emissive.push(0);
      }
      return mesh;
    };
    // The lawn: one instanced batch, each tuft its own place (the node's world times the tuft's matrix).
    const lawn = d.copy.lawn, tuft = M.create(), identity = M.create();
    const fires = [], instanceGlows = [];
    const walk = (node) => {
      if (!node || node.visible === false) return;
      const g = node.geometry, m = node.world;
      // A fire's flame moves: where it burns, for the view's own flame (blaze.js), not its blocks.
      if (node.lampRig) {
        if (!buried(m[12], m[13] + 0.5, m[14]) && Math.hypot(m[12], m[14]) <= ${FAR}) fires.push([m[12], m[13], m[14]].map((n) => Math.round(n * 1000) / 1000));
        return;
      }
      if (node === lawn && g) {
        const data = node.instanceData;
        for (let i = 0; i < node.instanceCount; i++) { M.multiply(tuft, m, data.subarray(i * 20, i * 20 + 16)); add("grass", g, tuft, null); }
        return;
      }
      if (g && node.instanceData && g.faces && g.faces[0] && g.faces[0].road) {
        const road = roadOf(node), name = "base", L = layers[name], index = L.meshes.push(road) - 1;
        L.places.push({ mesh: index, matrix: Array.from(identity) });
        (L.meta.glows ||= []).push([L.places.length - 1, ROAD_GLOW]);
        taken++;
        return;
      }
      // Another instanced batch that held still (the altar's rings): a place an instance, with its own glow; a moving
      // one (critters, gulls) has no single place.
      if (g && node.instanceData && count(g) && held(node) && !skipped(node, g) && Math.hypot(m[12], m[14]) <= ${FAR}) {
        const data = node.instanceData, b = BL.scene.boundsOf(g), name = b.radius >= 0.5 ? "props" : "details";
        for (let i = 0; i < node.instanceCount; i++) {
          M.multiply(tuft, m, data.subarray(i * 20, i * 20 + 16));
          const place = add(name, g, tuft, null), glow = data[i * 20 + 16];
          if (place >= 0 && glow !== 1 && Number.isFinite(glow)) instanceGlows.push([name, place, glow]);
        }
        for (const child of node.children || []) walk(child);
        return;
      }
      if (g && count(g)) {
        // The sea round the island (its boats) is not the island.
        if (skipped(node, g) || node.instanceData || Math.hypot(m[12], m[14]) > ${FAR}) left++;
        else if (ground(g)) add("base", g, m, node);
        else {
          const b = BL.scene.boundsOf(g), c = b.center, scale = Math.max(Math.abs(node.scale?.x ?? 1), Math.abs(node.scale?.y ?? 1), Math.abs(node.scale?.z ?? 1)), r = b.radius * scale;
          const x = m[0] * c[0] + m[4] * c[1] + m[8] * c[2] + m[12], y = m[1] * c[0] + m[5] * c[1] + m[9] * c[2] + m[13], z = m[2] * c[0] + m[6] * c[1] + m[10] * c[2] + m[14];
          if (r < 6 && buried(x, y + r, z)) { deep++; left++; }
          else if (g.foliageLods) { add("trees", g, m, node); add("trees-medium", g.foliageLods.medium || g, m, null); }
          else add(r >= 0.5 ? "props" : "details", g, m, node);
        }
      }
      for (const child of node.children || []) walk(child);
    };
    walk(root);
    layers.props.meta.fires = fires;
    for (const [name, place, glow] of instanceGlows) (layers[name].meta.glows ||= []).push([place, Math.round(glow * 1000) / 1000]);
    // The lamps (the hub's addLamp): each whose glow node stands in a layer goes with that layer, and its light (a
    // fire's and a dressing light's have nothing else) with the props, so a lamp among the small details still lights the
    // tier that leaves them out; none of the other islands' (copyOff) or under the Mempool island's rock (reach). Its
    // glow by its mode, as the hub ramps it, and its light as the hub chooses it.
    const r3 = (n) => Math.round(n * 1000) / 1000;
    const lampNodes = new Set();
    let lampCount = 0;
    d.copy.lamps.forEach((l, i) => {
      if (l.copyOff || l.reach > 0) return;
      const at = placeOf.get(l.node);
      if (!at && !l.light) return;
      const mode = l.always ? 1 : l.nightOnly ? 2 : 0, k = l.kind;
      const record = (place, light) => [place, mode, k.glow, l.order === Infinity ? 99 : l.order, light, r3(l.x), r3(l.y), r3(l.z), k.radius, k.r, k.g, k.b, i, l.pileProfile ? 1 : 0, l.centerLight ? 1 : 0, l.node.lampRig ? 1 : 0];
      if (at && (at.name === "props" || !l.light)) (layers[at.name].meta.lamps ||= []).push(record(at.place, l.light ? 1 : 0));
      else {
        if (at) (layers[at.name].meta.lamps ||= []).push(record(at.place, 0));
        (layers.props.meta.lamps ||= []).push(record(-1, 1));
      }
      if (at) lampNodes.add(l.node);
      lampCount++;
    });
    // Any other place whose glow is not the renderer's 1 keeps it.
    for (const [node, at] of placeOf) if (!lampNodes.has(node) && node.glow !== 1 && Number.isFinite(node.glow)) (layers[at.name].meta.glows ||= []).push([at.place, r3(node.glow)]);
    // The sky: the copy's clouds as layoutClouds deals them, their meshes (plain and benched by shape), each benched
    // shape's three seats and the glow under each, and the deal the view moves by the clock.
    const sky = d.copy.sky(), shapes = [...new Set(sky.clouds.map((c) => c.shape))].sort();
    const plain = [], bench = [], seats = [], glows = [];
    for (const shape of shapes) {
      const cloud = sky.clouds.find((c) => c.shape === shape), benched = cloud.bench || BL.hubModels.benchCloud(shape);
      plain[shape] = meshOf("sky", cloud.plain || BL.hubModels.cloud(shape), null);
      bench[shape] = meshOf("sky", benched, null);
      seats[shape] = sky.seats(benched).map((s) => [r3(s.x), r3(s.y), r3(s.z)]);
      glows[shape] = sky.seats(benched).map((s) => meshOf("sky", BL.hubModels.cloudSeatGlow(benched, s.x, s.y, s.z), null));
    }
    layers.sky.meta.clouds = { epoch: sky.epoch, crossings: sky.crossings, swing: sky.swing, plain, bench, seats, glows,
      list: sky.clouds.map((c) => [c.shape, c.speed, c.phase, c.radius, c.baseY, c.waveY, sky.benches.indexOf(c)]) };
    // The view's placing (island-view-live.js \`cloudAt\`) checked against the hub's own at three moments.
    const plan = BL.islandViewLive.cloudPlan(layers.sky.meta.clouds), at = {};
    let worst = 0;
    for (const t of [0, 1234.5, 2e6 + 0.25]) {
      d.copy.setClouds(t);
      sky.clouds.forEach((c, i) => {
        BL.islandViewLive.cloudAt(plan, i, t, at);
        const p = c.node.position, turn = Math.abs(Math.atan2(Math.sin(at.yaw - c.node.rotation.y), Math.cos(at.yaw - c.node.rotation.y)));
        worst = Math.max(worst, Math.hypot(at.x - p.x, at.y - p.y, at.z - p.z), turn);
      });
    }
    if (!(worst < 1e-6)) throw new Error("island-scene: the view's clouds miss the hub's by " + worst);
    for (const node of hidden) node.visible = true;
    d.copyMode(false);
    // Each layer encoded, as base64.
    const out = {}, stats = {};
    for (const name of S.LAYERS) {
      const L = layers[name], bytes = new Uint8Array(S.encode(L.meshes, L.places, L.meta));
      let text = "";
      for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      out[name] = btoa(text);
      stats[name] = { meshes: L.meshes.length, places: L.places.length, faces: L.meshes.reduce((n, m) => n + m.corners.length, 0), bytes: bytes.length, lamps: (L.meta.lamps || []).length };
    }
    return JSON.stringify({ out, stats, taken, left, deep, lamps: lampCount, fires: fires.length, worst });
  })()`));
} finally {
  b.close();
  await dispose();
}
for (const [name, text] of Object.entries(baked.out)) {
  const plain = Buffer.from(text, "base64"), packed = gzipSync(plain, { level: 9 });
  writeFileSync(join(root, "src", "ooga-chat", "art", `island-scene-${name}.bin.gz`), packed);
  const s = baked.stats[name];
  console.log(`island-scene: ${name}: ${s.meshes} models in ${s.places} places (${s.lamps} lamps), ${s.faces} faces, ${(plain.length / 1048576).toFixed(2)} MB, ${(packed.length / 1048576).toFixed(3)} MB gzipped`);
}
console.log(`island-scene: ${baked.taken} meshes taken, ${baked.left} left out, ${baked.deep} faces underground left out; ${baked.lamps} lamps, ${baked.fires} fires; clouds within ${baked.worst}`);
