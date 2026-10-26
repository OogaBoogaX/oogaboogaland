// The Lightning Jet Hangar's sound, on the Lightning Factory's pattern: one AudioContext opened from a gesture the
// browser has already activated, a bed of voices built once and only ever re-levelled, so nothing is allocated or
// restarted while it plays, and one noise loop behind every hiss.
//
// The bed is the hangar humming: everywhere the mains' low hum, a deep drone that beats and swells slowly, and the
// vast hall's air breathing; and, louder as the visitor nears each, the launch tunnel's neon buzzing all round them
// inside it, and the shimmer of each shield, the launch shield's at the tunnel's end and the door's. `listen` says
// where the visitor hears from and which way the view faces, and `update(dt)` levels the bed from there ten times a
// second. It honours the page-wide mute (`oogaboogaland.audio`) and the tab's visibility, and `dispose` closes it.
//
// Over the bed, the engine static fire test (`test(AT)`, its whole sequence scheduled at the press on voices built
// with the bed, so nothing starts or allocates while it plays): the booth's two-tone siren from the press to the blast;
// the turbines' whine and whoosh rising through the spool-up; the ignition's whoomph and then the exhaust's roar, a
// rocket's, loud, its body, its crackle and its rumble under it; the malfunction's coughing roar, clanks and alarm
// beeps; the blast's boom and crack, iron clattering down after it; and the presser's hearing muffled from the blast
// until they come to, a ringing in their ears over it. Everything passes a limiter, so the roar is loud and never
// clips. `setVolume` sets the hangar's level (localStorage `ooga-hangar-volume`, 0..1).
//
// Kortik's Sis has a voice of her own (`voice`): a buzz and a breath through three formants, a syllable for each run
// of vowels in her line with the formants of its vowel, pauses at its punctuation, a stressed last syllable before a
// "!" or a "?", and the censor's bleep over each grawlix; muttered, yelled, screamed or whispered, each line at its own
// pitch and pace. It is placed where she stands while she talks, her yells heard across the hall. Her brother's shouts
// through the hangar's door from next door come on the same voice, lower and muffled (`kortik`). Her boots thud
// where she walks (`boot`), a poke boinks (`poke`), a warning light beeps (`beep`), and her hammer clangs on the Jet
// (`clang`).
//
// The film show's projector (`projector(on)`) runs where it hangs: its motor's hum and whir and the gate's clatter,
// spinning up as it starts and running down as it stops, wavering as an old motor does, with the lamp's buzz; each
// picture clunks into the gate (`clunk`); and from the screen the soundtrack's crackle and hiss while the film runs,
// and the roller's ratchet as the screen unrolls or rolls back up (`roll`).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { clamp } = BL.math;
  const NOISE_SECONDS = 2, MASTER = 0.5, STORAGE_KEY = "oogaboogaland.audio", VOLUME_KEY = "ooga-hangar-volume", PAN = 0.75;
  // How loud each part of the bed sits: the hum, the drone and the air everywhere, more air inside the tunnel, the
  // neon at its loudest inside it, and each shield close to; and at how many metres each of those last falls to half.
  const LEVEL = { mains: 0.05, drone: 0.08, air: 0.045, tunnelAir: 0.035, neon: 0.05, launch: 0.11, door: 0.06 };
  const REF = { neon: 5, launch: 9, door: 5 };

  // How loud the test's voices peak: the siren, the whine and its whoosh, the whoomph, the roar's body, crackle and
  // rumble, a clank, the alarm, the boom's sweep, its rumble and its crack, and the ringing.
  const TEST = { siren: 0.2, whine: 0.2, whoosh: 0.16, whoomph: 0.8, roar: 0.9, crackle: 0.4, rumble: 0.6, clank: 0.5, alarm: 0.09, boom: 1, boomNoise: 0.9, crack: 0.7, ring: 0.05 };
  // How far the blast muffles the presser's hearing, Hz.
  const MUFFLED = 320, CLEAR = 20000;
  // Kortik's Sis's ways of saying a line: her pitch, Hz; a syllable's length and the gap after it, s; how loud; how far
  // a stressed last syllable bends her pitch; how much of her is buzz and how much breath; her voice's shake, Hz either
  // way; the least she is heard at anywhere in the hall; and, for Kortik shouting through the door from next door on
  // the same voice, his formants a man's and the wall muffling him (`formant`, `tone`, Hz). Her voice falls to half at
  // SIS_REF metres, her boots at BOOT_REF.
  const SIS_STYLE = {
    mutter: { f0: 185, len: 0.085, gap: 0.03, level: 0.16, end: 0.85, buzz: 1, breath: 0.12, shake: 0, least: 0, formant: 1, tone: 20000 },
    yell: { f0: 300, len: 0.115, gap: 0.03, level: 0.34, end: 1.18, buzz: 1, breath: 0.22, shake: 0, least: 0.1, formant: 1, tone: 20000 },
    scream: { f0: 430, len: 0.14, gap: 0.025, level: 0.4, end: 1.3, buzz: 1, breath: 0.3, shake: 16, least: 0.14, formant: 1, tone: 20000 },
    soft: { f0: 215, len: 0.13, gap: 0.05, level: 0.16, end: 0.9, buzz: 0.1, breath: 1, shake: 0, least: 0, formant: 1, tone: 20000 },
    kortik: { f0: 120, len: 0.12, gap: 0.035, level: 0.5, end: 1.12, buzz: 1, breath: 0.1, shake: 0, least: 0.12, formant: 0.82, tone: 700 }
  };
  const SIS_REF = 9, BOOT_REF = 5, BLEEP = 0.3;
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
  // The film show's levels at full: the projector's motor, its whir, the gate's clatter and the lamp's buzz, the
  // soundtrack's crackle and hiss, a picture's clunk and the roller's ratchet; and how far the projector and the screen
  // carry (half at that many metres), the hall being quiet enough to hear them across it.
  const FILM = { motor: 0.06, whir: 0.03, clatter: 0.2, buzz: 0.025, crackle: 0.1, hiss: 0.025, clunk: 0.45, click: 0.18, roll: 0.14 }, FILM_REF = { projector: 14, screen: 16 };
  // Her vowels' first two formants, Hz, by the letter that starts a syllable (a woman's, after Peterson and Barney),
  // and the third, which stays put.
  const FORMANTS = { 65: [850, 1220], 69: [610, 2330], 73: [430, 2480], 79: [590, 920], 85: [760, 1400], 89: [310, 2790] }, SCHWA = [640, 1500], F3 = 2900;

  // `spots`: the door's shield and the launch shield, { x, y, z } each, the tunnel's axis { y, z0, z1 }, the test's
  // booth and the middle of the Jet's engines, the film show's projector and its picture, and the forklift, { x, y, z }
  // each.
  const create = (spots) => {
    let ctx = null, master = null, mix = null, muffle = null, buffer = null, ready = false, muted = false, disposed = false, since = 0, volume = 1;
    try {
      muted = localStorage.getItem(STORAGE_KEY) === "off";
      const saved = localStorage.getItem(VOLUME_KEY), v = Number(saved);
      if (saved !== null && v >= 0 && v <= 1) volume = v;
    } catch {
      muted = false;
    }
    const bed = {}, test = {}, sis = {}, proj = {}, fork = {};
    // Whether the projector runs, so a context opened mid-show starts it running, and the same for the forklift.
    let projOn = false, liftOn = false, liftReady = 0, liftDrive = 0, liftPump = 0;
    // Her voice while she talks: where she stands (her node's position, read live), until when, and its least level.
    const sisVoice = { pos: null, until: 0, least: 0 };
    // Where the visitor hears from and the way the view faces on the ground, and where the last spot was placed.
    const ear = { x: 0, y: 0, z: 0, fx: 0, fz: -1 }, AT = { level: 0, pan: 0 };

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
      initTest();
      initProjector();
      initForklift();
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

    // Only from a gesture the browser has already counted, so nothing warns in the console; a gesture also wakes a
    // context the browser started suspended.
    const activate = () => {
      if (disposed) return;
      if (ready) {
        if (ctx.state === "suspended" && !document.hidden) ctx.resume().catch(() => {});
        return;
      }
      if (muted || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      init();
    };
    window.addEventListener("pointerdown", activate, true);
    window.addEventListener("keydown", activate, true);
    // A hidden tab stops the bed; showing it again picks it up.
    const onVisibility = () => {
      if (!ready) return;
      if (document.hidden) ctx.suspend().catch(() => {});
      else ctx.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Where (x, y, z) is from the visitor, into AT: its level, half at `ref` metres, and its side of the view.
    const place = (x, y, z, ref) => {
      const dx = x - ear.x, dy = y - ear.y, dz = z - ear.z, flat = Math.hypot(dx, dz), r = Math.hypot(flat, dy) / ref;
      AT.level = 1 / (1 + r * r);
      AT.pan = flat > 0.5 ? clamp((dx * -ear.fz + dz * ear.fx) / flat, -1, 1) * PAN * Math.min(1, flat / 3) : 0;
    };
    const listen = (x, y, z, fx, fz) => {
      const l = Math.hypot(fx, fz) || 1;
      ear.x = x; ear.y = y; ear.z = z; ear.fx = fx / l; ear.fz = fz / l;
    };

    // The bed, ten times a second, eased: the neon from the nearest point on the tunnel's axis, so it surrounds a
    // visitor inside it and comes out of its mouth to one in the hall, and each shield from where it stands.
    const set = (param, value, now) => param.setTargetAtTime(value, now, 0.15);
    const update = (dt) => {
      if (!ready) {
        activate();
        if (!ready) return;
      }
      since += dt;
      if (since < 0.1 || muted) return;
      since = 0;
      const now = ctx.currentTime, T = spots.tunnel, L = spots.launch, D = spots.door;
      set(bed.mainsGain.gain, LEVEL.mains, now);
      set(bed.droneGain.gain, LEVEL.drone, now);
      set(bed.airGain.gain, LEVEL.air + LEVEL.tunnelAir * clamp((T.z0 - ear.z) / 6, 0, 1), now);
      place(0, T.y, clamp(ear.z, T.z1, T.z0), REF.neon);
      set(bed.neonGain.gain, LEVEL.neon * AT.level, now);
      set(bed.neonPan.pan, AT.pan * 0.4, now);
      place(L.x, L.y, L.z, REF.launch);
      set(bed.launch.gain.gain, LEVEL.launch * AT.level, now);
      set(bed.launch.pan.pan, AT.pan, now);
      place(D.x, D.y, D.z, REF.door);
      set(bed.door.gain.gain, LEVEL.door * AT.level, now);
      set(bed.door.pan.pan, AT.pan, now);
      place(spots.booth.x, spots.booth.y, spots.booth.z, 1);
      set(test.boothPan.pan, AT.pan, now);
      place(spots.engines.x, spots.engines.y, spots.engines.z, 1);
      set(test.enginePan.pan, AT.pan * 0.6, now);
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
      try {
        localStorage.setItem(STORAGE_KEY, muted ? "off" : "on");
      } catch {
      }
      if (ready) master.gain.setTargetAtTime(muted ? 0 : MASTER * volume, ctx.currentTime, 0.05);
      else if (!muted) activate();
      return muted;
    };
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
    // A warning light's beep on the Jet at (x, y, z).
    const beep = (x, y, z) => {
      if (!ready || muted) return;
      place(x, y, z, BOOT_REF);
      const now = ctx.currentTime, k = 0.22 * AT.level;
      sis.bootPan.pan.setValueAtTime(AT.pan, now);
      sis.boink.frequency.cancelScheduledValues(now);
      sis.boink.frequency.setValueAtTime(1900, now);
      sis.boinkGain.gain.cancelScheduledValues(now);
      sis.boinkGain.gain.setValueAtTime(k, now);
      sis.boinkGain.gain.setValueAtTime(k, now + 0.09);
      sis.boinkGain.gain.linearRampToValueAtTime(0, now + 0.1);
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
      sisVoice.pos = null;
    };

    return {
      listen, update, setMuted, setVolume, test: play, clang, voice, boot, poke, beep, denied, forklift, forkliftWork, horn, projector, clunk, roll, dispose,
      get muted() { return muted; },
      get volume() { return volume; },
      get ready() { return ready; },
      get state() { return ctx ? ctx.state : "none"; }
    };
  };

  BL.hangarAudio = { create };
})();
