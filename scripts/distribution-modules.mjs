// Hosted pages only: each group of modules tagged `data-defer` in src/index.html leaves the page's one inline script
// for a same-origin file, js/<group>-<hash>.js, named in `BL.deferredScripts` at the head of the script, where
// src/js/deferred.js finds it when the group is first needed (the Timechain Sphere's rooms, once a visitor commits to
// one). The page's script policy gains 'self' for that file, as src/index.html already allows; the portable page
// (oogaboogaland.html) keeps every module inline, so file:// and a single download still work. `transform(src, text)`
// may rewrite a module's text as it enters its bundle: `--image-assets` writes the DSB rooms' pictures out of the dsb
// bundle that way (`externalizePictures`).
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const hash = (text, encoding) => createHash("sha256").update(text, "utf8").digest(encoding);
export function externalizeModules(html, out, deferred, block, terrainWorker = null, transform = (src, text) => text) {
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
  const worker = terrainWorker ? `window.BL.terrainWorker = ${JSON.stringify(terrainWorker)};\n` : "";
  const updated = `\nwindow.BL = window.BL || {};\nwindow.BL.deferredScripts = ${JSON.stringify(named)};\n${worker}${body.replace(/^\n/, "")}`;
  return html.replace(script[0], () => `<script>${updated}</script>`)
    .replace(oldPolicy, `script-src 'self' 'sha256-${hash(updated, "base64")}'`);
}

// The DSB rooms' pictures (article thumbnails, product covers, profile previews) are data URIs in these modules, which
// travel in the deferred dsb bundle; the menus set each as an image's src either way, under `img-src 'self' data:`.
// Each becomes art/<module>-<sha256>.<ext> holding the same bytes, so entering DSB fetches the code alone and a picture
// only when a menu shows it.
export const PICTURE_MODULES = ["js/without-rulers-data.js", "js/stackchain-art.js", "js/proof-of-ink-data.js", "js/meme-factory-data.js"];
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
