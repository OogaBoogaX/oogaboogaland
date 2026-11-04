// Manual trace provenance: run from a checkout containing this local base commit.
// Reads git source only; no fetch, browser, production or network operation.
// The source functions execute unchanged with authored test adapters injected as
// their original lexical dependencies. This is not a copy of their algorithm.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import { record, scenarios } from "../worker/test/fixtures/npc-work-fixture.mjs";
const base = "17659ddfa0079f24bea84d872e29e532530bd7e4";
const source = execFileSync("git", ["show", `${base}:src/js/crew.js`], {
  cwd: new URL("../", import.meta.url), encoding: "utf8",
});
const section = (a, b) => {
  const start = source.indexOf(a), end = source.indexOf(b, start);
  if (start < 0 || end <= start) throw new Error("original work source boundary missing");
  return source.slice(start, end);
};
const original = section("    const planWorkSite =", "    const walkWorkTo =")
  + section("    const runWork =", "    const quoteFor =");
const sourceSha256 = createHash("sha256").update(original).digest("hex");
if (sourceSha256 !== "5ed373151c2eb476ebb3f2b744806185f8e2d2e754436e0582f076f6a790de12") throw new Error("original work source hash mismatch");
function baseline(hooks) {
  const math = Object.create(Math); math.random = hooks.random;
  const context = { ...hooks, Math: math,
    ctx: { workPlanned: hooks.workPlanned, npcPaths: { target: (c, x, z) => hooks.planPath(c, { x, z }) } },
    setVec: (v, x, y, z) => { v.x = x; v.y = y; v.z = z; return v; },
  };
  runInNewContext(original + "\nthis.controller = { planWorkSite, selectWorkSite, runWork };", context);
  return context.controller;
}
const result = { base, sourceSha256, encoding: "sorted-object-keys-v1",
  scope: "Original crew transition source; authored movement/aim/inventory adapters, not full hub parity",
  scenarios: Object.fromEntries(scenarios.map(s => [s, record(s, baseline)])) };
writeFileSync(new URL("../worker/test/fixtures/npc-work-golden.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");
console.log(`Recorded ${scenarios.length} traces from ${base}; source ${sourceSha256}`);
