// The Ember Den's sound: lounge music and the room round it. Synthesized and pooled on the Factory's pattern
// (factory-audio.js): one AudioContext opened from a gesture the browser has already activated, pre-started voices
// gated by gain, one noise loop for the bed, and nothing allocated per frame or per cue.
//
// Two channels, both held from `create` to `dispose`: the shared `music` (the page-wide Music row) carries the
// music (the tone voices and the brush kit's own noise voices, through the music bus) and `room`, the place's own
// row, the bed and every one-shot (the noise voices and the room's own few tone voices, through the room bus). The bed is the room's
// murmur: one looped noise through a low bandpass whose gain breathes slowly, under a level stage set by how near
// the visitor is to the bar or a table. The one-shots are placed where they happen, quieter with distance and panned
// from the visitor's facing, and the room makes its own: a chip at a table now and then, a glass at the bar. A cue
// only takes a voice of its own pool that is free now; with none free it is dropped. The music is a swing sequencer
// on the context's clock: each frame schedules the steps due in the next moment from the tune's `origin`, skipping
// any whose time has passed, and while the tab is hidden one background tick schedules further ahead instead.
// `update(dt, ear)` runs once a frame with where the visitor hears from (`ear`: `x`, `z` and the unit facing `fx`,
// `fz` on the floor, written in place by the scene). `cue(name, x, z)` plays a room event where it happens.
// `setSeated(on)` says whether the visitor is in a table's panel, which eases the music to `SEATED` of its level, and
// `win()` marks a hand ended at the table the visitor sits at or watches, won or lost, which dips it to `WON` for
// `WIN_HOLD` seconds and lets it back to the seated or free level on the context's clock (`stats.hands` counts the
// marks). `stats` is one object updated in place, and `pools`, the voice pools by name, are live arrays for tests and
// debugging to inspect. It honours the page-wide mute, opens no context while muted, and `dispose` closes it.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // The tone voices are fixed at init, never retyped: `BASS_TONES` triangles and the rest sines.
  const TONES = 10, BASS_TONES = 4, NOISES = 5, NOISE_SECONDS = 2;
  // The room's own tone voices for the cues, on the room bus: `ROOM_SINES` sines and the rest triangles.
  const ROOM_TONES = 4, ROOM_SINES = 2;
  // The two buses' levels under their channels.
  const MUSIC = 0.16, ROOM = 0.22;
  // The music's ducks, as factors of its level: `SEATED` in a table's panel, eased over `SEAT_EASE` seconds; `WON` for
  // `WIN_HOLD` seconds after a hand is won, dipped over `WIN_EASE` and back over `SEAT_EASE`.
  const SEATED = 0.45, WON = 0.25, WIN_HOLD = 1.5, SEAT_EASE = 0.6, WIN_EASE = 0.15;
  // The bed: a bandpass at `BED_HZ`, its gain at `BED_LEVEL` swinging `BED_DEPTH` either way at `BED_WOBBLE` hertz.
  const BED_HZ = 420, BED_Q = 0.7, BED_LEVEL = 0.5, BED_DEPTH = 0.15, BED_WOBBLE = 0.13;
  // The brush kit's own noise voices, on the music bus.
  const BRUSHES = 4;
  // The bed's level: `BED_FLOOR` plus `BED_NEAR` times how near the nearer bar wing or the nearest table is (half at
  // `BED_REF` metres), set every `BED_EVERY` seconds and eased to within 5% over `BED_EASE`.
  const BED_FLOOR = 0.35, BED_NEAR = 0.65, BED_REF = 8, BED_EVERY = 0.1, BED_EASE = 0.4;
  // A cue is at half its level `CUE_REF` metres away, panned at most `CUE_PAN`, and dropped further than `CUE_FAR`.
  const CUE_REF = 6, CUE_PAN = 0.7, CUE_FAR = 30;
  // The cues' recipes: the band or pitch, the length, the level, and the gap between a pair's taps.
  const CHIP_HZ = 5200, CHIP_DUR = 0.03, CHIP_GAP = 0.05, CHIP_LEVEL = 0.5;
  const GLASS_HZ = 2100, GLASS_TO = 1900, GLASS_DUR = 0.4, GLASS_CUT = 6000, GLASS_LEVEL = 0.22;
  const HEEL_HZ = 1800, HEEL_DUR = 0.035, HEEL_LEVEL = 0.4;
  const CANE_HZ = 240, CANE_DUR = 0.06, CANE_CUT = 1500, CANE_LEVEL = 0.35, WALKER_GAP = 0.09, WALKER_LEVEL = 0.6;
  // Which pool each cue plays on.
  const CUE_KINDS = Object.freeze({ chip: "noise", heel: "noise", glass: "sine", cane: "triangle", walker: "triangle" });
  // The room's own cues: a chip at a random table every `CHIP_MIN` to `CHIP_MAX` seconds, a glass at a random bar wing
  // every `GLASS_MIN` to `GLASS_MAX`.
  const CHIP_MIN = 1.5, CHIP_MAX = 4, GLASS_MIN = 6, GLASS_MAX = 14;
  // A voice taken while it still holds a note fades over `STEAL_FADE` (a time constant) and starts `STEAL_GAP` later.
  const STEAL_FADE = 0.004, STEAL_GAP = 0.012;

  // The lounge's chords: `CHORDS[id]` holds a chord's root, third, fifth and seventh as semitones from C2, built once
  // from its symbol (a root letter, an optional flat, then `7`, `maj7` or `m7`) the first time a chart names it.
  const C2 = 65.40639;
  const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const QUALITIES = { "7": [4, 7, 10], maj7: [4, 7, 11], m7: [3, 7, 10] };
  const CHORDS = [], chordIds = new Map();
  const chordOf = (symbol) => {
    if (chordIds.has(symbol)) return chordIds.get(symbol);
    const flat = symbol[1] === "b", root = LETTERS[symbol[0]] - (flat ? 1 : 0), quality = QUALITIES[symbol.slice(flat ? 2 : 1)];
    if (quality === undefined || Number.isNaN(root)) throw new Error("poker-audio: unknown chord " + symbol);
    chordIds.set(symbol, CHORDS.length);
    CHORDS.push(Object.freeze({ root, third: root + quality[0], fifth: root + quality[1], seventh: root + quality[2] }));
    return CHORDS.length - 1;
  };
  // A chart, one chord symbol a bar, read into chord ids.
  const chart = (text) => Uint8Array.from(text.trim().split(/\s+/), chordOf);
  // The lounge's tunes, played in turn: three choruses of each, then four bars of rest. `seed` is the hash its
  // choruses' generators start from.
  const tune = (id, bpm, text) => Object.freeze({ id, bpm, bars: chart(text), seed: BL.math.fnv1a(id) });
  const SONGS = Object.freeze([
    tune("slowBlues", 92, "F7 Bb7 F7 F7 Bb7 Bb7 F7 D7 Gm7 C7 F7 C7"),
    tune("afterHours", 72, "Cmaj7 A7 Dm7 G7 Em7 A7 Dm7 G7 Cmaj7 C7 Fmaj7 Fm7 Em7 A7 Dm7 G7"),
    tune("smokeRing", 84, "Cm7 Cm7 Fm7 Cm7 Fm7 Fm7 Cm7 Cm7 Ab7 G7 Cm7 G7"),
  ]);
  Object.freeze(CHORDS);
  // The grid: 12 steps a bar, four beats of triplets, so the swing is exact. A tune plays `CHORUSES` choruses and
  // `REST_BARS` bars of rest. The sequencer schedules `AHEAD` seconds ahead while the tab shows and `AHEAD_HIDDEN`
  // while it is hidden, when one `HIDDEN_TICK_MS` timer stands in for the frames.
  const STEPS = 12, CHORUSES = 3, REST_BARS = 4, AHEAD = 0.12, AHEAD_HIDDEN = 2, HIDDEN_TICK_MS = 500, LEAD = 0.1;
  // Each voice's recipe: the filter's frequency, the note's length and level.
  const BASS_HZ = 500, BASS_DUR = 0.3, BASS_LEVEL = 0.9;
  const PIANO_HZ = 1800, PIANO_DUR = 0.55, PIANO_LEVEL = 0.35, PIANO_UPPER = 0.25;
  const SWISH_HZ = 2400, SWISH_DUR = 0.22, SWISH_LEVEL = 0.1, TAP_HZ = 4200, TAP_DUR = 0.05, TAP_LEVEL = 0.16;

  const create = () => {
    let ctx = null, buffer = null, music = null, room = null, ready = false, muted = BL.sound.muted, disposed = false;
    const musicChannel = BL.sound.channel("music"), roomChannel = BL.sound.channel("room");
    const triangles = [], sines = [], noises = [], brushes = [], roomSines = [], roomTriangles = [], bed = {};
    let roomSineNext = 0, roomTriangleNext = 0;
    // Whether the visitor is in a table's panel, and the context time a win's dip ends.
    let seated = false, winUntil = 0;
    let triangleNext = 0, sineNext = 0, noiseNext = 0, brushNext = 0;
    // The sequencer: the tune playing, its step length and length in steps, the context time it started (`origin`) and
    // the next step to schedule. The generator's state, the chorus and bar it last drew for, and that bar's four draws.
    let song = SONGS[0], songIndex = 0, stepSeconds = 1, tuneSteps = 0, origin = 0, next = 0, timer = 0;
    let rngState = 0, rngChorus = -1, rngBar = -1;
    const draws = new Float64Array(4);
    const stats = { open: false, contexts: 0, hands: 0, tones: 0, noises: 0, brushes: 0, song: null, bar: 0, step: 0, scheduled: 0, cues: 0, dropped: 0, busy: 0, steals: 0, roomTones: 0 };
    // Where the visitor hears from, copied from `update`'s `ear`; where the cue being placed sits from there (`AT`); the
    // bar's two wings and the tables, read once; and the countdowns to the bed's next level and the room's next cues.
    const EAR = { x: 0, z: 0, fx: 0, fz: 1 }, AT = { level: 0, pan: 0 };
    const tables = BL.pokerModels.TABLES, wings = BL.pokerModels.FURNITURE.filter(f => f.kind === "bar");
    const between = (lo, hi) => lo + Math.random() * (hi - lo);
    let hasBar = true;
    let bedWait = 0, chipWait = between(CHIP_MIN, CHIP_MAX), glassWait = between(GLASS_MIN, GLASS_MAX);

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
    const panner = (to) => {
      const p = ctx.createStereoPanner();
      p.connect(to);
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
    const hissOf = (to) => {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.loop = true;
      s.connect(to);
      s.start(0, Math.random() * NOISE_SECONDS);
      return s;
    };

    // A tune from its top at context time `at`.
    const startSong = (index, at) => {
      songIndex = index;
      song = SONGS[index];
      stepSeconds = 60 / song.bpm / 3;
      tuneSteps = (CHORUSES * song.bars.length + REST_BARS) * STEPS;
      origin = at;
      next = 0;
      rngChorus = -1;
    };
    // mulberry32's step on `rngState`, in place, so a chorus's generator costs no closure.
    const rand = () => {
      rngState = rngState + 1831565813 | 0;
      let t = Math.imul(rngState ^ rngState >>> 15, 1 | rngState);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    // The four draws of a chorus's bar: the piano's pattern, then the bass's choices on beats 1, 2 and 3. Each chorus
    // seeds `mulberry32(fnv1a(id) + chorus)` and every bar takes four draws, bars skipped included, so a bar plays the
    // same on every page however the steps before it went.
    const drawBar = (chorus, bar) => {
      if (chorus !== rngChorus) {
        rngState = song.seed + chorus;
        rngChorus = chorus;
        rngBar = -1;
      }
      while (rngBar < bar) {
        rngBar++;
        for (let i = 0; i < 4; i++) draws[i] = rand();
      }
    };
    const hz = (semitones) => C2 * Math.pow(2, semitones / 12);
    // A tone at `at` on voice `v`, through the lowpass at `cutoff`.
    const tone = (v, semitones, cutoff, level, dur, at) => {
      const t = env(v, at, level, 0.008, dur, 0);
      v.osc.frequency.setValueAtTime(hz(semitones), t);
      v.filter.frequency.setValueAtTime(cutoff, t);
      stats.scheduled++;
    };
    const piano = (semitones, at) => {
      tone(sineVoice(at), semitones, PIANO_HZ, PIANO_LEVEL, PIANO_DUR, at);
      tone(sineVoice(at), semitones + 12, PIANO_HZ, PIANO_LEVEL * PIANO_UPPER, PIANO_DUR, at);
    };
    const brush = (band, level, attack, dur, at) => {
      const v = pick(brushes, brushNext = (brushNext + 1) % BRUSHES, at);
      v.filter.frequency.setValueAtTime(band, env(v, at, level, attack, dur, 0));
      stats.scheduled++;
    };
    // The root beat 3 of a bar approaches: the next bar's, the chorus's top after its last bar, and after the last
    // chorus the next tune's first.
    const nextRoot = (chorus, inBar) => {
      const bars = song.bars;
      if (inBar + 1 < bars.length) return CHORDS[bars[inBar + 1]].root;
      if (chorus < CHORUSES - 1) return CHORDS[bars[0]].root;
      return CHORDS[SONGS[(songIndex + 1) % SONGS.length].bars[0]].root;
    };
    // Step `n` of the tune, due at `at`.
    const schedule = (n, at) => {
      const bar = n / STEPS | 0, step = n - bar * STEPS, beat = step / 3 | 0, sub = step - beat * 3;
      stats.song = song.id;
      stats.bar = bar;
      stats.step = step;
      const bars = song.bars, chorus = bar / bars.length | 0;
      if (chorus >= CHORUSES) return;
      const inBar = bar - chorus * bars.length;
      drawBar(chorus, inBar);
      const c = CHORDS[bars[inBar]];
      if (sub === 0) {
        const root = beat === 0 ? c.root
          : beat === 1 ? (draws[1] < 0.5 ? c.third : c.fifth)
          : beat === 2 ? (draws[2] < 0.5 ? c.fifth : c.seventh)
          : nextRoot(chorus, inBar) + (draws[3] < 0.5 ? -1 : 1);
        tone(triangleVoice(at), root, BASS_HZ, BASS_LEVEL, BASS_DUR, at);
        brush(SWISH_HZ, SWISH_LEVEL, 0.06, SWISH_DUR, at);
      }
      if (sub === 0 && (beat === 1 || beat === 3) || sub === 2 && beat === 3) brush(TAP_HZ, TAP_LEVEL, 0.003, TAP_DUR, at);
      // The piano's pattern, weighted 4, 3, 2 and 1: beat 1's last triplet, beats 0 and 2's last, beat 3's first, none.
      const p = draws[0];
      if (p < 0.4 ? beat === 1 && sub === 2 : p < 0.7 ? (beat === 0 || beat === 2) && sub === 2 : p < 0.9 && beat === 3 && sub === 0) {
        piano(c.third + 12, at);
        piano(c.seventh + 12, at);
      }
    };
    // Schedules every step due before `AHEAD` from now (`AHEAD_HIDDEN` while hidden). Steps whose time has passed are
    // skipped, never played late, so a tab shown after minutes carries on in time without a burst.
    const sequence = () => {
      const now = ctx.currentTime, end = now + (document.hidden ? AHEAD_HIDDEN : AHEAD);
      let n = Math.max(next, Math.ceil((now - origin) / stepSeconds));
      for (;;) {
        if (n >= tuneSteps) {
          startSong((songIndex + 1) % SONGS.length, origin + tuneSteps * stepSeconds);
          n = Math.max(0, Math.ceil((now - origin) / stepSeconds));
          continue;
        }
        const at = origin + n * stepSeconds;
        if (at >= end) break;
        schedule(n, at);
        n++;
      }
      next = n;
    };
    // The one background tick, armed only while the tab is hidden, the page unmuted and the context running.
    const hiddenTick = () => {
      timer = 0;
      if (!ready || muted || !document.hidden || ctx.state !== "running") return;
      sequence();
      timer = setTimeout(hiddenTick, HIDDEN_TICK_MS);
    };

    const init = () => {
      ctx = new AudioContext();
      stats.contexts++;
      music = gain(musicLevel(0), musicChannel.node(ctx));
      room = gain(muted ? 0 : ROOM, roomChannel.node(ctx));
      buffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      for (let i = 0; i < TONES; i++) {
        const pan = panner(music), g = gain(0, pan), f = filter("lowpass", 4000, 0.7, g), bass = i < BASS_TONES;
        (bass ? triangles : sines).push({ osc: osc(bass ? "triangle" : "sine", 220, f), filter: f, gain: g, pan, until: 0 });
      }
      for (let i = 0; i < ROOM_TONES; i++) {
        const pan = panner(room), g = gain(0, pan), f = filter("lowpass", 4000, 0.7, g), sine = i < ROOM_SINES;
        (sine ? roomSines : roomTriangles).push({ osc: osc(sine ? "sine" : "triangle", 220, f), filter: f, gain: g, pan, until: 0 });
      }
      for (let i = 0; i < NOISES; i++) {
        const pan = panner(room), g = gain(0, pan), f = filter("bandpass", 1000, 1, g);
        noises.push({ src: hissOf(f), filter: f, gain: g, pan, until: 0 });
      }
      for (let i = 0; i < BRUSHES; i++) {
        const pan = panner(music), g = gain(0, pan), f = filter("bandpass", SWISH_HZ, 1, g);
        brushes.push({ src: hissOf(f), filter: f, gain: g, pan, until: 0 });
      }
      bed.level = gain(BED_FLOOR, room);
      bed.gain = gain(BED_LEVEL, bed.level);
      bed.src = hissOf(filter("bandpass", BED_HZ, BED_Q, bed.gain));
      bed.depth = gain(BED_DEPTH, bed.gain.gain);
      bed.wobble = osc("sine", BED_WOBBLE, bed.depth);
      stats.tones = triangles.length + sines.length;
      stats.roomTones = roomSines.length + roomTriangles.length;
      stats.noises = noises.length;
      stats.brushes = brushes.length;
      startSong(0, ctx.currentTime + LEAD);
      stats.open = ready = true;
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
    // Clears the background tick and arms it again when it should run.
    const rearm = () => {
      if (timer) clearTimeout(timer);
      timer = 0;
      hiddenTick();
    };
    const onVisibility = () => {
      if (ready && !document.hidden && ctx.state === "suspended") ctx.resume().catch(() => {});
      rearm();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // The first voice of `pool` free by `at` from `from` on, or that one when none is. Judged at the note's time, since
    // the music schedules ahead and a voice may hold a later note than now.
    const pick = (pool, from, at) => {
      for (let i = 0; i < pool.length; i++) {
        const v = pool[(from + i) % pool.length];
        if (v.until <= at) return v;
      }
      return pool[from % pool.length];
    };
    const triangleVoice = (at) => pick(triangles, triangleNext = (triangleNext + 1) % triangles.length, at);
    const sineVoice = (at) => pick(sines, sineNext = (sineNext + 1) % sines.length, at);
    const noiseVoice = (at) => pick(noises, noiseNext = (noiseNext + 1) % NOISES, at);
    // A voice's gain from `at`: up to `level` over `attack` and away by `dur`, held at `pan`; returns when the note
    // starts. Only what the voice holds from `at` on is cancelled, so its earlier notes stay. A voice still holding a
    // note at `at` (stolen, counted in `stats.steals`) is held there and faded first, so its gain never drops in one
    // step, and its pitch and filter automation from `at` on is cancelled, so the new note inherits no ramp.
    const env = (v, at, level, attack, dur, pan) => {
      const g = v.gain.gain;
      let t = at;
      if (v.until > at) {
        stats.steals++;
        if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(at); else g.cancelScheduledValues(at);
        g.setTargetAtTime(0.0001, at, STEAL_FADE);
        if (v.osc) v.osc.frequency.cancelScheduledValues(at);
        v.filter.frequency.cancelScheduledValues(at);
        t = at + STEAL_GAP;
      } else g.cancelScheduledValues(at);
      g.setValueAtTime(0.0001, t);
      g.exponentialRampToValueAtTime(Math.max(0.0002, level), t + attack);
      g.exponentialRampToValueAtTime(0.0001, t + dur);
      v.pan.pan.setValueAtTime(pan, t);
      v.until = t + dur + 0.02;
      return t;
    };

    // Where (x, z) is from the visitor, into AT: its level, half at `CUE_REF` metres, and its side of the view, on
    // factory-audio.js's rule. Returns the distance.
    const place = (x, z) => {
      const dx = x - EAR.x, dz = z - EAR.z, flat = Math.hypot(dx, dz), r = flat / CUE_REF;
      AT.level = 1 / (1 + r * r);
      AT.pan = flat > 0.5 ? Math.max(-1, Math.min(1, (dx * -EAR.fz + dz * EAR.fx) / flat)) * CUE_PAN * Math.min(1, flat / 3) : 0;
      return flat;
    };
    // The first voice of `pool` free now from `from` on, or null. A voice the music has scheduled a note on is busy
    // until that note ends, so a cue never takes one.
    const free = (pool, from, now) => {
      for (let i = 0; i < pool.length; i++) {
        const v = pool[(from + i) % pool.length];
        if (v.until <= now) return v;
      }
      return null;
    };
    // `count` taps `gap` apart on the free voice `v` from `now`, each up to `level` and away by `dur`, where AT says.
    const taps = (v, count, gap, level, dur, now) => {
      const g = v.gain.gain, peak = Math.max(0.0002, level * AT.level);
      g.cancelScheduledValues(now);
      for (let i = 0; i < count; i++) {
        const t = now + i * gap;
        g.setValueAtTime(0.0001, t);
        g.exponentialRampToValueAtTime(peak, t + 0.002);
        g.exponentialRampToValueAtTime(0.0001, t + dur);
      }
      v.pan.pan.setValueAtTime(AT.pan, now);
      v.until = now + (count - 1) * gap + dur + 0.02;
    };
    const cue = (name, x, z) => {
      const kind = CUE_KINDS[name];
      if (kind === undefined) throw new Error("poker-audio: unknown cue " + name);
      stats.cues++;
      // `dropped` counts cues unheard for distance (or before the context opens), `busy` those with no voice free.
      if (!ready || place(x, z) > CUE_FAR) { stats.dropped++; return; }
      const now = ctx.currentTime;
      const v = kind === "noise" ? free(noises, noiseNext = (noiseNext + 1) % NOISES, now)
        : kind === "sine" ? free(roomSines, roomSineNext = (roomSineNext + 1) % ROOM_SINES, now)
        : free(roomTriangles, roomTriangleNext = (roomTriangleNext + 1) % roomTriangles.length, now);
      if (v === null) { stats.busy++; return; }
      if (kind === "noise") {
        const chip = name === "chip";
        v.filter.frequency.setValueAtTime(chip ? CHIP_HZ : HEEL_HZ, now);
        taps(v, chip ? 2 : 1, CHIP_GAP, chip ? CHIP_LEVEL : HEEL_LEVEL, chip ? CHIP_DUR : HEEL_DUR, now);
      } else if (kind === "sine") {
        v.osc.frequency.setValueAtTime(GLASS_HZ, now);
        v.osc.frequency.exponentialRampToValueAtTime(GLASS_TO, now + GLASS_DUR);
        v.filter.frequency.setValueAtTime(GLASS_CUT, now);
        taps(v, 1, 0, GLASS_LEVEL, GLASS_DUR, now);
      } else {
        const walker = name === "walker";
        v.osc.frequency.setValueAtTime(CANE_HZ, now);
        v.filter.frequency.setValueAtTime(CANE_CUT, now);
        taps(v, walker ? 2 : 1, WALKER_GAP, walker ? CANE_LEVEL * WALKER_LEVEL : CANE_LEVEL, CANE_DUR, now);
      }
    };

    const setTheme = (id) => {
      hasBar = id === "gatsby";
      bedWait = 0;
    };

    // The bed follows the nearest table or, in Banana Club, the nearer edge of the bar.
    const bedLevel = () => {
      let d2 = Infinity;
      if (hasBar) for (let i = 0; i < wings.length; i++) {
        const w = wings[i], dx = Math.max(0, Math.abs(EAR.x - w.x) - w.hx), dz = Math.max(0, Math.abs(EAR.z - w.z) - w.hz);
        d2 = Math.min(d2, dx * dx + dz * dz);
      }
      for (let i = 0; i < tables.length; i++) {
        const dx = EAR.x - tables[i].x, dz = EAR.z - tables[i].z;
        d2 = Math.min(d2, dx * dx + dz * dz);
      }
      bed.level.gain.setTargetAtTime(BED_FLOOR + BED_NEAR / (1 + d2 / (BED_REF * BED_REF)), ctx.currentTime, BED_EASE / 3);
    };

    const update = (dt, ear) => {
      EAR.x = ear.x; EAR.z = ear.z; EAR.fx = ear.fx; EAR.fz = ear.fz;
      activate();
      if (!ready) return;
      sequence();
      if ((bedWait -= dt) <= 0) {
        bedWait = BED_EVERY;
        bedLevel();
      }
      if ((chipWait -= dt) <= 0) {
        chipWait = between(CHIP_MIN, CHIP_MAX);
        const t = tables[Math.random() * tables.length | 0];
        cue("chip", t.x, t.z);
      }
      if (hasBar && (glassWait -= dt) <= 0) {
        glassWait = between(GLASS_MIN, GLASS_MAX);
        const w = wings[Math.random() * wings.length | 0];
        cue("glass", w.x + (Math.random() * 2 - 1) * w.hx, w.z);
      }
    };
    // The music bus's level at context time `at`: none while muted, else its level under the duck holding then.
    const musicLevel = (at) => muted ? 0 : MUSIC * (at < winUntil ? WON : seated ? SEATED : 1);
    // Eases the music bus to its level now, to within 5% over `ease`, and schedules a win's return when one holds, so
    // the ducks and the mute compose and nothing waits on a timer.
    const duck = (ease) => {
      const now = ctx.currentTime, g = music.gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(musicLevel(now), now, ease / 3);
      if (!muted && winUntil > now) g.setTargetAtTime(musicLevel(winUntil), winUntil, SEAT_EASE / 3);
    };
    const setSeated = (on) => {
      if (seated === !!on) return;
      seated = !!on;
      if (ready) duck(SEAT_EASE);
    };
    // Every mark is counted; before the context opens there is nothing to dip.
    const win = () => {
      stats.hands++;
      if (!ready) return;
      winUntil = ctx.currentTime + WIN_HOLD;
      duck(WIN_EASE);
    };

    const setMuted = (value) => {
      muted = !!value;
      if (ready) {
        duck(0.15);
        room.gain.setTargetAtTime(muted ? 0 : ROOM, ctx.currentTime, 0.05);
        rearm();
      } else if (!muted) activate();
    };
    const offSound = BL.sound.subscribe(setMuted);

    const dispose = () => {
      offSound(); musicChannel.release(); roomChannel.release();
      disposed = true;
      window.removeEventListener("pointerdown", activate, true);
      window.removeEventListener("keydown", activate, true);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
      timer = 0;
      if (ctx) ctx.close().catch(() => {});
      ctx = buffer = music = room = null;
      stats.open = ready = false;
      triangles.length = sines.length = noises.length = brushes.length = roomSines.length = roomTriangles.length = 0;
      for (const key of Object.keys(bed)) bed[key] = null;
    };

    // `pools`, the voice pools by name, live, for tests and debugging to inspect.
    const pools = Object.freeze({ triangles, sines, noises, brushes, roomSines, roomTriangles });
    return { update, cue, setTheme, setSeated, win, dispose, stats, pools };
  };

  BL.pokerAudio = { create, SONGS, CHORDS, TONES, BASS_TONES, ROOM_TONES, NOISES, BRUSHES };
})();
