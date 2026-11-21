// ₿IFRÖST's sound: the chamber as one enormous, ancient machine that is somehow alive. Synthesized and pooled on the
// Factory's pattern (factory-audio.js): one AudioContext opened from a gesture the browser has already activated,
// pre-started voices gated by gain, one noise loop, and nothing allocated per frame or per cue.
//
// Its bed is the mechanism's resonance: a deep, warm drone whose tone breathes slowly, and under it a heartbeat, a
// subliminal swell (hummm ... hummm) that quickens and deepens as the mechanism charges, and a little as the view
// looks up into the dome, where the ₿ spins faster. The charge sets the rhythm and the strength, never the pitch, so a
// fast spin never whines. Now and then a metallic resonance sweeps round the room as the rings turn, and distant
// crystal chimes ring out. Every open world has its own harmonic signature
// (`SIGNATURES`, by its window's id): as an Ooga nears its window the machine tunes toward it, the world's chord
// emerging under the drone from the window's side, pulsing faster as the charge builds; crystalline for DSB Land,
// brighter and wavering for the poker room. Looking up at the dome makes it ethereal: a thinner drone under airy
// harmonics, sparkling chimes and a shimmer rising up the beam. `update(dt, room)` shapes it ten times a second from
// what the scene writes into `room` in place: the charge (0 to 1), the world it answers (its window's id, or null),
// that window's side of the view (-1 to 1) and how far the view looks up (`gaze`, 0 to 1).
//
// Its cues are the chamber's moments: `arrive` (the whoom of crossing a field, the hum coming up under it and the
// ₿IFRÖST signature struck over it), `burst` (the rings' sweeping resonance and a surge up the beam, in the world's
// signature), `cross` (the dimensional jump into a world, in its signature), `mirror` (stepping through a linked
// mirror), `leave` (back out through a field, the hum going with it), `stay` (a crossing that could not go, the
// hum coming back) and the Dimensional Echo's (`echo-stir`, `echo-rise`, `echo-look`, `echo-fly`, `echo-cross`, and
// `echo-fade` for one dissolving early).
// It honours the page-wide mute, and `dispose` closes it. `heard` counts every cue asked for, heard or not.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp } = BL.math;
  const TONES = 14, NOISES = 4, NOISE_SECONDS = 2, MASTER = 0.5;
  // The drone's root, a low A: every pitch here is a multiple of it.
  const ROOT = 55;
  // The heartbeat: seconds from beat to beat at rest and fully charged, and how strong it swells at each.
  const BEAT = [3.2, 0.85], PULSE = [0.13, 0.3];
  // Each open world's harmonic signature over the root: its chord (`ratios`), a crystal partial ringing over it, and
  // a waver (`depth` cents at `rate` hertz). A world without one of its own takes `OTHER`.
  const SIGNATURES = {
    // DSB Land's blue: open fifths, cool and crystalline.
    dsb: { ratios: [3, 4.5, 6.75], crystal: 9, depth: 0, rate: 0 },
    // The poker room's green: a brighter major chord that wavers.
    poker: { ratios: [2.5, 3.75, 5], crystal: 7.5, depth: 16, rate: 5.5 }
  };
  const OTHER = { ratios: [2, 3, 4], crystal: 8, depth: 0, rate: 0 };
  // The ₿IFRÖST signature, struck over the hum as it comes up: a rising call.
  const MOTIF = [8, 12, 16, 20];
  // The distant chimes: the root's pentatonic, several octaves up.
  const CHIMES = [16, 18, 20, 24, 27, 32, 36];
  const signatureOf = (world) => SIGNATURES[world] || OTHER;

  const create = () => {
    let ctx = null, master = null, buffer = null, ready = false, muted = BL.sound.muted, disposed = false;
    const soundChannel = BL.sound.channel("bifrost");
    const tones = [], noises = [], bed = {}, sig = [];
    let toneNext = 0, noiseNext = 0, since = 0, nextBeat = 0, chimeIn = 4, sweepIn = 7, shimmerIn = 5, gaze = 0;
    let charge = 0, world = undefined, sweepSide = 1;
    const AT = { pan: 0 };

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
    const panner = (to) => {
      const p = ctx.createStereoPanner();
      p.connect(to);
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
    const wobble = (param, hz, depth) => {
      const d = gain(depth, null);
      d.connect(param);
      return osc("sine", hz, d);
    };

    const init = () => {
      ctx = new AudioContext();
      master = gain(muted ? 0 : MASTER, soundChannel.node(ctx));
      buffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      for (let i = 0; i < TONES; i++) {
        const pan = panner(master), g = gain(0, pan), f = filter("lowpass", 7000, 0.7, g);
        tones.push({ osc: osc("sine", 440, f), filter: f, gain: g, pan, until: 0 });
      }
      for (let i = 0; i < NOISES; i++) {
        const pan = panner(master), g = gain(0, pan), f = filter("bandpass", 1000, 1, g);
        noises.push({ src: hissOf(f), filter: f, gain: g, pan, until: 0 });
      }
      // Everything continuous rides one fader, so a crossing brings the hum up and takes it away.
      bed.fader = gain(0, master);
      // The resonance: the root and its overtones, the third a little sharp so it beats slowly, through a low-pass
      // whose opening breathes, the whole swelling and settling slower still.
      bed.droneFilter = filter("lowpass", 520, 0.9, null);
      bed.droneGain = gain(1, bed.fader);
      bed.droneFilter.connect(bed.droneGain);
      bed.drone = [
        osc("sine", ROOT, gain(0.16, bed.droneFilter)),
        osc("sine", ROOT * 2, gain(0.09, bed.droneFilter)),
        osc("triangle", ROOT * 3 + 0.4, gain(0.035, bed.droneFilter)),
        osc("sine", ROOT * 4 - 0.3, gain(0.02, bed.droneFilter))
      ];
      bed.breath = wobble(bed.droneFilter.frequency, 0.06, 140);
      bed.swell = wobble(bed.droneGain.gain, 0.11, 0.14);
      // The heartbeat: the root, its fifth and the octave under it, swelled beat by beat.
      bed.pulseGain = gain(0, bed.fader);
      const pulseFilter = filter("lowpass", 320, 0.7, bed.pulseGain);
      bed.pulse = [osc("sine", ROOT, gain(0.35, pulseFilter)), osc("sine", ROOT * 1.5, gain(0.18, pulseFilter)), osc("sine", ROOT * 2, gain(0.12, pulseFilter)), osc("sine", ROOT / 2, gain(0.2, pulseFilter))];
      // The world the machine tunes toward: its chord and crystal partial, from its window's side, pulsing at a rate
      // that rises with the charge, and wavering when its signature does.
      bed.sigPan = panner(bed.fader);
      bed.sigGain = gain(0, bed.sigPan);
      bed.sigTrem = gain(0.8, bed.sigGain);
      bed.tremLfo = wobble(bed.sigTrem.gain, 0.6, 0.2);
      bed.waver = gain(0, null);
      bed.waverLfo = osc("sine", 5, bed.waver);
      for (let i = 0; i < 4; i++) {
        const o = osc(i < 3 ? "sine" : "triangle", OTHER.ratios[i % 3] * ROOT, gain(i < 3 ? 0.06 : 0.022, bed.sigTrem));
        bed.waver.connect(o.detune);
        sig.push(o);
      }
      // The dome's air: a high breath and two airy harmonics, heard as the view looks up.
      bed.airGain = gain(0, bed.fader);
      bed.air = hissOf(filter("bandpass", 6500, 0.7, bed.airGain));
      bed.padGain = gain(0, bed.fader);
      const pad = gain(0.7, bed.padGain);
      bed.padLfo = wobble(pad.gain, 0.23, 0.3);
      bed.pad = [osc("sine", ROOT * 8, pad), osc("sine", ROOT * 12 + 0.7, gain(0.6, pad))];
      nextBeat = ctx.currentTime + 1.2;
      // A page that opened here, or a gesture that came late, still hears the hum come up.
      bed.fader.gain.setTargetAtTime(1, ctx.currentTime + 0.3, 1.2);
      ready = true;
    };

    // Only from a gesture the browser has already counted, so nothing warns in the console; a gesture also wakes a
    // context the browser started suspended.
    const activate = () => {
      if (disposed) return;
      if (ready) {
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        return;
      }
      if (muted || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      init();
    };
    window.addEventListener("pointerdown", activate, true);
    window.addEventListener("keydown", activate, true);
    const onVisibility = () => {
      if (ready && !document.hidden && ctx.state === "suspended") ctx.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);

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
    // A voice's gain from `t`: up to `level` over `attack` and away by `dur`, panned from `pan0` to `pan1`.
    const env = (v, t, level, attack, dur, pan0, pan1) => {
      const g = v.gain.gain, p = v.pan.pan, now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(0.0001, now, 0.004);
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(Math.max(0.0002, level), t + attack);
      g.exponentialRampToValueAtTime(0.0001, t + dur);
      p.cancelScheduledValues(now);
      p.setValueAtTime(pan0, t);
      if (pan1 !== pan0) p.linearRampToValueAtTime(pan1, t + dur);
      v.until = t + dur + 0.02;
    };
    const glide = (param, t, from, to, dur) => {
      param.cancelScheduledValues(ctx.currentTime);
      param.setValueAtTime(from, t);
      if (to !== from) param.exponentialRampToValueAtTime(to, t + dur);
    };
    // A tone `at` seconds ahead: a `type` wave gliding f0 to f1 over `dur`, swelling over `attack`, panned across.
    const tone = (at, type, f0, f1, dur, level, attack = 0.006, pan0 = 0, pan1 = pan0, cut = 7000) => {
      const v = toneVoice(), t = ctx.currentTime + at;
      v.osc.type = type;
      glide(v.osc.frequency, t, f0, f1, dur);
      glide(v.filter.frequency, t, cut, cut, 0);
      env(v, t, level, attack, dur, pan0, pan1);
    };
    // Noise through a `type` filter swept f0 to f1 (q its sharpness) over `dur`.
    const hiss = (at, type, f0, f1, q, dur, level, attack = 0.004, pan = 0) => {
      const v = noiseVoice(), t = ctx.currentTime + at;
      v.filter.type = type;
      v.filter.Q.setValueAtTime(q, t);
      glide(v.filter.frequency, t, f0, f1, dur);
      env(v, t, level, attack, dur, pan, pan);
    };
    // A struck crystal: its note and an inharmonic partial that dies sooner.
    const bell = (at, f, dur, level, pan = 0) => {
      tone(at, "sine", f, f, dur, level, 0.006, pan);
      tone(at, "sine", f * 2.76, f * 2.76, dur * 0.4, level * 0.35, 0.006, pan);
    };
    // The hum's fader, up or away over about `tau` seconds from `at` ahead, from `from` (where it is, when not given).
    const fade = (to, at, tau, from = bed.fader.gain.value) => {
      const g = bed.fader.gain, now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(from, now);
      g.setTargetAtTime(to, now + at, tau);
    };

    const CUES = {
      // Through a field into the chamber: the membrane's whoom, the hum coming up under it, the signature over it.
      arrive: () => {
        tone(0, "sine", 150, 58, 1.6, 0.32, 0.05);
        tone(0.05, "triangle", 300, 116, 1.2, 0.08, 0.05);
        hiss(0, "bandpass", 220, 1700, 0.9, 1.3, 0.16, 0.22);
        fade(1, 0.5, 1.1, 0);
        for (let i = 0; i < MOTIF.length; i++) bell(1.1 + 0.24 * i, MOTIF[i] * ROOT, 3.4 - 0.3 * i, 0.05, -0.5 + i / 3);
      },
      // The rings flare: a resonance sweeping round the room and a surge rushing up the beam, in the world's signature.
      burst: (to) => {
        const s = signatureOf(to);
        bell(0, s.ratios[1] * ROOT * 2, 3.2, 0.07, -0.3);
        bell(0.04, s.crystal * ROOT * 2, 2.4, 0.035, 0.3);
        hiss(0, "bandpass", 300, 3200, 2.2, 1.4, 0.07, 0.35);
        tone(0, "sine", s.ratios[0] * ROOT, s.ratios[0] * ROOT * 2, 1.3, 0.06, 0.3, -0.6, 0.6);
      },
      // Into a world: its chord rushing up through the octaves as the hum drops away behind.
      cross: (to) => {
        const s = signatureOf(to);
        for (let i = 0; i < 3; i++) tone(0, "sine", s.ratios[i] * ROOT * 2, s.ratios[i] * ROOT * 8, 0.55, 0.09, 0.02, -0.4 + 0.4 * i);
        hiss(0, "highpass", 500, 6500, 0.8, 0.5, 0.12, 0.03);
        fade(0, 0.1, 0.12);
      },
      // Through a linked mirror: a glassy flip.
      mirror: () => {
        tone(0, "sine", 1760, 880, 0.22, 0.05, 0.004);
        tone(0.08, "sine", 880, 1320, 0.3, 0.04, 0.004);
        hiss(0, "bandpass", 5200, 3600, 3, 0.25, 0.035);
      },
      // Back out through a field: the whoom the other way, the hum going with it.
      leave: () => {
        tone(0, "sine", 58, 150, 0.6, 0.26, 0.04);
        hiss(0, "lowpass", 1800, 260, 0.9, 0.6, 0.14, 0.02);
        fade(0, 0, 0.18);
      },
      // A crossing that could not go: the hum comes back.
      stay: () => fade(1, 0, 0.6),
      // The Dimensional Echo (bifrost-echo.js): the stir, a crystal chime swelling in reverse as the hum dips; the double
      // drawing out, a rising resonance; its look, a brief, strange harmony; its flight, a soft rush gathering speed; and
      // its crossing, a deep pulse and a fading shimmer as the hum comes back.
      "echo-stir": () => {
        tone(0, "sine", ROOT * 24, ROOT * 24, 1, 0.045, 0.85, 0.2);
        tone(0, "sine", ROOT * 36, ROOT * 36, 0.95, 0.015, 0.8, -0.2);
        fade(0.55, 0, 0.5);
      },
      "echo-rise": () => {
        tone(0, "sine", ROOT * 4, ROOT * 8, 1.7, 0.05, 0.9);
        tone(0.1, "sine", ROOT * 6, ROOT * 12, 1.6, 0.03, 0.9, 0.3);
      },
      "echo-look": () => {
        bell(0, ROOT * 8, 2.2, 0.035, -0.2);
        bell(0.14, ROOT * 11.25, 2, 0.025, 0.2);
        tone(0, "sine", ROOT * 2, ROOT * 2, 1.6, 0.05, 0.3);
      },
      "echo-fly": () => {
        hiss(0, "bandpass", 250, 3200, 1.6, 3, 0.06, 2.4);
        tone(0, "sine", ROOT * 2, ROOT * 6, 3, 0.03, 2.5);
      },
      "echo-cross": () => {
        tone(0, "sine", 90, 48, 1.2, 0.22, 0.02);
        tone(0, "triangle", 180, 96, 1, 0.05, 0.02);
        tone(0.1, "sine", ROOT * 32, ROOT * 24, 2.6, 0.018, 0.05, 0.3, -0.3);
        fade(1, 1.2, 1);
      },
      // The double dissolving early, as the Ooga walks up to a window itself: a soft falling shimmer, the hum back.
      "echo-fade": () => {
        tone(0, "sine", ROOT * 24, ROOT * 16, 0.7, 0.025, 0.02, 0.2, -0.2);
        fade(1, 0, 0.5);
      }
    };
    const heard = {};
    for (const name in CUES) heard[name] = 0;
    /** A moment in the chamber; `to` is the window's id where the cue has a world's signature. */
    const cue = (name, to = null) => {
      const play = CUES[name];
      if (!play) throw new Error(`No bifrost cue named ${name}`);
      heard[name]++;
      if (!ready) activate();
      if (!ready || muted) return;
      play(to);
    };

    const set = (param, value, now, tau = 0.15) => param.setTargetAtTime(value, now, tau);
    // One heartbeat at `t`: a swell up and a long settle.
    const beat = (t, k) => {
      const g = bed.pulseGain.gain, peak = PULSE[0] + (PULSE[1] - PULSE[0]) * k;
      g.setTargetAtTime(peak, t, 0.16);
      g.setTargetAtTime(0, t + 0.42, 0.38);
    };
    const update = (dt, room) => {
      if (!ready) {
        activate();
        if (!ready) return;
      }
      if (muted) return;
      const now = ctx.currentTime;
      charge = room.charge;
      // The heartbeat runs a little ahead of the clock so no frame's lateness skips one.
      if (nextBeat < now) nextBeat = now + 0.05;
      // Looking up quickens it a little too, as the ₿ spins faster under the dome.
      const drive = Math.min(1, charge + 0.35 * gaze);
      while (nextBeat < now + 0.25) {
        beat(nextBeat, drive);
        nextBeat += BEAT[0] + (BEAT[1] - BEAT[0]) * drive;
      }
      since += dt;
      if (since < 0.1) return;
      const step = since;
      since = 0;
      gaze += (room.gaze - gaze) * Math.min(1, step * 2.5);
      // The drone opens a little as the machine charges and thins as the view looks up into the dome.
      set(bed.droneFilter.frequency, 520 + 260 * charge - 200 * gaze, now, 0.4);
      set(bed.droneGain.gain, 1 - 0.4 * gaze, now, 0.4);
      // The world it answers: retuned on a change of world, emerging with the charge, pulsing faster as it builds.
      if (room.world !== world) {
        world = room.world;
        const s = signatureOf(world);
        for (let i = 0; i < 4; i++) set(sig[i].frequency, (i < 3 ? s.ratios[i] : s.crystal) * ROOT, now, 0.3);
        set(bed.waver.gain, s.depth, now, 0.3);
        set(bed.waverLfo.frequency, s.rate || 5, now, 0.3);
      }
      set(bed.sigGain.gain, world ? Math.pow(charge, 1.6) : 0, now, 0.4);
      set(bed.tremLfo.frequency, 0.5 + 3.5 * charge, now, 0.3);
      set(bed.sigPan.pan, clamp(room.side, -1, 1) * 0.6, now, 0.2);
      // The dome's air and its harmonics.
      set(bed.airGain.gain, 0.012 * gaze, now, 0.4);
      set(bed.padGain.gain, 0.022 * gaze, now, 0.4);
      // A metallic resonance sweeps round the room now and then as the rings turn, oftener as they speed up.
      if ((sweepIn -= step) <= 0) {
        sweepIn = (9 + Math.random() * 8) * (1 - 0.6 * charge);
        sweepSide = -sweepSide;
        const level = 0.018 * (1 + charge);
        tone(0, "triangle", ROOT * 4.24, ROOT * 4.3, 3.6, level, 1.3, -0.8 * sweepSide, 0.8 * sweepSide, 900);
        tone(0, "sine", ROOT * 6.23, ROOT * 6.31, 3.2, level * 0.6, 1.1, -0.8 * sweepSide, 0.8 * sweepSide);
      }
      // Distant crystal chimes, oftener looking up.
      if ((chimeIn -= step) <= 0) {
        chimeIn = (6 + Math.random() * 7) / (1 + 2.5 * gaze);
        bell(Math.random() * 0.1, CHIMES[Math.floor(Math.random() * CHIMES.length)] * ROOT, 2.6, 0.016 * (1 + 1.5 * gaze), Math.random() * 1.6 - 0.8);
      }
      // Looking up, a shimmer rises up the beam now and then.
      if ((shimmerIn -= step) <= 0) {
        shimmerIn = 7 + Math.random() * 5;
        if (gaze > 0.35) tone(0, "sine", ROOT * 16, ROOT * 24, 5, 0.012 * gaze, 1.8);
      }
    };

    // Everything continuous silenced at once, for the mute.
    const quiet = () => {
      const now = ctx.currentTime;
      for (const key of ["fader", "pulseGain", "sigGain", "airGain", "padGain"]) {
        bed[key].gain.cancelScheduledValues(now);
        bed[key].gain.setTargetAtTime(0, now, 0.05);
      }
    };
    const setMuted = (value) => {
      muted = !!value;
      BL.sound.setMuted(muted);
      if (ready) {
        if (muted) quiet();
        else fade(1, 0, 0.6);
        master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05);
      } else if (!muted) activate();
      return muted;
    };
    const offSound = BL.sound.subscribe(setMuted);

    const dispose = () => {
      offSound(); soundChannel.release();
      disposed = true;
      window.removeEventListener("pointerdown", activate, true);
      window.removeEventListener("keydown", activate, true);
      document.removeEventListener("visibilitychange", onVisibility);
      if (ctx) ctx.close().catch(() => {});
      ctx = master = buffer = null;
      ready = false;
      tones.length = noises.length = sig.length = 0;
      for (const key of Object.keys(bed)) bed[key] = null;
    };

    return {
      cue, update, setMuted, dispose, heard,
      get muted() { return muted; },
      get ready() { return ready; },
      get state() { return ctx ? ctx.state : "none"; }
    };
  };

  BL.bifrostAudio = { create, SIGNATURES };
})();
