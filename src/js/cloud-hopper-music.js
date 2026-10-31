// "Cloudbreak Sprint": an original 128 BPM progressive trance score.
// A restrained minor-key motif answers warm, slowly changing ninth chords.
// One thirty-two-bar transport spans the dock, ascent, races, results and replays;
// only the drums follow the race state, entering and leaving on bar boundaries.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const STEP = 15 / 128, BAR = STEP * 16, AHEAD = 0.12, MAX_AHEAD = 2, LEVEL = 0.6, ECHO_TIME = STEP * 6;
  const MAX_STEPS = Math.ceil(MAX_AHEAD / STEP) + 1;
  const HZ = new Float32Array(128), PITCH = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  for (let i = 0; i < HZ.length; i++) HZ[i] = 440 * Math.pow(2, (i - 69) / 12);
  // Decode the original melody once. A dash sustains the previous note.
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
  const LEAD = line([
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
  ]);
  // Rootless Bm9, Gmaj9, Dmaj9/F#, Asus, A9 and Em9 voicings keep common
  // tones while the bass moves. Each harmony slot lasts two full bars.
  const CHORDS = [[50, 54, 57, 61], [50, 54, 57, 59], [50, 57, 61, 64], [50, 55, 59, 64], [49, 55, 59, 64], [55, 59, 62, 66]];
  const HARMONY = new Uint8Array([0, 0, 1, 1, 2, 2, 3, 4, 0, 0, 5, 5, 1, 1, 3, 4]);
  const ROOTS = new Uint8Array([35, 35, 31, 31, 30, 30, 33, 33, 35, 35, 40, 40, 31, 31, 33, 33]);
  const ARP = new Uint8Array([2, 1, 3, 1]);

  // All voices and echo taps are retained. Notes and frames only schedule
  // AudioParams; the caller owns the single context and shared noise source.
  const create = (ctx, output, noise) => {
    const bus = ctx.createGain(), pump = ctx.createGain(), drumBus = ctx.createGain(), echoSend = ctx.createGain(), echoWet = ctx.createGain();
    bus.gain.value = LEVEL; bus.connect(output);
    pump.gain.value = 1; pump.connect(bus);
    drumBus.gain.value = 0; drumBus.connect(bus);
    echoSend.gain.value = 0.22; echoWet.gain.value = 0; echoWet.connect(pump);
    // Two finite taps create space without a feedback loop. Quiet gates them
    // until both buffers have drained, so old notes cannot return after mute.
    for (let i = 0; i < 2; i++) {
      const delay = ctx.createDelay(1), low = ctx.createBiquadFilter(), level = ctx.createGain(), pan = ctx.createStereoPanner();
      delay.delayTime.value = STEP * (i ? 6 : 3);
      low.type = "lowpass"; low.frequency.value = i ? 2100 : 3200; low.Q.value = 0.4;
      level.gain.value = i ? 0.42 : 0.72; pan.pan.value = i ? 0.55 : -0.55;
      echoSend.connect(delay); delay.connect(low); low.connect(level); level.connect(pan); pan.connect(echoWet);
    }
    const voices = [];
    const voice = (type, pan, cutoff, spread = 0, echo = false, drums = false) => {
      const volume = ctx.createGain(), stereo = ctx.createStereoPanner(), low = ctx.createBiquadFilter();
      volume.gain.value = 0; stereo.pan.value = pan;
      low.type = "lowpass"; low.frequency.value = cutoff; low.Q.value = 0.65;
      low.connect(volume); volume.connect(stereo); stereo.connect(drums ? drumBus : pump);
      if (echo) stereo.connect(echoSend);
      const pitches = [], count = spread ? 3 : 1, blend = ctx.createGain();
      blend.gain.value = 1 / count; blend.connect(low);
      for (let i = 0; i < count; i++) {
        const tone = ctx.createOscillator();
        tone.type = type; tone.frequency.value = 220; tone.detune.value = spread ? (i - 1) * spread : 0;
        tone.connect(blend); tone.start(); pitches.push(tone.frequency);
      }
      const v = { gain: volume.gain, pitches, cutoff: low.frequency };
      voices.push(v); return v;
    };
    const hiss = (type, frequency, pan) => {
      const volume = ctx.createGain(), filter = ctx.createBiquadFilter(), stereo = ctx.createStereoPanner();
      volume.gain.value = 0; filter.type = type; filter.frequency.value = frequency; filter.Q.value = 0.7;
      stereo.pan.value = pan;
      noise.connect(filter); filter.connect(volume); volume.connect(stereo); stereo.connect(drumBus);
      const v = { gain: volume.gain, pitches: null, cutoff: filter.frequency };
      voices.push(v); return v;
    };
    const lead = voice("triangle", 0, 1500, 4, true);
    const bass = voice("sawtooth", 0, 650), sub = voice("sine", 0, 180);
    const arps = [voice("triangle", -0.36, 1800, 0, true), voice("triangle", 0.36, 1800, 0, true)];
    const pads = [voice("sawtooth", -0.45, 700, 4), voice("triangle", -0.15, 1000, 3), voice("triangle", 0.15, 1000, 3), voice("sawtooth", 0.45, 800, 5)];
    const kick = voice("sine", 0, 450, 0, false, true), hat = hiss("highpass", 7600, 0.25);
    const openHat = hiss("highpass", 5600, -0.2), clap = hiss("bandpass", 1700, 0);
    let mode = "", origin = 0, nextStep = 0, nextArp = 0, silenced = true;
    let drumFrom = 0, drumTo = 0, drumAt = 0;
    const drumLevelAt = at => at < drumAt ? drumFrom : drumTo;
    const duck = (at) => {
      const depth = 1 - 0.42 * drumLevelAt(at);
      pump.gain.cancelScheduledValues(at); pump.gain.setValueAtTime(depth, at);
      pump.gain.setValueAtTime(depth, at + 0.025);
      pump.gain.linearRampToValueAtTime(1, at + STEP * 2);
    };
    const mixDrums = (on) => {
      const target = on ? 1 : 0;
      if (target === drumTo) return;
      const now = ctx.currentTime;
      drumFrom = drumLevelAt(now); drumTo = target;
      drumAt = origin + Math.max(0, Math.ceil((now - origin) / BAR)) * BAR;
      drumBus.gain.cancelScheduledValues(now); drumBus.gain.setValueAtTime(drumFrom, now);
      // Enter at full level on beat one. After a finish, let this bar's hits
      // ring out and close the gate before the next bar's kick can sound.
      drumBus.gain.setValueAtTime(target, drumAt);
      // Hidden tabs may have already queued the next bar. Repair only its
      // ducking, preserving this bar's pulse and every melodic note and echo.
      pump.gain.cancelScheduledValues(drumAt); pump.gain.setValueAtTime(1, drumAt);
      const first = Math.max(0, Math.round((drumAt - origin) / STEP));
      for (let step = first; step < nextStep && step < first + MAX_STEPS; step++) {
        const bar = (step >> 4) & 31, breakdown = bar >= 16 && bar < 20;
        if (!(step & (breakdown ? 7 : 3))) duck(origin + step * STEP);
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
      nextStep = Math.max(0, Math.ceil((now - origin) / STEP));
    };
    const stop = () => { quiet(); mode = ""; nextStep = 0; };
    const stage = (next) => {
      if (next === "dock" || next === "intro" || next === "lifting" || next === "briefing" || next === "ready" || next === "won" || next === "best" || next === "dq") next = "bed";
      else if (next !== "running") next = "";
      if (!next) { stop(); return; }
      if (next === mode) return;
      // Start a clock only after a real stop. A race or replay changes only
      // the drum gate, so held chords and the current melody keep sounding.
      if (!mode) { origin = ctx.currentTime + 0.025; nextStep = nextArp = 0; }
      mode = next;
      // A muted/suspended score waits for tick to choose its audible downbeat.
      if (!silenced) mixDrums(next === "running");
    };
    const play = (step, at) => {
      const i = step & 255, bar = (step >> 4) & 31, harmony = bar >> 1, beat = i & 15;
      const chord = CHORDS[HARMONY[harmony]], breakdown = bar >= 16 && bar < 20;
      const open = bar >= 8 && bar < 16 || bar >= 24;
      if (beat === 0 && !(bar & 1)) {
        for (let p = 0; p < pads.length; p++) note(pads[p], chord[p], STEP * 31.8, 0.14, at, open ? 1100 : 800, 0.3, true);
      }
      // Quiet answering notes leave the main phrase room to decay into its
      // echoes. There is no continuous high arpeggio competing with it.
      if (beat === 14 || !breakdown && beat === 6) {
        const arp = arps[nextArp]; nextArp = 1 - nextArp;
        note(arp, chord[ARP[(bar + (beat === 14 ? 1 : 0)) & 3]], STEP * 4.5, 0.085, at, 1700, 0.018);
      }
      if (LEAD.note[i]) {
        const duration = Math.max(0.1, LEAD.length[i] * STEP - 0.03);
        note(lead, LEAD.note[i], duration, open ? 0.15 : 0.13, at, open ? 1600 : 1300, 0.045, true);
      }
      if (!breakdown && (beat & 3) === 2) {
        note(bass, ROOTS[harmony] + 12, STEP * 1.7, 0.29, at, 650);
        note(sub, ROOTS[harmony], STEP * 1.8, 0.42, at, 180);
      } else if (breakdown && (beat === 0 || beat === 8)) {
        note(sub, ROOTS[harmony], STEP * 6, 0.25, at, 180, 0.04);
      }
      if (!(beat & (breakdown ? 7 : 3))) thump(at, breakdown ? 0.36 : 0.76);
      if (!breakdown && (beat === 4 || beat === 12)) clapHit(at, 0.17);
      if (!breakdown && (beat === 6 || beat === 14)) envelope(openHat, 0.065, 0.12, at, 0.003);
      if (!breakdown && (beat === 2 || beat === 10)) envelope(hat, 0.045, 0.03, at, 0.002);
    };
    const tick = (ahead = AHEAD) => {
      if (!mode) return;
      const now = ctx.currentTime, end = now + Math.max(AHEAD, Math.min(MAX_AHEAD, ahead));
      if (silenced) {
        silenced = false;
        bus.gain.setValueAtTime(0, now); bus.gain.linearRampToValueAtTime(LEVEL, now + 0.012);
        echoWet.gain.setValueAtTime(0, now + ECHO_TIME + 0.01);
        echoWet.gain.linearRampToValueAtTime(1, now + ECHO_TIME + 0.05);
        mixDrums(mode === "running");
      }
      nextStep = Math.max(nextStep, Math.ceil((now - origin) / STEP));
      // Bound scheduling even after a long suspension; never emit missed bars.
      for (let queued = 0; queued < MAX_STEPS; queued++) {
        const at = origin + nextStep * STEP;
        if (at >= end) break;
        play(nextStep, at); nextStep++;
      }
    };
    return { stage, tick, quiet, stop };
  };
  BL.cloudHopperMusic = { create };
})();
