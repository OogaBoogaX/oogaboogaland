// The Lightning Factory's sound, on Ooga Mine's pattern: one AudioContext opened from a gesture the browser has
// already activated, fixed pools of pre-started voices gated by gain and panned, and one noise loop behind every
// hiss. A cue only schedules automation on a pooled voice: nothing is allocated per cue and nothing is restarted.
//
// The hall's bed is a factory at work: the mains hum and the air's rumble everywhere and, louder as the visitor nears
// each, the core's thrum, the forge's fire breathing (an anvil ringing while it is hot), the rebalancer's whir, the
// cooker's churn, the shields' shimmer, a cart's rumble on its rails, the coin's roll and Kortik's board buzzing with
// its relays. `update(dt, room)` shapes it ten times a second from the hall's state, which the scene writes into
// `room` in place: the core's glow, a surge, a tip's lime, the forge's fire, the rebalancer's spin, the cooker's
// churn, and the cart and the coin on their lines (their positions, or null).
//
// Every event has a sound of its own, placed where it happens: `listen` says where the visitor hears from and which
// way the view faces, and `cue(name, x, y, z, loud, n)` plays a cue there, quieter with distance and panned to its
// side, `n` its note, its syllables or its kind. Kortik's cues fall off sooner, so his board comes up as the visitor
// walks up to it, and he speaks through a throat of his own. It honours the page-wide mute (`oogaboogaland.audio`)
// and the tab's visibility, and `dispose` closes it. `heard` counts every cue asked for, heard or not.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp } = BL.math;
  const TONES = 18, NOISES = 10, NOISE_SECONDS = 2, MASTER = 0.55, STORAGE_KEY = "oogaboogaland.audio";
  // At REF metres a cue is at half its level, a machine of the bed at BED_REF, and Kortik's board at NEAR_REF.
  const REF = 8, BED_REF = 9, NEAR_REF = 4.5, PAN = 0.75;
  // Each featured line's note as its sats arrive, struck like a soft mallet: a pentatonic run so a busy floor plays a
  // tune; the last is the galleries'.
  const NOTES = [523.25, 587.33, 659.26, 783.99, 392];
  // The treasury's ring as its crate fills.
  const KERCHING = [1568, 1975.5, 2349.3];
  // How loud the events sit under the bed; the bed's own anvil keeps its level.
  const EVENTS = 0.6;
  // Kortik's vowels, as their first two formants in hertz, a pair each.
  const VOWELS = [300, 780, 470, 900, 740, 1180, 600, 1100, 420, 1700];

  const create = (spots) => {
    let ctx = null, master = null, buffer = null, ready = false, muted = false, disposed = false;
    try {
      muted = localStorage.getItem(STORAGE_KEY) === "off";
    } catch {
      muted = false;
    }
    const tones = [], noises = [], bed = {};
    let toneNext = 0, noiseNext = 0, since = 0, clock = 0, anvilIn = 0, speed = 0;
    // Where the visitor hears from, the way the view faces on the ground, and where the last cue was placed.
    const ear = { x: 0, y: 0, z: 0, fx: 0, fz: -1 }, AT = { level: 0, pan: 0 };

    const gain = (value, to) => {
      const g = ctx.createGain();
      g.gain.value = value;
      if (to) g.connect(to);
      return g;
    };
    const filter = (type, freq, q, to) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      if (to) f.connect(to);
      return f;
    };
    const panner = () => {
      const p = ctx.createStereoPanner();
      p.connect(master);
      return p;
    };
    const osc = (type, freq, to) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.connect(to);
      o.start();
      return o;
    };
    const hissOf = (to) => {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.loop = true;
      s.connect(to);
      s.start(0, Math.random() * NOISE_SECONDS);
      return s;
    };
    // A wobble on `param` round its value: an oscillator at `hz` swinging it `depth` either way.
    const wobble = (param, hz, depth, type = "sine") => {
      const d = gain(depth, null);
      d.connect(param);
      return osc(type, hz, d);
    };

    const init = () => {
      ctx = new AudioContext();
      master = gain(muted ? 0 : MASTER, ctx.destination);
      buffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      for (let i = 0; i < TONES; i++) {
        const pan = panner(), g = gain(0, pan), f = filter("lowpass", 7000, 0.7, g);
        tones.push({ osc: osc("sine", 440, f), filter: f, gain: g, pan, until: 0 });
      }
      for (let i = 0; i < NOISES; i++) {
        const pan = panner(), g = gain(0, pan), f = filter("bandpass", 1000, 1, g);
        noises.push({ src: hissOf(f), filter: f, gain: g, pan, until: 0 });
      }
      // The mains hum, a low saw's lower harmonics so small speakers carry it, and the hall's air, breathing slowly.
      bed.mainsGain = gain(0, master);
      bed.mains = osc("sawtooth", 55, filter("lowpass", 300, 0.6, bed.mainsGain));
      bed.mains2 = osc("sine", 110, gain(0.35, bed.mainsGain));
      bed.rumbleGain = gain(0, master);
      bed.rumbleFilter = filter("lowpass", 240, 0.8, bed.rumbleGain);
      bed.rumble = hissOf(bed.rumbleFilter);
      bed.breath = wobble(bed.rumbleFilter.frequency, 0.31, 70);
      // The core's thrum, a fifth with a slow tremolo, and its fizz of electricity.
      bed.corePan = panner();
      bed.coreGain = gain(0, bed.corePan);
      const trem = gain(0.8, bed.coreGain);
      bed.coreLfo = wobble(trem.gain, 0.8, 0.2);
      bed.core = osc("sine", 82.4, trem);
      bed.core2 = osc("triangle", 123.5, gain(0.5, trem));
      bed.fizzGain = gain(0, bed.corePan);
      bed.fizz = hissOf(filter("bandpass", 3400, 5, bed.fizzGain));
      // The forge's fire, its roar and its crackle.
      bed.forgePan = panner();
      bed.forgeGain = gain(0, bed.forgePan);
      bed.forge = hissOf(filter("bandpass", 600, 0.7, bed.forgeGain));
      bed.crackGain = gain(0, bed.forgePan);
      bed.crack = hissOf(filter("highpass", 2400, 0.7, bed.crackGain));
      // The rebalancer's whir and the air it moves.
      bed.rebPan = panner();
      bed.rebGain = gain(0, bed.rebPan);
      bed.reb = osc("triangle", 60, filter("lowpass", 900, 0.7, bed.rebGain));
      bed.airGain = gain(0, bed.rebPan);
      bed.airFilter = filter("bandpass", 400, 1.4, bed.airGain);
      bed.air = hissOf(bed.airFilter);
      // The cooker's churn, chugging.
      bed.cookPan = panner();
      bed.cookGain = gain(0, bed.cookPan);
      const chug = gain(0.55, bed.cookGain);
      bed.chug = wobble(chug.gain, 4.4, 0.45);
      bed.cook = osc("sawtooth", 42, filter("lowpass", 300, 0.9, chug));
      // The shields' shimmer, two tones beating and a thin fizz.
      bed.shieldPan = panner();
      bed.shieldGain = gain(0, bed.shieldPan);
      bed.shield = osc("sine", 196, bed.shieldGain);
      bed.shield2 = osc("sine", 198.7, bed.shieldGain);
      bed.shieldFizz = gain(0, bed.shieldPan);
      bed.sparkle = hissOf(filter("bandpass", 5200, 8, bed.shieldFizz));
      // A cart on its rails, clattering, and the coin rolling.
      bed.cartPan = panner();
      bed.cartGain = gain(0, bed.cartPan);
      const rattle = gain(0.5, bed.cartGain);
      bed.rattle = wobble(rattle.gain, 13, 0.5, "square");
      bed.cart = hissOf(filter("lowpass", 320, 0.9, rattle));
      bed.coinPan = panner();
      bed.coinGain = gain(0, bed.coinPan);
      const roll = gain(0.5, bed.coinGain);
      bed.roll = wobble(roll.gain, 9, 0.5);
      bed.coin = osc("sine", 1450, roll);
      // Kortik's board: its mains buzz and its relays ticking.
      bed.boardPan = panner();
      bed.boardGain = gain(0, bed.boardPan);
      bed.board = osc("square", 120, filter("lowpass", 520, 0.7, bed.boardGain));
      bed.tickGain = gain(0, bed.boardPan);
      bed.tick = hissOf(filter("bandpass", 3000, 3, bed.tickGain));
      // Kortik's throat: a saw through two formants, a syllable at a time.
      const throatPan = panner(), throatGain = gain(0, throatPan), f1 = filter("bandpass", 600, 5, throatGain), f2 = filter("bandpass", 1100, 6, gain(0.6, throatGain));
      const voice = ctx.createOscillator();
      voice.type = "sawtooth";
      voice.frequency.value = 100;
      voice.connect(f1);
      voice.connect(f2);
      voice.start();
      bed.throat = { osc: voice, f1, f2, gain: throatGain, pan: throatPan };
      ready = true;
    };

    // Only from a gesture the browser has already counted, so nothing warns in the console; a gesture also wakes a
    // context the browser started suspended.
    const activate = () => {
      if (disposed) return;
      if (ready) {
        if (ctx.state === "suspended" && !document.hidden) ctx.resume().catch(() => {});
        return;
      }
      if (muted || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      init();
    };
    window.addEventListener("pointerdown", activate, true);
    window.addEventListener("keydown", activate, true);
    // A hidden tab stops the hall's loops and voices; showing it again picks them up.
    const onVisibility = () => {
      if (!ready) return;
      if (document.hidden) ctx.suspend().catch(() => {});
      else ctx.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Where (x, y, z) is from the visitor, into AT: its level, half at `ref` metres, and its side of the view.
    const place = (x, y, z, ref) => {
      const dx = x - ear.x, dy = y - ear.y, dz = z - ear.z, flat = Math.hypot(dx, dz), r = Math.hypot(flat, dy) / ref;
      AT.level = 1 / (1 + r * r);
      AT.pan = flat > 0.5 ? clamp((dx * -ear.fz + dz * ear.fx) / flat, -1, 1) * PAN * Math.min(1, flat / 3) : 0;
    };
    // The free voice that has waited longest from `next` on, or that one when none is free.
    const pick = (pool, next) => {
      const now = ctx.currentTime;
      for (let i = 0; i < pool.length; i++) {
        const v = pool[(next + i) % pool.length];
        if (v.until <= now) return v;
      }
      return pool[next % pool.length];
    };
    const toneVoice = () => pick(tones, toneNext = (toneNext + 1) % TONES);
    const noiseVoice = () => pick(noises, noiseNext = (noiseNext + 1) % NOISES);
    // A voice's gain from `t`: up to `level` over `attack` and away by `dur`, panned where the cue was placed.
    const env = (v, t, level, attack, dur) => {
      const g = v.gain.gain, now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(0.0001, now, 0.004);
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(Math.max(0.0002, level), t + attack);
      g.exponentialRampToValueAtTime(0.0001, t + dur);
      v.pan.pan.setValueAtTime(AT.pan, t);
      v.until = t + dur + 0.02;
    };
    const glide = (param, t, from, to, dur) => {
      param.cancelScheduledValues(ctx.currentTime);
      param.setValueAtTime(from, t);
      if (to !== from) param.exponentialRampToValueAtTime(to, t + dur);
    };
    // A tone `at` seconds ahead: a `type` wave gliding f0 to f1 over `dur`, through a low-pass going cut0 to cut1.
    const tone = (at, type, f0, f1, dur, level, cut0 = 7000, cut1 = cut0, attack = 0.006) => {
      const v = toneVoice(), t = ctx.currentTime + at;
      v.osc.type = type;
      glide(v.osc.frequency, t, f0, f1, dur);
      glide(v.filter.frequency, t, cut0, cut1, dur);
      env(v, t, level * AT.level, attack, dur);
    };
    // Noise through a `type` filter swept f0 to f1 (q its sharpness) over `dur`.
    const hiss = (at, type, f0, f1, q, dur, level, attack = 0.004) => {
      const v = noiseVoice(), t = ctx.currentTime + at;
      v.filter.type = type;
      v.filter.Q.setValueAtTime(q, t);
      glide(v.filter.frequency, t, f0, f1, dur);
      env(v, t, level * AT.level, attack, dur);
    };
    // `count` short hits `gap` apart on one voice, each `len` long, quieter down the run by `fade` (0 to 1); `jitter`
    // scatters their timing and loudness, for crackle and chatter. On a noise voice they are clicks through the filter
    // at `freq`; on a tone voice (`f1` given), knocks whose pitch drops `freq` to `f1`.
    const hits = (v, at, freq, f1, count, gap, len, level, fade, jitter) => {
      const g = v.gain.gain, now = ctx.currentTime, f = f1 > 0 ? v.osc.frequency : v.filter.frequency;
      let t = now + at;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(0.0001, now, 0.004);
      f.cancelScheduledValues(now);
      v.pan.pan.setValueAtTime(AT.pan, t);
      for (let i = 0; i < count; i++) {
        const k = level * AT.level * (1 - fade * i / count) * (1 - jitter * 0.6 * Math.random());
        f.setValueAtTime(freq, t);
        if (f1 > 0) f.exponentialRampToValueAtTime(f1, t + len);
        g.setValueAtTime(0.0001, t);
        g.exponentialRampToValueAtTime(Math.max(0.0002, k), t + 0.002);
        g.exponentialRampToValueAtTime(0.0001, t + len);
        t += Math.max(len + 0.004, gap * (1 + jitter * (Math.random() - 0.5)));
      }
      v.until = t + 0.02;
    };
    const clicks = (at, type, freq, q, count, gap, len, level, fade = 0, jitter = 0) => {
      const v = noiseVoice();
      v.filter.type = type;
      v.filter.Q.setValueAtTime(q, ctx.currentTime + at);
      hits(v, at, freq, 0, count, gap, len, level, fade, jitter);
    };
    const knocks = (at, type, f0, f1, count, gap, len, level, fade = 0, cut = 7000) => {
      const v = toneVoice();
      v.osc.type = type;
      glide(v.filter.frequency, ctx.currentTime + at, cut, cut, 0);
      hits(v, at, f0, f1, count, gap, len, level, fade, 0);
    };
    // A tone gliding f0 to f1 over `dur`, cut on and off `rate` times a second: a buzzer, a sputter, a grind.
    const stutter = (at, type, f0, f1, dur, rate, level, cut = 2000) => {
      const v = toneVoice(), now = ctx.currentTime, g = v.gain.gain, t0 = now + at, k = level * AT.level;
      v.osc.type = type;
      glide(v.osc.frequency, t0, f0, f1, dur);
      glide(v.filter.frequency, t0, cut, cut, 0);
      g.cancelScheduledValues(now);
      g.setTargetAtTime(0.0001, now, 0.004);
      v.pan.pan.setValueAtTime(AT.pan, t0);
      for (let t = t0; t < t0 + dur; t += 1 / rate) {
        g.setValueAtTime(Math.max(0.0002, k * (1 - 0.5 * (t - t0) / dur)), t);
        g.setValueAtTime(0.0001, t + 0.5 / rate);
      }
      v.until = t0 + dur + 0.02;
    };
    // A struck bell: its note and an inharmonic partial that dies sooner.
    const bell = (at, f, dur, level) => {
      tone(at, "sine", f, f, dur, level);
      tone(at, "sine", f * 2.76, f * 2.76, dur * 0.45, level * 0.4);
    };
    // Kortik's babble: `count` syllables, each its own pitch and vowel, gruff or, shouting, high and hard.
    const speak = (count, shout) => {
      const th = bed.throat, now = ctx.currentTime, g = th.gain.gain, f = th.osc.frequency;
      const base = shout ? 165 : 98, len = shout ? 0.13 : 0.11, level = Math.max(0.0002, (shout ? 0.34 : 0.22) * AT.level);
      g.cancelScheduledValues(now);
      g.setTargetAtTime(0.0001, now, 0.01);
      f.cancelScheduledValues(now);
      th.f1.frequency.cancelScheduledValues(now);
      th.f2.frequency.cancelScheduledValues(now);
      th.pan.pan.setValueAtTime(AT.pan, now);
      let t = now + 0.03;
      for (let i = 0; i < count; i++) {
        const p = base * (0.88 + Math.random() * 0.3), v = Math.floor(Math.random() * 5) * 2;
        f.setValueAtTime(p, t);
        f.exponentialRampToValueAtTime(p * (shout ? 1.12 : 0.88), t + len);
        th.f1.frequency.setValueAtTime(VOWELS[v], t);
        th.f2.frequency.setValueAtTime(VOWELS[v + 1], t);
        g.setValueAtTime(0.0001, t);
        g.exponentialRampToValueAtTime(level, t + 0.025);
        g.exponentialRampToValueAtTime(0.0001, t + len);
        t += len + 0.025 + Math.random() * 0.05;
      }
    };

    // Each cue: how far it carries (its REF), the least it is heard at anywhere in the hall, and what it plays.
    const CUES = {
      // The node: powering up from dark, coming ready, and powering down, heard across the hall.
      start: [REF, 0.45, () => {
        tone(0, "triangle", 40, 260, 2.6, 0.12, 180, 1200, 0.6);
        tone(0, "sine", 20, 130, 2.6, 0.08, 7000, 7000, 0.6);
        knocks(0, "square", 160, 70, 2, 0.4, 0.1, 0.12, 0, 700);
      }],
      ready: [REF, 0.45, () => {
        tone(0, "sine", 110, 110, 2.2, 0.16, 7000, 7000, 0.3);
        tone(0, "sine", 165, 165, 2, 0.1, 7000, 7000, 0.35);
        tone(0, "triangle", 220, 220, 1.8, 0.06, 2000, 2000, 0.4);
        bell(0.1, 880, 1.8, 0.12);
      }],
      stop: [REF, 0.45, () => {
        tone(0, "triangle", 260, 28, 2.4, 0.12, 1200, 120, 0.05);
        knocks(0, "square", 120, 45, 1, 0.1, 0.22, 0.18, 0, 500);
        hiss(0.1, "lowpass", 2400, 120, 0.7, 1.8, 0.1, 0.05);
      }],
      // The lookout hearing a peer come or go: a ping up, or down.
      peerUp: [REF, 0.08, () => { tone(0, "sine", 659.26, 659.26, 0.5, 0.05); tone(0.18, "sine", 783.99, 783.99, 0.8, 0.05); }],
      peerDown: [REF, 0.08, () => { tone(0, "sine", 783.99, 783.99, 0.5, 0.05); tone(0.18, "sine", 659.26, 659.26, 0.8, 0.05); }],
      // A line: built with a ratchet and a chirp, switched on with a relay and a rising call, taken down winding
      // down, and switched off with a breaker's thunk.
      opening: [REF, 0, () => {
        clicks(0, "bandpass", 2000, 2, 9, 0.045, 0.018, 0.12, 0, 0.3);
        clicks(0.5, "bandpass", 2000, 2, 9, 0.045, 0.018, 0.12, 0, 0.3);
        tone(0.95, "sine", 392, 523.25, 0.4, 0.05);
      }],
      active: [REF, 0, () => {
        clicks(0, "bandpass", 1400, 1, 1, 0.1, 0.035, 0.16);
        tone(0.04, "sine", 523.25, 523.25, 0.5, 0.06);
        tone(0.2, "sine", 783.99, 783.99, 1, 0.06);
      }],
      closing: [REF, 0, () => {
        tone(0, "triangle", 440, 110, 1.3, 0.06, 1000, 300, 0.05);
        clicks(0.3, "bandpass", 2000, 2, 7, 0.07, 0.022, 0.1, 0.6, 0.3);
      }],
      closed: [REF, 0, () => {
        knocks(0, "square", 110, 50, 1, 0.1, 0.16, 0.2, 0, 700);
        tone(0, "sine", 120, 38, 0.6, 0.16);
        tone(0.12, "triangle", 494, 330, 0.35, 0.06);
      }],
      // The forge: a cart lifted up its shaft, the fire taking it with a whoomph and two gold rings, the sign winding
      // up to mint, the coin's ching, and the coin dropping down its shaft.
      cart: [REF, 0, () => {
        knocks(0, "square", 150, 90, 2, 0.22, 0.09, 0.12, 0.3, 900);
        clicks(0.05, "bandpass", 1900, 5, 2, 0.22, 0.05, 0.14);
      }],
      forge: [REF, 0.08, () => {
        hiss(0, "lowpass", 200, 2400, 0.8, 0.9, 0.34, 0.12);
        tone(0, "sine", 80, 36, 0.7, 0.3);
        bell(0.1, 783.99, 1.4, 0.06);
        bell(0.26, 1046.5, 1.2, 0.04);
      }],
      spin: [REF, 0, () => {
        tone(0, "triangle", 196, 392, 1.2, 0.03, 700, 1400, 0.2);
        clicks(0, "bandpass", 2400, 4, 12, 0.1, 0.012, 0.07);
      }],
      mint: [REF, 0.08, () => {
        bell(0, 1568, 1.9, 0.1);
        bell(0.004, 2349.3, 1.3, 0.04);
        hiss(0, "highpass", 8000, 5000, 0.7, 0.3, 0.05, 0.002);
      }],
      coinDrop: [REF, 0, () => {
        tone(0, "sine", 1975.5, 1975.5, 0.14, 0.05);
        tone(0.11, "sine", 1568, 1568, 0.14, 0.04);
        tone(0.25, "sine", 1318.5, 1318.5, 0.25, 0.035);
        knocks(0.42, "square", 140, 80, 1, 0.1, 0.1, 0.08, 0, 600);
      }],
      // A forward: its sats swish off their line, each line strikes its own note as the first arrives, the Routing
      // Console's relays click, a failed one comes back with a soft low bump, and a big one swells through the core with
      // the coils' arcs crackling.
      zip: [REF, 0, () => hiss(0, "bandpass", 700, 1800, 1.2, 0.22, 0.06, 0.03)],
      land: [REF, 0, (n) => {
        const f = NOTES[n];
        tone(0, "sine", f, f, 0.6, 0.06, 7000, 7000, 0.004);
        tone(0, "sine", f * 4, f * 4, 0.05, 0.012);
      }],
      relay: [REF, 0, () => clicks(0, "bandpass", 1800, 3, 2, 0.05, 0.012, 0.06)],
      fail: [REF, 0, () => {
        tone(0, "triangle", 220, 110, 0.35, 0.07, 900);
        tone(0.12, "triangle", 165, 82, 0.4, 0.05, 700);
        clicks(0, "bandpass", 2200, 2, 5, 0.08, 0.02, 0.05, 0.5, 1);
      }],
      surge: [REF, 0.15, () => {
        tone(0, "triangle", 65, 196, 1.4, 0.1, 300, 1400, 0.15);
        tone(0, "sine", 55, 40, 1.2, 0.18);
        clicks(0, "bandpass", 2400, 1.5, 14, 0.08, 0.03, 0.12, 0.3, 1);
      }],
      // The treasury: a fee's nugget into the crate, and the crate filling up.
      nugget: [REF, 0, () => { tone(0, "sine", 1975.5, 1975.5, 0.1, 0.035); tone(0.05, "sine", 2637, 2637, 0.15, 0.02); }],
      kerching: [REF, 0, () => {
        for (let i = 0; i < KERCHING.length; i++) tone(i * 0.09, "sine", KERCHING[i], KERCHING[i], 0.2, 0.04);
        bell(0.32, 1568, 1.2, 0.07);
      }],
      // The rebalancer: engaged with a clunk and a whoosh as it spins up, a sigh of steam as it settles, and a stall.
      rebalance: [REF, 0, () => {
        hiss(0, "bandpass", 300, 2400, 2, 0.9, 0.14, 0.3);
        knocks(0, "square", 95, 55, 1, 0.1, 0.14, 0.12, 0, 600);
      }],
      rebalanceEnd: [REF, 0, () => hiss(0, "highpass", 2400, 700, 0.8, 1.3, 0.07, 0.02)],
      rebalanceFail: [REF, 0, () => {
        stutter(0, "triangle", 74, 46, 1, 9, 0.12, 400);
        knocks(0.95, "square", 90, 40, 1, 0.1, 0.22, 0.1, 0, 500);
      }],
      // The hourly summary printed at the Routing Console, a teleprinter's clatter and its bell.
      summary: [REF, 0, () => {
        clicks(0, "bandpass", 2600, 3, 14, 0.07, 0.016, 0.08, 0, 1);
        bell(1.05, 1975.5, 0.9, 0.04);
      }],
      // A tip: the core takes it in a sparkle, its cubes pop out and plop into the cooker's jaw, which gulps, chomps
      // and spits each banana up the tube.
      lime: [REF, 0.1, () => {
        tone(0, "sine", 330, 1046.5, 0.9, 0.07, 7000, 7000, 0.12);
        tone(0.05, "sine", 659.26, 2093, 0.8, 0.025, 7000, 7000, 0.12);
        hiss(0, "highpass", 5000, 9500, 1, 0.9, 0.03, 0.15);
      }],
      toss: [REF, 0, () => tone(0, "sine", 523.25, 783.99, 0.09, 0.02)],
      plop: [REF, 0, () => tone(0, "sine", 440, 150, 0.09, 0.07, 1400)],
      gulp: [REF, 0, () => {
        tone(0, "sine", 260, 70, 0.38, 0.24, 1200);
        hiss(0, "lowpass", 320, 110, 1, 0.28, 0.12, 0.01);
      }],
      chomp: [REF, 0, () => {
        clicks(0, "bandpass", 1100, 1.4, 2, 0.05, 0.07, 0.16, 0.4, 0.5);
        tone(0, "sine", 150, 60, 0.12, 0.14);
      }],
      spit: [REF, 0, () => { tone(0, "sine", 170, 880, 0.11, 0.1); hiss(0, "bandpass", 1600, 500, 2, 0.08, 0.05); }],
      // Through a peer shield, and the forge's anvil while it is at work.
      portal: [REF, 0, () => {
        tone(0, "sine", 920, 260, 0.5, 0.08);
        tone(0, "sine", 926, 268, 0.5, 0.08);
        hiss(0, "highpass", 7500, 1800, 0.9, 0.45, 0.07, 0.02);
      }],
      anvil: [REF, 0, () => { tone(0, "square", 700, 690, 0.06, 0.025, 1600); tone(0, "sine", 1400, 1400, 0.25, 0.015); }],
      // Kortik's switchboard, close up: a plug pulled from a jack, lifted from its hole, pushed home with a click and
      // stood back in its hole; a key thrown (n 1) or flipped back; a call ringing in, and a failed one's buzzer.
      unplug: [NEAR_REF, 0, () => { tone(0, "sine", 900, 300, 0.06, 0.09); hiss(0, "bandpass", 2500, 1200, 3, 0.05, 0.06); }],
      lift: [NEAR_REF, 0, () => knocks(0, "square", 700, 500, 1, 0.1, 0.03, 0.04, 0, 2200)],
      plug: [NEAR_REF, 0, () => {
        knocks(0, "square", 420, 260, 1, 0.1, 0.035, 0.12, 0, 1600);
        clicks(0.012, "highpass", 3200, 1, 1, 0.1, 0.02, 0.1);
      }],
      seat: [NEAR_REF, 0, () => knocks(0, "square", 300, 200, 1, 0.1, 0.04, 0.07, 0, 1200)],
      key: [NEAR_REF, 0, (n) => {
        knocks(0, "square", n ? 900 : 640, n ? 700 : 480, 1, 0.1, 0.025, 0.07, 0, 2600);
        clicks(0.03, "highpass", 4000, 1, 1, 0.1, 0.012, 0.06);
      }],
      ring: [NEAR_REF, 0, () => stutter(0, "sine", 880, 880, 0.3, 18, 0.02, 3000)],
      buzzer: [NEAR_REF, 0, () => stutter(0, "triangle", 180, 180, 0.45, 18, 0.04, 900)],
      // His temper: a fist on the desk that rattles the mug, the mug picked up or put down, a stool creaking under him,
      // a plug thrown at the visitor and yanked back, a poke's boink and the steam from his ears.
      thud: [NEAR_REF, 0, () => {
        tone(0, "sine", 110, 48, 0.22, 0.3, 900);
        hiss(0, "lowpass", 900, 200, 0.7, 0.18, 0.14, 0.003);
        clicks(0.05, "bandpass", 3300, 6, 3, 0.06, 0.03, 0.07, 0.5, 0.5);
      }],
      mug: [NEAR_REF, 0, () => { tone(0, "sine", 1900, 1900, 0.08, 0.06); tone(0, "sine", 3100, 3100, 0.05, 0.03); }],
      creak: [NEAR_REF, 0, () => stutter(0, "sawtooth", 150, 115, 0.32, 38, 0.035, 800)],
      throw: [NEAR_REF, 0, () => {
        hiss(0, "bandpass", 500, 2200, 1.5, 0.3, 0.12, 0.03);
        knocks(0.42, "square", 500, 300, 1, 0.1, 0.04, 0.08, 0, 1600);
      }],
      poke: [NEAR_REF, 0, () => { tone(0, "sine", 420, 1100, 0.12, 0.12); tone(0.1, "sine", 1100, 700, 0.12, 0.06); }],
      steam: [NEAR_REF, 0, () => {
        hiss(0, "highpass", 3500, 6000, 2, 1.8, 0.06, 0.3);
        tone(0.2, "sine", 2200, 2500, 1.2, 0.012, 7000, 7000, 0.3);
      }],
      // The katana: drawn with a ring, each cut a swish and a spray of sparks off the board, sheathed with a click,
      // and every channel force-closed at once with a crackle and the plugs flying home.
      draw: [NEAR_REF, 0, () => {
        hiss(0, "highpass", 3000, 7000, 4, 0.55, 0.12, 0.02);
        tone(0, "sine", 3400, 4200, 0.6, 0.05);
        bell(0.5, 4186, 0.9, 0.05);
      }],
      slash: [NEAR_REF, 0, () => {
        hiss(0, "bandpass", 900, 3600, 1.4, 0.22, 0.22, 0.02);
        clicks(0.12, "highpass", 3500, 0.8, 6, 0.035, 0.02, 0.16, 0.4, 1);
      }],
      sheathe: [NEAR_REF, 0, () => {
        hiss(0, "highpass", 5000, 2500, 4, 0.4, 0.09, 0.02);
        knocks(0.38, "square", 600, 400, 1, 0.1, 0.04, 0.12, 0, 2200);
      }],
      forced: [NEAR_REF, 0.1, () => {
        clicks(0, "highpass", 2200, 0.8, 22, 0.03, 0.022, 0.3, 0.6, 1);
        knocks(0, "square", 180, 40, 3, 0.12, 0.12, 0.16, 0.4, 1200);
        hiss(0.2, "lowpass", 1500, 200, 0.7, 1.2, 0.12, 0.05);
      }],
      // His voice, `n` syllables: muttering, or yelling.
      mutter: [NEAR_REF, 0, (n) => speak(n, false)],
      yell: [NEAR_REF, 0.05, (n) => speak(n, true)]
    };
    const heard = {};
    for (const name in CUES) heard[name] = 0;

    /** Once a frame, before any cue: where the visitor hears from, and the view's forward on the ground. */
    const listen = (x, y, z, fx, fz) => {
      const l = Math.hypot(fx, fz) || 1;
      ear.x = x; ear.y = y; ear.z = z; ear.fx = fx / l; ear.fz = fz / l;
    };
    const cue = (name, x, y, z, loud = 1, n = 0) => {
      const entry = CUES[name];
      if (!entry) throw new Error(`No factory cue named ${name}`);
      heard[name]++;
      if (!ready) activate();
      if (!ready || muted || document.hidden) return;
      place(x, y, z, entry[0]);
      AT.level = Math.max(AT.level, entry[1]) * loud * (name === "anvil" ? 1 : EVENTS);
      entry[2](n);
    };

    // The bed, ten times a second: each machine's level from how far it is and what it is doing, eased.
    const set = (param, value, now, tau = 0.12) => param.setTargetAtTime(value, now, tau);
    const machine = (pan, spot, ref, now) => {
      place(spot[0], spot[1], spot[2], ref);
      set(pan.pan, AT.pan, now);
      return AT.level;
    };
    const update = (dt, room) => {
      if (!ready) {
        activate();
        if (!ready) return;
      }
      since += dt;
      if (since < 0.1 || muted) return;
      const step = since, now = ctx.currentTime;
      since = 0;
      clock += step;
      const glow = room.glow, surge = room.surge;
      set(bed.mainsGain.gain, 0.022 * (0.35 + 0.65 * glow) + 0.02 * surge, now);
      set(bed.mains.frequency, 55 * (0.96 + 0.04 * glow), now, 0.4);
      set(bed.rumbleGain.gain, 0.035, now);
      let k = machine(bed.corePan, spots.core, BED_REF, now);
      set(bed.coreGain.gain, (0.05 * glow + 0.1 * surge) * k, now);
      set(bed.fizzGain.gain, (0.006 * glow + 0.04 * surge + 0.03 * room.lime) * k, now);
      // The forge breathes like bellows, roars while it works, and its anvil rings in time.
      k = machine(bed.forgePan, spots.forge, BED_REF, now);
      set(bed.forgeGain.gain, (0.03 + 0.06 * room.fire) * (0.75 + 0.25 * Math.sin(clock * 1.9)) * k, now);
      const crackle = (0.03 + 0.08 * room.fire) * k, g = bed.crackGain.gain;
      for (let i = 0, pops = room.fire > 0.5 ? 3 : 1; i < pops; i++) {
        if (Math.random() > 0.6) continue;
        const t = now + Math.random() * 0.1;
        g.setValueAtTime(Math.max(0.0002, crackle * (0.3 + Math.random() * 0.7)), t);
        g.setTargetAtTime(0.0001, t + 0.004, 0.006);
      }
      if (room.fire > 0.5 && (anvilIn -= step) <= 0) {
        anvilIn = 1.5;
        cue("anvil", spots.forge[0], spots.forge[1], spots.forge[2]);
      }
      // The rebalancer spins up and down, its whir and its air following its speed.
      speed += ((room.spin ? 1 : 0.08) - speed) * Math.min(1, step * (room.spin ? 0.9 : 0.5));
      k = machine(bed.rebPan, spots.rebalancer, BED_REF, now);
      set(bed.reb.frequency, 50 + speed * 180, now);
      set(bed.rebGain.gain, (0.008 + 0.06 * speed) * k, now);
      set(bed.airFilter.frequency, 300 + speed * 1500, now);
      set(bed.airGain.gain, 0.08 * speed * k, now);
      k = machine(bed.cookPan, spots.cooker, BED_REF, now);
      set(bed.cookGain.gain, 0.1 * room.churn * k, now);
      // The nearest shield shimmers.
      let best = 0, at = spots.shields[0];
      for (let i = 0; i < spots.shields.length; i++) {
        const s = spots.shields[i];
        place(s[0], s[1], s[2], BED_REF);
        if (AT.level > best) { best = AT.level; at = s; }
      }
      k = machine(bed.shieldPan, at, BED_REF, now);
      set(bed.shieldGain.gain, 0.014 * k, now);
      set(bed.shieldFizz.gain, 0.005 * k, now);
      const cart = room.cart, coin = room.coin;
      if (cart) { place(cart.x, cart.y, cart.z, BED_REF); set(bed.cartPan.pan, AT.pan, now); }
      set(bed.cartGain.gain, cart ? 0.12 * AT.level : 0, now);
      if (coin) { place(coin.x, coin.y, coin.z, BED_REF); set(bed.coinPan.pan, AT.pan, now); }
      set(bed.coinGain.gain, coin ? 0.025 * AT.level : 0, now);
      // Kortik's board, which comes up only as the visitor walks up to it, its relays ticking now and then.
      k = machine(bed.boardPan, spots.board, NEAR_REF, now);
      set(bed.boardGain.gain, 0.01 * k, now);
      if (Math.random() < 0.35) {
        const t = now + Math.random() * 0.1, tick = bed.tickGain.gain;
        tick.setValueAtTime(Math.max(0.0002, 0.05 * k * (0.4 + Math.random() * 0.6)), t);
        tick.setTargetAtTime(0.0001, t + 0.003, 0.004);
      }
    };

    // Everything to silence at once, for the mute.
    const quiet = () => {
      const now = ctx.currentTime;
      for (const key of ["mainsGain", "rumbleGain", "coreGain", "fizzGain", "forgeGain", "crackGain", "rebGain", "airGain", "cookGain", "shieldGain", "shieldFizz", "cartGain", "coinGain", "boardGain", "tickGain"]) {
        bed[key].gain.cancelScheduledValues(now);
        bed[key].gain.setTargetAtTime(0, now, 0.05);
      }
    };
    const setMuted = (value) => {
      muted = !!value;
      try {
        localStorage.setItem(STORAGE_KEY, muted ? "off" : "on");
      } catch {
      }
      if (ready) {
        if (muted) quiet();
        master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05);
      } else if (!muted) activate();
      return muted;
    };

    const dispose = () => {
      disposed = true;
      window.removeEventListener("pointerdown", activate, true);
      window.removeEventListener("keydown", activate, true);
      document.removeEventListener("visibilitychange", onVisibility);
      if (ctx) ctx.close().catch(() => {});
      ctx = master = buffer = null;
      ready = false;
      tones.length = noises.length = 0;
      for (const key of Object.keys(bed)) bed[key] = null;
    };

    return {
      listen, cue, update, setMuted, dispose, heard,
      get muted() { return muted; },
      get ready() { return ready; },
      get state() { return ctx ? ctx.state : "none"; }
    };
  };

  BL.factoryAudio = { create, NOTES };
})();
