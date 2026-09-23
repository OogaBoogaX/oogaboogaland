// Ooga Mine's sound, on the rally's pattern: one AudioContext opened from a gesture the browser has
// already activated, a fixed pool of pre-started voices gated by gain, and one noise loop behind every
// hiss. Nothing is allocated per cue and nothing is ever restarted - a cue only schedules automation.
//
// The room's voice is the fan drone: its pitch and level follow how many units are actually running,
// so the operation is audible before it is read. Heat opens a filter, a dead breaker kills it dead.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp } = BL.math;
  const VOICES = 8;
  const NOISE_SECONDS = 2;
  const MASTER = 0.5;
  const STORAGE_KEY = "oogaboogaland.audio";

  const create = () => {
    let ctx = null, master = null, noise = null, ready = false, muted = false;
    try {
      muted = localStorage.getItem(STORAGE_KEY) === "off";
    } catch {
    }
    const voices = [];
    let voiceNext = 0;
    const layers = { drone: null, droneGain: null, droneFilter: null, hiss: null, hissGain: null, hissFilter: null, hum: null, humGain: null };
    const state = { units: 0, heat: 0, dark: false, level: 0, pitch: 0 };

    const init = () => {
      if (ctx || typeof AudioContext === "undefined") return;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER;
      master.connect(ctx.destination);
      const gain = (value, to) => {
        const g = ctx.createGain();
        g.gain.value = value;
        g.connect(to);
        return g;
      };
      const filter = (type, freq, q = 1) => {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        return f;
      };
      noise = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      // The fan wall: filtered noise, opened by heat, plus a low hum that is the room's mains note.
      layers.hissFilter = filter("bandpass", 620, 0.7);
      layers.hissGain = gain(0, master);
      layers.hissFilter.connect(layers.hissGain);
      layers.hiss = ctx.createBufferSource();
      layers.hiss.buffer = noise;
      layers.hiss.loop = true;
      layers.hiss.connect(layers.hissFilter);
      layers.hiss.start();

      layers.droneFilter = filter("lowpass", 900, 0.8);
      layers.droneGain = gain(0, master);
      layers.droneFilter.connect(layers.droneGain);
      layers.drone = ctx.createOscillator();
      layers.drone.type = "sawtooth";
      layers.drone.frequency.value = 58;
      layers.drone.connect(layers.droneFilter);
      layers.drone.start();

      layers.humGain = gain(0, master);
      layers.hum = ctx.createOscillator();
      layers.hum.type = "sine";
      layers.hum.frequency.value = 50;
      layers.hum.connect(layers.humGain);
      layers.hum.start();

      for (let i = 0; i < VOICES; i++) {
        const osc = ctx.createOscillator(), g = gain(0, master);
        osc.type = "square";
        osc.frequency.value = 220;
        osc.connect(g);
        osc.start();
        voices.push({ osc, gain: g, until: 0 });
      }
      ready = true;
    };

    // Only from a gesture the browser has already counted, so nothing warns in the console.
    const activate = () => {
      if (ready) {
        if (ctx.state === "suspended") ctx.resume();
        return;
      }
      if (!navigator.userActivation || navigator.userActivation.hasBeenActive) init();
    };

    const voice = () => {
      const now = ctx.currentTime;
      let pick = voices[voiceNext];
      for (let i = 0; i < VOICES; i++) {
        const v = voices[(voiceNext + i) % VOICES];
        if (v.until <= now) {
          pick = v;
          voiceNext = (voiceNext + i + 1) % VOICES;
          break;
        }
      }
      return pick;
    };

    // A cue is a frequency ramp and a gain envelope on a pooled voice. No nodes are made here.
    const blip = (from, to, seconds, level, type) => {
      if (!ready || muted) return;
      const v = voice(), now = ctx.currentTime;
      v.osc.type = type || "square";
      v.osc.frequency.cancelScheduledValues(now);
      v.osc.frequency.setValueAtTime(from, now);
      v.osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + seconds);
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(0.0001, now);
      v.gain.gain.exponentialRampToValueAtTime(level, now + 0.012);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
      v.until = now + seconds;
    };

    const CUES = {
      buy: () => blip(520, 880, 0.14, 0.2),
      sell: () => blip(880, 420, 0.18, 0.18),
      deny: () => blip(200, 120, 0.16, 0.18, "sawtooth"),
      paid: () => blip(660, 990, 0.1, 0.12, "triangle"),
      block: () => {
        blip(330, 1320, 0.5, 0.3, "triangle");
        blip(220, 660, 0.7, 0.2);
      },
      realblock: () => blip(180, 1100, 0.8, 0.26, "triangle"),
      breaker: () => blip(120, 60, 0.4, 0.3, "sawtooth"),
      fixed: () => blip(300, 720, 0.2, 0.22),
      fire: () => blip(90, 200, 0.6, 0.24, "sawtooth"),
      meltdown: () => blip(160, 40, 1.1, 0.34, "sawtooth"),
      good: () => blip(440, 880, 0.3, 0.2, "triangle"),
      bad: () => blip(300, 150, 0.35, 0.24, "sawtooth"),
      win: () => {
        blip(440, 880, 0.5, 0.3, "triangle");
        blip(660, 1320, 0.7, 0.22, "triangle");
      },
      lose: () => blip(220, 55, 1.2, 0.3, "sawtooth"),
      crack: () => blip(140, 90, 0.08, 0.26, "square"),
      dig: () => {
        blip(90, 40, 0.9, 0.34, "sawtooth");
        blip(60, 30, 1.2, 0.3, "square");
      },
      milestone: () => {
        blip(523, 784, 0.25, 0.22, "triangle");
        blip(659, 1046, 0.45, 0.2, "triangle");
      }
    };

    const cue = (name) => {
      activate();
      const fn = CUES[name];
      if (fn) fn();
    };

    // The room, shaped once a frame. Ramps are short so a breaker trip is heard as a cut, not a fade.
    // Ten writes a second are plenty for a room tone; sixty an hour long is a lot of automation events.
    let since = 0;
    const update = (dt, s) => {
      if (!ready) return;
      since += dt;
      if (since < 0.1) return;
      dt = since;
      since = 0;
      const now = ctx.currentTime, ramp = Math.max(0.05, dt * 2);
      const running = s.blackout || s.cutOff ? 0 : s.units;
      const heat = Math.max(s.heat[0], s.heat[1], s.heat[2]);
      const load = clamp(running / 40, 0, 1);
      const level = running > 0 ? 0.05 + load * 0.16 : 0;
      const pitch = 52 + load * 26 + heat * 18;
      layers.droneGain.gain.setTargetAtTime(muted ? 0 : level, now, ramp);
      layers.drone.frequency.setTargetAtTime(pitch, now, ramp);
      layers.droneFilter.frequency.setTargetAtTime(500 + load * 900 + heat * 700, now, ramp);
      layers.hissGain.gain.setTargetAtTime(muted ? 0 : running > 0 ? 0.02 + load * 0.08 + heat * 0.05 : 0, now, ramp);
      layers.hissFilter.frequency.setTargetAtTime(520 + heat * 900, now, ramp);
      layers.humGain.gain.setTargetAtTime(muted ? 0 : running > 0 ? 0.03 : 0, now, ramp);
      state.units = running;
      state.heat = heat;
      state.level = level;
      state.pitch = pitch;
    };

    const quiet = () => {
      if (!ready) return;
      const now = ctx.currentTime;
      for (const key of ["droneGain", "hissGain", "humGain"]) layers[key].gain.setTargetAtTime(0, now, 0.05);
      for (const v of voices) v.gain.gain.cancelScheduledValues(now);
    };

    const setMuted = (value) => {
      muted = !!value;
      try {
        localStorage.setItem(STORAGE_KEY, muted ? "off" : "on");
      } catch {
      }
      if (ready) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05);
      return muted;
    };

    return {
      cue, update, quiet, setMuted, activate,
      get muted() {
        return muted;
      },
      get ready() {
        return ready;
      },
      get voices() {
        return voices.length;
      },
      get state() {
        return state;
      },
      dispose() {
        if (!ctx) return;
        quiet();
        for (const v of voices) v.osc.stop();
        if (layers.drone) layers.drone.stop();
        if (layers.hum) layers.hum.stop();
        if (layers.hiss) layers.hiss.stop();
        voices.length = 0;
        ctx.close();
        ctx = master = noise = null;
        ready = false;
        for (const key of Object.keys(layers)) layers[key] = null;
      }
    };
  };

  BL.mineAudio = { create, VOICES };
})();
