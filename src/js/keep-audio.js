// The Byzantine Keep's sound, on the drop's pattern: one context made from an activated gesture, fixed pools of tone and
// noise voices gated by gain, the page-wide mute through the `keep` channel (sound.js), closed in `dispose`. Every cue
// is placed by its distance from whoever listens (`listen`), quieter the further off it is.
//
// `turn` is a knight's quarter turn on its plinth: stone grinding on stone, a low rumble under it, settling with a
// thud. `drawbridge(moving, x, y, z)`, once a frame, plays the recorded drawbridge (keep-audio-data.js `bridge`) from
// its start as the leaf begins to come down or the portcullis to go up, on while either moves and fading out as they
// stop; `land` is the leaf coming down on the abutment. `choir` is the ghost hunt's elixir choir, heard as the knights
// first face each other. The boat: `wash` is the water each pull of the oars pushes past (a soft swell of noise), and
// `wake(level, x, y, z)`, once a frame, the recorded water (`wake`) looping along its hull, as loud as it goes fast;
// `rowing(on, lead)`, once a frame, the sailing music (keep-music-data.js `row`, `ivar` and `armory`, in a random order,
// `row` first while `lead`) on the page's music channel, faded in as a visitor sits down to row or takes a helm, playing
// on while they do and faded out as they get out.
//
// `BL.keepAudio.music` is the places' music, one for the page and apart from either scene's sounds, so it plays on
// through the keep's door: `play(name)`, once a frame from the yard and the halls, the music of where the visitor is
// (`land`, the land's playlist of keep-music-data.js `yard`, `northern`, `daudir` and `shipyard` in a random order,
// anywhere on foot; null for none),
// on the music channel, each from its beginning faded in as they come there, looping while they stay and faded out as
// they leave; `handoff()` as one Keep scene goes to the other, so the music carries on across the switch; `leave()`
// in each scene's `leave`, which fades it out and closes it unless a handoff is under way.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const SWORDS = ["sword1", "sword2", "sword3"];
  // The land's music is not in the page: keep-music-data.js names each track's file and the Worker serves it from its
  // R2 bucket (worker/src/lecture-audio.js `handleKeepMusic`). A track that cannot be had (the page opened from disk,
  // a checkout without the files) is asked for again no sooner than TRACK_RETRY ms later, and the land is silent.
  const TRACK_AT = "/media/keep/", TRACK_RETRY = 30000;
  // A page opened from disk (the portable page) has no Worker to ask, so it asks nothing and the land is silent.
  const fetchTrack = (file) => location.protocol === "file:" ? Promise.reject(new Error("no track")) : fetch(TRACK_AT + file).then((r) => { if (!r.ok) throw new Error("no track"); return r.arrayBuffer(); });
  const MASTER = 0.5, TONES = 14, NOISES = 10, NOISE_SECONDS = 2, REF = 14;
  // The drawbridge's level and how long it fades as the leaf or portcullis stops; the wake's level at full speed and
  // how much of each end of its loop is left out (an MP3's padding, so the loop never clicks).
  const BRIDGE = 0.9, BRIDGE_FADE = 0.7, WAKE = 0.375, WAKE_TRIM = 0.05;
  // The sailing music's level, how long it takes to fade in and out, and its songs, played in a random order each
  // time a visitor sits down to row or takes a ship's helm, `row` first on their first crossing to the castle island.
  const ROW = 0.55, ROW_FADE = 2.5, ROW_SONGS = ["row", "ivar", "armory"];
  // The places' music: each one's level, how long it takes to fade in and out, and how long a handoff waits for the
  // next scene before it gives up and fades out.
  const PLACE = { land: 0.375 }, PLACES = Object.keys(PLACE), PLACE_IN = 4, PLACE_OUT = 2.5, HANDOFF_S = 30;
  // A place with more than one song plays them in a random order, each to its end and then the next, shuffled again
  // after the last (the land's: every song but the sailing ones); any other place loops its one song.
  const PLAYLIST = { land: ["yard", "northern", "daudir", "shipyard"] };
  // A list in a random order, never starting with `avoid` (the song just played) while it has another.
  const shuffle = (list, avoid) => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    if (a.length > 1 && a[0] === avoid) { const t = a[0]; a[0] = a[1]; a[1] = t; }
    return a;
  };

  const create = () => {
    let ctx = null, master = null, noise = null, muted = BL.sound.muted;
    const soundChannel = BL.sound.channel("keep"), musicChannel = BL.sound.channel("music");
    const tones = [], noises = [];
    let rowGain = null, rowSrc = null, rowOn = false, rowTurn = 0, rowOrder = ROW_SONGS, toneNext = 0, noiseNext = 0, wakeGain = null, wakeSrc = null, wakeLevel = 0, bridgeGain = null, bridgeSrc = null;
    // The recordings, each decoded once the context is open: name to its buffer (null while it decodes).
    const recorded = new Map();
    const ear = { x: 0, y: 0, z: 0 };

    const init = () => {
      if (ctx || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER;
      master.connect(soundChannel.node(ctx));
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise = buffer;
      for (let i = 0; i < TONES; i++) {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain); gain.connect(master); osc.start();
        tones.push({ osc, gain });
      }
      for (let i = 0; i < NOISES; i++) {
        const src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), gain = ctx.createGain();
        src.buffer = noise; src.loop = true; src.loopStart = 0; src.loopEnd = NOISE_SECONDS;
        gain.gain.value = 0;
        src.connect(band); band.connect(gain); gain.connect(master);
        src.start(0, Math.random() * NOISE_SECONDS);
        noises.push({ src, band, gain });
      }
      wakeGain = ctx.createGain(); wakeGain.gain.value = 0; wakeGain.connect(master);
      bridgeGain = ctx.createGain(); bridgeGain.gain.value = 0; bridgeGain.connect(master);
      rowGain = ctx.createGain(); rowGain.gain.value = 0; rowGain.connect(musicChannel.node(ctx));
      for (const name of ["bridge", "wake", "choir", "cannonShot", "cannonFire", "cannonHit", "questStart", "questItem", "sword1", "sword2", "sword3", "slam", "skeletonDie", "ogreDie", "ogreFall", "spellHold", "spellCharge", "wandFire", "swordRaise", "swordBolt", "lightningHit", "staffRune", "staffPulse", "wandRain", "wandStart"]) decode(name);
    };
    const decode = (name, from = BL.keepAudioData) => {
      if (recorded.has(name) || !from || !from[name]) return;
      recorded.set(name, null);
      // A track of the land's music is a file's name (keep-music-data.js), fetched the first time it is wanted.
      if (from === BL.keepMusicData) { fetchTrack(from[name]).then((bytes) => ctx.decodeAudioData(bytes)).then((buffer) => { if (ctx) recorded.set(name, buffer); }, () => { setTimeout(() => { if (recorded.get(name) === null) recorded.delete(name); }, TRACK_RETRY); }); return; }
      const raw = atob(from[name]), bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      ctx.decodeAudioData(bytes.buffer).then((buffer) => { if (ctx) recorded.set(name, buffer); }, () => {});
    };
    const live = () => {
      init();
      if (!ctx || muted || document.hidden) return false;
      if (ctx.state === "suspended") ctx.resume();
      return true;
    };
    // How loud a cue at (x, y, z) is where the listener stands.
    const near = (x, y, z) => 1 / (1 + Math.hypot(x - ear.x, y - ear.y, z - ear.z) / REF);
    const tone = () => { const v = tones[toneNext]; toneNext = (toneNext + 1) % TONES; return v; };
    const hiss = () => { const v = noises[noiseNext]; noiseNext = (noiseNext + 1) % NOISES; return v; };
    // One envelope on a pooled gain: up in `attack`, held, then down over `release`.
    const shape = (g, t, peak, attack, hold, release) => {
      g.cancelScheduledValues(t);
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      g.setValueAtTime(Math.max(0.0002, peak), t + attack + hold);
      g.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
      g.setValueAtTime(0, t + attack + hold + release + 0.01);
    };
    const ping = (t, type, f0, f1, peak, attack, hold, release) => {
      const v = tone();
      v.osc.type = type;
      v.osc.frequency.cancelScheduledValues(t);
      v.osc.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) v.osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + hold + release);
      shape(v.gain.gain, t, peak, attack, hold, release);
    };
    const burst = (t, type, f0, f1, q, peak, attack, hold, release) => {
      const v = hiss();
      v.band.type = type;
      v.band.Q.setValueAtTime(q, t);
      v.band.frequency.cancelScheduledValues(t);
      v.band.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) v.band.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + attack + hold + release);
      shape(v.gain.gain, t, peak, attack, hold, release);
    };

    // A knight's quarter turn: a grinding scrape of stone (low noise through a narrow band, wavering as it catches),
    // a rumble under it, and the thud of it settling.
    const turn = (x, y, z) => {
      if (!live()) return;
      const t = ctx.currentTime, k = near(x, y, z), D = 0.62;
      burst(t, "bandpass", 260, 180, 1.6, 0.9 * k, 0.06, D - 0.2, 0.25);
      burst(t + 0.03, "bandpass", 520, 360, 3.5, 0.32 * k, 0.05, D - 0.25, 0.22);
      burst(t, "lowpass", 140, 110, 0.8, 0.7 * k, 0.1, D - 0.2, 0.3);
      // The catches: short bright scrapes as the stone drags.
      for (let i = 0; i < 4; i++) burst(t + 0.08 + i * 0.13 + Math.random() * 0.05, "bandpass", 900 + Math.random() * 500, 700, 5, 0.18 * k, 0.01, 0.02, 0.07);
      ping(t, "sine", 48, 40, 0.35 * k, 0.12, D - 0.25, 0.3);
      // Settled: a dull knock of stone on stone.
      burst(t + D, "lowpass", 380, 120, 0.9, 0.9 * k, 0.004, 0.02, 0.22);
      ping(t + D, "sine", 92, 46, 0.55 * k, 0.004, 0.02, 0.28);
    };
    // A chain link clinking: a short bright ring of iron, a little noise under it.
    const link = (t, k) => {
      const f = 1900 + Math.random() * 1700;
      ping(t, "triangle", f, f * 0.98, 0.07 * k, 0.002, 0.004, 0.06 + Math.random() * 0.05);
      burst(t, "bandpass", 4200 + Math.random() * 2400, 3000, 6, 0.12 * k, 0.002, 0.004, 0.035);
    };
    // The ratchet's clank: a heavy iron knock with an inharmonic ring.
    const clank = (t, k) => {
      burst(t, "bandpass", 820, 380, 1.4, 0.55 * k, 0.003, 0.01, 0.12);
      ping(t, "square", 310, 280, 0.08 * k, 0.002, 0.01, 0.16);
      ping(t, "triangle", 743, 735, 0.12 * k, 0.002, 0.01, 0.3);
      ping(t, "triangle", 1187, 1180, 0.06 * k, 0.002, 0.01, 0.22);
    };
    // The recorded drawbridge: started from its beginning as the motion starts (and again should it outlast the
    // recording), followed by its listener's distance, faded out once the motion stops.
    const drawbridge = (moving, x, y, z) => {
      if (!moving && !bridgeSrc) return;
      if (!live()) return;
      const t = ctx.currentTime, buffer = recorded.get("bridge");
      if (moving && !bridgeSrc && buffer) {
        const src = ctx.createBufferSource();
        src.buffer = buffer; src.connect(bridgeGain);
        src.onended = () => { if (bridgeSrc === src) bridgeSrc = null; };
        bridgeGain.gain.cancelScheduledValues(t); bridgeGain.gain.setValueAtTime(0, t); bridgeGain.gain.linearRampToValueAtTime(BRIDGE * near(x, y, z), t + 0.08);
        src.start(t);
        bridgeSrc = src;
      } else if (moving && bridgeSrc) bridgeGain.gain.setTargetAtTime(BRIDGE * near(x, y, z), t, 0.2);
      else if (!moving && bridgeSrc) {
        bridgeGain.gain.cancelScheduledValues(t); bridgeGain.gain.setValueAtTime(bridgeGain.gain.value, t); bridgeGain.gain.linearRampToValueAtTime(0, t + BRIDGE_FADE);
        bridgeSrc.stop(t + BRIDGE_FADE + 0.05);
        bridgeSrc = null;
      }
    };
    // The leaf down on the abutment: a deep wooden boom, iron rattling with it.
    const land = (x, y, z) => {
      if (!live()) return;
      const t = ctx.currentTime, k = near(x, y, z);
      burst(t, "lowpass", 520, 90, 0.8, 1.2 * k, 0.004, 0.04, 0.6);
      ping(t, "sine", 70, 34, 0.9 * k, 0.004, 0.05, 0.7);
      for (let i = 0; i < 5; i++) link(t + 0.04 + i * 0.05 + Math.random() * 0.03, k * 1.4);
      clank(t + 0.02, k);
    };
    // The knights face to face: the ghost hunt's elixir choir, decoded once the first time it is wanted.
    // A recording played the same wherever the visitor stands: a new quest taken on (its chime), or a quest's item
    // taken (its sparkle).
    const flat = (name, loud) => {
      if (!live()) return;
      const buffer = recorded.get(name);
      if (!buffer) return;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buffer;
      g.gain.value = loud;
      src.connect(g); g.connect(master);
      src.start();
    };
    const quest = () => flat("questStart", 0.7);
    const item = () => flat("questItem", 0.75);
    const choir = () => {
      if (!live()) return;
      const buffer = recorded.get("choir");
      if (!buffer) return;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buffer;
      g.gain.value = 0.65;
      src.connect(g); g.connect(master);
      src.start();
    };
    // A pull of the oars: the water pushed past, a slow swell of low noise and a softer hiss over it.
    const wash = (x, y, z) => {
      if (!live()) return;
      const t = ctx.currentTime, k = near(x, y, z);
      burst(t, "lowpass", 520, 260, 0.6, 0.15 * k, 0.18, 0.12, 0.7);
      burst(t + 0.05, "bandpass", 1500, 800, 0.8, 0.04 * k, 0.2, 0.1, 0.55);
    };
    // The fire arrows. `loose` is one leaving the castle's wall: the bowstring's twang and thrum, carried over the
    // water so it is heard however far off; `flight(seconds)` its rush toward the listener, a whistle and the flame's
    // flutter rising until it arrives; `strike` it biting into the boat's timber, a hard knock, the shaft's quiver and
    // the fire catching with a whump; and `burn(level, x, y, z)`, once a frame, the crackle of what burns there (0 to 1),
    // a pop now and then, more often the more there is.
    const loose = (x, y, z) => {
      if (!live()) return;
      const t = ctx.currentTime, k = Math.max(0.3, near(x, y, z));
      ping(t, "triangle", 190, 120, 0.22 * k, 0.002, 0.01, 0.3);
      ping(t, "sine", 96, 72, 0.3 * k, 0.003, 0.02, 0.4);
      burst(t, "bandpass", 2600, 1300, 4, 0.1 * k, 0.002, 0.01, 0.08);
    };
    const flight = (seconds) => {
      if (!live()) return;
      const t = ctx.currentTime, rise = Math.max(0.2, seconds - 0.05);
      burst(t, "bandpass", 700, 2400, 7, 0.11, rise, 0.02, 0.18);
      burst(t + rise * 0.3, "highpass", 2500, 4200, 0.7, 0.05, rise * 0.7, 0.02, 0.15);
      burst(t + rise * 0.4, "lowpass", 300, 600, 0.6, 0.08, rise * 0.6, 0.02, 0.2);
    };
    const strike = (x, y, z) => {
      if (!live()) return;
      const t = ctx.currentTime, k = near(x, y, z);
      burst(t, "lowpass", 1100, 220, 1.1, 0.95 * k, 0.002, 0.015, 0.16);
      ping(t, "sine", 170, 85, 0.55 * k, 0.002, 0.02, 0.22);
      ping(t + 0.01, "triangle", 330, 322, 0.06 * k, 0.003, 0.2, 0.25);
      burst(t + 0.04, "lowpass", 420, 160, 0.7, 0.45 * k, 0.06, 0.12, 0.55);
      burst(t + 0.05, "bandpass", 3000, 1800, 2, 0.12 * k, 0.03, 0.1, 0.35);
    };
    // The skeleton's sword: `swish`, the blade through the air as a swing starts, and `cut`, a blow landing on whoever
    // it struck: the steel's bite and ring, the thud of it, and a low grunt of a tone falling away.
    const swish = (x, y, z) => {
      if (!live()) return;
      const t = ctx.currentTime, k = Math.max(0.25, near(x, y, z));
      burst(t + 0.28, "bandpass", 500, 2600, 3, 0.3 * k, 0.12, 0.02, 0.16);
    };
    const cut = (x, y, z) => {
      if (!live()) return;
      const t = ctx.currentTime, k = Math.max(0.5, near(x, y, z));
      burst(t, "highpass", 3200, 5200, 0.8, 0.5 * k, 0.001, 0.012, 0.09);
      ping(t, "triangle", 1480, 1420, 0.16 * k, 0.001, 0.03, 0.34);
      ping(t, "sine", 2210, 2170, 0.07 * k, 0.001, 0.02, 0.26);
      burst(t + 0.005, "lowpass", 900, 180, 1, 0.9 * k, 0.002, 0.02, 0.14);
      ping(t + 0.005, "sine", 150, 60, 0.7 * k, 0.002, 0.03, 0.2);
      ping(t + 0.05, "sawtooth", 210, 120, 0.13 * k, 0.012, 0.05, 0.2);
    };
    // The ogre's axe driven into the ground: a deep thud falling away, the earth's low crunch, and rock scattering after.
    const smash = (x, y, z) => {
      if (!live()) return;
      const t = ctx.currentTime, k = Math.max(0.45, near(x, y, z));
      ping(t, "sine", 95, 30, 1.0 * k, 0.003, 0.05, 0.5);
      ping(t, "triangle", 58, 34, 0.5 * k, 0.004, 0.08, 0.6);
      burst(t, "lowpass", 520, 90, 0.8, 1.0 * k, 0.003, 0.05, 0.4);
      burst(t + 0.02, "bandpass", 240, 120, 1.2, 0.6 * k, 0.02, 0.1, 0.55);
      burst(t + 0.09, "bandpass", 1500, 700, 2.5, 0.16 * k, 0.03, 0.08, 0.35);
      burst(t + 0.22, "bandpass", 1100, 600, 3, 0.09 * k, 0.03, 0.06, 0.3);
    };
    // A skeleton falling apart: dry bones clattering down over half a second, hollow knocks at their own pitches and
    // ticks of grit, a heavier one for the skull, and a last few rolling still.
    // The ogre brought down: its roar, then the thud of it hitting the ground. Recordings only.
    const ogreDie = (x, y, z) => { if (live()) playAt("ogreDie", x, y, z, 1.6, 0.45); };
    const ogreFall = (x, y, z) => { if (live()) playAt("ogreFall", x, y, z, 1.8, 0.45); };
    // A skeleton destroyed: its recording, the synthesized clatter until it is decoded.
    const bones = (x, y, z) => {
      if (!live() || playAt("skeletonDie", x, y, z, 2, 0.45)) return;
      const t = ctx.currentTime, k = Math.max(0.35, near(x, y, z));
      ping(t, "triangle", 230, 150, 0.4 * k, 0.002, 0.02, 0.16);
      for (let i = 0; i < 13; i++) {
        const at = t + 0.03 + Math.pow(i / 13, 1.4) * 0.75 + Math.random() * 0.04, f = 700 + Math.random() * 1300, loud = (1 - i / 16) * k;
        ping(at, i % 3 ? "square" : "triangle", f, f * 0.82, 0.08 * loud, 0.001, 0.008, 0.05 + Math.random() * 0.05);
        if (i % 2 === 0) burst(at, "bandpass", 2600 + Math.random() * 1800, 1900, 5, 0.12 * loud, 0.001, 0.006, 0.04);
      }
      ping(t + 0.18, "sine", 160, 95, 0.28 * k, 0.002, 0.03, 0.2);
    };
    // A banana into the stash: a bright two-note chime, a step higher with each of a run (`n`, 0 to 7).
    const pling = (n = 0) => {
      if (!live()) return;
      const t = ctx.currentTime, f = 880 * Math.pow(2, (n % 8) / 12);
      ping(t, "triangle", f, f, 0.16, 0.002, 0.03, 0.12);
      ping(t + 0.05, "sine", f * 1.5, f * 1.5, 0.12, 0.002, 0.04, 0.22);
    };
    // The weapon selector's clicks: a crisp wooden tick as a button is pressed, and with `soft` a quieter, shorter,
    // higher one as the pointer comes over it.
    const click = (soft = false) => {
      if (!live()) return;
      const t = ctx.currentTime;
      if (soft) {
        burst(t, "bandpass", 3400, 2800, 7, 0.05, 0.001, 0.003, 0.02);
        ping(t, "sine", 2100, 1700, 0.025, 0.001, 0.003, 0.025);
        return;
      }
      burst(t, "bandpass", 2300, 1500, 4, 0.24, 0.001, 0.005, 0.045);
      ping(t, "triangle", 1300, 720, 0.12, 0.001, 0.006, 0.05);
      ping(t + 0.03, "sine", 430, 300, 0.09, 0.001, 0.01, 0.05);
    };
    // The turrets' cannons: `cannon`, a shot (a sharp crack, a deep boom falling away and a short roar of burning);
    // `plunge`, a ball into the sea (a heavy plunge, the hiss of fire quenched and a spatter of falling water); and
    // `blast`, a ball bursting on something (a hard crack, a low boom, a rumble and rock pattering down after).
    // A recorded sound (keep-audio-data.js) played once from where it happens, as loud as it is near; true when it
    // could be (a recording not yet decoded leaves the synthesized one to play).
    const playAt = (name, x, y, z, loud, least, after = 0) => {
      const buffer = recorded.get(name);
      if (!buffer) return false;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buffer; g.gain.value = loud * Math.max(least, near(x, y, z));
      src.connect(g); g.connect(master);
      src.start(after > 0 ? ctx.currentTime + after : 0);
      return true;
    };
    // The visitor's sword swung: the three recorded swings in turn, a strike apiece.
    let swordNext = 0;
    const sword = (x, y, z) => {
      if (!live()) return;
      playAt(SWORDS[swordNext], x, y, z, 0.8, 0.5);
      swordNext = (swordNext + 1) % SWORDS.length;
    };
    // The sword slammed into the ground: its recording, the ogre's smash until it is decoded.
    const slam = (x, y, z) => {
      if (!live() || playAt("slam", x, y, z, 1.2, 0.35)) return;
      smash(x, y, z);
    };
    const cannon = (x, y, z) => {
      if (!live()) return;
      // The roar of its fire under the shot itself, coming in just after the shot's crack so the explosion leads.
      playAt("cannonFire", x, y, z, 0.55, 0.2, 0.12);
      if (playAt("cannonShot", x, y, z, 1.5, 0.3)) return;
      const t = ctx.currentTime, k = Math.max(0.3, near(x, y, z));
      burst(t, "highpass", 1800, 600, 0.7, 1.0 * k, 0.001, 0.02, 0.1);
      ping(t, "sine", 130, 34, 1.0 * k, 0.002, 0.08, 0.7);
      ping(t, "triangle", 70, 30, 0.6 * k, 0.003, 0.1, 0.9);
      burst(t + 0.01, "lowpass", 700, 120, 0.8, 0.95 * k, 0.004, 0.1, 0.6);
      burst(t + 0.08, "bandpass", 900, 300, 1.2, 0.4 * k, 0.05, 0.2, 0.7);
    };
    const plunge = (x, y, z) => {
      if (!live()) return;
      const t = ctx.currentTime, k = Math.max(0.2, near(x, y, z));
      ping(t, "sine", 190, 55, 0.8 * k, 0.004, 0.05, 0.4);
      burst(t, "lowpass", 900, 200, 0.9, 0.9 * k, 0.006, 0.08, 0.5);
      burst(t + 0.05, "highpass", 3800, 6200, 0.6, 0.45 * k, 0.03, 0.35, 1.1);
      burst(t + 0.35, "bandpass", 2400, 1500, 1.5, 0.3 * k, 0.1, 0.4, 0.9);
      ping(t + 0.12, "sine", 420, 260, 0.12 * k, 0.01, 0.05, 0.3);
    };
    const blast = (x, y, z, loud = 1) => {
      if (!live() || playAt("cannonHit", x, y, z, 2.2 * loud, 0.25)) return;
      const t = ctx.currentTime, k = 2 * loud * Math.max(0.25, near(x, y, z));
      burst(t, "highpass", 2400, 900, 0.7, 1.0 * k, 0.001, 0.03, 0.12);
      ping(t, "sine", 105, 28, 1.0 * k, 0.002, 0.12, 0.9);
      burst(t, "lowpass", 600, 80, 0.8, 1.0 * k, 0.004, 0.18, 0.9);
      burst(t + 0.1, "lowpass", 260, 90, 0.7, 0.6 * k, 0.1, 0.4, 1.2);
      for (let i = 0; i < 3; i++) { const at = t + 0.35 + i * 0.16 + Math.random() * 0.06; burst(at, "bandpass", 1300 + Math.random() * 900, 700, 3, 0.12 * k, 0.002, 0.01, 0.07); }
    };
    // The volcano: `rumble`, the ground growling before it erupts; `erupt`, its roar for `seconds`, a deep rush of
    // fire over a low drone, heard across the water; `hull`, a ball striking the rowboat's timbers.
    const rumble = (x, y, z) => {
      if (!live()) return;
      const t = ctx.currentTime, k = Math.max(0.3, near(x, y, z));
      ping(t, "sine", 34, 46, 0.9 * k, 0.5, 1.4, 1.2);
      burst(t, "lowpass", 110, 190, 0.8, 0.9 * k, 0.6, 1.4, 1.2);
    };
    const erupt = (x, y, z, seconds) => {
      if (!live()) return;
      const t = ctx.currentTime, k = Math.max(0.3, near(x, y, z));
      burst(t, "highpass", 900, 300, 0.7, 0.9 * k, 0.004, 0.1, 0.5);
      ping(t, "sine", 60, 30, 1.0 * k, 0.01, 0.3, 1.4);
      burst(t, "lowpass", 260, 180, 0.7, 1.0 * k, 0.5, seconds, 3);
      burst(t + 0.4, "bandpass", 620, 420, 0.8, 0.3 * k, 1.2, Math.max(0.5, seconds - 1.5), 2.5);
      ping(t, "triangle", 44, 38, 0.5 * k, 0.8, seconds, 2.5);
    };
    // A mallet on a ship's timbers, mending her.
    const hammer = (x, y, z) => {
      if (!live()) return;
      const t = ctx.currentTime, k = Math.max(0.4, near(x, y, z));
      ping(t, "triangle", 320, 190, 0.3 * k, 0.001, 0.015, 0.09);
      burst(t, "bandpass", 1500, 800, 3, 0.25 * k, 0.001, 0.01, 0.06);
    };
    // Two ships meeting: a dull thump of hull on hull, then her timbers creaking and a few splinters, as hard as `k`.
    const crash = (x, y, z, k = 1) => {
      if (!live()) return;
      const t = ctx.currentTime, g = Math.max(0.5, near(x, y, z)) * k;
      ping(t, "sine", 110, 48, 0.9 * g, 0.004, 0.06, 0.4);
      burst(t, "lowpass", 420, 160, 1, 0.8 * g, 0.003, 0.06, 0.4);
      for (let i = 0; i < 3; i++) { const at = t + 0.12 + i * 0.16 + Math.random() * 0.05; ping(at, "sawtooth", 150 + Math.random() * 70, 90 + Math.random() * 40, 0.16 * g, 0.03, 0.08, 0.16); }
      for (let i = 0; i < 3; i++) { const at = t + 0.05 + i * 0.09 + Math.random() * 0.04; burst(at, "bandpass", 1100 + Math.random() * 900, 700, 5, 0.14 * g, 0.001, 0.01, 0.05); }
    };
    // A ram driven home: a great boom, the iron of the prow ringing, and timbers tearing apart after it.
    const ram = (x, y, z) => {
      if (!live()) return;
      const t = ctx.currentTime, g = Math.max(0.6, near(x, y, z));
      ping(t, "sine", 85, 30, 1.2 * g, 0.003, 0.1, 0.7);
      burst(t, "lowpass", 600, 120, 1, 1.1 * g, 0.002, 0.08, 0.6);
      ping(t + 0.01, "square", 620, 590, 0.16 * g, 0.001, 0.05, 0.5); ping(t + 0.01, "triangle", 931, 900, 0.14 * g, 0.001, 0.05, 0.6);
      for (let i = 0; i < 8; i++) { const at = t + 0.1 + i * 0.07 + Math.random() * 0.05; burst(at, "bandpass", 900 + Math.random() * 2200, 600, 5, 0.26 * g, 0.001, 0.012, 0.08); }
      ping(t + 0.25, "sawtooth", 130, 60, 0.3 * g, 0.05, 0.2, 0.4);
    };
    const hull = (x, y, z) => {
      if (!live()) return;
      const t = ctx.currentTime, k = Math.max(0.5, near(x, y, z));
      ping(t, "triangle", 180, 70, 0.8 * k, 0.002, 0.04, 0.3);
      burst(t, "bandpass", 700, 260, 1.4, 0.9 * k, 0.002, 0.05, 0.35);
      for (let i = 0; i < 4; i++) { const at = t + 0.06 + i * 0.07 + Math.random() * 0.04; burst(at, "bandpass", 1600 + Math.random() * 1400, 900, 4, 0.2 * k, 0.001, 0.01, 0.06); }
    };
    // The wand's fireball: `fireCast`, a breathy whoosh of flame rising off the wand over a soft thump; `fireHit`, a
    // small burst where it meets something, a crack, a puff and a crackle falling away.
    const fireCast = (x, y, z, loud = 1) => {
      if (!live()) return;
      const t = ctx.currentTime, k = loud * Math.max(0.35, near(x, y, z));
      burst(t, "bandpass", 420, 1900, 2.2, 0.38 * k, 0.05, 0.08, 0.32);
      burst(t + 0.02, "lowpass", 380, 140, 0.8, 0.4 * k, 0.01, 0.06, 0.3);
      ping(t, "sine", 150, 70, 0.28 * k, 0.004, 0.04, 0.25);
    };
    const fireHit = (x, y, z) => {
      if (!live()) return;
      const t = ctx.currentTime, k = Math.max(0.25, near(x, y, z));
      burst(t, "highpass", 2200, 900, 0.7, 0.45 * k, 0.001, 0.02, 0.1);
      burst(t, "lowpass", 700, 120, 0.8, 0.6 * k, 0.003, 0.08, 0.45);
      ping(t, "sine", 120, 45, 0.4 * k, 0.002, 0.05, 0.35);
      burst(t + 0.12, "bandpass", 1800, 1100, 2, 0.12 * k, 0.04, 0.15, 0.4);
    };
    // The wand's fireball let go: its torch whoosh (`wandFire`) at `loud`, the synthesized one until it is decoded.
    const fireball = (x, y, z, loud = 1) => {
      if (!live() || playAt("wandFire", x, y, z, loud, 0.45 * loud)) return;
      fireCast(x, y, z, loud);
    };
    // The cast held drawn up: its recording from the start, one at a time, faded out quickly as it is let go.
    let holdSrc = null, holdGain = null;
    const spellHoldStop = () => {
      if (!holdSrc) return;
      const t = ctx.currentTime;
      holdGain.gain.cancelScheduledValues(t);
      holdGain.gain.setValueAtTime(holdGain.gain.value, t);
      holdGain.gain.linearRampToValueAtTime(0, t + 0.08);
      holdSrc.stop(t + 0.1);
      holdSrc = holdGain = null;
    };
    const spellHold = (x, y, z) => {
      if (!live()) return;
      const buffer = recorded.get("spellHold");
      if (!buffer) return;
      spellHoldStop();
      holdSrc = ctx.createBufferSource(); holdGain = ctx.createGain();
      holdSrc.buffer = buffer; holdGain.gain.value = 0.7 * Math.max(0.5, near(x, y, z));
      holdSrc.connect(holdGain); holdGain.connect(master);
      holdSrc.start();
    };
    // The wand's held cast raining fire from the sky: its recording from the start, faded out quickly if the rain
    // stops before it ends.
    let rainSrc = null, rainGain = null;
    const wandRainStop = () => {
      if (!rainSrc) return;
      const t = ctx.currentTime;
      rainGain.gain.cancelScheduledValues(t);
      rainGain.gain.setValueAtTime(rainGain.gain.value, t);
      rainGain.gain.linearRampToValueAtTime(0, t + 0.25);
      rainSrc.stop(t + 0.3);
      rainSrc = rainGain = null;
    };
    const wandRain = (x, y, z) => {
      if (!live()) return;
      const buffer = recorded.get("wandRain");
      if (!buffer) return;
      wandRainStop();
      rainSrc = ctx.createBufferSource(); rainGain = ctx.createGain();
      rainSrc.buffer = buffer; rainGain.gain.value = 1 * Math.max(0.6, near(x, y, z));
      rainSrc.connect(rainGain); rainGain.connect(master);
      rainSrc.start();
      playAt("wandStart", x, y, z, 1, 0.6);
    };
    // The wand's fourth step raised and thrust: its recording, the whole of it, over the blast and the fire after.
    const spellCharge = (x, y, z) => { if (live()) playAt("spellCharge", x, y, z, 0.9, 0.5); };
    // The frost blade raised to the sky for its fourth step.
    // With it, the crackle of the bolt that stands on the blade.
    const swordRaise = (x, y, z) => { if (live()) { playAt("swordRaise", x, y, z, 1, 0.6); playAt("swordBolt", x, y, z, 0.9, 0.5); } };
    // The staff's held strike let go, its pulse bursting out.
    const staffPulse = (x, y, z, after = 0) => { if (live()) playAt("staffPulse", x, y, z, 1, 0.65, after); };
    // The level 4 staff's fourth step, raised to the sky and its rune laid on the ground, heard whole.
    const staffRune = (x, y, z) => { if (live()) playAt("staffRune", x, y, z, 1, 0.65); };
    // A bolt from the sky striking an enemy at that step; each of the five strikes is heard where it lands.
    const lightningHit = (x, y, z) => { if (live()) playAt("lightningHit", x, y, z, 1, 0.45); };
    let popAt = 0;
    const burn = (level, x, y, z) => {
      if (level < 0.02 || !ctx || muted || document.hidden) return;
      const t = ctx.currentTime;
      if (t < popAt) return;
      popAt = t + (0.04 + Math.random() * 0.22) / Math.min(1, level);
      const k = near(x, y, z) * Math.min(1, level);
      burst(t, "bandpass", 1700 + Math.random() * 2600, 1200, 3, 0.2 * k * (0.4 + Math.random()), 0.002, 0.004, 0.03 + Math.random() * 0.05);
      if (Math.random() < 0.3) burst(t, "lowpass", 600, 280, 0.7, 0.09 * k, 0.03, 0.06, 0.25);
    };
    // The recorded water along the hull, looping from the first moment the boat moves, eased toward `level` (0 to 1)
    // so it swells and fades with the boat's speed, a little quicker and brighter the faster it goes.
    const wake = (level, x, y, z) => {
      if (!ctx) { if (level > 0.01) init(); if (!ctx) return; }
      const buffer = recorded.get("wake");
      if (!buffer) return;
      if (!wakeSrc && level > 0.01) {
        wakeSrc = ctx.createBufferSource();
        wakeSrc.buffer = buffer; wakeSrc.loop = true; wakeSrc.loopStart = WAKE_TRIM; wakeSrc.loopEnd = buffer.duration - WAKE_TRIM;
        wakeSrc.connect(wakeGain); wakeSrc.start(0, WAKE_TRIM);
      }
      if (!wakeSrc) return;
      const k = Math.min(1, level), want = muted || document.hidden ? 0 : k * WAKE * near(x, y, z);
      if (Math.abs(want - wakeLevel) < 0.003) return;
      wakeLevel = want;
      if (ctx.state === "suspended" && want > 0) ctx.resume();
      wakeGain.gain.setTargetAtTime(want, ctx.currentTime, 0.25);
      wakeSrc.playbackRate.setTargetAtTime(0.85 + 0.3 * k, ctx.currentTime, 0.3);
    };
    // One of the sailing songs from its start, the next one taken up as it ends (its own fades carry the join),
    // shuffled again after the last; one not decoded yet is passed over for the next that is.
    const rowSong = (t) => {
      let buffer = recorded.get(rowOrder[rowTurn]);
      for (let k = 1; !buffer && k < rowOrder.length; k++) { const i = (rowTurn + k) % rowOrder.length; if (recorded.get(rowOrder[i])) { rowTurn = i; buffer = recorded.get(rowOrder[i]); } }
      const src = rowSrc = ctx.createBufferSource();
      src.buffer = buffer; src.connect(rowGain); src.start(t);
      src.onended = () => {
        if (rowSrc !== src || !ctx) return;
        if (++rowTurn >= rowOrder.length) { rowOrder = shuffle(ROW_SONGS, rowOrder[rowOrder.length - 1]); rowTurn = 0; }
        rowSong(ctx.currentTime);
      };
    };
    // The sailing music: decoded the first time it is wanted, started from its beginning as the visitor sits down to row
    // and faded in, faded out and stopped as they get out; `lead` (their first crossing) starts it on `row`. The
    // page-wide mute and the music level are its channel's.
    const rowing = (on, lead) => {
      if (on === rowOn && (!on || rowSrc)) return;
      if (!ctx) { if (!on) return; init(); if (!ctx) return; }
      const t = ctx.currentTime;
      if (on) {
        if (!rowOn) {
          rowOrder = shuffle(ROW_SONGS); rowTurn = 0;
          if (lead) { const i = rowOrder.indexOf("row"); rowOrder[i] = rowOrder[0]; rowOrder[0] = "row"; }
        }
        for (const name of ROW_SONGS) decode(name, BL.keepMusicData);
        const buffer = recorded.get(rowOrder[rowTurn]);
        if (!buffer) { rowOn = true; return; }
        if (ctx.state === "suspended") ctx.resume();
        if (rowSrc) rowSrc.stop(t);
        rowSong(t);
        rowGain.gain.cancelScheduledValues(t); rowGain.gain.setValueAtTime(0, t); rowGain.gain.linearRampToValueAtTime(ROW, t + ROW_FADE);
      } else if (rowSrc) {
        rowGain.gain.cancelScheduledValues(t); rowGain.gain.setValueAtTime(rowGain.gain.value, t); rowGain.gain.linearRampToValueAtTime(0, t + ROW_FADE);
        rowSrc.stop(t + ROW_FADE + 0.05);
        rowSrc = null;
      }
      rowOn = on;
    };
    const listen = (x, y, z) => { ear.x = x; ear.y = y; ear.z = z; };
    const setMuted = (on) => {
      muted = !!on;
      if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.03);
    };
    const offSound = BL.sound.subscribe(setMuted);
    const dispose = () => {
      offSound(); soundChannel.release(); musicChannel.release();
      if (!ctx) return;
      for (const v of tones) v.osc.stop();
      for (const v of noises) v.src.stop();
      ctx.close();
      if (wakeSrc) wakeSrc.stop();
      if (bridgeSrc) bridgeSrc.stop();
      if (rowSrc) { const r = rowSrc; rowSrc = null; r.stop(); }
      holdSrc = holdGain = null;
      recorded.clear();
      ctx = master = noise = wakeGain = wakeSrc = bridgeGain = bridgeSrc = rowGain = rowSrc = null;
      rowOn = false;
      wakeLevel = 0;
      tones.length = noises.length = 0;
    };
    return { wandRain, wandRainStop, staffPulse, staffRune, swordRaise, lightningHit, crash, ram, turn, drawbridge, land, choir, quest, item, wash, wake, rowing, loose, flight, strike, swish, cut, smash, bones, pling, click, sword, slam, ogreDie, ogreFall, cannon, plunge, blast, rumble, erupt, hull, hammer, fireCast, fireball, spellHold, spellHoldStop, spellCharge, fireHit, burn, listen, setMuted, dispose, get open() { return !!ctx; } };
  };

  // ---------- the places' music ----------
  const music = (() => {
    let ctx = null, channel = null, on = null, handing = false, timer = 0;
    // Each place's gain, the source playing it, the one still fading out from when the visitor last left it, and the
    // recordings, each decoded the first time it is wanted (null while it decodes).
    const gain = {}, src = {}, old = {}, turn = {}, order = {}, buffers = new Map();
    const songs = (place) => order[place] || (order[place] = PLAYLIST[place] ? shuffle(PLAYLIST[place]) : [place]);
    const song = (place, ahead = 0) => { const list = songs(place); return list[((turn[place] || 0) + ahead) % list.length]; };
    // The place's song now from its start, and, in a playlist, the next one readied and taken up as this one ends.
    const start = (place) => {
      const list = songs(place), s = src[place] = ctx.createBufferSource();
      s.buffer = buffers.get(song(place)); s.loop = list.length === 1; s.connect(gain[place]); s.start();
      if (list.length === 1) return;
      decode(song(place, 1));
      s.onended = () => {
        if (src[place] !== s) return;
        turn[place] = (turn[place] || 0) + 1; src[place] = null;
        if (turn[place] >= list.length) { order[place] = shuffle(PLAYLIST[place], list[list.length - 1]); turn[place] = 0; decode(song(place)); }
        if (on === place && buffers.get(song(place))) start(place);
      };
    };
    const open = () => {
      if (ctx) return true;
      if (typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
      ctx = new AudioContext();
      channel = BL.sound.channel("music");
      const out = channel.node(ctx);
      for (const name of PLACES) { gain[name] = ctx.createGain(); gain[name].gain.value = 0; gain[name].connect(out); }
      return true;
    };
    const decode = (name) => {
      if (buffers.has(name) || !BL.keepMusicData || !BL.keepMusicData[name]) return;
      buffers.set(name, null);
      const at = ctx;
      fetchTrack(BL.keepMusicData[name]).then((bytes) => at.decodeAudioData(bytes)).then((buffer) => { if (ctx === at) buffers.set(name, buffer); }, () => { setTimeout(() => { if (ctx === at && buffers.get(name) === null) buffers.delete(name); }, TRACK_RETRY); });
    };
    const fade = (name, to, seconds) => {
      const g = gain[name].gain, t = ctx.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + seconds);
    };
    // Leaving `name`: faded out and let go once it is silent.
    const drop = (name) => {
      if (!src[name]) return;
      fade(name, 0, PLACE_OUT);
      src[name].stop(ctx.currentTime + PLACE_OUT + 0.05);
      old[name] = src[name]; src[name] = null;
    };
    const close = () => {
      clearTimeout(timer); timer = 0;
      if (!ctx) return;
      for (const name of PLACES) { if (src[name]) src[name].stop(); if (old[name]) old[name].stop(); src[name] = old[name] = gain[name] = null; }
      ctx.close(); channel.release();
      ctx = channel = on = null;
      handing = false;
      buffers.clear();
    };
    const play = (name) => {
      // A Keep scene is here: whatever was carried over or still fading out goes on from here.
      if (timer || handing) { clearTimeout(timer); timer = 0; handing = false; }
      if (name === on && (!name || src[name])) return;
      if (!ctx) { if (!name || !open()) return; }
      if (on && on !== name) drop(on);
      on = name;
      if (!name) return;
      decode(song(name));
      if (!buffers.get(song(name))) return;
      if (ctx.state === "suspended") ctx.resume();
      if (old[name]) { old[name].stop(); old[name] = null; }
      gain[name].gain.cancelScheduledValues(ctx.currentTime); gain[name].gain.setValueAtTime(0, ctx.currentTime);
      fade(name, PLACE[name], PLACE_IN);
      start(name);
    };
    const handoff = () => { if (ctx) handing = true; };
    const leave = () => {
      if (!ctx) return;
      if (handing) { clearTimeout(timer); timer = setTimeout(() => { handing = false; leave(); }, HANDOFF_S * 1000); return; }
      if (on) drop(on);
      on = null;
      clearTimeout(timer); timer = setTimeout(close, (PLACE_OUT + 0.2) * 1000);
    };
    return { play, handoff, leave, get playing() { return on; } };
  })();

  BL.keepAudio = { create, music };
})();
