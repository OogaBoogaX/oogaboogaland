// Lectures: illustrated talks a lecturer gives in a hall, as data. A course (`course`) lists its lectures; each
// lecture (`add`) is sections of beats, a beat being what is on the slide or added to the board while its sentences
// are said, with where the lecturer stands and how he gestures, and it names what to read before class (`reading`) and
// what it was written from (`sources`); a recording's sentence times come from its sidecar
// (`timing`, written by scripts/lecture-script.mjs), and without one each sentence takes as long as its words. `compile`
// turns a lecture into one timeline and `at(timeline, t, out)` reads it at a moment, allocation-free, so playback is a
// pure function of the lecture's time: a page's own clock today, a room's shared clock later. Every sentence knows its
// section, so whatever stops a lecture (a question, one day) stops it at a sentence's end and knows what is still to
// come. A beat may be a question (`quiz`): he asks it, the lecture waits for an answer, and he says what belongs to the
// answer chosen (lecture-player.js plays that one and passes over the others, which a recording holds one after another).
// `check` is the contract a lecture file keeps (scripts/lecture-check.mjs and the suite run it). Pure, loadable
// in Node; docs/lectures.md has the format and the pipeline.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // The slide's figure and the board share one grid: 160 across, 90 down on the board, 64 down under a slide's title.
  const GRID = { w: 160, board: 90, figure: 64 };
  const SLIDES = ["title", "section", "points", "quote", "code", "table", "figure", "number", "compare", "live"];
  const PLACES = ["lectern", "centre", "left", "right", "tablet", "screen"];
  const GESTURES = ["rest", "open", "wide", "count", "chop", "point", "shrug", "pinch", "glasses", "lean", "weigh", "up"];
  // How a sentence is said (`m` on it; plain unless named): a voice tool turns each into its own energy and pace.
  const MOODS = ["plain", "warm", "wry", "grave", "excited", "hushed", "firm"];
  const moodOf = (s, plain = "plain") => typeof s !== "string" && s.m || plain, heldOf = (s) => typeof s !== "string" && s.p || 0;
  // `land: true` on a sentence marks the line a passage was built toward: said slowly, alone in its entry, with a
  // silence before it and a longer one after, so it is heard and has time to sink in.
  const landOf = (s) => typeof s !== "string" && s.land === true;
  const COLORS = ["ink", "blue", "red", "green", "amber", "grey"];
  const LIVE = ["blocks", "mempool", "difficulty"];
  const SHAPES = ["text", "box", "line", "arrow", "circle", "ellipse", "path"];
  // Speech: words a minute, the breath between sentences and the least a sentence takes, for a lecture with no recording.
  const PACE = { wpm: 168, gap: 0.32, least: 1.1, beat: 0.55, section: 1.2, land: 0.35, settle: 0.5, slow: 1.35 };
  // A marker's speed across the grid (units a second) and how long any one stroke may take.
  const DRAW = { speed: 70, least: 0.35, most: 3.2, text: 11 };

  const courses = new Map(), lectures = new Map(), timings = new Map();
  const course = (def) => {
    if (courses.has(def.id)) throw new Error(`Lecture course ${def.id} is already registered`);
    courses.set(def.id, Object.freeze({ ...def, lectures: Object.freeze(def.lectures.map((l) => Object.freeze({ ...l }))) }));
  };
  const add = (lecture) => {
    if (lectures.has(lecture.id)) throw new Error(`Lecture ${lecture.id} is already registered`);
    lectures.set(lecture.id, lecture);
  };
  // A recording's times: where each sentence starts in it (seconds) and how long the recording runs.
  const timing = (id, starts, duration) => { timings.set(id, { starts, duration }); };
  const words = (text) => { let n = 0, inWord = false; for (let i = 0; i < text.length; i++) { const sp = text.charCodeAt(i) <= 32; if (!sp && !inWord) n++; inWord = !sp; } return n; };
  const sentenceOf = (s) => typeof s === "string" ? s : s.s;
  const shapeOf = (op) => { for (const k of SHAPES) if (op[k] !== undefined) return k; return null; };
  // How far a marker travels drawing an op, in grid units.
  const travel = (op) => {
    const k = shapeOf(op), v = op[k];
    if (k === "text") return String(v).length * 2.2;
    if (k === "box") return 2 * (v[2] + v[3]) + (op.t ? String(op.t).length * 2.2 : 0);
    if (k === "line" || k === "arrow") return Math.hypot(v[2] - v[0], v[3] - v[1]) + (k === "arrow" ? 6 : 0) + (op.t ? String(op.t).length * 2.2 : 0);
    if (k === "circle") return 6.3 * v[2] + (op.t ? String(op.t).length * 2.2 : 0);
    if (k === "ellipse") return 3.2 * (v[2] + v[3]);
    let d = 0;
    for (let i = 2; i + 1 < v.length; i += 2) d += Math.hypot(v[i] - v[i - 2], v[i + 1] - v[i - 1]);
    return d;
  };
  const drawTime = (op) => Math.min(DRAW.most, Math.max(DRAW.least, travel(op) / (shapeOf(op) === "text" ? DRAW.text * 2.2 : DRAW.speed)));

  // A lecture as one timeline: every sentence with its start and length, the beat, section and slide it belongs to and
  // how much of its slide shows; every board stroke with when it starts, how long it takes and which board it is on.
  const compile = (lecture) => {
    // A recording made of an earlier text has another count of sentences: it is passed over, and the lecture is timed
    // from its words until it is recorded again.
    const made = timings.get(lecture.id) || null, rec = made && made.starts.length === totals(lecture).spoken ? made : null;
    const sentences = [], beats = [], sections = [], slides = [], strokes = [], quizzes = [];
    let t = 0, slide = -1, epoch = -1, n = 0;
    // One sentence onto the timeline, `lead` seconds of quiet after the one before it. A recording has its own times.
    const push = (s, lead, fields) => {
      const text = sentenceOf(s), land = landOf(s);
      if (n) lead += (land ? PACE.land : 0) + (sentences[n - 1].land ? PACE.settle : 0);
      const start = rec ? rec.starts[n] : t + lead;
      const length = rec ? (n + 1 < rec.starts.length ? rec.starts[n + 1] : rec.duration) - start : Math.max(PACE.least, words(text) * 60 / PACE.wpm * (land ? PACE.slow : 1));
      sentences.push({ i: n, text, start, length, lead, land, quiz: -1, branch: -1, ...fields });
      t = start + length;
      n++;
      return start;
    };
    lecture.sections.forEach((section, si) => {
      const first = sentences.length;
      section.beats.forEach((beat) => {
        const bi = beats.length, b0 = sentences.length, quiz = beat.quiz || null;
        if (beat.slide) { slides.push({ beat: bi, section: si, slide: beat.slide }); slide = slides.length - 1; }
        // A question brings its own slide: the question and its answers, and once one is chosen, which was right.
        if (quiz) { slides.push({ beat: bi, section: si, slide: { k: "quiz", n: quizzes.length + 1, q: quiz.q, options: quiz.options, answer: quiz.answer } }); slide = slides.length - 1; }
        let show = quiz ? 0 : beat.slide ? beat.slide.start === undefined ? 99 : beat.slide.start : sentences.length ? sentences[sentences.length - 1].show : 99;
        if (beat.board && (beat.board.clear || epoch < 0)) epoch++;
        const starts = [], place = beat.at || (beat.board ? "tablet" : quiz ? "centre" : "lectern");
        beat.say.forEach((s, k) => {
          if (typeof s !== "string" && s.show !== undefined) show = s.show;
          // `p` on a sentence holds that many seconds more before it: a beat of silence ahead of a line that should land.
          const lead = !n ? 0 : PACE.gap + (k ? 0 : b0 > first ? PACE.beat : si ? PACE.section : 0) + heldOf(s);
          starts.push(push(s, lead, { beat: bi, section: si, slide, show, mood: moodOf(s), gesture: typeof s !== "string" && s.g || beat.g || "open", place, epoch: beat.board ? epoch : -1, quiz: quiz ? quizzes.length : -1 }));
        });
        // What he says to each answer follows the question, one answer after another; a player plays the one chosen
        // and passes over the rest. On those sentences `show` is the answer chosen, from 1, which the slide marks.
        if (quiz) {
          const ask = sentences[sentences.length - 1], Q = { i: quizzes.length, beat: bi, section: si, slide, ask: b0, answer: quiz.answer, options: quiz.options.length, hold: 0, gate: 0, end: 0, branches: [] };
          quiz.options.forEach((option, k) => {
            const lines = k === quiz.answer ? quiz.right : quiz.wrong[k], f = sentences.length;
            lines.forEach((s, j) => push(s, PACE.gap + (j ? 0 : PACE.beat) + heldOf(s), { beat: bi, section: si, slide, show: k + 1, mood: moodOf(s, k === quiz.answer ? "warm" : "plain"), gesture: typeof s !== "string" && s.g || (k === quiz.answer ? "up" : "open"), place, epoch: -1, quiz: Q.i, branch: k }));
            Q.branches.push({ first: f, count: lines.length, start: sentences[f].start, end: 0 });
          });
          // The lecture holds where the asking ends. In a recording that is a little short of the first reply, inside
          // the quiet before it, so a clock read only a few times a second (a hidden tab's) stops before any of it sounds.
          Q.gate = Q.branches[0].start; Q.hold = rec ? Math.max(ask.start, Q.gate - 0.35) : Math.min(Q.gate, ask.start + ask.length);
          quizzes.push(Q);
        }
        // A beat's strokes queue behind one another from the sentence each names.
        if (beat.board) {
          let free = 0;
          for (const op of beat.board.ops) {
            const from = Math.max(starts[Math.min(op.at || 0, starts.length - 1)], free), dur = drawTime(op);
            strokes.push({ op, start: from, length: dur, epoch, title: beat.board.title || "" });
            free = from + dur + 0.12;
          }
        }
        beats.push({ i: bi, section: si, first: b0, count: sentences.length - b0, slide, epoch: beat.board ? epoch : -1, start: starts[0] });
      });
      sections.push({ i: si, id: section.id, title: section.title, topics: section.topics || [], first, count: sentences.length - first, start: sentences[first].start });
    });
    const last = sentences[sentences.length - 1], duration = rec ? rec.duration : last.start + last.length + 1.5;
    // Where each answer's reply ends (its last word, or the next sentence in a recording) and where the lecture goes on.
    for (const Q of quizzes) {
      const B = Q.branches, after = B[B.length - 1].first + B[B.length - 1].count;
      Q.end = after < sentences.length ? sentences[after].start : duration;
      B.forEach((b, k) => { const z = sentences[b.first + b.count - 1]; b.end = Math.min((k + 1 < B.length ? B[k + 1].start : Q.end) - (rec ? 0.3 : 0), z.start + z.length + 0.35); });
    }
    // Each board's first stroke, and each slide's title for the outline.
    const epochs = [];
    strokes.forEach((s, i) => { if (!epochs[s.epoch]) epochs[s.epoch] = { first: i, count: 0, title: s.title }; epochs[s.epoch].count++; if (s.title) epochs[s.epoch].title = s.title; });
    return { id: lecture.id, lecture, recorded: !!rec, duration, sentences, beats, sections, slides, strokes, epochs, quizzes };
  };
  // The sentence being said at `t` (the last one that has started), by bisection.
  const sentenceAt = (timeline, t) => {
    const S = timeline.sentences;
    let lo = 0, hi = S.length - 1;
    while (lo < hi) { const mid = lo + hi + 1 >> 1; if (S[mid].start <= t) lo = mid; else hi = mid - 1; }
    return lo;
  };
  // The lecture at `t`, written into `out`: the sentence, whether its words are still being said, its beat, section
  // and slide with how much shows, and the board in view with how many of its strokes have begun.
  const at = (timeline, t, out) => {
    const i = sentenceAt(timeline, t), s = timeline.sentences[i];
    out.sentence = i; out.speaking = t >= s.start && t < s.start + s.length; out.into = t - s.start;
    out.beat = s.beat; out.section = s.section; out.slide = s.slide; out.show = s.show; out.gesture = s.gesture; out.place = s.place;
    out.quiz = s.quiz; out.branch = s.branch;
    // The board shown is the latest whose first stroke has begun.
    let epoch = -1, begun = 0, drawing = false;
    const K = timeline.strokes, E = timeline.epochs;
    for (let e = E.length - 1; e >= 0; e--) if (E[e] && K[E[e].first].start <= t) { epoch = e; break; }
    if (epoch >= 0) {
      const first = E[epoch].first, end = first + E[epoch].count;
      for (let k = first; k < end && K[k].start <= t; k++) { begun++; if (t < K[k].start + K[k].length) drawing = true; }
    }
    out.epoch = epoch; out.begun = begun; out.drawing = drawing;
    return out;
  };
  const state = () => ({ sentence: 0, speaking: false, into: 0, beat: 0, section: 0, slide: -1, show: 99, gesture: "open", place: "lectern", epoch: -1, begun: 0, drawing: false, quiz: -1, branch: -1 });

  // ---------- the contract ----------
  const inGrid = (x, y, h) => x >= 0 && x <= GRID.w && y >= 0 && y <= h;
  const checkOps = (ops, h, where, says, out) => {
    if (!Array.isArray(ops) || !ops.length) { out.push(`${where}: no ops`); return; }
    ops.forEach((op, k) => {
      const kind = shapeOf(op), v = op[kind], w = `${where} op ${k}`;
      if (!kind) { out.push(`${w}: no shape (${SHAPES.join(", ")})`); return; }
      for (const key of Object.keys(op)) if (![kind, "t", "x", "y", "c", "a", "at", "size", "fill", "w", "dash", "mono"].includes(key)) out.push(`${w}: unknown key ${key}`);
      if (op.c !== undefined && !COLORS.includes(op.c)) out.push(`${w}: colour ${op.c}`);
      if (op.at !== undefined && (!Number.isInteger(op.at) || op.at < 0 || op.at >= says)) out.push(`${w}: at ${op.at} is not one of its beat's ${says} sentences`);
      if (kind === "text") {
        if (typeof v !== "string" || !v || !inGrid(op.x, op.y, h)) { out.push(`${w}: text needs words and an x, y on the grid`); return; }
        // A letter is about 0.55 of its size across; the words must stay on the grid whichever way they are anchored.
        const wide = v.length * 0.55 * (op.size || 5), left = op.a === "c" ? op.x - wide / 2 : op.a === "r" ? op.x - wide : op.x;
        if (left < -1 || left + wide > GRID.w + 1) out.push(`${w}: "${v}" runs off the grid (${Math.round(left)} to ${Math.round(left + wide)})`);
        return;
      }
      if (!Array.isArray(v) || v.some((q) => typeof q !== "number" || !Number.isFinite(q))) { out.push(`${w}: ${kind} needs numbers`); return; }
      const need = kind === "box" || kind === "line" || kind === "arrow" || kind === "ellipse" ? 4 : kind === "circle" ? 3 : 0;
      if (need && v.length !== need || kind === "path" && (v.length < 4 || v.length % 2)) { out.push(`${w}: ${kind} takes ${need || "pairs of"} numbers`); return; }
      const ok = kind === "box" ? inGrid(v[0], v[1], h) && inGrid(v[0] + v[2], v[1] + v[3], h)
        : kind === "circle" ? inGrid(v[0] - v[2], v[1] - v[2], h) && inGrid(v[0] + v[2], v[1] + v[2], h)
        : kind === "ellipse" ? inGrid(v[0] - v[2], v[1] - v[3], h) && inGrid(v[0] + v[2], v[1] + v[3], h)
        : v.every((q, j) => j % 2 ? q >= 0 && q <= h : q >= 0 && q <= GRID.w);
      if (!ok) out.push(`${w}: off the ${GRID.w} by ${h} grid`);
      if (kind === "box" && op.t && String(op.t).length * 0.55 * Math.min(op.size || 5, v[3] * 0.62) > v[2] + 0.5) out.push(`${w}: the label "${op.t}" is wider than its box`);
      if (kind === "circle" && op.t && String(op.t).length * 0.55 * Math.min(op.size || 5, v[2] * 0.8) > 2 * v[2] + 0.5) out.push(`${w}: the label "${op.t}" is wider than its circle`);
    });
  };
  const LIMITS = { sentence: 230, land: 12, title: 46, point: 74, points: 6, lines: 12, line: 62, rows: 7, cell: 34, words: [2800, 4300], slides: [20, 40], boards: [3, 12], sections: [4, 9],
    // A question: its own length and its answers', how many answers, how many a lecture asks, and how many sentences he
    // says to a right answer and to each wrong one.
    question: 120, option: 58, options: [3, 4], quizzes: [3, 6], right: [1, 2], wrong: [1, 3] };
  const text = (v, max, where, out) => { if (typeof v !== "string" || !v.trim()) out.push(`${where}: missing`); else if (v.length > max) out.push(`${where}: ${v.length} characters, over ${max}`); };
  const checkSlide = (slide, where, says, out) => {
    if (!SLIDES.includes(slide.k)) { out.push(`${where}: slide kind ${slide.k}`); return; }
    const k = slide.k;
    if (k !== "quote" && k !== "number") text(slide.title, LIMITS.title, `${where} title`, out);
    if (k === "points") {
      if (!Array.isArray(slide.points) || !slide.points.length || slide.points.length > LIMITS.points) out.push(`${where}: 1 to ${LIMITS.points} points`);
      else slide.points.forEach((p, i) => text(p, LIMITS.point, `${where} point ${i + 1}`, out));
    }
    if (k === "compare") for (const side of ["left", "right"]) {
      const c = slide[side];
      if (!c || !Array.isArray(c.points) || !c.points.length || c.points.length > 5) out.push(`${where}: ${side} needs a head and 1 to 5 points`);
      else { text(c.head, 28, `${where} ${side} head`, out); c.points.forEach((p, i) => text(p, 40, `${where} ${side} point ${i + 1}`, out)); }
    }
    if (k === "quote") { text(slide.text, 240, `${where} quote`, out); text(slide.by, 60, `${where} by`, out); }
    if (k === "number") { text(slide.value, 16, `${where} value`, out); text(slide.label, 70, `${where} label`, out); }
    if (k === "code") {
      if (!Array.isArray(slide.lines) || !slide.lines.length || slide.lines.length > LIMITS.lines) out.push(`${where}: 1 to ${LIMITS.lines} lines`);
      else slide.lines.forEach((l, i) => { if (typeof l !== "string" || l.length > LIMITS.line) out.push(`${where} line ${i + 1}: over ${LIMITS.line} characters`); });
    }
    if (k === "table") {
      if (!Array.isArray(slide.head) || slide.head.length < 2 || slide.head.length > 4 || !Array.isArray(slide.rows) || !slide.rows.length || slide.rows.length > LIMITS.rows) out.push(`${where}: a head of 2 to 4 and 1 to ${LIMITS.rows} rows`);
      else slide.rows.forEach((r, i) => {
        if (!Array.isArray(r) || r.length !== slide.head.length) out.push(`${where} row ${i + 1}: ${slide.head.length} cells`);
        else r.forEach((cell) => { const most = slide.head.length === 2 ? LIMITS.cell : slide.head.length === 3 ? 24 : 18; if (String(cell).length > most) out.push(`${where} row ${i + 1}: "${cell}" is over ${most} characters, the most a column of ${slide.head.length} holds`); });
      });
    }
    // A figure's note is written across its foot, so a figure with one keeps its shapes above it.
    if (k === "figure") checkOps(slide.ops, slide.note ? GRID.figure - 7 : GRID.figure, where, says, out);
    if (k === "live" && !LIVE.includes(slide.panel)) out.push(`${where}: live panel ${slide.panel}`);
    if (slide.note !== undefined) text(slide.note, 96, `${where} note`, out);
  };
  // Everything wrong with a lecture, as lines; none means it keeps the contract.
  const check = (lecture) => {
    const out = [];
    if (!lecture || typeof lecture.id !== "string") return ["no id"];
    if (!Array.isArray(lecture.sections)) return [`${lecture.id}: no sections`];
    const ids = new Set();
    // What to read before class (one to three works) and what the lecture was written from (at least two sources).
    if (!Array.isArray(lecture.reading) || !lecture.reading.length || lecture.reading.length > 3) out.push(`${lecture.id}: name one to three things to read before class`);
    else lecture.reading.forEach((r, i) => { text(r && r.title, 64, `${lecture.id} reading ${i + 1} title`, out); if (r && r.by !== undefined) text(r.by, 48, `${lecture.id} reading ${i + 1} by`, out); });
    if (!Array.isArray(lecture.sources) || lecture.sources.length < 2 || lecture.sources.some((x) => typeof x !== "string" || !x.trim())) out.push(`${lecture.id}: name at least two sources it was written from`);
    let total = 0, slides = 0, boards = 0, quizzes = 0, first = true, afterQuiz = false;
    // An entry is one caption, said in one breath, and where a lecture may stop for a question: a sentence, or up
    // to three short ones that belong together ("Twenty-five years. That is how long it took.").
    const sentence = (s, w) => {
      const t = sentenceOf(s);
      text(t, LIMITS.sentence, w, out);
      if (typeof t === "string" && (t.replace(/\b(?:[A-Z]\.){2,}|\b(?:Mr|Ms|Dr|vs|St|No)\./g, "").match(/[.!?]["\u201d]?\s+[A-Z]/g) || []).length > 2) out.push(`${w}: more than three sentences ("${t.slice(0, 40)}…")`);
      if (typeof s !== "string" && s.g !== undefined && !GESTURES.includes(s.g)) out.push(`${w}: gesture ${s.g}`);
      if (typeof s !== "string" && s.m !== undefined && !MOODS.includes(s.m)) out.push(`${w}: mood ${s.m}`);
      if (typeof s !== "string" && s.p !== undefined && !(s.p > 0 && s.p <= 3)) out.push(`${w}: a held pause is over 0 and up to 3 seconds`);
      if (typeof s !== "string" && s.land !== undefined && (s.land !== true || typeof t !== "string" || words(t) > LIMITS.land || /[.!?]["\u201d]?\s+[A-Z]/.test(t))) out.push(`${w}: a line that lands is one sentence of at most ${LIMITS.land} words, marked land: true`);
      return typeof t === "string" ? words(t) : 0;
    };
    const lines = (list, [lo, hi], w) => {
      if (!Array.isArray(list) || list.length < lo || list.length > hi) { out.push(`${w}: ${lo} to ${hi} sentences`); return; }
      list.forEach((s, k) => sentence(s, `${w} sentence ${k + 1}`));
    };
    const checkQuiz = (quiz, beat, w) => {
      if (beat.slide || beat.board) out.push(`${w}: a question has its own slide, and takes neither a slide nor the board`);
      text(quiz.q, LIMITS.question, `${w} question`, out);
      const O = quiz.options, [lo, hi] = LIMITS.options;
      if (!Array.isArray(O) || O.length < lo || O.length > hi) { out.push(`${w}: ${lo} to ${hi} answers to choose from`); return; }
      O.forEach((o, k) => text(o, LIMITS.option, `${w} answer ${k + 1}`, out));
      if (new Set(O).size !== O.length) out.push(`${w}: two answers are the same`);
      if (!Number.isInteger(quiz.answer) || quiz.answer < 0 || quiz.answer >= O.length) { out.push(`${w}: \`answer\` is the right answer's place, from 0`); return; }
      lines(quiz.right, LIMITS.right, `${w} right`);
      if (!Array.isArray(quiz.wrong) || quiz.wrong.length !== O.length) { out.push(`${w}: \`wrong\` has an entry for every answer (null at the right one)`); return; }
      O.forEach((o, k) => { if (k === quiz.answer) { if (quiz.wrong[k]) out.push(`${w}: the right answer has no \`wrong\` reply`); } else lines(quiz.wrong[k], LIMITS.wrong, `${w} wrong ${k + 1}`); });
    };
    lecture.sections.forEach((section, si) => {
      const sw = `${lecture.id} section ${si + 1}`;
      text(section.title, LIMITS.title, `${sw} title`, out);
      if (typeof section.id !== "string" || ids.has(section.id)) out.push(`${sw}: needs an id of its own`);
      ids.add(section.id);
      if (!Array.isArray(section.topics) || section.topics.length < 2) out.push(`${sw}: name at least two topics, for questions asked ahead of them`);
      if (!Array.isArray(section.beats) || !section.beats.length) { out.push(`${sw}: no beats`); return; }
      section.beats.forEach((beat, bi) => {
        const w = `${sw} beat ${bi + 1}`;
        for (const key of Object.keys(beat)) if (!["slide", "board", "say", "at", "g", "quiz"].includes(key)) out.push(`${w}: unknown key ${key}`);
        if (!Array.isArray(beat.say) || !beat.say.length) { out.push(`${w}: nothing said`); return; }
        if (first && !beat.slide) out.push(`${w}: the lecture opens on a slide`);
        first = false;
        // A question's slide gives way to the next beat's own.
        if (afterQuiz && !beat.slide && !beat.quiz) out.push(`${w}: the beat after a question needs a slide of its own`);
        afterQuiz = !!beat.quiz;
        if (beat.quiz) { quizzes++; if (typeof beat.quiz !== "object") out.push(`${w}: quiz`); else checkQuiz(beat.quiz, beat, `${w} quiz`); }
        if (beat.at !== undefined && !PLACES.includes(beat.at)) out.push(`${w}: place ${beat.at}`);
        if (beat.g !== undefined && !GESTURES.includes(beat.g)) out.push(`${w}: gesture ${beat.g}`);
        beat.say.forEach((s, k) => {
          total += sentence(s, `${w} sentence ${k + 1}`);
          if (typeof s !== "string" && s.show !== undefined && !(beat.slide || bi)) out.push(`${w} sentence ${k + 1}: show with no slide`);
        });
        if (beat.slide) { slides++; checkSlide(beat.slide, `${w} slide`, beat.say.length, out); }
        if (beat.board) {
          if (beat.board.clear) boards++;
          else if (!boards) { boards++; }
          checkOps(beat.board.ops, GRID.board, `${w} board`, beat.say.length, out);
        }
      });
    });
    const range = (n, [lo, hi], what) => { if (n < lo || n > hi) out.push(`${lecture.id}: ${n} ${what}, wanted ${lo} to ${hi}`); };
    range(lecture.sections.length, LIMITS.sections, "sections");
    range(total, LIMITS.words, "words");
    range(slides, LIMITS.slides, "slides");
    range(boards, LIMITS.boards, "board panels");
    range(quizzes, LIMITS.quizzes, "questions");
    return out;
  };
  // A lecture's sizes. `sentences` and `words` are the lecture as everyone hears it; `replies` the sentences said to
  // answers (each student hears one answer's), and `spoken` every sentence a recording holds.
  const totals = (lecture) => {
    let total = 0, slides = 0, boards = 0, sentences = 0, quizzes = 0, replies = 0;
    for (const section of lecture.sections) for (const beat of section.beats) {
      if (beat.slide) slides++;
      if (beat.board && (beat.board.clear || !boards)) boards++;
      for (const s of beat.say) { total += words(sentenceOf(s)); sentences++; }
      if (beat.quiz) { quizzes++; replies += beat.quiz.right.length; for (const w of beat.quiz.wrong) if (w) replies += w.length; }
    }
    return { words: total, slides, boards, sentences, sections: lecture.sections.length, quizzes, replies, spoken: sentences + replies };
  };

  BL.lectures = {
    GRID, SLIDES, PLACES, GESTURES, MOODS, COLORS, LIVE, PACE, LIMITS,
    course, add, timing, compile, at, state, sentenceAt, check, totals, shapeOf, travel, words,
    get: (id) => lectures.get(id) || null, courseOf: (id) => courses.get(id) || null, courses: () => [...courses.values()], timed: (id) => timings.has(id)
  };
})();
