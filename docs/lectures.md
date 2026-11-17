# Lectures

The Lecture Hall (Timechain Sphere, room 1) gives lecture courses. A course is data: a catalogue, one file a lecture, and a lecturer profile. The hall, the screens, the player and the lecturer's rig are shared, so a new course, or a new lecturer, adds files and no engine code.

The first course is Bitcoin from First Principles: fourteen lectures in four parts (the problem and the tools, the ledger, the network and its users, change and scale). Each lecture stands on its own, is written for the hall from primary sources, and names what to read before class.

## The parts

| File | What it is |
|---|---|
| `src/js/lecture-kit.js` | the format and its contract: `course`, `add`, `timing`, `compile` (a lecture as one timeline), `at` (the lecture at a moment, allocation-free), `check` (every rule a lecture file keeps). Pure, loadable in Node |
| `src/js/lecture-slides.js` | the painters: the slide (ten kinds), the board (marker strokes drawn as far as their moment has got), the outline, the caption, the screens between lectures and the programme |
| `src/js/lecture-player.js` | one lecture's clock for this page: the recording's when there is one, else the frame clock with a sentence as long as its words; pause, seek, sections; where each lecture was left (localStorage `ooga-lectures`) |
| `src/js/lecturer.js` | the lecturer: an Ooga built from a profile (`PROFILES`) and moved by the lecture's state: where he stands and how he walks there (round the lectern, pacing on a long stretch), his gesture and his hands' shapes (open, a fist, a pointing finger; a plain sentence takes one of a dozen ways of talking in turn), his hands on the lectern, his drawing finger on the tablet |
| `src/js/lecture-<course>.js` | a course's catalogue (`lecture-btc.js`): its parts, its lectures and its lecturer |
| `src/js/lecture-<course>-<nn>.js` | one lecture's content, a deferred group of its own, fetched when it is chosen |
| `src/js/timechain-room-lecture.js` | the hall, and what joins the parts above |
| `scripts/lecture-check.mjs` | `npm run lecture:check -- <id> …` reads lecture files against the contract and prints their totals |
| `scripts/lecture-script.mjs` | `npm run lecture:script -- <id> [file]` writes a lecture's script for a voice tool; `-- --import <folder>` takes its recording and timings back (Recording, below) |

## A lecture file

```js
window.BL.lectures.add({
  id: "btc-01", course: "first-principles", n: 1, title: "The Problem of Digital Cash",
  reading: [{ title: "Bitcoin: A Peer-to-Peer Electronic Cash System", by: "Satoshi Nakamoto, 2008" }],
  sources: ["https://bitcoin.org/bitcoin.pdf", "…"],
  sections: [
    { id: "kebab-id", title: "Section title", topics: ["keyword", "keyword"],
      beats: [
        { slide: { k: "title", title: "…", sub: "…" }, say: ["One sentence.", "Another."], at: "lectern", g: "open" },
        { board: { clear: true, title: "Panel title", ops: [{ box: [10, 20, 30, 12], t: "tx" }, { arrow: [40, 26, 60, 26], at: 1 }] },
          say: ["He draws the box as he says this.", { s: "And the arrow on this one.", g: "point" }] }
      ] }
  ]
});
```

