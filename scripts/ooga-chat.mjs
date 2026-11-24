// Builds and stages Ooga Chat, the standalone app in src/ooga-chat/: `node scripts/ooga-chat.mjs [dir] [--fixtures]`,
// default untracked/ooga-chat (docs/ooga-chat-app.md). It shares no output with the island: it refuses the island's
// staging folders and the repository's own, and it only clears a folder an earlier run of this script staged.
// index.html's stylesheets become one same-origin css/ file and its scripts one js/ file, named by their hash, so the
// page carries no inline code under its policy (`script-src 'self'; style-src 'self'`), but for the scripts tagged
// `data-defer="<group>"`: each group is staged as js/ooga-chat-<group>-<hash>.js, kept out of the first load and named
// in `BL.oogaChatScripts` at the head of the first-load script, which fetches it when a tab needs it or once the page
// is idle (ooga-chat-chunks.js); a stylesheet tagged the same way is that group's own css/ooga-chat-<group>-<hash>.css,
// named in `BL.oogaChatScripts` as `<group>.css` for that group's code to link; the service worker keeps them all. Every picture under art/ the
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
import { encode, ico, touchIcon } from "./distribution-icons.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(root, "src", "ooga-chat");
// The island modules the app may share: each loads nothing at load but window.BL and the document.
export const SHARED = ["../js/sign-glyphs.js", "../js/native-icons.js", "../js/donations.js", "../js/banana-panel.js", "../js/qr.js", "../js/banana-icon.js",
  "../js/jumbotron-font.js", "../js/factory-kiosk-core.js", "../js/factory-kiosk.js", "../js/donation-popup.js", "../js/chat-policy.js", "../js/emoji-data.js", "../js/reaction-policy.js",
  "../js/zone-map.js", "../js/commons-log.js", "../js/format-large.js", "../js/roster-panel.js", "../js/contributor-identities.js", "../js/activity-repos.js",
  "../js/audience-tiles.js", "../js/reaction-bar.js", "../js/voice-handoff.js", "../js/duel-listening.js", "../js/chat-hosts.js",
  // The island view (island-view.js, with the hosted chats), and its opt-in Live view: the game's own renderer and the
  // island's ground (OPT_IN, fetched only when a viewer turns it on).
  "../js/island-view-data.js", "../js/island-view.js", "../js/math.js", "../js/daylight.js", "../js/scene.js", "../js/compact-geometry.js",
  "../js/mirror-ripples.js", "../js/mirror-body.js", "../js/dsb-water.js", "../js/gl-renderer.js", "../js/build-tasks.js", "../js/models.js", "../js/convex.js",
  "../js/terrain.js", "../js/island-view-live.js"];
