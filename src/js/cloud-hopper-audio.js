// Cloud Hopper's score and local effects share one gesture-opened context.
// Fixed voices and one noise loop; music and cues only schedule automation.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const MASTER = 0.45, CLOUD_VOICES = 6, CLOUD_NEAR = 4, CLOUD_FAR = 50;
  const BACKGROUND_AHEAD = 2, BACKGROUND_MS = 250;
  const create = () => {
    let ctx = null, master = null, musicGain = null, jetGain = null, jetTone = null, jetWhine = null, jetFilter = null, music = null;
    let armed = false, disposed = false, resuming = false, jetOn = false, muted = BL.sound.muted, nextJump = 0;
    let musicStage = "", backgroundTimer = 0;
    let musicLevel = 0, musicFrom = 0, musicAt = 0, musicUntil = 0, musicFade = 0.12;
    const jumps = [], clouds = [];
    const resultStage = value => value === "won" || value === "best" || value === "dq";
    const levelAt = now => musicUntil <= now ? musicLevel
      : musicFrom + (musicLevel - musicFrom) * Math.max(0, (now - musicAt) / (musicUntil - musicAt));
    const applyLevel = () => {
      if (!musicGain) return;
      const gain = musicGain.gain;
      gain.cancelScheduledValues(musicAt); gain.setValueAtTime(musicFrom, musicAt);
      gain.linearRampToValueAtTime(musicLevel, musicUntil);
    };
    // Spatial dock fades and ascent change only the score's mix. Restart a
    // finite ramp from its current level without interrupting notes or echoes.
    const level = (value, seconds = 0.12) => {
      if (disposed || !Number.isFinite(value)) return;
      const target = Math.max(0, Math.min(1, value));
      if (target === musicLevel) return;
      const now = ctx ? ctx.currentTime : 0;
      musicFrom = levelAt(now); musicLevel = target;
      musicFade = Number.isFinite(seconds) ? Math.max(0, seconds) : 0.12;
      musicAt = now; musicUntil = now + musicFade;
      applyLevel();
    };
    const quiet = (effectsOnly = false) => {
      jetOn = false;
      if (!ctx) return;
      const now = ctx.currentTime;
      for (let i = 0; i < jumps.length; i++) {
        const voice = jumps[i];
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(0, now);
      }
      for (let i = 0; i < clouds.length; i++) {
        const voice = clouds[i];
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(0, now);
        voice.until = 0;
      }
      if (jetGain) {
        jetGain.gain.cancelScheduledValues(now);
        jetGain.gain.setValueAtTime(0, now);
        jetTone.frequency.cancelScheduledValues(now); jetTone.frequency.setValueAtTime(54, now);
        jetWhine.frequency.cancelScheduledValues(now); jetWhine.frequency.setValueAtTime(220, now);
        jetFilter.frequency.cancelScheduledValues(now); jetFilter.frequency.setValueAtTime(700, now);
      }
      // The score retains its timeline through results and skips unheard notes
      // when a muted or suspended context becomes audible again.
      if (music && !effectsOnly) music.quiet();
    };
    const audible = () => armed && !disposed && !muted && musicStage && ctx && ctx.state === "running";
    const clearBackground = () => {
      if (backgroundTimer) window.clearTimeout(backgroundTimer);
      backgroundTimer = 0;
    };
    // Rendering sleeps in a hidden tab. Keep only the score's AudioParam queue
    // supplied, with enough lead for a delayed background timer wakeup.
    const background = () => {
      backgroundTimer = 0;
      if (!document.hidden || !audible()) return;
      music.tick(BACKGROUND_AHEAD);
      backgroundTimer = window.setTimeout(background, BACKGROUND_MS);
    };
    const syncBackground = () => {
      clearBackground();
      if (document.hidden && audible()) background();
    };
    const stateChanged = () => {
      if (ctx && ctx.state !== "running") quiet();
      syncBackground();
    };
    const open = () => {
      if (ctx || typeof AudioContext === "undefined") return;
      try { ctx = new AudioContext(); } catch { return; }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER;
      master.connect(ctx.destination);
      const gain = (value, to) => {
        const node = ctx.createGain();
        node.gain.value = value; node.connect(to);
        return node;
      };
      const filter = (type, frequency, q, to) => {
        const node = ctx.createBiquadFilter();
        node.type = type; node.frequency.value = frequency; node.Q.value = q; node.connect(to);
        return node;
      };
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer; noise.loop = true;
      for (let i = 0; i < 2; i++) {
        const level = gain(0, master), tone = ctx.createOscillator();
        tone.type = "triangle"; tone.frequency.value = 180;
        tone.connect(gain(0.65, level)); tone.start();
        const air = filter("bandpass", 1400, 0.7, gain(0.5, level));
        noise.connect(air);
        jumps.push({ gain: level, tone });
      }
      for (let i = 0; i < CLOUD_VOICES; i++) {
        // A broad, steady wash avoids the old descending nasal hiss.
        const level = gain(0, master), air = filter("lowpass", 1000, 0.45, level);
        noise.connect(filter("highpass", 150, 0.5, air));
        clouds.push({ gain: level, until: 0, level: 0 });
      }
      jetGain = gain(0, master);
      // Soft exhaust, a warm motor body and a faint turbine whistle. A small
      // retained flutter keeps the air alive without a harsh sawtooth buzz.
      const jetAir = gain(0.66, jetGain), flutter = ctx.createOscillator();
      jetFilter = filter("lowpass", 700, 0.55, jetAir);
      noise.connect(filter("highpass", 100, 0.7, jetFilter));
      flutter.type = "sine"; flutter.frequency.value = 32;
      flutter.connect(gain(0.045, jetAir.gain)); flutter.start();
      jetTone = ctx.createOscillator();
      jetTone.type = "triangle"; jetTone.frequency.value = 54;
      jetTone.connect(filter("lowpass", 240, 0.7, gain(0.22, jetGain)));
      jetWhine = ctx.createOscillator();
      jetWhine.type = "sine"; jetWhine.frequency.value = 220;
      jetWhine.connect(gain(0.045, jetGain));
      musicGain = gain(0, master);
      musicFrom = 0; musicAt = ctx.currentTime; musicUntil = musicAt + musicFade;
      applyLevel();
      music = BL.cloudHopperMusic.create(ctx, musicGain, noise);
      music.stage(musicStage);
      jetTone.start(); jetWhine.start(); noise.start();
      ctx.addEventListener("statechange", stateChanged);
    };
    // Dock entry and Start/Replay arm audio after the page's first gesture;
    // trusted input retries a browser-suspended context.
    const unlock = () => {
      if (disposed) return;
      armed = true;
      if (document.hidden || navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      open();
      if (ctx && ctx.state !== "running" && ctx.state !== "closed" && !resuming) {
        resuming = true;
        ctx.resume().then(() => { resuming = false; }, () => { resuming = false; });
      }
      syncBackground();
    };
    const ready = () => !document.hidden && audible();
    const stage = (next) => {
      if (disposed || next === musicStage) return;
      if (next !== "dock" && next !== "intro" && next !== "lifting" && next !== "briefing" && next !== "ready" && next !== "running" && !resultStage(next)) { stop(); return; }
      // Finish gameplay effects while the same music loop carries on underneath
      // the results panel, without restarting its beat or cutting its tails.
      if (next === "dock" || next === "intro" || resultStage(next)) quiet(true);
      musicStage = next;
      if (music) music.stage(next);
      syncBackground();
    };
    const tick = () => { if (ready()) music.tick(); };
    const jump = () => {
      if (!ready()) return;
      const now = ctx.currentTime, voice = jumps[nextJump];
      nextJump = 1 - nextJump;
      const pitch = voice.tone.frequency, level = voice.gain.gain;
      pitch.cancelScheduledValues(now);
      pitch.setValueAtTime(180, now);
      pitch.exponentialRampToValueAtTime(390, now + 0.07);
      pitch.exponentialRampToValueAtTime(240, now + 0.22);
      level.cancelScheduledValues(now);
      level.setValueAtTime(0, now);
      level.linearRampToValueAtTime(0.26, now + 0.012);
      level.exponentialRampToValueAtTime(0.0001, now + 0.22);
      level.setValueAtTime(0, now + 0.23);
    };
    const fade = (distance) => {
      if (!ready() || !Number.isFinite(distance) || distance >= CLOUD_FAR) return;
      const near = Math.max(0, Math.min(1, (CLOUD_FAR - distance) / (CLOUD_FAR - CLOUD_NEAR)));
      const level = 0.18 * near * near, now = ctx.currentTime;
      let voice = null;
      for (let i = 0; i < clouds.length; i++) {
        const candidate = clouds[i];
        if (candidate.until <= now) { voice = candidate; break; }
        if (!voice || candidate.level < voice.level) voice = candidate;
      }
      // Keep a close disappearance audible when several remote ones overlap.
      if (voice.until > now && voice.level > level) return;
      voice.until = now + 0.76; voice.level = level;
      const volume = voice.gain.gain;
      volume.cancelScheduledValues(now);
      volume.setValueAtTime(0, now);
      volume.linearRampToValueAtTime(level, now + 0.14);
      volume.exponentialRampToValueAtTime(0.0001, now + 0.75);
      volume.setValueAtTime(0, now + 0.76);
    };
    const jet = (on) => {
      on = !!on && !!ready();
      if (on === jetOn) return;
      jetOn = on;
      if (!ctx) return;
      const now = ctx.currentTime, level = jetGain.gain, body = jetTone.frequency, turbine = jetWhine.frequency, air = jetFilter.frequency;
      const volume = level.value, bodyHz = body.value, turbineHz = turbine.value, airHz = air.value;
      // Retain the current spool on quick taps; normal release winds down
      // briefly and reaches exact silence. Quiet/results bypass this tail.
      level.cancelScheduledValues(now); level.setValueAtTime(volume, now);
      level.setTargetAtTime(on ? 0.27 : 0, now, on ? 0.035 : 0.045);
      if (!on) level.setValueAtTime(0, now + 0.22);
      body.cancelScheduledValues(now); body.setValueAtTime(bodyHz, now);
      body.exponentialRampToValueAtTime(on ? 82 : 48, now + 0.18);
      turbine.cancelScheduledValues(now); turbine.setValueAtTime(turbineHz, now);
      turbine.exponentialRampToValueAtTime(on ? 390 : 180, now + 0.2);
      air.cancelScheduledValues(now); air.setValueAtTime(airHz, now);
      air.exponentialRampToValueAtTime(on ? 1650 : 600, now + 0.18);
    };
    const gate = () => {
      if (muted) quiet();
      else if (document.hidden) quiet(true);
      if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.015);
      // Prime before the frame loop stops; returning leaves queued notes intact.
      syncBackground();
    };
    const gesture = event => { if (armed && event.isTrusted) unlock(); };
    const offSound = BL.sound.subscribe(on => { muted = on; gate(); });
    document.addEventListener("visibilitychange", gate);
    window.addEventListener("pointerdown", gesture, true);
    window.addEventListener("keydown", gesture, true);
    const stop = () => {
      armed = false; musicStage = ""; clearBackground(); quiet();
      musicFrom = musicLevel = 0; musicAt = musicUntil = ctx ? ctx.currentTime : 0;
      applyLevel();
      if (music) music.stop();
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true; stop(); offSound();
      document.removeEventListener("visibilitychange", gate);
      window.removeEventListener("pointerdown", gesture, true);
      window.removeEventListener("keydown", gesture, true);
      if (ctx) {
        ctx.removeEventListener("statechange", stateChanged);
        ctx.close().catch(() => {});
      }
      ctx = master = musicGain = jetGain = jetTone = jetWhine = jetFilter = music = null;
      jumps.length = clouds.length = 0;
    };
    return { unlock, stage, level, tick, jump, fade, jet, stop, dispose };
  };
  BL.cloudHopperAudio = { create };
})();
