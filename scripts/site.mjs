// Builds the page and stages the site as GitHub Pages serves it: `node scripts/site.mjs [dir]`, default
// untracked/site. Search engines and link crawlers judge a page by the HTML at its exact address, so every
// route in src/js/routes.js gets a real page of its own: oogarally.html answers /oogarally with a 200, its own
// title, description, canonical address and preview card, and the router opens the rally from the path.
// Each is the whole built page with its own head. 404.html sends a miscased or slash-ended route
// (/OogaRally/) to its address and anything else home; sitemap.xml and robots.txt list the routes, and
// cards/ holds the card images from `npm run cards`; a route without an `image` uses home's. Modules tagged
// `data-defer` move out of the pages into js/<group>-<hash>.js (scripts/distribution-modules.mjs), fetched when needed.
// `--audio-assets` and `--image-assets` write the DSB entrance recordings and the DSB rooms' pictures as same-origin
// files under audio/ and art/; `npm run build:site` and `npm run serve` pass both, GitHub Pages (`pages.yml`) only
// `--audio-assets`, and the portable page stays whole.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { externalizeAudio } from "./distribution-audio.mjs";
import { PICTURE_MODULES, externalizeModules, externalizePictures } from "./distribution-modules.mjs";
import { writeTerrainWorker } from "./distribution-terrain.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, process.argv[2] || "untracked/site");
const { deferred, block } = await import("./build.mjs");

const context = { window: {} };
vm.runInNewContext(readFileSync(join(root, "src", "js", "routes.js"), "utf8"), context);
const routes = context.window.BL.routes;
const { site, name, list } = routes;

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "cards"), { recursive: true });
mkdirSync(join(out, "media"), { recursive: true });
// Stage only catalogue-reviewed assets; never proxy or fetch a supplied media URL.
const mediaContext = {};
vm.runInNewContext(readFileSync(join(root, "src/js/studio-catalogue.js"), "utf8"), mediaContext);
const mediaFiles = new Set();
for (const source of mediaContext.BL.studioMedia.sources) for (const path of [source.url, source.captions, source.transcript]) {
  if (!/^\/media\/[a-z0-9][a-z0-9._-]*\.(mp4|webm|vtt|txt)$/.test(path)) throw new Error("Invalid reviewed Studio asset path");
  mediaFiles.add(path.slice(7));
}
for (const file of mediaFiles) copyFileSync(join(root, "src/media", file), join(out, "media", file));

let shell = readFileSync(join(root, "oogaboogaland.html"), "utf8");
if (process.argv.includes("--worker-page")) {
  const tag = '<html lang="en">';
  if (!shell.includes(tag)) throw new Error("oogaboogaland.html: expected <html lang=\"en\">");
  shell = shell.replace(tag, '<html lang="en" data-worker-page="1">');
}
if (process.argv.includes("--audio-assets")) shell = externalizeAudio(shell, root, out);
const pictures = process.argv.includes("--image-assets");
if (pictures) for (const src of PICTURE_MODULES) if (![...deferred.values()].some((sources) => sources.includes(src))) throw new Error(`${src}: --image-assets needs it in a data-defer group`);
shell = externalizeModules(shell, out, deferred, block, writeTerrainWorker(root, out), pictures ? (src, text) => PICTURE_MODULES.includes(src) ? externalizePictures(src, text, out) : text : undefined);
if (shell.split("</title>").length !== 2 || shell.split("</head>").length !== 2) throw new Error("oogaboogaland.html: expected one <title> and one </head>");

const esc = (text) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const urlOf = (entry) => `${site}/${entry.path}`;
const imageOf = (entry) => entry.image || list[0].image;
const head = (entry) => {
  const title = esc(routes.title(entry));
  return [
    `<meta name="description" content="${esc(entry.description)}">`,
    `<link rel="canonical" href="${urlOf(entry)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(name)}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${esc(entry.description)}">`,
    `<meta property="og:url" content="${urlOf(entry)}">`,
    `<meta property="og:image" content="${site}/cards/${imageOf(entry)}.jpg">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${title}">`,
    `<meta name="twitter:card" content="summary_large_image">`
  ].join("\n  ");
};
for (const entry of list) {
  const page = shell
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(routes.title(entry))}</title>`)
    .replace("</head>", `  ${head(entry)}\n</head>`);
  writeFileSync(join(out, entry.path ? `${entry.path}.html` : "index.html"), page);
  if (!entry.image) continue;
  const image = join(root, "cards", `${entry.image}.jpg`);
  if (!existsSync(image)) throw new Error(`cards/${entry.image}.jpg is missing; run npm run cards`);
  copyFileSync(image, join(out, "cards", `${entry.image}.jpg`));
}
writeFileSync(join(out, "404.html"), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(name)}</title>
  <meta name="robots" content="noindex">
  <script>const p = location.pathname, to = p.toLowerCase().replace(/[/]+$/, ""); location.replace((to && to !== p ? to : "/") + location.search);</script>
</head>
<body><a href="/">${esc(name)}</a></body>
</html>
`);
writeFileSync(join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${list.map((entry) => `  <url><loc>${urlOf(entry)}</loc></url>`).join("\n")}
</urlset>
`);
writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`staged ${out}: ${list.length} pages of ${kb(shell.length)}, ${list.filter((entry) => entry.image).length} cards, sitemap.xml, robots.txt`);
