// node scripts/clanker/catalog/hands.mjs [hand|head|torso] [names...] : close-ups, old (left pair) and new (right pair)
// from the side and the front, written to untracked/clanker-outfits/: `hand` every held item in the catalog at its fist
// (hands.png), `head` every hat on its head (heads.png), `torso` the painted and wrapped outfits (torsos.png).
import { readFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { launch, dispose } from "../../../test/browser.mjs";
import { OUTFITS, HELP } from "./outfits.mjs";
const HERE = new URL(".", import.meta.url).pathname, ROOT = new URL("../../../", import.meta.url).pathname, DIR = ROOT + "untracked/clanker-outfits/"; mkdirSync(DIR, { recursive: true });
const MODE = process.argv[2] || "hand", HEAD = MODE !== "hand", PICK = process.argv.slice(3), BODY = Object.fromEntries(["suit0", "suit1", "lab", "lab-flask", "arcade-keeper", "hangar", "poker", "arcade-gamemaster", "arcade-attendant", "arcade-mechanic", "arcade-runner", "arcade-clerk"].map((k) => [k, ["torso", "chest"]])), HATS = { factory: ["head", "head"], hangar: ["head", "head"], "arcade-gamemaster": ["head", "head"], "arcade-attendant": ["head", "head"], "arcade-mechanic": ["head", "head"], "arcade-runner": ["head", "head"], hockey: ["head", "head"], clanktown: ["head", "head"], lab: ["head", "head"], "lab-flask": ["head", "head"] };
const HANDS = { "arcade-gamemaster": ["armR", "foreR"], "arcade-mechanic": ["armL", "foreL"], "arcade-runner": ["armL", "foreL"], "arcade-clerk": ["armL", "foreL"], "arcade-keeper": ["armL", "foreL"], "lab-flask": ["armL", "foreL"], "lab-beaker": ["armL", "foreL"], "lab-die": ["armL", "foreL"] };
const b = await launch({ w: 700, h: 700 });
try {
  await b.open(`file://${ROOT}src/index.html?debug=1&nosim=1&scene=studio&character=w-s-bitcoin&hour=13&day=80&pos=0&welcome=0`);
  for (let i = 0; i < 200; i++) { if (await b.evaluate("!!(window.__ooga && __ooga.scene && __ooga.studio)").catch(() => false)) break; await b.sleep(150); }
  await b.sleep(1000);
  await b.evaluate(readFileSync(ROOT + "src/js/clanker-model.js", "utf8")); await b.evaluate(readFileSync(HERE + "dress.js", "utf8")); await b.evaluate(HELP);
  await b.evaluate(`(() => { const s = __ooga.studio; s.toggle("free", true); const cv = document.getElementById("scene"); document.querySelectorAll("body *").forEach((e) => { if (e !== cv && !e.contains(cv)) e.style.visibility = "hidden"; });
    s.cave.root.visible = false; const Rt = BL.scenes.studio.root; let big = null, bigR = 0;
    for (const c of Rt.children) { if (!c.geometry) { c.visible = false; continue; } const bb = BL.scene.boundsOf(c.geometry); const r = Math.max(bb.max[0] - bb.min[0], bb.max[2] - bb.min[2]); if (r > bigR) { bigR = r; big = c; } c.visible = false; }
    if (big) big.visible = true; window.__stage = BL.scene.createNode(); BL.scene.addChild(Rt, __stage); })()`);
  const rows = [];
  for (const [name, [oldHand, newHand]] of Object.entries(MODE === "head" ? HATS : MODE === "torso" ? BODY : HANDS).filter(([k]) => !PICK.length || PICK.includes(k))) {
    const o = OUTFITS.find((q) => q.name === name), files = [];
    for (const side of (process.env.NEWONLY ? ["new"] : ["old", "new"])) for (const [view, yaw, pitch = 0.1] of (process.env.VIEWS ? JSON.parse(process.env.VIEWS) : [["side", Math.PI / 2], ["front", 0]])) {
      await b.evaluate(`(() => { const St = window.__stage; while (St.children.length) BL.scene.removeChild(St, St.children[0]);
        const made = (${o.make})(() => 0), n = made.${side}; n.position.x = 0; n.position.z = 10; BL.scene.addChild(St, n); BL.scene.updateWorld(n);
        const hand = ${side === "old" ? `(() => { let a = null; (function w(q) { if (q.geometry && q === made.old.__hand) a = q; for (const c of q.children || []) w(c); })(n); return null; })()` : "null"};
        // the fist: the lowest point of the hand's part, in the world
        let part = null; (function w(q) { if (q.__id === "${side === "old" ? oldHand : newHand}") part = q; for (const c of q.children || []) w(c); })(n);
        if (!part) part = ${side === "old" ? `made.oldParts.${oldHand}` : `made.newRig.${newHand}`};
        const V = part.geometry.verts, W = part.world; let lo = [0, 1e9, 0]; for (let i = 0; i < V.length; i += 3) { const y = W[1]*V[i]+W[5]*V[i+1]+W[9]*V[i+2]+W[13]; if (y < lo[1]) lo = [W[0]*V[i]+W[4]*V[i+1]+W[8]*V[i+2]+W[12], y, W[2]*V[i]+W[6]*V[i+1]+W[10]*V[i+2]+W[14]]; }
        ${HEAD ? `{ let c = [0, 0, 0], k = 0; for (let i = 0; i < V.length; i += 3) { c[0] += W[0]*V[i]+W[4]*V[i+1]+W[8]*V[i+2]+W[12]; c[1] += W[1]*V[i]+W[5]*V[i+1]+W[9]*V[i+2]+W[13]; c[2] += W[2]*V[i]+W[6]*V[i+1]+W[10]*V[i+2]+W[14]; k++; } lo = [c[0] / k, c[1] / k + ${MODE === "torso" ? 0 : 0.1}, c[2] / k]; }` : ""}
        Object.assign(__ooga.studio.free, { x: lo[0], z: lo[2], y: lo[1] + ${HEAD ? 0 : 0.12}, yaw: ${yaw}, pitch: ${pitch}, dist: ${MODE === "torso" ? 2.6 : HEAD ? 1.7 : 1.4} }); })()`);
      await b.sleep(450); const f = `${DIR}${MODE}-${name}-${side}-${view}.png`; await b.screenshot(f); files.push(f);
    }
    rows.push(files);
  }
  const all = rows.flat(), args = ["-loglevel", "error", "-y"]; all.forEach((f) => args.push("-i", f));
  const fc = rows.map((r, ri) => r.map((_, k) => `[${ri * r.length + k}]crop=420:420:140:140,scale=240:240[s${ri}_${k}]`).join(";") + ";" + r.map((_, k) => `[s${ri}_${k}]`).join("") + `hstack=${r.length}[r${ri}]`).join(";") + ";" + rows.map((_, ri) => `[r${ri}]`).join("") + `vstack=${rows.length}`;
  args.push("-filter_complex", fc, `${DIR}${MODE}s.png`); execFileSync("ffmpeg", args); console.log("wrote", MODE + "s.png");
} finally { await b.close(true); await dispose(); }
