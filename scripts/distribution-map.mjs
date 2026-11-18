// Stages the World Map page (/map) for scripts/site.mjs: map.html beside the route pages, with its stylesheet
// (src/native.css's tokens, then src/map/map.css), its script (the cave-sign lettering, the tree
// scripts/world-map.mjs builds from the game's data, then src/map/map.js) and the appearance it starts in
// (src/map/theme.js, run before the stylesheet) as same-origin files named by their content, css/map-<hash>.css,
// js/map-<hash>.js and js/map-theme-<hash>.js, so the page's own policy needs neither an inline block nor a hash. The page
// carries the tree as a list of links too, for a reader without scripts and for search engines; it never holds a
// player's name, which only /api/world gives, and only to a signed-in viewer.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { worldMap } from "./world-map.mjs";

export const MAP_ENTRY = Object.freeze({ path: "map", title: "World Map",
  description: "Every place in Ooga Booga Land and how they connect: the island, its caves and bridged islands, and the worlds behind ₿IFRÖST, down to the rooms inside them, with who stands where right now." });

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hash = (text) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);

// The tree as nested lists of links.
const listOf = (n) => {
  const name = n.href ? `<a href="${esc(n.href)}"${n.external ? ' rel="noopener noreferrer"' : ""}>${esc(n.name)}</a>` : esc(n.name);
  const items = n.items.length ? ` (${n.items.map((i) => i.href ? `<a href="${esc(i.href)}">${esc(i.name)}</a>` : esc(i.name)).join(", ")})` : "";
  const via = n.via ? `<span class="via">by ${esc(n.via)}: </span>` : "";
  const children = n.children.length ? `<ul>${n.children.map(listOf).join("")}</ul>` : "";
  return `<li>${via}${name}${items}${n.blurb ? ` · ${esc(n.blurb)}` : ""}${children}</li>`;
};

// Writes map.html and its two files into `out`; `head` is the route pages' head for MAP_ENTRY. Returns the map and the
// files' addresses.
export const stageMap = (root, out, head) => {
  const read = (path) => readFileSync(join(root, path), "utf8");
  const map = worldMap();
  const write = (dir, name, text) => {
    mkdirSync(join(out, dir), { recursive: true });
    const file = `${name}-${hash(text)}.${dir}`;
    writeFileSync(join(out, dir, file), text);
    return `/${dir}/${file}`;
  };
  const theme = write("js", "map-theme", read("src/map/theme.js"));
  const css = write("css", "map", `${read("src/native.css")}\n${read("src/map/map.css")}`);
  const js = write("js", "map", `${read("src/js/sign-glyphs.js")}\nwindow.BL.worldMap = ${JSON.stringify(map)};\n${read("src/map/map.js")}`);
  let page = read("src/map/index.html");
  for (const [mark, value] of [["__MAP_THEME__", theme], ["__MAP_CSS__", css], ["__MAP_JS__", js], ["<!-- head -->", head], ["<!-- tree -->", `<ul>${listOf(map.tree)}</ul>`]]) {
    if (page.split(mark).length !== 2) throw new Error(`src/map/index.html: expected ${mark} once`);
    page = page.replace(mark, () => value);
  }
  writeFileSync(join(out, "map.html"), page);
  return { map, theme, css, js };
};
