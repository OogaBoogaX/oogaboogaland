// node scripts/clanker/catalog/labrun.mjs : a gorilla running into EntropyLab through its mouth's veil, standing inside,
// and running back out, on the island at the lab mouth, from one fixed camera: the current gorilla with its lab coat
// clip, then the new clanker with the same change prototyped (a plain copy clipped to the island's side of the coat
// plane, the lab outfit's copy to the cave's, rising onto its hind legs as it goes in). Frames and videos go to
// untracked/clanker-outfits/labrun/ (old.mp4, new.mp4, both.mp4 side by side).
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { launch, dispose } from "../../../test/browser.mjs";
import { HELP } from "./outfits.mjs";
const HERE = new URL(".", import.meta.url).pathname, ROOT = new URL("../../../", import.meta.url).pathname, DIR = ROOT + "untracked/clanker-outfits/labrun/";
const FPS = 30, SECONDS = 5.2, W = 640, H = 480;
const b = await launch({ w: W, h: H });
try {
  await b.open(`file://${ROOT}src/index.html?debug=1&nosim=1&hour=13&day=80&welcome=0&pos=0&solo=1&character=w-s-bitcoin`);
  for (let i = 0; i < 300; i++) { if (await b.evaluate("!!(window.__ooga && __ooga.scene && __ooga.mouths && __ooga.pilot)").catch(() => false)) break; await b.sleep(150); }
  await b.sleep(1500);
  await b.evaluate(readFileSync(ROOT + "src/js/clanker-model.js", "utf8")); await b.evaluate(readFileSync(HERE + "dress.js", "utf8")); await b.evaluate(HELP);
  // The stage: the lab mouth, its coat plane (0.5 m in, as BL.agent.labCoatClip), the camera outside to one side, and
  // everything else that walks hidden.
  await b.evaluate(`(() => { const m = __ooga.mouths[0], sr = Math.sin(m.ry), cr = Math.cos(m.ry), S = BL.scene, Rt = BL.scenes.hub.root;
    for (const c of __ooga.crew.cavemen || []) { const n = c.root || c.node || (c.cave && c.cave.root); if (n) n.visible = false; }
    __ooga.pilot.setExternalControl(true);
    const cv = document.getElementById("scene"); document.querySelectorAll("body *").forEach((e) => { if (e !== cv && !e.contains(cv) && e.tagName !== "CANVAS") e.style.visibility = "hidden"; });
    const limit = sr * m.x + cr * m.z + 0.5, inside = new Float32Array([sr, 0, cr, -limit]), outside = new Float32Array([-sr, 0, -cr, limit]);
    // along: metres out of the cave from the coat plane (negative inside); a point on the path through the mouth's middle
    const at = (along) => ({ x: m.x + sr * (along + 0.5), z: m.z + cr * (along + 0.5) });
    const cam = at(8.5), side = [cr, -sr];
    window.__run = { m, sr, cr, inside, outside, at, cam: { x: cam.x + side[0] * 5.5, y: 2.8, z: cam.z + side[1] * 5.5 }, look: (() => { const p = at(-0.6); return { x: p.x, y: 1.0, z: p.z }; })() };
    // the new rig, plain and in the lab outfit, each clipped to its side
    const clipRig = (r, plane) => { const seen = new Map(), clip = (g) => { if (!g || !g.faces) return g; if (!seen.has(g)) seen.set(g, { ...g, clipPlane: plane }); return seen.get(g); };
      (function walk(n) { if (n === r.sleeveNode) { if (n.geometry) n.geometry.clipPlane = plane; } else if (n.geometry) n.geometry = clip(n.geometry); for (const c of n.children || []) walk(c); })(r.root);
      if (r.chestGeo) r.chestGeo = clip(r.chestGeo); if (r.chestWeld) r.chestWeld = clip(r.chestWeld); };
    const H = __H, plain = H.neu({ upright: false }), coat = H.neu({ upright: true, outfit: "lab" });
    { const v = H.D.visor(); S.addChild(coat.head, S.createNode({ geometry: v.glass }), S.createNode({ geometry: v.frame })); }
    H.vest(coat, H.D.zipper(), { drape: false }); H.vest(coat, H.D.labKit(), { rigid: (x, y, z) => z > 0.3 && Math.abs(y - 0.66) < 0.4 ? 1 : 0, rigidScale: 1, rigidLift: 0.004 });
    clipRig(plain, outside); clipRig(coat, inside);
    for (const r of [plain, coat]) { r.root.visible = false; S.addChild(Rt, r.root); }
    // the current gorilla, with the game's own coat clip
    const old = BL.agent.create({ managed: true, groundAt: () => m.floorY, coatClip: BL.agent.labCoatClip(m) }); old.root.visible = false; S.addChild(Rt, old.root);
    Object.assign(__run, { plain, coat, old }); })()`);
  // The run: in from 5 m out to 2.8 m inside (1.7 s), standing (0.6 s), turning (0.4 s), out to 5 m (1.7 s), still (0.8 s).
  const pathAt = (t) => { const IN = 1.7, STAND = 0.6, TURN = 0.4, OUT = 1.7, A = 5, B = -2.8;
    if (t < IN) { const k = t / IN; return { along: A + (B - A) * k, facing: "in", speed: (A - B) / IN }; } t -= IN;
    if (t < STAND) return { along: B, facing: "in", speed: 0 }; t -= STAND;
    if (t < TURN) return { along: B, facing: "turn", turn: t / TURN, speed: 0 }; t -= TURN;
    if (t < OUT) { const k = t / OUT; return { along: B + (A - B) * k, facing: "out", speed: (A - B) / OUT }; }
    return { along: A, facing: "out", speed: 0 }; };
  for (const who of ["old", "new"]) {
    const out = DIR + who + "/"; rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
    await b.evaluate(`(() => { __run.old.root.visible = ${who === "old"}; __run.plain.root.visible = __run.coat.root.visible = ${who === "new"}; __run.dist = 0; __run.t = 0; })()`);
    const N = Math.round(SECONDS * FPS);
    for (let f = 0; f < N; f++) {
      const p = pathAt(f / FPS);
      await b.evaluate(`(() => { const R = __run, p = ${JSON.stringify(p)}, dt = ${1 / FPS}, m = R.m, pos = R.at(p.along), S = BL.scene, cam = __ooga.camera;
        // facing: into the cave is away from (sr, cr); turning swings round through the side the camera is on
        const yawIn = Math.atan2(-R.sr, -R.cr), yaw = p.facing === "in" ? yawIn : p.facing === "out" ? yawIn + Math.PI : yawIn + Math.PI * p.turn;
        R.dist += p.speed * dt; const inside = p.along < 0;
        if (${who === "old"}) { R.old.poseManaged(dt, pos.x, m.floorY, pos.z, yaw, p.speed, false, inside, "", { lab: inside, walkPhase: NaN }); }
        else { const up = Math.max(0, Math.min(1, (0.3 - p.along) / 1.6)), t = up * up * (3 - 2 * up), run = p.speed > 0.1;
          const gait = run ? { phase: R.dist * (t > 0.5 ? 2.6 : 2.2), amp: t > 0.5 ? 22 : 30, lift: 24, sway: 3 } : null;
          for (const r of [R.plain, R.coat]) { BL.clankerModel.pose(r, t, gait, {}); r.root.position.x = pos.x; r.root.position.z = pos.z; r.root.position.y += m.floorY; r.root.rotation = { x: 0, y: yaw, z: 0 }; S.updateWorld(r.root); } }
        cam.position.x = R.cam.x; cam.position.y = R.cam.y; cam.position.z = R.cam.z; cam.target.x = R.look.x; cam.target.y = R.look.y; cam.target.z = R.look.z; })()`);
      await b.sleep(60);
      await b.evaluate(`(() => { const R = __run, cam = __ooga.camera; cam.position.x = R.cam.x; cam.position.y = R.cam.y; cam.position.z = R.cam.z; cam.target.x = R.look.x; cam.target.y = R.look.y; cam.target.z = R.look.z; })()`);
      await b.sleep(40);
      await b.screenshot(out + String(f).padStart(4, "0") + ".png");
    }
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-framerate", String(FPS), "-i", out + "%04d.png", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-vf", "scale=640:-2", DIR + who + ".mp4"]);
    console.log("wrote", who + ".mp4");
  }
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", DIR + "old.mp4", "-i", DIR + "new.mp4", "-filter_complex", "[0][1]hstack", "-c:v", "libx264", "-pix_fmt", "yuv420p", DIR + "both.mp4"]);
  console.log("wrote both.mp4");
} finally { await b.close(true); await dispose(); }
