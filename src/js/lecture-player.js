// Plays one lecture for this page: `create()` returns the player a hall drives. `open(entry)` fetches the lecture's
// own file (its deferred group), compiles its timeline and takes up where this browser left it; `update(dt)` moves
// the lecture's time and keeps `state` (lecture-kit.js `at`) current, allocation-free. Time comes from the recording
// when the lecture has one (its sidecar's sentence times, the audio element's clock, which keeps going in a hidden
// tab), else from the frame clock, a sentence as long as its words; without a recording the browser's own speech may
// read each sentence (`speech`, off on a test page), and the clock then waits for it. Everything a hall asks is a
// function of that one time, so a room's shared clock can drive the same player later (`seek`, `time`). Where each
// lecture was left, and which are finished, is this browser's own (localStorage `ooga-lectures`), checked on load.
// A recording is heard from the direction the hall says (`hear(side, ahead)`: a smooth equal-power panner on the
// page's sound graph), as loud from anywhere.
// At a question (lecture-kit.js `quiz`) the lecture waits (`waiting`, `quiz`) until `answer(k)`, then plays what he
// says to that answer and passes over what he would have said to the others. Section jumps may skip unanswered
// questions; going back asks again whatever then lies ahead.
(() => {
  "use strict";
  const BL = window.BL;
  const LK = BL.lectures, KEY = "ooga-lectures", SPEED_KEY = "ooga-lecture-speed", SAVE_EVERY = 12;
  const validSpeed = rate => rate === 1 || rate === 1.25 || rate === 1.5 || rate === 2;
  const loadSpeed = () => {
    try { const rate = Number(localStorage.getItem(SPEED_KEY)); if (validSpeed(rate)) return rate; } catch {}
    return 1;
  };
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
    let spoken = -1, speaking = false, utterance = null, speed = loadSpeed();
    let scrubbing = false, scrubTime = 0, scrubResume = false;
    // The answers given on this run through, by question; the question being waited on; and the questions this browser
    // has answered before (a bit each), which may be skipped past.
    let answers = [], waiting = -1, passed = 0;
    // One context for the player's life, made after a gesture, and a source per recording. Equal-power panning
    // keeps left/right direction without changing HRTF filters as the listener turns; those transitions can
    // crackle under a sustained voice. The position parameters still ease on the audio clock.
    let ctx = null, pan = null, source = null, heardSide = 0, heardAhead = 1;
    // The mastered recording plays at 90%, through either the sound graph or the element.
    const LEVEL = 0.9;
    const wire = () => {
      if (!audio || source || typeof AudioContext === "undefined" || typeof PannerNode === "undefined") return;
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      try {
        if (!ctx) {
          ctx = new AudioContext();
          pan = ctx.createPanner();
          pan.panningModel = "equalpower"; pan.distanceModel = "inverse"; pan.rolloffFactor = 0; pan.refDistance = 1;
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
    // One rate for the recording and the fallback clock; its times and all authored cues stay in lecture seconds.
    const setSpeed = (rate) => {
      if (!validSpeed(rate)) return false;
      speed = rate;
      try { localStorage.setItem(SPEED_KEY, String(rate)); } catch {}
      if (audio) { audio.playbackRate = rate; audio.preservesPitch = true; }
      if (synth && speaking) hush();
      version++;
      return true;
    };
    const pause = () => {
      if (!playing) return;
      playing = false;
      if (audio) audio.pause();
      hush();
      save();
      version++;
    };
    const play = () => {
      if (!timeline || playing || scrubbing) return;
      if (ended) { t = 0; ended = false; answers = []; waiting = -1; }
      playing = true;
      if (audio) {
        wire();
        if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
        audio.currentTime = t; audio.muted = BL.sound.muted; if (waiting < 0) audio.play().catch(() => { audio = null; });
      }
      sync();
    };
    // A section jump may skip unanswered questions. A seek into replies lands at their question instead;
    // a move back forgets the answers to what is then ahead.
    const landing = (to) => {
      const Q = timeline.quizzes, S = timeline.sentences;
      let target = Math.max(0, Math.min(timeline.duration - 0.05, to));
      for (const q of Q) if (target >= q.hold && target < q.end) target = S[q.ask].start;
      for (const q of Q) if (q.hold > target) answers[q.i] = undefined;
      return target;
    };
    const seekTime = (to, exact = false) => {
      if (!timeline) return;
      scrubbing = false;
      t = exact ? Math.max(0, Math.min(timeline.duration - 0.05, to)) : landing(to);
      if (exact) for (const q of timeline.quizzes) {
        if (q.hold > t) answers[q.i] = undefined;
        else if (t < q.end) {
          // A scrub into a reply keeps that reply when playback resumes, without recording a quiz answer.
          const branch = q.branches.findIndex((b) => t < b.end);
          answers[q.i] = branch < 0 ? q.branches.length - 1 : branch;
        }
      }
      ended = false; waiting = -1;
      hush();
      if (audio) { audio.currentTime = t; if (playing && audio.paused) audio.play().catch(() => { audio = null; }); }
      sync();
    };
    const seek = (to) => seekTime(to);
    // Only the playhead previews while held. Audio and authored cues seek once, on release.
    const beginScrub = () => {
      if (!timeline || scrubbing) return false;
      scrubResume = playing; scrubTime = t;
      pause(); scrubbing = true; version++;
      return true;
    };
    const moveScrub = (to) => {
      if (!scrubbing || !Number.isFinite(to)) return;
      const next = Math.max(0, Math.min(Math.floor(timeline.duration), Math.round(to)));
      if (next !== scrubTime) { scrubTime = next; version++; }
    };
    const endScrub = (cancelled = false) => {
      if (!scrubbing) return false;
      scrubbing = false;
      if (!cancelled) { seekTime(scrubTime, true); if (scrubResume) play(); save(); }
      scrubResume = false; version++;
      return true;
    };
    // Questions, as the time passes: an unanswered one holds the lecture where its asking ends; an answered one plays
    // the reply to the answer chosen and goes on from the question's end.
    const gate = (from) => {
      for (const q of timeline.quizzes) {
        // Background media events may arrive after an entire question. Hold at the first unanswered gate crossed;
        // explicit seeks still skip earlier questions because their starting time is already beyond those gates.
        if (t < q.hold - 0.03 || t >= q.end && (from >= q.hold || answers[q.i] !== undefined)) continue;
        const chosen = answers[q.i];
        if (chosen === undefined) {
          t = q.hold - 0.02; waiting = q.i;
          if (audio) { audio.pause(); audio.currentTime = t; }
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
      scrubbing = false; scrubResume = false;
      entry = null; timeline = null; t = 0; ended = false; answers = []; waiting = -1; passed = 0;
      version++;
    };
    // The lecture's file, then its timeline; a newer `open` or a `close` meanwhile drops this one's answer.
    const open = (next) => {
      if (!next || next.available === false) return Promise.resolve(false);
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
          audio = new Audio(); audio.preload = "none"; audio.playbackRate = speed; audio.preservesPitch = true; audio.volume = LEVEL; audio.addEventListener("error", () => { audio = null; });
          // Hidden tabs run no scene frames. Media events must advance the same cue state, gates and completion
          // as a frame, including the final event when the recording has already paused at its end.
          const recording = audio;
          const mediaTick = () => { if (audio === recording) update(0); };
          recording.addEventListener("timeupdate", mediaTick);
          recording.addEventListener("ended", mediaTick);
          // Selecting a lecture creates the element; only play() asks for the recording.
          recording.src = next.audio;
        }
        sync();
        return true;
      });
    };
    const say = (i) => {
      spoken = i;
      if (!synth || BL.sound.muted) return;
      utterance = new SpeechSynthesisUtterance(timeline.sentences[i].text);
      utterance.rate = 1.04 * speed; utterance.pitch = 0.92;
      utterance.onend = utterance.onerror = () => { speaking = false; };
      speaking = true;
      synth.speak(utterance);
    };
    const update = (dt) => {
      if (!timeline || !playing || waiting >= 0) return;
      const from = t;
      if (audio) { if (!audio.paused || audio.ended) t = audio.ended ? timeline.duration : audio.currentTime; }
      else {
        dt *= speed;
        const S = timeline.sentences, i = state.sentence, s = S[i], end = s.start + s.length;
        if (synth && spoken !== i && t >= s.start) say(i);
        // With the browser's voice the clock follows it: held at a sentence's end until it is said, on to the next once it is.
        if (synth && spoken === i && speaking && t + dt >= end) t = Math.max(t, end - 0.02);
        else if (synth && spoken === i && !speaking && t > s.start + 0.4 && t < end - 0.25) t = end - 0.2;
        else t += dt;
      }
      gate(from);
      if (t >= timeline.duration) { t = timeline.duration; ended = true; playing = false; hush(); save(); version++; }
      const before = state.sentence;
      LK.at(timeline, t, state);
      if (state.sentence !== before) version++;
      sinceSave += dt;
      if (sinceSave > SAVE_EVERY) { sinceSave = 0; save(); }
    };
    return {
      state, progress, open, close, play, pause, seek, update, answer, hear, setSpeed, beginScrub, moveScrub, endScrub,
      get scrubbing() { return scrubbing; }, get scrubTime() { return scrubbing ? scrubTime : t; },
      get speed() { return speed; },
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
