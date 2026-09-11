// Procedural race sound: one context made on the first gesture, a fixed voice pool gated by gain, one noise loop
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp } = BL.math;
  const VOICES = 8;
  const NOISE_SECONDS = 2;
  const MASTER = 0.55;
  const STORAGE_KEY = "oogaboogaland.audio";
  const NOTE = (semis) => 220 * Math.pow(2, semis / 12);
  // Gearbox: the top of each gear as a share of top speed; first gear pulls from idle, every later gear
  // drops in at DROP_IN revs and winds to the limiter, then the cruise shifts take over flat out
  const GEARS = [0.42, 0.78, 1.05];
  const SHIFT_DOWN = 0.05, DROP_IN = 0.55, SHIFT_HOLD = 0.09;
  // Flat out, the engine settles through two cruise shifts, each lower and quieter, so it never drones
  const CRUISE_AFTER = [1.4, 2.2], CRUISE_PITCH = [1, 0.82, 0.68], CRUISE_LEVEL = [1, 0.78, 0.62];
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
    const layers = { engine: null, engineSub: null, engineLow: null, engineGain: null, pop: null, growl: null, growlGain: null, wind: null, drift: null, crowd: null, crowdLfo: null, rain: null, screech: null, screechFilter: null };
    const state = { speed: 0, top: 24, mount: "kart", throttle: 0, drifting: 0, boosting: 0, offroad: 0, crowd: 0, rain: 0, strideT: 0, gear: 0, rpm: 0, cruise: 0, cruiseT: 0, wasOpen: false, popAt: -9, shiftAt: -9 };
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
      // Voice pool: an oscillator each, silent until an envelope opens its gain
      for (let i = 0; i < VOICES; i++) {
        const g = gain(0, master);
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = 220;
        osc.connect(g);
        osc.start();
        voices.push({ osc, gain: g, until: 0 });
      }
      // White noise loop for wind, drift scrub and the crowd
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const wind = filter("bandpass", 700, 0.6);
      layers.wind = gain(0, master);
      wind.connect(layers.wind);
      const drift = filter("bandpass", 1800, 2.5);
      layers.drift = gain(0, master);
      drift.connect(layers.drift);
      const crowd = filter("bandpass", 600, 0.8);
      layers.crowd = gain(0, master);
      crowd.connect(layers.crowd);
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.35;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.35;
      lfo.connect(lfoGain);
      lfoGain.connect(crowd.frequency);
      lfo.start();
      layers.crowdLfo = lfo;
      const rain = filter("lowpass", 2200, 0.5);
      layers.rain = gain(0, master);
      rain.connect(layers.rain);
      // Exhaust pops: low thumps of noise on a lift at high revs
      const popLow = filter("lowpass", 320, 1.2);
      layers.pop = gain(0, master);
      popLow.connect(layers.pop);
      noise.connect(popLow);
      // Tyre screech: a sharp band of noise swept down while its gain rings out
      const screech = filter("bandpass", 1100, 7);
      layers.screech = gain(0, master);
      layers.screechFilter = screech;
      screech.connect(layers.screech);
      noise.connect(screech);
      noise.connect(wind);
      noise.connect(drift);
      noise.connect(crowd);
      noise.connect(rain);
      noise.start();
      // Engine: a sawtooth and a square an octave under it through one low-pass that opens with the revs
      const engineLow = filter("lowpass", 500, 1.6);
      layers.engineLow = engineLow;
      layers.engineGain = gain(0, master);
      engineLow.connect(layers.engineGain);
      layers.engine = ctx.createOscillator();
      layers.engine.type = "sawtooth";
      layers.engine.frequency.value = 50;
      layers.engine.connect(engineLow);
      layers.engine.start();
      layers.engineSub = ctx.createOscillator();
      layers.engineSub.type = "square";
      layers.engineSub.frequency.value = 25;
      const subGain = gain(0.35, engineLow);
      layers.engineSub.connect(subGain);
      layers.engineSub.start();
      const growlLow = filter("lowpass", 400, 2);
      layers.growlGain = gain(0, master);
      growlLow.connect(layers.growlGain);
      layers.growl = ctx.createOscillator();
      layers.growl.type = "triangle";
      layers.growl.frequency.value = 45;
      layers.growl.connect(growlLow);
      layers.growl.start();
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
    // A peel-out: level and length scale with how hard the tyres bite
    const screech = (level = 0.14, dur = 0.4) => {
      if (!ready) return;
      const now = ctx.currentTime, g = layers.screech.gain, f = layers.screechFilter.frequency;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(level, now + 0.03);
      g.linearRampToValueAtTime(0, now + dur);
      f.cancelScheduledValues(now);
      f.setValueAtTime(1500, now);
      f.exponentialRampToValueAtTime(600, now + dur);
    };
    const cues = {
      screech,
      count: () => blip("square", NOTE(0), NOTE(0), 0.01, 0.12, 0.08, 0.25),
      go: () => blip("square", NOTE(12), NOTE(12), 0.01, 0.35, 0.2, 0.3),
      banana: () => blip("triangle", NOTE(19), NOTE(24), 0.005, 0.05, 0.08, 0.22),
      meter: () => {
        blip("triangle", NOTE(12), NOTE(24), 0.01, 0.1, 0.2, 0.25);
        blip("square", NOTE(19), NOTE(31), 0.01, 0.1, 0.25, 0.12);
      },
      crate: () => {
        blip("square", NOTE(7), NOTE(7), 0.005, 0.07, 0.05, 0.2);
        blip("square", NOTE(14), NOTE(14), 0.005, 0.09, 0.08, 0.2, 0.09);
      },
      throwRock: () => blip("sawtooth", 180, 60, 0.005, 0.04, 0.16, 0.25),
      peel: () => blip("sine", NOTE(-5), NOTE(-17), 0.01, 0.05, 0.25, 0.3),
      turbo: () => blip("sawtooth", 120, 900, 0.03, 0.25, 0.35, 0.2),
      shout: () => {
        blip("sawtooth", NOTE(-12), NOTE(-14), 0.02, 0.3, 0.3, 0.3);
        blip("square", NOTE(-5), NOTE(-7), 0.02, 0.3, 0.3, 0.15);
      },
      hit: () => blip("sine", 140, 40, 0.005, 0.08, 0.3, 0.45),
      bump: () => blip("triangle", 110, 70, 0.005, 0.03, 0.12, 0.25),
      wall: () => blip("sawtooth", 160, 90, 0.005, 0.04, 0.14, 0.2),
      land: () => blip("triangle", 90, 50, 0.005, 0.04, 0.15, 0.3),
      hop: () => blip("triangle", 300, 520, 0.01, 0.03, 0.06, 0.12),
      boost: () => blip("sawtooth", 200, 1200, 0.02, 0.2, 0.4, 0.22),
      respawn: () => blip("sine", 400, 100, 0.01, 0.2, 0.4, 0.2),
      splash: () => blip("triangle", 260, 60, 0.01, 0.15, 0.4, 0.3),
      driftStart: () => blip("square", NOTE(-7), NOTE(-2), 0.01, 0.05, 0.08, 0.1),
      lap: () => {
        blip("square", NOTE(7), NOTE(7), 0.01, 0.08, 0.06, 0.2);
        blip("square", NOTE(12), NOTE(12), 0.01, 0.08, 0.06, 0.2, 0.12);
        blip("square", NOTE(19), NOTE(19), 0.01, 0.2, 0.2, 0.25, 0.24);
      },
      finish: () => {
        for (let i = 0; i < 4; i++) blip("square", NOTE([0, 4, 7, 12][i]), NOTE([0, 4, 7, 12][i]), 0.01, 0.1, 0.1, 0.22, i * 0.13);
        blip("sawtooth", NOTE(12), NOTE(12), 0.01, 0.5, 0.4, 0.18, 0.55);
      },
    };
    // Per frame: pitch the engine to speed, open wind with speed, scrub while drifting, murmur near the crowd
    const update = (dt) => {
      if (!ready) return;
      const now = ctx.currentTime;
      const k = clamp(Math.abs(state.speed) / state.top, 0, 1.4);
      const running = state.mount === "run";
      if (running) {
        layers.engineGain.gain.setTargetAtTime(0, now, 0.05);
        layers.growlGain.gain.setTargetAtTime(0, now, 0.05);
        // Footfalls: a soft thump each stride
        state.strideT += dt * (2 + k * 5);
        if (state.strideT >= 1 && k > 0.1) {
          state.strideT = 0;
          blip("triangle", 80 + k * 20, 50, 0.004, 0.02, 0.06, 0.08 + k * 0.08);
        }
      } else if (state.mount === "dino") {
        layers.engineGain.gain.setTargetAtTime(0, now, 0.05);
        layers.growl.frequency.setTargetAtTime(38 + k * 40 + Math.sin(now * 9) * 3, now, 0.05);
        layers.growlGain.gain.setTargetAtTime(0.05 + k * 0.14, now, 0.08);
      } else {
        layers.growlGain.gain.setTargetAtTime(0, now, 0.05);
        // Pick the gear with a little hysteresis, then place the revs inside it
        let gear = state.gear;
        while (gear < GEARS.length - 1 && k > GEARS[gear]) gear++;
        while (gear > 0 && k < GEARS[gear - 1] - SHIFT_DOWN) gear--;
        const lo = gear ? GEARS[gear - 1] : 0, hi = GEARS[gear];
        const open = state.throttle > 0.1 || state.boosting;
        // Revving at the line blips the engine up and down before the wheels turn
        const sweep = clamp((k - lo) / (hi - lo), 0, 1);
        const rpm = k < 0.04 && state.throttle > 0.5 ? 0.45 + 0.5 * Math.abs(Math.sin(now * 4.2)) : gear ? DROP_IN + sweep * (1 - DROP_IN) : sweep;
        // Flat out in top gear the cruise shifts count up on a timer; any lift or slowdown resets them
        const flat = gear === GEARS.length - 1 && k > 0.9 && open;
        state.cruiseT = flat ? state.cruiseT + dt : 0;
        let cruise = flat ? state.cruise : 0;
        if (flat && cruise < CRUISE_AFTER.length && state.cruiseT > CRUISE_AFTER[cruise]) {
          cruise++;
          state.cruiseT = 0;
        }
        if (gear !== state.gear || cruise !== state.cruise) {
          // A shift: the clutch dips the note and the engine catches its breath before it pulls again
          state.gear = gear;
          state.cruise = cruise;
          const g = layers.engineGain.gain;
          g.cancelScheduledValues(now);
          g.setValueAtTime(g.value * 0.3, now);
          state.shiftAt = now;
        }
        state.rpm = rpm;
        // Lifting off near the redline pops the exhaust, twice
        if (state.wasOpen && !open && rpm > 0.7 && now - state.popAt > 1.2) {
          state.popAt = now;
          const g = layers.pop.gain;
          g.cancelScheduledValues(now);
          g.setValueAtTime(0.16, now);
          g.linearRampToValueAtTime(0, now + 0.05);
          g.setValueAtTime(0.1, now + 0.1);
          g.linearRampToValueAtTime(0, now + 0.15);
        }
        state.wasOpen = open;
        // A lumpy idle at the bottom and a limiter stutter when a gear is wrung out
        const lump = Math.sin(now * 9) * 4 * (1 - rpm);
        const limiter = rpm > 0.96 && gear < GEARS.length - 1 && open ? 0.55 + 0.45 * (Math.sin(now * 95) > 0 ? 1 : 0) : 1;
        // Loud off the line: low gears carry the most level, and it eases as the box climbs
        const freq = (44 + rpm * 96 + gear * 4 + state.boosting * 30 + lump) * CRUISE_PITCH[cruise];
        const level = ((0.055 + rpm * 0.1) * (1.1 - gear * 0.08) * (open ? 1 : 0.6) + state.boosting * 0.035) * CRUISE_LEVEL[cruise] * limiter;
        layers.engine.frequency.setTargetAtTime(freq, now, 0.035);
        layers.engineSub.frequency.setTargetAtTime(freq * 0.5, now, 0.035);
        layers.engineLow.frequency.setTargetAtTime((420 + rpm * 1500 + gear * 120 - (open ? 0 : 200)) * CRUISE_PITCH[cruise], now, 0.05);
        if (now - state.shiftAt > SHIFT_HOLD) layers.engineGain.gain.setTargetAtTime(level, now, 0.06);
      }
      layers.wind.gain.setTargetAtTime(Math.max(0, k - 0.5) * 0.03 + state.boosting * 0.02, now, 0.1);
      layers.drift.gain.setTargetAtTime(state.drifting * (0.025 + k * 0.03) + state.offroad * k * 0.02, now, 0.06);
      layers.crowd.gain.setTargetAtTime(state.crowd * 0.05, now, 0.3);
      layers.rain.gain.setTargetAtTime(state.rain * 0.05, now, 0.5);
    };
    const quiet = () => {
      if (!ready) return;
      const now = ctx.currentTime;
      layers.engineGain.gain.setTargetAtTime(0, now, 0.05);
      layers.growlGain.gain.setTargetAtTime(0, now, 0.05);
      layers.wind.gain.setTargetAtTime(0, now, 0.05);
      layers.drift.gain.setTargetAtTime(0, now, 0.05);
      layers.crowd.gain.setTargetAtTime(0, now, 0.2);
      layers.rain.gain.setTargetAtTime(0, now, 0.3);
      layers.pop.gain.cancelScheduledValues(now);
      layers.pop.gain.setTargetAtTime(0, now, 0.05);
      layers.screech.gain.cancelScheduledValues(now);
      layers.screech.gain.setTargetAtTime(0, now, 0.05);
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
  BL.raceAudio = { create, VOICES };
})();
