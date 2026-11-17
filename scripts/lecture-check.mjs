// Reads lecture files against their contract (src/js/lecture-kit.js `check`): `npm run lecture:check -- btc-01 ...`
// takes lecture ids, and with none reads every lecture file there is. For each it prints its totals (words, slides,
// board panels, how long it runs) and every line `check` has against it, and exits 1 if any lecture has one.
// `load(ids)` is the same reading for another script (the voice pipeline).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const js = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "js");

// The kit, every course and the lecture files asked for, run in one sandbox as the page runs them.
export const load = (ids = null) => {
  const context = { window: {} };
  vm.createContext(context);
  const run = (file) => vm.runInContext(readFileSync(join(js, file), "utf8"), context, { filename: file });
  run("lecture-kit.js");
  const files = readdirSync(js).filter((f) => /^lecture-[a-z]+(-\d\d)?(\.timing)?\.js$/.test(f)).sort();
  // A course's catalogue is the file that registers one; the kit's own files (lecture-slides.js …) are not run again.
  for (const f of files.filter((f) => /^lecture-[a-z]+\.js$/.test(f) && readFileSync(join(js, f), "utf8").includes(".lectures.course("))) run(f);
  const L = context.window.BL.lectures, missing = [];
  const wanted = ids && ids.length ? ids : files.filter((f) => /-\d\d\.js$/.test(f)).map((f) => f.slice(8, -3));
  for (const id of wanted) {
    const file = `lecture-${id}.js`;
    if (!existsSync(join(js, file))) { missing.push(id); continue; }
    run(file);
    if (existsSync(join(js, `lecture-${id}.timing.js`))) run(`lecture-${id}.timing.js`);
  }
  return { L, ids: wanted.filter((id) => !missing.includes(id)), missing };
};

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { L, ids, missing } = load(process.argv.slice(2));
  let bad = missing.length;
  for (const id of missing) console.log(`${id}: no such file, src/js/lecture-${id}.js`);
  for (const id of ids) {
    const lecture = L.get(id);
    if (!lecture) { console.log(`${id}: the file registers no lecture of that id`); bad++; continue; }
    const problems = L.check(lecture);
    const t = L.totals(lecture), line = `${id} · ${lecture.title} · ${t.sections} sections, ${t.slides} slides, ${t.boards} board panels, ${t.quizzes} questions, ${t.sentences} sentences, ${t.words} words`;
    if (problems.length) { console.log(`${line}\n  ${problems.join("\n  ")}`); bad++; continue; }
    const timeline = L.compile(lecture);
    // As a student hears it, answering right: the recording less what he says to the answers not chosen.
    let heard = timeline.duration;
    for (const Q of timeline.quizzes) { const b = Q.branches[Q.answer]; heard -= Q.end - Q.gate - (b.end - b.start); }
    console.log(`${line}, ${clock(heard)}${timeline.recorded ? " recorded" : " estimated"}${t.replies ? ` (${clock(timeline.duration)} with all ${t.replies} replies)` : ""}`);
  }
  if (!ids.length && !missing.length) console.log("No lecture files yet.");
  process.exit(bad ? 1 : 0);
}
