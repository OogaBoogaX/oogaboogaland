// Opt-in terrain construction worker. Its complete content hash also keys persistent snapshots.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const hash = source => createHash("sha256").update(source).digest("hex");
const QUERY_RANGES = [["\n    const column =", "\n    let masterPaths ="], ["\n    const tileInnerRadius =", "\n    const centerlines ="], ["\n    const windowPieceAt =", "\n    // A point ray visits"], ["\n    const sightCacheStats =", "\n    const built ="], ["\n    const path = {", "\n    const mouths ="], ["\n    const built = {", "\n    // Drop and Orbit"], ["\n  const undersideDepthAt =", "\n  const undersideRadiusAt ="], ["\n  const smooth =", "\n  // Quarter-unit cells;"], ["\n    basementHole.contains =", "\n    for (const [index, degrees]"], ["\n  const makeGrid =", "\n  // A compact read-only rendering source"]];
export const writeTerrainWorker = (root, out) => {
  const read = name => readFileSync(join(root, "src/js", name), "utf8");
  const terrain = read("terrain.js"), adapter = read("terrain-snapshot.js"), cache = read("terrain-cache.js");
  const signature = /^\/\/ Query source SHA256: ([0-9a-f]{64})$/m.exec(adapter)?.[1];
  // A terrain.js edit that moves or changes its queries leaves the snapshot adapter stale. The site still builds,
  // without the opt-in worker: ?terrainworker=1 then finds no descriptor and builds the island as usual.
  const skip = (why) => { process.stderr.write(`terrain worker not packaged: ${why}; update and verify terrain-snapshot.js\n`); return null; };
  const blocks = [];
  for (const [start, end] of QUERY_RANGES) {
    const from = terrain.indexOf(start), to = terrain.indexOf(end, from + start.length);
    if (from < 0 || to < 0) return skip("a query boundary moved");
    blocks.push(terrain.slice(from, to));
  }
  if (hash(blocks.join("\n")) !== signature) return skip("the queries changed");
  const names = ["math.js", "scene.js", "models.js", "convex.js", "terrain.js", "terrain-worker.js"];
  const source = `"use strict";\nconst window = self;\n// adapter ${hash(adapter)}; cache ${hash(cache)}\n${names.map(read).join("\n\n")}\n`;
  const build = hash(source), name = `terrain-worker-${build.slice(0, 16)}.js`;
  mkdirSync(join(out, "js"), { recursive: true }); writeFileSync(join(out, "js", name), source);
  return { build, url: `/js/${name}` };
};
