// The Lightning Jet Hangar's sound, on the Lightning Factory's pattern: one AudioContext opened from a gesture the
// browser has already activated, a bed of voices built once and only ever re-levelled, so nothing is allocated or
// restarted while it plays, and one noise loop behind every hiss.
//
// The bed is the hangar humming: everywhere the mains' low hum, a deep drone that beats and swells slowly, and the
// vast hall's air breathing; and, louder as the visitor nears each, the launch tunnel's neon buzzing all round them
// inside it, and the shimmer of each shield, the launch shield's at the tunnel's end and the door's; and a faint breath
// of air where the hangar's air shimmers (`hangar-shimmer.js`), as loud as `glint(x, y, z, level)` last asked. `listen` says
// where the visitor hears from and which way the view faces, and `update(dt)` levels the bed from there ten times a
// second. It honours the page-wide mute (`oogaboogaland.audio`), keeps sounding in the background, and `dispose` closes it.
//
// Over the bed, the engine static fire test (`test(AT)`, its whole sequence scheduled at the press on voices built
// with the bed, so nothing starts or allocates while it plays): the booth's two-tone siren from the press to the blast;
// the turbines' whine and whoosh rising through the spool-up; the ignition's whoomph and then the exhaust's roar, a
// rocket's, loud, its body, its crackle and its rumble under it; the malfunction's coughing roar, clanks and alarm
// beeps; the blast's boom and crack, iron clattering down after it; and the presser's hearing muffled from the blast
// until they come to, a ringing in their ears over it. Everything passes a limiter, so the roar is loud and never
// clips. `setVolume` sets the hangar's level (localStorage `ooga-hangar-volume`, 0..1).
//
// The engines acting up on their own (`hangar-anomaly.js`) play on the same voices: `misfire(M)` schedules a failed
// start at once, an electrical hum rising, three tries at turning the engines over, each whining higher and dying in a
// sputter, the last coughing a short burst, then a dead stop and the metal ticking as it cools; `revs(R)` the two
// engines revving by turns, each with a voice of its own on its own side, as if they were talking; `zap(Z, from, to)`
// lightning running over the Jet, a sizzle crackling from nose to tail over the hum, then a crack and silence; and
// `blackout(B)` the power dying with a clunk, a low hum in the dark, and the banks clunking back on, the mains hum
// coming back with them as `power(k)` says (0 off, 1 on); and `lowrider(L)` a sledgehammer's deep, heavy thud each
// time the bouncing Jet's nose gear comes down; and `shuffle(S)` the Jet shifting in its bay, its brakes letting go,
// its tyres scrubbing, its gear creaking and its engines' short bursts.
//
// Kortik's Sis has a voice of her own (`voice`): a buzz and a breath through three formants, a syllable for each run
// of vowels in her line with the formants of its vowel, pauses at its punctuation, a stressed last syllable before a
// "!" or a "?", and the censor's bleep over each grawlix; muttered, yelled, screamed or whispered, each line at its own
// pitch and pace. It is placed where she stands while she talks, her yells heard across the hall. Her brother's shouts
// through the hangar's door from next door come on the same voice, lower and muffled (`kortik`). Her boots thud
// where she walks (`boot`), a poke boinks (`poke`), a warning light beeps (`beep`, which a door keypad's keys
// take at their own pitches), and her hammer clangs on the Jet (`clang`).
//
// The film show's projector (`projector(on)`) runs where it hangs: its motor's hum and whir and the gate's clatter,
// spinning up as it starts and running down as it stops, wavering as an old motor does, with the lamp's buzz; each
// picture clunks into the gate (`clunk`); and from the screen the soundtrack's crackle and hiss while the film runs,
// and the roller's ratchet as the screen unrolls or rolls back up (`roll`).
//
// The overhead crane at work (`hangar-crane.js`), heard from its trolley, whose state it reads live (`watchCrane`:
// where it is and how fast its travel and its hoist run, each 0 to 1): the travel drive's whine climbing with its speed
// over its gearbox's hum and the rumble of its wheels on the rails, and the hoist's higher whine and hum; and its cues
// (`craneCue`): the brakes' clunk as a motion starts and stops (`brake`), the sling's chains clinking as it is hooked
// on or off (`rattle`), the creak as the ropes take the crate's weight (`lift`), the thud of the crate set down on
// its stand (`land`) and its warning horn (`horn`); and its travel alarm beeping while the bridge or the trolley moves
// (the state's `alarm`).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp } = BL.math;
  const NOISE_SECONDS = 2, MASTER = 0.5, VOLUME_KEY = "ooga-hangar-volume", PAN = 0.75;
  // How loud each part of the bed sits: the hum, the drone and the air everywhere, more air inside the tunnel, the
  // neon at its loudest inside it, and each shield close to; and at how many metres each of those last falls to half.
  const LEVEL = { mains: 0.05, drone: 0.08, air: 0.045, tunnelAir: 0.035, neon: 0.05, launch: 0.11, door: 0.06, glint: 0.04 };
  // How far the mains' pitch sags at most as the power falters (`strain`), a share of it.
  const SAG = 0.14;
  // The hall losing its power and getting it back (`outage`), on voices of its own, none of the engine blackout's: how
  // loud the lamps' ballasts buzz as the power falters, their ticks, the breaker's click and its knock, the air
  // handling's motors and their air as they wind down (`spin`, Hz, from and to, over `down` s, and back up over `up` s),
  // the lamps' pings as they cool, the emergency lights' faint whine, the transformers' hum surging back, and how many
  // of the lamps' starters tick as they come back on.
  const OUT = { buzz: 0.035, tick: 0.12, trip: 0.35, knock: 0.12, motor: 0.05, whirr: 0.07, ping: 0.02, whine: 0.004, inrush: 0.09,
    spin: [190, 26], down: 5, up: 3, starters: [10, 14] };
  const REF = { neon: 5, launch: 9, door: 5, glint: 8 };

  // How loud the test's voices peak: the siren, the whine and its whoosh, the whoomph, the roar's body, crackle and
  // rumble, a clank, the alarm, the boom's sweep, its rumble and its crack, the ringing, and the anomalies' hum.
  const TEST = { siren: 0.2, whine: 0.2, whoosh: 0.16, whoomph: 0.8, roar: 0.9, crackle: 0.4, rumble: 0.6, clank: 0.5, alarm: 0.09, boom: 1, boomNoise: 0.9, crack: 0.7, ring: 0.05, hum: 0.08, rev: 0.22, sizzle: 0.12, thump: 0.9, bang: 0.8 };
  // How far the blast muffles the presser's hearing, Hz.
  const MUFFLED = 320, CLEAR = 20000;
  // Kortik's Sis's ways of saying a line: her pitch, Hz; a syllable's length and the gap after it, s; how loud; how far
  // a stressed last syllable bends her pitch; how much of her is buzz and how much breath; her voice's shake, Hz either
  // way; the least she is heard at anywhere in the hall; and, for Kortik shouting through the door from next door on
  // the same voice, his formants a man's and the wall muffling him (`formant`, `tone`, Hz), and for a gorilla of the
  // crew who has had enough, deep and loud in the hall (`worker`). Her voice falls to half at SIS_REF metres, her boots
  // at BOOT_REF.
  const SIS_STYLE = {
    mutter: { f0: 185, len: 0.085, gap: 0.03, level: 0.16, end: 0.85, buzz: 1, breath: 0.12, shake: 0, least: 0, formant: 1, tone: 20000 },
    yell: { f0: 300, len: 0.115, gap: 0.03, level: 0.34, end: 1.18, buzz: 1, breath: 0.22, shake: 0, least: 0.1, formant: 1, tone: 20000 },
    scream: { f0: 430, len: 0.14, gap: 0.025, level: 0.4, end: 1.3, buzz: 1, breath: 0.3, shake: 16, least: 0.14, formant: 1, tone: 20000 },
    soft: { f0: 215, len: 0.13, gap: 0.05, level: 0.16, end: 0.9, buzz: 0.1, breath: 1, shake: 0, least: 0, formant: 1, tone: 20000 },
    kortik: { f0: 120, len: 0.12, gap: 0.035, level: 0.5, end: 1.12, buzz: 1, breath: 0.1, shake: 0, least: 0.12, formant: 0.82, tone: 700 },
    worker: { f0: 105, len: 0.115, gap: 0.03, level: 0.42, end: 1.2, buzz: 1, breath: 0.28, shake: 7, least: 0.1, formant: 0.78, tone: 20000 }
  };
  const SIS_REF = 9, BOOT_REF = 5, BLEEP = 0.3;
  // How much farther apart than they stand the two engines' revs are panned, so each is heard on its own side.
  const REV_SPREAD = 2.5;
  // The forklift's button: how loud its click, its thunk and the denied buzz are, and the buzz's two pulses, [from, for,
  // Hz], the second lower, as a machine says no.
  const FORK = { click: 0.3, thunk: 0.5, buzz: 0.16 }, DENIED = [[0.06, 0.17, 150], [0.29, 0.24, 132]];
  // The forklift running: how loud its electric drive's whine, the hydraulic pump's hum and its hiss are, the relay's
  // click and the ready chime; how long the drive takes to spin up (`spin`, s, the chime at its end) and to run down
  // (`down`); and how far it carries, half at `ref` metres.
  const LIFT = { whine: 0.05, hum: 0.11, hiss: 0.025, click: 0.35, chime: 0.1, spin: 0.9, down: 1.3, ref: 6 };
  // How it sounds at work: how far its whine climbs (Hz) and swells at full speed, and how far the pump's hum climbs and
  // its hiss swells while the forks move.
  const WORK = { whine: 420, swell: 1.8, pump: 34, hiss: 3 };
  // Its horn: how loud, its two notes (Hz) and how long a honk sounds (s).
  const HORN = { level: 0.13, notes: [415, 523], length: 0.42 };
  // The crane: how loud its travel drive's whine, its gearbox's hum and its wheels' rumble are at full speed, its hoist's
  // whine and hum, the brakes' clunk and click, a chain's clink, the load's creak and the crate's thud; how far its
  // whines climb (Hz) from their idle pitch at full speed; and how far it carries, half at `ref` metres.
  // Its travel alarm: how loud, its pitch (Hz), each beep's length and how often (s); and its horn: how loud, its two
  // notes (Hz) and how long it sounds (s).
  // The control room's fire: its roar and crackle at full, the extinguisher's hiss, the strike's crack and thump, the
  // fire going out (a falling hiss), the extinguisher's clank on its bracket; how far it carries, half at `ref` metres.
  const ROOM = { roar: 0.14, crackle: 0.22, spray: 0.11, crack: 0.55, thump: 0.5, out: 0.12, clank: 0.25, ref: 9 };
  const CRANE = { whine: 0.05, hum: 0.07, rumble: 0.09, hoist: 0.05, hoistHum: 0.06, clunk: 0.4, click: 0.18, clink: 0.16, creak: 0.12, thud: 0.5, travelHz: [180, 520], hoistHz: [260, 760], ref: 10,
    alarm: 0.05, alarmHz: 1250, beep: 0.22, every: 0.75, horn: 0.3, hornHz: [311, 392], hornLen: 0.7 };
  // The film show's levels at full: the projector's motor, its whir, the gate's clatter and the lamp's buzz, the
  // soundtrack's crackle and hiss, a picture's clunk and the roller's ratchet; and how far the projector and the screen
  // carry (half at that many metres), the hall being quiet enough to hear them across it.
  const FILM = { motor: 0.06, whir: 0.03, clatter: 0.2, buzz: 0.025, crackle: 0.1, hiss: 0.025, clunk: 0.45, click: 0.18, roll: 0.14 }, FILM_REF = { projector: 14, screen: 16 };
  // Her vowels' first two formants, Hz, by the letter that starts a syllable (a woman's, after Peterson and Barney),
  // and the third, which stays put.
  const FORMANTS = { 65: [850, 1220], 69: [610, 2330], 73: [430, 2480], 79: [590, 920], 85: [760, 1400], 89: [310, 2790] }, SCHWA = [640, 1500], F3 = 2900;

  // `spots`: the door's shield and the launch shield, { x, y, z } each, the tunnel's axis { y, z0, z1 }, the test's
  // booth and the middle of the Jet's engines (with `gap`, how far each stands to its side), its nose gear, the film
  // show's projector and its picture, and the forklift, { x, y, z } each.
  const create = (spots) => {
    let ctx = null, master = null, mix = null, muffle = null, buffer = null, ready = false, muted = false, disposed = false, since = 0, volume = 1;
    muted = BL.sound.muted;
    try {
      const saved = localStorage.getItem(VOLUME_KEY), v = Number(saved);
      if (saved !== null && v >= 0 && v <= 1) volume = v;
    } catch {}
    const bed = {}, test = {}, sis = {}, proj = {}, fork = {}, crane = {}, room = {}, out = {};
    // The crane's state, read live: { x, y, z, travel, hoist, alarm } (`watchCrane`).
    let craneState = null;
    // The control room's fire, read live: { x, y, z, level, spray } (`watchRoom`).
    let roomState = null;
    // Whether the projector runs, so a context opened mid-show starts it running, and the same for the forklift.
    let projOn = false, liftOn = false, liftReady = 0, liftDrive = 0, liftPump = 0;
    // Her voice while she talks: where she stands (her node's position, read live), until when, and its least level.
    const sisVoice = { pos: null, until: 0, least: 0 };
    // How much of the hall's electrical hum (the mains and the neon) has power, 0 to 1.
    let power = 1;
    // The hall's hum straining (`strain`): how much of itself the bed plays, 0 to 1, how far the mains' pitch has sagged,
    // 0 to 1 of `SAG`, and until when the bed follows it quickly.
    let strained = 1, sagged = 0, quickUntil = 0;
    // Where the visitor hears from and the way the view faces on the ground, and where the last spot was placed.
    const ear = { x: 0, y: 0, z: 0, fx: 0, fz: -1 }, AT = { level: 0, pan: 0 }, glinting = { x: 0, y: 0, z: 0, level: 0 };

    const gain = (value, to) => {
      const g = ctx.createGain();
      g.gain.value = value;
      if (to) g.connect(to);
      return g;
    };
    const filter = (type, freq, q, to) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      if (to) f.connect(to);
      return f;
    };
    const panner = () => {
      const p = ctx.createStereoPanner();
      p.connect(mix);
      return p;
    };
    const osc = (type, freq, to) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.connect(to);
      o.start();
      return o;
    };
    const hissOf = (to, from = buffer) => {
      const s = ctx.createBufferSource();
      s.buffer = from;
      s.loop = true;
      s.connect(to);
      s.start(0, Math.random() * NOISE_SECONDS);
      return s;
    };
    // A wobble on `param` round its value: an oscillator at `hz` swinging it `depth` either way.
    const wobble = (param, hz, depth) => {
      const d = gain(depth, null);
      d.connect(param);
      return osc("sine", hz, d);
    };
    // A shield's shimmer: two tones a little apart, beating, and a thin fizz, panned to its side.
    const shimmer = (f) => {
      const pan = panner(), g = gain(0, pan);
      return { pan, gain: g, a: osc("sine", f, g), b: osc("sine", f * 1.0138, g), fizz: hissOf(filter("bandpass", 5200, 8, gain(0.5, g))) };
    };

    const init = () => {
      ctx = new AudioContext();
      // Every voice into the mix, the mix through the presser's hearing (the muffle) to the master's level, and that
      // through the limiter.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.25;
      limiter.connect(ctx.destination);
      master = gain(muted ? 0 : MASTER * volume, limiter);
      muffle = filter("lowpass", CLEAR, 0.7, master);
      mix = gain(1, muffle);
      buffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      // The mains' hum, a low saw's lower harmonics so small speakers carry it.
      bed.mainsGain = gain(0, mix);
      bed.mains = osc("sawtooth", 55, filter("lowpass", 260, 0.6, bed.mainsGain));
      bed.mains2 = osc("sine", 110, gain(0.3, bed.mainsGain));
      // The drone the hall itself seems to make: two low tones a hair apart, beating, their octave over them, and the
      // whole swelling and falling back slowly.
      bed.droneGain = gain(0, mix);
      const drone = filter("lowpass", 220, 0.7, bed.droneGain);
      bed.drone = osc("sine", 41.2, drone);
      bed.drone2 = osc("sine", 41.75, drone);
      bed.drone3 = osc("triangle", 82.4, gain(0.35, drone));
      bed.swell = wobble(bed.droneGain.gain, 0.07, 0.02);
      // The hall's air, breathing slowly.
      bed.airGain = gain(0, mix);
      bed.airFilter = filter("lowpass", 280, 0.8, bed.airGain);
      bed.air = hissOf(bed.airFilter);
      bed.breath = wobble(bed.airFilter.frequency, 0.23, 90);
      // The tunnel's neon, buzzing: a mains-rate square through a narrow band, and its fizz.
      bed.neonPan = panner();
      bed.neonGain = gain(0, bed.neonPan);
      bed.neon = osc("square", 120, filter("bandpass", 240, 3, bed.neonGain));
      bed.neonFizz = hissOf(filter("bandpass", 4200, 6, gain(0.6, bed.neonGain)));
      // The launch shield's shimmer, lower than the door's.
      bed.launch = shimmer(174.6);
      bed.door = shimmer(196);
      // The glint where the air shimmers: soft air, the noise through a broad band round 1.2 kHz and a thinner one over
      // it, breathing a little; no tone, nothing low (a rising electrical hum is the engines' own).
      bed.glintPan = panner();
      bed.glintGain = gain(0, bed.glintPan);
      const breath = gain(1, bed.glintGain);
      bed.glintAir = hissOf(filter("bandpass", 1200, 0.8, breath));
      bed.glintThin = hissOf(filter("bandpass", 2600, 1.6, gain(0.35, breath)));
      bed.glintBreath = wobble(breath.gain, 0.6, 0.25);
      initTest();
      initProjector();
      initForklift();
      initCrane();
      initRoom();
      initOutage();
      ready = true;
    };

    // The forklift's button, placed where it is: its click (a burst of noise) and thunk, and the denied buzz, two squares a
    // little apart through a lowpass.
    const initForklift = () => {
      fork.pan = panner();
      fork.clickGain = gain(0, fork.pan);
      fork.click = hissOf(filter("bandpass", 2600, 2, fork.clickGain));
      fork.thunkGain = gain(0, fork.pan);
      fork.thunk = osc("sine", 140, fork.thunkGain);
      fork.buzzGain = gain(0, fork.pan);
      const tone = filter("lowpass", 1300, 0.8, fork.buzzGain);
      fork.buzz = osc("square", DENIED[0][2], tone);
      fork.buzz2 = osc("square", DENIED[0][2] * 1.05, gain(0.6, tone));
      // Its run, placed where it stands, under its envelope: the drive's whine (a saw through a band, wavering a little),
      // the pump's hum and its octave, and the hydraulics' hiss; and the relay's click and the ready chime outside it.
      fork.runPan = panner();
      fork.near = gain(0, fork.runPan);
      fork.env = gain(liftOn ? 1 : 0, fork.near);
      fork.whineGain = gain(LIFT.whine, fork.env);
      fork.whine = osc("sawtooth", 440, filter("bandpass", 900, 3, fork.whineGain));
      fork.waver = wobble(fork.whine.frequency, 3.1, 4);
      fork.hum = osc("sine", 58, gain(LIFT.hum, fork.env));
      fork.hum2 = osc("triangle", 116, gain(LIFT.hum * 0.4, fork.env));
      fork.hissGain = gain(LIFT.hiss, fork.env);
      fork.hiss = hissOf(filter("bandpass", 600, 1, fork.hissGain));
      fork.relayGain = gain(0, fork.near);
      fork.relay = hissOf(filter("bandpass", 1800, 1.5, fork.relayGain));
      fork.chimeGain = gain(0, fork.near);
      fork.chime = osc("sine", 880, fork.chimeGain);
      // Its horn, two squares a third apart through a band.
      fork.hornGain = gain(0, fork.near);
      const horn = filter("bandpass", 900, 1.2, fork.hornGain);
      fork.horn = HORN.notes.map((hz) => osc("square", hz, horn));
    };
    // The crane, placed at its trolley: the travel drive (a saw's whine through a band, wavering a little, the gearbox's
    // triangle hum and the wheels' rumble, low noise) and the hoist (its own whine and hum), each under its own level,
    // which `update` sets from how fast it runs; and the cues' voices, placed apart where each cue is (`cuePan`, their
    // levels set by the cue): the brakes' clunk (a falling sine) and click, a chain's clink (noise through a narrow ringing
    // band), the load's creak (a slow saw through a band) and the thud.
    // The control room's fire, placed there: its roar (low noise) and crackle (noise through a band, its level ticked by
    // `update`) under their levels, the extinguisher's hiss (high noise); and the cues' voices, placed apart where each
    // cue is (`cuePan`): the strike's crack (a bright noise burst) and thump, the fire's last falling hiss, and the
    // bracket's clank.
    const initRoom = () => {
      room.pan = panner();
      room.near = gain(0, room.pan);
      room.roar = gain(0, room.near);
      hissOf(filter("lowpass", 420, 0.8, room.roar));
      room.crackle = gain(0, room.near);
      hissOf(filter("bandpass", 2600, 1.4, room.crackle));
      room.spray = gain(0, room.near);
      hissOf(filter("highpass", 1800, 0.7, room.spray));
      room.cuePan = panner();
      room.crackGain = gain(0, room.cuePan);
      hissOf(filter("highpass", 900, 0.7, room.crackGain));
      room.thumpGain = gain(0, room.cuePan);
      room.thump = osc("sine", 70, room.thumpGain);
      room.outGain = gain(0, room.cuePan);
      room.outFilter = filter("bandpass", 3000, 1.2, room.outGain);
      hissOf(room.outFilter);
      room.clankGain = gain(0, room.cuePan);
      room.clank = osc("triangle", 420, filter("bandpass", 900, 6, room.clankGain));
    };
    const initCrane = () => {
      crane.pan = panner();
      crane.near = gain(0, crane.pan);
      crane.travel = gain(0, crane.near);
      crane.whine = osc("sawtooth", CRANE.travelHz[0], filter("bandpass", 700, 3, gain(CRANE.whine, crane.travel)));
      crane.waver = wobble(crane.whine.frequency, 2.3, 3);
      crane.hum = osc("triangle", 62, gain(CRANE.hum, crane.travel));
      crane.rumble = hissOf(filter("lowpass", 180, 0.9, gain(CRANE.rumble, crane.travel)));
      crane.hoist = gain(0, crane.near);
      crane.hoistWhine = osc("sawtooth", CRANE.hoistHz[0], filter("bandpass", 1100, 4, gain(CRANE.hoist, crane.hoist)));
      crane.hoistHum = osc("sine", 88, gain(CRANE.hoistHum, crane.hoist));
      crane.cuePan = panner();
      crane.clunkGain = gain(0, crane.cuePan);
      crane.clunk = osc("sine", 120, crane.clunkGain);
      crane.clickGain = gain(0, crane.cuePan);
      crane.click = hissOf(filter("bandpass", 2400, 2, crane.clickGain));
      crane.clinkGain = gain(0, crane.cuePan);
      crane.clink = hissOf(filter("bandpass", 3600, 18, crane.clinkGain));
      crane.creakGain = gain(0, crane.cuePan);
      crane.creak = osc("sawtooth", 70, filter("bandpass", 520, 6, crane.creakGain));
      crane.thudGain = gain(0, crane.cuePan);
      crane.thud = osc("sine", 90, crane.thudGain);
      crane.thudNoise = gain(0, crane.cuePan);
      hissOf(filter("lowpass", 340, 0.8, crane.thudNoise));
      // The travel alarm, placed at the trolley, its beeps scheduled ahead by `update`; and the horn's two notes.
      crane.alarmGain = gain(0, crane.near);
      crane.alarm = osc("square", CRANE.alarmHz, filter("bandpass", CRANE.alarmHz, 3, crane.alarmGain));
      crane.nextBeep = 0;
      crane.hornGain = gain(0, crane.cuePan);
      const hornTone = filter("lowpass", 1500, 0.8, crane.hornGain);
      crane.horn = CRANE.hornHz.map((hz) => osc("square", hz, hornTone));
    };
    // The projector's voices, all under its envelope, which `projector` opens and closes, and placed where it hangs; and
    // the screen's, placed where its picture falls.
    const initProjector = () => {
      proj.pan = panner();
      proj.near = gain(0, proj.pan);
      proj.env = gain(projOn ? 1 : 0, proj.near);
      // The motor's hum and whir, the gate's clatter (a saw's edge 24 times a second through a highpass, wavering) and
      // the lamp's buzz.
      proj.motor = osc("sawtooth", 98, filter("lowpass", 380, 0.7, gain(FILM.motor, proj.env)));
      proj.whir = hissOf(filter("bandpass", 1100, 2, gain(FILM.whir, proj.env)));
      proj.clatter = osc("sawtooth", 24, filter("highpass", 2200, 0.7, gain(FILM.clatter, proj.env)));
      proj.flutter = wobble(proj.clatter.frequency, 0.6, 0.5);
      proj.buzz = osc("square", 100, filter("bandpass", 300, 4, gain(FILM.buzz, proj.env)));
      // A picture's clunk: a low knock and a click.
      proj.clunkGain = gain(0, proj.near);
      proj.clunk = osc("sine", 120, proj.clunkGain);
      proj.clickGain = gain(0, proj.near);
      proj.click = hissOf(filter("bandpass", 1500, 1.5, proj.clickGain));
      // At the screen: the soundtrack's crackle (sparse clicks, fewer than the exhaust's) and hiss, under the track's
      // envelope, and the roller's ratchet.
      const crackle = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate), c = crackle.getChannelData(0);
      for (let i = 0; i < c.length; i++) if (Math.random() < 0.0012) c[i] = (Math.random() * 2 - 1) * (0.3 + Math.random() * 0.7);
      proj.screenPan = panner();
      proj.screenNear = gain(0, proj.screenPan);
      proj.track = gain(projOn ? 1 : 0, proj.screenNear);
      proj.crackle = hissOf(filter("highpass", 1800, 0.7, gain(FILM.crackle, proj.track)), crackle);
      proj.hiss = hissOf(filter("bandpass", 4000, 0.8, gain(FILM.hiss, proj.track)));
      proj.rollGain = gain(0, proj.screenNear);
      proj.ratchet = osc("sawtooth", 16, filter("highpass", 1400, 0.8, proj.rollGain));
    };

    // The test's voices, silent until `test` schedules them: the siren and the alarm at the booth, everything the
    // engines make at the engines, the blast everywhere, and the ringing past the muffle.
    const initTest = () => {
      // The exhaust's crackle: sparse clicks of every size, a rocket's.
      const crackle = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate), c = crackle.getChannelData(0);
      for (let i = 0; i < c.length; i++) {
        if (Math.random() > 0.004) continue;
        const a = (Math.random() * 2 - 1) * (0.4 + Math.random() * 0.6);
        for (let k = 0; k < 8 && i + k < c.length; k++) c[i + k] += a * Math.pow(0.55, k);
      }
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(2.2 * (i / 511.5 - 1)) / Math.tanh(2.2);
      test.boothPan = panner();
      test.enginePan = panner();
      test.sirenGain = gain(0, test.boothPan);
      const sirenTone = filter("lowpass", 2400, 0.7, test.sirenGain);
      test.siren = osc("square", 660, sirenTone);
      test.siren2 = osc("sawtooth", 1320, gain(0.3, sirenTone));
      test.alarmGain = gain(0, test.boothPan);
      test.alarm = osc("square", 1350, filter("bandpass", 1400, 2, test.alarmGain));
      test.whineGain = gain(0, test.enginePan);
      test.whineFilter = filter("bandpass", 300, 4, test.whineGain);
      test.whine = osc("sawtooth", 140, test.whineFilter);
      test.whine2 = osc("sine", 210, gain(0.6, test.whineGain));
      test.whooshGain = gain(0, test.enginePan);
      test.whooshFilter = filter("bandpass", 300, 1.2, test.whooshGain);
      test.whoosh = hissOf(test.whooshFilter);
      test.whoomphGain = gain(0, test.enginePan);
      test.whoomph = hissOf(filter("lowpass", 380, 0.8, test.whoomphGain));
      // The roar: the noise's full band and a body under it driven into a soft clip, its crackle, and the rumble.
      test.roarGain = gain(0, test.enginePan);
      const shaper = ctx.createWaveShaper();
      shaper.curve = curve;
      shaper.connect(test.roarGain);
      test.roarFilter = filter("lowpass", 400, 0.6, shaper);
      test.roar = hissOf(test.roarFilter);
      test.roarBody = hissOf(filter("bandpass", 420, 0.6, gain(1.4, shaper)));
      test.crackleGain = gain(0, test.enginePan);
      test.crackle = hissOf(filter("highpass", 1400, 0.7, test.crackleGain), crackle);
      test.rumbleGain = gain(0, test.enginePan);
      const low = filter("lowpass", 120, 0.8, test.rumbleGain);
      test.rumble = osc("sawtooth", 42, low);
      test.rumbleNoise = hissOf(filter("lowpass", 90, 0.7, gain(1.5, test.rumbleGain)));
      // The malfunction's clanks: struck metal, a ring of noise and a ping.
      test.clankGain = gain(0, test.enginePan);
      test.clankFilter = filter("bandpass", 1600, 14, test.clankGain);
      test.clank = hissOf(test.clankFilter);
      test.pingGain = gain(0, test.enginePan);
      test.ping = osc("triangle", 1700, test.pingGain);
      // The anomalies' electrical hum at the engines: a mains buzz through a narrow band, and its fizz.
      test.humGain = gain(0, test.enginePan);
      test.hum = osc("sawtooth", 100, filter("bandpass", 380, 2.5, test.humGain));
      test.humFizz = hissOf(filter("bandpass", 3600, 5, gain(0.35, test.humGain)));
      // The lowrider's bang where the nose gear comes down, a sledgehammer's thud: the hit, a burst of low noise closing
      // down fast, and a dull knock, panned to the gear; and, everywhere, the deep body under it, a sine dropping to a low
      // note and its octave driven hard into the clip so its harmonics carry the low end even on small speakers, through
      // a lowpass that keeps it round.
      test.bangPan = panner();
      test.bangHitGain = gain(0, test.bangPan);
      test.bangHitBand = filter("lowpass", 900, 0.8, test.bangHitGain);
      test.bangHit = hissOf(test.bangHitBand);
      test.bangKnockGain = gain(0, test.bangPan);
      test.bangKnock = osc("triangle", 170, filter("lowpass", 500, 0.7, test.bangKnockGain));
      test.thumpGain = gain(0, mix);
      const thumpClip = ctx.createWaveShaper();
      thumpClip.curve = curve;
      thumpClip.connect(filter("lowpass", 600, 0.7, test.thumpGain));
      const thumpDrive = gain(4, thumpClip);
      test.thump = osc("sine", 110, thumpDrive);
      test.thump2 = osc("sine", 220, gain(0.35, thumpDrive));
      // The anomalies' lightning: a sizzle, high noise through a band, panned to wherever it runs over the Jet.
      test.sizzlePan = panner();
      test.sizzleGain = gain(0, test.sizzlePan);
      test.sizzle = hissOf(filter("bandpass", 4500, 1.5, test.sizzleGain));
      // Each engine's own rev, on its own side, a jet spooling up and back: its roar, the noise through a band that
      // opens as it spools, driven a little into the clip for grit; a rumble under it; the turbine's whine high over it;
      // and a little of the exhaust's crackle.
      test.revs = [0, 1].map(() => {
        const pan = panner(), level = gain(0, pan), grit = ctx.createWaveShaper();
        grit.curve = curve;
        grit.connect(level);
        const roarBand = filter("lowpass", 220, 0.8, grit);
        return {
          pan, level, roarBand, roar: hissOf(roarBand),
          rumble: osc("sawtooth", 38, filter("lowpass", 110, 0.7, gain(0.9, level))),
          whine: osc("sine", 700, gain(0.12, level)), whine2: osc("sine", 1050, gain(0.05, level)),
          crackle: hissOf(filter("highpass", 1200, 0.7, gain(0.25, level)), crackle)
        };
      });
      // The blast: a falling sweep, its noise's rumble closing down, and the crack on top.
      test.boomGain = gain(0, mix);
      test.boom = osc("sine", 95, test.boomGain);
      test.boomNoiseGain = gain(0, mix);
      test.boomFilter = filter("lowpass", 900, 0.7, test.boomNoiseGain);
      test.boomNoise = hissOf(test.boomFilter);
      test.crackGain = gain(0, mix);
      test.crack = hissOf(filter("highpass", 2500, 0.7, test.crackGain));
      // Kortik's Sis's hammer on the Jet: struck metal, a ring of noise and a ping, placed where it lands.
      test.clangPan = panner();
      test.clangGain = gain(0, test.clangPan);
      test.clangFilter = filter("bandpass", 1800, 16, test.clangGain);
      test.clang = hissOf(test.clangFilter);
      test.dingGain = gain(0, test.clangPan);
      test.ding = osc("triangle", 1500, test.dingGain);
      // The ringing in the presser's ears, past the muffle.
      test.ringGain = gain(0, master);
      test.ring = osc("sine", 3150, test.ringGain);
      test.ring2 = osc("sine", 3195, test.ringGain);
      // Kortik's Sis: her buzz (a saw with its shake) and her breath into three formants, a syllable's envelope after
      // them, the bleep beside it, and her level and side where she stands; her boots' thud and knock.
      sis.pan = panner();
      sis.level = gain(0, sis.pan);
      sis.tone = filter("lowpass", 20000, 0.7, sis.level);
      sis.env = gain(0, sis.tone);
      sis.f1 = filter("bandpass", 850, 7, sis.env);
      sis.f2 = filter("bandpass", 1220, 9, gain(0.7, sis.env));
      sis.f3 = filter("bandpass", F3, 10, gain(0.3, sis.env));
      sis.buzzGain = gain(1, null);
      sis.breathGain = gain(0, null);
      for (const g of [sis.buzzGain, sis.breathGain]) { g.connect(sis.f1); g.connect(sis.f2); g.connect(sis.f3); }
      sis.buzz = osc("sawtooth", 300, sis.buzzGain);
      sis.breath = hissOf(sis.breathGain);
      sis.shake = gain(0, sis.buzz.frequency);
      sis.shaker = osc("sine", 7, sis.shake);
      sis.bleepGain = gain(0, sis.level);
      sis.bleep = osc("sine", 1000, sis.bleepGain);
      sis.bootPan = panner();
      sis.bootGain = gain(0, sis.bootPan);
      sis.boot = hissOf(filter("lowpass", 220, 0.9, sis.bootGain));
      sis.knockGain = gain(0, sis.bootPan);
      sis.knock = osc("sine", 90, sis.knockGain);
      sis.boinkGain = gain(0, sis.bootPan);
      sis.boink = osc("sine", 700, sis.boinkGain);
    };

    // The whole test, from a press now, on the sequence's times `AT` (seconds from the press): every voice's levels and
    // pitches scheduled at once, the malfunction's coughs and clanks and the iron's clatter from a fixed draw.
    const CLANKS = [[6.05, 1900], [6.3, 1200], [6.42, 2600], [6.75, 1500], [7, 2200], [7.15, 900], [7.35, 1750]];
    const CLATTER = [[0.55, 2400], [0.8, 1800], [1.05, 3000], [1.4, 2100], [1.9, 2700]];
    const play = (AT) => {
      if (!ready || muted) return false;
      const t0 = ctx.currentTime + 0.02, at = (s) => t0 + s, T = test;
      const clear = (param, value) => { param.cancelScheduledValues(t0); param.setValueAtTime(value, t0); };
      for (const g of [T.sirenGain, T.alarmGain, T.whineGain, T.whooshGain, T.whoomphGain, T.roarGain, T.crackleGain, T.rumbleGain, T.clankGain, T.pingGain, T.boomGain, T.boomNoiseGain, T.crackGain, T.ringGain]) clear(g.gain, 0);
      // The siren, high and low, from the press to the blast.
      clear(T.siren.frequency, 660); clear(T.siren2.frequency, 1320);
      T.sirenGain.gain.linearRampToValueAtTime(TEST.siren, at(0.15));
      for (let k = 1, s = 0.42; s < AT.boom; k++, s += 0.42) {
        T.siren.frequency.setValueAtTime(k % 2 ? 880 : 660, at(s));
        T.siren2.frequency.setValueAtTime(k % 2 ? 1760 : 1320, at(s));
      }
      T.sirenGain.gain.setValueAtTime(TEST.siren, at(AT.boom));
      T.sirenGain.gain.linearRampToValueAtTime(0, at(AT.boom + 0.05));
      // The spool-up: the whine and its whoosh climbing, then held high under the roar, and spinning down after the blast.
      clear(T.whine.frequency, 140); clear(T.whine2.frequency, 210); clear(T.whineFilter.frequency, 300); clear(T.whooshFilter.frequency, 300);
      T.whine.frequency.setValueAtTime(140, at(AT.spool));
      T.whine.frequency.exponentialRampToValueAtTime(2600, at(AT.fire));
      T.whine2.frequency.setValueAtTime(210, at(AT.spool));
      T.whine2.frequency.exponentialRampToValueAtTime(3900, at(AT.fire));
      T.whineFilter.frequency.setValueAtTime(300, at(AT.spool));
      T.whineFilter.frequency.exponentialRampToValueAtTime(3000, at(AT.fire));
      T.whooshFilter.frequency.setValueAtTime(300, at(AT.spool));
      T.whooshFilter.frequency.exponentialRampToValueAtTime(3200, at(AT.fire));
      T.whineGain.gain.setValueAtTime(0, at(AT.spool));
      T.whineGain.gain.linearRampToValueAtTime(TEST.whine, at(AT.fire));
      T.whineGain.gain.linearRampToValueAtTime(TEST.whine * 0.6, at(AT.fire + 0.4));
      T.whooshGain.gain.setValueAtTime(0, at(AT.spool));
      T.whooshGain.gain.linearRampToValueAtTime(TEST.whoosh, at(AT.fire));
      T.whooshGain.gain.linearRampToValueAtTime(TEST.whoosh * 0.5, at(AT.fire + 0.4));
      T.whine.frequency.setValueAtTime(2600, at(AT.boom));
      T.whine.frequency.exponentialRampToValueAtTime(90, at(AT.boom + 2.2));
      T.whineGain.gain.setValueAtTime(TEST.whine * 0.6, at(AT.boom));
      T.whineGain.gain.linearRampToValueAtTime(0, at(AT.boom + 2.2));
      T.whooshGain.gain.setValueAtTime(TEST.whoosh * 0.5, at(AT.boom));
      T.whooshGain.gain.linearRampToValueAtTime(0, at(AT.boom + 0.3));
      // Ignition: the whoomph, and the roar opening up to full.
      T.whoomphGain.gain.setValueAtTime(TEST.whoomph, at(AT.fire));
      T.whoomphGain.gain.exponentialRampToValueAtTime(0.001, at(AT.fire + 0.9));
      clear(T.roarFilter.frequency, 400);
      T.roarFilter.frequency.setValueAtTime(400, at(AT.fire));
      T.roarFilter.frequency.exponentialRampToValueAtTime(2200, at(AT.fire + 0.35));
      for (const [g, peak] of [[T.roarGain, TEST.roar], [T.crackleGain, TEST.crackle], [T.rumbleGain, TEST.rumble]]) {
        g.gain.setValueAtTime(0, at(AT.fire - 0.05));
        g.gain.linearRampToValueAtTime(peak, at(AT.fire + 0.3));
        g.gain.setValueAtTime(peak, at(AT.warning));
      }
      // The malfunction: the roar coughing and catching, the filter with it, clanks and pings, the alarm beeping.
      const rand = BL.math.mulberry32(5150);
      for (let s = AT.warning; s < AT.boom - 0.05; s += 0.07 + rand() * 0.1) {
        const k = rand() < 0.4 ? 0.12 + rand() * 0.2 : 0.7 + rand() * 0.3;
        T.roarGain.gain.setValueAtTime(TEST.roar * k, at(s));
        T.crackleGain.gain.setValueAtTime(TEST.crackle * Math.min(1, k * 1.4), at(s));
        T.rumbleGain.gain.setValueAtTime(TEST.rumble * k, at(s));
        T.roarFilter.frequency.setValueAtTime(600 + k * 1600, at(s));
      }
      for (const [s, f] of CLANKS) {
        T.clankFilter.frequency.setValueAtTime(f, at(s));
        T.clankGain.gain.setValueAtTime(TEST.clank, at(s));
        T.clankGain.gain.exponentialRampToValueAtTime(0.001, at(s + 0.2));
        T.ping.frequency.setValueAtTime(f * 1.13, at(s));
        T.pingGain.gain.setValueAtTime(TEST.clank * 0.25, at(s));
        T.pingGain.gain.exponentialRampToValueAtTime(0.001, at(s + 0.45));
      }
      for (let s = AT.warning; s < AT.boom; s += 0.14) {
        T.alarmGain.gain.setValueAtTime(TEST.alarm, at(s));
        T.alarmGain.gain.setValueAtTime(0, at(s + 0.07));
      }
      for (const g of [T.roarGain, T.crackleGain, T.rumbleGain]) {
        g.gain.setValueAtTime(g === T.roarGain ? TEST.roar * 0.5 : 0, at(AT.boom - 0.02));
        g.gain.linearRampToValueAtTime(0, at(AT.boom + 0.05));
      }
      // The blast: the sweep falling, the noise closing down, the crack, and the iron clattering down after it.
      clear(T.boom.frequency, 95); clear(T.boomFilter.frequency, 900);
      T.boom.frequency.setValueAtTime(95, at(AT.boom));
      T.boom.frequency.exponentialRampToValueAtTime(26, at(AT.boom + 1.4));
      T.boomGain.gain.setValueAtTime(TEST.boom, at(AT.boom));
      T.boomGain.gain.exponentialRampToValueAtTime(0.001, at(AT.boom + 2.6));
      T.boomFilter.frequency.setValueAtTime(900, at(AT.boom));
      T.boomFilter.frequency.exponentialRampToValueAtTime(60, at(AT.boom + 2.5));
      T.boomNoiseGain.gain.setValueAtTime(TEST.boomNoise, at(AT.boom));
      T.boomNoiseGain.gain.exponentialRampToValueAtTime(0.001, at(AT.boom + 3));
      T.crackGain.gain.setValueAtTime(TEST.crack, at(AT.boom));
      T.crackGain.gain.exponentialRampToValueAtTime(0.001, at(AT.boom + 0.12));
      for (const [s, f] of CLATTER) {
        T.clankFilter.frequency.setValueAtTime(f, at(AT.boom + s));
        T.clankGain.gain.setValueAtTime(TEST.clank * 0.6, at(AT.boom + s));
        T.clankGain.gain.exponentialRampToValueAtTime(0.001, at(AT.boom + s + 0.15));
      }
      // The presser's hearing, muffled from the blast until they come to, ringing.
      clear(muffle.frequency, CLEAR);
      muffle.frequency.setValueAtTime(CLEAR, at(AT.boom + 0.04));
      muffle.frequency.exponentialRampToValueAtTime(MUFFLED, at(AT.boom + 0.2));
      muffle.frequency.setValueAtTime(MUFFLED, at(AT.result));
      muffle.frequency.exponentialRampToValueAtTime(CLEAR, at(AT.result + 1.4));
      T.ringGain.gain.setValueAtTime(0, at(AT.boom + 0.1));
      T.ringGain.gain.linearRampToValueAtTime(TEST.ring, at(AT.boom + 0.4));
      T.ringGain.gain.linearRampToValueAtTime(0, at(AT.result + 0.8));
      return true;
    };
    // A failed start from now, on its times `M` (seconds from its start, as `hangar-anomaly.js` runs it): the hum rising
    // to the first try and wavering on; at each try the starter's relay, the whine and its whoosh climbing, higher and
    // louder each try, then coughing, dropping out and catching as they fall away; the last try's burst (`burp`) a
    // whoomph with the roar and the rumble for a moment; at the cut the hum dead with a thunk; then the metal ticking as
    // it cools.
    const TICKS = [[0.9, 2500], [1.5, 1900], [2.2, 2900], [2.9, 2200]];
    const misfire = (M) => {
      if (!ready || muted) return false;
      const t0 = ctx.currentTime + 0.02, at = (s) => t0 + s, T = test, top = M.heat[M.heat.length - 1];
      const clear = (param, value) => { param.cancelScheduledValues(t0); param.setValueAtTime(value, t0); };
      for (const g of [T.humGain, T.whineGain, T.whooshGain, T.whoomphGain, T.roarGain, T.rumbleGain, T.clankGain, T.pingGain]) clear(g.gain, 0);
      clear(T.whine.frequency, 140); clear(T.whine2.frequency, 210); clear(T.whineFilter.frequency, 300); clear(T.whooshFilter.frequency, 300);
      clear(T.roarFilter.frequency, 900); clear(T.clankFilter.frequency, 900); clear(T.ping.frequency, 1700);
      T.humGain.gain.linearRampToValueAtTime(TEST.hum, at(M.tries[0]));
      for (let s = M.tries[0] + 0.3; s < M.cut - 0.1; s += 0.3 + Math.random() * 0.25) T.humGain.gain.linearRampToValueAtTime(TEST.hum * (0.7 + Math.random() * 0.6), at(s));
      for (let i = 0; i < M.tries.length; i++) {
        const s0 = M.tries[i], k = M.heat[i] / top, peak = s0 + M.spin, done = peak + M.sputter;
        const whine = TEST.whine * (0.45 + 0.55 * k), whoosh = TEST.whoosh * (0.4 + 0.6 * k), high = 500 + 1600 * k;
        T.clankFilter.frequency.setValueAtTime(700 + 300 * i, at(s0));
        T.clankGain.gain.setValueAtTime(TEST.clank * 0.35, at(s0));
        T.clankGain.gain.exponentialRampToValueAtTime(0.001, at(s0 + 0.14));
        T.whine.frequency.setValueAtTime(140, at(s0)); T.whine.frequency.exponentialRampToValueAtTime(high, at(peak));
        T.whine2.frequency.setValueAtTime(210, at(s0)); T.whine2.frequency.exponentialRampToValueAtTime(high * 1.5, at(peak));
        T.whineFilter.frequency.setValueAtTime(300, at(s0)); T.whineFilter.frequency.exponentialRampToValueAtTime(700 + 2000 * k, at(peak));
        T.whooshFilter.frequency.setValueAtTime(300, at(s0)); T.whooshFilter.frequency.exponentialRampToValueAtTime(600 + 2200 * k, at(peak));
        T.whineGain.gain.setValueAtTime(0, at(s0)); T.whineGain.gain.linearRampToValueAtTime(whine, at(peak));
        T.whooshGain.gain.setValueAtTime(0, at(s0)); T.whooshGain.gain.linearRampToValueAtTime(whoosh, at(peak));
        for (let s = peak; s < done - 0.06; s += 0.07 + Math.random() * 0.07) {
          const k2 = (Math.random() < 0.55 ? 1 : 0.12) * (1 - (s - peak) / M.sputter);
          T.whineGain.gain.setValueAtTime(whine * k2, at(s));
          T.whooshGain.gain.setValueAtTime(whoosh * k2, at(s));
        }
        T.whine.frequency.exponentialRampToValueAtTime(110, at(done));
        T.whine2.frequency.exponentialRampToValueAtTime(165, at(done));
        T.whineGain.gain.linearRampToValueAtTime(0, at(done));
        T.whooshGain.gain.linearRampToValueAtTime(0, at(done));
      }
      const b = M.tries[M.tries.length - 1] + M.burp;
      T.whoomphGain.gain.setValueAtTime(TEST.whoomph * 0.35, at(b));
      T.whoomphGain.gain.exponentialRampToValueAtTime(0.001, at(b + 0.7));
      T.roarGain.gain.setValueAtTime(0, at(b));
      T.roarGain.gain.linearRampToValueAtTime(TEST.roar * 0.3, at(b + 0.04));
      T.roarGain.gain.linearRampToValueAtTime(0, at(b + M.burpLen + 0.15));
      T.rumbleGain.gain.setValueAtTime(0, at(b));
      T.rumbleGain.gain.linearRampToValueAtTime(TEST.rumble * 0.4, at(b + 0.05));
      T.rumbleGain.gain.linearRampToValueAtTime(0, at(b + M.burpLen + 0.4));
      T.humGain.gain.linearRampToValueAtTime(TEST.hum, at(M.cut));
      T.humGain.gain.linearRampToValueAtTime(0, at(M.cut + 0.08));
      T.clankFilter.frequency.setValueAtTime(420, at(M.cut));
      T.clankGain.gain.setValueAtTime(TEST.clank * 0.55, at(M.cut));
      T.clankGain.gain.exponentialRampToValueAtTime(0.001, at(M.cut + 0.3));
      for (const [s, f] of TICKS) {
        T.ping.frequency.setValueAtTime(f, at(M.cut + s));
        T.pingGain.gain.setValueAtTime(TEST.clank * 0.07, at(M.cut + s));
        T.pingGain.gain.exponentialRampToValueAtTime(0.001, at(M.cut + s + 0.25));
      }
      return true;
    };
    // Phantom revs from now, on their script `R` (each [start, engine, length, how hard], s, the engine 0 the left and
    // 1 the right, 0..1): each rev on its engine's own voice, spooling up over `REV_UP` of it, the roar's band opening,
    // the rumble deepening and the whine climbing, harder revs higher and louder, and running back down.
    const REV_UP = 0.45;
    const revs = (R) => {
      if (!ready || muted) return false;
      const t0 = ctx.currentTime + 0.02, at = (s) => t0 + s;
      for (const v of test.revs) {
        for (const param of [v.level.gain, v.roarBand.frequency, v.rumble.frequency, v.whine.frequency, v.whine2.frequency]) param.cancelScheduledValues(t0);
        v.level.gain.setValueAtTime(0, t0); v.roarBand.frequency.setValueAtTime(220, t0); v.rumble.frequency.setValueAtTime(38, t0);
        v.whine.frequency.setValueAtTime(700, t0); v.whine2.frequency.setValueAtTime(1050, t0);
      }
      for (const [s, i, len, hard] of R) {
        const v = test.revs[i], up = s + len * REV_UP, end = s + len, loud = TEST.rev * (0.5 + 0.5 * hard), whine = 700 + 2800 * hard;
        v.roarBand.frequency.setValueAtTime(220, at(s)); v.roarBand.frequency.exponentialRampToValueAtTime(220 + 2400 * hard, at(up)); v.roarBand.frequency.exponentialRampToValueAtTime(200, at(end));
        v.rumble.frequency.setValueAtTime(38, at(s)); v.rumble.frequency.exponentialRampToValueAtTime(38 + 45 * hard, at(up)); v.rumble.frequency.exponentialRampToValueAtTime(36, at(end));
        v.whine.frequency.setValueAtTime(700, at(s)); v.whine.frequency.exponentialRampToValueAtTime(whine, at(up)); v.whine.frequency.exponentialRampToValueAtTime(600, at(end));
        v.whine2.frequency.setValueAtTime(1050, at(s)); v.whine2.frequency.exponentialRampToValueAtTime(whine * 1.5, at(up)); v.whine2.frequency.exponentialRampToValueAtTime(900, at(end));
        v.level.gain.setValueAtTime(0, at(s)); v.level.gain.linearRampToValueAtTime(loud, at(s + 0.15)); v.level.gain.setValueAtTime(loud, at(up)); v.level.gain.linearRampToValueAtTime(0, at(end));
      }
      return true;
    };

    // Lightning through the Jet from now, on its times `Z` (s from its start: its crawl from `from` to `to`, { x, y, z },
    // nose to tail, and the crack): the hum rising; the sizzle crackling, panned along the Jet as the lightning runs from
    // end to end; then the crack with a thump under it, and silence.
    const zap = (Z, from, to) => {
      if (!ready || muted) return false;
      const t0 = ctx.currentTime + 0.02, at = (s) => t0 + s, T = test;
      const clear = (param, value) => { param.cancelScheduledValues(t0); param.setValueAtTime(value, t0); };
      for (const g of [T.humGain, T.sizzleGain, T.crackGain, T.boomNoiseGain]) clear(g.gain, 0);
      place(from.x, from.y, from.z, 1);
      clear(T.sizzlePan.pan, AT.pan); clear(T.boomFilter.frequency, 900);
      T.humGain.gain.linearRampToValueAtTime(TEST.hum, at(Z.fade));
      for (let s = 0.05; s < Z.crack; s += 0.04 + Math.random() * 0.06) {
        const k = Math.min(1, s / Z.fade) * (Math.random() < 0.3 ? 0.25 : 0.6 + Math.random() * 0.4);
        T.sizzleGain.gain.setValueAtTime(TEST.sizzle * k, at(s));
      }
      for (let n = 0; n <= 8; n++) {
        const u = n / 8;
        place(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u, from.z + (to.z - from.z) * u, 1);
        T.sizzlePan.pan.linearRampToValueAtTime(AT.pan, at(Z.start + Z.crawl * u));
      }
      T.humGain.gain.setValueAtTime(TEST.hum, at(Z.crack));
      T.humGain.gain.linearRampToValueAtTime(0, at(Z.crack + 0.05));
      T.sizzleGain.gain.setValueAtTime(TEST.sizzle, at(Z.crack));
      T.sizzleGain.gain.exponentialRampToValueAtTime(0.001, at(Z.crack + 0.35));
      T.crackGain.gain.setValueAtTime(TEST.crack * 0.8, at(Z.crack));
      T.crackGain.gain.exponentialRampToValueAtTime(0.001, at(Z.crack + 0.18));
      T.boomFilter.frequency.setValueAtTime(700, at(Z.crack));
      T.boomFilter.frequency.exponentialRampToValueAtTime(60, at(Z.crack + 1.2));
      T.boomNoiseGain.gain.setValueAtTime(TEST.boomNoise * 0.4, at(Z.crack));
      T.boomNoiseGain.gain.exponentialRampToValueAtTime(0.001, at(Z.crack + 1.4));
      return true;
    };

    // The voices of the hall losing its power and getting it back (`OUT`): the ballasts' buzz, a mains-rate saw and its
    // octave through a band; ticks and pings, each panned where it comes from; the breaker's click, a burst through a
    // band, and its knock; the motors, a saw and its octave through a lowpass, and their air through a band; the
    // transformers' hum surging; and the emergency lights' whine, high and faint.
    const initOutage = () => {
      out.buzzGain = gain(0, mix);
      const band = filter("bandpass", 1800, 1.2, out.buzzGain);
      out.buzz = osc("sawtooth", 120, band); out.buzz2 = osc("square", 240, gain(0.3, band));
      out.tickPan = panner(); out.tickGain = gain(0, out.tickPan); out.tickBand = filter("bandpass", 3200, 3, out.tickGain); out.tick = hissOf(out.tickBand);
      out.pingPan = panner(); out.pingGain = gain(0, out.pingPan); out.ping = osc("sine", 3400, out.pingGain);
      out.tripGain = gain(0, mix); out.tripBand = filter("bandpass", 2600, 1.5, out.tripGain); out.trip = hissOf(out.tripBand);
      out.knockGain = gain(0, mix); out.knock = osc("triangle", 620, out.knockGain);
      out.motorGain = gain(0, mix);
      const motor = filter("lowpass", 900, 0.9, out.motorGain);
      out.motor = osc("sawtooth", OUT.spin[0], motor); out.motor2 = osc("sine", OUT.spin[0] * 2, gain(0.4, motor));
      out.whirrGain = gain(0, mix); out.whirrBand = filter("bandpass", 600, 0.9, out.whirrGain); out.whirr = hissOf(out.whirrBand);
      out.inrushGain = gain(0, mix); out.inrush = osc("sawtooth", 50, filter("lowpass", 320, 0.7, out.inrushGain)); out.inrush2 = osc("sine", 100, gain(0.5, out.inrushGain));
      out.whineGain = gain(0, mix); out.whine = osc("sine", 2150, out.whineGain); out.whine2 = osc("sine", 4300, gain(0.25, out.whineGain));
    };
    // The hall's power faltering, going and coming back from now, on the times `O` (s from now: `from`, when its lamps
    // start to strain; `dips`, each [when, how low, how long it holds there, where it comes back to]; `cut`; `restore`):
    // the ballasts buzzing up as it falters, ticking and crackling at each dip; at the cut a breaker's light click, the
    // buzz dying, the motors and their air winding down, the lamps pinging now and then as they cool and the emergency
    // lights' faint whine; then a breaker closing, the transformers' hum surging back, the lamps' starters ticking each on
    // with a blip of buzz, and the motors spinning back up. With null, or muted, quiet at once.
    const outage = (O) => {
      if (!ready) return false;
      const now = ctx.currentTime, voices = [out.buzzGain, out.tickGain, out.pingGain, out.tripGain, out.knockGain, out.motorGain, out.whirrGain, out.inrushGain, out.whineGain];
      for (const g of voices) { g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0, now, 0.04); }
      if (!O || muted) return false;
      const t0 = now + 0.05, at = (s) => t0 + s, C = O.cut, R = O.restore, rand = (a, b) => a + Math.random() * (b - a);
      for (const g of voices) g.gain.setValueAtTime(0, t0);
      const ticks = [];
      // The ballasts straining, then buzzing up at each dip with a tick and a crackle or two; flaring and dying at the cut.
      const B = out.buzzGain.gain, rest = OUT.buzz * 0.25;
      B.linearRampToValueAtTime(rest, at(O.from + 0.6));
      for (const [s, low, hold] of O.dips) {
        const loud = OUT.buzz * (0.4 + 1.6 * (1 - low));
        B.setValueAtTime(rest, at(s)); B.linearRampToValueAtTime(loud, at(s + 0.03));
        B.setValueAtTime(loud, at(s + 0.05 + hold)); B.linearRampToValueAtTime(rest * 1.4, at(s + 0.2 + hold));
        ticks.push([s, 1, 3200, rand(-0.6, 0.6)]);
        for (let k = 0; k < 2; k++) ticks.push([s + rand(0.02, hold + 0.08), rand(0.35, 0.7), rand(2400, 4200), rand(-0.8, 0.8)]);
      }
      B.setValueAtTime(rest * 1.4, at(C)); B.linearRampToValueAtTime(OUT.buzz * 0.9, at(C + 0.04)); B.exponentialRampToValueAtTime(0.0005, at(C + 0.3)); B.setValueAtTime(0, at(C + 0.31));
      // A breaker's click and its knock, at the cut and, heavier, at the restore.
      const click = (s, level, hz, knockHz) => {
        const G = out.tripGain.gain, K = out.knockGain.gain;
        out.tripBand.frequency.setValueAtTime(hz, at(s));
        G.setValueAtTime(0, at(s)); G.linearRampToValueAtTime(level, at(s + 0.002)); G.exponentialRampToValueAtTime(0.0005, at(s + 0.05)); G.setValueAtTime(0, at(s + 0.051));
        out.knock.frequency.setValueAtTime(knockHz, at(s));
        K.setValueAtTime(0, at(s)); K.linearRampToValueAtTime(OUT.knock, at(s + 0.003)); K.exponentialRampToValueAtTime(0.0005, at(s + 0.12)); K.setValueAtTime(0, at(s + 0.121));
      };
      click(C, OUT.trip, 2600, 620);
      click(R, OUT.trip * 0.8, 1900, 520);
      // The motors and their air winding down from the cut, and back up from just after the restore.
      const M = out.motorGain.gain, W = out.whirrGain.gain, f1 = out.motor.frequency, f2 = out.motor2.frequency, wf = out.whirrBand.frequency, [hi, lo] = OUT.spin, up = R + 0.2;
      M.setValueAtTime(OUT.motor, at(C)); M.exponentialRampToValueAtTime(0.0008, at(C + OUT.down)); M.setValueAtTime(0, at(C + OUT.down + 0.01));
      W.setValueAtTime(OUT.whirr, at(C)); W.exponentialRampToValueAtTime(0.0008, at(C + OUT.down * 0.85)); W.setValueAtTime(0, at(C + OUT.down * 0.85 + 0.01));
      f1.setValueAtTime(hi, at(C)); f1.exponentialRampToValueAtTime(lo, at(C + OUT.down));
      f2.setValueAtTime(hi * 2, at(C)); f2.exponentialRampToValueAtTime(lo * 2, at(C + OUT.down));
      wf.setValueAtTime(600, at(C)); wf.exponentialRampToValueAtTime(110, at(C + OUT.down));
      M.setValueAtTime(0.0008, at(up)); M.exponentialRampToValueAtTime(OUT.motor, at(up + OUT.up)); M.linearRampToValueAtTime(0, at(up + OUT.up + 1.2));
      W.setValueAtTime(0.0008, at(up)); W.exponentialRampToValueAtTime(OUT.whirr, at(up + OUT.up)); W.linearRampToValueAtTime(0, at(up + OUT.up + 1.2));
      f1.setValueAtTime(lo, at(up)); f1.exponentialRampToValueAtTime(hi, at(up + OUT.up));
      f2.setValueAtTime(lo * 2, at(up)); f2.exponentialRampToValueAtTime(hi * 2, at(up + OUT.up));
      wf.setValueAtTime(110, at(up)); wf.exponentialRampToValueAtTime(600, at(up + OUT.up));
      // The lamps pinging now and then as they cool.
      const P = out.pingGain.gain;
      for (let s = C + rand(0.8, 1.6); s < Math.min(R - 0.5, C + 9); s += rand(0.9, 2.2)) {
        out.ping.frequency.setValueAtTime(rand(2800, 5200), at(s)); out.pingPan.pan.setValueAtTime(rand(-0.8, 0.8), at(s));
        P.setValueAtTime(0, at(s)); P.linearRampToValueAtTime(OUT.ping * rand(0.5, 1), at(s + 0.002)); P.exponentialRampToValueAtTime(0.0003, at(s + 0.25)); P.setValueAtTime(0, at(s + 0.26));
      }
      // The emergency lights' faint whine while the power is out.
      const H = out.whineGain.gain;
      H.setValueAtTime(0, at(C + 0.3)); H.linearRampToValueAtTime(OUT.whine, at(C + 0.9)); H.setValueAtTime(OUT.whine, at(R)); H.linearRampToValueAtTime(0, at(R + 0.3));
      // The transformers' hum surging back.
      const I = out.inrushGain.gain;
      out.inrush.frequency.setValueAtTime(44, at(R)); out.inrush.frequency.linearRampToValueAtTime(55, at(R + 0.35));
      I.setValueAtTime(0, at(R + 0.01)); I.linearRampToValueAtTime(OUT.inrush, at(R + 0.04)); I.exponentialRampToValueAtTime(0.0005, at(R + 0.9)); I.setValueAtTime(0, at(R + 0.91));
      // The lamps' starters, each a tick and a blip of buzz, at their own moments as the power comes back.
      const starts = [], n = Math.round(rand(OUT.starters[0], OUT.starters[1]));
      for (let k = 0; k < n; k++) starts.push(R + rand(0.08, 1.7));
      starts.sort((a, b) => a - b);
      let last = -1;
      for (const s of starts) {
        if (s - last < 0.14) continue;
        last = s;
        ticks.push([s, rand(0.5, 0.9), rand(2600, 3800), rand(-0.8, 0.8)]);
        const blip = OUT.buzz * rand(0.4, 0.9);
        B.setValueAtTime(0, at(s)); B.linearRampToValueAtTime(blip, at(s + 0.01)); B.linearRampToValueAtTime(0, at(s + rand(0.05, 0.12)));
      }
      // Every tick in time order on its one voice.
      ticks.sort((a, b) => a[0] - b[0]);
      const T = out.tickGain.gain;
      let prev = -1;
      for (const [s, level, hz, pan] of ticks) {
        if (s - prev < 0.03) continue;
        prev = s;
        out.tickBand.frequency.setValueAtTime(hz, at(s)); out.tickPan.pan.setValueAtTime(pan, at(s));
        T.setValueAtTime(0, at(s)); T.linearRampToValueAtTime(OUT.tick * level, at(s + 0.001)); T.exponentialRampToValueAtTime(0.0003, at(s + 0.025)); T.setValueAtTime(0, at(s + 0.026));
      }
      return true;
    };

    // A blackout from now, on its times `B` (s from its start: the power killed at `kill`, the banks coming back on at
    // `banks`, the end): a heavy relay's clunk as it dies; a low hum in the dark, wavering; a clunk as each bank comes
    // back, the hum gone with the first. The mains and the neon follow `power`, which the anomaly sets.
    const blackout = (B) => {
      if (!ready || muted) return false;
      const t0 = ctx.currentTime + 0.02, at = (s) => t0 + s, T = test, first = B.banks[0];
      const clear = (param, value) => { param.cancelScheduledValues(t0); param.setValueAtTime(value, t0); };
      for (const g of [T.humGain, T.clankGain]) clear(g.gain, 0);
      clear(T.clankFilter.frequency, 300); clear(T.hum.frequency, 100);
      T.clankGain.gain.setValueAtTime(TEST.clank * 0.7, at(B.kill));
      T.clankGain.gain.exponentialRampToValueAtTime(0.001, at(B.kill + 0.35));
      T.hum.frequency.setValueAtTime(55, at(B.kill));
      T.humGain.gain.setValueAtTime(0, at(B.kill + 0.3));
      T.humGain.gain.linearRampToValueAtTime(TEST.hum * 0.7, at(B.kill + 1.2));
      for (let s = B.kill + 1.5; s < first - 0.2; s += 0.5 + Math.random() * 0.4) T.humGain.gain.linearRampToValueAtTime(TEST.hum * (0.5 + Math.random() * 0.4), at(s));
      T.humGain.gain.linearRampToValueAtTime(0, at(first));
      B.banks.forEach((s, i) => {
        T.clankFilter.frequency.setValueAtTime(330 + i * 70, at(s));
        T.clankGain.gain.setValueAtTime(TEST.clank * 0.5, at(s));
        T.clankGain.gain.exponentialRampToValueAtTime(0.001, at(s + 0.25));
      });
      T.hum.frequency.setValueAtTime(100, at(B.end));
      return true;
    };
    // The lowrider from now, on its times `L` (s from its start: the first beat, the beat, how many, how hard each, 0..1,
    // and how far into a beat the nose gear comes down, `slam`): as the gear hits on each beat, a sledgehammer's thud
    // (`BANG`): the hit (`hit` loud, its band closing from `close[0]` to `close[1]` Hz over `hitLen` s), a dull knock
    // (`knock` loud, falling from `knockHz[0]` to `knockHz[1]` Hz over `knockLen` s, a little out of tune each time, by up
    // to `detune`), and the deep body under it, dropping from `from` to `to` Hz over `drop` s, `body[0]` loud and gone by
    // `body[1]` s.
    const BANG = { hit: 1.2, close: [900, 110], hitLen: 0.13, knock: 0.6, knockHz: [170, 105], knockLen: 0.16, detune: 0.05, from: 95, to: 42, drop: 0.045, body: [1.1, 0.4] };
    const lowrider = (L) => {
      if (!ready || muted) return false;
      const t0 = ctx.currentTime + 0.02, at = (s) => t0 + s, T = test;
      const clear = (param, value) => { param.cancelScheduledValues(t0); param.setValueAtTime(value, t0); };
      clear(T.thumpGain.gain, 0); clear(T.bangHitGain.gain, 0); clear(T.bangKnockGain.gain, 0);
      clear(T.thump.frequency, BANG.from); clear(T.thump2.frequency, BANG.from * 2); clear(T.bangHitBand.frequency, BANG.close[0]); clear(T.bangKnock.frequency, BANG.knockHz[0]);
      for (let n = 0; n < L.beats; n++) {
        const s = L.start + (n + L.slam) * L.beat, k = L.hard(n), tune = 1 + (Math.random() - 0.5) * BANG.detune;
        T.bangHitBand.frequency.setValueAtTime(BANG.close[0], at(s));
        T.bangHitBand.frequency.exponentialRampToValueAtTime(BANG.close[1], at(s + BANG.hitLen));
        T.bangHitGain.gain.setValueAtTime(0, at(s));
        T.bangHitGain.gain.linearRampToValueAtTime(TEST.bang * BANG.hit * k, at(s + 0.002));
        T.bangHitGain.gain.exponentialRampToValueAtTime(0.001, at(s + BANG.hitLen + 0.05));
        T.bangKnock.frequency.setValueAtTime(BANG.knockHz[0] * tune, at(s));
        T.bangKnock.frequency.exponentialRampToValueAtTime(BANG.knockHz[1] * tune, at(s + BANG.knockLen));
        T.bangKnockGain.gain.setValueAtTime(0, at(s));
        T.bangKnockGain.gain.linearRampToValueAtTime(TEST.bang * BANG.knock * k, at(s + 0.003));
        T.bangKnockGain.gain.exponentialRampToValueAtTime(0.001, at(s + BANG.knockLen));
        T.thump.frequency.setValueAtTime(BANG.from, at(s));
        T.thump.frequency.exponentialRampToValueAtTime(BANG.to, at(s + BANG.drop));
        T.thump2.frequency.setValueAtTime(BANG.from * 2, at(s));
        T.thump2.frequency.exponentialRampToValueAtTime(BANG.to * 2, at(s + BANG.drop));
        T.thumpGain.gain.setValueAtTime(0, at(s));
        T.thumpGain.gain.linearRampToValueAtTime(TEST.thump * BANG.body[0] * k, at(s + 0.003));
        T.thumpGain.gain.exponentialRampToValueAtTime(0.001, at(s + BANG.body[1]));
      }
      return true;
    };
    // The Jet shuffling in its bay from now, on its times `S` (s from its start): the brakes letting go with a clunk at
    // `brake`; a tyre scrub at each of `scrubs`; a creak of loaded metal at each of `creaks`, the clank's ring gliding up;
    // and the engines' short bursts, `bursts` [s, how hard], a whoomph and a cough of roar.
    const shuffle = (S) => {
      if (!ready || muted) return false;
      const t0 = ctx.currentTime + 0.02, at = (s) => t0 + s, T = test;
      const clear = (param, value) => { param.cancelScheduledValues(t0); param.setValueAtTime(value, t0); };
      for (const g of [T.clankGain, T.whooshGain, T.whoomphGain, T.roarGain]) clear(g.gain, 0);
      clear(T.clankFilter.frequency, 380); clear(T.whooshFilter.frequency, 700); clear(T.roarFilter.frequency, 900);
      T.clankGain.gain.setValueAtTime(TEST.clank * 0.6, at(S.brake));
      T.clankGain.gain.exponentialRampToValueAtTime(0.001, at(S.brake + 0.3));
      for (const s of S.scrubs) {
        T.whooshGain.gain.setValueAtTime(0, at(s));
        T.whooshGain.gain.linearRampToValueAtTime(TEST.whoosh * 0.9, at(s + 0.04));
        T.whooshGain.gain.exponentialRampToValueAtTime(0.001, at(s + 0.32));
      }
      for (const s of S.creaks) {
        T.clankFilter.frequency.setValueAtTime(560 + Math.random() * 120, at(s));
        T.clankFilter.frequency.linearRampToValueAtTime(820 + Math.random() * 160, at(s + 0.4));
        T.clankGain.gain.setValueAtTime(0, at(s));
        T.clankGain.gain.linearRampToValueAtTime(TEST.clank * 0.25, at(s + 0.08));
        T.clankGain.gain.exponentialRampToValueAtTime(0.001, at(s + 0.45));
      }
      for (const [s, k] of S.bursts) {
        T.whoomphGain.gain.setValueAtTime(TEST.whoomph * 0.25 * k, at(s));
        T.whoomphGain.gain.exponentialRampToValueAtTime(0.001, at(s + 0.5));
        T.roarGain.gain.setValueAtTime(0, at(s));
        T.roarGain.gain.linearRampToValueAtTime(TEST.roar * 0.22 * k, at(s + 0.04));
        T.roarGain.gain.linearRampToValueAtTime(0, at(s + 0.3));
      }
      return true;
    };
    // How much of the hall's electrical hum has power: the mains at once, the neon with the bed's next levelling.
    const setPower = (k) => {
      power = k;
      if (ready && !muted) bed.mainsGain.gain.setTargetAtTime(LEVEL.mains * k * strained, ctx.currentTime, 0.03);
    };

    // The hall's hum straining as the power falters: the mains, the drone, the air and the neon at `level` (0 to 1) of
    // themselves, followed quickly, and the mains' pitch sagging by `sag` (0 to 1) of `SAG`. A brownout's sound, not a
    // breakdown's: nothing clunks.
    const strain = (level, sag) => {
      if (level === strained && sag === sagged) return;
      strained = level; sagged = sag;
      if (!ready) return;
      const now = ctx.currentTime;
      quickUntil = now + 0.4;
      bed.mains.frequency.setTargetAtTime(55 * (1 - SAG * sag), now, 0.05);
      bed.mains2.frequency.setTargetAtTime(110 * (1 - SAG * sag), now, 0.05);
      if (muted) return;
      bed.mainsGain.gain.setTargetAtTime(LEVEL.mains * power * level, now, 0.04);
      bed.droneGain.gain.setTargetAtTime(LEVEL.drone * level, now, 0.04);
      bed.airGain.gain.setTargetAtTime((LEVEL.air + LEVEL.tunnelAir * clamp((spots.tunnel.z0 - ear.z) / 6, 0, 1)) * level, now, 0.04);
    };

    // Only from a gesture the browser has already counted, so nothing warns in the console; a gesture also wakes a
    // context the browser started suspended.
    const activate = () => {
      if (disposed) return;
      if (ready) {
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        return;
      }
      if (muted || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      init();
    };
    window.addEventListener("pointerdown", activate, true);
    window.addEventListener("keydown", activate, true);
    // Keep the bed playing in the background; returning can wake a context the browser suspended.
    const onVisibility = () => {
      if (ready && !document.hidden && ctx.state === "suspended") ctx.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Where (x, y, z) is from the visitor, into AT: its level, half at `ref` metres, and its side of the view.
    const place = (x, y, z, ref) => {
      const dx = x - ear.x, dy = y - ear.y, dz = z - ear.z, flat = Math.hypot(dx, dz), r = Math.hypot(flat, dy) / ref;
      AT.level = 1 / (1 + r * r);
      AT.pan = flat > 0.5 ? clamp((dx * -ear.fz + dz * ear.fx) / flat, -1, 1) * PAN * Math.min(1, flat / 3) : 0;
    };
    // The glint where the air shimmers at (x, y, z), `level` 0 (silent) to 1.
    const glint = (x, y, z, level) => {
      glinting.x = x; glinting.y = y; glinting.z = z; glinting.level = level;
    };
    const listen = (x, y, z, fx, fz) => {
      const l = Math.hypot(fx, fz) || 1;
      ear.x = x; ear.y = y; ear.z = z; ear.fx = fx / l; ear.fz = fz / l;
    };

    // The bed, ten times a second, eased: the neon from the nearest point on the tunnel's axis, so it surrounds a
    // visitor inside it and comes out of its mouth to one in the hall, and each shield from where it stands.
    const set = (param, value, now) => param.setTargetAtTime(value, now, now < quickUntil ? 0.04 : 0.15);
    const update = (dt) => {
      if (!ready) {
        activate();
        if (!ready) return;
      }
      since += dt;
      if (since < 0.1 || muted) return;
      since = 0;
      const now = ctx.currentTime, T = spots.tunnel, L = spots.launch, D = spots.door;
      set(bed.mainsGain.gain, LEVEL.mains * power * strained, now);
      set(bed.droneGain.gain, LEVEL.drone * strained, now);
      set(bed.airGain.gain, (LEVEL.air + LEVEL.tunnelAir * clamp((T.z0 - ear.z) / 6, 0, 1)) * strained, now);
      place(0, T.y, clamp(ear.z, T.z1, T.z0), REF.neon);
      set(bed.neonGain.gain, LEVEL.neon * AT.level * power * strained, now);
      set(bed.neonPan.pan, AT.pan * 0.4, now);
      place(L.x, L.y, L.z, REF.launch);
      set(bed.launch.gain.gain, LEVEL.launch * AT.level, now);
      set(bed.launch.pan.pan, AT.pan, now);
      place(D.x, D.y, D.z, REF.door);
      set(bed.door.gain.gain, LEVEL.door * AT.level, now);
      set(bed.door.pan.pan, AT.pan, now);
      place(glinting.x, glinting.y, glinting.z, REF.glint);
      set(bed.glintGain.gain, LEVEL.glint * glinting.level * AT.level, now);
      set(bed.glintPan.pan, AT.pan, now);
      place(spots.booth.x, spots.booth.y, spots.booth.z, 1);
      set(test.boothPan.pan, AT.pan, now);
      const E = spots.engines;
      place(E.x, E.y, E.z, 1);
      set(test.enginePan.pan, AT.pan * 0.6, now);
      place(spots.gear.x, spots.gear.y, spots.gear.z, 1);
      set(test.bangPan.pan, AT.pan, now);
      // Each engine's rev from where it stands, the two pushed farther apart than they are.
      place(E.x - E.gap, E.y, E.z, 1);
      const left = AT.pan;
      place(E.x + E.gap, E.y, E.z, 1);
      const right = AT.pan, mid = (left + right) / 2;
      set(test.revs[0].pan.pan, clamp(mid + (left - mid) * REV_SPREAD, -1, 1), now);
      set(test.revs[1].pan.pan, clamp(mid + (right - mid) * REV_SPREAD, -1, 1), now);
      if (sisVoice.until > now) placeSis(now, false);
      const Pj = spots.projector, Sc = spots.screen;
      place(Pj.x, Pj.y, Pj.z, FILM_REF.projector);
      set(proj.near.gain, AT.level, now);
      set(proj.pan.pan, AT.pan, now);
      place(Sc.x, Sc.y, Sc.z, FILM_REF.screen);
      set(proj.screenNear.gain, AT.level, now);
      set(proj.screenPan.pan, AT.pan * 0.7, now);
      const Fk = spots.forklift;
      place(Fk.x, Fk.y, Fk.z, LIFT.ref);
      set(fork.near.gain, AT.level, now);
      set(fork.runPan.pan, AT.pan, now);
      if (craneState) {
        const c = craneState;
        place(c.x, c.y, c.z, CRANE.ref);
        set(crane.near.gain, AT.level, now);
        set(crane.pan.pan, AT.pan, now);
        set(crane.travel.gain, Math.min(1, c.travel * 1.6), now);
        set(crane.whine.frequency, CRANE.travelHz[0] + (CRANE.travelHz[1] - CRANE.travelHz[0]) * c.travel, now);
        set(crane.hoist.gain, Math.min(1, c.hoist * 1.6), now);
        set(crane.hoistWhine.frequency, CRANE.hoistHz[0] + (CRANE.hoistHz[1] - CRANE.hoistHz[0]) * c.hoist, now);
        // The alarm's beeps a little ahead, while the bridge or the trolley moves.
        if (c.alarm) {
          const g = crane.alarmGain.gain;
          if (crane.nextBeep < now) crane.nextBeep = now + 0.05;
          for (; crane.nextBeep < now + 0.25; crane.nextBeep += CRANE.every) {
            const at = crane.nextBeep;
            g.setValueAtTime(0, at);
            g.linearRampToValueAtTime(CRANE.alarm, at + 0.01);
            g.setValueAtTime(CRANE.alarm, at + CRANE.beep - 0.02);
            g.linearRampToValueAtTime(0, at + CRANE.beep);
          }
        }
      }
      if (roomState) {
        const r = roomState;
        place(r.x, r.y, r.z, ROOM.ref);
        set(room.near.gain, AT.level, now);
        set(room.pan.pan, AT.pan, now);
        set(room.roar.gain, ROOM.roar * r.level, now);
        set(room.spray.gain, r.spray ? ROOM.spray : 0, now);
        // The crackle: a few sharp pops this tenth of a second, as many as the fire is big.
        const g = room.crackle.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(0, now);
        for (let i = 0; i < 4; i++) {
          if (Math.random() > r.level * 0.9) continue;
          const at = now + Math.random() * 0.1, loud = ROOM.crackle * r.level * (0.4 + Math.random() * 0.6);
          g.setValueAtTime(loud, at);
          g.exponentialRampToValueAtTime(0.0001, at + 0.02 + Math.random() * 0.03);
        }
      }
      if (liftOn && now > liftReady) {
        set(fork.whine.frequency, 440 + WORK.whine * liftDrive, now);
        set(fork.whineGain.gain, LIFT.whine * (1 + WORK.swell * liftDrive), now);
        set(fork.hum.frequency, 58 + WORK.pump * liftPump, now);
        set(fork.hissGain.gain, LIFT.hiss * (1 + WORK.hiss * liftPump), now);
      }
    };
    // Her voice's level and side from where she stands now, eased, or at once as a line starts.
    const placeSis = (now, snap) => {
      const q = sisVoice.pos;
      place(q.x, q.y + 1, q.z, SIS_REF);
      const level = Math.max(sisVoice.least, AT.level);
      if (snap) { sis.level.gain.cancelScheduledValues(now); sis.level.gain.setValueAtTime(level, now); sis.pan.pan.cancelScheduledValues(now); sis.pan.pan.setValueAtTime(AT.pan, now); }
      else { set(sis.level.gain, level, now); set(sis.pan.pan, AT.pan, now); }
    };

    const setMuted = (value) => {
      muted = !!value;
      BL.sound.setMuted(muted);
      if (ready) master.gain.setTargetAtTime(muted ? 0 : MASTER * volume, ctx.currentTime, 0.05);
      else if (!muted) activate();
      return muted;
    };
    const offSound = BL.sound.subscribe(setMuted);
    // A hammer blow on the Jet at (x, y, z), each a little different, quieter with distance, `loud` times as loud.
    const clang = (x, y, z, loud = 1) => {
      if (!ready || muted) return;
      place(x, y, z, 7);
      const now = ctx.currentTime, k = 0.55 * loud * AT.level, f = 1300 + Math.random() * 1400, T = test;
      T.clangPan.pan.setValueAtTime(AT.pan, now);
      T.clangFilter.frequency.setValueAtTime(f, now);
      T.clangGain.gain.cancelScheduledValues(now);
      T.clangGain.gain.setValueAtTime(k, now);
      T.clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      T.ding.frequency.setValueAtTime(f * 1.18, now);
      T.dingGain.gain.cancelScheduledValues(now);
      T.dingGain.gain.setValueAtTime(k * 0.35, now);
      T.dingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    };
    // Kortik's Sis says `text` in `style` (a key of SIS_STYLE) from where `pos` stands, cutting off whatever she was
    // saying: a syllable for each run of vowels in a word, voiced with that vowel's formants; a bleep over a word with
    // a grawlix in it; a short gap between words and longer pauses at commas, "...", and a sentence's end, her last
    // syllable before a "!" or a "?" stressed, a dash cutting her off. Returns how long she sounds, s, the same whether
    // or not the hall can play it yet, so her mouth runs as long.
    const voice = (text, style, pos) => {
      const S = SIS_STYLE[style], play = ready && !muted, now = play ? ctx.currentTime : 0;
      const pitch = S.f0 * (0.92 + Math.random() * 0.18), tempo = 0.9 + Math.random() * 0.2;
      if (play) {
        for (const param of [sis.env.gain, sis.bleepGain.gain, sis.buzz.frequency, sis.f1.frequency, sis.f2.frequency]) param.cancelScheduledValues(now);
        sis.env.gain.setTargetAtTime(0.0001, now, 0.01);
        sis.bleepGain.gain.setTargetAtTime(0, now, 0.01);
        sis.buzzGain.gain.setValueAtTime(S.buzz, now);
        sis.breathGain.gain.setValueAtTime(S.breath, now);
        sis.shake.gain.setValueAtTime(S.shake, now);
        sis.tone.frequency.setValueAtTime(S.tone, now);
        sis.f3.frequency.setValueAtTime(F3 * S.formant, now);
        sisVoice.pos = pos; sisVoice.least = S.least;
        placeSis(now, true);
      }
      const len = S.len * tempo, gap = S.gap * tempo, level = Math.max(0.0002, S.level);
      let t = 0.03, n = text.length, i = 0, count = 0;
      while (i < n) {
        if (text.charCodeAt(i) === 32) { i++; continue; }
        // One word, [i, j): a grawlix in it, its vowel runs, and the punctuation it ends on.
        let j = i, grawlix = false, runs = 0, letters = 0;
        for (; j < n && text.charCodeAt(j) !== 32; j++) {
          const r = text.charCodeAt(j), c = r & ~32;
          if (r === 35 || r === 64 || r === 36 || r === 37 || r === 38 || r === 42) grawlix = true;
          if (c >= 65 && c <= 90) letters++;
          if (FORMANTS[c] && !FORMANTS[text.charCodeAt(j - 1) & ~32]) runs++;
        }
        const end = text.charCodeAt(j - 1), dots = j - i > 2 && text.charCodeAt(j - 2) === 46 && end === 46;
        const stress = end === 33 || end === 63, rise = text.charCodeAt(j - 1) === 63 || text.charCodeAt(j - 2) === 63;
        if (grawlix) {
          if (play) {
            sis.bleepGain.gain.setValueAtTime(0, now + t);
            sis.bleepGain.gain.linearRampToValueAtTime(level * 0.55, now + t + 0.01);
            sis.bleepGain.gain.setValueAtTime(level * 0.55, now + t + BLEEP);
            sis.bleepGain.gain.linearRampToValueAtTime(0, now + t + BLEEP + 0.01);
          }
          t += BLEEP + gap;
        } else if (letters) {
          // Each syllable: its pitch falling a little along the line, stressed at the end, rising for a question.
          let k = i;
          for (let s2 = 0; s2 < Math.max(1, runs); s2++) {
            while (k < j && !FORMANTS[text.charCodeAt(k) & ~32]) k++;
            const v = k < j ? FORMANTS[text.charCodeAt(k) & ~32] : SCHWA, last = s2 === Math.max(1, runs) - 1;
            while (k < j && FORMANTS[text.charCodeAt(k) & ~32]) k++;
            const l = last && stress ? len * 1.5 : len, f = pitch * (1 - Math.min(0.12, count * 0.006)) * (0.94 + Math.random() * 0.12);
            const bend = last && stress ? (rise ? S.end * 1.08 : S.end) : 1 + (Math.random() - 0.5) * 0.06;
            if (play) {
              const at = now + t, peak = last && stress ? level : level * 0.82;
              sis.buzz.frequency.setValueAtTime(f, at);
              sis.buzz.frequency.linearRampToValueAtTime(f * bend, at + l);
              sis.f1.frequency.setValueAtTime(v[0] * S.formant, at);
              sis.f2.frequency.setValueAtTime(v[1] * S.formant, at);
              sis.env.gain.setValueAtTime(0.0001, at);
              sis.env.gain.exponentialRampToValueAtTime(peak, at + 0.018);
              sis.env.gain.setValueAtTime(peak, at + l * 0.7);
              sis.env.gain.exponentialRampToValueAtTime(0.0001, at + l);
            }
            t += l + gap;
            count++;
          }
        }
        // The pause after the word: a beat between words, longer at a comma, "..." and a sentence's end, none at a dash.
        t += end === 8212 ? 0 : dots ? 0.3 * tempo : end === 44 ? 0.12 * tempo : stress || end === 46 ? 0.16 * tempo : 0.035 * tempo;
        i = j;
      }
      if (play) sisVoice.until = now + t;
      return t;
    };
    // Her boot coming down at (x, y, z), heavier at a run.
    const boot = (x, y, z, run) => {
      if (!ready || muted) return;
      place(x, y, z, BOOT_REF);
      if (AT.level < 0.02) return;
      const now = ctx.currentTime, k = (run ? 0.5 : 0.3) * AT.level * (0.85 + Math.random() * 0.3);
      sis.bootPan.pan.setValueAtTime(AT.pan, now);
      sis.bootGain.gain.cancelScheduledValues(now);
      sis.bootGain.gain.setValueAtTime(k, now);
      sis.bootGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      sis.knock.frequency.cancelScheduledValues(now);
      sis.knock.frequency.setValueAtTime(95, now);
      sis.knock.frequency.exponentialRampToValueAtTime(48, now + 0.08);
      sis.knockGain.gain.cancelScheduledValues(now);
      sis.knockGain.gain.setValueAtTime(k * 0.6, now);
      sis.knockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    };
    // A poke landing on her at (x, y, z): a rubbery boink.
    const poke = (x, y, z) => {
      if (!ready || muted) return;
      place(x, y, z, BOOT_REF);
      const now = ctx.currentTime, k = 0.3 * AT.level;
      sis.bootPan.pan.setValueAtTime(AT.pan, now);
      sis.boink.frequency.cancelScheduledValues(now);
      sis.boink.frequency.setValueAtTime(620, now);
      sis.boink.frequency.exponentialRampToValueAtTime(1180, now + 0.05);
      sis.boink.frequency.exponentialRampToValueAtTime(760, now + 0.11);
      sis.boinkGain.gain.cancelScheduledValues(now);
      sis.boinkGain.gain.setValueAtTime(0.0001, now);
      sis.boinkGain.gain.exponentialRampToValueAtTime(k, now + 0.012);
      sis.boinkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    };
    // A warning light's beep on the Jet at (x, y, z), or a door keypad's at its own pitch (Hz) and length (s).
    const beep = (x, y, z, hz = 1900, length = 0.1) => {
      if (!ready || muted) return;
      place(x, y, z, BOOT_REF);
      const now = ctx.currentTime, k = 0.22 * AT.level;
      sis.bootPan.pan.setValueAtTime(AT.pan, now);
      sis.boink.frequency.cancelScheduledValues(now);
      sis.boink.frequency.setValueAtTime(hz, now);
      sis.boinkGain.gain.cancelScheduledValues(now);
      sis.boinkGain.gain.setValueAtTime(k, now);
      sis.boinkGain.gain.setValueAtTime(k, now + length - 0.01);
      sis.boinkGain.gain.linearRampToValueAtTime(0, now + length);
    };
    // The forklift's button pressed at (x, y, z): its click and thunk, then the buzz that says no, twice.
    const denied = (x, y, z) => {
      if (!ready || muted) return;
      place(x, y, z, BOOT_REF);
      const now = ctx.currentTime, k = FORK.buzz * AT.level;
      fork.pan.pan.setValueAtTime(AT.pan, now);
      for (const param of [fork.clickGain.gain, fork.thunkGain.gain, fork.thunk.frequency, fork.buzzGain.gain, fork.buzz.frequency, fork.buzz2.frequency]) param.cancelScheduledValues(now);
      fork.clickGain.gain.setValueAtTime(FORK.click * AT.level, now);
      fork.clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
      fork.thunk.frequency.setValueAtTime(150, now);
      fork.thunk.frequency.exponentialRampToValueAtTime(70, now + 0.07);
      fork.thunkGain.gain.setValueAtTime(FORK.thunk * AT.level, now);
      fork.thunkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      fork.buzzGain.gain.setValueAtTime(0, now);
      for (const [from, length, hz] of DENIED) {
        const at = now + from;
        fork.buzz.frequency.setValueAtTime(hz, at);
        fork.buzz2.frequency.setValueAtTime(hz * 1.05, at);
        fork.buzzGain.gain.setValueAtTime(0, at);
        fork.buzzGain.gain.linearRampToValueAtTime(k, at + 0.006);
        fork.buzzGain.gain.setValueAtTime(k, at + length - 0.02);
        fork.buzzGain.gain.linearRampToValueAtTime(0, at + length);
      }
    };
    // The forklift's horn, a short honk.
    const horn = () => {
      if (!ready || muted) return;
      const now = ctx.currentTime, k = HORN.level, g = fork.hornGain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(0, now);
      g.linearRampToValueAtTime(k, now + 0.012);
      g.setValueAtTime(k, now + HORN.length - 0.05);
      g.linearRampToValueAtTime(0, now + HORN.length);
    };
    // How hard the forklift works, each 0 to 1: its speed of its top, and whether the forks are moving.
    const forkliftWork = (drive, pump) => { liftDrive = drive; liftPump = pump; };
    // The forklift switched on, the relay clicking and its drive spinning up through `spin` and chiming ready, then running;
    // or off, the relay clicking and all of it running down through `down`.
    const forklift = (on) => {
      liftOn = !!on;
      if (!ready) return;
      const now = ctx.currentTime, k = muted ? 0 : 1;
      for (const param of [fork.env.gain, fork.whine.frequency, fork.hum.frequency, fork.relayGain.gain, fork.chimeGain.gain, fork.chime.frequency]) param.cancelScheduledValues(now);
      fork.env.gain.setValueAtTime(fork.env.gain.value, now);
      fork.whine.frequency.setValueAtTime(fork.whine.frequency.value, now);
      fork.hum.frequency.setValueAtTime(fork.hum.frequency.value, now);
      fork.relayGain.gain.setValueAtTime(LIFT.click * k, now);
      fork.relayGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
      if (on) {
        liftReady = now + LIFT.spin;
        fork.env.gain.linearRampToValueAtTime(1, now + 0.3);
        fork.whine.frequency.setValueAtTime(80, now);
        fork.whine.frequency.exponentialRampToValueAtTime(440, now + LIFT.spin);
        fork.hum.frequency.setValueAtTime(25, now);
        fork.hum.frequency.exponentialRampToValueAtTime(58, now + LIFT.spin);
        const at = now + LIFT.spin;
        fork.chime.frequency.setValueAtTime(880, at);
        fork.chime.frequency.setValueAtTime(1320, at + 0.13);
        fork.chimeGain.gain.setValueAtTime(0, at);
        fork.chimeGain.gain.linearRampToValueAtTime(LIFT.chime * k, at + 0.01);
        fork.chimeGain.gain.setValueAtTime(LIFT.chime * k, at + 0.12);
        fork.chimeGain.gain.linearRampToValueAtTime(LIFT.chime * k * 0.8, at + 0.13);
        fork.chimeGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
      } else {
        fork.whine.frequency.exponentialRampToValueAtTime(60, now + LIFT.down);
        fork.hum.frequency.exponentialRampToValueAtTime(20, now + LIFT.down);
        fork.env.gain.linearRampToValueAtTime(0, now + LIFT.down);
      }
    };
    // The projector starting, its motor and clatter spinning up through 1.5 s and the track coming on, or stopping, all
    // of it running down through 2 s.
    const projector = (on) => {
      projOn = !!on;
      if (!ready) return;
      const now = ctx.currentTime, up = 1.5, down = 2;
      for (const param of [proj.env.gain, proj.track.gain, proj.clatter.frequency, proj.motor.frequency]) param.cancelScheduledValues(now);
      proj.env.gain.setValueAtTime(proj.env.gain.value, now);
      proj.track.gain.setValueAtTime(proj.track.gain.value, now);
      proj.clatter.frequency.setValueAtTime(proj.clatter.frequency.value, now);
      proj.motor.frequency.setValueAtTime(proj.motor.frequency.value, now);
      if (on) {
        proj.env.gain.linearRampToValueAtTime(1, now + 0.4);
        proj.clatter.frequency.setValueAtTime(3, now);
        proj.clatter.frequency.exponentialRampToValueAtTime(24, now + up);
        proj.motor.frequency.setValueAtTime(30, now);
        proj.motor.frequency.exponentialRampToValueAtTime(98, now + up);
        proj.track.gain.setValueAtTime(0, now + up * 0.6);
        proj.track.gain.linearRampToValueAtTime(1, now + up);
      } else {
        proj.clatter.frequency.exponentialRampToValueAtTime(2, now + down);
        proj.motor.frequency.exponentialRampToValueAtTime(25, now + down);
        proj.env.gain.linearRampToValueAtTime(0, now + down);
        proj.track.gain.linearRampToValueAtTime(0, now + 0.3);
      }
    };
    // A picture clunking into the projector's gate.
    const clunk = () => {
      if (!ready || muted) return;
      const now = ctx.currentTime;
      proj.clunk.frequency.cancelScheduledValues(now);
      proj.clunk.frequency.setValueAtTime(130, now);
      proj.clunk.frequency.exponentialRampToValueAtTime(55, now + 0.12);
      proj.clunkGain.gain.cancelScheduledValues(now);
      proj.clunkGain.gain.setValueAtTime(FILM.clunk, now);
      proj.clunkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      proj.clickGain.gain.cancelScheduledValues(now);
      proj.clickGain.gain.setValueAtTime(FILM.click, now + 0.05);
      proj.clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    };
    // The screen's roller ratcheting for `seconds`, as it unrolls or rolls back up.
    const roll = (seconds) => {
      if (!ready || muted) return;
      const now = ctx.currentTime;
      proj.rollGain.gain.cancelScheduledValues(now);
      proj.rollGain.gain.setValueAtTime(0, now);
      proj.rollGain.gain.linearRampToValueAtTime(FILM.roll, now + 0.15);
      proj.rollGain.gain.setValueAtTime(FILM.roll, now + seconds - 0.2);
      proj.rollGain.gain.linearRampToValueAtTime(0, now + seconds);
    };
    // The crane's state to read from now on, { x, y, z, travel, hoist }, kept current by the crane.
    const watchCrane = (state) => { craneState = state; };
    // The control room's fire to read from now on, { x, y, z, level, spray }, kept current by `hangar-room-fire.js`.
    const watchRoom = (state) => { roomState = state; };
    // A cue from the control room at (x, y, z): `strike`, `out` or `clank`.
    const roomCue = (name, x, y, z) => {
      if (!ready || muted) return;
      place(x, y, z, ROOM.ref);
      const now = ctx.currentTime, k = AT.level;
      room.cuePan.pan.cancelScheduledValues(now);
      room.cuePan.pan.setValueAtTime(AT.pan, now);
      if (name === "strike") {
        const c = room.crackGain.gain, g = room.thumpGain.gain, f = room.thump.frequency;
        for (const p of [c, g, f]) p.cancelScheduledValues(now);
        c.setValueAtTime(ROOM.crack * k, now);
        c.exponentialRampToValueAtTime(0.0001, now + 0.35);
        f.setValueAtTime(120, now);
        f.exponentialRampToValueAtTime(40, now + 0.4);
        g.setValueAtTime(ROOM.thump * k, now);
        g.exponentialRampToValueAtTime(0.0001, now + 0.5);
      } else if (name === "out") {
        const g = room.outGain.gain, f = room.outFilter.frequency;
        g.cancelScheduledValues(now); f.cancelScheduledValues(now);
        f.setValueAtTime(3500, now);
        f.exponentialRampToValueAtTime(700, now + 1.2);
        g.setValueAtTime(ROOM.out * k, now);
        g.linearRampToValueAtTime(0, now + 1.3);
      } else if (name === "clank") {
        const g = room.clankGain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(ROOM.clank * k, now);
        g.exponentialRampToValueAtTime(0.0001, now + 0.25);
      } else throw new Error(`hangarAudio: no room cue ${name}`);
    };
    // A crane cue at (x, y, z): `brake`, `rattle`, `lift`, `land` or `horn`.
    const craneCue = (name, x, y, z) => {
      if (!ready || muted) return;
      place(x, y, z, CRANE.ref);
      const now = ctx.currentTime, k = AT.level;
      crane.cuePan.pan.cancelScheduledValues(now);
      crane.cuePan.pan.setValueAtTime(AT.pan, now);
      if (name === "brake") {
        for (const param of [crane.clunkGain.gain, crane.clunk.frequency, crane.clickGain.gain]) param.cancelScheduledValues(now);
        crane.clickGain.gain.setValueAtTime(CRANE.click * k, now);
        crane.clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
        crane.clunk.frequency.setValueAtTime(140, now);
        crane.clunk.frequency.exponentialRampToValueAtTime(60, now + 0.12);
        crane.clunkGain.gain.setValueAtTime(CRANE.clunk * k, now);
        crane.clunkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      } else if (name === "rattle") {
        const g = crane.clinkGain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(0, now);
        for (let i = 0, at = now; i < 7; i++) {
          at += 0.06 + Math.random() * 0.14;
          const loud = CRANE.clink * k * (0.5 + Math.random() * 0.5);
          g.setValueAtTime(loud, at);
          g.exponentialRampToValueAtTime(0.0001, at + 0.07);
        }
      } else if (name === "lift") {
        const g = crane.creakGain.gain, f = crane.creak.frequency;
        g.cancelScheduledValues(now); f.cancelScheduledValues(now);
        f.setValueAtTime(55, now);
        f.linearRampToValueAtTime(95, now + 0.7);
        g.setValueAtTime(0, now);
        g.linearRampToValueAtTime(CRANE.creak * k, now + 0.15);
        g.linearRampToValueAtTime(0, now + 0.8);
      } else if (name === "land") {
        for (const param of [crane.thudGain.gain, crane.thud.frequency, crane.thudNoise.gain]) param.cancelScheduledValues(now);
        crane.thud.frequency.setValueAtTime(110, now);
        crane.thud.frequency.exponentialRampToValueAtTime(45, now + 0.2);
        crane.thudGain.gain.setValueAtTime(CRANE.thud * k, now);
        crane.thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
        crane.thudNoise.gain.setValueAtTime(CRANE.thud * 0.6 * k, now);
        crane.thudNoise.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      } else if (name === "horn") {
        const g = crane.hornGain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(0, now);
        g.linearRampToValueAtTime(CRANE.horn * k, now + 0.03);
        g.setValueAtTime(CRANE.horn * k, now + CRANE.hornLen - 0.08);
        g.linearRampToValueAtTime(0, now + CRANE.hornLen);
      } else throw new Error(`hangarAudio: no crane cue ${name}`);
    };
    const setVolume = (value) => {
      volume = clamp(value, 0, 1);
      try {
        localStorage.setItem(VOLUME_KEY, String(volume));
      } catch {
      }
      if (ready && !muted) master.gain.setTargetAtTime(MASTER * volume, ctx.currentTime, 0.05);
      return volume;
    };

    const dispose = () => {
      offSound();
      disposed = true;
      window.removeEventListener("pointerdown", activate, true);
      window.removeEventListener("keydown", activate, true);
      document.removeEventListener("visibilitychange", onVisibility);
      if (ctx) ctx.close().catch(() => {});
      ctx = master = mix = muffle = buffer = null;
      ready = false;
      for (const key of Object.keys(bed)) bed[key] = null;
      for (const key of Object.keys(test)) test[key] = null;
      for (const key of Object.keys(sis)) sis[key] = null;
      for (const key of Object.keys(proj)) proj[key] = null;
      for (const key of Object.keys(crane)) crane[key] = null;
      craneState = null;
      for (const key of Object.keys(room)) room[key] = null;
      roomState = null;
      sisVoice.pos = null;
    };

    return {
      listen, update, setMuted, setVolume, glint, test: play, misfire, revs, zap, blackout, lowrider, shuffle, power: setPower, strain, outage, clang, voice, boot, poke, beep, denied, forklift, forkliftWork, horn, projector, clunk, roll, watchCrane, craneCue, watchRoom, roomCue, dispose,
      get muted() { return muted; },
      get volume() { return volume; },
      get ready() { return ready; },
      get state() { return ctx ? ctx.state : "none"; }
    };
  };

  BL.hangarAudio = { create };
})();
