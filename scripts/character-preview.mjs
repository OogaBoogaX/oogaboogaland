// Draws a character as the game does, from all round, onto one sheet for its player to look at:
// `npm run character:preview -- <handle> ...` writes untracked/character-preview/<handle>.png (git ignores
// untracked/). It opens the source page in the suite's Chrome, builds each Ooga from src/characters through the
// game's own models and renderer in the island's afternoon light, and photographs it standing: the whole figure
// from the front, three-quarter, side and back, then its head, trunk, legs, what it holds and its pet where it has
// one. A name with no file is drawn as the hashed Ooga a new contributor gets, and `<name>:slim` as that Ooga in
// the female build, so a player can see both before choosing. The poses the crew gives an Ooga (walking, a slung
// weapon, a seat, the bed, the hammock) are seen in the studio: npm run character:studio -- <handle>.
// It runs the character files: use it on your own work. Needs Chrome, as the suite does.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dispose, launch } from "../test/browser.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "untracked", "character-preview");
const names = process.argv.slice(2);
if (!names.length) { console.error("Name one or more characters: npm run character:preview -- <handle> [<handle>:slim ...]"); process.exit(1); }
mkdirSync(out, { recursive: true });

// One sheet, drawn in the page: `name` a handle, or a made-up name for the hashed default (`slim` its female build).
const draw = `(name, slim) => {
  const BL = window.BL, S = BL.scene, W = 360, H = 460;
  const host = document.createElement("canvas");
  host.style.cssText = "position:fixed;left:0;top:0;width:" + W + "px;height:" + H + "px;z-index:99999";
  document.body.appendChild(host);
  const renderer = BL.glRenderer.createRenderer(host, { quality: "high" });
  renderer.resize();
  const opts = {
    clear: new Float32Array(3), horizon: new Float32Array(3), zenith: new Float32Array(3), sky: new Float32Array(3), ground: new Float32Array(3),
    sun: new Float32Array(3), direct: new Float32Array(3), light: { x: 0.55, y: 0.78, z: -0.25 }, sunDirection: { x: 0, y: 1, z: 0 },
    moon: { x: 0, y: 1, z: 0 }, moonSun: { x: 0, y: -1, z: 0 }, celestialPole: { x: 0, y: 0.34, z: -0.94 }, starMatrix: new Float32Array(9),
    stars: 0, torch: 0, day: 1, twilight: 0, lampFactor: 0, directStrength: 1, directionalLightStrength: 1, sunStrength: 1, moonStrength: 0,
    moonIllumination: 1, moonPhase: 0.5, ambientFloor: 0.18, diffuseFloor: 0, shadowStrength: 1, shadowFloor: 0, shadowBias: 0.002,
    time: 0, bloomStrength: 0.5, shadowCenter: { x: 0, y: 1, z: 0 }, shadowExtent: 3
  };
  BL.daylight.sample(15, opts, 80);
  const own = !!BL.characters.get(name), traits = BL.contributors.traitsFor(name);
  // The hashed Ooga in the female build keeps its colours and height; it is built under a name of its own, since the
  // models keep one build a name.
  if (!own && slim) Object.assign(traits, { name: name + ":slim", slim: true, build: "slim", belly: traits.belly * 0.8 });
  const cave = BL.models.caveman(traits), stage = S.createNode(), body = cave.root;
  S.addChild(stage, body);
  S.addChild(stage, S.createNode({ geometry: BL.models.box({ w: 14, h: 0.02, d: 14, color: "#c79a5e", offset: { y: -0.01 } }) }));
  const camera = S.createCamera({ fov: 22, near: 0.1, far: 60 }), half = Math.tan(11 * Math.PI / 180);
  // The body is turned and the eye kept on the light's side of it, so every view is lit alike.
  const from = Math.atan2(opts.light.x, opts.light.z) + 0.6;
  const shoot = (yaw, at, reach, up) => {
    body.rotation.y = from + yaw;
    S.updateWorld(stage);
    const t = at(), dist = reach / half;
    camera.target.x = t[0]; camera.target.y = t[1]; camera.target.z = t[2];
    camera.position.x = t[0] + Math.sin(from) * dist; camera.position.z = t[2] + Math.cos(from) * dist; camera.position.y = t[1] + up * dist;
    renderer.render(stage, camera, opts);
    const copy = document.createElement("canvas");
    copy.width = host.width; copy.height = host.height;
    copy.getContext("2d").drawImage(host, 0, 0);
    return copy;
  };
  // A part's middle and reach in the world, from its own mesh and the meshes under it.
  const measure = (node) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const walk = (n) => {
      if (n.visible === false) return;
      const v = n.geometry && n.geometry.verts, m = n.world;
      if (v) for (let i = 0; i < v.length; i += 3) for (let a = 0; a < 3; a++) {
        const p = m[a] * v[i] + m[4 + a] * v[i + 1] + m[8 + a] * v[i + 2] + m[12 + a];
        lo[a] = Math.min(lo[a], p); hi[a] = Math.max(hi[a], p);
      }
      n.children.forEach(walk);
    };
    walk(node);
    return { at: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], reach: Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 };
  };
  const whole = (yaw) => shoot(yaw, () => { const m = measure(body); return [0, m.at[1], 0]; }, 1.12, 0.1);
  const part = (node, yaw, room = 1.15) => shoot(yaw, () => measure(node).at, (S.updateWorld(stage), measure(node).reach) * room, 0.12);
  const P = cave.parts, shots = [["front", whole(0)], ["three-quarter", whole(-0.6)], ["side", whole(-Math.PI / 2)], ["back", whole(Math.PI)]];
  const close = [["head", part(P.head, -0.3)], ["trunk", part(P.torso, -0.3, 1.05)], ["legs", part(P.legR, -0.4, 1.5)]];
  if (P.club && P.club.geometry && P.club.visible !== false) close.push(["held", part(P.club, -0.9)]);
  if (P.dog) close.push(["pet", part(P.dog, -0.5)]);
  const pad = 14, label = 22, title = 40, cols = Math.max(shots.length, close.length), w = host.width, h = host.height;
  const sheet = document.createElement("canvas");
  sheet.width = pad + cols * (w + pad); sheet.height = title + 2 * (label + h + pad);
  const g = sheet.getContext("2d");
  g.fillStyle = "#14171c"; g.fillRect(0, 0, sheet.width, sheet.height);
  g.fillStyle = "#ffd257"; g.font = "600 " + Math.round(w / 16) + "px system-ui, sans-serif"; g.textBaseline = "middle";
  g.fillText(name + (own ? "" : slim ? " (no file yet: the default Ooga, female build)" : " (no file yet: the default Ooga)"), pad, title / 2 + 4);
  g.fillStyle = "#d8dde6"; g.font = Math.round(w / 22) + "px system-ui, sans-serif";
  [shots, close].forEach((row, r) => row.forEach(([text, image], c) => {
    const x = pad + c * (w + pad), y = title + r * (label + h + pad);
    g.fillText(text, x, y + label / 2);
    g.drawImage(image, x, y + label);
  }));
  renderer.dispose();
  host.remove();
  return sheet.toDataURL("image/png");
}`;

const b = await launch({ w: 1200, h: 900 });
try {
  await b.open(`file://${join(root, "src", "index.html")}?debug=1&nosim=1&net=0&pos=0&welcome=0&hour=12&day=80&scene=lab`);
  const t0 = Date.now();
  while (!(await b.evaluate("!!(window.__ooga && window.__ooga.scene)").catch(() => false))) {
    if (Date.now() - t0 > 30000) throw new Error("The page did not start. Run npm run build first, and check the character file loads.");
    await b.sleep(100);
  }
  for (const arg of names) {
    const slim = arg.endsWith(":slim"), name = slim ? arg.slice(0, -5) : arg;
    if (!/^[A-Za-z0-9-]{1,39}$/.test(name)) { console.error(`${arg}: a handle is letters, digits and hyphens.`); process.exitCode = 1; continue; }
    const png = await b.evaluate(`(${draw})(${JSON.stringify(name)}, ${slim})`);
    const file = join(out, `${name}${slim ? "-slim" : ""}.png`);
    writeFileSync(file, Buffer.from(png.split(",")[1], "base64"));
    console.log(`untracked/character-preview/${name}${slim ? "-slim" : ""}.png`);
  }
} finally {
  b.close();
  await dispose();
}
