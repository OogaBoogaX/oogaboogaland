// The character studio: `npm run character:studio -- <handle>` opens one Ooga on a bare pad in the browser, with a
// chair, a bed, a hammock and a fire to try it on (src/js/scene-studio.js), and reloads the page each time a file
// under src/ is saved, so a player and their agent see every change at once. A handle with no file in
// src/characters is drawn as the Ooga that login gets by default, and `<handle>:slim` as its female build.
//
//   npm run character:studio -- <handle>            serve, and open the browser
//   npm run character:studio -- <handle> --no-open  serve only, and print the address
//   PORT=4300 npm run character:studio -- <handle>  ask for a port (the next free one is taken otherwise)
//
// It serves the source tree from this machine alone (127.0.0.1) with every live feed off, and nothing leaves it.
// The studio stands alone there: every page address the server answers opens it, never the island, and the address
// is no more than `?scene=studio&character=<handle>`.
// On each save it joins src/characters into the page's bundle again and says, here and in the page, what the
// intake's screen makes of the file (scripts/character-check.mjs); `/__studio/reading` gives the same, as data, of the
// file of whichever Ooga stands on the pad, for the page's This Ooga panel. A file that no longer parses is reported and the
// page is left as it was. The file is read as text here and run only by the browser. Stop it with Ctrl+C.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { describe } from "./character-check.mjs";
import { writeCharacters } from "./characters.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src"), characters = join(src, "characters"), bundle = join(src, "js", "characters.gen.js");
const args = process.argv.slice(2), named = args.find((arg) => !arg.startsWith("--"));
if (!named || !/^[A-Za-z0-9-]{1,39}(:slim)?$/.test(named)) {
  console.error("Name the character: npm run character:studio -- <handle>   (a handle is letters, digits and hyphens; <handle>:slim shows a new Ooga's female build)");
  process.exit(1);
}
const slim = named.endsWith(":slim"), handle = slim ? named.slice(0, -5) : named;
const HOST = "127.0.0.1";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".mp4": "video/mp4",
  ".webm": "video/webm", ".vtt": "text/vtt; charset=utf-8", ".txt": "text/plain; charset=utf-8"
};

// What the page is told: `version` moves when it should reload, `error` holds it where it is, `note` is the screen's
// reading of the file last saved, and `count` how many character files there are (so the page can tell when one
// stopped the rest from loading).
const started = Date.now();
let edits = 0, error = "", note = "", count = 0;
const fileOf = (name) => join(characters, `${name}.js`);
// A character file's syntax, without running it: "" when it parses.
const parses = (file) => {
  try { new Script(readFileSync(file, "utf8"), { filename: file }); return ""; } catch (e) {
    const at = /:(\d+)\n/.exec(String(e.stack || ""));
    return `${file.slice(characters.length + 1)}${at ? ` line ${at[1]}` : ""}: ${e.message}`;
  }
};
const read = (file) => {
  const reading = describe(file);
  for (const line of reading.lines) console.log(line);
  note = reading.brief;
};
// What the page's This Ooga panel shows of a character's file, by handle, any letter case: its size of the limit, the
// lane the intake puts it in and why, or `file: false` when it has none yet. The file is read as text, as above.
const reading = (name) => {
  if (!/^[A-Za-z0-9-]{1,39}$/.test(name)) return { file: false };
  const found = readdirSync(characters).find((file) => file.toLowerCase() === `${name.toLowerCase()}.js`);
  if (!found) return { file: false };
  const { refused, bytes, limit, lane, why, finding } = describe(join(characters, found));
  return { file: true, refused, bytes, limit, lane, why, finding };
};
const rebuild = (changed) => {
  const files = readdirSync(characters).filter((name) => name.endsWith(".js"));
  error = "";
  for (const name of files) { error = parses(join(characters, name)); if (error) break; }
  if (error) { console.log(`Not reloaded: ${error}`); return; }
  count = writeCharacters();
  if (changed && existsSync(changed)) read(changed);
};
rebuild(null);
if (existsSync(fileOf(handle))) read(fileOf(handle));
else console.log(`${handle}.js is not in src/characters yet: showing the Ooga ${handle} gets by default${slim ? ", in the female build" : ""}.`);

// Every save under src/ reloads the page; one in src/characters joins the bundle again first. Editors write a file in
// several steps, so the changes of a tenth of a second count as one.
let pending = null, changedCharacter = null;
watch(src, { recursive: true }, (event, name) => {
  if (!name) return;
  const file = join(src, name);
  if (file === bundle || /(^|[\\/])\.|~$|\.swp$|\.tmp$/.test(name)) return;
  if (file.startsWith(characters + sep) && file.endsWith(".js")) changedCharacter = file;
  clearTimeout(pending);
  pending = setTimeout(() => {
    const character = changedCharacter;
    changedCharacter = null;
    if (character) rebuild(character);
    if (!error) edits++;
  }, 100);
});