- A **beat** is what is on the slide, or added to the board, while its sentences are said. A beat with no `slide` keeps the one before it.
- **One sentence an entry.** A sentence is the caption, and the place a lecture can stop (for a question, later).
- **Slides** (`k`): `title`, `section`, `points`, `compare`, `quote`, `number`, `code`, `table`, `figure`, `live` (`blocks`, `mempool` or `difficulty`, drawn from the chain while the hall is open). `points`, `code`, `table` and `compare` reveal with `start` on the slide and `show: n` on a sentence.
- **Shapes** (a figure's and the board's, on a grid 160 wide; 64 tall under a slide's title, 90 on the board): `text`, `box`, `circle`, `ellipse`, `line`, `arrow`, `path`, with `c` (ink, blue, red, green, amber, grey), `at` (the sentence of its beat it appears or starts being drawn at), `fill`, `dash`.
- **`at`** on a beat is where he stands (`lectern`, `centre`, `left`, `right`, `tablet`, `screen`); **`g`** on a beat or a sentence is his gesture (`rest`, `open`, `wide`, `count`, `chop`, `point`, `shrug`, `pinch`, `glasses`, `lean`, `weigh`, `up`).
- **A question** is a beat with `quiz` and no slide or board of its own: `say` is how he asks it (end on the question itself, so it is heard as well as shown), and `quiz` is `{ q, options: [three or four], answer: <the right one's place, from 0>, right: [one or two sentences], wrong: [for each answer, one to three sentences, null at the right one] }`. The lecture waits there until the student chooses; he then says `right`, or that answer's `wrong`, which says briefly why it is wrong and what the right answer is, and goes on. A lecture asks three to six, each after the idea it tests, and the beat after one brings its own slide.
- **`topics`** on a section are what it answers. They are there for questions asked ahead of their section.
- **`reading`** is one to three things to read before class (shown on the outline); **`sources`** is what the lecture was written from, at least two.

`check` enforces the limits (`LIMITS` in the kit): sentence, title and point lengths, 20 to 40 slides, 3 to 12 board panels, 4 to 9 sections, 3 to 6 questions, 2,800 to 4,300 words (replies to answers are counted apart), shapes and their words on the grid, labels inside their boxes.

## Making a lecture

1. Outline the lecture yourself, as a lecturer would build the story. Write it from primary and varied sources, in your own words and with your own examples; a textbook is something to recommend in `reading`, never a template to follow. Check every name, date and figure against a source and list the sources.
2. Budget before writing: about 30 slides (a section slide each), 4 to 6 board panels, 5 or 6 sentences a beat of about 14 words.
3. Write `src/js/lecture-<course>-<nn>.js`, add its `<script … data-defer="lecture-<course>-<letter>">` tag after `timechain-interior.js` in `src/index.html`, and its group in `deferred.js`'s `PRESENT`.
4. `npm run lecture:check -- <id>` until it prints one line and no problems.
5. Watch it in the hall: `?debug=1&nosim=1#/sphere-1`, then `__ooga.timechain.motion.start(n - 1)`; `.player.seek(seconds)` jumps.
6. Record it (below). Until it has a recording a lecture plays with captions, and the browser's own speech where the page allows it (`lecturevoice=0` turns that off; a test page never speaks).

## Making a course, or a lecturer

- A course is `BL.lectures.course({ id, short, title, subtitle, lecturer, by, parts, lectures })` in its own `lecture-<course>.js`. The hall plays the course its `COURSE` names.
- A lecturer is an entry in `lecturer.js`'s `PROFILES`: a name, skin, hair and hairline, height, clothes, glasses, pace and energy. The first course is given by Professor Pumponopoulos (`pumponopoulos`); a course names its lecturer's profile in `lecturer` and how the screens name him in `by`. To look at a lecturer up close, open the hall with `?debug=1&lecturer=view`: he opens in the model viewer, to turn and zoom.

## Recording

A lecture is recorded outside this repository, by a voice tool of its own (the `lecture-voice` project: an open-source text-to-speech model run locally). A recording committed here is in the model's own voice, or in a voice made from a recording its speaker made for this purpose and agreed to; never in a voice taken from someone's talks, broadcasts or other recordings. This repository only hands the script over and takes the recording back:

1. `npm run lecture:script -- <id> <file.json>` writes the lecture as `{ id, title, by, sentences: [{ text, pause }] }`: one entry a sentence, `pause` the seconds of silence before it (a breath, more at a new slide, more again at a new section). After each question come his replies to every one of its answers, one answer after another: the recording holds them all, and the player plays the one that belongs to the answer chosen.
2. The voice tool renders it to `<id>.m4a` (mono AAC, about half a megabyte a minute) and a `timing.json` with where each sentence starts.
3. `npm run lecture:script -- --import <folder>` copies the recording to `src/media/lectures/<id>.m4a` and writes `src/js/lecture-<id>.timing.js`, a `BL.lectures.timing(id, starts, duration)` call. It refuses a recording whose sentence count is not the lecture's: a lecture changed since it was recorded is recorded again.

It also adds the timing file's `<script>` tag to `src/index.html`, after the lecture's own and in its deferred group.

The player then follows the recording's clock, and slides, strokes and gestures land on the words. `scripts/site.mjs` stages a lecture's recording under `media/lectures/` once it has its timing file, so a recording is heard on the staged site (`npm run serve`) and the deployed one; opened from the source tree or as the portable single-file page a lecture plays with captions.

## Later, and what is already there for it

- **A shared lecture.** Playback is a function of one time (`player.seek`, `player.time`), so a room's clock can drive every page's player. Nothing is sent today.
- **A shared lecture's questions.** Today each page waits for its own student. A room would wait for everyone, or for a count of answers, and then play one reply to all.
- **Questions from the hall.** Every sentence knows its section, `player.sentenceEnd()` is where to stop, and each section's `topics` say what is still to come, so an answerer can take a question now or say it is coming. The raised hand is already in the room's protocol.

## Sources and reading

A lecture is this project's own writing and is under the repository's licence. It credits what it was written from in its `sources`, quotes only short lines, exactly and with their author, and recommends reading in `reading`. Recommending a book is not adapting it: a lecture that follows a book's chapters, wording or worked examples is an adaptation and takes on that book's licence, so do not write one that way.
