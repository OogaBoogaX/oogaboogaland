// The visitor's own footsteps (#181): a soft thud each time the Ooga this page drives plants a foot, heard by this
// page alone. Nothing here touches the room: the steps are read from the driven Ooga's own walk cycle (`act.phase`,
// whose legs swing on its sine, so a foot lands each time it passes a multiple of pi) and never sent anywhere, and
// other players' Oogas and the crew make no steps. No step while standing, airborne, on a ladder or afloat.
// Sound is synthesized and pooled, as the games' is: one AudioContext opened only after a gesture the browser has
// activated, one looping noise buffer and a low sine feeding a voice for each foot, gated by gain; a step only
// schedules automation on its foot's voice. It honours the page-wide mute (`oogaboogaland.audio`), and `dispose`
// closes it. `steps` counts the steps taken this visit, heard or not.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const MASTER = 0.3, NOISE_SECONDS = 1, STORAGE_KEY = "oogaboogaland.audio";
  // Each foot's voice: the scuff's low-pass and the thump's pitch, a little apart so the feet do not sound alike.
  const SCUFF_HZ = [620, 760], THUMP_HZ = [74, 86];
  const SCUFF = 0.5, THUMP = 0.7, ATTACK_S = 0.004, SCUFF_S = 0.09, THUMP_S = 0.07;

  const create = () => {
    let ctx = null, master = null, scuffs = null, thumps = null, muted = false;
    let walker = null, lastPhase = 0, foot = 0, steps = 0;
    try {
      muted = localStorage.getItem(STORAGE_KEY) === "off";
    } catch {
      muted = false;
    }

    const open = () => {
      if (ctx || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = MASTER;
      master.connect(ctx.destination);
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      scuffs = [];
      thumps = [];
      for (let i = 0; i < SCUFF_HZ.length; i++) {
        const low = ctx.createBiquadFilter();
        low.type = "lowpass";
        low.frequency.value = SCUFF_HZ[i];
        const scuff = ctx.createGain();
        scuff.gain.value = 0;
        noise.connect(low);
        low.connect(scuff);
        scuff.connect(master);
        const tone = ctx.createOscillator();
        tone.frequency.value = THUMP_HZ[i];
        const thump = ctx.createGain();
        thump.gain.value = 0;
        tone.connect(thump);
        thump.connect(master);
        tone.start();
        scuffs.push(scuff);
        thumps.push(thump);
      }
      noise.start();
      return true;
    };

    const play = (level) => {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const t = ctx.currentTime, scuff = scuffs[foot].gain, thump = thumps[foot].gain;
      const k = level * (0.85 + Math.random() * 0.3);
      scuff.cancelScheduledValues(t);
      scuff.setValueAtTime(0.0001, t);
      scuff.exponentialRampToValueAtTime(SCUFF * k, t + ATTACK_S);
      scuff.exponentialRampToValueAtTime(0.0001, t + SCUFF_S);
      thump.cancelScheduledValues(t);
      thump.setValueAtTime(0.0001, t);
      thump.exponentialRampToValueAtTime(THUMP * k, t + ATTACK_S);
      thump.exponentialRampToValueAtTime(0.0001, t + THUMP_S);
    };

    /** Once a frame, after the crew moves, with the Ooga this page drives (null when it drives none). */
    const update = (cave) => {
      if (cave !== walker) {
        walker = cave;
        lastPhase = cave ? cave.act.phase : 0;
        return;
      }
      if (!cave) return;
      const phase = cave.act.phase, was = lastPhase;
      lastPhase = phase;
      // Standing resets the cycle to 0: that is a stop, not a step.
      if (phase === 0 || Math.floor(phase / Math.PI) === Math.floor(was / Math.PI)) return;
      if (cave.hop > 0 || cave.ladder && cave.ladder.plane || cave.poolSwimming) return;
      steps++;
      foot = 1 - foot;
      if (muted || !ctx && !open()) return;
      play(1);
    };

    const dispose = () => {
      if (ctx) ctx.close().catch(() => {});
      ctx = master = scuffs = thumps = walker = null;
    };

    return { update, dispose, get steps() { return steps; }, get open() { return !!ctx; } };
  };

  BL.footsteps = { create };
})();
