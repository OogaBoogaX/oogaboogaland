// The observatory: quiet air, a ceiling harmony and glass answering a held gaze.
// One pooled graph, independent of screen refreshes; no recordings or per-frame/cue nodes.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const WALL_NOTES = [294, 392, 490, 367.5, 441, 588, 392, 330.75];
  const create = () => {
    const channel = BL.sound.channel("room"), voices = [];
    channel.show(false);
    let ctx = null, master = null, ambience = null, foundation = null, airLevel = null, airFilter = null, bank = null, pan = null, ceiling = null, relayPan = null, relay = null, relayPartial = null, crossing = null, penNoise = null, penBody = null, penTone = null, penFilter = null, acoustics = null;
    let enabled = false, disposed = false, timer = 0, since = 0, elapsed = 0, nextTick = 8, gaze = 0, focus = -1, heardFocus = -1, dwell = 0, ringWait = 0;
    const gain = (value, to) => {
      const node = ctx.createGain(); node.gain.value = value; node.connect(to); return node;
    };
    const tone = (frequency, level, to) => {
      const volume = gain(level, to), source = ctx.createOscillator();
      source.type = "sine"; source.frequency.value = frequency; source.connect(volume); source.start();
      voices.push(source); return { source, volume };
    };
    const arrive = () => {
      if (!ctx || !enabled || BL.sound.muted || document.hidden) return;
      const now = ctx.currentTime;
      crossing.source.frequency.cancelScheduledValues(now);
      crossing.source.frequency.setValueAtTime(196, now);
      crossing.source.frequency.exponentialRampToValueAtTime(73.4, now + 0.8);
      crossing.volume.gain.cancelScheduledValues(now);
      crossing.volume.gain.setValueAtTime(0, now);
      crossing.volume.gain.linearRampToValueAtTime(0.045, now + 0.09);
      crossing.volume.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    };
    const activate = () => {
      if (disposed || !enabled || document.hidden || BL.sound.muted || typeof AudioContext === "undefined"
        || navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      if (ctx) { if (ctx.state === "suspended") ctx.resume().catch(() => {}); return; }
      ctx = new AudioContext(); master = gain(0, channel.node(ctx));
      acoustics = BL.roomAcoustics.create(ctx, master, channel.node(ctx), 0.4);
      ambience = gain(1, master); foundation = gain(1, ambience);
      // Open octaves/fifths instead of close-pitched electrical beats. The room breathes
      // through levels and air colour, leaving speech frequencies mostly empty.
      tone(49, 0.026, foundation); tone(98, 0.008, foundation);
      pan = ctx.createStereoPanner(); pan.connect(ambience); bank = gain(0, pan);
      tone(147, 0.009, bank); tone(196, 0.004, bank);
      ceiling = gain(0, ambience);
      tone(73.5, 0.026, ceiling); tone(245, 0.009, ceiling);
      airFilter = ctx.createBiquadFilter(); airFilter.type = "lowpass"; airFilter.frequency.value = 720; airFilter.Q.value = 0.4;
      const airHigh = ctx.createBiquadFilter(); airHigh.type = "highpass"; airHigh.frequency.value = 150; airHigh.Q.value = 0.4;
      airHigh.connect(airFilter); airLevel = gain(0.021, ambience); airFilter.connect(airLevel);
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), samples = buffer.getChannelData(0);
      const random = BL.math.mulberry32(71403);
      for (let i = 0; i < samples.length; i++) samples[i] = random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = buffer; noise.loop = true; noise.connect(airHigh); noise.start(); voices.push(noise);
      penFilter = ctx.createBiquadFilter(); penFilter.type = "bandpass"; penFilter.frequency.value = 3200; penFilter.Q.value = 0.8;
      penNoise = gain(0, master); noise.connect(penFilter); penFilter.connect(penNoise);
      const bodyFilter = ctx.createBiquadFilter(); bodyFilter.type = "bandpass"; bodyFilter.frequency.value = 850; bodyFilter.Q.value = 1.1;
      penBody = gain(0, master); noise.connect(bodyFilter); bodyFilter.connect(penBody);
      penTone = tone(2300, 0, master);
      relayPan = ctx.createStereoPanner(); relayPan.connect(ambience);
      relay = tone(392, 0, relayPan); relayPartial = tone(1030, 0, relayPan);
      crossing = tone(196, 0, master);
      master.gain.setTargetAtTime(0.55, ctx.currentTime, 0.6); arrive();
    };
    const clickPulse = (volume, at, level, tail) => {
      volume.setValueAtTime(0, at - 0.001);
      volume.linearRampToValueAtTime(level, at);
      volume.exponentialRampToValueAtTime(0.0001, at + tail);
      volume.setValueAtTime(0, at + tail + 0.002);
    };
    const clickEnvelope = (volume, down, up, now, tail) => {
      volume.cancelScheduledValues(now); volume.setValueAtTime(0, now);
      // A dry latch, silence, then a brighter return-stop click: two attacks, never a swelling second beep.
      clickPulse(volume, now + 0.05, down, tail);
      clickPulse(volume, now + 0.17, up, tail * 0.7);
    };
    const click = () => {
      activate();
      if (!ctx || !enabled || disposed || document.hidden || BL.sound.muted) return;
      const now = ctx.currentTime, strength = 0.94 + Math.random() * 0.12;
      // Match the button reaching its stop at 50 ms and springing fully back at 170 ms.
      // Low plastic-body noise gives the press weight; the release is shorter and sharper.
      clickEnvelope(penNoise.gain, 0.16 * strength, 0.2 * strength, now, 0.013);
      clickEnvelope(penBody.gain, 0.12 * strength, 0.065 * strength, now, 0.024);
      clickEnvelope(penTone.volume.gain, 0.008 * strength, 0.005 * strength, now, 0.009);
      const filter = penFilter.frequency, spring = penTone.source.frequency;
      filter.cancelScheduledValues(now); filter.setValueAtTime(3200 * strength, now);
      filter.setValueAtTime(4600 * strength, now + 0.16);
      spring.cancelScheduledValues(now); spring.setValueAtTime(2300 * strength, now);
      spring.setValueAtTime(2300 * strength, now + 0.049);
      spring.exponentialRampToValueAtTime(1600 * strength, now + 0.063);
      spring.setValueAtTime(3100 * strength, now + 0.169);
      spring.exponentialRampToValueAtTime(2200 * strength, now + 0.18);
    };
    const ring = (frequency, level, side, now) => {
      relayPan.pan.setTargetAtTime(side, now, 0.08);
      relay.source.frequency.setValueAtTime(frequency, now);
      relayPartial.source.frequency.setValueAtTime(frequency * 2.63, now);
      for (let i = 0; i < 2; i++) {
        const volume = (i ? relayPartial : relay).volume.gain;
        volume.cancelScheduledValues(now); volume.setValueAtTime(0, now);
        volume.linearRampToValueAtTime(level * (i ? 0.27 : 1), now + 0.035);
        volume.exponentialRampToValueAtTime(0.0001, now + (i ? 1.2 : 2.4));
        volume.setValueAtTime(0, now + 2.5);
      }
      ringWait = 4; nextTick = 8 + Math.random() * 8;
    };
    const quiet = () => {
      clearTimeout(timer); timer = 0;
      if (!ctx) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now); master.gain.setTargetAtTime(0, now, 0.06);
      timer = setTimeout(() => { timer = 0; if (ctx && ctx.state === "running") ctx.suspend().catch(() => {}); }, 350);
    };
    const refresh = () => {
      if (!enabled || document.hidden || BL.sound.muted) { quiet(); return; }
      clearTimeout(timer); timer = 0; activate();
      if (ctx) master.gain.setTargetAtTime(0.55, ctx.currentTime, 0.5);
    };
    const setActive = (on) => {
      on = !!on; if (enabled === on) return;
      const ready = !!ctx;
      since = gaze = dwell = ringWait = 0; focus = heardFocus = -1; nextTick = 8;
      if (ceiling) { ceiling.gain.cancelScheduledValues(ctx.currentTime); ceiling.gain.setValueAtTime(0, ctx.currentTime); }
      enabled = on; channel.show(on); BL.roomAcoustics.setActive(on); refresh(); if (on && ready) arrive();
    };
    const update = (dt, camera, seated = false) => {
      if (!enabled || disposed || document.hidden) return;
      if (!ctx) activate();
      since += dt; elapsed += dt;
      if (!ctx || ctx.state !== "running" || since < 0.1 || BL.sound.muted) return;
      const step = Math.min(0.25, since); since = 0;
      const eye = camera.position, dx = camera.target.x - eye.x, dy = camera.target.y - eye.y, dz = camera.target.z - eye.z;
      const length = Math.max(0.001, Math.hypot(dx, dz)), radius = Math.hypot(eye.x, eye.z);
      const up = dy / Math.max(0.001, Math.hypot(dx, dy, dz));
      gaze += (Math.max(0, Math.min(1, (up - 0.18) / 0.62)) - gaze) * Math.min(1, step * 2);
      // The north-east rack is a quiet spatial anchor, rather than a constant buzzing foreground.
      const sx = 7.5 - eye.x, sz = -7.5 - eye.z, distance = Math.max(1, Math.hypot(sx, sz));
      pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (-dz * sx + dx * sz) / (length * distance))), ctx.currentTime, 0.25);
      const now = ctx.currentTime, talking = BL.voice.stats.speaking || BL.voice.stats.hearing > 0;
      ambience.gain.setTargetAtTime(talking ? 0.55 : 1, now, 0.6);
      // Looking up trades some foundation for an audible ceiling harmony. Screen
      // content never controls these levels or filters, including during a switch.
      foundation.gain.setTargetAtTime((1 - 0.35 * gaze) * (0.92 + Math.sin(elapsed * 0.17) * 0.08), now, 1.2);
      ceiling.gain.setTargetAtTime(gaze * (0.9 + Math.sin(elapsed * 0.19) * 0.1), now, 0.65);
      bank.gain.setTargetAtTime((0.12 + Math.min(1, radius / 9) * 0.35) * (seated ? 0.65 : 1), now, 0.7);
      airFilter.frequency.setTargetAtTime(720 + Math.sin(elapsed * 0.11) * 110, now, 1.2);
      airLevel.gain.setTargetAtTime(0.021 * (0.9 + Math.sin(elapsed * 0.23) * 0.1), now, 1);
      // Intersect the gaze with the circular wall. A held glance answers once;
      // sweeping past banks or jittering at their boundary cannot rattle the room.
      const room = BL.architectCave, ux = dx / length, uz = dz / length, along = eye.x * ux + eye.z * uz;
      const reach = -along + Math.sqrt(Math.max(0, along * along + room.RADIUS * room.RADIUS - radius * radius));
      const wallY = eye.y + dy / length * reach;
      const sector = Math.abs(up) < 0.85 && wallY > room.FLOOR + 0.2 && wallY < room.FLOOR + room.HEIGHT - 0.2
        ? (Math.round(Math.atan2(eye.x + ux * reach, eye.z + uz * reach) * 4 / Math.PI) + 8) % 8 : -1;
      if (sector !== focus) { focus = sector; dwell = 0; }
      else dwell += step;
      ringWait = Math.max(0, ringWait - step); nextTick -= step;
      if (focus >= 0 && focus !== heardFocus && dwell >= 0.7 && !ringWait) {
        const angle = focus * Math.PI / 4, rx = Math.sin(angle) * room.RADIUS - eye.x, rz = Math.cos(angle) * room.RADIUS - eye.z;
        const side = Math.max(-1, Math.min(1, (-dz * rx + dx * rz) / (length * Math.max(1, Math.hypot(rx, rz)))));
        ring(WALL_NOTES[focus], 0.024, side, now); heardFocus = focus;
      } else if (nextTick <= 0 && !ringWait) ring(WALL_NOTES[Math.floor(Math.random() * WALL_NOTES.length)], 0.012, Math.random() * 1.4 - 0.7, now);
    };
    const off = BL.sound.subscribe(refresh);
    window.addEventListener("pointerdown", activate, true); window.addEventListener("keydown", activate, true);
    document.addEventListener("visibilitychange", refresh);
    return { update, setActive, click,
      dispose() {
        disposed = true; clearTimeout(timer); off(); BL.roomAcoustics.setActive(false); acoustics?.dispose(); acoustics = null; channel.release();
        window.removeEventListener("pointerdown", activate, true); window.removeEventListener("keydown", activate, true);
        document.removeEventListener("visibilitychange", refresh);
        if (ctx) ctx.close().catch(() => {});
        ctx = master = ambience = foundation = airLevel = airFilter = bank = pan = ceiling = relayPan = relay = relayPartial = crossing = penNoise = penBody = penTone = penFilter = null; voices.length = 0;
      }
    };
  };
  BL.architectAudio = { create };
})();
