// Procedural drop sound: one context made on the first gesture, a fixed voice pool gated by gain, one noise loop
// behind the engine drone, the wind and the canopy flutter
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp } = BL.math;
  const VOICES = 8;
  const NOISE_SECONDS = 2;
  const MASTER = 0.55;
  // Shared with the rally, so one mute covers both caves
  const STORAGE_KEY = "oogaboogaland.audio";
  const NOTE = (semis) => 220 * Math.pow(2, semis / 12);
  const create = () => {
    let ctx = null, master = null, noise = null, ready = false, muted = false;
    try {
      muted = localStorage.getItem(STORAGE_KEY) === "off";
    } catch {
      // Storage may be unavailable
    }
    const voices = [];
    let voiceNext = 0;
    // Continuous layers, all started once and shaped by gain
    const layers = { engine: null, engineSub: null, engineLow: null, engineGain: null, wind: null, windFilter: null, flutter: null, flutterLfo: null, rush: null };
    // What the scene tells us each frame: the plane's speed and distance, the diver's speed, the phase
    const state = { planeSpeed: 0, planeDistance: 0, speed: 0, falling: 0, canopy: 0, flaring: 0 };
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
      // Wind: a band of noise that climbs with speed
      const wind = filter("bandpass", 500, 0.5);
      layers.windFilter = wind;
      layers.wind = gain(0, master);
      wind.connect(layers.wind);
      // Canopy flutter: a higher band chopped by a slow wobble
      const flutter = filter("bandpass", 1100, 2.2);
      layers.flutter = gain(0, master);
      flutter.connect(layers.flutter);
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 5.5;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(layers.flutter.gain);
      lfo.start();
      layers.flutterLfo = lfo;
      // Rush: a low whoosh for the jump and the chute opening
      const rush = filter("lowpass", 900, 0.8);
      layers.rush = gain(0, master);
      rush.connect(layers.rush);
      noise.connect(wind);
      noise.connect(flutter);
      noise.connect(rush);
      noise.start();
      // The plane: a sawtooth and a square an octave under it, a low-pass that opens with the revs
      const engineLow = filter("lowpass", 600, 1.4);
      layers.engineLow = engineLow;
      layers.engineGain = gain(0, master);
      engineLow.connect(layers.engineGain);
      layers.engine = ctx.createOscillator();
      layers.engine.type = "sawtooth";
      layers.engine.frequency.value = 70;
      layers.engine.connect(engineLow);
      layers.engine.start();
      layers.engineSub = ctx.createOscillator();
      layers.engineSub.type = "square";
      layers.engineSub.frequency.value = 35;
      const subGain = gain(0.35, engineLow);
      layers.engineSub.connect(subGain);
      layers.engineSub.start();
      ready = true;
    };
    // The browser only lets sound start from a gesture; the first one opens the context
    const unlock = () => {
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      init();
      if (ctx && ctx.state === "suspended") ctx.resume();
    };
    const voice = () => {
      const now = ctx.currentTime;
      let pick = voices[voiceNext];
      for (let i = 0; i < VOICES; i++) {
        const v = voices[(voiceNext + i) % VOICES];
        if (v.until <= now) {
          pick = v;
          voiceNext = (voiceNext + i + 1) % VOICES;
          return pick;
        }
      }
      voiceNext = (voiceNext + 1) % VOICES;
      return pick;
    };
    // One shaped note: type, start and end pitch, attack, hold, release, level, and a delay before it
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
    // A whoosh of the rush layer: level and length
    const whoosh = (level, dur) => {
      if (!ready) return;
      const now = ctx.currentTime, g = layers.rush.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(level, now + 0.08);
      g.linearRampToValueAtTime(0, now + dur);
    };
    const cues = {
      mark: () => {
        blip("square", NOTE(7), NOTE(7), 0.01, 0.08, 0.06, 0.2);
        blip("square", NOTE(12), NOTE(12), 0.01, 0.14, 0.1, 0.22, 0.14);
      },
      jump: () => {
        whoosh(0.18, 0.9);
        blip("sine", NOTE(-5), NOTE(-17), 0.02, 0.1, 0.4, 0.2);
      },
      ring: () => {
        blip("triangle", NOTE(12), NOTE(12), 0.005, 0.06, 0.1, 0.22);
        blip("triangle", NOTE(16), NOTE(16), 0.005, 0.06, 0.1, 0.22, 0.08);
        blip("triangle", NOTE(19), NOTE(24), 0.005, 0.12, 0.25, 0.24, 0.16);
      },
      miss: () => blip("square", NOTE(-2), NOTE(-7), 0.01, 0.06, 0.12, 0.08),
      pull: () => {
        blip("sine", 160, 50, 0.005, 0.08, 0.3, 0.4);
        whoosh(0.2, 0.7);
      },
      open: () => blip("triangle", 90, 60, 0.01, 0.12, 0.35, 0.28, 0.25),
      flare: () => blip("triangle", 300, 220, 0.02, 0.08, 0.16, 0.08),
      stand: () => blip("triangle", 90, 45, 0.005, 0.05, 0.2, 0.3),
      stumble: () => {
        blip("triangle", 100, 50, 0.005, 0.05, 0.18, 0.3);
        blip("triangle", 80, 40, 0.005, 0.05, 0.2, 0.22, 0.22);
      },
      tumble: () => {
        blip("sawtooth", 120, 30, 0.005, 0.15, 0.5, 0.4);
        whoosh(0.22, 0.6);
      },
      hole: () => {
        blip("sine", 70, 25, 0.005, 0.2, 0.6, 0.5);
        whoosh(0.3, 0.5);
      },
      pancake: () => {
        blip("triangle", 400, 60, 0.005, 0.03, 0.25, 0.35);
        blip("sawtooth", 90, 40, 0.005, 0.08, 0.3, 0.2, 0.03);
      },
      lost: () => blip("sine", NOTE(0), NOTE(-24), 0.02, 0.4, 0.9, 0.25),
      finish: () => {
        for (let i = 0; i < 4; i++) blip("square", NOTE([0, 4, 7, 12][i]), NOTE([0, 4, 7, 12][i]), 0.01, 0.1, 0.1, 0.22, i * 0.13);
        blip("sawtooth", NOTE(12), NOTE(12), 0.01, 0.5, 0.4, 0.18, 0.55);
      }
    };
    // Per frame: the engine follows the plane's speed and fades with its distance, the wind with the diver's speed,
    // the flutter under the canopy
    const update = (dt) => {
      if (!ready) return;
      const now = ctx.currentTime;
      const revs = clamp(state.planeSpeed / 24, 0, 1.3);
      const near = clamp(1 - state.planeDistance / 90, 0, 1);
      const engine = (0.012 + revs * 0.04) * near;
      layers.engine.frequency.setTargetAtTime(48 + revs * 70 + Math.sin(now * 9) * 3 * (1 - revs), now, 0.05);
      layers.engineSub.frequency.setTargetAtTime(24 + revs * 35, now, 0.05);
      layers.engineLow.frequency.setTargetAtTime(400 + revs * 1400, now, 0.06);
      layers.engineGain.gain.setTargetAtTime(engine, now, 0.08);
      const k = clamp(state.speed / 45, 0, 1);
      layers.windFilter.frequency.setTargetAtTime(350 + k * 1600, now, 0.1);
      layers.wind.gain.setTargetAtTime(state.falling * (0.01 + k * 0.1) + state.canopy * 0.012, now, 0.1);
      layers.flutter.gain.setTargetAtTime(state.canopy * (0.025 + state.flaring * 0.02), now, 0.12);
    };
    const quiet = () => {
      if (!ready) return;
      const now = ctx.currentTime;
      layers.engineGain.gain.setTargetAtTime(0, now, 0.05);
      layers.wind.gain.setTargetAtTime(0, now, 0.05);
      layers.flutter.gain.setTargetAtTime(0, now, 0.05);
      layers.rush.gain.cancelScheduledValues(now);
      layers.rush.gain.setTargetAtTime(0, now, 0.05);
    };
    const setMuted = (on) => {
      muted = !!on;
      if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05);
      try {
        localStorage.setItem(STORAGE_KEY, muted ? "off" : "on");
      } catch {
        // Storage may be unavailable
      }
    };
    // The scene is leaving: silence everything and close the context
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
      get voices() {
        return voices.length;
      },
      get context() {
        return ctx;
      }
    };
  };
  BL.dropAudio = { create, VOICES };
})();
