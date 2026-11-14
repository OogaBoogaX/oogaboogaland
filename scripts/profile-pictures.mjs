// Render pictures for comparing builds: one WebGL frame per scene and quality tier, rendered the same every run.
//   node scripts/profile-pictures.mjs capture <dir> [scene ...]
//   node scripts/profile-pictures.mjs compare <before dir> <after dir>
// Build first; one Chrome at a time. The page runs on a virtual clock (exactly 1/60 s a frame, Date and
// performance.now included) with Math.random and crypto.getRandomValues seeded, so an unchanged build renders the same
// pixels every run. Each picture is read straight from the WebGL canvas at frame 600 after load, so it holds the scene
// and none of the HUD. One known exception: ₿IFRÖST's travel windows show pictures of other worlds taken once a page
// while it is idle, on real time, so a few pixels inside those windows can differ between runs. Not part of the suite, which keeps no per-feature pixel checks: this is for judging a change.
import { writeFileSync, readFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const SCENES = ["hub", "lab", "race", "arcade", "factory", "bifrost", "mine", "drop", "orbit"];
const TIERS = ["high", "medium", "low"];
const FRAME = 600, W = 1280, H = 720;
// A channel difference above this is visible; below it is rounding and dither.
const VISIBLE = 8;

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const byte of buf) c = CRC[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length), body = Buffer.concat([Buffer.from(type), data]);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};
// RGBA rows top to bottom, filter 0 throughout; decodePng reads only what encodePng writes.
const encodePng = (w, h, rgba) => {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
};
const decodePng = (buf) => {
  let at = 8, w = 0, h = 0;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at), type = buf.toString("latin1", at + 4, at + 8), data = buf.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    if (type === "IDAT") idat.push(data);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    if (raw[y * (w * 4 + 1)] !== 0) throw new Error("only pictures written by this script can be compared");
    raw.copy(rgba, y * w * 4, y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1));
  }
  return { w, h, rgba };
};

const inject = (quality) => `(() => {
  let t = 1000, seed = 0x9e3779b9;
  const rand = () => { seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  Math.random = rand;
  crypto.getRandomValues = (a) => { const top = 2 ** (8 * a.BYTES_PER_ELEMENT); for (let i = 0; i < a.length; i++) a[i] = Math.floor(rand() * top); return a; };
  const epoch = Date.UTC(2026, 2, 21, 12);
  performance.now = () => t;
  Date.now = () => epoch + t;
  const C = window.__picture = { frame: 0, done: null, gl: null, tiered: false };
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    const c = getContext.call(this, type, opts);
    if (type === "webgl2" && c && !C.gl && this.isConnected) C.gl = c;
    return c;
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf(() => {
    t += 1000 / 60;
    if (!C.tiered && window.__ooga && window.__ooga.renderer.ready) { window.__ooga.renderer.setQuality(${JSON.stringify(quality)}); C.tiered = true; }
    cb(t);
    if (++C.frame !== ${FRAME} || !C.gl) return;
    const g = C.gl, w = g.drawingBufferWidth, h = g.drawingBufferHeight, px = new Uint8Array(w * h * 4);
    g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
    // GL rows run bottom to top; flip so the picture reads the right way up.
    const flipped = new Uint8Array(px.length), row = w * 4;
    for (let y = 0; y < h; y++) flipped.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    let s = "";
    for (let i = 0; i < flipped.length; i += 0x8000) s += String.fromCharCode.apply(null, flipped.subarray(i, i + 0x8000));
    C.done = { w, h, scene: window.__ooga.scene, quality: window.__ooga.renderer.quality, data: btoa(s) };
  });
})();`;

