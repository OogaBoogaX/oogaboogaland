// Hosted pages only: Valhodl's heavy geometry (its terrain grids, the keep, the curtain and its towers), several
// seconds of carving and meshing in every visitor's browser, built here once instead and staged, gzipped, as
// js/keep-geometry-<hash>.bin in src/js/keep-snapshot.js's format. The page is told of it as `BL.keepGeometry`
// (`{ url, key }`), fetches it as the land is entered and hands each builder its geometry; without it (the portable
// page, the source tree, a failed fetch) the builders build as ever. The builders are pure functions of the land's
// layout, so the file holds what a browser would have built: `node scripts/distribution-keep.mjs --check <file>`
// (a snapshot a page packed) says whether two agree.
//
// The bake runs in a child process: the modules are classic scripts that expect one global `window`, which a child
// can give them as its own global object (a `vm` context of its own runs this code some fifteen times slower).
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { gzipSync } from "node:zlib";

const MODULES = ["math.js", "scene.js", "models.js", "convex.js", "terrain.js", "build-tasks.js", "keep-layout.js", "keep-snapshot.js", "keep-models.js"];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sources = (root) => MODULES.map((name) => readFileSync(join(root, "src/js", name), "utf8"));

/** The bake itself, in this process's own global scope: an ArrayBuffer. */
const bake = (root) => {
  const texts = sources(root), key = hash(texts.join("\n")).slice(0, 16);
  globalThis.window = globalThis; globalThis.location = { search: "" }; globalThis.BL = {};
  texts.forEach((text, n) => {
    // keep-models.js reads the arcade's block kit at load, for parts that are never baked.
    if (MODULES[n] === "keep-models.js") globalThis.BL.arcadeModelsSceneKit = {};
    vm.runInThisContext(text, { filename: MODULES[n] });
  });
  const K = globalThis.BL.keepModels, L = globalThis.BL.keepLayout, making = globalThis.BL.keepSnapshot.packer(key);
  const add = (name, value) => { if (!making.add(name, value)) throw new Error(`distribution: Valhodl's ${name} is not grid geometry`); };
  for (let i = 0; i < L.TERRAIN.length; i++) add(`terrain:${i}`, K.terrain(i)());
  add("volcanoCone", K.volcanoCone());
  for (let i = 0; i < L.STORJ.mountains.length; i++) add(`storjMountain:${i}`, K.storjMountain(i)());
  for (let i = 0; i < 8; i++) add(`wall:${i}`, K.wall(i)());
  for (let i = 0; i < 2; i++) add(`tower:${i}`, K.tower(i)());
  for (const name of ["gatehouse", "keep", "keepSpire", "balcony", "porch"]) add(name, K[name]());
  return { key, buffer: making.done() };
};

/** Stage the file under `out`; `{ url, key }` for the page, or null (and a line on stderr) when it could not be baked.
 *  The last bake is kept in the gitignored untracked/keep-geometry/ under its sources' hash, so a site build bakes
 *  again (about ten seconds) only when one of `MODULES` changed. */
export const writeKeepGeometry = (root, out) => {
  const key = hash(sources(root).join("\n")).slice(0, 16), kept = join(root, "untracked/keep-geometry"), file = join(kept, `${key}.bin`);
  if (!existsSync(file)) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--bake", root, file], { encoding: "utf8", maxBuffer: 1 << 20 });
    if (child.status !== 0 || !existsSync(file)) { process.stderr.write(`Valhodl's geometry not baked: ${(child.stderr || "").trim().split("\n").pop()}; the page builds it instead\n`); return null; }
    for (const old of readdirSync(kept)) if (old !== `${key}.bin`) rmSync(join(kept, old));
  }
  // Gzipped here and opened by the page itself (a `DecompressionStream`): a host does not compress a binary type, and
  // grid coordinates shrink to about a quarter.
  const bytes = gzipSync(readFileSync(file), { level: 9 }), name = `keep-geometry-${hash(bytes).slice(0, 16)}.bin`;
  mkdirSync(join(out, "js"), { recursive: true });
  writeFileSync(join(out, "js", name), bytes);
  return { url: `/js/${name}`, key };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, root, target] = process.argv.slice(2);
  if (mode === "--bake") {
    const { buffer } = bake(root);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, Buffer.from(buffer));
  } else if (mode === "--check") {
    // `root` is a snapshot file here: its arrays against a fresh bake's, name by name.
    const here = join(fileURLToPath(import.meta.url), "../.."), { buffer } = bake(here), S = globalThis.BL.keepSnapshot;
    const mine = S.open(buffer), theirs = S.open(new Uint8Array(readFileSync(root)).buffer);
    if (!theirs) { console.error("not a snapshot of this version"); process.exit(1); }
    let bad = 0;
    const bytesOf = (snap, n) => { const s = snap.header.spans[n]; return hash(new Uint8Array(snap.buffer, snap.base + s[0], s[1])); };
    for (const name of Object.keys(mine.header.items)) {
      const a = mine.header.items[name], b = theirs.header.items[name];
      const same = b && Object.keys(a.parts).every((part) => { const x = a.parts[part], y = b.parts[part]; return y && x.count === y.count && JSON.stringify([x.voxel, x.kinds, x.extra]) === JSON.stringify([y.voxel, y.kinds, y.extra]) && bytesOf(mine, x.grid) === bytesOf(theirs, y.grid) && bytesOf(mine, x.kind) === bytesOf(theirs, y.kind) && bytesOf(mine, x.flip) === bytesOf(theirs, y.flip); });
      if (!same) { bad++; console.log(`${name}: differs`); }
    }
    console.log(bad ? `${bad} differ` : `all ${Object.keys(mine.header.items).length} agree`);
    process.exit(bad ? 1 : 0);
  }
}
