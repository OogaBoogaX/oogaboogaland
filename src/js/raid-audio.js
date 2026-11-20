// Ooga Raid's sound, on Ooga Drop's pattern: one AudioContext opened from a gesture the browser has already activated,
// and fixed pools of voices started once and only ever shaped by automation. Tone voices (an oscillator whose shape a
// cue picks, sine, triangle, square, sawtooth or one of two thin pulses, with its own vibrato that rests at zero
// depth) and noise voices (a looped noise buffer through a filter whose type a cue picks). The pools run into one
// master gain, the page-wide mute, through a compressor that keeps a busy firefight from clipping. A cue only
// schedules automation on pooled voices: nothing is allocated per cue and nothing is ever restarted. A cue played
// again within `GAP` seconds of itself is dropped, so a frame that pops ten clerks sounds one pop and a burst can
// never pile more voices than the pools hold. Every sound is the game's own. It shares the rally's mute key.
//
// The music plays on the arcade's chip (`carnivalAudio.chipVoices`: two pulse channels, a triangle and a noise channel,
// built once on the same context) through its own level on the master, so the mute covers it and a big cue (a death,
// the vault opening, a boss's break) ducks it. `SONGS` are the raid's own tunes in the retro cabinets' format
// (`carnivalAudio.tune`, read into typed arrays at load): a loop for each stage, the boss's, and three that play once,
// the stage clear's jingle, game over's sting and the ending. `setMusic(id)` starts one from its top (null for none, the
// same id again leaves it playing), `pause` halts it where it is and carries on from there, and `tick`, once a frame,
// schedules its next steps a moment ahead, allocation-free. The notes are this game's own.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const TONES = 16, NOISES = 8, NOISE_SECONDS = 2, MASTER = 0.5, GAP = 0.025;
  // A tone's shapes: the four built-in oscillator types, then the two pulses (12.5 and 25 per cent duty), each a
  // PeriodicWave of `HARMONICS` partials built once on unlock.
  const SINE = 0, TRI = 1, SQUARE = 2, SAW = 3, P12 = 4, P25 = 5;
  const TYPES = ["sine", "triangle", "square", "sawtooth"], DUTY = [0.125, 0.25], HARMONICS = 48;
  // Each MIDI note's pitch.
  const HZ = new Float32Array(128);
  for (let m = 0; m < 128; m++) HZ[m] = 440 * Math.pow(2, (m - 69) / 12);
  // The jingles (MIDI notes and their lengths in beats). PICKUP, a bright climb; ONE_UP, a longer climb that tops out
  // an octave over; CONT, a quick lift. The notes are this game's own.
  const PICKUP = [74, 79, 86];
  const ONE_UP = [72, 76, 79, 84, 88, 91], ONE_UP_BASS = [48, 55];
  const CONT = [67, 74, 79];
  // STING, the stage card's short call: a rising fourth and fifth over a bass. BARS, the barrier's chime as it lifts.
  const STING = [72, 77, 79, 84], STING_BEATS = [1, 1, 1, 3], BARS = [76, 83];
  // CALL, the weapon callout's fanfare, landing just after the pickup's climb (CALL_AT seconds on) and topping out held;
  // OMEN, the boss card's three falling notes over its low blow, a semitone and then a tritone down.
  const CALL = [79, 83, 86, 91], CALL_BEATS = [1, 1, 1, 4], CALL_AT = 0.16, OMEN = [57, 56, 51];
  // A tripwire's warning ticks: one every TICK seconds through its warning, at most TICKS.
  const TICK = 0.16, TICKS = 6;
  // The cues' ids, for the repeat gate: the five shots first, by weapon (raidSim.WEAPON order).
  const C = { SHOT: 0, ENEMY_SHOT: 5, HIT: 6, POP: 7, BOOM: 8, SHUT: 9, PICKUP: 10, ONE_UP: 11, DEATH: 12, DROP: 13, BOSS_OPEN: 14, CONTINUE: 15,
    PART: 16, BOSS_DOWN: 17, BARRIER: 18, CARD: 19, LIFT: 20, CRUMBLE: 21, WIRE: 22, SECRETS: 23, CALL: 24, BOSS_CARD: 25,
    TELL: 26, TELL_BIG: 27, WIND_UP: 28, COUNT: 29 };
  // How long each big cue ducks the music, in seconds.
  const DUCK_DEATH = 1.2, DUCK_OPEN = 1.6, DUCK_DOWN = 2.2;
  // ---- the music -----------------------------------------------------------------------------------------
  // The tunes, in the retro cabinets' format (`carnivalAudio.tune`: tempo, the lead's duty, bars of sixteenth notes for
  // the lead on the first pulse and the bass on the triangle, a note, "-" holding the one before, "." resting, and the
  // drums on the noise, "k" kick, "s" snare, "x" hat, whose `beat` bar repeats with `fill` as the last), read once here.
  // `once` tunes play through and stop; the rest loop. A stage's tune goes by its id; MUSIC_LEVEL is the music's level
  // under the master, DUCK its share under a big cue, and SONG_AHEAD how far ahead `tick` schedules.
  const MUSIC_LEVEL = 0.9, DUCK = 0.3, SONG_AHEAD = 0.1;
  const song = (once, ...args) => Object.assign(BL.carnivalAudio.tune(...args), { once });
  const SONGS = {
    // The Jungle Shore: A minor, heroic, a syncopated call over a galloping octave bass.
    shore: song(false, 160, 1, [
      "e5 - - . e5 . d5 e5 - . c5 - a4 - - .",
      "c5 - - . c5 . a#4 c5 - . a4 - f4 - - .",
      "d5 - - . d5 . c5 d5 - . b4 - g4 - b4 .",
      "e5 - - - - - . . g5 - e5 - d5 - b4 -",
      "a5 - - . a5 . g5 a5 - . e5 - c5 - - .",
      "f5 - - . f5 . e5 f5 - . c5 - a4 - - .",
      "g5 - - . f5 . e5 d5 - . b4 - d5 - g5 .",
      "g#5 - - - e5 - - - b4 - - - g#4 - b4 -"
    ], [
      "a2 . a2 a2 a3 . a2 . a2 . a2 a2 a3 . e3 .",
      "f2 . f2 f2 f3 . f2 . f2 . f2 f2 f3 . c3 .",
      "g2 . g2 g2 g3 . g2 . g2 . g2 g2 g3 . d3 .",
      "e2 . e2 e2 e3 . e2 . e2 . e2 e2 e3 . b2 .",
      "a2 . a2 a2 a3 . a2 . a2 . a2 a2 a3 . e3 .",
      "f2 . f2 f2 f3 . f2 . f2 . f2 f2 f3 . c3 .",
      "g2 . g2 g2 g3 . g2 . g2 . g2 g2 g3 . d3 .",
      "e2 . e2 e2 e3 . e2 . e2 . g#2 . b2 . e3 ."
    ], "k . x . s . x k k . x . s . x .", "k . x . s . x . s . s s s s s s"),
    // The Counting House: D minor, a thin pulse clicking along like beads on an abacus over ticking hats.
    counting: song(false, 150, 0, [
      "d5 . f5 . a5 . f5 . d5 . f5 . a5 . d6 .",
      "c#6 . a5 . e5 . a5 . c#6 - d6 - e6 - - .",
      "d6 . a#5 . f5 . a#5 . d6 . c6 . a#5 . a5 .",
      "a5 - - - e5 . g5 . c#5 - - - e5 . a4 .",
      "f5 . e5 . d5 . e5 . f5 . g5 . a5 - - .",
      "a#5 . a5 . g5 . d5 . g5 . a5 . a#5 - - .",
      "a5 . c#6 . e6 . c#6 . a5 . g5 . f5 . e5 .",
      "c#5 - - - e5 - - - a5 - - - . . a4 ."
    ], [
      "d2 . d3 . a2 . d3 . d2 . d3 . a2 . d3 .",
      "d2 . d3 . a2 . d3 . d2 . d3 . a2 . c3 .",
      "a#1 . a#2 . f2 . a#2 . a#1 . a#2 . f2 . a#2 .",
      "a1 . a2 . e2 . a2 . a1 . a2 . c#3 . e3 .",
      "d2 . d3 . a2 . d3 . d2 . d3 . a2 . d3 .",
      "g2 . g3 . d3 . g3 . g2 . g3 . d3 . a#2 .",
      "a1 . a2 . e2 . a2 . a1 . a2 . e2 . g2 .",
      "a1 . a2 . c#3 . e3 . a2 . . . a1 . . ."
    ], "k x x x s x x x k x x x s x k x", "k x x x s x x x s . s . s s s s"),
    // The Hashrate Tower: E minor, a fat square climbing arpeggios a floor at a time.
    tower: song(false, 156, 2, [
      "e4 - g4 - b4 - e5 - d5 - b4 - g4 - b4 -",
      "c5 - e5 - g5 - c6 - b5 - g5 - e5 - g5 -",
      "d5 - f#5 - a5 - d6 - c6 - a5 - f#5 - a5 -",
      "b5 - - - a5 - g5 - f#5 - - - d#5 - - -",
      "e5 - - . e5 . f#5 g5 - . a5 - b5 - - .",
      "c6 - - . b5 . a5 g5 - . e5 - g5 - - .",
      "a5 - - . g5 . f#5 e5 - . c5 - e5 - a5 -",
      "f#5 - - - d#5 - - - b4 - - - . . . ."
    ], [
      "e2 . e3 . e2 . e3 . e2 . e3 . e2 . e3 .",
      "c2 . c3 . c2 . c3 . c2 . c3 . c2 . c3 .",
      "d2 . d3 . d2 . d3 . d2 . d3 . d2 . d3 .",
      "b1 . b2 . b1 . b2 . b1 . b2 . d#2 . f#2 .",
      "e2 . e3 . e2 . e3 . e2 . e3 . e2 . e3 .",
      "c2 . c3 . c2 . c3 . c2 . c3 . c2 . c3 .",
      "a1 . a2 . a1 . a2 . a1 . a2 . a1 . a2 .",
      "b1 . b2 . b1 . b2 . b1 . d#2 . f#2 . a2 ."
    ], "k . x . s . x . k . k . s . x .", "k . x . s . x . s s s s s s s s"),
    // The Treasury Vaults: C minor, grand and heavy, a broad line over a lumbering root and fifth.
    treasury: song(false, 144, 1, [
      "c5 - - - d#5 - g5 - - - f5 - d#5 - d5 -",
      "d#5 - - - c5 - g#4 - - - c5 - d#5 - - .",
      "g5 - - - f5 - d#5 - a#4 - - - d#5 - g5 -",
      "f5 - - - d5 - b4 - g4 - - - b4 - d5 -",
      "c6 - - - g5 - d#5 - c5 - - - d#5 - g5 -",
      "f5 - - - g#5 - g5 - f5 - c5 - f5 - - .",
      "d#5 - - - c5 - d#5 - g#5 - g5 - f5 - d#5 -",
      "d5 - - - - - . . b4 - - - d5 - f5 -"
    ], [
      "c2 . . c2 g2 . c3 . c2 . . c2 g2 . a#2 .",
      "g#1 . . g#1 d#2 . g#2 . g#1 . . g#1 d#2 . g2 .",
      "d#2 . . d#2 a#2 . d#3 . d#2 . . d#2 a#2 . d3 .",
      "g1 . . g1 d2 . g2 . g1 . . g1 d2 . b2 .",
      "c2 . . c2 g2 . c3 . c2 . . c2 g2 . a#2 .",
      "f2 . . f2 c3 . f3 . f2 . . f2 c3 . d#3 .",
      "g#1 . . g#1 d#2 . g#2 . g#1 . . g#1 d#2 . c3 .",
      "g1 . . g1 d2 . g2 . g1 . b1 . d2 . f2 ."
    ], "k . . k s . x . k . k . s . x .", "k . . k s . x . s . s s s s s s"),
    // The Lightning Factory Floor: G minor and fast, crackling sixteenth arpeggios on the thinnest pulse.
    factory: song(false, 172, 0, [
      "g5 d5 a#4 d5 g5 d5 a#4 d5 g5 d5 a#4 d5 a5 - a#5 -",
      "c6 - a#5 - a5 - g5 - f5 - g5 - - - d5 -",
      "g5 d#5 a#4 d#5 g5 d#5 a#4 d#5 g5 d#5 a#4 d#5 a#5 - c6 -",
      "a5 - - - f5 - c5 - f5 - a5 - c6 - a5 -",
      "a#5 - - . a#5 . a5 g5 - . d5 - g5 - a5 .",
      "a#5 - - . c6 . a#5 a5 - . g5 - e5 - g5 .",
      "f#5 - - - a5 - - - d6 - c6 - a5 - f#5 -",
      "d5 a4 f#4 a4 d5 a4 f#4 a4 d5 - - - . . . ."
    ], [
      "g2 . g2 . a#2 . g2 . d3 . g2 . f2 . g2 .",
      "g2 . g2 . a#2 . g2 . d3 . g2 . f2 . d2 .",
      "d#2 . d#2 . g2 . d#2 . a#2 . d#2 . d2 . d#2 .",
      "f2 . f2 . a2 . f2 . c3 . f2 . d#2 . f2 .",
      "g2 . g2 . a#2 . g2 . d3 . g2 . f2 . g2 .",
      "c2 . c2 . e2 . c2 . g2 . c2 . a#1 . c2 .",
      "d2 . d2 . f#2 . d2 . a2 . d2 . c3 . d2 .",
      "d2 . d3 . d2 . d3 . d2 . f#2 . a2 . c3 ."
    ], "k . x x s . x x k . x x s x x x", "k . x x s . x x s s s s s s s s"),
    // Mempool Lake: B minor, long flowing notes over a bass rolling up and down like a swell.
    mempool: song(false, 148, 1, [
      "f#5 - - - - - e5 - d5 - - - c#5 - d5 -",
      "b4 - - - - - d5 - g5 - - - f#5 - e5 -",
      "f#5 - - - a5 - - - d6 - - - c#6 - a5 -",
      "e5 - - - - - . . c#5 - e5 - a5 - g5 -",
      "f#5 - - - b5 - - - a5 - f#5 - d5 - f#5 -",
      "g5 - - - - - f#5 - e5 - d5 - b4 - d5 -",
      "e5 - - - g5 - - - b5 - a5 - g5 - e5 -",
      "f#5 - - - - - - - a#4 - c#5 - e5 - f#5 -"
    ], [
      "b1 . f#2 . b2 . d3 . f#3 . d3 . b2 . f#2 .",
      "g1 . d2 . g2 . b2 . d3 . b2 . g2 . d2 .",
      "d2 . a2 . d3 . f#3 . a3 . f#3 . d3 . a2 .",
      "a1 . e2 . a2 . c#3 . e3 . c#3 . a2 . e2 .",
      "b1 . f#2 . b2 . d3 . f#3 . d3 . b2 . f#2 .",
      "g1 . d2 . g2 . b2 . d3 . b2 . g2 . d2 .",
      "e2 . b2 . e3 . g3 . b3 . g3 . e3 . b2 .",
      "f#1 . c#2 . f#2 . a#2 . c#3 . a#2 . f#2 . c#2 ."
    ], "k . x . s . x . . k x . s . x x", "k . x . s . x . s . s . s s s s"),
    // Bifrost Pass: D major with a raised fourth's brightness, icy and soaring, high on the thin pulse.
    bifrost: song(false, 162, 0, [
      "a5 - - - f#5 - a5 - d6 - - - c#6 - a5 -",
      "e6 - - - c#6 - a5 - e5 - - - a5 - c#6 -",
      "d6 - - - b5 - f#5 - d5 - f#5 - b5 - d6 -",
      "b5 - - - - - a5 - g5 - - - f#5 - e5 -",
      "f#5 - a5 - d6 - f#6 - e6 - d6 - a5 - - -",
      "g#5 - b5 - e6 - g#6 - f#6 - e6 - b5 - - -",
      "b5 - - - d6 - - - g6 - f#6 - e6 - d6 -",
      "c#6 - - - e6 - - - a6 - - - . . . ."
    ], [
      "d2 . . d2 a2 . d3 . d2 . . d2 a2 . f#2 .",
      "a1 . . a1 e2 . a2 . a1 . . a1 e2 . c#2 .",
      "b1 . . b1 f#2 . b2 . b1 . . b1 f#2 . d2 .",
      "g1 . . g1 d2 . g2 . g1 . . g1 d2 . a2 .",
      "d2 . . d2 a2 . d3 . d2 . . d2 a2 . f#2 .",
      "e2 . . e2 b2 . e3 . e2 . . e2 b2 . g#2 .",
      "g1 . . g1 d2 . g2 . g1 . . g1 d2 . b2 .",
      "a1 . . a1 e2 . a2 . a1 . c#2 . e2 . g2 ."
    ], "k . x . s . . x k . x . s . x .", "k . x . s . . x s . s s s s s s"),
    // The Reserve: C sharp minor, dark and relentless, a fat square stabbing over a pounding bass.
    reserve: song(false, 176, 2, [
      "c#5 . c#5 . e5 . c#5 . g#5 - - . f#5 . e5 .",
      "d#5 . e5 . f#5 . e5 . d#5 - c#5 - b4 - c#5 .",
      "a5 . a5 . g#5 . e5 . c#5 - - . e5 . a5 .",
      "g#5 - - - f#5 - d#5 - c5 - - - d#5 - - .",
      "c#6 . c#6 . b5 . g#5 . e5 - g#5 - c#6 - - .",
      "a5 . a5 . f#5 . c#5 . a5 - g#5 - f#5 - - .",
      "d5 - - . f#5 - - . a5 - - . d6 - c#6 -",
      "c6 - - - g#5 - - - d#5 - - - c5 - - -"
    ], [
      "c#2 . c#3 c#2 . c#2 c#3 . c#2 . c#3 c#2 . c#2 b2 .",
      "c#2 . c#3 c#2 . c#2 c#3 . c#2 . c#3 c#2 . b1 b2 .",
      "a1 . a2 a1 . a1 a2 . a1 . a2 a1 . a1 g#2 .",
      "g#1 . g#2 g#1 . g#1 g#2 . g#1 . g#2 g#1 . c2 d#2 .",
      "c#2 . c#3 c#2 . c#2 c#3 . c#2 . c#3 c#2 . c#2 b2 .",
      "f#1 . f#2 f#1 . f#1 f#2 . f#1 . f#2 f#1 . f#1 a2 .",
      "d2 . d3 d2 . d2 d3 . d2 . d3 d2 . d2 a2 .",
      "g#1 . g#2 g#1 . g#1 g#2 . g#1 . c2 . d#2 . g#2 ."
    ], "k . x k s . x . k k x . s . x k", "k . x k s . x . s s s s s s s s"),
    // The boss: F minor at full tilt, an alarm of a riff over octaves churning every sixteenth.
    boss: song(false, 184, 1, [
      "f5 . f5 . g#5 . f5 . c6 - b5 - c6 . f5 .",
      "f5 . f5 . g#5 . f5 . d#6 - c#6 - c6 - g#5 .",
      "f5 . f5 . g#5 . c#6 . f6 - d#6 - c#6 - g#5 .",
      "e5 - - - g5 - - - c6 - a#5 - g5 - e5 -",
      "c6 . c6 . c#6 . c6 . g#5 . f5 . g#5 . c6 .",
      "c#6 . c#6 . a#5 . f5 . c#6 - c6 - a#5 - - .",
      "c#6 - - . f6 - - . g#6 - f6 - c#6 - g#5 -",
      "g5 - e5 - c5 - e5 - g5 - c6 - e6 - g6 -"
    ], [
      "f2 f3 f2 f3 f2 f3 f2 f3 f2 f3 f2 f3 f2 f3 e2 e3",
      "f2 f3 f2 f3 f2 f3 f2 f3 f2 f3 f2 f3 g2 g3 g#2 g#3",
      "c#2 c#3 c#2 c#3 c#2 c#3 c#2 c#3 c#2 c#3 c#2 c#3 c#2 c#3 c2 c3",
      "c2 c3 c2 c3 c2 c3 c2 c3 c2 c3 c2 c3 e2 e3 g2 g3",
      "f2 f3 f2 f3 f2 f3 f2 f3 f2 f3 f2 f3 f2 f3 e2 e3",
      "a#1 a#2 a#1 a#2 a#1 a#2 a#1 a#2 a#1 a#2 a#1 a#2 c#2 c#3 f2 f3",
      "c#2 c#3 c#2 c#3 c#2 c#3 c#2 c#3 c#2 c#3 c#2 c#3 c#2 c#3 c#2 c#3",
      "c2 c3 c2 c3 c2 c3 c2 c3 c2 c3 c2 c3 c2 e2 g2 a#2"
    ], "k . s . k k s . k . s . k k s s", "k k s . k k s . s s s s s s s s"),
    // A stage cleared: a quick climb to a held top C on the fat square, a bar long, done before the stage card's sting.
    clear: song(true, 176, 2, ["g4 c5 e5 g5 c6 - - . a5 . b5 . c6 - - -"], ["c2 . . . g2 . . . f2 . g2 . c3 - - -"],
      "k . . . s . . . k . k . s . . .", "k . . . s . . . k . k . s . . ."),
    // Game over: a slow chromatic sag over a falling bass, a bar long.
    over: song(true, 96, 1, ["a4 - - g#4 - - g4 - - f#4 - - f4 - - -"], ["d2 - - - - - . . a#1 - - - a1 - - -"],
      "k . . . . . . . . . . . . . . .", "k . . . . . . . . . . . . . . ."),
    // The ending: C major and triumphant, four bars, as long as the ending's card stands.
    ending: song(true, 160, 1, [
      "c5 - e5 - g5 - c6 - - - b5 - c6 - d6 -",
      "e6 - - - d6 - c6 - b5 - - - g5 - - -",
      "a5 - - - c6 - - - f6 - e6 - d6 - c6 -",
      "d6 - - - b5 - g5 - c6 - - - - - - ."
    ], [
      "c2 . c3 . c2 . c3 . c2 . c3 . c2 . c3 .",
      "g1 . g2 . g1 . g2 . e2 . e3 . e2 . e3 .",
      "a1 . a2 . a1 . a2 . f2 . f3 . f2 . f3 .",
      "g1 . g2 . g1 . g2 . c2 - - - - - - ."
    ], "k . x . s . x . k . x . s . x .", "k . x . s . x . k . . . . . . .")
  };

  const create = () => {
    let ctx = null, master = null, ready = false, muted = BL.sound.muted, toneNext = 0, noiseNext = 0;
    // The page's mute and levels (sound.js): the cues on the raid's own channel, the tune at the page's Music level too.
    const soundChannel = BL.sound.channel("raid"), musicChannel = BL.sound.channel("music");
    let musicLevel = MUSIC_LEVEL * musicChannel.level;
    const tones = [], noises = [], running = [], waves = [];
    const last = new Float64Array(C.COUNT).fill(-1);
    // The chip's channels and pulse waves, the music's level, and the tune chosen (`M.id`, its tune `M.tune`), its next
    // step (`M.step`, due at `M.at`; past the last once a jingle has played out) and whether it is paused, in place.
    const chips = [], M = { id: null, tune: null, step: 0, at: 0, paused: false };
    let chipWaves = null, music = null, duckEnd = 0;

    const init = () => {
      if (ctx || typeof AudioContext === "undefined") return;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER;
      const squash = ctx.createDynamicsCompressor();
      squash.threshold.value = -14;
      squash.knee.value = 10;
      squash.ratio.value = 6;
      squash.attack.value = 0.003;
      squash.release.value = 0.2;
      master.connect(squash);
      squash.connect(soundChannel.node(ctx));
      // A started source, kept to stop on dispose.
      const run = (node) => { node.start(); running.push(node); return node; };
      for (const duty of DUTY) {
        const real = new Float32Array(HARMONICS + 1), imag = new Float32Array(HARMONICS + 1);
        for (let k = 1; k <= HARMONICS; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
        waves.push(ctx.createPeriodicWave(real, imag));
      }
      for (let i = 0; i < TONES; i++) {
        const gain = ctx.createGain(), osc = ctx.createOscillator(), lfo = ctx.createOscillator(), depth = ctx.createGain();
        gain.gain.value = 0;
        depth.gain.value = 0;
        gain.connect(master);
        osc.connect(gain);
        lfo.connect(depth);
        depth.connect(osc.frequency);
        run(osc);
        run(lfo);
        tones.push({ osc, gain, lfo, depth, shape: SQUARE, until: 0 });
      }
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      for (let i = 0; i < NOISES; i++) {
        const gain = ctx.createGain(), filter = ctx.createBiquadFilter(), src = ctx.createBufferSource();
        gain.gain.value = 0;
        src.buffer = buffer;
        src.loop = true;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        run(src);
        noises.push({ filter, gain, type: "", until: 0 });
      }
      music = ctx.createGain();
      music.gain.value = musicLevel;
      music.connect(master);
      chipWaves = BL.carnivalAudio.chipVoices(ctx, music, run, chips);
      ready = true;
    };
    // Browsers only start sound from a gesture; the first one opens the context.
    const unlock = () => {
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      init();
      if (ctx && ctx.state === "suspended") ctx.resume();
    };
    // The first voice of a pool free at `at`, else the next in turn.
    const pick = (pool, next, at) => {
      for (let i = 0; i < pool.length; i++) {
        const k = (next + i) % pool.length;
        if (pool[k].until <= at) return k;
      }
      return next % pool.length;
    };
    // A cue's repeat gate: false when the same cue played under GAP seconds ago.
    const fresh = (id) => {
      if (!ready) return false;
      const now = ctx.currentTime;
      if (now - last[id] < GAP) return false;
      last[id] = now;
      return true;
    };
    // A gain envelope on `g` from `at`: up to `peak` over `attack`, down to silence by `at + seconds`, then shut.
    const envelope = (g, peak, attack, seconds, at) => {
      g.cancelScheduledValues(at);
      g.setValueAtTime(0.0001, at);
      g.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
      g.exponentialRampToValueAtTime(0.0001, at + seconds);
      g.setValueAtTime(0, at + seconds + 0.005);
    };
    // A tone `delay` seconds from now: its pitch sliding from f0 to f1 over `seconds` under the envelope, with a
    // vibrato of `vib` hertz deep at `rate` hertz (none when `vib` is 0).
    const tone = (shape, f0, f1, attack, seconds, peak, delay, rate, vib) => {
      const at = ctx.currentTime + delay, i = pick(tones, toneNext, at), v = tones[i];
      toneNext = (i + 1) % TONES;
      if (shape !== v.shape) {
        if (shape >= P12) v.osc.setPeriodicWave(waves[shape - P12]);
        else v.osc.type = TYPES[shape];
        v.shape = shape;
      }
      const f = v.osc.frequency;
      f.cancelScheduledValues(at);
      f.setValueAtTime(f0, at);
      if (f1 !== f0) f.exponentialRampToValueAtTime(Math.max(20, f1), at + seconds);
      const d = v.depth.gain;
      d.cancelScheduledValues(at);
      d.setValueAtTime(vib, at);
      if (vib) {
        v.lfo.frequency.setValueAtTime(rate, at);
        d.setValueAtTime(0, at + seconds);
      }
      envelope(v.gain.gain, peak, attack, seconds, at);
      v.until = at + seconds + 0.01;
    };
    // A burst of noise `delay` seconds from now through a `type` filter swept from f0 to f1 with resonance `q`.
    const noise = (type, f0, f1, q, attack, seconds, peak, delay) => {
      const at = ctx.currentTime + delay, i = pick(noises, noiseNext, at), n = noises[i];
      noiseNext = (i + 1) % NOISES;
      if (type !== n.type) { n.filter.type = type; n.type = type; }
      n.filter.Q.setValueAtTime(q, at);
      const f = n.filter.frequency;
      f.cancelScheduledValues(at);
      f.setValueAtTime(f0, at);
      if (f1 !== f0) f.exponentialRampToValueAtTime(Math.max(30, f1), at + seconds);
      envelope(n.gain.gain, peak, attack, seconds, at);
      n.until = at + seconds + 0.01;
    };
    // One note of a jingle, `at` seconds in, lasting `beats` beats of `beat` seconds; 0 rests.
    const note = (shape, midi, beats, beat, peak, at) => {
      if (midi) tone(shape, HZ[midi], HZ[midi], 0.008, beats * beat * 0.95, peak, at, 0, 0);
    };

    // ---- the music ---------------------------------------------------------------------------------------
    // The music under a big cue for `seconds`, then back (`duckEnd` when it starts back); `unduck` brings it straight
    // back, for a new loop. A tune that plays once (the clear's jingle, game over's sting) starts under a duck still
    // running, so it comes in under the boss's break or the death and swells back with the duck's own return.
    const duck = (seconds) => {
      const now = ctx.currentTime, g = music.gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(musicLevel * DUCK, now, 0.02);
      g.setTargetAtTime(musicLevel, now + seconds, 0.2);
      duckEnd = now + seconds;
    };
    const unduck = (now) => {
      music.gain.cancelScheduledValues(now);
      music.gain.setTargetAtTime(musicLevel, now, 0.02);
      duckEnd = 0;
    };
    // Every step of the tune due before SONG_AHEAD from now: the lead on the first pulse at the tune's duty, the bass on
    // the triangle, the drums on the noise; a tune that fell behind (a pause, a hidden tab) carries on from now, and a
    // jingle stops after its last step. Allocation-free.
    const play = () => {
      const now = ctx.currentTime, end = now + SONG_AHEAD, T = M.tune, lead = chips[0];
      if (M.step >= T.n) return;
      if (M.at < now) M.at = now + 0.02;
      if (lead.wave !== T.duty) { lead.osc.setPeriodicWave(chipWaves[T.duty]); lead.wave = T.duty; }
      while (M.at < end) {
        const i = M.step, at = M.at;
        if (T.lead[i]) BL.carnivalAudio.chipNote(lead, true, T.lead[i], T.leadLen[i] * T.step, T.level, at);
        if (T.bass[i]) BL.carnivalAudio.chipNote(chips[2], false, T.bass[i], T.bassLen[i] * T.step, BL.carnivalAudio.BASS, at);
        if (T.drum[i]) BL.carnivalAudio.chipDrum(chips[3], T.drum[i], 1, at);
        M.at = at + T.step;
        M.step = i + 1;
        if (M.step === T.n) {
          if (T.once) return;
          M.step = 0;
        }
      }
    };
    // The chip silenced from `now`.
    const hush = (now) => {
      for (let c = 0; c < 4; c++) {
        const ch = chips[c];
        ch.gain.cancelScheduledValues(now);
        ch.gain.setValueAtTime(0, now);
        ch.f.cancelScheduledValues(now);
        if (ch.vib) { ch.vib.cancelScheduledValues(now); ch.vib.setValueAtTime(0, now); }
      }
    };
    // A tune from its top (`id` one of SONGS), or none (null); the one already chosen goes on as it is.
    const setMusic = (id) => {
      if (id === M.id) return;
      if (id !== null && !SONGS[id]) throw new Error(`raid-audio: no tune "${id}"`);
      M.id = id;
      M.tune = id === null ? null : SONGS[id];
      M.step = 0;
      M.at = 0;
      M.paused = false;
      if (!ready) return;
      hush(ctx.currentTime);
      if (!M.tune || !M.tune.once) unduck(ctx.currentTime);
    };
    // Halts the tune where it is, back to the first step not yet heard, or lets it carry on from there.
    const pause = (on) => {
      if (M.paused === on) return;
      M.paused = on;
      if (!on || !ready || !M.tune) return;
      const now = ctx.currentTime, T = M.tune;
      while (M.at - T.step >= now && (M.step > 0 || !T.once)) { M.at -= T.step; M.step = M.step ? M.step - 1 : T.n - 1; }
      hush(now);
    };
    // Once a frame: the tune's next steps.
    const tick = () => {
      if (ready && M.tune && !M.paused) play();
    };

    // The five weapons' shots, each its own timbre: the rifle's bright pop, the auto rifle's short dry snap (it fires
    // every 8/60 s, so it is the quickest), the cork gun's hollow rising plonk, the fan's chord of three thin pulses
    // over an airy swish, and the beam's warbling zap over a sizzle.
    const shot = (weapon) => {
      switch (weapon) {
        case 1:
          if (!fresh(C.SHOT + 1)) return;
          tone(SAW, 640, 190, 0.002, 0.055, 0.1, 0, 0, 0);
          noise("bandpass", 3200, 1400, 1.2, 0.002, 0.04, 0.09, 0);
          return;
        case 2:
          if (!fresh(C.SHOT + 2)) return;
          tone(SINE, 240, 700, 0.004, 0.07, 0.26, 0, 0, 0);
          tone(TRI, 520, 300, 0.002, 0.05, 0.08, 0.012, 0, 0);
          noise("lowpass", 900, 250, 0.7, 0.002, 0.06, 0.12, 0);
          return;
        case 3:
          if (!fresh(C.SHOT + 3)) return;
          tone(P25, 1046, 700, 0.003, 0.09, 0.07, 0, 0, 0);
          tone(P25, 1318, 880, 0.003, 0.09, 0.06, 0, 0, 0);
          tone(P25, 1568, 1046, 0.003, 0.09, 0.05, 0, 0, 0);
          noise("bandpass", 4200, 1300, 0.8, 0.004, 0.12, 0.08, 0);
          return;
        case 4:
          if (!fresh(C.SHOT + 4)) return;
          tone(SINE, 1500, 620, 0.004, 0.18, 0.15, 0, 34, 90);
          tone(P12, 760, 380, 0.004, 0.14, 0.05, 0, 0, 0);
          noise("highpass", 5200, 3000, 0.7, 0.004, 0.14, 0.05, 0);
          return;
        default:
          if (!fresh(C.SHOT)) return;
          tone(SQUARE, 980, 260, 0.002, 0.075, 0.1, 0, 0, 0);
          noise("highpass", 2600, 1800, 0.7, 0.001, 0.03, 0.08, 0);
      }
    };
    const cues = {
      shot,
      // A Fiat Legion shot: a thin, low, buzzing pulse, quieter than the Ooga's own.
      enemyShot: () => {
        if (!fresh(C.ENEMY_SHOT)) return;
        tone(P12, 330, 210, 0.004, 0.1, 0.07, 0, 0, 0);
      },
      // An enemy winding up to attack (raid-enemies.js's FLAG.WIND): a quick rising blip and a glint, under the shots.
      tell: () => {
        if (!fresh(C.TELL)) return;
        tone(P25, 520, 900, 0.004, 0.09, 0.045, 0, 0, 0);
        tone(TRI, 1040, 1400, 0.003, 0.07, 0.035, 0.05, 0, 0);
      },
      // A boss winding up its big attack (FLAG.BIG): a rough saw swelling up with a wobble, a hollow square over it and a
      // rising rush of noise.
      tellBig: () => {
        if (!fresh(C.TELL_BIG)) return;
        tone(SAW, 110, 330, 0.08, 0.55, 0.1, 0, 12, 14);
        tone(SQUARE, 220, 660, 0.06, 0.5, 0.035, 0.02, 0, 0);
        noise("bandpass", 500, 2600, 1.4, 0.15, 0.5, 0.08, 0);
      },
      // A money printer spinning up over its wind-up's `seconds`: a motor's saw climbing with a rattle, a thin whine an
      // octave over it and a rising hiss of hot paper.
      windUp: (seconds) => {
        if (!fresh(C.WIND_UP)) return;
        tone(SAW, 70, 420, 0.05, seconds, 0.07, 0, 18, 6);
        tone(P12, 140, 840, 0.05, seconds, 0.03, 0, 0, 0);
        noise("bandpass", 300, 1800, 2, 0.05, seconds, 0.05, 0);
      },
      // A bullet on an enemy that lives: a hard bright tick.
      hit: () => {
        if (!fresh(C.HIT)) return;
        tone(TRI, 1900, 1500, 0.001, 0.04, 0.12, 0, 0, 0);
        noise("bandpass", 4200, 3000, 2, 0.001, 0.03, 0.08, 0);
      },
      // Fodder destroyed: paper tearing (a swept band of noise) over a falling square.
      pop: () => {
        if (!fresh(C.POP)) return;
        noise("bandpass", 2400, 600, 1.4, 0.003, 0.2, 0.2, 0);
        tone(SQUARE, 620, 140, 0.002, 0.13, 0.1, 0, 0, 0);
        noise("highpass", 6000, 3500, 0.7, 0.002, 0.06, 0.06, 0.05);
      },
      // A machine destroyed: a long dark rumble, a sub thump under it and a crunch of torn metal on top.
      boom: () => {
        if (!fresh(C.BOOM)) return;
        noise("lowpass", 1600, 70, 0.8, 0.005, 0.8, 0.38, 0);
        tone(SINE, 120, 34, 0.004, 0.6, 0.42, 0, 0, 0);
        tone(SAW, 260, 60, 0.003, 0.28, 0.12, 0.02, 21, 30);
        noise("bandpass", 1800, 500, 1.6, 0.003, 0.25, 0.14, 0.06);
      },
      // A bullet on a shut enemy: a dull clank off armour.
      shut: () => {
        if (!fresh(C.SHUT)) return;
        tone(TRI, 260, 230, 0.001, 0.07, 0.16, 0, 0, 0);
        tone(SQUARE, 1170, 1100, 0.001, 0.025, 0.035, 0, 0, 0);
        noise("bandpass", 900, 700, 3, 0.001, 0.04, 0.07, 0);
      },
      // A pickup taken: a bright three-note climb on a pulse with a glint above it.
      pickup: () => {
        if (!fresh(C.PICKUP)) return;
        for (let i = 0; i < 3; i++) note(P25, PICKUP[i], 1, 0.055, 0.12, i * 0.05);
        tone(SINE, 2200, 3300, 0.004, 0.14, 0.05, 0.12, 0, 0);
      },
      // An extra life: a longer climb that tops out an octave over, a bass under its first and last notes.
      oneUp: () => {
        if (!fresh(C.ONE_UP)) return;
        for (let i = 0; i < 6; i++) note(P12, ONE_UP[i], i === 5 ? 4 : 1, 0.065, 0.13, i * 0.065);
        note(TRI, ONE_UP_BASS[0], 3, 0.065, 0.2, 0);
        note(TRI, ONE_UP_BASS[1], 5, 0.065, 0.2, 0.325);
      },
      // The Ooga down: a wobbling cry falling away, a thud as it lands and a short pulse fall.
      death: () => {
        if (!fresh(C.DEATH)) return;
        tone(SAW, 560, 85, 0.01, 0.75, 0.16, 0, 9, 24);
        noise("lowpass", 700, 90, 0.8, 0.004, 0.3, 0.26, 0.05);
        tone(SINE, 150, 45, 0.003, 0.25, 0.32, 0.06, 0, 0);
        tone(P12, 660, 165, 0.01, 0.6, 0.06, 0.15, 0, 0);
        duck(DUCK_DEATH);
      },
      // The Ooga dropped back in: a falling whistle and a landing thump.
      drop: () => {
        if (!fresh(C.DROP)) return;
        tone(SINE, 1500, 480, 0.01, 0.36, 0.11, 0, 0, 0);
        tone(SINE, 160, 48, 0.003, 0.2, 0.36, 0.36, 0, 0);
        noise("lowpass", 600, 120, 0.8, 0.003, 0.16, 0.2, 0.36);
      },
      // The vault's guns down and its door opening: the bolt's clunk, a rolling rumble and a two-tone alarm over it.
      bossOpen: () => {
        if (!fresh(C.BOSS_OPEN)) return;
        tone(TRI, 95, 62, 0.002, 0.3, 0.34, 0, 0, 0);
        noise("lowpass", 900, 110, 1, 0.003, 0.3, 0.26, 0);
        noise("lowpass", 260, 120, 0.8, 0.25, 1.4, 0.16, 0.12);
        tone(SINE, 52, 48, 0.2, 1.4, 0.2, 0.12, 3, 4);
        for (let i = 0; i < 6; i++) tone(SQUARE, i & 1 ? 392 : 523, i & 1 ? 392 : 523, 0.006, 0.14, 0.06, 0.25 + i * 0.16, 0, 0);
        duck(DUCK_OPEN);
      },
      // A continue taken: a quick lift and a chime.
      continue: () => {
        if (!fresh(C.CONTINUE)) return;
        for (let i = 0; i < 3; i++) note(P25, CONT[i], i === 2 ? 3 : 1, 0.06, 0.12, i * 0.06);
        tone(SINE, HZ[91], HZ[91], 0.004, 0.4, 0.06, 0.12, 0, 0);
      },
      // A boss's part destroyed (a gun, a die, a tether): a hard snap of metal, a short blast and a falling clang.
      part: () => {
        if (!fresh(C.PART)) return;
        noise("bandpass", 3600, 900, 2.2, 0.001, 0.07, 0.16, 0);
        noise("lowpass", 2200, 160, 0.9, 0.004, 0.45, 0.3, 0.01);
        tone(SQUARE, 420, 80, 0.002, 0.28, 0.1, 0, 0, 0);
        tone(TRI, 1320, 990, 0.001, 0.35, 0.08, 0.04, 7, 12);
      },
      // The boss down: a chain of blasts rolling over a long sub fall, a torn-metal wail and a last crash that rings out.
      bossDown: () => {
        if (!fresh(C.BOSS_DOWN)) return;
        for (let i = 0; i < 4; i++) noise("lowpass", 1900 - i * 260, 90, 0.8, 0.004, 0.55 + i * 0.1, 0.36, i * 0.2);
        tone(SINE, 110, 26, 0.006, 2, 0.46, 0, 0, 0);
        tone(SAW, 520, 70, 0.02, 1.3, 0.1, 0.1, 6, 40);
        tone(SQUARE, 180, 40, 0.004, 0.5, 0.14, 0.6, 0, 0);
        noise("lowpass", 1200, 50, 0.7, 0.01, 1.9, 0.42, 0.8);
        noise("bandpass", 2600, 700, 1.4, 0.003, 0.6, 0.14, 0.85);
        duck(DUCK_DOWN);
      },
      // A room's barrier lifting: the bolt's clunk, the bars humming up and a two-note chime as the way opens.
      barrier: () => {
        if (!fresh(C.BARRIER)) return;
        tone(TRI, 150, 90, 0.002, 0.16, 0.26, 0, 0, 0);
        tone(SAW, 110, 330, 0.03, 0.55, 0.06, 0.05, 18, 8);
        noise("bandpass", 700, 2400, 1.1, 0.05, 0.5, 0.06, 0.05);
        for (let i = 0; i < 2; i++) note(P25, BARS[i], i ? 4 : 1, 0.08, 0.1, 0.5 + i * 0.08);
      },
      // The stage card: a short sting, `delay` seconds from now (after the clear's fanfare, which lands with it).
      card: (delay) => {
        if (!fresh(C.CARD)) return;
        let at = delay;
        for (let i = 0; i < STING.length; i++) {
          note(P25, STING[i], STING_BEATS[i], 0.07, 0.11, at);
          at += STING_BEATS[i] * 0.07;
        }
        note(TRI, 48, 6, 0.07, 0.2, delay);
      },
      // A lift setting off: a motor's clunk and a low hum winding up.
      lift: () => {
        if (!fresh(C.LIFT)) return;
        tone(TRI, 120, 80, 0.002, 0.1, 0.18, 0, 0, 0);
        tone(SAW, 55, 82, 0.08, 0.7, 0.05, 0.03, 9, 3);
        noise("bandpass", 380, 520, 2, 0.06, 0.6, 0.05, 0.03);
      },
      // A ledge starting to crumble: a crack and a trickle of grit now, and its rubble falling away `fuse` seconds on,
      // as the span gives way.
      crumble: (fuse) => {
        if (!fresh(C.CRUMBLE)) return;
        noise("highpass", 3800, 2200, 1.2, 0.001, 0.05, 0.14, 0);
        noise("bandpass", 1500, 500, 1.3, 0.02, Math.max(0.1, fuse), 0.06, 0.03);
        noise("lowpass", 1000, 110, 0.8, 0.005, 0.55, 0.26, fuse);
        tone(SINE, 120, 40, 0.004, 0.3, 0.26, fuse, 0, 0);
      },
      // Shaman's Secrets opening: a low growl from the stone, rough and wavering, under a bright rising shimmer as the
      // tablet flashes.
      secrets: () => {
        if (!fresh(C.SECRETS)) return;
        tone(SAW, 92, 58, 0.03, 0.9, 0.2, 0, 7, 9);
        tone(SQUARE, 69, 46, 0.04, 0.8, 0.08, 0.02, 5, 6);
        noise("lowpass", 520, 140, 1.1, 0.04, 0.8, 0.22, 0);
        for (let i = 0; i < 4; i++) tone(SINE, HZ[84 + i * 3], HZ[88 + i * 3], 0.004, 0.22, 0.05, 0.12 + i * 0.07, 0, 0);
        noise("highpass", 5200, 7600, 0.7, 0.02, 0.5, 0.05, 0.1);
      },
      // A weapon callout (a weapon, rapid fire or the barrier taken): a fanfare on the fat pulse over a bass, after the
      // pickup's own climb, with a glint on its last note.
      callout: () => {
        if (!fresh(C.CALL)) return;
        let at = CALL_AT;
        for (let i = 0; i < CALL.length; i++) {
          note(P25, CALL[i], CALL_BEATS[i], 0.06, 0.12, at);
          at += CALL_BEATS[i] * 0.06;
        }
        note(TRI, 55, 7, 0.06, 0.2, CALL_AT);
        tone(SINE, HZ[98], HZ[98], 0.004, 0.3, 0.05, at - 0.24, 0, 0);
      },
      // A boss entering under its name card: a low blow of two rough saws a tritone apart swelling in, a gong of dark
      // noise, and three falling notes on the thin pulse. It ducks the music while the card stands.
      bossCard: () => {
        if (!fresh(C.BOSS_CARD)) return;
        tone(SAW, HZ[33], HZ[33] * 0.97, 0.12, 1.3, 0.18, 0, 4, 5);
        tone(SAW, HZ[39], HZ[39] * 0.97, 0.12, 1.3, 0.12, 0, 4, 6);
        noise("lowpass", 1400, 90, 0.9, 0.01, 1.6, 0.3, 0);
        tone(SINE, 70, 40, 0.004, 0.9, 0.36, 0, 0, 0);
        for (let i = 0; i < OMEN.length; i++) note(P12, OMEN[i], i === 2 ? 6 : 2, 0.09, 0.12, 0.35 + i * 0.18);
        duck(DUCK_OPEN);
      },
      // A tripwire about to go live: a quick tick every TICK seconds through its `warn` seconds, then a short buzz.
      wire: (warn) => {
        if (!fresh(C.WIRE)) return;
        const n = Math.min(TICKS, Math.max(1, Math.floor(warn / TICK)));
        for (let i = 0; i < n; i++) tone(SQUARE, 2100, 2000, 0.001, 0.025, 0.05, i * TICK, 0, 0);
        tone(SAW, 140, 120, 0.004, 0.18, 0.06, warn, 60, 20);
      }
    };
    // Silence every voice now, for a pause or a leave.
    const quiet = () => {
      if (!ready) return;
      const now = ctx.currentTime;
      for (const v of tones) { v.gain.gain.cancelScheduledValues(now); v.gain.gain.setTargetAtTime(0, now, 0.02); v.until = 0; }
      for (const n of noises) { n.gain.gain.cancelScheduledValues(now); n.gain.gain.setTargetAtTime(0, now, 0.02); n.until = 0; }
    };
    const setMuted = (on) => {
      muted = !!on;
      if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05);
      BL.sound.setMuted(muted);
    };
    const offSound = BL.sound.subscribe(setMuted);
    // A new Music level takes the tune at once, or where a duck running now returns it.
    const offMusic = musicChannel.subscribe(() => {
      musicLevel = MUSIC_LEVEL * musicChannel.level;
      if (!ready) return;
      const now = ctx.currentTime;
      if (now < duckEnd) duck(duckEnd - now);
      else unduck(now);
    });
    const dispose = () => {
      offSound(); offMusic(); soundChannel.release(); musicChannel.release();
      M.id = M.tune = null;
      if (!ctx) return;
      for (const node of running) node.stop();
      ctx.close();
      ctx = master = music = chipWaves = null;
      running.length = tones.length = noises.length = waves.length = chips.length = 0;
      last.fill(-1);
      ready = false;
    };
    return {
      cues, unlock, quiet, setMuted, dispose, setMusic, pause, tick,
      get muted() {
        return muted;
      },
      get ready() {
        return ready;
      },
      // The tune chosen (a SONGS id, or null for none), whether it is paused, and the step it plays next.
      get music() {
        return M.id;
      },
      get musicPaused() {
        return M.paused;
      },
      get musicStep() {
        return M.step;
      },
      // Whether the music is under a big cue's duck now, before its return.
      get musicDucked() {
        return ready && ctx.currentTime < duckEnd;
      },
      // The pools' size: 0 until unlocked, TONES + NOISES after.
      get voices() {
        return tones.length + noises.length;
      },
      get context() {
        return ctx;
      }
    };
  };
  BL.raidAudio = { create, TONES, NOISES, SONGS };
})();