const send = (res, status, type, body) => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(body);
};
// What the page needs to be the studio and nothing else: the debug page the scene is kept to, with the island's
// feeds, its donation simulator and the account lookup off, the debug page's position readout hidden, and the studio
// asking this server whether to reload. The address stays short (`/?scene=studio&character=<handle>`): the page's
// first script here, `/__studio/boot.js`, writes these into it before any of the game's modules read it, and the
// scene takes them out of sight again once it stands. The Ooga is the one the address names, else the command's.
const NEEDS = { debug: "1", nosim: "1", net: "0", welcome: "0", pos: "0", scene: "studio", watch: "1" };
const boot = `// The character studio's first script (scripts/character-studio.mjs): the flags the page needs, written into the
// address before the game's modules read it.
(() => {
  "use strict";
  const query = new URLSearchParams(location.search), needs = ${JSON.stringify(NEEDS)};
  for (const key of Object.keys(needs)) query.set(key, needs[key]);
  if (!/^[A-Za-z0-9-]{1,39}$/.test(query.get("character") || "")) {
    query.set("character", ${JSON.stringify(handle)});
    ${slim ? 'query.set("build", "slim");' : 'query.delete("build");'}
  }
  history.replaceState(null, "", "/?" + query);
})();
`;
// The page itself, with that script ahead of every other.
const page = () => {
  const html = readFileSync(join(src, "index.html"), "utf8"), at = html.indexOf("<script");
  if (at < 0) throw new Error("index.html: no script tag found");
  return `${html.slice(0, at)}<script src="/__studio/boot.js"></script>\n    ${html.slice(at)}`;
};
const server = createServer((req, res) => {
  // Answer this machine's browser only: a page elsewhere that points a name at 127.0.0.1 is refused.
  const port = server.address().port;
  if (req.headers.host !== `${HOST}:${port}` && req.headers.host !== `localhost:${port}`) return send(res, 403, "text/plain; charset=utf-8", "Forbidden");
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "text/plain; charset=utf-8", "Method not allowed");
  let url, path;
  try { url = new URL(req.url, `http://${HOST}`); path = decodeURIComponent(url.pathname); } catch { return send(res, 400, "text/plain; charset=utf-8", "Bad request"); }
  if (path === "/__studio/version") return send(res, 200, TYPES[".json"], JSON.stringify({ version: `${started}-${edits}`, error, note, count }));
  if (path === "/__studio/reading") return send(res, 200, TYPES[".json"], JSON.stringify(reading(url.searchParams.get("character") || "")));
  if (path === "/__studio/boot.js") return send(res, 200, TYPES[".js"], boot);
  // Every page address is the studio: the bare one is answered with the page, whatever its query, and the page's
  // file by name or a path with no file type (as the island's routes are) is sent on to it.
  if (path === "/") return send(res, 200, TYPES[".html"], req.method === "HEAD" ? "" : page());
  if (path === "/index.html" || !extname(path)) {
    res.writeHead(302, { location: `/${url.search}`, "cache-control": "no-store" });
    return res.end();
  }
  const file = normalize(join(src, path));
  if (!file.startsWith(src + sep) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, "text/plain; charset=utf-8", "Not found");
  send(res, 200, TYPES[extname(file)] || "application/octet-stream", req.method === "HEAD" ? "" : readFileSync(file));
});

const open = (url) => {
  const [command, list] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  spawn(command, list, { stdio: "ignore", detached: true }).on("error", () => console.log("Could not open a browser here: open the address above yourself.")).unref();
};
// The port asked for, else the first free one from 4173.
const first = Number(process.env.PORT) || 4173;
let tries = 0;
server.on("error", (e) => {
  if (e.code !== "EADDRINUSE" || process.env.PORT || ++tries > 20) { console.error(`The studio could not start: ${e.message}`); process.exit(1); }
  server.listen(first + tries, HOST);
});
server.on("listening", () => {
  const at = `http://${HOST}:${server.address().port}/?scene=studio&character=${handle}${slim ? "&build=slim" : ""}`;
  console.log(`\nCharacter studio for ${handle}: ${at}`);
  console.log(`Save src/characters/${handle}.js and the page reloads where it was. Ctrl+C stops it.\n`);
  if (!args.includes("--no-open")) open(at);
});
server.listen(first, HOST);
