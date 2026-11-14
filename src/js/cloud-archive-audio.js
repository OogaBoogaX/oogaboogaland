// The Cloud Archive's one sound: the racks loading in (LOAD), synthesized, nothing sampled. Our own "dive", written
// after the character of a reference clip, never from it: a warm sine dives from 300 Hz to the sub-bass in a fifth of
// a second, warbles there while the racks run in over a band-passed rush, swoops back up as they lock, and a thunk
// drops under it.
// The page's rules: sound is synthesized and pooled (every node is built once, when the context opens; a cue only
// schedules automation on those voices), the context opens only after a gesture the browser has registered
// (`navigator.userActivation`), goes through the page's gated output (sound.js) so the mute holds, and closes in
// `dispose`. `render(context, destination, seconds)` builds the same voices into any context, so an
// OfflineAudioContext can render the cue to listen to outside the game.
(() => {
  "use strict";
  const BL = window.BL;
  // A gentle tanh curve: warmth on the sine so the sub-bass reads on small speakers.
  const warmth = (amount) => {
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = i / (curve.length - 1) * 2 - 1; curve[i] = Math.tanh(x * amount) / Math.tanh(amount); }
    return curve;
  };
  // Every voice, built once and left running silent; the cue moves only their gains and frequencies.
  const build = (ctx, destination) => {
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(destination);
    const osc = (frequency, to) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = frequency; g.gain.value = 0;
      o.connect(g); g.connect(to); o.start();
      return { o, g };
    };
    // The warp: a sine through a soft clip and a low-pass, its pitch warbled by a slow sine.
    const shaper = ctx.createWaveShaper(), low = ctx.createBiquadFilter();
    shaper.curve = warmth(2.2); low.type = "lowpass"; low.frequency.value = 1400;
    shaper.connect(low); low.connect(master);
    const warp = osc(300, shaper), wobble = osc(6, warp.o.frequency);
    // The rush: looped noise through a sweeping band-pass.
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const hiss = ctx.createBufferSource(), band = ctx.createBiquadFilter(), rush = ctx.createGain();
    hiss.buffer = noise; hiss.loop = true; band.type = "bandpass"; band.Q.value = 1.4; rush.gain.value = 0;
    hiss.connect(band); band.connect(rush); rush.connect(master); hiss.start();
    // The lock: a thunk that drops in pitch.
    const thunk = osc(140, master);
    return { warp, wobble, band, rush, thunk };
  };
  const env = (param, t, points) => {
    param.cancelScheduledValues(t);
    param.setValueAtTime(points[0][1], t + points[0][0]);
    for (let i = 1; i < points.length; i++) param.linearRampToValueAtTime(points[i][1], t + points[i][0]);
  };
  const glide = (param, t, points) => {
    param.cancelScheduledValues(t);
    param.setValueAtTime(points[0][1], t + points[0][0]);
    for (let i = 1; i < points.length; i++) param.exponentialRampToValueAtTime(points[i][1], t + points[i][0]);
  };
  // The cue over `s` seconds from `t`, the racks locking at t + s.
  const cue = (v, t, s) => {
    glide(v.warp.o.frequency, t, [[0, 300], [0.22, 46], [s - 0.32, 40], [s, 165]]);
    env(v.warp.g.gain, t, [[0, 0], [0.02, 0.85], [s - 0.05, 0.75], [s + 0.12, 0]]);
    env(v.wobble.g.gain, t, [[0, 0], [0.3, 6], [s - 0.35, 4], [s - 0.3, 0]]);
    glide(v.band.frequency, t, [[0, 300], [s * 0.45, 2600], [s, 220]]);
    env(v.rush.gain, t, [[0, 0], [s * 0.4, 0.2], [s, 0.02], [s + 0.2, 0]]);
    glide(v.thunk.o.frequency, t + s, [[0, 140], [0.35, 38]]);
    env(v.thunk.g.gain, t + s, [[0, 0], [0.02, 0.9], [0.45, 0]]);
  };
  const render = (ctx, destination, seconds, at = ctx.currentTime + 0.03) => {
    const voices = build(ctx, destination);
    cue(voices, at, seconds);
    return voices;
  };
  const create = () => {
    let ctx = null, voices = null;
    const open = () => {
      if (ctx) return ctx.state !== "closed";
      if (typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
      try { ctx = new AudioContext(); } catch { ctx = null; return false; }
      voices = build(ctx, BL.sound.output(ctx));
      return true;
    };
    const play = (seconds) => {
      if (!open()) return false;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      cue(voices, ctx.currentTime + 0.03, seconds);
      return true;
    };
    const dispose = () => {
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
      ctx = voices = null;
    };
    return { play, dispose };
  };
  BL.cloudArchiveAudio = { create, render };
})();
