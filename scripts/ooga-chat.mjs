// Builds and stages Ooga Chat, the standalone app in src/ooga-chat/: `node scripts/ooga-chat.mjs [dir] [--fixtures]`,
// default untracked/ooga-chat (docs/ooga-chat-app.md). It shares no output with the island: it refuses the island's
// staging folders and the repository's own, and it only clears a folder an earlier run of this script staged.
// index.html's stylesheets and scripts become one same-origin css/ and js/ file each, named by their hash, so the page
// carries no inline code under its policy (`script-src 'self'; style-src 'self'`), and every picture under art/ the
// views name moves to art/<name>-<hash>.<ext>. The page may load only its own modules and the shared ones in SHARED:
// anything else (a renderer, a scene, the island's socket) fails the build. `--fixtures` also stages fixture.html with
// the offline fixture adapter, for review only; without it no fixture code is in the folder. build.json records the
// build identity and every file's bytes. _headers carries the same policy for Cloudflare, and 404.html sends an
// unknown address home. The installable app (#657): manifest.webmanifest names it, icons/ draws the native cloud at
// each size, and sw.js (src/ooga-chat/service-worker.js with its build and file list filled in) keeps the public files
// a visit loads; the production entry alone links the manifest and registers the worker.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { gzipSync } from "node:zlib";
import { encode } from "./distribution-icons.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(root, "src", "ooga-chat");
// The island modules the app may share: each loads nothing at load but window.BL and the document.
export const SHARED = ["../js/sign-glyphs.js", "../js/native-icons.js"];
// What a first visit may cost over the wire (index.html, the script, the stylesheet and the art it shows), gzipped. The
// staged foundation measures about 71 KB, most of it the sign-in picture; the build fails past this.
export const FIRST_LOAD_BUDGET = 96 * 1024;
export const POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 16);
// The installable app's identity and colours, and its icons: the native cloud (native-icons.js) on the theme colour,
// scaled by whole pixels, at most `fill` of the side (a maskable icon keeps inside the platform's safe circle).
export const APP = { name: "Ooga Chat", description: "Listen to the island. Speak from the clouds.", theme: "#0a0a0b" };
export const ICON_SIZES = [{ size: 180, fill: 0.75, purpose: "apple" }, { size: 192, fill: 0.75, purpose: "any" }, { size: 512, fill: 0.75, purpose: "any" },
  { size: 512, fill: 0.5, purpose: "maskable" }];
export const cloudIcon = (size, fill) => {
  const context = { window: {} };
  runInNewContext(readFileSync(join(root, "src", "js", "native-icons.js"), "utf8"), context);
  const rects = [];
  for (const [colour, d] of context.window.BL.nativeIcons.ICONS.cloud[3]) {
    for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)H\d+z/g)) rects.push({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], rgb: [1, 3, 5].map((k) => parseInt(colour.slice(k, k + 2), 16)) });
  }
  if (!rects.length) throw new Error("ooga-chat: the native cloud's paths are not pixel rectangles");
  const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
  const w = Math.max(...rects.map((r) => r.x + r.w)) - x0, h = Math.max(...rects.map((r) => r.y + r.h)) - y0;
  const scale = Math.floor(size * fill / Math.max(w, h)), left = Math.floor((size - w * scale) / 2), top = Math.floor((size - h * scale) / 2);
  const bg = [1, 3, 5].map((k) => parseInt(APP.theme.slice(k, k + 2), 16)), px = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) px.set([...bg, 255], i * 4);
  for (const r of rects) for (let y = (r.y - y0) * scale; y < (r.y - y0 + r.h) * scale; y++) for (let x = (r.x - x0) * scale; x < (r.x - x0 + r.w) * scale; x++) {
    px.set([...r.rgb, 255], ((top + y) * size + left + x) * 4);
  }
  return encode(size, size, px);
};

