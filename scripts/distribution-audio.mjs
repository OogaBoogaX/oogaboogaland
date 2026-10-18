// Staging only: keep the portable page embedded, serve exact MP3 and picture bytes on demand. The staged
// site (Cloudflare and GitHub Pages) writes the DSB entrance recordings under audio/ and the DSB rooms'
// pictures under art/, content-addressed, and points the page's modules at them; `npm run build` and the
// direct-file page keep everything embedded. Each transform verifies the script's hash and computes the
// new one over the exact final script; the content policy's origins never change.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const hash = (bytes, encoding) => createHash("sha256").update(bytes).digest(encoding);
const inlined = (root, name) => readFileSync(join(root, "src/js", `${name}.js`), "utf8").trim().replace(/\r\n/g, "\n").replace(/<\/script/gi, "<\\/script");
const rehash = (html, script, updated) => {
  const oldPolicy = `script-src 'sha256-${hash(script[1], "base64")}'`;
  if (html.split(oldPolicy).length !== 2) throw new Error("distribution: script hash not found");
  return html.replace(script[0], () => `<script>${updated}</script>`)
    .replace(oldPolicy, `script-src 'sha256-${hash(updated, "base64")}'`);
};
export function externalizeAudio(html, root, out) {
  const source = inlined(root, "dsb-audio-data");
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!script || script[1].split(source).length !== 2) throw new Error("distribution: expected one embedded DSB audio module");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const data = context.window.BL.dsbAudioData;
  if (!Array.isArray(data.voices) || data.voices.length !== 4 || typeof data.music !== "string") throw new Error("distribution: invalid DSB recordings");
  mkdirSync(join(out, "audio"), { recursive: true });
  const asset = (encoded) => {
    const bytes = Buffer.from(encoded, "base64"), name = `dsb-${hash(bytes, "hex")}.mp3`;
    writeFileSync(join(out, "audio", name), bytes);
    return `/audio/${name}`;
  };
  const descriptor = { external: true, voices: data.voices.map(asset), music: asset(data.music) };
  const replacement = `window.BL.dsbAudioData = ${JSON.stringify(descriptor)};`;
  return rehash(html, script, script[1].replace(source, replacement));
}

// The DSB rooms' pictures (article thumbnails, product covers, profile previews) are data URIs inside these
// modules; the menus set each as an image's src either way, under `img-src 'self' data:`.
export const IMAGE_MODULES = ["without-rulers-data", "stackchain-art", "proof-of-ink-data", "meme-factory-data"];
const DATA_URI = /data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)/g;
export function externalizeImages(html, root, out) {
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!script) throw new Error("distribution: expected one inline script");
  mkdirSync(join(out, "art"), { recursive: true });
  let updated = script[1], count = 0;
  for (const name of IMAGE_MODULES) {
    const source = inlined(root, name);
    if (updated.split(source).length !== 2) throw new Error(`distribution: expected one embedded ${name} module`);
    const replacement = source.replace(DATA_URI, (match, type, encoded) => {
      const bytes = Buffer.from(encoded, "base64"), file = `${name}-${hash(bytes, "hex")}.${type === "jpeg" ? "jpg" : type}`;
      writeFileSync(join(out, "art", file), bytes);
      count++;
      return `/art/${file}`;
    });
    updated = updated.replace(source, () => replacement);
  }
  if (!count) throw new Error("distribution: no embedded pictures found");
  return rehash(html, script, updated);
}
