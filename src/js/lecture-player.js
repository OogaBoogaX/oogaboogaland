// Plays one lecture for this page: `create()` returns the player a hall drives. `open(entry)` fetches the lecture's
// own file (its deferred group), compiles its timeline and takes up where this browser left it; `update(dt)` moves
// the lecture's time and keeps `state` (lecture-kit.js `at`) current, allocation-free. Time comes from the recording
// when the lecture has one (its sidecar's sentence times, the audio element's clock, which keeps going in a hidden
// tab), else from the frame clock, a sentence as long as its words; without a recording the browser's own speech may
// read each sentence (`speech`, off on a test page), and the clock then waits for it. Everything a hall asks is a
// function of that one time, so a room's shared clock can drive the same player later (`seek`, `time`). Where each
// lecture was left, and which are finished, is this browser's own (localStorage `ooga-lectures`), checked on load.
// A recording is heard from the direction the hall says (`hear(side, ahead)`: a head-related panner on the page's
// sound graph), as loud from anywhere.
// At a question (lecture-kit.js `quiz`) the lecture waits (`waiting`, `quiz`) until `answer(k)`, then plays what he
// says to that answer and passes over what he would have said to the others. A question not yet answered cannot be
// skipped past; going back asks again whatever then lies ahead.
(() => {
  "use strict";
  const BL = window.BL;
  const LK = BL.lectures, KEY = "ooga-lectures", SAVE_EVERY = 12;
  const loadProgress = () => {
    const out = {};
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (raw && typeof raw === "object") for (const [id, v] of Object.entries(raw)) {
        if (/^[a-z]+-\d\d$/.test(id) && v && typeof v === "object" && Number.isFinite(v.t) && v.t >= 0 && v.t < 36000) out[id] = { t: v.t, done: v.done === true, q: Number.isInteger(v.q) && v.q > 0 && v.q < 2 ** 31 ? v.q : 0 };
      }
    } catch {}
    return out;
  };
  const create = ({ speech = false } = {}) => {
    const progress = loadProgress(), state = LK.state();
    let entry = null, timeline = null, t = 0, playing = false, audio = null, ended = false, sinceSave = 0, opening = 0, version = 0;
    let spoken = -1, speaking = false, utterance = null;
    // The answers given on this run through, by question; the question being waited on; and the questions this browser
    // has answered before (a bit each), which may be skipped past.
    let answers = [], waiting = -1, passed = 0;
    // A recording played through the page's sound graph, so it can be heard from a direction (`hear`): one context
    // for the player's life, made only once the page has had a gesture, and a source a recording. The direction is a
    // head's own (the panner's HRTF model: each ear hears him a little apart in time and tone, which is what places a
    // voice in headphones, where a change of level alone only sounds louder or quieter), at no cost in loudness
    // however far off he is.
    let ctx = null, pan = null, source = null, heardSide = 0, heardAhead = 1;
    // How loud a recording plays, of its own full level: a voice in a hall, under the game's other sounds.
    const LEVEL = 0.45;
    const wire = () => {
      if (!audio || source || typeof AudioContext === "undefined" || typeof PannerNode === "undefined") return;
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      try {
        if (!ctx) {
          ctx = new AudioContext();
          pan = ctx.createPanner();
          pan.panningModel = "HRTF"; pan.distanceModel = "inverse"; pan.rolloffFactor = 0; pan.refDistance = 1;
          const level = ctx.createGain();
          level.gain.value = LEVEL;
          pan.connect(level); level.connect(BL.sound.output(ctx));
        }
        source = ctx.createMediaElementSource(audio);
        source.connect(pan);
        // Through the graph the level is the graph's; the element itself plays at full into it.
        audio.volume = 1;
        pan.positionX.value = heardSide * 2; pan.positionY.value = 0; pan.positionZ.value = -heardAhead * 2;
      } catch { source = null; }
    };
    // Where the recording is heard from, as the listener faces: `side` from -1, hard left, to 1, hard right, and
    // `ahead` from 1, straight in front, to -1, behind. Eased, so a turn of the head slides the voice round.
    const hear = (side, ahead) => {
      if (Math.abs(side - heardSide) < 0.01 && Math.abs(ahead - heardAhead) < 0.01) return;
      heardSide = side; heardAhead = ahead;
      if (!source) return;
      // The listener stays at the middle facing -z; he is put two metres off in his direction.
      pan.positionX.setTargetAtTime(side * 2, ctx.currentTime, 0.06);
      pan.positionZ.setTargetAtTime(-ahead * 2, ctx.currentTime, 0.06);
    };
    const synth = speech && typeof window.speechSynthesis !== "undefined" ? window.speechSynthesis : null;
    const save = () => {
      if (!entry) return;
      progress[entry.id] = { t: ended ? 0 : Math.floor(t), done: ended || !!(progress[entry.id] && progress[entry.id].done), q: passed };
      try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch {}
    };
    const hush = () => { if (synth && speaking) { speaking = false; synth.cancel(); } spoken = -1; };
    const unmute = BL.sound.subscribe((muted) => { if (audio) audio.muted = muted; if (muted) hush(); });
    const sync = () => { if (timeline) LK.at(timeline, t, state); version++; };
    const pause = () => {
      if (!playing) return;
      playing = false;
      if (audio) audio.pause();
      hush();
      save();
      version++;
    };
    const play = () => {
      if (!timeline || playing) return;
      if (ended) { t = 0; ended = false; answers = []; waiting = -1; }
      playing = true;
      if (audio) {
        wire();
        if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
        audio.currentTime = t; audio.muted = BL.sound.muted; if (waiting < 0) audio.play().catch(() => { audio = null; });
      }
      sync();
    };
    // Where a move to `to` lands: at the asking of the first question in the way that has never been answered, and
    // at a question's asking rather than among its replies; a move back forgets the answers to what is then ahead.
    const landing = (to) => {
      const Q = timeline.quizzes, S = timeline.sentences;
      let target = Math.max(0, Math.min(timeline.duration - 0.05, to));
      if (target > t) for (const q of Q) if (q.hold > t - 0.05 && q.hold <= target && answers[q.i] === undefined && !(passed >> q.i & 1)) { target = S[q.ask].start; break; }
      for (const q of Q) if (target >= q.hold && target < q.end) target = S[q.ask].start;
      for (const q of Q) if (q.hold > target) answers[q.i] = undefined;
      return target;
    };
    const seek = (to) => {
      if (!timeline) return;
      t = landing(to);
      ended = false; waiting = -1;
      hush();
      if (audio) { audio.currentTime = t; if (playing && audio.paused) audio.play().catch(() => { audio = null; }); }
      sync();
    };
    // Questions, as the time passes: an unanswered one holds the lecture where its asking ends; an answered one plays
    // the reply to the answer chosen and goes on from the question's end.
    const gate = () => {
      for (const q of timeline.quizzes) {
        if (t < q.hold - 0.03 || t >= q.end) continue;
        const chosen = answers[q.i];
        if (chosen === undefined) {
          t = q.hold - 0.02; waiting = q.i;
          if (audio && !audio.paused) audio.pause();
          version++;
          return;
        }
        const b = q.branches[chosen], to = t < b.start ? b.start : t >= b.end ? q.end : -1;
        if (to >= 0) { t = Math.min(to, timeline.duration); if (audio && t < timeline.duration) audio.currentTime = t; hush(); }
        return;
      }
    };
    const answer = (k) => {
      if (!timeline || waiting < 0) return false;
      const q = timeline.quizzes[waiting];
      if (!Number.isInteger(k) || k < 0 || k >= q.options) return false;
      answers[q.i] = k; passed |= 1 << q.i; waiting = -1;
      t = q.branches[k].start;
      hush();
      if (audio) { audio.currentTime = t; if (playing) audio.play().catch(() => { audio = null; }); }
      sync(); save();
      return true;
    };
    const close = () => {
      pause();
      if (source) { source.disconnect(); source = null; }
      if (audio) { audio.removeAttribute("src"); audio.load(); audio = null; }
      entry = null; timeline = null; t = 0; ended = false; answers = []; waiting = -1; passed = 0;
      version++;
    };
    // The lecture's file, then its timeline; a newer `open` or a `close` meanwhile drops this one's answer.
    const open = (next) => {
      close();
      const mine = ++opening;
      return Promise.resolve(BL.deferred.load(next.group)).then(() => {
        if (mine !== opening) return false;
        const lecture = LK.get(next.id);
        if (!lecture) throw new Error(`Lecture ${next.id} has no content`);
        entry = next; timeline = LK.compile(lecture);
        const left = progress[next.id];
        passed = left ? left.q || 0 : 0;
        t = left && !left.done && left.t < timeline.duration - 20 ? landing(Math.max(0, left.t - 4)) : 0;
        // A recording is a file of the staged site's (scripts/site.mjs); the source tree and the portable page have
        // none to ask for, and play to the recording's times with captions.
        if (timeline.recorded && next.audio && BL.deferredScripts) {
          audio = new Audio(next.audio); audio.preload = "auto"; audio.volume = LEVEL; audio.addEventListener("error", () => { audio = null; });
          // A hidden tab runs no frames while the recording plays on: its own clock keeps the questions' gates.
          audio.addEventListener("timeupdate", () => { if (audio && playing && waiting < 0 && !audio.paused) { t = audio.currentTime; gate(); } });
        }
        sync();
        return true;
      });
    };
    const say = (i) => {
      spoken = i;
      if (!synth || BL.sound.muted) return;
      utterance = new SpeechSynthesisUtterance(timeline.sentences[i].text);
      utterance.rate = 1.04; utterance.pitch = 0.92;
      utterance.onend = utterance.onerror = () => { speaking = false; };
      speaking = true;
      synth.speak(utterance);
    };
    const update = (dt) => {
      if (!timeline || !playing || waiting >= 0) return;
      if (audio) { if (!audio.paused || audio.ended) t = audio.ended ? timeline.duration : audio.currentTime; }
      else {
        const S = timeline.sentences, i = state.sentence, s = S[i], end = s.start + s.length;
        if (synth && spoken !== i && t >= s.start) say(i);
        // With the browser's voice the clock follows it: held at a sentence's end until it is said, on to the next once it is.
        if (synth && spoken === i && speaking && t + dt >= end) t = Math.max(t, end - 0.02);
        else if (synth && spoken === i && !speaking && t > s.start + 0.4 && t < end - 0.25) t = end - 0.2;
        else t += dt;
      }
      gate();
      if (t >= timeline.duration) { t = timeline.duration; ended = true; playing = false; hush(); save(); version++; }
      const before = state.sentence;
      LK.at(timeline, t, state);
      if (state.sentence !== before) version++;
      sinceSave += dt;
      if (sinceSave > SAVE_EVERY) { sinceSave = 0; save(); }
    };
    return {
      state, progress, open, close, play, pause, seek, update, answer, hear,
      // The question the lecture is waiting on (lecture-kit.js `quizzes`), or null; and the answer given to one, or -1.
      get waiting() { return waiting; },
      // For a debug page: the direction last asked for, and whether a recording is playing through the sound graph.
      get heard() { return { side: heardSide, ahead: heardAhead, wired: !!source, state: ctx ? ctx.state : "none" }; },
      get quiz() { return timeline && waiting >= 0 ? timeline.quizzes[waiting] : null; },
      answered: (i) => answers[i] === undefined ? -1 : answers[i],
      toggle: () => { if (playing) pause(); else play(); },
      // To the start of the section `by` away (-1 the one being said, then the one before it).
      section: (by) => {
        if (!timeline) return;
        const S = timeline.sections, now = state.section, into = t - S[now].start;
        seek(S[Math.max(0, Math.min(S.length - 1, by < 0 ? into > 4 ? now : now - 1 : now + 1))].start);
      },
      // The end of the sentence being said: where a lecture stops for a question.
      sentenceEnd: () => { if (!timeline) return 0; const s = timeline.sentences[state.sentence]; return s.start + s.length; },
      dispose: () => { opening++; close(); unmute(); if (ctx) { ctx.close().catch(() => {}); ctx = null; } },
      get entry() { return entry; }, get timeline() { return timeline; }, get time() { return t; }, get playing() { return playing; }, get ended() { return ended; },
      get recorded() { return !!audio; }, get version() { return version; }
    };
  };
  BL.lecturePlayer = { create };
})();
