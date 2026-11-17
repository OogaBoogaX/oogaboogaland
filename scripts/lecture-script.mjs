// A lecture's script out to a voice tool, and its recording back in.
//   npm run lecture:script -- btc-01 [file.json]      writes the lecture as { id, title, by, sentences: [{ text, pause }] }
//                                                     (to the file, or printed): one entry a sentence, `pause` the
//                                                     seconds of silence before it (a breath, a new slide, a new section);
//                                                     after a question come his replies to each of its answers in turn
//   npm run lecture:script -- --import <folder>       takes a recording back from the folder a voice tool wrote:
//                                                     <id>.m4a to src/media/lectures/ and timing.json (where each
//                                                     sentence starts) to src/js/lecture-<id>.timing.js
// The voice tool is its own project (lecture-voice); this file is all of it that the game knows.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "./lecture-check.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (message) => { console.error(message); process.exit(1); };
const args = process.argv.slice(2);

const timelineOf = (id) => {
  const { L, missing } = load([id]);
  if (missing.length) fail(`${id}: no such file, src/js/lecture-${id}.js`);
  const lecture = L.get(id);
  if (!lecture) fail(`${id}: the file registers no lecture of that id`);
  const problems = L.check(lecture);
  if (problems.length) fail(`${id} does not pass its check:\n  ${problems.join("\n  ")}`);
  return { L, lecture };
};

if (args[0] === "--import") {
  const folder = resolve(args[1] || fail("Which folder? npm run lecture:script -- --import <folder>"));
  const file = join(folder, "timing.json");
  if (!existsSync(file)) fail(`${folder} has no timing.json`);
  const rec = JSON.parse(readFileSync(file, "utf8")), id = rec.id;
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(id)) fail(`${file} names no lecture`);
  const { L, lecture } = timelineOf(id);
  const count = L.totals(lecture).spoken;
  if (!rec.complete) fail(`${file} is a recording of part of ${id}; render the whole script before bringing it in`);
  if (!Array.isArray(rec.starts) || rec.starts.length !== count) fail(`${file} has ${rec.starts && rec.starts.length} sentences and ${id} has ${count}: the lecture changed since it was recorded`);
  if (rec.starts.some((t, i) => typeof t !== "number" || !(t >= 0) || i && t <= rec.starts[i - 1]) || !(rec.duration > rec.starts[count - 1])) fail(`${file}'s times are not in order`);
  const audio = join(folder, `${id}.m4a`);
  if (!existsSync(audio)) fail(`${folder} has no ${id}.m4a`);
  mkdirSync(join(root, "src", "media", "lectures"), { recursive: true });
  copyFileSync(audio, join(root, "src", "media", "lectures", `${id}.m4a`));
  writeFileSync(join(root, "src", "js", `lecture-${id}.timing.js`), `// Where each sentence of ${id} starts in its recording, in seconds, and how long the recording is. Written by\n// scripts/lecture-script.mjs --import; a lecture changed since then needs recording again.\nwindow.BL.lectures.timing(${JSON.stringify(id)}, ${JSON.stringify(rec.starts)}, ${rec.duration});\n`);
  // The timing file loads with its lecture: its tag goes after the lecture's own, in the same deferred group.
  const page = join(root, "src", "index.html"), html = readFileSync(page, "utf8");
  if (!html.includes(`js/lecture-${id}.timing.js`)) {
    const tag = html.match(new RegExp(`^(\\s*)<script src="js/lecture-${id}\\.js" data-defer="([a-z-]+)"></script>\\n`, "m"));
    if (!tag) fail(`src/index.html has no <script> tag for js/lecture-${id}.js to put the timing file's after`);
    writeFileSync(page, html.replace(tag[0], `${tag[0]}${tag[1]}<script src="js/lecture-${id}.timing.js" data-defer="${tag[2]}"></script>\n`));
  }
  console.log(`${id}: src/media/lectures/${id}.m4a and src/js/lecture-${id}.timing.js (${count} sentences, ${Math.floor(rec.duration / 60)}:${String(Math.round(rec.duration % 60)).padStart(2, "0")})`);
} else {
  const id = args[0] || fail("Which lecture? npm run lecture:script -- btc-01 [file.json]");
  // Every sentence a recording holds, in the timeline's order: the lecture, and after each question what he says to
  // each of its answers, one answer after another. `pause` is the quiet before a sentence.
  const { L, lecture } = timelineOf(id), course = L.courseOf(lecture.course);
  const sentences = L.compile(lecture).sentences.map((s) => ({ text: s.text, pause: Math.round(s.lead * 100) / 100 }));
  const out = JSON.stringify({ id, title: lecture.title, by: course ? course.by : "", sentences }, null, 1) + "\n";
  if (args[1]) { writeFileSync(resolve(args[1]), out); console.log(`${id}: ${sentences.length} sentences to ${resolve(args[1])}`); }
  else process.stdout.write(out);
}
