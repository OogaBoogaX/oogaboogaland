// Block Frenzy's sound, all synthesized: one AudioContext made on the first gesture, a fixed pool of tone voices
// gated by gain, two noise bursts (a wet splat and a deep boom) shaped from one looping noise buffer, and three
// held layers only ever shaped by gain: the rain, which follows the weather, and the zipline's whir.
//
// The drop's pattern (`drop-audio.js`): nothing is built per cue, a cue only schedules automation on a pooled voice,
// and it shares the island's mute key. Cues take a level from 0 to 1 so far-off sounds play quieter.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp } = BL.math;
  const VOICES = 12;
  const NOISE_SECONDS = 2;
  const MASTER = 0.5;
  const NOTE = (semis) => 220 * Math.pow(2, semis / 12);
  const create = () => {
    // The page-wide environment mute (sound.js), shared with the banner speaker and M.
    let ctx = null, master = null, ready = false, muted = BL.sound.muted;
    const voices = [];
    let voiceNext = 0;
    const layers = { rain: null, jet: null, zip: null, zipFilter: null, splat: null, splatFilter: null, boom: null, boomFilter: null };
    const state = { rain: 0, zip: 0, jet: 0 };
    const init = () => {
      if (ctx || typeof AudioContext === "undefined") return;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER;
      master.connect(ctx.destination);
      const filter = (type, freq, q = 1) => {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        return f;
      };
      const gain = (value, to) => {
        const g = ctx.createGain();
        g.gain.value = value;
        g.connect(to);
        return g;
      };
      for (let i = 0; i < VOICES; i++) {
        const g = gain(0, master);
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = 220;
        osc.connect(g);
        osc.start();
        voices.push({ osc, gain: g, until: 0 });
      }
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const tap = (type, freq, q, key, keyFilter) => {
        const f = filter(type, freq, q);
        layers[key] = gain(0, master);
        f.connect(layers[key]);
        noise.connect(f);
        if (keyFilter) layers[keyFilter] = f;
      };
      tap("highpass", 3200, 0.4, "rain");
      tap("bandpass", 900, 6, "zip", "zipFilter");
      tap("lowpass", 520, 1.2, "jet");
      tap("bandpass", 1300, 1.2, "splat", "splatFilter");
      tap("lowpass", 260, 0.8, "boom", "boomFilter");
      noise.start();
      ready = true;
    };
    // Browsers only start sound from a gesture; the first one opens the context.
    const unlock = () => {
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      init();
      if (ctx && ctx.state === "suspended") ctx.resume();
    };
    const voice = () => {
      const now = ctx.currentTime;
      for (let i = 0; i < VOICES; i++) {
        const v = voices[(voiceNext + i) % VOICES];
        if (v.until <= now) {
          voiceNext = (voiceNext + i + 1) % VOICES;
          return v;
        }
      }
      const v = voices[voiceNext];
      voiceNext = (voiceNext + 1) % VOICES;
      return v;
    };
    const blip = (type, f0, f1, attack, hold, release, level, delay = 0) => {
      if (!ready || level <= 0.002) return;
      const now = ctx.currentTime + delay, v = voice();
      v.osc.type = type;
      v.osc.frequency.cancelScheduledValues(now);
      v.osc.frequency.setValueAtTime(f0, now);
      if (f1 !== f0) v.osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + attack + hold + release);
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(0, now);
      v.gain.gain.linearRampToValueAtTime(level, now + attack);
      v.gain.gain.setValueAtTime(level, now + attack + hold);
      v.gain.gain.linearRampToValueAtTime(0, now + attack + hold + release);
      v.until = now + attack + hold + release + 0.02;
    };
    // A noise burst on one of the two taps: up in `attack`, down over `dur`, its filter swept from f0 to f1.
    const burst = (key, filterKey, level, attack, dur, f0, f1, delay = 0) => {
      if (!ready || level <= 0.002) return;
      const now = ctx.currentTime + delay, g = layers[key].gain, f = layers[filterKey].frequency;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(level, now + attack);
      g.exponentialRampToValueAtTime(0.0005, now + dur);
      f.cancelScheduledValues(now);
      f.setValueAtTime(f0, now);
      f.exponentialRampToValueAtTime(f1, now + dur);
    };
    const splatNoise = (k, dur = 0.22) => burst("splat", "splatFilter", 0.5 * k, 0.005, dur, 2200, 380);
    const boomNoise = (k, dur = 0.9) => burst("boom", "boomFilter", 0.9 * k, 0.01, dur, 700, 60);
    const chord = (notes, gap, type, hold, level, delay = 0) => {
      for (let i = 0; i < notes.length; i++) blip(type, NOTE(notes[i]), NOTE(notes[i]), 0.01, hold, 0.12, level, delay + i * gap);
    };
    // Every cue takes `k`, the level for how near it happened (1 at the visitor's Ooga).
    const cues = {
      count: () => blip("square", NOTE(3), NOTE(3), 0.01, 0.07, 0.06, 0.14),
      go: () => chord([0, 7, 12], 0.09, "square", 0.08, 0.18),
      fire: (k = 1) => { blip("triangle", 420, 160, 0.003, 0.02, 0.06, 0.22 * k); splatNoise(0.25 * k, 0.06); },
      // A round from an AK, the Ghost Hunter's rifle shot (ghost-audio.js `shot`): a short dull crack of low-passed noise
      // over a low thump.
      gun: (k = 1) => { burst("splat", "splatFilter", 0.55 * k, 0.003, 0.14, 1800, 260); blip("sine", 150, 55, 0.002, 0.03, 0.1, 0.4 * k); },
      throw: (k = 1) => blip("sine", 260, 110, 0.005, 0.03, 0.12, 0.2 * k),
      sniper: (k = 1) => { blip("square", 1800, 300, 0.001, 0.01, 0.09, 0.16 * k); burst("splat", "splatFilter", 0.6 * k, 0.002, 0.18, 5000, 900); },
      rocket: (k = 1) => { blip("sawtooth", 90, 260, 0.02, 0.2, 0.2, 0.16 * k); burst("splat", "splatFilter", 0.3 * k, 0.05, 0.5, 600, 2400); },
      splat: (k = 1) => { splatNoise(k); blip("sine", 180, 70, 0.003, 0.03, 0.12, 0.25 * k); },
      miss: (k = 1) => splatNoise(0.35 * k, 0.12),
      pop: (k = 1) => { boomNoise(0.55 * k, 0.5); splatNoise(0.6 * k, 0.3); },
      boom: (k = 1) => { boomNoise(k, 1.1); blip("sawtooth", 80, 30, 0.005, 0.15, 0.6, 0.3 * k); },
      net: (k = 1) => { blip("triangle", 700, 300, 0.005, 0.04, 0.15, 0.16 * k); blip("triangle", 520, 240, 0.005, 0.04, 0.15, 0.12 * k, 0.05); },
      bonk: (k = 1) => { blip("square", 900, 900, 0.002, 0.03, 0.08, 0.2 * k); blip("triangle", 1400, 600, 0.002, 0.05, 0.3, 0.18 * k, 0.05); },
      crate: (k = 1) => blip("triangle", 140, 80, 0.003, 0.03, 0.12, 0.22 * k),
      boing: (k = 1) => blip("sine", 160, 640, 0.005, 0.05, 0.3, 0.3 * k),
      jump: () => blip("sine", 300, 520, 0.005, 0.02, 0.08, 0.06),
      pickup: () => chord([7, 11, 14, 19], 0.05, "triangle", 0.05, 0.2),
      rescue: () => chord([0, 4, 7], 0.06, "triangle", 0.06, 0.18),
      drop: (k = 1) => blip("triangle", NOTE(7), NOTE(-5), 0.01, 0.05, 0.3, 0.2 * k),
      pass: (k = 1) => blip("sine", 300, 700, 0.02, 0.1, 0.2, 0.16 * k),
      // Landing in the viewing chairs: two soft high sine notes, nothing like a capture.
      seat: () => { blip("sine", NOTE(19), NOTE(24), 0.02, 0.1, 0.35, 0.1); blip("sine", NOTE(24), NOTE(24), 0.02, 0.06, 0.4, 0.07, 0.12); },
      // A block mined: three warm low triangle notes rising, short and soft, with no high edge or tail.
      capture: () => { blip("triangle", NOTE(3), NOTE(3), 0.01, 0.07, 0.12, 0.16); blip("triangle", NOTE(7), NOTE(7), 0.01, 0.07, 0.12, 0.16, 0.09); blip("triangle", NOTE(12), NOTE(12), 0.01, 0.1, 0.18, 0.18, 0.18); },
      theirCapture: () => chord([5, 2, -2], 0.09, "triangle", 0.07, 0.15),
      win: () => { chord([0, 4, 7, 12, 16, 19, 24], 0.1, "square", 0.08, 0.18); boomNoise(0.4, 1.4); },
      lose: () => blip("sine", NOTE(0), NOTE(-24), 0.02, 0.4, 0.9, 0.22),
      trap: () => { for (let i = 0; i < 6; i++) blip("triangle", NOTE(i % 2 ? 7 : 12), NOTE(i % 2 ? 7 : 12), 0.005, 0.04, 0.03, 0.16, i * 0.07); },
      right: () => chord([12, 16, 19, 24], 0.06, "triangle", 0.05, 0.2),
      wrong: () => blip("square", NOTE(-12), NOTE(-14), 0.01, 0.25, 0.1, 0.16),
      refill: () => chord([12, 19], 0.07, "triangle", 0.05, 0.16),
      rifle: () => { blip("square", 220, 220, 0.002, 0.02, 0.04, 0.16); blip("square", 330, 330, 0.002, 0.02, 0.06, 0.16, 0.08); },
      zipOn: () => blip("triangle", 500, 900, 0.01, 0.05, 0.1, 0.14),
      zipOff: () => blip("triangle", 900, 400, 0.01, 0.05, 0.12, 0.14),
      thunder: () => { boomNoise(0.8, 2.6); boomNoise(0.5, 1.8); },
      block: () => { chord([12, 7, 12, 19], 0.11, "square", 0.08, 0.2); boomNoise(0.35, 1.2); },
      power: () => chord([0, 7, 12, 19, 24], 0.04, "square", 0.04, 0.16),
      slip: (k = 1) => { blip("sine", 1200, 180, 0.005, 0.05, 0.6, 0.22 * k); blip("triangle", 300, 600, 0.005, 0.05, 0.15, 0.1 * k, 0.45); },
      burn: (k = 1) => { burst("splat", "splatFilter", 0.5 * k, 0.005, 0.6, 4000, 1500); blip("square", 880, 1320, 0.005, 0.08, 0.1, 0.16 * k); },
      // A gorilla, silly rather than scary: as it grabs, three quick "hoo" hoots climbing to a "HAH!", and two soft chest
      // thumps; a short "hm" each struggle; an "ook!" when it's painted. Soft triangles and sines (no sawtooth), six
      // voices at most for the grab.
      roar: (k = 1) => {
        for (let i = 0; i < 3; i++) blip("triangle", 210 + i * 45, 250 + i * 55, 0.02, 0.06, 0.08, 0.12 * k, i * 0.16);
        blip("triangle", 420, 300, 0.01, 0.1, 0.18, 0.15 * k, 0.5);
        blip("sine", 90, 60, 0.005, 0.03, 0.12, 0.22 * k, 0.72); blip("sine", 90, 60, 0.005, 0.03, 0.12, 0.22 * k, 0.86);
      },
      grunt: (k = 1) => blip("triangle", 170, 140, 0.01, 0.05, 0.08, 0.12 * k),
      yelp: (k = 1) => blip("triangle", 520, 780, 0.005, 0.05, 0.12, 0.14 * k),
      free: () => chord([0, 7, 12], 0.05, "triangle", 0.05, 0.18),
      // Laser eyes, the Ooga way: a soft "ooo-GA!" (a low hoot sliding up, then down), then silly boings, up and down
      // by turns, through the beam's three seconds. Seven voices at most, as before, so other cues are not cut off.
      laser: (k = 1) => {
        blip("triangle", 170, 250, 0.02, 0.12, 0.06, 0.13 * k);
        blip("triangle", 300, 160, 0.01, 0.1, 0.14, 0.13 * k, 0.2);
        for (let i = 0; i < 5; i++) blip("sine", i % 2 ? 520 : 300, i % 2 ? 300 : 520, 0.01, 0.1, 0.12, 0.06 * k, 0.55 + i * 0.5);
      },
      // A ghost: a wavering whoo, falling; a pop when it's painted away.
      boo: (k = 1) => { for (let i = 0; i < 3; i++) blip("sine", 620 - i * 60, 240, 0.08, 0.25, 0.4, 0.14 * k, i * 0.12); },
      ghostPop: (k = 1) => { blip("triangle", 900, 1800, 0.005, 0.04, 0.15, 0.14 * k); splatNoise(0.3 * k, 0.2); },
      // The grappling hook (Cloud Hopper's sounds, re-voiced on the game's pooled blips): a whoosh as it goes, a thunk as
      // it bites, a zip as it lets go, a falling whoosh for a miss.
      hookThrow: (k = 1) => { blip("triangle", 500, 2600, 0.01, 0.1, 0.17, 0.12 * k); },
      hookBite: (k = 1) => { blip("sine", 140, 60, 0.01, 0.1, 0.2, 0.28 * k); splatNoise(0.15 * k, 0.12); },
      hookOff: (k = 1) => { blip("triangle", 900, 1500, 0.01, 0.04, 0.08, 0.1 * k); },
      hookMiss: (k = 1) => { blip("triangle", 2200, 300, 0.02, 0.25, 0.4, 0.1 * k); }
    };
    // The held layers follow `state` each frame: rain from the weather (0 to 1), the whir from the zipline.
    const update = () => {
      if (!ready) return;
      const now = ctx.currentTime;
      layers.rain.gain.setTargetAtTime(clamp(state.rain, 0, 1) * 0.05, now, 0.4);
      layers.zip.gain.setTargetAtTime(clamp(state.zip, 0, 1) * 0.12, now, 0.08);
      layers.jet.gain.setTargetAtTime(clamp(state.jet, 0, 1) * 0.22, now, 0.05);
      layers.zipFilter.frequency.setTargetAtTime(700 + clamp(state.zip, 0, 1) * 900, now, 0.1);
    };
    const quiet = () => {
      if (!ready) return;
      const now = ctx.currentTime;
      for (const k of ["rain", "zip", "jet", "splat", "boom"]) {
        layers[k].gain.cancelScheduledValues(now);
        layers[k].gain.setTargetAtTime(0, now, 0.05);
      }
    };
    const setMuted = (on) => {
      muted = !!on;
      if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05);
      BL.sound.setMuted(muted);
    };
    const offSound = BL.sound.subscribe(setMuted);
    const dispose = () => {
      offSound();
      if (!ctx) return;
      quiet();
      ctx.close();
      ctx = master = null;
      voices.length = 0;
      ready = false;
    };
    return {
      state, cues, unlock, update, quiet, setMuted, dispose,
      get muted() {
        return muted;
      },
      get ready() {
        return ready;
      }
    };
  };
  BL.blockAudio = { create, VOICES };
})();