// Deferred groups a visit fetches only on the visitor's word, never ahead of it: kept out of the idle prefetch
// (ooga-chat-chunks.js) and the service worker's shell, so an install never downloads them either.
export const OPT_IN = ["live"];
// What a first visit may cost over the wire (index.html, the first-load script, the stylesheet and the art it shows),
// gzipped, never the deferred chunks. The
// staged foundation measured about 91 KB, most of it the sign-in picture. The original picture at Retina size (about
// 80 KB in place of the 430-pixel stand-in's 58), the island's Bananas panel with donations.js (#656, about 15 KB) and
// its Feed the Oogas kiosk (donation-popup.js, factory-kiosk.js, qr.js and the jumbotron's font, about 28 KB) and
// The Commons and Online Oogas (commons-log.js, the chat, reaction and zone helpers and their views, about 13 KB) and
// Contributing Oogas (roster-panel.js, the oogatron normalizers, the face sheet's index and the island's own rules for
// these panels, about 16 KB; the face sheet itself loads only when a stats strip opens), the Ooga Chat panel's circles
// and account rows (about 3 KB) and the island's own emoji panel with its picker (#655: reaction-bar.js and the whole
// emoji list it picks from, emoji-data.js, about 25 KB with their rules) bring it to about 213 KB. Loading the emoji list
// only when the picker opens would take most of that back; that needs the build to stage a second script. Ooga Chat's
// own voice client (#654: ooga-chat-media.js, about 14 KB) and the Commons' name field (about 1 KB) bring it to about
// 229.5 KB. Each player's volume and mute in the Ooga Chat panel, the optional duel muting (duel-listening.js) and the
// voice client's handoffs between the app and the island (#766, about 5.5 KB) bring it to about 237.5 KB (241.2 KB by
// the time it was split). Then every tab but Ooga Chat moved into a chunk of its own, fetched once the first view has
// painted (Bananas with Feed the Oogas and donations.js, about 45 KB; Contributing Oogas, Online Oogas and The Commons
// with their island modules, about 24 KB), which took the first load to about 176.6 KB. The build fails past this, set
// just above it, so a tab's code cannot slip back into the first load unnoticed. The emoji bar and its picker with the
// whole emoji list (emoji-data.js and reaction-bar.js, about 24 KB), wanted only signed in, then moved into a chunk of
// their own too, once reaction-policy.js read the list when first asked rather than at load: about 153.3 KB, then 154.1 KB
// with the voice links and listeners in Online Oogas (#861) and each chunk's guard against running twice. Hosted chats
// (docs/ooga-chat-hosts.md) put their views and look in a chunk of their own, `hosts`, with its own stylesheet, and only
// their glue in the first load (the adapter's routes, the roster's ranks, the chosen chat, the tile menu's hook): 156.0 KB.
// On 2026-11-23 the maintainer raised the budget to 256 KB for hosted chats, the first load then about 155.9 KB.
export const FIRST_LOAD_BUDGET = 256 * 1024;
// The island's own rules for the panels the app shows as the island does (src/style.css), taken by selector each time
// the app builds, so the two look the same from one source: every rule whose selectors begin with one of ISLAND_RULES
// (a rule's other selectors, another panel's, left behind), in an @media, @supports or @container block too, and every
// @keyframes named by one, joined after native.css and before ooga-chat.css, which places them. `islandRules` is that
// pick.
export const ISLAND_RULES = [".roster", ".players-", ".chat-", ".section-head", ".panel .chat-status", '.panel[data-panel="chat"] > .panel-title',
  ".help", ".link", ".account", ".foot-button", ".foot-primary", ".cloud-status", ".panel > .cloud-roster", ".cloud-tile",
  ".cloud-face", ".cloud-portrait", ".cloud-react", ".cloud-hand", ".cloud-pop", ".cloud-name", ".cloud-role",
  ".cloud-mic", ".cloud-foot", ".cloud-mute", ".cloud-voice", ".reaction", ".panel-foot", ".voice-handoff"];