const read = (page) => readFileSync(join(app, page), "utf8");
const listOf = (html, page) => {
  const sheets = [...html.matchAll(/^[ \t]*<link rel="stylesheet" href="([^"]+)">\r?\n/gm)].map((m) => m[1]);
  const scripts = [...html.matchAll(/^[ \t]*<script src="([^"]+)"><\/script>\r?\n/gm)].map((m) => m[1]);
  if (!sheets.length || !scripts.length) throw new Error(`${page}: expected stylesheet links and script tags`);
  for (const src of scripts) if (!SHARED.includes(src) && !/^ooga-chat-[a-z-]+\.js$/.test(src)) {
    throw new Error(`${page}: ${src} is neither an Ooga Chat module nor a shared one (scripts/ooga-chat.mjs SHARED)`);
  }
  if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(html) || /<style/i.test(html) || /\sstyle="/i.test(html) || /\son[a-z]+="/i.test(html)) {
    throw new Error(`${page}: inline script, style or handler; the policy allows only same-origin files`);
  }
  if (!html.includes(`content="${POLICY}"`)) throw new Error(`${page}: its content policy differs from scripts/ooga-chat.mjs POLICY`);
  return { sheets, scripts };
};

// The two entries differ only by the fixture adapter, loaded just before the app starts.
export const entries = () => {
  const index = read("index.html"), fixture = read("fixture.html");
  const main = listOf(index, "index.html"), review = listOf(fixture, "fixture.html");
  if (main.scripts.includes("ooga-chat-fixtures.js") || index.includes("data-adapter=")) throw new Error("index.html: the production entry must not load or select fixtures");
  const expected = [...main.scripts.slice(0, -1), "ooga-chat-fixtures.js", main.scripts.at(-1)];
  if (review.scripts.join() !== expected.join() || review.sheets.join() !== main.sheets.join()) {
    throw new Error("fixture.html: must load index.html's files plus ooga-chat-fixtures.js just before ooga-chat-app.js");
  }
  return { index, fixture, main, review };
};

// Refuse any folder the island stages, the repository or its sources, and a non-empty folder this script did not make.
const guard = (out) => {
  const rel = relative(root, out).split(sep).join("/");
  const inside = rel !== "" && !rel.startsWith("..") && !/^[a-zA-Z]:|^\//.test(rel);
  const forbidden = ["src", "_site", "untracked/site", "cards", "worker", "scripts", "test", "docs", ".git", "node_modules"];
  if (out === root || inside && forbidden.some((dir) => rel === dir || rel.startsWith(`${dir}/`))) {
    throw new Error(`ooga-chat: refusing to stage into ${rel || "the repository root"}`);
  }
  if (existsSync(out) && readdirSync(out).length) {
    let mark = null;
    try { mark = JSON.parse(readFileSync(join(out, "build.json"), "utf8")); } catch { /* Not ours. */ }
    if (mark?.app !== "ooga-chat") throw new Error(`ooga-chat: ${out} holds files this script did not stage`);
  }
};

