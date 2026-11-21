// Run this pinned tooling from a credential-free renderer job. --baseline-dir is a separate checkout of the
// independently approved deployed baseline SHA, never the submission head or current rock. Only that checkout's
// browser renderer/custom hooks execute; catalog additions enter as validated JSON before contributors initialize.
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { catalogBaseline } from "./character-catalog-build.mjs";
import { readCatalog, CATALOG_MAX_BYTES } from "./character-catalog.mjs";
import { createPortraitManifest, pngDimensions, PORTRAIT_MAX_BYTES } from "../worker/src/character-portraits-format.js";
import { dispose, launch } from "../test/browser.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const within = (root, file) => file.startsWith(root + sep);
const FALLBACK = "ooga chat", ENGINE = "island-character-data-v1";
const TYPES = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".svg": "image/svg+xml" };

export const rendererArguments = (args) => {
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!["--baseline-dir", "--catalog", "--output"].includes(key) || values[key] || !args[i + 1] || args[i + 1].startsWith("--"))
      throw new Error("Use --baseline-dir <approved checkout> --catalog <canonical JSON> --output <empty directory>");
    values[key] = resolve(args[i + 1]);
  }
  if (Object.keys(values).length !== 3) throw new Error("Baseline checkout, catalog and output are required");
  return { baselineDir: values["--baseline-dir"], catalogFile: values["--catalog"], output: values["--output"] };
};

export const prepareCatalogRenderer = (baselineDir, json) => {
  const snapshot = readCatalog(json), { catalog } = snapshot;
  if (catalog.engine !== ENGINE) throw new Error("Unsupported character renderer engine");
  baselineDir = realpathSync(baselineDir);
  const root = realpathSync(join(baselineDir, "src")), characters = realpathSync(join(root, "characters"));
  if (!within(baselineDir, root) || !within(root, characters)) throw new Error("Source directory is outside the approved baseline");
  for (const name of readdirSync(characters).filter((name) => name.endsWith(".js"))) {
    const file = realpathSync(join(characters, name));
    if (!within(root, file) || !statSync(file).isFile()) throw new Error("Character source is outside the approved baseline");
  }
  const baseline = catalogBaseline(baselineDir), entries = new Map(catalog.entries.map((entry) => [entry.path, entry]));
  const compiled = new Map(baseline.map((entry) => [entry.path, entry]));
  for (const old of baseline) {
    const entry = entries.get(old.path);
    if (!entry || entry.identity.handle !== old.identity.handle || entry.identity.github !== old.identity.github)
      throw new Error("Catalog changes an approved baseline identity");
    if (old.kind === "custom" && (entry.kind !== "custom" || entry.hash !== old.hash || entry.blob !== old.blob))
      throw new Error("Catalog changes approved custom code");
  }
  const scripts = catalog.entries.map((entry) => {
    if (entry.kind === "data") return `window.BL.characters.add(${JSON.stringify(entry.row)});`;
    if (!compiled.has(entry.path) || compiled.get(entry.path).kind !== "custom") throw new Error("Catalog introduces custom code");
    const file = realpathSync(join(baselineDir, entry.path));
    if (!within(root, file) || !statSync(file).isFile()) throw new Error("Custom source is outside the approved baseline");
    const source = readFileSync(file, "utf8");
    if (hash(source) !== entry.hash) throw new Error("Approved custom source changed while preparing portraits");
    return source;
  });
  const htmlFile = realpathSync(join(root, "index.html"));
  if (!within(root, htmlFile) || !statSync(htmlFile).isFile()) throw new Error("Missing approved baseline page");
  const html = readFileSync(htmlFile, "utf8"), cast = '<script src="js/characters.gen.js"></script>';
  if (html.split(cast).length !== 2 || html.indexOf(cast) > html.indexOf('<script src="js/contributors.js">'))
    throw new Error("Approved page has no character initialization boundary");
  const policy = /connect-src [^;]+;/;
  if (!policy.test(html)) throw new Error("Approved page has no network policy");
  return { ...snapshot, root, html: html.replace(policy, "connect-src 'none';"), script: scripts.join("\n\n"),
    names: catalog.entries.map((entry) => entry.identity.handle).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1) };
};

// Every response is from the approved source directory or the one data-only overlay. Exact host binding and
// realpath containment prevent a different local website or symlink from using this server to read the runner.
export const portraitResponse = (prepared, { method, url, host }, expectedHost) => {
  const reply = (status, type, body) => ({ status, type, body: method === "HEAD" ? "" : body });
  if (host !== expectedHost) return reply(403, "text/plain", "Forbidden");
  if (!["GET", "HEAD"].includes(method)) return reply(405, "text/plain", "Method not allowed");
  let path;
  try {
    if (typeof url !== "string" || url.length > 2048 || !url.startsWith("/") || url.startsWith("//")) throw new Error();
    path = decodeURIComponent(new URL(url, `http://${expectedHost}`).pathname);
  } catch { return reply(400, "text/plain", "Bad request"); }
  if (path === "/" || path === "/index.html") return reply(200, TYPES[".html"], prepared.html);
  if (path === "/js/characters.gen.js") return reply(200, TYPES[".js"], prepared.script);
  if (!TYPES[extname(path)]) return reply(404, "text/plain", "Not found");
  try {
    const file = realpathSync(resolve(prepared.root, `.${path}`));
    if (!within(prepared.root, file) || !statSync(file).isFile()) throw new Error();
    return reply(200, TYPES[extname(path)], readFileSync(file));
  } catch { return reply(404, "text/plain", "Not found"); }
};