// Pictures the app loads only when they are wanted, never on a first visit: the face sheet, when a stats strip opens, and
// the island view's map, when a chat's speaker walks its island.
export const LAZY_ART = ["ooga-faces.png", "island-view-main.webp"];
// Smaller copies of a picture in a view's srcset, which a visit loads in place of the full one: the first load counts
// only the full one, the most a visit can fetch.
export const ALTERNATE_ART = ["sign-in-island-520.webp", "sign-in-island-680.webp"];
export const islandRules = (css, prefixes = ISLAND_RULES) => {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const names = prefixes.map((prefix) => prefix.replace(/^[.#]/, ""));
  // The top-level statements of a block of CSS, each `{ prelude, body }` (body null for one ending in `;`).
  const statements = (block) => {
    const out = [];
    let at = 0;
    while (at < block.length) {
      const open = block.indexOf("{", at), semi = block.indexOf(";", at);
      if (open < 0) break;
      if (semi >= 0 && semi < open) { at = semi + 1; continue; }
      let depth = 1, end = open + 1;
      while (end < block.length && depth) { if (block[end] === "{") depth++; else if (block[end] === "}") depth--; end++; }
      out.push({ prelude: block.slice(at, open).trim(), body: block.slice(open + 1, end - 1) });
      at = end;
    }
    return out;
  };
  // Selectors split at the commas outside brackets and parentheses.
  const selectors = (prelude) => {
    const out = [];
    let depth = 0, start = 0;
    for (let i = 0; i < prelude.length; i++) {
      const c = prelude[i];
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      else if (c === "," && !depth) { out.push(prelude.slice(start, i).trim()); start = i + 1; }
    }
    out.push(prelude.slice(start).trim());
    return out;
  };
  const pick = (block) => {
    const kept = [];
    for (const { prelude, body } of statements(block)) {
      if (prelude.startsWith("@media") || prelude.startsWith("@supports") || prelude.startsWith("@container")) {
        const inner = pick(body);
        if (inner.length) kept.push(`${prelude} {\n${inner.map((rule) => `  ${rule.replace(/\n/g, "\n  ")}`).join("\n")}\n}`);
      } else if (prelude.startsWith("@keyframes")) {
        const name = prelude.slice("@keyframes".length).trim();
        if (names.some((prefix) => name.startsWith(prefix))) kept.push(`${prelude} {${body}}`);
      } else if (!prelude.startsWith("@")) {
        const ours = selectors(prelude).filter((selector) => prefixes.some((prefix) => selector.startsWith(prefix)));
        if (ours.length) kept.push(`${ours.join(",\n")} {${body}}`);
      }
    }
    return kept;
  };
  return pick(text).join("\n\n");
};
export const POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 16);
// The installable app's identity and colours, and its icons, all drawn from Ooga Chat's mark (native-icons.js `cloud`)
// by whole pixels. On the black theme its dark outline would vanish, so each outline pixel takes the colour of what it
// outlines: the dots' purple beside a dot, the cloud's white elsewhere. The manifest's icons are that mark on the theme
// colour, at most `fill` of the side (a maskable icon keeps inside the platform's safe circle). The favicons are the
// island's set (distribution-icons.mjs): 32px and 64px PNGs, here the mark on a rounded square of the theme colour,
// favicon.ico holding both, and the Apple touch icon the 64px one at twice its size on the theme colour.
export const APP = { name: "Ooga Chat", description: "Voice chats from Ooga Booga Land: join one and ask to speak.", theme: "#0a0a0b" };
export const ICON_SIZES = [{ size: 192, fill: 0.75, purpose: "any" }, { size: 512, fill: 0.75, purpose: "any" }, { size: 512, fill: 0.5, purpose: "maskable" }];
export const FAVICON_SIZES = [32, 64];
const OUTLINE = "#2b1b10", DOT = "#b18aff";
const rgb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
/** The mark as a grid of colours (null where clear), its outline filled in. */
export const cloudMark = () => {
  const context = { window: {} };
  runInNewContext(readFileSync(join(root, "src", "js", "native-icons.js"), "utf8"), context);
  const [, viewBox, , parts] = context.window.BL.nativeIcons.ICONS.cloud;
  const [, , w, h] = viewBox.split(" ").map(Number), grid = new Array(w * h).fill(null);
  for (const [colour, d, part] of parts) {
    if (part === "cloud-near") continue;
    const rects = [...d.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)H\d+z/g)];
    if (!rects.length) throw new Error("ooga-chat: the native cloud's paths are not pixel rectangles");
    for (const [, x, y, rw, rh] of rects) for (let j = +y; j < +y + +rh; j++) for (let i = +x; i < +x + +rw; i++) grid[j * w + i] = colour;
  }
  return { w, h, grid: grid.map((colour, k) => {
    if (colour !== OUTLINE) return colour;
    const x = k % w, y = (k - x) / w;
    const near = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([i, j]) => i >= 0 && i < w && j >= 0 && j < h)
      .map(([i, j]) => grid[j * w + i]).filter((c) => c && c !== OUTLINE);
    if (!near.length) throw new Error("ooga-chat: an outline pixel of the native cloud outlines nothing");
    return near.includes(DOT) ? DOT : near[0];
  }) };
};
// The mark at `scale` a pixel with its corner at (left, top), over `px`, a size x size RGBA buffer.
const lay = (px, size, mark, scale, left, top) => {
  for (let k = 0; k < mark.grid.length; k++) {
    if (!mark.grid[k]) continue;
    const colour = [...rgb(mark.grid[k]), 255], x0 = left + (k % mark.w) * scale, y0 = top + Math.floor(k / mark.w) * scale;
    for (let y = y0; y < y0 + scale; y++) for (let x = x0; x < x0 + scale; x++) px.set(colour, (y * size + x) * 4);
  }
  return px;
};
export const cloudIcon = (size, fill, mark = cloudMark()) => {
  const scale = Math.floor(size * fill / Math.max(mark.w, mark.h)), px = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) px.set([...rgb(APP.theme), 255], i * 4);
  return encode(size, size, lay(px, size, mark, scale, Math.floor((size - mark.w * scale) / 2), Math.floor((size - mark.h * scale) / 2)));
};
// A favicon: the mark at size/16 a pixel, centred on a rounded square of the theme colour (corners 7/32 of the side,
// their edge smoothed by coverage), clear outside it.
export const favicon = (size, mark = cloudMark()) => {
  const scale = size / 16, left = (size - mark.w * scale) / 2, top = (size - mark.h * scale) / 2, r = size * 7 / 32;
  if (!Number.isInteger(scale) || !Number.isInteger(left) || !Number.isInteger(top) || left < 0 || top < 0) throw new Error(`ooga-chat: the mark does not fit a ${size}px favicon`);
  const inside = (x, y) => {
    const dx = Math.max(r - x, 0, x - (size - r)), dy = Math.max(r - y, 0, y - (size - r));
    return dx * dx + dy * dy <= r * r;
  };
  const px = Buffer.alloc(size * size * 4), bg = rgb(APP.theme);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let hit = 0;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) hit += inside(x + (i + 0.5) / 4, y + (j + 0.5) / 4);
    px.set([...bg, Math.round(hit / 16 * 255)], (y * size + x) * 4);
  }
  return encode(size, size, lay(px, size, mark, scale, left, top));
};

