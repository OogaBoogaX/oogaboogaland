// Reuse the suite's exact workload and acceptance conditions; --cpu adds sampling overhead.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { launch, dispose } from "../test/browser.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)), cpu = process.argv.includes("--cpu");
const source = readFileSync(new URL("../test/run.mjs", import.meta.url), "utf8");
const first = source.indexOf("const wallPerformance ="), last = source.indexOf("const adaptiveQualityChecks =", first);
if (first < 0 || last < 0) throw new Error("The suite's wallPerformance workload was not found");
const rows = [], run = new Function("record", source.slice(first, last) + ";return wallPerformance;")((name, pass, detail) => rows.push({ name, pass, details: JSON.parse(detail) }));
const output = join(root, "untracked");
mkdirSync(output, { recursive: true });
let b;
try {
  b = await launch({ w: 1920, h: 1080, perf: true, motion: true });
  await b.open(new URL("../oogaboogaland.html?debug=1&nosim=1&hour=12&day=80&bananas=1000", import.meta.url).href);
  const begun = Date.now();
  while (!await b.evaluate('!!window.__ooga && __ooga.renderedFrames >= 2 && !document.getElementById("curtain")')) {
    if (Date.now() - begun > 20000) throw new Error("The hub did not draw");
    await b.sleep(40);
  }
  await b.evaluate('new Promise(resolve => { const begun = performance.now(); const tick = () => { if (BL.scene.tweenCount() === 0 || performance.now() - begun > 4000) resolve(); else requestAnimationFrame(tick); }; tick(); })');
  if (cpu) { await b.send("Profiler.enable"); await b.send("Profiler.start"); }
  await run(b);
  if (rows.length !== 2) throw new Error("The suite's ordinary and covered movement results were not both recorded");
  const hot = [];
  if (cpu) {
    const { profile } = (await b.send("Profiler.stop")).result, samples = new Map();
    for (const id of profile.samples || []) samples.set(id, (samples.get(id) || 0) + 1);
    hot.push(...profile.nodes.map(node => ({ function: node.callFrame.functionName, line: node.callFrame.lineNumber + 1, samples: samples.get(node.id) || 0 })).sort((a, b) => b.samples - a.samples).slice(0, 30));
    writeFileSync(join(output, "covered-movement.cpuprofile"), JSON.stringify(profile));
  }
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  const evidence = { capturedAt: new Date().toISOString(), suiteSha256: hash(source), pageSha256: hash(readFileSync(new URL("../oogaboogaland.html", import.meta.url))), browser: (await b.send("Browser.getVersion")).result.product, cpuProfilerEnabled: cpu, rows, hot, stats: await b.evaluate("__ooga.headquarters.objectGuides.stats"), logs: b.logs };
  writeFileSync(join(output, "covered-movement-profile.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
  if (rows.some(row => !row.pass) || b.logs.length) process.exitCode = 1;
} finally { if (b) b.close(); await dispose(); }
