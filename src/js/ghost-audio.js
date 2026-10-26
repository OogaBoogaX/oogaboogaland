// HALLOWEEN: the ghost hunt's sound, ported from OBL-Audio-lab's sfx.js and wave.js. Synthesized cues on a pool of
// voices built once (an oscillator with its filter, gain and a wobble, and a filtered slice of one looping noise), so a
// cue only schedules automation, as the island's other sound does; and the lab's recordings (ghost-audio-data.js)
// decoded once into buffers, one source a play, with the hunt's playlist (the lab's boss music and four tracks, each
// its own deferred `halloween-track-<key>` group fetched as it comes up) decoded a track at a time. One AudioContext, opened only after a gesture
// the browser has activated; the page-wide mute (`oogaboogaland.audio`);
// suspended while the tab is hidden; `dispose` closes it.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const MASTER = 0.35, LEVEL = 0.5, VOICES = 16, STORAGE_KEY = "oogaboogaland.audio", MUSIC_KEY = "ooga-ghost-music";
  // The hunt's playlist: each track's title, who made it and its key; its bytes come in its own deferred group,
  // `halloween-track-<key>`, fetched only as it comes up. Played in a shuffled order from a hunt's start.
  const TRACKS = [
    { key: "boss", title: "The Boss", by: "OBL Audio Lab" },
    { key: "colt", title: "Instagram", by: "Colt Fingaz" },
    { key: "martial", title: "Martial Arts Action", by: "Luis Humanoide" },
    { key: "nightmare", title: "Nightmare Pulse", by: "Pixabay" },
    { key: "synthed", title: "Synthed Halloween", by: "LunarBoomMusic" }
  ];
  const bytesOf = (k) => BL.ghostMusic && BL.ghostMusic[TRACKS[k].key];
  // Asks for a track's group; a failed fetch is forgotten, so the next ask tries again.
  const fetchTrack = (k) => {
    if (bytesOf(k)) return null;
    const loading = BL.deferred.load(`halloween-track-${TRACKS[k].key}`);
    if (loading) loading.catch(() => {});
    return loading;
  };
  const CLIPS = ["wave", "kaboom", "screech", "freeze", "apples", "double", "banana", "ooga", "landing", "network", "fiatRush", "tessZap", "tessScream", "monkeyGet", "choir", "gameOver"];

  const decode = (ctx, base64) => {
    const raw = atob(base64), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return ctx.decodeAudioData(bytes.buffer);
  };

  const create = () => {
    let ctx = null, master = null, noise = null, voices = null, next = 0, muted = false, music = null, musicWanted = false, musicGain = null;
    const clips = {};
    // The playlist's order, where in it we are, the one decoded track it holds at a time (a decoded track is tens of
    // megabytes) and whether the visitor wants music at all (this browser's choice, the mini player's toggle).
    const order = TRACKS.map((_, i) => i);
    let place = 0, loaded = -1, loading = -1, song = null, musicOn = true;
    try {
      musicOn = localStorage.getItem(MUSIC_KEY) !== "off";
    } catch {
      musicOn = true;
    }
    try {
      muted = localStorage.getItem(STORAGE_KEY) === "off";
    } catch {
      muted = false;
    }

    const open = () => {
      if (ctx) return true;
      if (muted || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = MASTER;
      master.connect(ctx.destination);
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      voices = [];
      for (let i = 0; i < VOICES; i++) {
        const osc = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
        const lfo = ctx.createOscillator(), wobble = ctx.createGain(), sweep = ctx.createGain();
        const band = ctx.createBiquadFilter(), hiss = ctx.createGain();
        gain.gain.value = hiss.gain.value = wobble.gain.value = sweep.gain.value = 0;
        osc.connect(filter); filter.connect(gain); gain.connect(master);
        lfo.connect(wobble); wobble.connect(osc.frequency);
        lfo.connect(sweep); sweep.connect(filter.frequency);
        noise.connect(band); band.connect(hiss); hiss.connect(master);
        osc.start(); lfo.start();
        voices.push({ osc, filter, gain, lfo, wobble, sweep, band, hiss });
      }
      noise.start();
      const data_ = BL.ghostAudioData;
      for (const name of CLIPS) decode(ctx, data_[name]).then((b) => { clips[name] = b; }, () => {});
      return true;
    };
    const live = () => {
      if (!ctx && !open()) return false;
      if (ctx.state === "suspended" && !document.hidden) ctx.resume().catch(() => {});
      return true;
    };
    const voice = () => {
      const v = voices[next];
      next = (next + 1) % VOICES;
      const t = ctx.currentTime;
      for (const p of [v.gain.gain, v.hiss.gain, v.osc.frequency, v.filter.frequency, v.band.frequency, v.wobble.gain, v.sweep.gain, v.osc.detune]) {
        p.cancelScheduledValues(t);
      }
      v.gain.gain.setValueAtTime(0, t); v.hiss.gain.setValueAtTime(0, t);
      v.wobble.gain.setValueAtTime(0, t); v.sweep.gain.setValueAtTime(0, t); v.osc.detune.setValueAtTime(0, t);
      return v;
    };
    // A tone on a voice: `type`, a sweep f0 -> f1 over `sweep` seconds, through `filter` at `cut` (Q `q`), an envelope
    // up to `peak` in `attack` then down by `dur`.
    const tone = (v, at, type, f0, f1, sweep, peak, attack, dur, filter = "lowpass", cut = 20000, q = 0.7) => {
      v.osc.type = type;
      v.osc.frequency.setValueAtTime(f0, at);
      if (f1 !== f0) v.osc.frequency.exponentialRampToValueAtTime(f1, at + sweep);
      v.filter.type = filter;
      v.filter.frequency.setValueAtTime(cut, at);
      v.filter.Q.setValueAtTime(q, at);
      const g = v.gain.gain;
      g.setValueAtTime(0.0001, at);
      g.exponentialRampToValueAtTime(peak * LEVEL, at + attack);
      g.exponentialRampToValueAtTime(0.0001, at + dur);
      g.setValueAtTime(0, at + dur + 0.01);
    };
    // A burst of noise on a voice, through a band sweeping f0 -> f1 (the lab's `burst`).
    const burst = (v, at, dur, f0, f1, q, peak) => {
      v.band.type = "bandpass";
      v.band.Q.setValueAtTime(q, at);
      v.band.frequency.setValueAtTime(f0, at);
      v.band.frequency.exponentialRampToValueAtTime(f1, at + dur);
      const g = v.hiss.gain;
      g.setValueAtTime(0.0001, at);
      g.exponentialRampToValueAtTime(peak * LEVEL, at + dur * 0.25);
      g.exponentialRampToValueAtTime(0.0001, at + dur);
      g.setValueAtTime(0, at + dur + 0.01);
    };
    const clip = (name, level = 1.6, delay = 0) => {
      const buffer = clips[name];
      if (!buffer) return null;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buffer;
      g.gain.value = Math.min(1, level * LEVEL);
      src.connect(g); g.connect(master);
      src.start(ctx.currentTime + delay);
      return src;
    };

    const cues = {
      // A banana leaves the rifle: a muted gunshot, a short dull crack of noise through a low-pass over a low thump.
      shot: () => {
        const t = ctx.currentTime, v = voice();
        v.band.type = "lowpass";
        v.band.Q.setValueAtTime(0.7, t);
        v.band.frequency.setValueAtTime(1800, t);
        v.band.frequency.exponentialRampToValueAtTime(260, t + 0.12);
        v.hiss.gain.setValueAtTime(0.0001, t);
        v.hiss.gain.exponentialRampToValueAtTime(1.6 * LEVEL, t + 0.003);
        v.hiss.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        v.hiss.gain.setValueAtTime(0, t + 0.15);
        tone(v, t, "sine", 150, 55, 0.09, 1.3, 0.002, 0.13);
      },
      // A gorilla is called down: a rising hum as its green beam reaches the ground.
      arrive: () => {
        const t = ctx.currentTime, v = voice();
        tone(v, t, "sawtooth", 90, 360, 1.2, 0.3, 0.3, 1.3, "lowpass", 900);
        burst(v, t, 1.2, 300, 2400, 1.5, 0.6);
      },
      // A gorilla lands, or slams someone down: a heavy boom with grit.
      slam: () => {
        const t = ctx.currentTime, v = voice(), w = voice();
        tone(v, t, "sine", 95, 28, 0.4, 2.6, 0.006, 0.6);
        burst(v, t, 0.35, 1300, 120, 0.6, 2.8);
        burst(w, t + 0.03, 0.8, 260, 50, 0.4, 1.4);
      },
      // Thunder after a strike, `delay` seconds later: a crack, then a long low roll.
      thunder: (delay = 0.4) => {
        const t = ctx.currentTime + delay, v = voice(), w = voice();
        burst(v, t, 0.35, 3200, 700, 0.8, 1.6);
        burst(w, t + 0.08, 2.6, 520, 60, 0.45, 2.4);
        tone(w, t + 0.05, "sine", 55, 30, 2.4, 0.9, 0.15, 2.6);
      },
      // An elixir taken from a totem: a choir (`choir`, see ghost-audio-data.js).
      elixir: () => clip("choir", 1.3),
      // A player goes down: "Game over, man!" (`gameOver`, see ghost-audio-data.js).
      down: () => clip("gameOver", 1.6),
      // An elixir spent bringing someone back: the same choir, a fifth louder.
      revived: () => clip("choir", 1.3 * 1.2),
      // A skeleton lunges and bites: breath rushing up as it rises, then its teeth snapping shut twice, bright clacks of
      // bone on bone, over a dry crunch.
      bite: () => {
        const t = ctx.currentTime, a = voice(), b = voice(), c = voice();
        burst(a, t, 0.22, 900, 3200, 1.2, 0.7);
        burst(b, t + 0.2, 0.05, 4200, 2600, 3, 2.2);
        tone(b, t + 0.2, "square", 1800, 700, 0.03, 0.35, 0.002, 0.05, "bandpass", 2400, 2);
        burst(c, t + 0.27, 0.06, 3600, 2000, 3, 2.4);
        tone(c, t + 0.27, "triangle", 160, 60, 0.08, 1.2, 0.003, 0.12);
      },
      // A spider spits: a wet hiss rising through a band, a click of its fangs at the front of it.
      spit: () => {
        const t = ctx.currentTime, a = voice(), b = voice();
        burst(a, t, 0.3, 700, 4200, 2, 1.1);
        tone(b, t, "square", 320, 900, 0.07, 0.22, 0.004, 0.09, "bandpass", 1300, 3);
      },
      // A giant spider bursts into its brood: a piercing, wavering shriek in two voices a third apart, rising and
      // breaking, with a tearing hiss under it and a wet burst as its body splits.
      brood: () => {
        const t = ctx.currentTime;
        for (let k = 0; k < 2; k++) {
          const v = voice(), at = t + k * 0.05, f = k ? 1.26 : 1;
          v.osc.type = "sawtooth";
          v.osc.frequency.setValueAtTime(1100 * f, at);
          v.osc.frequency.exponentialRampToValueAtTime(3200 * f, at + 0.18);
          v.osc.frequency.setValueAtTime(3000 * f, at + 0.5);
          v.osc.frequency.exponentialRampToValueAtTime(1500 * f, at + 1.0);
          v.lfo.frequency.setValueAtTime(34 + k * 7, at);
          v.wobble.gain.setValueAtTime(260 * f, at);
          v.filter.type = "bandpass";
          v.filter.frequency.setValueAtTime(2600 * f, at);
          v.filter.Q.setValueAtTime(1.6, at);
          const g = v.gain.gain;
          g.setValueAtTime(0.0001, at);
          g.exponentialRampToValueAtTime(0.4 * LEVEL, at + 0.04);
          g.setValueAtTime(0.4 * LEVEL, at + 0.7);
          g.exponentialRampToValueAtTime(0.0001, at + 1.05);
          g.setValueAtTime(0, at + 1.06);
          burst(v, at + 0.02, 0.9, 2200, 6400, 1.4, 0.45);
        }
        const w = voice();
        burst(w, t, 0.2, 1600, 300, 1, 1.4);
        tone(w, t, "triangle", 130, 45, 0.18, 1, 0.004, 0.25);
      },
      // A giant spider lands: "Fiat Rush!" in a woman's voice (`fiatRush`, see ghost-audio-data.js).
      fiatRush: () => clip("fiatRush", 2),
      // Its venom lands: a wet splat with a low thud under it, and a fizz as it eats at the ground.
      splat: () => {
        const t = ctx.currentTime, a = voice(), b = voice();
        burst(a, t, 0.14, 1900, 380, 1.2, 1.5);
        tone(a, t, "triangle", 150, 55, 0.1, 0.9, 0.003, 0.15);
        burst(b, t + 0.06, 0.7, 5200, 7600, 4, 0.45);
      },
      // The monkeys join you: a children's Spanish lesson saying "monkey" (`monkeyGet`, see ghost-audio-data.js).
      monkeys: () => clip("monkeyGet", 1.6),
      // A hit takes the monkeys away, the lab's shriek: a squeal that leaps up and breaks, with a rough edge (a saw
      // with fast vibrato through a band-pass, a little noise under it).
      shriek: () => {
        const t = ctx.currentTime, v = voice();
        v.osc.type = "sawtooth";
        v.osc.frequency.setValueAtTime(700, t);
        v.osc.frequency.exponentialRampToValueAtTime(1900, t + 0.12);
        v.osc.frequency.setValueAtTime(1900, t + 0.3);
        v.osc.frequency.exponentialRampToValueAtTime(900, t + 0.55);
        v.lfo.frequency.setValueAtTime(28, t);
        v.wobble.gain.setValueAtTime(120, t);
        v.filter.type = "bandpass";
        v.filter.frequency.setValueAtTime(1600, t);
        v.filter.Q.setValueAtTime(1.2, t);
        const g = v.gain.gain;
        g.setValueAtTime(0.0001, t);
        g.exponentialRampToValueAtTime(0.45 * LEVEL, t + 0.03);
        g.setValueAtTime(0.45 * LEVEL, t + 0.4);
        g.exponentialRampToValueAtTime(0.0001, t + 0.6);
        g.setValueAtTime(0, t + 0.61);
        burst(v, t + 0.02, 0.5, 1200, 3500, 1.2, 0.5);
      },
      // A bolt of the lightning drop strikes an enemy: a white-hot crack right overhead, its sizzle, and the boom under it.
      strike: () => {
        const t = ctx.currentTime, v = voice(), w = voice(), x = voice();
        v.band.type = "highpass";
        v.band.Q.setValueAtTime(0.7, t);
        v.band.frequency.setValueAtTime(2400, t);
        v.hiss.gain.setValueAtTime(0.0001, t);
        v.hiss.gain.exponentialRampToValueAtTime(2.4 * LEVEL, t + 0.002);
        v.hiss.gain.exponentialRampToValueAtTime(0.5 * LEVEL, t + 0.05);
        v.hiss.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        v.hiss.gain.setValueAtTime(0, t + 0.51);
        tone(w, t, "sawtooth", 1800, 120, 0.3, 0.3, 0.002, 0.45, "bandpass", 2600, 1.5);
        w.lfo.frequency.setValueAtTime(55, t);
        w.wobble.gain.setValueAtTime(400, t);
        burst(x, t + 0.03, 1.4, 600, 50, 0.5, 2);
        tone(x, t + 0.02, "sine", 80, 32, 1, 1.1, 0.01, 1.2);
      },
      // The lightning drop appears over the pile: "Lightning Network!", over a rising electric hum.
      network: () => {
        tone(voice(), ctx.currentTime, "sawtooth", 110, 440, 0.9, 0.12, 0.2, 1.1, "lowpass", 1400);
        clip("network", 2);
      },
      // Tess zaps a ghost: a bright crack of a laser and a rising whine.
      zap: () => {
        const t = ctx.currentTime, v = voice(), w = voice();
        tone(v, t, "square", 2200, 300, 0.16, 0.35, 0.004, 0.2, "lowpass", 5000);
        burst(v, t, 0.12, 4000, 1500, 1.2, 0.8);
        tone(w, t, "sine", 900, 2600, 0.25, 0.18, 0.01, 0.3);
      },
      // Tess comes to your side: a bright rising chime, and her line.
      tess: () => {
        const t = ctx.currentTime;
        [659.25, 987.77, 1318.5, 1975.5].forEach((f, i) => tone(voice(), t + i * 0.07, "sine", f, f, 0.4, 0.4, 0.005, 0.45));
        clip("tessZap", 2, 0.3);
      },
      // A ghost got Tess's player and she flies off: her scream.
      tessGone: () => clip("tessScream", 2),
      // A ghost is hit: a wet thump, a low drop and a splat of noise.
      hit: () => { const v = voice(), t = ctx.currentTime; tone(v, t, "sine", 260, 70, 0.16, 1.2, 0.01, 0.18); burst(v, t, 0.09, 1500, 500, 0.7, 1.5); },
      // A ghost got you: a buzzy downward blip.
      hurt: () => tone(voice(), ctx.currentTime, "square", 420, 110, 0.22, 0.5, 0.01, 0.24, "lowpass", 1400),
      // Something lands hard: a wall rising, a drop coming down.
      thump: () => {
        const t = ctx.currentTime, v = voice(), w = voice();
        tone(v, t, "sine", 120, 32, 0.35, 2.2, 0.012, 0.5);
        burst(v, t, 0.22, 1400, 180, 0.6, 2.2);
        burst(w, t + 0.04, 0.6, 300, 60, 0.4, 1.1);
      },
      // The land quaking as the walls come up: a deep boom, a long sub-bass roar that shudders, and rock grinding over it.
      rumble: (dur = 3.2) => {
        const t = ctx.currentTime, v = voice(), w = voice(), x = voice(), y = voice();
        tone(x, t, "sine", 62, 24, 0.6, 2.4, 0.015, 0.9);
        burst(x, t, 0.5, 220, 40, 0.5, 3.5);
        tone(v, t, "sine", 33, 21, dur, 2.2, 0.5, dur);
        v.lfo.frequency.setValueAtTime(5.5, t);
        v.wobble.gain.setValueAtTime(3, t);
        burst(v, t + 0.1, dur, 95, 30, 0.35, 4.2);
        tone(w, t + 0.05, "triangle", 46, 26, dur * 0.9, 1.1, 0.3, dur * 0.95, "lowpass", 160);
        w.lfo.frequency.setValueAtTime(7.5, t);
        w.wobble.gain.setValueAtTime(4, t);
        burst(w, t + 0.15, dur * 0.85, 380, 80, 0.6, 1.2);
        burst(y, t + 0.3, dur * 0.7, 700, 160, 0.9, 0.5);
      },
      // Something falling out of the sky: a rushing roar and a thin whistle over it.
      fall: (dur = 0.85) => {
        const t = ctx.currentTime, v = voice();
        v.band.type = "bandpass";
        v.band.Q.setValueAtTime(1.1, t);
        v.band.frequency.setValueAtTime(220, t);
        v.band.frequency.exponentialRampToValueAtTime(1800, t + dur);
        v.hiss.gain.setValueAtTime(0.0001, t);
        v.hiss.gain.exponentialRampToValueAtTime(2.2 * LEVEL, t + dur * 0.85);
        v.hiss.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        tone(v, t, "sine", 320, 1500, dur, 0.35, dur * 0.8, dur);
      },
      // The boss spits: a mortar's thump, its muzzle whoosh and a rising whistle.
      launch: () => {
        const t = ctx.currentTime, v = voice(), w = voice();
        tone(v, t, "sine", 140, 50, 0.15, 1.3, 0.01, 0.22);
        burst(v, t + 0.02, 0.12, 400, 1200, 0.6, 2.5);
        tone(w, t + 0.1, "sine", 900, 2400, 0.6, 0.18, 0.1, 0.65);
      },
      // Ghosts burning, the herald's cackle: a wail of three detuned saws with vibrato through a band.
      scream: (level = 1) => {
        const t = ctx.currentTime;
        for (let i = 0; i < 3; i++) {
          const v = voice(), at = t + i * 0.04;
          v.osc.type = "sawtooth";
          v.osc.detune.setValueAtTime([0, 70, -50][i], at);
          v.osc.frequency.setValueAtTime(420 + i * 30, at);
          v.osc.frequency.exponentialRampToValueAtTime(1050 + i * 60, t + 0.35);
          v.osc.frequency.exponentialRampToValueAtTime(330, t + 1.4);
          v.lfo.frequency.setValueAtTime(6.5, at);
          v.wobble.gain.setValueAtTime(45, at);
          v.filter.type = "bandpass";
          v.filter.frequency.setValueAtTime(1400, at);
          v.filter.Q.setValueAtTime(1.4, at);
          const g = v.gain.gain;
          g.setValueAtTime(0.0001, at);
          g.exponentialRampToValueAtTime(0.33 * level * LEVEL, t + 0.12 + i * 0.04);
          g.setValueAtTime(0.33 * level * LEVEL, t + 0.9);
          g.exponentialRampToValueAtTime(0.0001, t + 1.5);
          g.setValueAtTime(0, t + 1.52);
        }
      },
      // A general's eye beam, `ms` long: a charge as the eyes wind up, a zap as it connects, an electric hum.
      laser: (ms) => {
        const t = ctx.currentTime, wind = BL.ghostSim.CONFIG.BEAM.windMs / 1000, end = t + Math.max(wind + 0.2, ms / 1000);
        tone(voice(), t, "sine", 300, 1100, wind, 0.25, wind * 0.9, wind + 0.05);
        tone(voice(), t + wind, "square", 1900, 260, 0.14, 0.3, 0.01, 0.16);
        for (const f of [110, 111.7]) {
          const v = voice();
          v.osc.type = "sawtooth";
          v.osc.frequency.setValueAtTime(f, t);
          v.filter.type = "bandpass";
          v.filter.frequency.setValueAtTime(900, t);
          v.filter.Q.setValueAtTime(3, t);
          v.lfo.frequency.setValueAtTime(12, t);
          v.sweep.gain.setValueAtTime(350, t);
          const g = v.gain.gain;
          g.setValueAtTime(0.0001, t + wind);
          g.exponentialRampToValueAtTime(0.35 * LEVEL, t + wind + 0.05);
          g.setValueAtTime(0.35 * LEVEL, end - 0.15);
          g.exponentialRampToValueAtTime(0.0001, end);
          g.setValueAtTime(0, end + 0.01);
        }
      },
      // A wraith's soul pull: the lab's screech.
      screech: () => clip("screech", 0.68),
      // The bomb: the kaboom clip, then the ghosts' wail.
      boom: () => { clip("kaboom"); window.setTimeout(() => { if (ctx) cues.scream(1); }, 250); },
      // The shield: a blade drawn, steel ringing, and the shout.
      shield: () => {
        const t = ctx.currentTime, v = voice();
        burst(v, t, 0.32, 5200, 2200, 7, 3.2);
        let i = 0;
        for (const [f, peak, dur] of [[2480, 0.3, 0.9], [3720, 0.18, 0.7], [5160, 0.1, 0.5]]) tone(i++ ? voice() : v, t, "sine", f, f * 0.985, dur, peak, 0.02, dur);
        clip("apples", 1.6, 0.22);
      },
      // The ice shard: a glassy shimmer under the shout.
      ice: () => {
        const t = ctx.currentTime, v = voice();
        burst(v, t, 0.5, 3000, 7000, 2.5, 1.2);
        tone(v, t, "triangle", 1800, 2600, 0.4, 0.25, 0.03, 0.6);
        clip("freeze");
      },
      // The health banana: three rising marimba notes, then the shout.
      health: () => {
        const t = ctx.currentTime;
        [523.25, 659.25, 783.99].forEach((f, i) => tone(voice(), t + i * 0.11, "sine", f, f, 0.5, 0.55 + 0.1 * i, 0.006, 0.55));
        clip("banana", 1.6, 0.32);
      },
      // Double points: a beam of power sweeping up, a sparkle, then the announcer, all at `k` (30% under the others).
      double: () => {
        const t = ctx.currentTime, v = voice(), k = 0.7;
        tone(v, t, "sawtooth", 180, 1400, 0.55, 0.35 * k, 0.08, 0.7, "lowpass", 400, 8);
        v.filter.frequency.exponentialRampToValueAtTime(6000, t + 0.55);
        burst(v, t, 0.6, 500, 5000, 1.5, 0.6 * k);
        [880, 1109, 1319, 1760].forEach((f, i) => tone(voice(), t + 0.45 + i * 0.06, "sine", f, f, 0.3, 0.3 * k, 0.01, 0.3));
        clip("double", 1.6 * k, 0.65);
      },
      // A gorilla hits the ground: the "oogaa" from the lab's landing page.
      oogaa: () => clip("landing", 1.6),
      // The herald's squeaky "ooga!".
      ooga: () => clip("ooga"),
      // A round's countdown: the lab's wave cue.
      wave: () => clip("wave", 1)
    };

    /** Plays a cue by name; nothing while muted, before a gesture, or for a clip still decoding. */
    const play = (name, a) => {
      if (muted || !live()) return;
      cues[name](a);
    };
    // The track now playing (or about to), from the shuffled order.
    const current = () => order[place % order.length];
    const stopMusic = () => {
      if (music) { music.onended = null; try { music.stop(); } catch { /* already stopped */ } }
      music = null;
    };
    // Plays the current track once its bytes are here and decoded, then moves on to the next when it ends.
    const startMusic = () => {
      if (music || !ctx || !musicWanted || !musicOn) return;
      const k = current();
      if (loaded !== k) {
        const bytes = bytesOf(k);
        if (!bytes) { const fetching = fetchTrack(k); if (fetching) fetching.then(startMusic, () => {}); return; }
        if (loading === k) return;
        loading = k;
        song = null; loaded = -1;
        decode(ctx, bytes).then((b) => { if (loading !== k) return; song = b; loaded = k; loading = -1; startMusic(); }, () => { loading = -1; place++; });
        return;
      }
      if (!musicGain) { musicGain = ctx.createGain(); musicGain.gain.value = 0.7; musicGain.connect(master); }
      music = ctx.createBufferSource();
      music.buffer = song;
      music.connect(musicGain);
      music.onended = () => { music = null; advance(); startMusic(); };
      music.start();
      // The next track's bytes are fetched while this one plays, so it can follow without a wait.
      fetchTrack(order[(place + 1) % order.length]);
    };
    // On to the next track, a new order once the list has been through (never opening on the one just heard).
    const advance = () => {
      place++;
      if (place % order.length === 0) shuffle(order[order.length - 1]);
    };
    // A fresh order, never opening on `last` (the track just heard) when there is a choice.
    const shuffle = (last = -1) => {
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; }
      if (order.length > 1 && order[0] === last) { const t = order[0]; order[0] = order[1]; order[1] = t; }
      place = 0;
    };
    /** The hunt's music on or off, asked every frame; it starts once its group has arrived and the track has decoded. */
    const setMusic = (on) => {
      if (on !== musicWanted) {
        musicWanted = on;
        if (!on) { stopMusic(); return; }
      }
      if (!on || music || loading >= 0 || !musicOn || muted || !live()) return;
      startMusic();
    };
    /** The mini player's skip: on to the next track now (there is always a next with more than one). */
    const skip = () => {
      if (order.length < 2) return;
      stopMusic();
      loading = -1;
      advance();
      if (musicWanted && musicOn && !muted && live()) startMusic();
    };
    /** A hunt begins: the playlist in a new random order, from its top. */
    const newPlaylist = () => {
      stopMusic();
      shuffle();
    };
    /** The visitor's music switch (remembered in this browser): off stops it now, on plays from the track's top. */
    const toggleMusic = () => {
      musicOn = !musicOn;
      try { localStorage.setItem(MUSIC_KEY, musicOn ? "on" : "off"); } catch { /* not kept */ }
      if (!musicOn) stopMusic();
      else if (musicWanted && !muted && live()) startMusic();
      return musicOn;
    };
    /** Once a frame: rests the context while the tab is hidden. */
    const update = () => {
      if (!ctx) return;
      if (document.hidden && ctx.state === "running") ctx.suspend().catch(() => {});
      else if (!document.hidden && ctx.state === "suspended") ctx.resume().catch(() => {});
    };
    // The director stops the frame loop the moment the tab hides, so the context rests on the event itself, not a frame.
    document.addEventListener("visibilitychange", update);
    const dispose = () => {
      document.removeEventListener("visibilitychange", update);
      setMusic(false);
      if (ctx) ctx.close().catch(() => {});
      ctx = master = noise = voices = null;
    };
    return { open: () => !muted && live(), play, music: setMusic, newPlaylist, toggleMusic, skip, get tracks() { return order.length; }, get musicOn() { return musicOn; },
      get nowPlaying() { return TRACKS[current()]; }, update, dispose, get opened() { return !!ctx; } };
  };

  BL.ghostAudio = { create };
})();