const read = (page) => readFileSync(join(app, page), "utf8");
// A script tag, with the group it is deferred to, if any.
const SCRIPT_TAG = /^([ \t]*)<script src="([^"]+)"(?: data-defer="([a-z]+)")?><\/script>\r?\n/gm;
const SHEET_TAG = /^([ \t]*)<link rel="stylesheet" href="([^"]+)"(?: data-defer="([a-z]+)")?>\r?\n/gm;
const listOf = (html, page) => {
  const links = [...html.matchAll(SHEET_TAG)], sheets = links.filter((m) => !m[3]).map((m) => m[2]);
  // A deferred group's own stylesheet, by group; only a group with scripts may have one.
  const styles = new Map(links.filter((m) => m[3]).map((m) => [m[3], m[2]]));
  const tags = [...html.matchAll(SCRIPT_TAG)], scripts = tags.map((m) => m[2]);
  // Every script's group, "" for the first load; the last script (the app) always loads first.
  const groups = new Map(tags.map((m) => [m[2], m[3] || ""]));
  if (!sheets.length || !scripts.length) throw new Error(`${page}: expected stylesheet links and script tags`);
  for (const src of scripts) if (!SHARED.includes(src) && !/^ooga-chat-[a-z-]+\.js$/.test(src)) {
    throw new Error(`${page}: ${src} is neither an Ooga Chat module nor a shared one (scripts/ooga-chat.mjs SHARED)`);
  }
  if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(html) || /<style/i.test(html) || /\sstyle="/i.test(html) || /\son[a-z]+="/i.test(html)) {
    throw new Error(`${page}: inline script, style or handler; the policy allows only same-origin files`);
  }
  if (!html.includes(`content="${POLICY}"`)) throw new Error(`${page}: its content policy differs from scripts/ooga-chat.mjs POLICY`);
  if (groups.get(scripts.at(-1))) throw new Error(`${page}: the app itself cannot be deferred`);
  for (const group of styles.keys()) if (![...groups.values()].includes(group)) throw new Error(`${page}: a stylesheet is deferred to ${group}, which has no scripts`);
  return { sheets, scripts, groups, styles };
};

// The two entries differ only by the fixture adapter, loaded just before the app starts.
export const entries = () => {
  const index = read("index.html"), fixture = read("fixture.html");
  const main = listOf(index, "index.html"), review = listOf(fixture, "fixture.html");
  if (main.scripts.includes("ooga-chat-fixtures.js") || index.includes("data-adapter=")) throw new Error("index.html: the production entry must not load or select fixtures");
  const expected = [...main.scripts.slice(0, -1), "ooga-chat-fixtures.js", main.scripts.at(-1)];
  if (review.scripts.join() !== expected.join() || review.sheets.join() !== main.sheets.join() || main.scripts.some((src) => review.groups.get(src) !== main.groups.get(src))
    || [...main.styles].join() !== [...review.styles].join()) {
    throw new Error("fixture.html: must load index.html's files plus ooga-chat-fixtures.js just before ooga-chat-app.js");
  }
  return { index, fixture, main, review };
};

// The one-page placeholder worker/chat/stage.mjs (#662) staged before this build existed: exactly these two files, each
// exactly this page. A checkout that deployed or ran dev:chat then still has it, and it may be staged over.
export const PLACEHOLDER = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
  + "<title>Ooga Chat</title><p>Ooga Chat is on its way.</p></html>\n";
