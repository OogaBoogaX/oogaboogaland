// Writes Tess's fact sheet for the Worker (#270): what the island already says about itself, as the text her answers
// draw on, so it can't drift from the game.
//
//   node scripts/tess-facts.mjs    the sheet as JSON on stdout; build:site writes it to worker/src/tess-facts.gen.json
//
// It comes from the repository's own data: the tour's places and lines and the dated news (src/js/hub-guide.js), the
// site's pages (src/js/routes.js) and the README's player sections. `places` are the ids she may fly a visitor to, and
// `titles` their names.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const README_SECTIONS = ["The island", "Playing together", "Timechain Sphere", "Games", "Weather", "DSB Land"];
// The page's own answers, said as they are.
const ANSWERS = [["How to donate", ["donate", "donateKiosk"]], ["Controls", ["controls", "controlsMore", "controlsPhone"]],
  ["Signing in", ["signIn", "signInPerks"]]];

// The guide and the routes as the page builds them, under a minimal window shim.
const readGuide = () => {
  const context = { window: { BL: { fx: { beatsOf: (text) => [text] } } }, URLSearchParams, location: { search: "" } };
  for (const name of ["routes", "hub-guide"]) runInNewContext(readFileSync(join(root, "src", "js", `${name}.js`), "utf8"), context);
  return context.window.BL;
};

// A README section as plain text: no emphasis, code marks or link targets.
const readme = (title) => {
  const text = readFileSync(join(root, "README.md"), "utf8").replace(/\r\n/g, "\n");
  const start = text.indexOf(`\n## ${title}\n`);
  if (start < 0) throw new Error(`README has no section "${title}"`);
  const end = text.indexOf("\n## ", start + 1);
  return text.slice(start + 1, end < 0 ? undefined : end).trim()
    .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
};

export const tessFacts = () => {
  const { hubGuide: guide, routes } = readGuide(), say = (ids) => ids.map((id) => guide.LINES[id]).join(" ");
  const text = [
    "# Places you can fly a visitor to (the ids for go)",
    ...guide.STOPS.map((stop) => `- ${stop.id} (${stop.title}): ${say(stop.lines)}`),
    "",
    "# What's new on the island, newest first",
    ...guide.NEWS.map((n) => `- ${n.date}: ${guide.LINES[n.line]}`),
    "",
    "# The site's pages",
    ...routes.list.filter((r) => !/^sphere-\d$/.test(r.path)).map((r) => `- ${r.path ? `${r.title} (/${r.path})` : "Home (/)"}: ${r.description}`),
    "",
    "# What the page itself answers",
    ...ANSWERS.map(([title, ids]) => `- ${title}: ${say(ids)}`),
    "",
    "# From the README",
    ...README_SECTIONS.map((title) => `#${readme(title)}\n`)
  ].join("\n").trim();
  return { places: guide.STOPS.map((stop) => stop.id), titles: Object.fromEntries(guide.STOPS.map((stop) => [stop.id, stop.title])), text };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(tessFacts(), null, 1));
