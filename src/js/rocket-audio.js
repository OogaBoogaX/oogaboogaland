// One AudioContext created from an activated gesture; a fixed pool of voices gated by gain, never per sound.
// One noise loop feeds the engine roar, the wind and the plasma hiss; a low rumble sits under the roar.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp } = BL.math;
  const VOICES = 8;
  const NOISE_SECONDS = 2;
  const MASTER = 0.55;
  // Shared with the rally and the drop, so one mute covers every game.
  const STORAGE_KEY = "oogaboogaland.audio";
  const NOTE = (semis) => 220 * Math.pow(2, semis / 12);
  const create = () => {
    let ctx = null, master = null, noise = null, ready = false, muted = false;
    try {
      muted = localStorage.getItem(STORAGE_KEY) === "off";
    } catch {
      // localStorage can throw; swallowing it is deliberate.
    }
    const voices = [];
    let voiceNext = 0;
    const layers = { roar: null, roarFilter: null, rumble: null, rumbleGain: null, wind: null, windFilter: null, hiss: null, rush: null };
    // Written by the scene each frame: engine push 0..1, nearness, air push, plasma.
    const state = { engine: 0, near: 1, air: 0, plasma: 0 };
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
      noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      layers.roarFilter = filter("lowpass", 300, 0.9);
      layers.roar = gain(0, master);
      layers.roarFilter.connect(layers.roar);
      layers.windFilter = filter("bandpass", 400, 0.6);
      layers.wind = gain(0, master);
      layers.windFilter.connect(layers.wind);
      const hiss = filter("highpass", 2400, 0.7);
      layers.hiss = gain(0, master);
      hiss.connect(layers.hiss);
      const rush = filter("lowpass", 900, 0.8);
      layers.rush = gain(0, master);
      rush.connect(layers.rush);
      noise.connect(layers.roarFilter);
      noise.connect(layers.windFilter);
      noise.connect(hiss);
      noise.connect(rush);
      noise.start();
      layers.rumbleGain = gain(0, master);
      layers.rumble = ctx.createOscillator();
      layers.rumble.type = "sawtooth";
      layers.rumble.frequency.value = 38;
      const low = filter("lowpass", 160, 1);
      layers.rumble.connect(low);
      low.connect(layers.rumbleGain);
      layers.rumble.start();
      ready = true;
    };
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
      const pick = voices[voiceNext];
      voiceNext = (voiceNext + 1) % VOICES;
      return pick;
    };
    const blip = (type, f0, f1, attack, hold, release, level, delay = 0) => {
      if (!ready) return;
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
    const whoosh = (level, dur) => {
      if (!ready) return;
      const now = ctx.currentTime, g = layers.rush.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(level, now + 0.06);
      g.linearRampToValueAtTime(0, now + dur);
    };
    const cues = {
      tick: () => blip("square", NOTE(7), NOTE(7), 0.005, 0.07, 0.05, 0.16),
      go: () => blip("square", NOTE(19), NOTE(19), 0.005, 0.2, 0.15, 0.2),
      clamp: () => {
        blip("triangle", 140, 60, 0.005, 0.05, 0.25, 0.35);
        whoosh(0.3, 1.2);
      },
      perfect: () => {
        blip("triangle", NOTE(12), NOTE(12), 0.005, 0.06, 0.1, 0.2);
        blip("triangle", NOTE(19), NOTE(24), 0.005, 0.12, 0.2, 0.22, 0.08);
      },
      early: () => blip("square", NOTE(-2), NOTE(-9), 0.01, 0.08, 0.2, 0.12),
      stage: () => {
        blip("square", 320, 90, 0.005, 0.04, 0.18, 0.22);
        blip("triangle", 90, 40, 0.005, 0.1, 0.3, 0.3, 0.05);
        whoosh(0.22, 0.8);
      },
      flameout: () => {
        for (let i = 0; i < 3; i++) blip("sawtooth", 80 - i * 12, 40, 0.005, 0.03, 0.08, 0.14, i * 0.11);
      },
      space: () => {
        for (let i = 0; i < 3; i++) blip("sine", NOTE([12, 16, 19][i]), NOTE([12, 16, 19][i]), 0.02, 0.18, 0.4, 0.12, i * 0.12);
      },
      orbit: () => {
        for (let i = 0; i < 5; i++) blip("square", NOTE([0, 4, 7, 12, 16][i]), NOTE([0, 4, 7, 12, 16][i]), 0.01, 0.12, 0.1, 0.18, i * 0.12);
        blip("sawtooth", NOTE(12), NOTE(12), 0.01, 0.7, 0.5, 0.14, 0.62);
      },
      mark: () => {
        blip("square", NOTE(7), NOTE(7), 0.01, 0.08, 0.06, 0.2);
        blip("square", NOTE(12), NOTE(12), 0.01, 0.14, 0.1, 0.22, 0.14);
      },
      burn: () => {
        blip("sawtooth", 60, 45, 0.02, 0.5, 0.4, 0.3);
        whoosh(0.2, 0.9);
      },
      warn: () => {
        blip("square", NOTE(14), NOTE(14), 0.005, 0.06, 0.04, 0.12);
        blip("square", NOTE(14), NOTE(14), 0.005, 0.06, 0.04, 0.12, 0.14);
      },
      chute: () => {
        blip("sine", 160, 50, 0.005, 0.08, 0.3, 0.4);
        whoosh(0.25, 0.9);
      },
      torn: () => {
        blip("sawtooth", 500, 120, 0.005, 0.05, 0.3, 0.3);
        whoosh(0.3, 0.4);
      },
      splash: () => {
        whoosh(0.5, 1.4);
        blip("sine", 120, 40, 0.005, 0.1, 0.6, 0.35);
      },
      thud: () => blip("triangle", 90, 40, 0.005, 0.06, 0.25, 0.35),
      boom: () => {
        whoosh(0.8, 2.4);
        blip("sine", 90, 22, 0.005, 0.3, 1.4, 0.6);
        blip("sawtooth", 140, 30, 0.005, 0.15, 0.9, 0.3, 0.05);
      },
      finish: () => {
        for (let i = 0; i < 4; i++) blip("square", NOTE([0, 4, 7, 12][i]), NOTE([0, 4, 7, 12][i]), 0.01, 0.1, 0.1, 0.22, i * 0.13);
        blip("sawtooth", NOTE(12), NOTE(12), 0.01, 0.5, 0.4, 0.18, 0.55);
      }
    };
    const update = () => {
      if (!ready) return;
      const now = ctx.currentTime;
      const e = clamp(state.engine, 0, 1.2) * clamp(state.near, 0, 1);
      layers.roarFilter.frequency.setTargetAtTime(220 + e * 900 + Math.sin(now * 23) * 40 * e, now, 0.05);
      layers.roar.gain.setTargetAtTime(e * 0.22, now, 0.08);
      layers.rumble.frequency.setTargetAtTime(34 + e * 16 + Math.sin(now * 13) * 2, now, 0.05);
      layers.rumbleGain.gain.setTargetAtTime(e * 0.16, now, 0.08);
      const a = clamp(state.air, 0, 1);
      layers.windFilter.frequency.setTargetAtTime(300 + a * 1500, now, 0.1);
      layers.wind.gain.setTargetAtTime(a * 0.09, now, 0.1);
      layers.hiss.gain.setTargetAtTime(clamp(state.plasma, 0, 1) * 0.08, now, 0.1);
    };
    const quiet = () => {
      if (!ready) return;
      const now = ctx.currentTime;
      layers.roar.gain.setTargetAtTime(0, now, 0.05);
      layers.rumbleGain.gain.setTargetAtTime(0, now, 0.05);
      layers.wind.gain.setTargetAtTime(0, now, 0.05);
      layers.hiss.gain.setTargetAtTime(0, now, 0.05);
      layers.rush.gain.cancelScheduledValues(now);
      layers.rush.gain.setTargetAtTime(0, now, 0.05);
    };
    const setMuted = (on) => {
      muted = !!on;
      if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05);
      try {
        localStorage.setItem(STORAGE_KEY, muted ? "off" : "on");
      } catch {
        // localStorage can throw; swallowing it is deliberate.
      }
    };
    const dispose = () => {
      if (!ctx) return;
      quiet();
      ctx.close();
      ctx = master = noise = null;
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
      },
      get context() {
        return ctx;
      }
    };
  };
  BL.rocketAudio = { create, VOICES };
})();