export const portraitResult = (prepared, result) => {
  if (!result || !Array.isArray(result.names) || JSON.stringify(result.names) !== JSON.stringify(prepared.names)
    || typeof result.png !== "string" || !result.png.startsWith("data:image/png;base64,")
    || result.png.length > Math.ceil(PORTRAIT_MAX_BYTES / 3) * 4 + 22) throw new Error("Invalid portrait renderer output");
  const encoded = result.png.slice(22);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("Invalid portrait PNG encoding");
  const png = Buffer.from(encoded, "base64"), dimensions = pngDimensions(png);
  const manifest = createPortraitManifest(prepared.catalog, prepared.digest, hash(png));
  if (dimensions.height !== manifest.rows * manifest.size) throw new Error("Portrait sheet dimensions do not match its catalog");
  return { png, manifest };
};

// Keep the strict console gate actionable on CI without dumping an unbounded page-controlled log.
export const portraitConsoleError = (logs, stage) => new Error(`Portrait page reported console output ${stage} (${logs.length} entries):\n`
  + logs.slice(0, 8).map((line) => String(line).slice(0, 500).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")).join("\n"));

const draw = `(expected, fallback) => {
  const BL = window.BL, names = BL.characters.all().map(c => c.handle).sort((a,b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1);
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw new Error("Rendered cast differs from the approved catalog");
  const size = 80, columns = 8, sheet = document.createElement("canvas");
  sheet.width = size * columns; sheet.height = Math.ceil((names.length + 1) / columns) * size;
  const g = sheet.getContext("2d");
  names.concat(fallback).forEach((name, index) => {
    const canvas = document.createElement("canvas");
    BL.hud.renderFaceIcon(canvas, BL.models.caveman(BL.contributors.traitsFor(name)), null, size);
    g.drawImage(canvas, index % columns * size, Math.floor(index / columns) * size, size, size);
  });
  return { names, png: sheet.toDataURL("image/png") };
}`;

export const renderCatalog = async ({ baselineDir, catalogFile, output }) => {
  baselineDir = realpathSync(baselineDir); output = resolve(output);
  // Output never modifies the approved checkout, even through an existing symlink in its parent path.
  let ancestor = output;
  while (!existsSync(ancestor)) ancestor = resolve(ancestor, "..");
  const actual = resolve(realpathSync(ancestor), output.slice(ancestor.length).replace(/^[/\\]/, ""));
  if (actual === baselineDir || within(baselineDir, actual)) throw new Error("Portrait output must be outside the approved checkout");
  if (existsSync(output) && (!statSync(output).isDirectory() || readdirSync(output).length)) throw new Error("Portrait output must be an empty directory");
  if (!statSync(catalogFile).isFile() || statSync(catalogFile).size > CATALOG_MAX_BYTES) throw new Error("Invalid catalog input size");
  const prepared = prepareCatalogRenderer(baselineDir, readFileSync(catalogFile, "utf8"));
  const server = createServer((request, response) => {
    const result = portraitResponse(prepared, { method: request.method, url: request.url, host: request.headers.host }, `127.0.0.1:${server.address().port}`);
    response.writeHead(result.status, { "content-type": result.type, "cache-control": "no-store", "x-content-type-options": "nosniff" }); response.end(result.body);
  });
  await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  let browser, networkError = null;
  try {
    browser = await launch({ w: 800, h: 600 });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser.on("Fetch.requestPaused", ({ requestId, request }) => {
      const allowed = request.url.startsWith(origin + "/") || request.url.startsWith("data:");
      if (!allowed) networkError = new Error("Portrait renderer attempted an external request");
      browser.send(allowed ? "Fetch.continueRequest" : "Fetch.failRequest", allowed ? { requestId } : { requestId, errorReason: "BlockedByClient" })
        .catch(() => { networkError = new Error("Portrait renderer network isolation failed"); });
    });
    await browser.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    // Faces always use the game's Canvas2D icon renderer; the unused lab scene needs no WebGL context.
    await browser.open(`${origin}/?debug=1&nosim=1&net=0&pos=0&welcome=0&hour=12&day=80&scene=lab&canvas2d=1`);
    const deadline = Date.now() + 60000;
    while (!(await browser.evaluate("!!(window.__ooga && window.__ooga.scene)").catch(() => false))) {
      if (networkError) throw networkError;
      if (browser.logs.length) throw portraitConsoleError(browser.logs, "before startup");
      if (Date.now() > deadline) throw new Error("Approved portrait page did not start");
      await browser.sleep(100);
    }
    const result = portraitResult(prepared, await browser.evaluate(`(${draw})(${JSON.stringify(prepared.names)}, ${JSON.stringify(FALLBACK)})`));
    if (networkError) throw networkError;
    if (browser.logs.length) throw portraitConsoleError(browser.logs, "after drawing");
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "portraits.png"), result.png, { flag: "wx" });
    writeFileSync(join(output, "portraits.json"), JSON.stringify(result.manifest) + "\n", { flag: "wx" });
    return result.manifest;
  } finally {
    if (browser) browser.close();
    await dispose();
    await new Promise((done) => server.close(done));
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await renderCatalog(rendererArguments(process.argv.slice(2)));
    console.log(`Rendered ${result.fallback} characters for catalog ${result.revision}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
