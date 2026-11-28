// node scripts/clanker/catalog/render.mjs [names...] : each current gorilla outfit (BL.agent, as the game builds it)
// beside the new clanker (BL.clankerModel, from src/js/clanker-model.js) dressed for the same place, in the character
// studio with everything else hidden; front and three-quarter views, upright and on all fours, written to
// untracked/clanker-outfits/<name>.png (gitignored) and a sheet of all of them, sheet.png. The outfits are in outfits.mjs,
// the new body's first-pass dressing in dress.js.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { launch, dispose } from "../../../test/browser.mjs";
import { OUTFITS, HELP } from "./outfits.mjs";
const HERE = new URL(".", import.meta.url).pathname, ROOT = new URL("../../../", import.meta.url).pathname, DIR = ROOT + "untracked/clanker-outfits/"; mkdirSync(DIR, { recursive: true });
const only = process.argv.slice(2), list = OUTFITS.filter((o) => !only.length || only.includes(o.name));
const b = await launch({ w: 1000, h: 800 });
try {
  await b.open(`file://${ROOT}src/index.html?debug=1&nosim=1&scene=studio&character=w-s-bitcoin&hour=13&day=80&pos=0&welcome=0`);
  for (let i = 0; i < 200; i++) { if (await b.evaluate("!!(window.__ooga && __ooga.scene && __ooga.studio)").catch(() => false)) break; await b.sleep(150); }
  await b.sleep(1000);
  await b.evaluate(readFileSync(ROOT + "src/js/clanker-model.js", "utf8")); await b.evaluate(readFileSync(HERE + "dress.js", "utf8")); await b.evaluate(HELP);
  console.log("scale for the new body", await b.evaluate("JSON.stringify({ SCALE: __H.SCALE, OLDH: __H.OLDH, NEWH: __H.NEWH })"));
  await b.evaluate(`(() => { const s = __ooga.studio; s.toggle("free", true); const cv = document.getElementById("scene"); document.querySelectorAll("body *").forEach((e) => { if (e !== cv && !e.contains(cv)) e.style.visibility = "hidden"; });
    s.cave.root.visible = false; const Rt = BL.scenes.studio.root; let big = null, bigR = 0;
    for (const c of Rt.children) { if (!c.geometry) { c.visible = false; continue; } const bb = BL.scene.boundsOf(c.geometry); const r = Math.max(bb.max[0] - bb.min[0], bb.max[2] - bb.min[2]); if (r > bigR) { bigR = r; big = c; } c.visible = false; }
    if (big) big.visible = true; window.__stage = BL.scene.createNode(); BL.scene.addChild(Rt, __stage); })()`);
  const shots = [];
  for (const o of list) {
    for (const [view, yaw] of (process.env.VIEWS ? JSON.parse(process.env.VIEWS) : [["front", 0], ["three", 0.75]])) {
      await b.evaluate(`(() => { const St = window.__stage; while (St.children.length) BL.scene.removeChild(St, St.children[0]);
        const ground = () => 0, made = (${o.make})(ground);
        made.old.position.x = -0.9; made.new.position.x = 0.9; for (const n of [made.old, made.new]) { n.position.z = 10; BL.scene.addChild(St, n); }
        Object.assign(__ooga.studio.free, { x: 0, z: 10, y: 1.0, yaw: ${yaw}, pitch: 0.12, dist: 5.6 }); })()`);
      await b.sleep(500); const f = `${DIR}${o.name}-${view}.png`; await b.screenshot(f); shots.push(f);
    }
  }
  const args = ["-loglevel", "error", "-y"]; shots.forEach((f) => args.push("-i", f));
  const rows = []; for (let i = 0; i < shots.length; i += 2) rows.push(`[${i}]crop=760:640:120:80,scale=380:320[a${i}];[${i + 1}]crop=760:640:120:80,scale=380:320[b${i}];[a${i}][b${i}]hstack[r${i}]`);
  args.push("-filter_complex", rows.join(";") + ";" + rows.map((_, k) => `[r${k * 2}]`).join("") + (rows.length > 1 ? `vstack=${rows.length}` : "null"), `${DIR}sheet.png`);
  execFileSync("ffmpeg", args); console.log("wrote", list.map((o) => o.name).join(" "), "and sheet.png");
} finally { await b.close(true); await dispose(); }
