// Fireworks' sound: the layered mix the prototype settled on, on pooled voices. Each burst voice has its report,
// body, sub-thump and rolling tail, glitter crackle and willow hiss, the bolt's zaps, snap and thunder; each launch
// voice the lift charge's thump, the rocket's rush and, on some, a rising whistle. Every node is built once when the
// context opens; a cue only schedules automation on a voice, delayed by the speed of sound, duller with distance as
// the air takes the highs, panned toward the burst and sent wetter the farther it is into an open-air reverb and an
// echo off the cliffs. The cues of one burst share a voice; when all are busy the one finishing soonest is taken.
// The noise, crackle, hiss, thunder and the reverb's impulse are baked a slice a frame after the context opens, so
// no frame pays for them at once, and a layer waiting on its texture is silent. Nothing exists before the first
// firework is heard, the context opens only after a gesture the browser has activated, it suspends after
// SUSPEND_S with nothing sounding, and it honours the page-wide mute (`oogaboogaland.audio`); `dispose` closes it.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const STORAGE_KEY = "oogaboogaland.audio", MASTER = 0.6, BURST_VOICES = 6, LAUNCH_VOICES = 3, SUSPEND_S = 10;
  const SOUND_MPS = 343, BAKE_SAMPLES = 12000;
  const create = () => {
    let ctx = null, master = null, reverb = null, echoIn = null, muted = false;
    let busses = null, bakes = [], burst = [], launch = [], quietUntil = 0, cues = 0;
    const listener = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };
    try {
      muted = localStorage.getItem(STORAGE_KEY) === "off";
    } catch {
      muted = false;
    }

    const node = (kind, set) => {
      const n = kind === "gain" ? ctx.createGain() : kind === "pan" ? ctx.createStereoPanner() : kind === "osc" ? ctx.createOscillator() : ctx.createBiquadFilter();
      if (set) set(n);
      return n;
    };
    const filter = (type, hz, q = 0.8) => node("filter", (f) => { f.type = type; f.frequency.value = hz; f.Q.value = q; });
    const silent = () => node("gain", (g) => { g.gain.value = 0; });
    // One voice's tail: duller with distance, panned, then dry to the master and wet to the reverb and the echo.
    const outChain = () => {
      const pre = node("gain"), air = filter("lowpass", 18000, 0.4), pan = node("pan"), wet = silent(), echo = silent();
      pre.connect(air); air.connect(pan); pan.connect(master); pan.connect(wet); wet.connect(reverb); pan.connect(echo); echo.connect(echoIn);
      return { pre, air, pan, wet, echo };
    };
    const layer = (source, f, into) => { const g = silent(); source.connect(f); f.connect(g); g.connect(into); return { g, f }; };
    const tone = (type, hz) => { const o = node("osc", (n) => { n.type = type; n.frequency.value = hz; }); o.start(); return o; };
    const makeBurst = () => {
      const o = outChain(), sub = tone("sine", 60), zap = tone("sawtooth", 90), ping = tone("sine", 1400);
      return {
        ...o, key: NaN, endsAt: 0,
        report: layer(busses.noise, filter("highpass", 1400), o.pre),
        body: layer(busses.noise, filter("bandpass", 320, 0.9), o.pre),
        sub: { g: (() => { const g = silent(); sub.connect(g); g.connect(o.pre); return g; })(), osc: sub },
        tail: layer(busses.brown, filter("lowpass", 420), reverb),
        crackle: layer(busses.crackle, filter("highpass", 1600), o.pre),
        sizzle: layer(busses.sizzle, filter("highpass", 3200), o.pre),
        zap: (() => { const l = layer(zap, filter("bandpass", 2600, 1.6), o.pre); l.osc = zap; return l; })(),
        fizz: layer(busses.noise, filter("highpass", 5000), o.pre),
        snap: layer(busses.noise, filter("highpass", 3200), o.pre),
        ping: { g: (() => { const g = silent(); ping.connect(g); g.connect(o.pre); return g; })(), osc: ping },
        thunder: layer(busses.thunder, filter("lowpass", 520), o.pre),
        thunderWet: layer(busses.thunder, filter("lowpass", 300), reverb)
      };
    };
    const makeLaunch = () => {
      const o = outChain(), thump = tone("sine", 150), whistle = tone("triangle", 750), lfo = tone("sine", 7), depth = node("gain", (g) => { g.gain.value = 30; });
      lfo.connect(depth);
      depth.connect(whistle.frequency);
      return {
        ...o, key: NaN, endsAt: 0,
        thump: { g: (() => { const g = silent(); thump.connect(g); g.connect(o.pre); return g; })(), osc: thump },
        puff: layer(busses.noise, filter("lowpass", 900), o.pre),
        rush: layer(busses.noise, filter("bandpass", 380, 1.3), o.pre),
        whistle: { g: (() => { const g = silent(); whistle.connect(g); g.connect(o.pre); return g; })(), osc: whistle }
      };
    };

    // The textures, baked BAKE_SAMPLES at a time; each loops from its bus once it is complete.
    const white = () => Math.random() * 2 - 1;
    const bakeJob = (bus, seconds, channels, fill, onDone) => {
      const buffer = ctx.createBuffer(channels, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
      return { bus, buffer, fill, onDone, channel: 0, at: 0, state: {}, peak: 0 };
    };
    const stepBake = (job) => {
      const d = job.buffer.getChannelData(job.channel), to = Math.min(d.length, job.at + BAKE_SAMPLES);
      job.fill(d, job.at, to, job.state, job.channel);
      for (let i = job.at; i < to; i++) job.peak = Math.max(job.peak, Math.abs(d[i]));
      job.at = to;
      if (to < d.length) return false;
      if (job.peak > 0) for (let i = 0; i < d.length; i++) d[i] *= 0.9 / job.peak;
      job.at = 0; job.peak = 0; job.state = {};
      if (++job.channel < job.buffer.numberOfChannels) return false;
      job.onDone(job.buffer);
      return true;
    };
    const loop = (bus) => (buffer) => {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.loop = true;
      s.connect(bus);
      s.start();
    };
    const fillNoise = (d, from, to) => { for (let i = from; i < to; i++) d[i] = white(); };
    const fillBrown = (d, from, to, st) => { let v = st.v || 0; for (let i = from; i < to; i++) { v = (v + 0.02 * white()) / 1.02; d[i] = v; } st.v = v; };
    // Glitter: hundreds of tiny pitched clicks, thickest early.
    const fillCrackle = (d, from, to, st, _c) => {
      if (!st.grains) {
        st.grains = [];
        for (let g = 0; g < 1300; g++) st.grains.push(Math.floor(Math.pow(Math.random(), 1.4) * d.length * 0.97), 1800 + Math.random() * 5200, Math.floor(ctx.sampleRate * (0.002 + Math.random() * 0.006)), (0.3 + Math.random() * 0.7) * (Math.random() < 0.08 ? 1.8 : 1));
      }
      const sr = ctx.sampleRate, gs = st.grains;
      for (let g = 0; g < gs.length; g += 4) {
        const at = gs[g], f = gs[g + 1], len = gs[g + 2], amp = gs[g + 3];
        if (at + len < from || at >= to) continue;
        for (let i = Math.max(0, from - at); i < len && at + i < to; i++) d[at + i] += amp * Math.exp(-i / (len * 0.3)) * (0.6 * Math.sin((2 * Math.PI * f * i) / sr) + 0.4 * white());
      }
    };
    // A willow's hiss: high noise that shimmers as it fades.
    const fillSizzle = (d, from, to, st) => {
      let lp = st.lp || 0;
      const sr = ctx.sampleRate;
      for (let i = from; i < to; i++) {
        const w = white(), t = i / sr;
        lp = lp * 0.55 + w * 0.45;
        d[i] = (w - lp) * (0.55 + 0.45 * Math.sin(2 * Math.PI * (9 + 3 * Math.sin(t * 1.7)) * t)) * Math.exp(-t / 1.8);
      }
      st.lp = lp;
    };
    // Thunder: deep brown noise in a few rolling swells.
    const fillThunder = (d, from, to, st) => {
      if (!st.swells) st.swells = Array.from({ length: 7 }, (_, i) => [i ? Math.random() * 3.6 : 0.02, i ? 0.3 + Math.random() * 0.7 : 1, 0.15 + Math.random() * 0.6]);
      let v = st.v || 0, deep = st.deep || 0;
      const sr = ctx.sampleRate;
      for (let i = from; i < to; i++) {
        const t = i / sr;
        v = (v + 0.03 * white()) / 1.03;
        deep = deep * 0.985 + v * 0.015;
        let env = 0;
        for (const [at, amp, w] of st.swells) env += amp * Math.exp(-(((t - at) / w) ** 2));
        d[i] = (v * 0.5 + deep * 6) * env * Math.min(1, t / 0.03) * Math.exp(-t / 2.2);
      }
      st.v = v; st.deep = deep;
    };
    // Open air over the sea: a dark, diffuse tail and a few early reflections off the island's cliffs.
    const fillSpace = (d, from, to, st, c) => {
      const sr = ctx.sampleRate, taps = [0.07 + c * 0.013, 0.16 + c * 0.021, 0.29 - c * 0.017, 0.43 + c * 0.03];
      let lp = st.lp || 0;
      for (let i = from; i < to; i++) {
        const t = i / sr;
        let x = white() * Math.exp(-t / 0.8) * 0.35;
        for (const tap of taps) { const dt = t - tap; if (dt > 0 && dt < 0.025) x += white() * Math.exp(-dt / 0.006) * Math.exp(-tap * 2.2); }
        lp += (x - lp) * (0.85 - 0.75 * Math.min(1, t / 2.5));
        d[i] = lp;
      }
      st.lp = lp;
    };

    const open = () => {
      if (ctx || muted || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
      ctx = new AudioContext();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12; limiter.knee.value = 8; limiter.ratio.value = 10; limiter.attack.value = 0.003; limiter.release.value = 0.3;
      master = node("gain", (g) => { g.gain.value = MASTER; });
      master.connect(limiter);
      limiter.connect(ctx.destination);
      reverb = ctx.createConvolver();
      const wet = node("gain", (g) => { g.gain.value = 0.55; });
      reverb.connect(wet);
      wet.connect(master);
      echoIn = ctx.createDelay(2);
      echoIn.delayTime.value = 0.46;
      const feedback = node("gain", (g) => { g.gain.value = 0.3; }), dark = filter("lowpass", 1600), echoOut = node("gain", (g) => { g.gain.value = 0.4; });
      echoIn.connect(dark); dark.connect(feedback); feedback.connect(echoIn); dark.connect(echoOut); echoOut.connect(master);
      busses = { noise: node("gain"), brown: node("gain"), crackle: node("gain"), sizzle: node("gain"), thunder: node("gain") };
      for (let i = 0; i < BURST_VOICES; i++) burst.push(makeBurst());
      for (let i = 0; i < LAUNCH_VOICES; i++) launch.push(makeLaunch());
      // The launch's noise is needed at once; the rest bakes in slices while the rocket climbs.
      const noise = bakeJob(busses.noise, 2, 1, fillNoise, loop(busses.noise));
      while (!stepBake(noise));
      bakes = [
        bakeJob(busses.brown, 4, 1, fillBrown, loop(busses.brown)),
        bakeJob(busses.crackle, 3.5, 1, fillCrackle, loop(busses.crackle)),
        bakeJob(busses.sizzle, 4, 1, fillSizzle, loop(busses.sizzle)),
        bakeJob(busses.thunder, 5, 1, fillThunder, loop(busses.thunder)),
        bakeJob(null, 3.2, 2, fillSpace, (buffer) => { reverb.buffer = buffer; })
      ];
      return true;
    };

    const env = (param, at, peak, attack, decay) => {
      param.cancelScheduledValues(at);
      param.setValueAtTime(0.0001, at);
      param.linearRampToValueAtTime(Math.max(0.0002, peak), at + attack);
      param.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    };
    const sweep = (param, at, from, to, dur) => {
      param.cancelScheduledValues(at);
      param.setValueAtTime(from, at);
      if (to !== from) param.exponentialRampToValueAtTime(to, at + dur);
    };
    // The voice for a cue at this position: the one already sounding it, else a free one, else the one ending soonest.
    const voiceFor = (pool, key, start) => {
      let best = null;
      for (const v of pool) if (v.key === key && v.endsAt > start - 0.05) return v;
      for (const v of pool) if (!best || v.endsAt < best.endsAt) best = v;
      return best;
    };

    /** Schedule a cue `inSeconds` from now at (x, y, z), heard from the listener; see fireworks.js for the kinds. */
    const cue = (kind, inSeconds, x, y, z, size, rise = 0, whistle = false) => {
      if (muted || !ctx && !open()) return false;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const dx = x - listener.x, dy = y - listener.y, dz = z - listener.z, dist = Math.max(1, Math.hypot(dx, dy, dz));
      const start = ctx.currentTime + Math.max(0, inSeconds) + dist / SOUND_MPS;
      const level = size * Math.min(1.4, Math.max(0.3, 230 / dist)), wet = Math.max(0.15, Math.min(0.65, dist / 380));
      const pool = kind === "launch" ? launch : burst, key = x * 7.31 + y * 1.17 + z * 3.97, v = voiceFor(pool, key, start);
      v.key = key;
      v.pan.pan.setValueAtTime(Math.max(-0.85, Math.min(0.85, (dx * listener.rx + dz * listener.rz) / dist)), start);
      v.air.frequency.setValueAtTime(Math.max(900, Math.min(18000, 22000 * Math.exp(-dist / 210))), start);
      v.wet.gain.setValueAtTime(wet, start);
      v.echo.gain.setValueAtTime(wet * 0.6, start);
      let ends = start;
      if (kind === "launch") {
        sweep(v.thump.osc.frequency, start, 150, 55, 0.18);
        env(v.thump.g.gain, start, 0.35 * level, 0.003, 0.2);
        sweep(v.puff.f.frequency, start, 900, 300, 0.2);
        env(v.puff.g.gain, start, 0.3 * level, 0.002, 0.18);
        sweep(v.rush.f.frequency, start, 380, 2800, rise);
        env(v.rush.g.gain, start, 0.2 * size, 0.3, rise * 0.85);
        if (whistle) {
          sweep(v.whistle.osc.frequency, start + 0.05, 750, 2600, rise * 0.92);
          env(v.whistle.g.gain, start + 0.05, 0.07 * size, 0.12, rise * 0.8);
        }
        ends = start + rise + 0.2;
      } else if (kind === "boom") {
        // The report, the body, the sub-thump, and a rolling tail that lives mostly in the reverb.
        env(v.report.g.gain, start, 1.1 * level, 0.001, 0.02 + 0.04 * size);
        sweep(v.body.f.frequency, start, 320, 160, 0.9);
        env(v.body.g.gain, start, level, 0.004, 0.45 + 0.8 * size);
        sweep(v.sub.osc.frequency, start, 62 - 10 * size, 27, 0.7);
        env(v.sub.g.gain, start, 1.2 * level * (0.4 + 0.6 * size), 0.006, 0.45 + 0.55 * size);
        sweep(v.tail.f.frequency, start, 420, 180, 2.5);
        env(v.tail.g.gain, start + 0.02, 0.7 * level * size, 0.06, 1.6 + size);
        ends = start + 2.7 + size;
      } else if (kind === "crackle") {
        env(v.crackle.g.gain, start, 0.55 * level, 0.15, 1.4 + 1.4 * size);
        ends = start + 1.6 + 1.4 * size;
      } else if (kind === "sizzle") {
        sweep(v.sizzle.f.frequency, start, 3200, 2200, 3.5);
        env(v.sizzle.g.gain, start, 0.3 * level, 0.4, 3.2);
        ends = start + 3.6;
      } else if (kind === "zap") {
        // A buzzing saw, gated in stutters, over a high fizz.
        const g = v.zap.g.gain, f = v.zap.osc.frequency;
        g.cancelScheduledValues(start);
        f.cancelScheduledValues(start);
        for (let t = 0; t < 0.9; t += 0.03 + Math.random() * 0.05) {
          f.setValueAtTime(70 + Math.random() * 110, start + t);
          g.setValueAtTime(Math.random() < 0.55 ? 0.3 * level * size : 0, start + t);
        }
        g.setValueAtTime(0, start + 0.92);
        env(v.fizz.g.gain, start, 0.12 * level, 0.05, 0.8);
        ends = start + 1;
      } else if (kind === "thunder") {
        // The strike's snap, the restrike's smaller one, then thunder rolling in.
        const g = v.snap.g.gain, p = v.ping.g.gain;
        g.cancelScheduledValues(start); p.cancelScheduledValues(start);
        for (const [off, k] of [[0, 1], [0.28, 0.6]]) {
          g.setValueAtTime(0.0001, start + off);
          g.linearRampToValueAtTime(1.3 * level * k, start + off + 0.001);
          g.exponentialRampToValueAtTime(0.0001, start + off + 0.05);
          sweep(v.ping.osc.frequency, start + off, 1400, 180, 0.08);
          p.setValueAtTime(0.0001, start + off);
          p.linearRampToValueAtTime(0.35 * level * k, start + off + 0.001);
          p.exponentialRampToValueAtTime(0.0001, start + off + 0.07);
        }
        sweep(v.thunder.f.frequency, start, 520, 260, 4);
        env(v.thunder.g.gain, start + 0.06, level, 0.08, 4.2);
        env(v.thunderWet.g.gain, start + 0.06, 0.8 * level, 0.08, 4.2);
        ends = start + 4.4;
      }
      v.endsAt = Math.max(v.endsAt, ends);
      quietUntil = Math.max(quietUntil, ends);
      cues++;
      return true;
    };

    /** Once a frame with the listener's position and the view's right (x, z): bakes a slice, suspends when quiet. */
    const update = (x, y, z, rx, rz) => {
      listener.x = x; listener.y = y; listener.z = z;
      const rl = Math.hypot(rx, rz) || 1;
      listener.rx = rx / rl; listener.rz = rz / rl;
      if (!ctx) return;
      if (bakes.length && stepBake(bakes[0])) bakes.shift();
      if (ctx.state === "running" && ctx.currentTime > quietUntil + SUSPEND_S) ctx.suspend().catch(() => {});
    };
    const dispose = () => {
      if (ctx) ctx.close().catch(() => {});
      ctx = master = reverb = echoIn = busses = null;
      bakes = []; burst = []; launch = [];
    };
    return {
      cue, update, dispose,
      get open() { return !!ctx; },
      get state() { return ctx ? ctx.state : "closed"; },
      stats: () => ({ fireworkAudio: ctx ? ctx.state : "closed", fireworkCues: cues, fireworkBaking: bakes.length })
    };
  };

  BL.fireworksAudio = { create };
})();