const capture = async (dir, scenes) => {
  const { launch, dispose } = await import("../test/browser.mjs");
  mkdirSync(dir, { recursive: true });
  const manifest = { size: [W, H], frame: FRAME, pictures: {} };
  for (const scene of scenes) {
    for (const tier of TIERS) {
      const b = await launch({ w: W, h: H });
      try {
        await b.send("Page.addScriptToEvaluateOnNewDocument", { source: inject(tier) });
        await b.focus(true);
        await b.open(`${pathToFileURL(join(root, "src/index.html")).href}?debug=1&nosim=1&hour=12&time=1200&day=80&rain=0&welcome=0&pos=0&scene=${scene}${scene === "race" ? "&wip=race" : ""}`);
        let shot = null;
        for (let i = 0; i < 900 && !shot; i++) {
          shot = await b.evaluate("window.__picture && window.__picture.done").catch(() => null);
          if (!shot) await b.sleep(100);
        }
        if (!shot) { console.log(`${scene} ${tier}: no picture`); continue; }
        if (shot.scene !== scene || shot.quality !== tier) { console.log(`${scene} ${tier}: landed on ${shot.scene} at ${shot.quality}`); continue; }
        const file = `${scene}-${tier}.png`;
        writeFileSync(join(dir, file), encodePng(shot.w, shot.h, Buffer.from(shot.data, "base64")));
        manifest.pictures[file] = { scene, tier, w: shot.w, h: shot.h };
        console.log(`${scene} ${tier}: ${file}`);
      } finally {
        await b.close(true);
      }
    }
  }
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 1));
  await dispose();
};

// Differences per picture, and a diff image for any with a change: the before picture greyed, changed pixels in red.
const compare = (before, after) => {
  const diffDir = join(after, "diff");
  console.log(`| picture | changed pixels | visibly changed | mean difference | largest |`);
  console.log(`|---|---|---|---|---|`);
  let identical = true;
  for (const file of readdirSync(before).filter(f => f.endsWith(".png")).sort()) {
    if (!existsSync(join(after, file))) { console.log(`| ${file} | missing after |||| `); identical = false; continue; }
    const a = decodePng(readFileSync(join(before, file))), b = decodePng(readFileSync(join(after, file)));
    if (a.w !== b.w || a.h !== b.h) { console.log(`| ${file} | size ${a.w}x${a.h} became ${b.w}x${b.h} ||||`); identical = false; continue; }
    const n = a.w * a.h, out = Buffer.alloc(n * 4);
    let changed = 0, visible = 0, total = 0, largest = 0;
    for (let p = 0; p < n; p++) {
      const i = p * 4;
      const d = Math.max(Math.abs(a.rgba[i] - b.rgba[i]), Math.abs(a.rgba[i + 1] - b.rgba[i + 1]), Math.abs(a.rgba[i + 2] - b.rgba[i + 2]));
      if (d) changed++;
      if (d > VISIBLE) visible++;
      total += d;
      if (d > largest) largest = d;
      const grey = (a.rgba[i] * 0.3 + a.rgba[i + 1] * 0.59 + a.rgba[i + 2] * 0.11) * 0.35;
      out[i] = d > VISIBLE ? 255 : grey; out[i + 1] = d > VISIBLE ? 40 : grey; out[i + 2] = d > VISIBLE ? 40 : grey; out[i + 3] = 255;
    }
    if (changed) {
      identical = false;
      mkdirSync(diffDir, { recursive: true });
      writeFileSync(join(diffDir, file), encodePng(a.w, a.h, out));
    }
    const share = (k) => `${(100 * k / n).toFixed(2)}%`;
    console.log(`| ${file} | ${share(changed)} | ${share(visible)} | ${(total / n).toFixed(3)} | ${largest} |`);
  }
  console.log(identical ? "\nEvery picture is identical." : `\nDiff images: ${diffDir}`);
};

const [mode, ...rest] = process.argv.slice(2);
if (mode === "capture" && rest[0]) await capture(rest[0], rest.length > 1 ? rest.slice(1) : SCENES);
else if (mode === "compare" && rest[1]) compare(rest[0], rest[1]);
else { console.log("usage: profile-pictures.mjs capture <dir> [scene ...] | compare <before dir> <after dir>"); process.exitCode = 1; }
