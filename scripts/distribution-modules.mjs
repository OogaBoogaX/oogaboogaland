// Hosted pages only: each group of modules tagged `data-defer` in src/index.html leaves the page's one inline script
// for a same-origin file, js/<group>-<hash>.js, named in `BL.deferredScripts` at the head of the script, where
// src/js/deferred.js finds it when the group is first needed (the Timechain Sphere's rooms, once a visitor commits to
// one). The page's script policy gains 'self' for that file, as src/index.html already allows; the portable page
// (oogaboogaland.html) keeps every module inline, so file:// and a single download still work. `transform(src, text)`
// may rewrite a module's text as it enters its bundle: `--image-assets` writes the DSB rooms' pictures out of the dsb
// bundle that way (`externalizePictures`), and `inline` names modules left in the page whose text it rewrites in place.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const hash = (text, encoding) => createHash("sha256").update(text, "utf8").digest(encoding);
// Groups the portable page leaves out (scripts/build.mjs never inlines them): the Ember Den's four lounge recordings
// (about 18 MB), which would carry the single file past GitHub's 50 MB warning. The hosted pages still serve each as
// its own same-origin file; the portable page carries its own smaller mono encodings.
export const hostedOnly = (group) => group.startsWith("lounge-track-");
export function externalizeModules(html, out, deferred, block, terrainWorker = null, transform = (src, text) => text, inline = [], micFilter = null, keepGeometry = null) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!script) throw new Error("distribution: no inline script");
  const oldPolicy = `script-src 'sha256-${hash(script[1], "base64")}'`;
  if (html.split(oldPolicy).length !== 2) throw new Error("distribution: script hash not found");
  let body = script[1];
  const named = {};
  mkdirSync(join(out, "js"), { recursive: true });
  for (const [group, sources] of deferred) {
    const parts = sources.map((src) => {
      const text = block(src);
      // A hosted-only group is not in the portable page at all: its bundle comes from the source.
      if (hostedOnly(group)) { if (body.includes(text)) throw new Error(`distribution: ${src} is hosted only but is in the page`); return transform(src, text); }
      if (body.split(text).length !== 2) throw new Error(`distribution: ${src} is not in the page exactly once`);
      body = body.split(text).join("");
      return transform(src, text);
    });
    // Script evaluation can finish while another scene is active. Eager builders belong to the requested group;
    // later asynchronous build batches scope themselves explicitly. Standalone data-bundle tools have no models.
    // A scene implementation is a separate fetch group, but its eager builders still belong to the scene's owner.
    const scope = group.endsWith("-scene") ? group.slice(0, -6) : group;
    // A copy that runs after its group is present (a late arrival after a timed-out load) returns before redefining
    // anything: the live modules keep their state.
    parts.unshift(`(window.BL.models?.withScope || ((_scope, build) => build()))(${JSON.stringify(scope)}, () => {`,
      `if (window.BL.deferred && window.BL.deferred.present(${JSON.stringify(group)})) return;`);
    parts.push("});");
    const bundle = `${parts.join("\n\n")}\n`, name = `${group}-${hash(bundle, "hex").slice(0, 16)}.js`;
    writeFileSync(join(out, "js", name), bundle);
    named[group] = `/js/${name}`;
  }
  // A module that stays in the page's own script (`inline`) goes through `transform` where it stands.
  for (const src of inline) {
    const text = block(src);
    if (body.split(text).length !== 2) throw new Error(`distribution: ${src} is not in the page exactly once`);
    body = body.split(text).join(transform(src, text));
  }
  const worker = terrainWorker ? `window.BL.terrainWorker = ${JSON.stringify(terrainWorker)};\n` : "";
  const filter = micFilter ? `window.BL.micFilter = ${JSON.stringify(micFilter)};\n` : "";
  // Valhodl's baked geometry (scripts/distribution-keep.mjs), which src/js/keep-snapshot.js fetches as the land is entered.
  const keep = keepGeometry ? `window.BL.keepGeometry = ${JSON.stringify(keepGeometry)};\n` : "";
  const updated = `\nwindow.BL = window.BL || {};\nwindow.BL.deferredScripts = ${JSON.stringify(named)};\n${worker}${filter}${keep}${body.replace(/^\n/, "")}`;
  return html.replace(script[0], () => `<script>${updated}</script>`)
    .replace(oldPolicy, `script-src 'self' 'sha256-${hash(updated, "base64")}'`);
}

