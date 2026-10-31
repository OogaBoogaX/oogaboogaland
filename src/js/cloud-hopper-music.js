// Cloud Hopper's scores, one for each level, all original and all thirty-two bars on the same plan: a melody over
// slowly changing chords, offbeat answering notes, a bass under them and drums that only the race lets in.
//   Level 1 "Coconut Breeze": 112 BPM tropical pluck-pop in G major, bright and bouncy, for the morning islets.
//   Level 2 "Golden Hour Drift": 96 BPM half-time sunset synthwave in D major, long warm notes over lush pads.
//   Level 3 "Cloudbreak Sprint": 128 BPM progressive trance in B minor, the restrained motif under the aurora.
//   Level 4 "Thunderhead Run": 140 BPM dark driving trance in D minor, rolling bass and a tense phrygian edge.
// One transport spans the dock, ascent, races, results and replays; only the drums follow the race state, entering
// and leaving on bar boundaries. Switching songs starts the new one on the old one's next beat and crossfades them.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const AHEAD = 0.12, MAX_AHEAD = 2, LEVEL = 0.6, CROSSFADE = 2.5;
  const HZ = new Float32Array(128), PITCH = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  for (let i = 0; i < HZ.length; i++) HZ[i] = 440 * Math.pow(2, (i - 69) / 12);
  // Equal-power crossfade curves, made once.
  const FADE_IN = new Float32Array(33), FADE_OUT = new Float32Array(33);
  for (let i = 0; i <= 32; i++) { FADE_IN[i] = Math.sin(i / 32 * Math.PI / 2); FADE_OUT[i] = Math.cos(i / 32 * Math.PI / 2); }
  // Decode a melody once: sixteen steps a bar, a dash sustaining the previous note and a dot resting.
  const line = (bars) => {
    const note = new Uint8Array(bars.length * 16), length = new Uint8Array(note.length);
    let at = 0, held = -1;
    for (const bar of bars) {
      const words = bar.split(" ");
      if (words.length !== 16) throw new Error("cloud-hopper-music: a bar must have sixteen steps");
      for (const word of words) {
        if (word === "-") {
          if (held < 0) throw new Error("cloud-hopper-music: a hold needs a note");
          length[held]++;
        } else if (word === ".") held = -1;
        else {
          note[at] = 12 * (Number(word[word.length - 1]) + 1) + PITCH[word[0]] + (word[1] === "#" ? 1 : 0);
          length[at] = 1; held = at;
        }
        at++;
      }
    }
    return { note, length };
  };
  // The steps of a bar (0–15) a part plays on, as one bit each.
  const on = (...steps) => steps.reduce((mask, step) => mask | 1 << step, 0);
  const EVERY = on(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);
  // Each song: its tempo; its melody; six chord voicings and the chord (and bass root) for each two bars of the
  // thirty-two; the order answering notes walk a chord; each voice's waveform and detune (pads four of them), and
  // when, how loud, how long and how bright each part plays, `open` the louder, brighter values of bars 9–16 and
  // 25–32. Bars 17–20 are the breakdown, where only the parts' `breakdown` steps sound.
  const SONGS = [
    {
      name: "Coconut Breeze", bpm: 112,
      melody: line([
        "d5 - . b4 . d5 . e5 - . d5 . b4 - . .",
        "a4 - . g4 . a4 . b4 - - - . . . . .",
        "f#4 - . a4 . d5 . f#5 - . e5 . d5 - . .",
        "e5 - - - . . d5 . a4 - - - . . . .",
        "g4 - . b4 . e5 . g5 - . f#5 . e5 - . .",
        "d5 - - - . . b4 . g4 - - - . . . .",
        "c5 - . e5 . g5 . e5 - . c5 . e5 - . .",
        "d5 - - - - - - - . . . . . . . .",
        "d5 - . b4 . d5 . e5 - . g5 . e5 - . .",
        "d5 - . b4 . a4 . b4 - - - . . . . .",
        "f#4 - . a4 . d5 . a5 - . f#5 . e5 - . .",
        "d5 - - - . . e5 . f#5 - - - . . . .",
        "e5 - . c5 . a4 . c5 - . e5 . a5 - . .",
        "g5 - - - . . e5 . c5 - - - . . . .",
        "f#5 - . d5 . a4 . d5 - . f#5 . a5 - . .",
        "g5 - - - - - - - . . . . . . . ."
      ]),
      // Gmaj7, Dadd9, Em7, Cmaj7, Am7, D.
      chords: [[55, 59, 62, 66], [54, 57, 62, 64], [55, 59, 62, 64], [55, 59, 60, 64], [55, 57, 60, 64], [54, 57, 62, 66]],
      harmony: [0, 1, 2, 3, 0, 1, 4, 5, 0, 1, 2, 3, 0, 1, 4, 5], roots: [31, 38, 40, 36, 31, 38, 33, 38, 31, 38, 40, 36, 31, 38, 33, 38],
      walk: [0, 2, 1, 3],
      lead: { type: "triangle", spread: 0, level: [0.12, 0.14], cutoff: [2200, 2800], attack: 0.004, held: false, gap: 0.04 },
      pads: { types: ["triangle", "sine", "sine", "triangle"], spreads: [3, 2, 2, 3], level: 0.1, cutoff: [1200, 1600], attack: 0.25 },
      arp: { type: "sine", steps: on(0, 3, 6, 10, 12), breakdown: on(0, 6, 12), level: 0.07, length: 2.2, cutoff: 2600, attack: 0.004 },
      bass: { type: "triangle", steps: on(0, 6, 8, 14), level: 0.3, length: 1.6, cutoff: 900 },
      sub: { steps: on(0, 8), level: 0.36, length: 2.4 },
      kick: { steps: on(0, 4, 8, 12), breakdown: on(0, 8), level: 0.6, soft: 0.3 },
      clap: { steps: on(4, 12), level: 0.13 },
      hat: { steps: on(1, 3, 5, 7, 9, 11, 13, 15), level: 0.03, length: 0.025 },
      openHat: { steps: on(14), level: 0.05, length: 0.1 },
      echo: 0.18
    },
    {
      name: "Golden Hour Drift", bpm: 96,
      melody: line([
        "f#5 - - - - - - - e5 - - - . . . .",
        "d5 - - - - - - - - - - - . . . .",
        "c#5 - - - - - - - d5 - - - e5 - - -",
        "f#5 - - - - - - - - - - - . . . .",
        "g5 - - - - - - - f#5 - - - . . . .",
        "e5 - - - - - - - d5 - - - . . . .",
        "e5 - - - - - - - - - - - c#5 - - -",
        "e5 - - - - - - - . . . . . . . .",
        "a5 - - - - - - - f#5 - - - . . . .",
        "e5 - - - - - - - d5 - - - . . . .",
        "c#5 - - - - - - - e5 - - - a5 - - -",
        "f#5 - - - - - - - - - - - . . . .",
        "g5 - - - - - - - b4 - - - . . . .",
        "d5 - - - - - - - . . . . . . . .",
        "c#5 - - - - - - - e5 - - - f#5 - - -",
        "e5 - - - - - - - - - - - . . . ."
      ]),
      // Dmaj9, Bm9, Gmaj7#11, Asus2, Em9, F#m7.
      chords: [[54, 57, 61, 64], [54, 57, 61, 62], [55, 59, 61, 66], [57, 59, 64, 66], [55, 59, 62, 66], [57, 61, 64, 66]],
      harmony: [0, 1, 2, 3, 0, 1, 4, 5, 0, 1, 2, 3, 0, 1, 4, 5], roots: [38, 35, 31, 33, 38, 35, 28, 30, 38, 35, 31, 33, 38, 35, 28, 30],
      walk: [0, 3, 1, 2],
      lead: { type: "sawtooth", spread: 6, level: [0.09, 0.11], cutoff: [1000, 1350], attack: 0.08, held: true, gap: 0.03 },
      pads: { types: ["sawtooth", "sawtooth", "triangle", "sawtooth"], spreads: [7, 5, 4, 8], level: 0.13, cutoff: [900, 1250], attack: 0.6 },
      arp: { type: "triangle", steps: on(2, 6, 10, 14), breakdown: on(6, 14), level: 0.06, length: 3, cutoff: 1500, attack: 0.012 },
      bass: { type: "sawtooth", steps: on(0, 10), level: 0.26, length: 5, cutoff: 520 },
      sub: { steps: on(0, 10), level: 0.4, length: 5.5 },
      kick: { steps: on(0, 10), breakdown: on(0), level: 0.7, soft: 0.3 },
      clap: { steps: on(8), level: 0.19 },
      hat: { steps: on(0, 2, 4, 6, 8, 10, 12, 14), level: 0.035, length: 0.03 },
      openHat: { steps: on(14), level: 0.055, length: 0.16 },
      echo: 0.26
    },
    {
      name: "Cloudbreak Sprint", bpm: 128,
      melody: line([
        "f#4 - - - - - - - - - - - . . . .",
        ". . . . . . . . . . . . . . . .",
        "e4 - - - - - - - d4 - - - . . . .",
        ". . . . . . . . . . . . . . . .",
        "c#4 - - - - - - - - - - - . . . .",
        "d4 - - - - - - - . . . . . . . .",
        "e4 - - - - - - - . . . . . . . .",
        ". . . . . . . . c#4 - - - - - - -",
        "f#4 - - - - - - - - - - - . . . .",
        "e4 - - - - - - - . . . . . . . .",
        "d4 - - - - - - - - - - - . . . .",
        ". . . . . . . . . . . . . . . .",
        "b3 - - - - - - - - - - - . . . .",
        "d4 - - - - - - - c#4 - - - . . . .",
        "e4 - - - - - - - - - - - . . . .",
        "c#4 - - - - - - - . . . . . . . ."
      ]),
      // Rootless Bm9, Gmaj9, Dmaj9/F#, Asus, A9 and Em9 voicings keep common tones while the bass moves.
      chords: [[50, 54, 57, 61], [50, 54, 57, 59], [50, 57, 61, 64], [50, 55, 59, 64], [49, 55, 59, 64], [55, 59, 62, 66]],
      harmony: [0, 0, 1, 1, 2, 2, 3, 4, 0, 0, 5, 5, 1, 1, 3, 4], roots: [35, 35, 31, 31, 30, 30, 33, 33, 35, 35, 40, 40, 31, 31, 33, 33],
      walk: [2, 1, 3, 1],
      lead: { type: "triangle", spread: 4, level: [0.13, 0.15], cutoff: [1300, 1600], attack: 0.045, held: true, gap: 0.03 },
      pads: { types: ["sawtooth", "triangle", "triangle", "sawtooth"], spreads: [4, 3, 3, 5], level: 0.14, cutoff: [800, 1100], attack: 0.3 },
      arp: { type: "triangle", steps: on(6, 14), breakdown: on(14), level: 0.085, length: 4.5, cutoff: 1700, attack: 0.018 },
      bass: { type: "sawtooth", steps: on(2, 6, 10, 14), level: 0.29, length: 1.7, cutoff: 650 },
      sub: { steps: on(2, 6, 10, 14), level: 0.42, length: 1.8 },
      kick: { steps: on(0, 4, 8, 12), breakdown: on(0, 8), level: 0.76, soft: 0.36 },
      clap: { steps: on(4, 12), level: 0.17 },
      hat: { steps: on(2, 10), level: 0.045, length: 0.03 },
      openHat: { steps: on(6, 14), level: 0.065, length: 0.12 },
      echo: 0.22
    },
    {
      name: "Thunderhead Run", bpm: 140,
      melody: line([
        "a4 - - . a4 - . d5 - . c5 - a4 - . .",
        "g4 - - - f4 - - - e4 - - - . . . .",
        "a4 - - . a4 - . f5 - . e5 - d5 - . .",
        "c#5 - - - - - - - . . . . . . . .",
        "a4 - - . a4 - . d5 - . c5 - a4 - . .",
        "a#4 - - - a4 - - - g4 - - - . . . .",
        "f4 - - . g4 - . a4 - . a#4 - a4 - . .",
        "a4 - - - - - - - . . . . . . . .",
        "d5 - - . d5 - . f5 - . e5 - d5 - . .",
        "c5 - - - a#4 - - - a4 - - - . . . .",
        "d5 - - . d5 - . g5 - . f5 - d5 - . .",
        "e5 - - - - - - - c#5 - - - . . . .",
        "d5 - - . a4 - . d5 - . f5 - a5 - . .",
        "g5 - - - f5 - - - d#5 - - - . . . .",
        "e5 - - . c5 - . e5 - . g5 - e5 - . .",
        "c#5 - - - - - - - . . . . . . . ."
      ]),
      // Dm(add9), A7, Gm9, Bbmaj7, Ebmaj7 (the phrygian lift), Dm again.
      chords: [[50, 53, 57, 64], [52, 55, 57, 61], [53, 55, 58, 62], [50, 53, 57, 58], [51, 55, 58, 62], [50, 53, 57, 62]],
      harmony: [0, 1, 2, 1, 0, 1, 4, 1, 5, 1, 2, 1, 0, 3, 4, 1], roots: [38, 33, 31, 33, 38, 33, 39, 33, 38, 33, 31, 33, 38, 34, 39, 33],
      walk: [3, 1, 2, 0],
      lead: { type: "sawtooth", spread: 9, level: [0.1, 0.12], cutoff: [1500, 2100], attack: 0.01, held: true, gap: 0.02 },
      pads: { types: ["sawtooth", "sawtooth", "sawtooth", "triangle"], spreads: [6, 4, 5, 3], level: 0.11, cutoff: [520, 760], attack: 0.4 },
      arp: { type: "sawtooth", steps: on(3, 11), breakdown: on(11), level: 0.07, length: 1.4, cutoff: 1900, attack: 0.004 },
      bass: { type: "sawtooth", steps: EVERY & ~on(0, 4, 8, 12), level: 0.21, length: 0.8, cutoff: 760 },
      sub: { steps: on(0, 4, 8, 12), level: 0.4, length: 1.2 },
      kick: { steps: on(0, 4, 8, 12), breakdown: on(0, 8), level: 0.84, soft: 0.4 },
      clap: { steps: on(4, 12), level: 0.18 },
      hat: { steps: on(1, 3, 5, 7, 9, 11, 13, 15), level: 0.032, length: 0.022 },
      openHat: { steps: on(2, 6, 10, 14), level: 0.05, length: 0.08 },
      echo: 0.2
    }
  ];
  for (const song of SONGS) {
    song.step = 15 / song.bpm; song.bar = song.step * 16;
    song.harmony = Uint8Array.from(song.harmony); song.roots = Uint8Array.from(song.roots); song.walk = Uint8Array.from(song.walk);
  }
  const MAX_STEPS = Math.ceil(MAX_AHEAD / Math.min(...SONGS.map(song => song.step))) + 1;

  // One player: every voice and echo tap retained, its own fader for crossfades. Notes and frames only schedule
  // AudioParams; the caller owns the single context and shared noise source.
  const player = (ctx, output, noise) => {
    const fader = ctx.createGain(), bus = ctx.createGain(), pump = ctx.createGain(), drumBus = ctx.createGain();
    const echoSend = ctx.createGain(), echoWet = ctx.createGain(), delays = [];
    fader.gain.value = 1; fader.connect(output);
    bus.gain.value = LEVEL; bus.connect(fader);
    pump.gain.value = 1; pump.connect(bus);
    drumBus.gain.value = 0; drumBus.connect(bus);
    echoSend.gain.value = 0.22; echoWet.gain.value = 0; echoWet.connect(pump);
    // Two finite taps create space without a feedback loop. Quiet gates them
    // until both buffers have drained, so old notes cannot return after mute.
    for (let i = 0; i < 2; i++) {
      const delay = ctx.createDelay(1), low = ctx.createBiquadFilter(), level = ctx.createGain(), pan = ctx.createStereoPanner();
      low.type = "lowpass"; low.frequency.value = i ? 2100 : 3200; low.Q.value = 0.4;
      level.gain.value = i ? 0.42 : 0.72; pan.pan.value = i ? 0.55 : -0.55;
      echoSend.connect(delay); delay.connect(low); low.connect(level); level.connect(pan); pan.connect(echoWet);
      delays.push(delay);
    }
    const voices = [];
    const voice = (pan, count = 1, echo = false, drums = false) => {
      const volume = ctx.createGain(), stereo = ctx.createStereoPanner(), low = ctx.createBiquadFilter();
      volume.gain.value = 0; stereo.pan.value = pan;
      low.type = "lowpass"; low.frequency.value = 1000; low.Q.value = 0.65;
      low.connect(volume); volume.connect(stereo); stereo.connect(drums ? drumBus : pump);
      if (echo) stereo.connect(echoSend);
      const tones = [], pitches = [], blend = ctx.createGain();
      blend.gain.value = 1 / count; blend.connect(low);
      for (let i = 0; i < count; i++) {
        const tone = ctx.createOscillator();
        tone.frequency.value = 220; tone.connect(blend); tone.start(); tones.push(tone); pitches.push(tone.frequency);
      }
      const v = { gain: volume.gain, tones, pitches, cutoff: low.frequency };
      voices.push(v); return v;
    };
    const hiss = (type, frequency, pan) => {
      const volume = ctx.createGain(), filter = ctx.createBiquadFilter(), stereo = ctx.createStereoPanner();
      volume.gain.value = 0; filter.type = type; filter.frequency.value = frequency; filter.Q.value = 0.7;
      stereo.pan.value = pan;
      noise.connect(filter); filter.connect(volume); volume.connect(stereo); stereo.connect(drumBus);
      const v = { gain: volume.gain, tones: null, pitches: null, cutoff: filter.frequency };
      voices.push(v); return v;
    };
    const lead = voice(0, 3, true), bass = voice(0), sub = voice(0);
    const arps = [voice(-0.36, 1, true), voice(0.36, 1, true)];
    const pads = [voice(-0.45, 3), voice(-0.15, 3), voice(0.15, 3), voice(0.45, 3)];
    const kick = voice(0, 1, false, true), hat = hiss("highpass", 7600, 0.25);
    const openHat = hiss("highpass", 5600, -0.2), clap = hiss("bandpass", 1700, 0);
    sub.tones[0].type = kick.tones[0].type = "sine";
    let song = SONGS[0], step = song.step, bar = song.bar;
    let mode = "", origin = 0, nextStep = 0, nextArp = 0, silenced = true;
    let drumFrom = 0, drumTo = 0, drumAt = 0;
    // A song's timbres: waveforms and detune for its voices, and its echo times. Only while this player is silent.
    const load = (next) => {
      song = next; step = song.step; bar = song.bar;
      const tune = (v, type, spread) => {
        for (let i = 0; i < v.tones.length; i++) { v.tones[i].type = type; v.tones[i].detune.value = v.tones.length > 1 ? (i - 1) * spread : 0; }
      };
      tune(lead, song.lead.type, song.lead.spread); tune(bass, song.bass.type, 0);
      for (const arp of arps) tune(arp, song.arp.type, 0);
      for (let p = 0; p < pads.length; p++) tune(pads[p], song.pads.types[p], song.pads.spreads[p]);
      delays[0].delayTime.value = step * 3; delays[1].delayTime.value = step * 6;
      echoSend.gain.value = song.echo;
    };
    const drumLevelAt = at => at < drumAt ? drumFrom : drumTo;
    const duck = (at) => {
      const depth = 1 - 0.42 * drumLevelAt(at);
      pump.gain.cancelScheduledValues(at); pump.gain.setValueAtTime(depth, at);
      pump.gain.setValueAtTime(depth, at + 0.025);
      pump.gain.linearRampToValueAtTime(1, at + step * 2);
    };
    const breakdownBar = (b) => b >= 16 && b < 20;
    const mixDrums = (to) => {
      const target = to ? 1 : 0;
      if (target === drumTo) return;
      const now = ctx.currentTime;
      drumFrom = drumLevelAt(now); drumTo = target;
      drumAt = origin + Math.max(0, Math.ceil((now - origin) / bar)) * bar;
      drumBus.gain.cancelScheduledValues(now); drumBus.gain.setValueAtTime(drumFrom, now);
      // Enter at full level on beat one. After a finish, let this bar's hits
      // ring out and close the gate before the next bar's kick can sound.
      drumBus.gain.setValueAtTime(target, drumAt);
      // Hidden tabs may have already queued the next bar. Repair only its
      // ducking, preserving this bar's pulse and every melodic note and echo.
      pump.gain.cancelScheduledValues(drumAt); pump.gain.setValueAtTime(1, drumAt);
      const first = Math.max(0, Math.round((drumAt - origin) / step));
      for (let s = first; s < nextStep && s < first + MAX_STEPS; s++) {
        const kicks = breakdownBar((s >> 4) & 31) ? song.kick.breakdown : song.kick.steps;
        if (kicks & 1 << (s & 15)) duck(origin + s * step);
      }
    };
    const envelope = (v, peak, duration, at, attack = 0.006, held = false) => {
      const gain = v.gain;
      gain.cancelScheduledValues(at); gain.setValueAtTime(0, at);
      gain.linearRampToValueAtTime(peak, at + attack);
      if (held) {
        gain.linearRampToValueAtTime(peak * 0.72, at + duration * 0.3);
        gain.setValueAtTime(peak * 0.72, at + duration * 0.76);
      }
      gain.exponentialRampToValueAtTime(0.0001, at + duration);
      gain.setValueAtTime(0, at + duration + 0.003);
    };
    const note = (v, midi, duration, peak, at, cutoff, attack = 0.006, held = false) => {
      for (let i = 0; i < v.pitches.length; i++) {
        v.pitches[i].cancelScheduledValues(at); v.pitches[i].setValueAtTime(HZ[midi], at);
      }
      v.cutoff.cancelScheduledValues(at); v.cutoff.setValueAtTime(cutoff, at);
      if (!held) v.cutoff.exponentialRampToValueAtTime(Math.max(180, cutoff * 0.28), at + duration);
      envelope(v, peak, duration, at, attack, held);
    };
    const thump = (at, level) => {
      const pitch = kick.pitches[0];
      pitch.cancelScheduledValues(at); pitch.setValueAtTime(115, at);
      pitch.exponentialRampToValueAtTime(47, at + 0.13);
      envelope(kick, level, 0.24, at, 0.002);
      // The duck follows the audible drum mix; silent scheduled kicks leave
      // the melody at full level. Drums stay outside that gain.
      duck(at);
    };
    const clapHit = (at, level) => {
      const gain = clap.gain;
      gain.cancelScheduledValues(at); gain.setValueAtTime(0, at);
      gain.linearRampToValueAtTime(level, at + 0.002);
      gain.linearRampToValueAtTime(level * 0.15, at + 0.012);
      gain.linearRampToValueAtTime(level * 0.8, at + 0.017);
      gain.linearRampToValueAtTime(level * 0.15, at + 0.025);
      gain.linearRampToValueAtTime(level, at + 0.032);
      gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
      gain.setValueAtTime(0, at + 0.165);
    };
    const quiet = () => {
      const now = ctx.currentTime;
      for (let i = 0; i < voices.length; i++) {
        const v = voices[i];
        v.gain.cancelScheduledValues(now); v.gain.setValueAtTime(0, now);
        v.cutoff.cancelScheduledValues(now);
        if (v.pitches) for (let j = 0; j < v.pitches.length; j++) v.pitches[j].cancelScheduledValues(now);
      }
      bus.gain.cancelScheduledValues(now); bus.gain.setValueAtTime(0, now);
      echoWet.gain.cancelScheduledValues(now); echoWet.gain.setValueAtTime(0, now);
      pump.gain.cancelScheduledValues(now); pump.gain.setValueAtTime(1, now);
      drumBus.gain.cancelScheduledValues(now); drumBus.gain.setValueAtTime(0, now);
      drumFrom = drumTo = 0; drumAt = now;
      silenced = true;
      // Reclaim cancelled lookahead while retaining the musical clock. Tick
      // skips unheard notes after a suspended tab instead of catching up.
      nextStep = Math.max(0, Math.ceil((now - origin) / step));
    };
    const stop = () => {
      quiet(); mode = ""; nextStep = 0;
      fader.gain.cancelScheduledValues(0); fader.gain.setValueAtTime(1, ctx.currentTime);
    };
    // "bed" plays everything but drums, "running" lets them in, "" stops.
    const setMode = (next) => {
      if (!next) { stop(); return; }
      if (next === mode) return;
      // Start a clock only after a real stop. A race or replay changes only
      // the drum gate, so held chords and the current melody keep sounding.
      if (!mode) { origin = ctx.currentTime + 0.025; nextStep = nextArp = 0; }
      mode = next;
      // A muted/suspended score waits for tick to choose its audible downbeat.
      if (!silenced) mixDrums(next === "running");
    };
    // Begin the loaded song's first bar at `at`, in `next` mode.
    const startAt = (at, next) => {
      origin = at; nextStep = nextArp = 0; mode = next;
      if (!silenced) mixDrums(next === "running");
    };
    // The next beat of this song at or after `time`.
    const nextBeat = (time) => origin + Math.max(0, Math.ceil((time - origin) / (step * 4))) * step * 4;
    // A crossfade from `at`, replacing any fade still under way from wherever it has reached.
    const fade = (curve, at) => {
      const gain = fader.gain, reached = gain.value;
      gain.cancelScheduledValues(0); gain.setValueAtTime(reached, ctx.currentTime);
      gain.setValueCurveAtTime(curve, at, CROSSFADE);
    };
    const play = (s, at) => {
      const i = s & 255, b = (s >> 4) & 31, harmony = b >> 1, beat = i & 15, bit = 1 << beat;
      const chord = song.chords[song.harmony[harmony]], breakdown = breakdownBar(b);
      const open = b >= 8 && b < 16 || b >= 24 ? 1 : 0;
      if (beat === 0 && !(b & 1)) {
        for (let p = 0; p < pads.length; p++) note(pads[p], chord[p], step * 31.8, song.pads.level, at, song.pads.cutoff[open], song.pads.attack, true);
      }
      // Quiet answering notes leave the main phrase room to decay into its echoes.
      if ((breakdown ? song.arp.breakdown : song.arp.steps) & bit) {
        const arp = arps[nextArp]; nextArp = 1 - nextArp;
        note(arp, chord[song.walk[(b + (beat >= 8 ? 1 : 0)) & 3]], step * song.arp.length, song.arp.level, at, song.arp.cutoff, song.arp.attack);
      }
      if (song.melody.note[i]) {
        const duration = Math.max(0.1, song.melody.length[i] * step - song.lead.gap);
        note(lead, song.melody.note[i], duration, song.lead.level[open], at, song.lead.cutoff[open], song.lead.attack, song.lead.held);
      }
      const root = song.roots[harmony];
      if (!breakdown && song.bass.steps & bit) note(bass, root + 12, step * song.bass.length, song.bass.level, at, song.bass.cutoff);
      if (!breakdown && song.sub.steps & bit) note(sub, root, step * song.sub.length, song.sub.level, at, 180);
      else if (breakdown && (beat === 0 || beat === 8)) note(sub, root, step * 6, 0.25, at, 180, 0.04);
      if ((breakdown ? song.kick.breakdown : song.kick.steps) & bit) thump(at, breakdown ? song.kick.soft : song.kick.level);
      if (!breakdown && song.clap.steps & bit) clapHit(at, song.clap.level);
      if (!breakdown && song.openHat.steps & bit) envelope(openHat, song.openHat.level, song.openHat.length, at, 0.003);
      if (!breakdown && song.hat.steps & bit) envelope(hat, song.hat.level, song.hat.length, at, 0.002);
    };
    const tick = (ahead = AHEAD) => {
      if (!mode) return;
      const now = ctx.currentTime, end = now + Math.max(AHEAD, Math.min(MAX_AHEAD, ahead));
      if (silenced) {
        silenced = false;
        bus.gain.setValueAtTime(0, now); bus.gain.linearRampToValueAtTime(LEVEL, now + 0.012);
        echoWet.gain.setValueAtTime(0, now + step * 6 + 0.01);
        echoWet.gain.linearRampToValueAtTime(1, now + step * 6 + 0.05);
        mixDrums(mode === "running");
      }
      nextStep = Math.max(nextStep, Math.ceil((now - origin) / step));
      // Bound scheduling even after a long suspension; never emit missed bars.
      for (let queued = 0; queued < MAX_STEPS; queued++) {
        const at = origin + nextStep * step;
        if (at >= end) break;
        play(nextStep, at); nextStep++;
      }
    };
    return { load, setMode, startAt, nextBeat, fade, tick, quiet, stop, get mode() { return mode; } };
  };

  // Players are made as needed, three at most: the one playing, and up to two still fading out after switches.
  const create = (ctx, output, noise) => {
    const players = [player(ctx, output, noise)], outgoing = [];
    let current = 0, chosen = 0, mode = "";
    players[0].load(SONGS[0]);
    const release = (now) => {
      while (outgoing.length && outgoing[0].end <= now) players[outgoing.shift().index].stop();
    };
    // Play song `index` (a level's, 0-based). While a song plays, the new one starts on its next beat, both mixed
    // together there, and the two crossfade over CROSSFADE seconds. Switching again mid-fade lets the older ones
    // finish fading; only when every player is busy is the oldest stopped.
    const song = (index) => {
      if (index === chosen) return;
      chosen = index;
      const playing = players[current];
      if (!playing.mode) { playing.load(SONGS[index]); return; }
      const now = ctx.currentTime;
      release(now);
      let free = players.findIndex((p, i) => i !== current && !p.mode);
      if (free < 0 && players.length < 3) { players.push(player(ctx, output, noise)); free = players.length - 1; }
      if (free < 0) { free = outgoing.shift().index; players[free].stop(); }
      const next = players[free], at = playing.nextBeat(now + 0.06);
      next.load(SONGS[index]); next.startAt(at, playing.mode);
      playing.fade(FADE_OUT, at); next.fade(FADE_IN, at);
      outgoing.push({ index: current, end: at + CROSSFADE });
      current = free;
    };
    const stage = (next) => {
      if (next === "dock" || next === "intro" || next === "lifting" || next === "briefing" || next === "ready" || next === "won" || next === "best" || next === "dq") next = "bed";
      else if (next !== "running") next = "";
      mode = next;
      if (!next) { stop(); return; }
      players[current].setMode(next);
      for (const fading of outgoing) players[fading.index].setMode(next);
    };
    const tick = (ahead = AHEAD) => {
      release(ctx.currentTime);
      players[current].tick(ahead);
      for (const fading of outgoing) players[fading.index].tick(ahead);
    };
    const quiet = () => { for (const p of players) p.quiet(); };
    const stop = () => { outgoing.length = 0; for (const p of players) p.stop(); };
    return { stage, tick, quiet, stop, song, get chosen() { return chosen; }, get mode() { return mode; } };
  };
  BL.cloudHopperMusic = { create, SONGS };
})();