export const build = (out, { fixtures = false } = {}) => {
  out = resolve(root, out);
  guard(out);
  const { index, fixture, main, review } = entries();
  rmSync(out, { recursive: true, force: true });
  for (const dir of ["js", "css", "art", "icons"]) mkdirSync(join(out, dir), { recursive: true });
  // Marked at once, so a run that fails part way can still be staged over.
  writeFileSync(join(out, "build.json"), `${JSON.stringify({ app: "ooga-chat", partial: true })}\n`);
  const files = [];
  const write = (path, bytes) => {
    writeFileSync(join(out, path), bytes);
    files.push(path);
    return `/${path}`;
  };
  const named = (dir, name, ext, bytes) => write(`${dir}/${name}-${hash(bytes)}.${ext}`, bytes);
  // Pictures first, so the scripts that name them can be rewritten to their hashed addresses.
  const pictures = readdirSync(join(app, "art")).filter((file) => /\.(jpe?g|png|webp)$/.test(file)).sort();
  const art = new Map(pictures.map((file) => [file, named("art", basename(file, extname(file)), extname(file).slice(1), readFileSync(join(app, "art", file)))]));
  const bundle = (scripts) => {
    let js = scripts.map((src) => `// ---- ${src.replace(/^\.\.\//, "")} ----\n${read(src).trim().replace(/\r\n/g, "\n")}`).join("\n\n");
    js = js.replace(/"art\/([\w.-]+)"/g, (_, file) => {
      if (!art.has(file)) throw new Error(`ooga-chat: a script names art/${file}, which src/ooga-chat/art/ does not hold`);
      return JSON.stringify(art.get(file));
    });
    return `${js}\n`;
  };
  const used = new Set();
  const js = bundle(main.scripts);
  for (const [file, path] of art) if (js.includes(JSON.stringify(path))) used.add(file);
  for (const file of pictures) if (!used.has(file)) throw new Error(`ooga-chat: art/${file} is staged but no script shows it`);
  const icons = ICON_SIZES.map(({ size, fill, purpose }) => ({ size, purpose,
    path: named("icons", `ooga-chat-${size}${purpose === "maskable" ? "-maskable" : ""}`, "png", cloudIcon(size, fill)) }));
  const css = `${main.sheets.map((path) => read(path).trim().replace(/\r\n/g, "\n")).join("\n\n")}\n`;
  if (/url\(/.test(css)) throw new Error("ooga-chat: a stylesheet loads a url(); name pictures from the views instead");
  const sheet = named("css", "ooga-chat", "css", css);
  const stage = (html, page, scriptPath, buildId, head = "") => {
    // The first tag of each kind becomes the one staged file; the rest go.
    const once = (pattern, tag) => {
      let first = true;
      return (text) => text.replace(pattern, (_, indent) => first ? (first = false, `${indent}${tag}\n`) : "");
    };
    const shell = [once(/^([ \t]*)<link rel="stylesheet" href="[^"]+">\r?\n/gm, `<link rel="stylesheet" href="${sheet}">`),
      once(/^([ \t]*)<script src="[^"]+"><\/script>\r?\n/gm, `<script src="${scriptPath}"></script>`)].reduce((text, step) => step(text), html)
      .replace('<meta name="ooga-chat-build" content="dev">', `<meta name="ooga-chat-build" content="${buildId}">${head}`);
    if (!shell.includes(`content="${buildId}"`) || (shell.match(/<script /g) || []).length !== 1) throw new Error(`ooga-chat: ${page} did not stage`);
    write(page, shell);
  };
  const script = named("js", "ooga-chat", "js", js);
  const buildId = hash(`${js}${css}`);
  // Only the production entry is installable: the review entry links no manifest and registers no worker.
  const apple = icons.find((icon) => icon.purpose === "apple").path;
  stage(index, "index.html", script, buildId, `\n  <link rel="manifest" href="/manifest.webmanifest">\n  <link rel="apple-touch-icon" sizes="180x180" href="${apple}">`);
  write("manifest.webmanifest", `${JSON.stringify({ id: "/", name: APP.name, short_name: APP.name, description: APP.description, start_url: "/", scope: "/",
    display: "standalone", background_color: APP.theme, theme_color: APP.theme,
    icons: icons.filter((icon) => icon.purpose !== "apple").map((icon) => ({ src: icon.path, sizes: `${icon.size}x${icon.size}`, type: "image/png", purpose: icon.purpose })) }, null, 2)}\n`);
  // The worker's shell: the page and every hashed file of this build, never the fixture entry, the manifest or the 404.
  const shell = ["/", ...files.filter((path) => /^(js|css|art|icons)\//.test(path)).sort().map((path) => `/${path}`)];
  const worker = read("service-worker.js").replace('const VERSION = "dev";', `const VERSION = ${JSON.stringify(buildId)};`).replace("const SHELL = [];", `const SHELL = ${JSON.stringify(shell)};`);
  if (!worker.includes(buildId) || worker.includes("const SHELL = [];")) throw new Error("ooga-chat: the service worker did not stage");
  write("sw.js", worker);
  if (fixtures) stage(fixture, "fixture.html", named("js", "ooga-chat-fixture", "js", bundle(review.scripts)), buildId);
  write("404.html", `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex">
  <meta http-equiv="refresh" content="0; url=/">
  <title>Ooga Chat</title>
</head>
<body><a href="/">Ooga Chat</a></body>
</html>
`);
  // Cloudflare's _headers: the policy on every page, no caching for the entry pages, a year for hashed files.
  const hashed = files.filter((path) => /^(js|css|art|icons)\//.test(path)).sort();
  write("_headers", `/*
  Content-Security-Policy: ${POLICY}; frame-ancestors 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Permissions-Policy: camera=(), geolocation=(), microphone=(self)

/
  Cache-Control: no-cache

/index.html
  Cache-Control: no-cache

/sw.js
  Cache-Control: no-cache

/manifest.webmanifest
  Cache-Control: no-cache
  Content-Type: application/manifest+json
${hashed.map((path) => `\n/${path}\n  Cache-Control: public, max-age=31536000, immutable`).join("\n")}
`);
  const inventory = files.map((path) => {
    const bytes = readFileSync(join(out, path));
    return { path, bytes: bytes.length, gzip: gzipSync(bytes).length };
  });
  const firstLoad = inventory.filter((file) => file.path === "index.html" || file.path === sheet.slice(1) || file.path === script.slice(1) || file.path.startsWith("art/"))
    .reduce((sum, file) => sum + file.gzip, 0);
  if (firstLoad > FIRST_LOAD_BUDGET) throw new Error(`ooga-chat: first load is ${firstLoad} bytes gzipped, over FIRST_LOAD_BUDGET (${FIRST_LOAD_BUDGET})`);
  const manifest = { app: "ooga-chat", build: buildId, bootstrap: 1, fixtures, firstLoad, scripts: main.scripts.map((src) => src.replace(/^\.\.\//, "")), files: inventory };
  writeFileSync(join(out, "build.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
};

// The headers a staged _headers file gives one path: every block whose pattern matches, `/*` first, later ones winning.
export const headersFor = (rules, path) => {
  const out = {};
  for (const block of rules.split(/\n\s*\n/)) {
    const [pattern, ...lines] = block.trim().split("\n");
    if (!pattern || !(pattern === path || pattern.endsWith("*") && path.startsWith(pattern.slice(0, -1)))) continue;
    for (const line of lines) {
      const at = line.indexOf(":");
      if (at > 0) out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
  }
  return out;
};

// `--serve`: the staged folder over loopback HTTP as Cloudflare's static assets would answer it, with _headers
// applied, a missing path answered by 404.html with a 404, and no backend, so /api/bootstrap is a 404 and the page
// shows its unavailable mode (the fixture entry carries its own answers).
const serve = async (out, port, manifest) => {
  const { createServer } = await import("node:http");
  // Only what the build staged, never _headers or build.json.
  const servable = new Set(manifest.files.map((file) => file.path).filter((path) => path !== "_headers"));
  const TYPES = { ".webmanifest": "application/manifest+json", ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".json": "application/json; charset=utf-8" };
  const rules = readFileSync(join(out, "_headers"), "utf8");
  createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = path === "/" ? "index.html" : path.slice(1);
    const known = servable.has(file);
    const served = known ? file : "404.html";
    response.writeHead(known ? 200 : 404, { "content-type": TYPES[extname(served)] || "application/octet-stream", ...headersFor(rules, path) });
    response.end(readFileSync(join(out, served)));
  }).listen(port, "127.0.0.1", () => console.log(`serving ${out} at http://127.0.0.1:${port}/`));
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), dir = args.find((arg) => !arg.startsWith("--")) || "untracked/ooga-chat";
  const manifest = build(dir, { fixtures: args.includes("--fixtures") });
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  for (const file of manifest.files) console.log(`  ${kb(file.bytes).padStart(9)}  gzip ${kb(file.gzip).padStart(8)}  ${file.path}`);
  console.log(`staged ${resolve(root, dir)}: build ${manifest.build}, first load ${kb(manifest.firstLoad)} gzipped of a ${kb(FIRST_LOAD_BUDGET)} budget${manifest.fixtures ? ", with fixture.html" : ""}`);
  if (args.includes("--serve")) await serve(resolve(root, dir), Number(process.env.PORT) || 8090, manifest);
}