const placeholder = (out) => {
  const names = readdirSync(out).sort();
  return names.join() === "404.html,index.html" && names.every((name) => readFileSync(join(out, name), "utf8") === PLACEHOLDER);
};
// Refuse any folder the island stages, the repository or its sources, and a non-empty folder this script did not make
// (stage.mjs's placeholder aside).
const guard = (out) => {
  const rel = relative(root, out).split(sep).join("/");
  const inside = rel !== "" && !rel.startsWith("..") && !/^[a-zA-Z]:|^\//.test(rel);
  const forbidden = ["src", "_site", "untracked/site", "cards", "worker", "scripts", "test", "docs", ".git", "node_modules"];
  if (out === root || inside && forbidden.some((dir) => rel === dir || rel.startsWith(`${dir}/`))) {
    throw new Error(`ooga-chat: refusing to stage into ${rel || "the repository root"}`);
  }
  if (existsSync(out) && readdirSync(out).length && !placeholder(out)) {
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
    // Every picture a script names, a lone src or each size in a srcset, moves to its hashed address.
    js = js.replace(/(?<![\w/])art\/([\w.@-]+\.(?:jpe?g|png|webp))\b/g, (_, file) => {
      if (!art.has(file)) throw new Error(`ooga-chat: a script names art/${file}, which src/ooga-chat/art/ does not hold`);
      return art.get(file);
    });
    return `${js}\n`;
  };
  // Each deferred group first, so the first-load script can name their hashed files.
  const deferredOf = (entry) => [...new Set(entry.scripts.map((src) => entry.groups.get(src)).filter(Boolean))];
  // A chunk that runs twice (a late copy after a timeout, ooga-chat-chunks.js) returns at its head: its group is here.
  const chunkOf = (group) => `(() => {\nif (window.BL && window.BL.oogaChatChunks && window.BL.oogaChatChunks.present(${JSON.stringify(group)})) return;\n\n${bundle(main.scripts.filter((src) => main.groups.get(src) === group))}})();\n`;
  const chunks = Object.fromEntries(deferredOf(main).map((group) => [group, chunkOf(group)]));
  const scripts = Object.fromEntries(Object.entries(chunks).map(([group, code]) => [group, named("js", `ooga-chat-${group}`, "js", code)]));
  const styleOf = (path) => {
    const text = `${read(path).trim().replace(/\r\n/g, "\n")}\n`;
    if (/url\(/.test(text)) throw new Error("ooga-chat: a stylesheet loads a url(); name pictures from the views instead");
    return text;
  };
  const styles = Object.fromEntries([...main.styles].map(([group, path]) => [`${group}.css`, named("css", `ooga-chat-${group}`, "css", styleOf(path))]));
  const head = `window.BL = window.BL || {};\nwindow.BL.oogaChatScripts = ${JSON.stringify({ ...scripts, ...styles })};\n\n`;
  const firstLoad = (entry) => `${head}${bundle(entry.scripts.filter((src) => !entry.groups.get(src)))}`;
  const used = new Set();
  const js = firstLoad(main);
  for (const [file, path] of art) if ([js, ...Object.values(chunks)].some((code) => code.includes(path))) used.add(file);
  for (const file of pictures) if (!used.has(file)) throw new Error(`ooga-chat: art/${file} is staged but no script shows it`);
  const mark = cloudMark();
  const icons = ICON_SIZES.map(({ size, fill, purpose }) => ({ size, purpose,
    path: named("icons", `ooga-chat-${size}${purpose === "maskable" ? "-maskable" : ""}`, "png", cloudIcon(size, fill, mark)) }));
  // The favicons at the addresses browsers and link previews ask for unprompted, as the island's staged site has them.
  const favicons = FAVICON_SIZES.map((size) => ({ size, bytes: favicon(size, mark) }));
  for (const { size, bytes } of favicons) write(`favicon-${size}.png`, bytes);
  write("favicon.ico", ico(favicons));
  const touch = touchIcon(favicons.find((f) => f.size === 64).bytes, APP.theme);
  for (const file of ["apple-touch-icon.png", "apple-touch-icon-precomposed.png"]) write(file, touch);
  const iconLinks = FAVICON_SIZES.map((size) => `\n  <link rel="icon" type="image/png" sizes="${size}x${size}" href="/favicon-${size}.png">`).join("");
  // native.css, then the island's own rules for the panels it shares, then the app's own stylesheets.
  const island = `/* The island's own rules for the panels the app shares (src/style.css, scripts/ooga-chat.mjs ISLAND_RULES). */\n${islandRules(readFileSync(join(root, "src", "style.css"), "utf8"))}`;
  const sheets = main.sheets.map((path) => read(path).trim().replace(/\r\n/g, "\n"));
  const css = `${[sheets[0], island, ...sheets.slice(1)].join("\n\n")}\n`;
  if (/url\(/.test(css)) throw new Error("ooga-chat: a stylesheet loads a url(); name pictures from the views instead");
  const sheet = named("css", "ooga-chat", "css", css);
  const stage = (html, page, scriptPath, buildId, head = "") => {
    // The first tag of each kind becomes the one staged file; the rest go.
    const once = (pattern, tag) => {
      let first = true;
      return (text) => text.replace(pattern, (_, indent) => first ? (first = false, `${indent}${tag}\n`) : "");
    };
    const shell = [once(SHEET_TAG, `<link rel="stylesheet" href="${sheet}">`),
      once(SCRIPT_TAG, `<script src="${scriptPath}"></script>`)].reduce((text, step) => step(text), html)
      .replace('<meta name="ooga-chat-build" content="dev">', `<meta name="ooga-chat-build" content="${buildId}">${head}`);
    if (!shell.includes(`content="${buildId}"`) || (shell.match(/<script /g) || []).length !== 1) throw new Error(`ooga-chat: ${page} did not stage`);
    write(page, shell);
  };
  const script = named("js", "ooga-chat", "js", js);
  const buildId = hash(`${js}${Object.values(chunks).join("")}${css}${Object.values(styles).join("")}`);
  // Only the production entry is installable: the review entry links no manifest and registers no worker.
  stage(index, "index.html", script, buildId, `${iconLinks}\n  <link rel="manifest" href="/manifest.webmanifest">\n  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`);
  write("manifest.webmanifest", `${JSON.stringify({ id: "/", name: APP.name, short_name: APP.name, description: APP.description, start_url: "/", scope: "/",
    display: "standalone", background_color: APP.theme, theme_color: APP.theme,
    icons: icons.map((icon) => ({ src: icon.path, sizes: `${icon.size}x${icon.size}`, type: "image/png", purpose: icon.purpose })) }, null, 2)}\n`);
  // The worker's shell: the page and every hashed file of this build, never the fixture entry, the manifest, the 404 or
  // an opt-in chunk.
  const optIn = new Set(OPT_IN.map((group) => scripts[group]).filter(Boolean));
  const shell = ["/", ...files.filter((path) => /^(js|css|art|icons)\//.test(path) && !optIn.has(`/${path}`)).sort().map((path) => `/${path}`)];
  const worker = read("service-worker.js").replace('const VERSION = "dev";', `const VERSION = ${JSON.stringify(buildId)};`).replace("const SHELL = [];", `const SHELL = ${JSON.stringify(shell)};`);
  if (!worker.includes(buildId) || worker.includes("const SHELL = [];")) throw new Error("ooga-chat: the service worker did not stage");
  write("sw.js", worker);
  if (fixtures) stage(fixture, "fixture.html", named("js", "ooga-chat-fixture", "js", firstLoad(review)), buildId, iconLinks);
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
  const lazy = (path) => [...LAZY_ART, ...ALTERNATE_ART].some((name) => art.get(name) === `/${path}`);
  const first = inventory.filter((file) => file.path === "index.html" || file.path === sheet.slice(1) || file.path === script.slice(1) || file.path.startsWith("art/") && !lazy(file.path))
    .reduce((sum, file) => sum + file.gzip, 0);
  if (first > FIRST_LOAD_BUDGET) throw new Error(`ooga-chat: first load is ${first} bytes gzipped, over FIRST_LOAD_BUDGET (${FIRST_LOAD_BUDGET})`);
  const gzipOf = (path) => inventory.find((file) => `/${file.path}` === path).gzip;
  const manifest = { app: "ooga-chat", build: buildId, bootstrap: 1, fixtures, firstLoad: first, scripts: main.scripts.map((src) => src.replace(/^\.\.\//, "")),
    chunks: Object.fromEntries(Object.entries(scripts).map(([group, path]) => [group, { path: path.slice(1), gzip: gzipOf(path),
      scripts: main.scripts.filter((src) => main.groups.get(src) === group).map((src) => src.replace(/^\.\.\//, "")) }])), files: inventory };
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
  const later = Object.entries(manifest.chunks).map(([group, chunk]) => `${group} ${kb(chunk.gzip)}`).join(", ");
  console.log(`staged ${resolve(root, dir)}: build ${manifest.build}, first load ${kb(manifest.firstLoad)} gzipped of a ${kb(FIRST_LOAD_BUDGET)} budget, then ${later || "nothing"} as tabs need it${manifest.fixtures ? ", with fixture.html" : ""}`);
  if (args.includes("--serve")) await serve(resolve(root, dir), Number(process.env.PORT) || 8090, manifest);
}