// Hosted pages only, after the steps above: the page's one inline script leaves for js/main-<hash>.js in the same
// place, and its stylesheet for css/style-<hash>.css, so a browser keeps both across reloads, routes and tabs and V8
// can cache the script's compiled code; every route page names the same files. Each module in `data` (the jumbotron's
// snapshot, rebaked by every deploy) leaves the main script for js/<module>-<hash>.js, loaded just before it, so a
// deploy that changes only that data keeps the code's file. Such a module must read nothing at load but window.BL.
// The policies keep 'self' and the data-early hashes and drop the two blocks' hashes.
export function externalizePage(html, out, block, data = []) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/), style = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!script || !style) throw new Error("distribution: expected one inline script and one inline style");
  const scriptHash = ` 'sha256-${hash(script[1], "base64")}'`, stylePolicy = `style-src 'sha256-${hash(style[1], "base64")}'`;
  if (html.split(scriptHash).length !== 2 || !html.includes(`script-src 'self'${scriptHash}`) || html.split(stylePolicy).length !== 2) throw new Error("distribution: page hashes not found");
  const write = (dir, name, text) => {
    mkdirSync(join(out, dir), { recursive: true });
    const file = `${name}-${hash(text, "hex").slice(0, 16)}.${dir}`;
    writeFileSync(join(out, dir, file), text);
    return `/${dir}/${file}`;
  };
  let body = script[1];
  const tags = data.map((src) => {
    const text = block(src);
    if (body.split(text).length !== 2) throw new Error(`distribution: ${src} is not in the page exactly once`);
    body = body.split(text).join("");
    return `<script src="${write("js", basename(src, ".js"), `${text}\n`)}"></script>`;
  });
  tags.push(`<script src="${write("js", "main", body)}"></script>`);
  const sheet = write("css", "style", style[1]);
  return html.replace(script[0], () => tags.join("\n"))
    .replace(style[0], () => `<link rel="stylesheet" href="${sheet}">`)
    .replace(scriptHash, "").replace(stylePolicy, "style-src 'self'");
}

// The DSB rooms' pictures (article thumbnails, product covers, profile previews), Cloud Hopper's title and result
// art and the Halloween herald's three views are data URIs in these modules; the DSB ones travel in the deferred dsb
// bundle, the herald's in arcade-scene, Cloud Hopper's in the page's own script. Each picture is set as an image's src either way,
// under `img-src 'self' data:`. Each becomes art/<module>-<sha256>.<ext> holding the same bytes, so a bundle or the
// page carries only the address, and the picture is fetched only when a menu or a title card shows it.
export const PICTURE_MODULES = ["js/without-rulers-data.js", "js/stackchain-art.js", "js/proof-of-ink-data.js", "js/meme-factory-data.js",
  "js/cloud-hopper-art.js", "js/keep-icon-data.js", "js/bifrost-valhodl-art.js",
  "js/island-view-art.js", "js/poker-timeline-art.js", "js/poker-minneapolis-art.js", "js/poker-desert-throw-art.js", "js/poker-family-glass-art.js",
  "js/poker-moon-map.js", "js/poker-ice-map.js", "js/poker-hearth-map.js",
  "js/ghost-herald-data.js", // HALLOWEEN: the herald's views; goes with the ghost hunt.
];
export function externalizePictures(src, text, out) {
  mkdirSync(join(out, "art"), { recursive: true });
  let count = 0;
  const updated = text.replace(/data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)/g, (_, type, encoded) => {
    const bytes = Buffer.from(encoded, "base64"), file = `${basename(src, ".js")}-${hash(bytes, "hex")}.${type === "jpeg" ? "jpg" : type}`;
    writeFileSync(join(out, "art", file), bytes);
    count++;
    return `/art/${file}`;
  });
  if (!count) throw new Error(`distribution: ${src} carries no pictures`);
  return updated;
}
