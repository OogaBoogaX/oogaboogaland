// Builds one self-contained page, ordered by src/index.html
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, "src", path), "utf8");
const sha256 = (text) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

let html = read("index.html");

const cssTag = /<link rel="stylesheet" href="([^"]+)">/;
const cssMatch = html.match(cssTag);
if (!cssMatch) throw new Error("index.html: stylesheet link not found");
const css = read(cssMatch[1]).trim();
html = html.replace(cssTag, `<style>\n${css}\n</style>`);

const scriptTag = /^[ \t]*<script src="([^"]+)"><\/script>\n/gm;
const sources = [...html.matchAll(scriptTag)].map((m) => m[1]);
if (!sources.length) throw new Error("index.html: no script tags found");
// A literal closing tag would end the block early
const js = sources.map((src) => `// ---- ${src} ----\n${read(src).trim()}`).join("\n\n").replace(/<\/script/gi, "<\\/script");
let first = true;
html = html.replace(scriptTag, () => {
  if (!first) return "";
  first = false;
  return `<script>\n${js}\n</script>\n`;
});

// Allow exactly these inline blocks by hash
const csp = /content="(default-src 'none'; script-src [^"]*)"/;
if (!csp.test(html)) throw new Error("index.html: CSP meta not found");
html = html.replace(csp, (_, policy) => {
  const updated = policy
    .replace(/script-src [^;]+/, `script-src ${sha256(`\n${js}\n`)}`)
    .replace(/style-src [^;]+/, `style-src ${sha256(`\n${css}\n`)}`);
  return `content="${updated}"`;
});

const out = join(root, "oogaboogaland.html");
writeFileSync(out, html);
console.log(`built ${out} (${(html.length / 1024).toFixed(0)} KB, ${sources.length} scripts inlined)`);
