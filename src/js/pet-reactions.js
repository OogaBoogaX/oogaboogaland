// A hammock companion watches the nearest other live body within four metres. Every viewer uses its own
// rendered bodies; NPC/ghost tracks never participate and nothing is sent to the room. One pooled yap voice
// serves the island's single hammock, opened after a gesture, gated by environment sound and closed on leave.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {}, { mat4 } = BL.math;
  const RADIUS = 4, PERIOD = 1.2;
  const matrix = mat4.create(), inverse = mat4.create(), point = new Float32Array(3);
  const nearest = (owner, local, pool) => {
    let target = null, distance = RADIUS;
    const actors = pool.actors(), o = owner.root.position;
    for (let i = -1; i < actors.length; i++) {
      const body = i < 0 ? local : pool.body(actors[i].id);
      if (!body || body === owner || !body.root.visible) continue;
      const p = body.root.position, d = Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z);
      if (d <= distance) { distance = d; target = body; }
    }
    return target;
  };
  const face = (owner, target) => {
    const pet = owner.pet, ride = pet.ride, torso = owner.parts.torso;
    BL.scene.updateLocal(owner.root); BL.scene.updateLocal(torso);
    mat4.multiply(matrix, owner.root.local, torso.local);
    ride.yaw = 0;
    if (target) {
      const p = target.root.position;
      mat4.invert(inverse, matrix); mat4.transformPoint(point, inverse, p.x, p.y, p.z);
      ride.yaw = Math.atan2(point[0] - ride.stomach.x, ride.stomach.y - point[1]);
    }
    BL.crew.poseStomachRide(ride, pet.node, matrix);
  };
  const create = () => {
    let context = null, tone = null, voice = null, rasp = null, previous = null, target = null, wait = 0, barks = 0;
    let sounding = false;
    const stop = () => {
      if (!sounding) return;
      sounding = false;
      for (let i = 0; i < 2; i++) {
        const gain = i ? rasp.gain : voice.gain;
        gain.cancelScheduledValues(context.currentTime); gain.setValueAtTime(0, context.currentTime);
      }
    };
    const open = () => {
      if (context) return true;
      if (typeof AudioContext === "undefined" || !navigator.userActivation?.hasBeenActive) return false;
      context = new AudioContext();
      const output = BL.sound.output(context), filter = context.createBiquadFilter();
      filter.type = "bandpass"; filter.frequency.value = 1500; filter.Q.value = 1.2;
      voice = context.createGain(); voice.gain.value = 0; voice.connect(filter);
      rasp = context.createGain(); rasp.gain.value = 0; rasp.connect(filter); filter.connect(output);
      tone = context.createOscillator(); tone.type = "sawtooth"; tone.connect(voice); tone.start();
      const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = context.createBufferSource(); noise.buffer = buffer; noise.loop = true; noise.connect(rasp); noise.start();
      return true;
    };
    const play = () => {
      if (context.state === "suspended") context.resume().catch(() => {});
      const t = context.currentTime;
      tone.frequency.cancelScheduledValues(t);
      voice.gain.cancelScheduledValues(t); rasp.gain.cancelScheduledValues(t);
      // Two short, raspy high-pitched yaps. Each uses the same oscillator and looping noise source.
      for (let i = 0; i < 2; i++) {
        const at = t + i * 0.18;
        tone.frequency.setValueAtTime(880 - i * 60, at);
        tone.frequency.exponentialRampToValueAtTime(460, at + 0.12);
        for (let j = 0; j < 2; j++) {
          const gain = j ? rasp.gain : voice.gain;
          gain.setValueAtTime(0.0001, at);
          gain.exponentialRampToValueAtTime(gain === voice.gain ? 0.07 : 0.1, at + 0.008);
          gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
          gain.setValueAtTime(0, at + 0.13);
        }
      }
      sounding = true; barks++;
    };
    const off = BL.sound.subscribe(on => { if (on) { stop(); wait = 0; } });
    const update = (owner, local, pool, dt) => {
      const pet = owner?.pet;
      if (!owner?.root.visible || !pet?.node.visible || pet.mode !== 4 || pet.ride?.kind !== 2) owner = null;
      if (previous && previous !== owner && previous.pet?.ride.kind === 2) previous.pet.ride.yaw = 0;
      target = owner ? nearest(owner, local, pool) : null;
      if (owner) face(owner, target);
      if (owner !== previous) { stop(); wait = 0; }
      previous = owner;
      if (!target || BL.sound.muted) { stop(); wait = 0; return; }
      if (!(dt > 0)) return;
      wait = Math.max(0, wait - dt);
      if (!wait && open()) { play(); wait = PERIOD; }
    };
    const dispose = () => {
      stop(); off();
      if (context) context.close().catch(() => {});
      context = tone = voice = rasp = previous = target = null;
    };
    return { update, dispose, get target() { return target; }, get barks() { return barks; }, get open() { return !!context; } };
  };
  BL.petReactions = { create, RADIUS };
})();
