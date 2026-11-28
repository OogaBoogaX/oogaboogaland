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
//
// The lounge's playlist: four recordings by Kevin MacLeod (CC BY 4.0, CREDITS.md), each its own deferred group,
// `lounge-track-<key>` (lounge-track-*.js; each key listed in deferred.js's `PRESENT` too, or its fetch throws), the one
// exception here to synthesized sound. Hosted descriptors point to same-origin streaming media. Lobby Time opens the visit, then the other three play shuffled; a new round never opens on
// the track just heard (ghost-audio.js's `advance` and `shuffle`). The portable path holds at most one decoded track (a decoded
// track is 68 to 158 MB), so there is no crossfade between two recordings: a track fades in over `XFADE`, fades out
// over its own reverb tail (`tail` plus `TAIL_PAD`) to its last sample, and is released; only then is the next decoded,
// and it fades in. The synthesized music above is the fallback and fills every gap: it plays from the first gesture
// until a track is ready, fades down as one comes in and up as one goes out, all on the context's clock, and carries
// on for the visit when a track fails to decode (the browser cannot play the format) or every track fails to load (a
// track that fails to load is skipped). The first track's group is
// fetched at `create` (the room is entered), the next one's `PREFETCH` seconds before the current track ends; nothing
// is decoded before the context opens. Each track plays through its own gain (its loudness `trim`) into the music bus,
// so the ducks, the mute and the shared Music channel apply to it as to the synth. `nowPlaying` names the track
// playing (null while the synth plays alone), `credits` holds the four attribution lines, `stats.playlist` the state.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // The tone voices are fixed at init, never retyped: `BASS_TONES` triangles and the rest sines.
  const TONES = 10, BASS_TONES = 4, NOISES = 5, NOISE_SECONDS = 2;
  // The room's own tone voices for the cues, on the room bus: sines.
  const ROOM_TONES = 2;
  // The two buses' levels under their channels.
  const MUSIC = 0.16, ROOM = 0.22;
  // The music's ducks, as factors of its level: `SEATED` in a table's panel, eased over `SEAT_EASE` seconds; `WON` for
  // `WIN_HOLD` seconds after a hand is won, dipped over `WIN_EASE` and back over `SEAT_EASE`.
  const SEATED = 0.45, WON = 0.25, WIN_HOLD = 1.5, SEAT_EASE = 0.6, WIN_EASE = 0.15;
  // The bed: a bandpass at `BED_HZ`, its gain at `BED_LEVEL` swinging `BED_DEPTH` either way at `BED_WOBBLE` hertz.
  const BED_HZ = 420, BED_Q = 0.7, BED_LEVEL = 0.1, BED_DEPTH = 0.03, BED_WOBBLE = 0.13;
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
  // The gaming tables' cues (poker-games.js), on the same noise voices: the ball's rattle round the wheel and its drop
  // into a pocket, the dice on the felt, and the crowd's roar and murmur round a table, each `[band Hz, taps, gap, length,
  // level, attack]`, all well under the chips' level, so they sit low under the music.
  const GAME_CUES = Object.freeze({ wood: [1050, 1, 0, 0.055, 0.34, 0.002], rattle: [3400, 3, 0.07, 0.025, 0.2, 0.002], drop: [2600, 2, 0.05, 0.03, 0.28, 0.002], dice: [1500, 2, 0.04, 0.04, 0.28, 0.002],
    roar: [750, 1, 0, 0.7, 0.12, 0.08], murmur: [480, 1, 0, 0.8, 0.07, 0.15] });
  // Which pool each cue plays on.
  const CUE_KINDS = Object.freeze({ wood: "noise", chip: "noise", heel: "noise", glass: "sine", bird: "sine", rattle: "noise", drop: "noise", dice: "noise", roar: "noise", murmur: "noise" });
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

  // The playlist. Each track's `trim` brings it to about -23 dBFS RMS (measured, a starting point for the ear) and its
  // `tail` is its closing reverb in seconds. `TRACK_LEVEL` scales every trim against the synth under the one bus. A
  // track starts `TRACK_LEAD` after it is ready, fades in over `XFADE` as the synth fades down over the same, and fades
  // out over `tail + TAIL_PAD` to its end as the synth comes back up. The next group is fetched `PREFETCH` before the end.
  const TRACK_LEVEL = 1.85, TRACK_LEAD = 0.1, XFADE = 3, TAIL_PAD = 1, PREFETCH = 20;
  const MACLEOD = "Kevin MacLeod (incompetech.com)", LICENCE = "CC BY 4.0", LICENCE_URL = "https://creativecommons.org/licenses/by/4.0/";
  const track = (key, title, trim, tail) => Object.freeze({ key, title, by: MACLEOD, licence: LICENCE, url: LICENCE_URL, trim, tail });
  const TRACKS = Object.freeze([
    track("lobby", "Lobby Time", 0.575, 3.6),
    track("cool", "Cool Vibes", 2.38, 4.9),
    track("venus", "Vibing Over Venus", 0.955, 2.4),
    track("bossa", "Bossa Antigua", 1.03, 2.0),
  ]);
  // What `nowPlaying` returns, one frozen record a track.
  const NOW = Object.freeze(TRACKS.map(t => Object.freeze({ key: t.key, title: t.title, by: t.by, licence: t.licence, url: t.url })));
  // The attribution lines, as CREDITS.md and each track file's header give them.
  const CREDITS = Object.freeze(TRACKS.map(t => `"${t.title}" ${t.by}\nLicensed under Creative Commons: By Attribution 4.0\n${t.url}`));
  // The playlist's states: waiting for a track's bytes or the context, decoding it, playing it (fade-out included).
  const WAIT = 0, DECODE = 1, PLAY = 2;
  const bytesOf = (k) => BL.loungeMusic && BL.loungeMusic[TRACKS[k].key];
  // ghost-audio.js's decode: the base64 into bytes, then the context's decoder, which sniffs the container.
  const decode = (ctx, base64) => {
    if (Uint8Array.fromBase64) return ctx.decodeAudioData(Uint8Array.fromBase64(base64).buffer);
    const raw = atob(base64), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return ctx.decodeAudioData(bytes.buffer);
  };

  const create = (engineBank = null) => {
    let ctx = null, buffer = null, music = null, synth = null, fade = null, room = null, ready = false, muted = BL.sound.muted, disposed = false;
    // The playlist: the order and where in it the next track stands (`slot`), the tracks failed this visit, the state,
    // the track being fetched or played (-1 for none) and the one heard last, the one decoded buffer held and
    // its source, the decode in flight (`token`), and the playing track's times on the context's clock. `trims` are
    // the tracks' own gains, built at init.
    const order = TRACKS.map((_, i) => i), failed = new Uint8Array(TRACKS.length), trims = [];
    let slot = 0, state = WAIT, fetching = -1, playing = -1, heard = -1, held = null, source = null, token = 0;
    let media = null, nextMedia = null, mediaFetch = null;
    let fadeAt = 0, endAt = 0, prefetchAt = 0, prefetched = false;
    // `off`: a decode failed, so this browser cannot play the tracks' format and the playlist stops for the visit.
    const playlist = { loaded: [], decoding: null, playing: null, failed: [], fallback: true, held: 0, played: 0, off: false };
    let doorGain, doorFilter, doorPan, lastDistance = -1, lastPan = -2, bellPass = 1;
    const musicChannel = BL.sound.channel("music"), roomChannel = BL.sound.channel("room");
    const triangles = [], sines = [], noises = [], brushes = [], roomSines = [], bed = {};
    const motors = [];
    let exhaust = null, hearthWait = 0;
    let wingBuffer=null,flutter=null,nextFlutter=0;
    const stopFlutter=()=>{
      if(!flutter)return;
      const {src,volume,pan}=flutter;
      flutter=null;nextFlutter=0;
      volume.gain.setTargetAtTime(0,ctx.currentTime,.018);
      src.onended=()=>{src.disconnect();volume.disconnect();pan.disconnect();};
      src.stop(ctx.currentTime+.10);
    };
    const wingbeats=(bird,origin,earY)=>{
      if(!ready || muted || document.hidden || !bird?.wingHz){stopFlutter();return;}
      const now=ctx.currentTime;
      if(now<nextFlutter)return;
      nextFlutter=now+.05;
      const p=bird.position,flat=place(origin.x+p.x,origin.z+p.z);
      const distance=Math.hypot(flat,origin.y+p.y-earY);
      if(distance>=3.4){stopFlutter();return;}
      if(!flutter){
        if(!wingBuffer){
          // One seamless second of downstrokes and softer upstrokes. A little
          // filtered air on each stroke gives the close pass its feathery edge.
          wingBuffer=ctx.createBuffer(1,16000,16000);
          const out=wingBuffer.getChannelData(0),noise=buffer.getChannelData(0);
          let air=0;
          for(let i=0;i<out.length;i++){
            const phase=2*Math.PI*47*i/out.length,c=Math.cos(phase);
            const stroke=Math.max(0,c)**5+.42*Math.max(0,-c)**7;
            air+=.24*(noise[i%noise.length]-air);
            out[i]=.30*Math.sin(phase)+.15*Math.sin(2*phase)+stroke*(.24*Math.sin(5*phase)+air*.8);
          }
        }
        const pan=panner(room),volume=gain(0,pan),src=ctx.createBufferSource();
        src.buffer=wingBuffer;src.loop=true;src.connect(volume);src.start();
        flutter={pan,volume,src};
      }
      flutter.src.playbackRate.setTargetAtTime(bird.wingHz/47,now,.035);
      flutter.pan.pan.setTargetAtTime(AT.pan,now,.05);
      flutter.volume.gain.setTargetAtTime(.82*(1-distance/3.4)**2,now,.045);
    };
    // A two-second crank revolution shared by all five motors. The slow beat carries
    // indoors. A dry bearing knock on each dead centre and steam after the stroke
    // emerge as the listener approaches. Harmonics meet at the loop boundary.
    const startEngines = time => {
      const length = Math.round(ctx.sampleRate * 2), loop = ctx.createBuffer(1, length, ctx.sampleRate);
      const samples = loop.getChannelData(0), noise = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        const f = i / length, turn = f * Math.PI * 2, stroke = (f * 2) % 1;
        const ring = Math.exp(-stroke * 37), valve = Math.max(0, Math.sin(Math.PI * (stroke - .13) / .42));
        const knock = ring * (Math.sin(137 * turn) + .42 * Math.sin(369 * turn));
        const steam = stroke < .55 ? noise[i % noise.length] * valve * valve : 0;
        samples[i] = .25 * Math.sin(109 * turn) * (.65 + .35 * Math.cos(2 * turn))
          + .13 * Math.sin(218 * turn) + .38 * knock + .32 * steam;
      }
      for (const source of engineBank.sources) {
        const pan = panner(room), volume = gain(0, pan), tone = filter("lowpass", 400, .7, volume);
        const src = ctx.createBufferSource();
        src.buffer = loop; src.loop = true;
        src.playbackRate.value = source.speed / Math.PI;
        src.connect(tone);
        src.start(ctx.currentTime, ((source.speed * time + source.phase) / Math.PI) % 2);
        motors.push({ source, pan, volume, tone, src });
      }
      const finalMotor = motors[motors.length - 1];
      exhaust = gain(0, finalMotor.tone);
      hissOf(filter("bandpass", 1380, .68, exhaust));
    };
    const spatialEngines = (time, age, ear) => {
      if (!motors.length) startEngines(time);
      const outside = Math.max(0, Math.min(1, (ear.x - 24) / 7));
      const now = ctx.currentTime;
      for (const motor of motors) {
        const distance = place(motor.source.x, motor.source.z);
        const near = 1 / (1 + (distance / 38) ** 2);
        motor.pan.pan.setTargetAtTime(AT.pan, now, .06);
        motor.volume.gain.setTargetAtTime((.085 + .63 * outside) * near, now, .08);
        motor.tone.frequency.setTargetAtTime(180 + (180 + outside * 6100) * near, now, .08);
      }
      exhaust.gain.setTargetAtTime(engineBank.ventLevel(age) * 1.6, now, .07);
    };
    let roomSineNext = 0;
    // Whether the visitor is in a table's panel, and the context time a win's dip ends.
    let seated = false, winUntil = 0;
    let triangleNext = 0, sineNext = 0, noiseNext = 0, brushNext = 0;
    // The sequencer: the tune playing, its step length and length in steps, the context time it started (`origin`) and
    // the next step to schedule. The generator's state, the chorus and bar it last drew for, and that bar's four draws.
    let song = SONGS[0], songIndex = 0, stepSeconds = 1, tuneSteps = 0, origin = 0, next = 0, timer = 0;
    let rngState = 0, rngChorus = -1, rngBar = -1;
    const draws = new Float64Array(4);
    const stats = { open: false, contexts: 0, hands: 0, blockChimes: 0, tones: 0, noises: 0, brushes: 0, song: null, bar: 0, step: 0, scheduled: 0, cues: 0, dropped: 0, busy: 0, steals: 0, roomTones: 0, playlist };
    // Where the visitor hears from, copied from `update`'s `ear`; where the cue being placed sits from there (`AT`); the
    // bar's two wings and the tables, read once; and the countdowns to the bed's next level and the room's next cues.
    const EAR = { x: 0, z: 0, fx: 0, fz: 1 }, AT = { level: 0, pan: 0 };
    const tables = BL.pokerModels.TABLES, wings = BL.pokerModels.FURNITURE.filter(f => f.kind === "bar");
    const between = (lo, hi) => lo + Math.random() * (hi - lo);
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
      step();
      timer = setTimeout(hiddenTick, HIDDEN_TICK_MS);
    };

    const init = () => {
      ctx = new AudioContext();
      stats.contexts++;
      doorPan = panner(musicChannel.node(ctx));
      doorFilter = filter("lowpass", Math.min(22000, ctx.sampleRate * 0.49), 0.707, doorPan);
      doorGain = gain(1, doorFilter);
      music = gain(musicLevel(0), doorGain);
      // The synth's level under the bus (1, or 0 while a track plays) and the playlist's fade, each track's trim into it.
      synth = gain(1, music);
      fade = gain(0, music);
      for (let i = 0; i < TRACKS.length; i++) trims.push(gain(TRACKS[i].trim * TRACK_LEVEL, fade));
      room = gain(muted ? 0 : ROOM, roomChannel.node(ctx));
      buffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      for (let i = 0; i < TONES; i++) {
        const pan = panner(synth), g = gain(0, pan), f = filter("lowpass", 4000, 0.7, g), bass = i < BASS_TONES;
        (bass ? triangles : sines).push({ osc: osc(bass ? "triangle" : "sine", 220, f), filter: f, gain: g, pan, until: 0 });
      }
      for (let i = 0; i < ROOM_TONES; i++) {
        const pan = panner(room), gate = gain(1,pan), g = gain(0,gate), f = filter("lowpass", 4000, 0.7, g);
        roomSines.push({ osc: osc("sine", 220, f), filter: f, gain: g, pan, gate, bell: false, until: 0 });
      }
      for (let i = 0; i < NOISES; i++) {
        const pan = panner(room), g = gain(0, pan), f = filter("bandpass", 1000, 1, g);
        noises.push({ src: hissOf(f), filter: f, gain: g, pan, until: 0 });
      }
      for (let i = 0; i < BRUSHES; i++) {
        const pan = panner(synth), g = gain(0, pan), f = filter("bandpass", SWISH_HZ, 1, g);
        brushes.push({ src: hissOf(f), filter: f, gain: g, pan, until: 0 });
      }
      bed.level = gain(BED_FLOOR, room);
      bed.gain = gain(BED_LEVEL, bed.level);
      bed.src = hissOf(filter("bandpass", BED_HZ, BED_Q, bed.gain));
      bed.depth = gain(BED_DEPTH, bed.gain.gain);
      bed.wobble = osc("sine", BED_WOBBLE, bed.depth);
      stats.tones = triangles.length + sines.length;
      stats.roomTones = roomSines.length;
      stats.noises = noises.length;
      stats.brushes = brushes.length;
      startSong(0, ctx.currentTime + LEAD);
      stats.open = ready = true;
      want();
    };

    // On to the next track, a new order once the list has been through, never opening on the one heard last.
    const advance = () => {
      if (++slot === order.length) shuffle(heard);
    };
    const shuffle = (last) => {
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; }
      if (order.length > 1 && order[0] === last) { const t = order[0]; order[0] = order[1]; order[1] = t; }
      slot = 0;
    };
    // The next track not failed this visit, moving `slot` past failed ones (`nextTrack`), or -1 when all have failed.
    const nextTrack = () => {
      for (let i = 0; i < 2 * order.length; i++) {
        const k = order[slot];
        if (!failed[k]) return k;
        advance();
      }
      return -1;
    };
    const fail = (k) => {
      if (failed[k]) return;
      failed[k] = 1;
      playlist.failed.push(TRACKS[k].key);
    };
    const prebuffer = k => {
      const url = bytesOf(k);
      if (nextMedia || !url || !url.startsWith("/audio/")) return;
      nextMedia = new Audio(); nextMedia.preload = "auto"; nextMedia.src = url;
    };
    // A track's group has answered: its bytes are here, or the track has failed.
    const arrived = (k) => {
      if (!bytesOf(k)) fail(k);
      else if (!playlist.loaded.includes(TRACKS[k].key)) playlist.loaded.push(TRACKS[k].key);
      if (state === PLAY && k === nextTrack()) prebuffer(k);
      want();
    };
    // Asks for a track's group once (same-origin, or present already: the portable page answers null at once). A
    // failed fetch (a network error) skips only that track for the visit.
    const fetchTrack = (k) => {
      if (fetching === k) return;
      fetching = k;
      const loading = BL.deferred.load(`lounge-track-${TRACKS[k].key}`);
      if (loading === null) { fetching = -1; arrived(k); return; }
      loading.then(() => { if (fetching === k) fetching = -1; if (!disposed) arrived(k); },
        () => { if (fetching === k) fetching = -1; if (!disposed) { fail(k); want(); } });
    };
    // A full recording stays in the browser's media pipeline. The element uses the same trim, fade and ducking
    // bus as the portable buffer. Its playback clock stops during buffering and its ended event advances the order.
    const clearMedia = () => {
      if (!media) return;
      media.onended = media.onerror = media.onwaiting = media.onplaying = null;
      media.pause(); media.removeAttribute("src"); media.load();
      media = null;
      source?.disconnect(); source = null;
    };
    const mixStream = (k, stalled) => {
      if (!media || !Number.isFinite(media.duration)) return;
      const now = ctx.currentTime, left = media.duration - media.currentTime;
      const tail = TRACKS[k].tail + TAIL_PAD;
      const level = stalled ? 0 : Math.min(1, media.currentTime / XFADE, Math.max(0,left / tail));
      fade.gain.cancelScheduledValues(now); synth.gain.cancelScheduledValues(now);
      fade.gain.setTargetAtTime(level, now, .04); synth.gain.setTargetAtTime(1-level, now, .04);
      if (!stalled && left > 0) {
        const rise = Math.max(0, XFADE - media.currentTime);
        if (left > tail) {
          fade.gain.linearRampToValueAtTime(1, now + rise + .05);
          synth.gain.linearRampToValueAtTime(0, now + rise + .05);
          fade.gain.setValueAtTime(1, now + left - tail); synth.gain.setValueAtTime(0, now + left - tail);
        }
        fade.gain.linearRampToValueAtTime(0, now + left); synth.gain.linearRampToValueAtTime(1, now + left);
      }
    };
    const playStream = (k, url, mine) => {
      const player = media = nextMedia || new Audio();
      nextMedia = null;
      const current = () => !disposed && mine === token && media === player;
      const failedStream = () => {
        if (!current()) return;
        clearMedia(); playlist.decoding = playlist.playing = null; playlist.fallback = true;
        fade.gain.cancelScheduledValues(ctx.currentTime); synth.gain.cancelScheduledValues(ctx.currentTime);
        synth.gain.setTargetAtTime(1, ctx.currentTime, .05);
        state = WAIT; playing = -1; fail(k); want();
      };
      try {
        source = ctx.createMediaElementSource(player); source.connect(trims[k]);
        player.onerror = failedStream;
        player.onwaiting = () => { if (current()) mixStream(k,true); };
        player.onplaying = () => {
          if (!current()) return;
          if (state === DECODE) {
            playlist.decoding = null; playing = heard = k; playlist.playing = TRACKS[k].key;
            state = PLAY; playlist.played++; playlist.fallback = false; prefetched = false; advance();
          }
          mixStream(k,false);
        };
        player.onended = () => { if (current()) release(); };
        if (player.getAttribute("src") !== url) player.src = url;
        player.play().catch(async error => {
          if (!current()) return;
          if (error.name !== "NotAllowedError") { failedStream(); return; }
          // Some gesture policies allow the already-unlocked context but refuse a new media element.
          // Recover through the same decoded-buffer path as the portable page on those devices.
          player.onerror = player.onplaying = player.onwaiting = player.onended = null;
          mediaFetch = new AbortController();
          try {
            const response = await fetch(url, { signal: mediaFetch.signal });
            if (!response.ok) throw new Error("Recording unavailable");
            const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
            if (!current()) return;
            clearMedia(); held = decoded; playlist.held = 1; playlist.decoding = null; begin(k);
          } catch { failedStream(); }
          finally { if (mine === token) mediaFetch = null; }
        });
      } catch { failedStream(); }
    };
    // Hosted descriptors start a media stream. Portable recordings are decoded after the context opens.
    const want = () => {
      if (disposed || playlist.off || state !== WAIT) return;
      const k = nextTrack();
      if (k < 0) return;
      if (!bytesOf(k)) { fetchTrack(k); return; }
      if (!ready) return;
      state = DECODE;
      playlist.decoding = TRACKS[k].key;
      const mine = ++token;
      if (bytesOf(k).startsWith("/audio/")) { playStream(k, bytesOf(k), mine); return; }
      // A decode that throws or rejects means this browser cannot play the format every track shares (no AAC): the
      // playlist stops quietly for the visit, fetching nothing more, and the synth plays on. One that lands after
      // `dispose`, or after another took its place, is dropped.
      Promise.resolve(ctx).then(c => decode(c, bytesOf(k))).then((b) => {
        if (disposed || mine !== token) return;
        playlist.decoding = null;
        held = b;
        playlist.held = 1;
        begin(k);
      }, () => {
        if (disposed || mine !== token) return;
        playlist.decoding = null;
        state = WAIT;
        fail(k);
        playlist.off = true;
      });
    };
    // A gain's path for a track: `from` at `t0`, to `to` over XFADE, held to `fadeAt`, back to `from` at `end`.
    const ramp = (p, now, from, to, t0, end) => {
      p.cancelScheduledValues(now);
      p.setValueAtTime(from, t0);
      p.linearRampToValueAtTime(to, t0 + XFADE);
      p.setValueAtTime(to, fadeAt);
      p.linearRampToValueAtTime(from, end);
    };
    // The decoded track `k` plays from its top: up as the synth goes down, down over its tail as the synth comes back.
    const begin = (k) => {
      const now = ctx.currentTime, t0 = now + TRACK_LEAD, t = TRACKS[k];
      endAt = t0 + held.duration;
      fadeAt = Math.max(t0 + XFADE, endAt - t.tail - TAIL_PAD);
      prefetchAt = endAt - PREFETCH;
      prefetched = false;
      source = ctx.createBufferSource();
      source.buffer = held;
      source.connect(trims[k]);
      source.start(t0);
      ramp(fade.gain, now, 0, 1, t0, endAt);
      ramp(synth.gain, now, 1, 0, t0, endAt);
      state = PLAY;
      playing = heard = k;
      playlist.playing = t.key;
      playlist.played++;
      playlist.fallback = false;
      advance();
    };
    // The track has played out: its source and buffer let go, then the next is asked for.
    const release = () => {
      clearMedia();
      if (source) {
        try { source.stop(); } catch { /* already ended */ }
        source.disconnect();
      }
      source = held = null;
      playlist.held = 0;
      playing = -1;
      playlist.playing = null;
      playlist.fallback = true;
      state = WAIT;
      want();
    };
    // Once a frame (and on the hidden tick): the next group fetched near the end, the track let go at its end.
    const step = () => {
      if (state !== PLAY) return;
      const now = ctx.currentTime;
      if (!prefetched && !playlist.off && (media ? media.duration - media.currentTime <= PREFETCH : now >= prefetchAt)) {
        prefetched = true;
        const k = nextTrack();
        if (k >= 0) { if (!bytesOf(k)) fetchTrack(k); else prebuffer(k); }
      }
      if (!media && now >= endAt) release();
    };

    // Only from a gesture the browser has already counted, so nothing warns in the console; a gesture also wakes a
    // context the browser started suspended.
    let resuming = null;
    const wake = (event) => {
      // An autoplay-blocked resume may stay pending. Let a real gesture unlock it while frames share the request.
      if (ctx.state !== "suspended" || (resuming && !event?.isTrusted)) return;
      const request = resuming = ctx.resume();
      const settled = () => { if (resuming === request) resuming = null; };
      request.then(settled, settled);
    };
    const activate = (event) => {
      if (disposed) return;
      if (!ready) {
        if (muted || typeof AudioContext === "undefined" || navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
        init();
      }
      wake(event);
    };
    window.addEventListener("pointerdown", activate, true);
    window.addEventListener("pointerup", activate, true);
    window.addEventListener("keydown", activate, true);
    // Clears the background tick and arms it again when it should run.
    const rearm = () => {
      if (timer) clearTimeout(timer);
      timer = 0;
      hiddenTick();
    };
    const onVisibility = () => {
      if (ready && !document.hidden) { wake(); bedWait = 0; }
      if (ready && document.hidden) {
        stopFlutter();
        for (const motor of motors) motor.volume.gain.setTargetAtTime(0, ctx.currentTime, .05);
      }
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
    const taps = (v, count, gap, level, dur, now, attack = 0.002) => {
      if (v.bell) { v.gate.gain.setValueAtTime(1,now); v.bell=false; }
      const g = v.gain.gain, peak = Math.max(0.0002, level * AT.level);
      g.cancelScheduledValues(now);
      for (let i = 0; i < count; i++) {
        const t = now + i * gap;
        g.setValueAtTime(0.0001, t);
        g.exponentialRampToValueAtTime(peak, t + attack);
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
        : free(roomSines, roomSineNext = (roomSineNext + 1) % ROOM_TONES, now);
      if (v === null) { stats.busy++; return; }
      const game = GAME_CUES[name];
      if (game) {
        v.filter.frequency.setValueAtTime(game[0], now);
        taps(v, game[1], game[2], game[4], game[3], now, game[5]);
      } else if (name === "bird") {
        const pitch=between(1920,2590),gap=between(.13,.18),dur=between(.074,.11);
        const count=Math.random()<.55?2:1;
        v.filter.frequency.setValueAtTime(5600,now);
        for(let i=0;i<count;i++){
          const t=now+i*gap;
          v.osc.frequency.setValueAtTime(pitch*(i?1.28:.89),t);
          v.osc.frequency.exponentialRampToValueAtTime(pitch*(i?1.41:1.57),t+dur*.41);
          v.osc.frequency.exponentialRampToValueAtTime(pitch*(i?.80:1.13),t+dur);
        }
        taps(v,count,gap,.19,dur,now,.012);
      } else if (kind === "noise") {
        const chip = name === "chip";
        v.filter.frequency.setValueAtTime(chip ? CHIP_HZ : HEEL_HZ, now);
        taps(v, chip ? 2 : 1, CHIP_GAP, chip ? CHIP_LEVEL : HEEL_LEVEL, chip ? CHIP_DUR : HEEL_DUR, now);
      } else {
        v.osc.frequency.setValueAtTime(GLASS_HZ, now);
        v.osc.frequency.exponentialRampToValueAtTime(GLASS_TO, now + GLASS_DUR);
        v.filter.frequency.setValueAtTime(GLASS_CUT, now);
        taps(v, 1, 0, GLASS_LEVEL, GLASS_DUR, now);
      }
    };

    // A bell strike takes the two existing room oscillators. Its fundamental carries across the hall
    // and the shorter, inharmonic overtone gives the attack a brass edge. Both follow the room mute.
    const blockChime = (x,z) => {
      if (!ready) return;
      place(x,z);
      AT.level = 0.28 + 0.72*AT.level;
      const now = ctx.currentTime;
      roomSines.forEach((v,i) => {
        v.osc.frequency.cancelScheduledValues(now);
        v.osc.frequency.setValueAtTime(i ? 1327 : 587.33,now);
        v.filter.frequency.setValueAtTime(520+4580*bellPass,now);
        taps(v,1,0,i ? 0.17 : 0.38,i ? 0.85 : 2.2,now,0.007);
        v.bell=true; v.gate.gain.setValueAtTime(bellPass,now);
      });
      stats.blockChimes++;
    };

    const fanfare=()=>{
      if(!ready)return;
      const now=ctx.currentTime, stage=BL.pokerBandstand.floor;place(stage.x,stage.z);AT.level=.48+.52*AT.level;
      for(let i=0;i<roomSines.length;i++){
        const v=roomSines[i], mult=i?2:1;
        v.osc.frequency.cancelScheduledValues(now);
        v.filter.frequency.setValueAtTime(3300,now);
        for(let k=0;k<3;k++)v.osc.frequency.setValueAtTime([293.66,369.99,440][k]*mult,now+k*.27);
        taps(v,3,.27,i?.09:.19,.25,now,.035);
      }
    };
    // The bed follows the nearest table or the nearer edge of the bar.
    let lastBedLevel = BED_FLOOR;
    const bedLevel = (chapel) => {
      let d2 = Infinity;
      for (let i = 0; i < wings.length; i++) {
        const w = wings[i], dx = Math.max(0, Math.abs(EAR.x - w.x) - w.hx), dz = Math.max(0, Math.abs(EAR.z - w.z) - w.hz);
        d2 = Math.min(d2, dx * dx + dz * dz);
      }
      for (let i = 0; i < tables.length; i++) {
        const dx = EAR.x - tables[i].x, dz = EAR.z - tables[i].z;
        d2 = Math.min(d2, dx * dx + dz * dz);
      }
      const target = (1 - chapel) * (BED_FLOOR + BED_NEAR / (1 + d2 / (BED_REF * BED_REF)));
      if (target !== lastBedLevel) {
        bed.level.gain.setTargetAtTime(target, ctx.currentTime, BED_EASE / 3);
        lastBedLevel = target;
      }
    };

    const update = (dt, ear, time = 0, pressureAge = Infinity, chapel = 0, transmission = 1) => {
      EAR.x = ear.x; EAR.z = ear.z; EAR.fx = ear.fx; EAR.fz = ear.fz;
      activate();
      if (transmission !== bellPass) {
        bellPass=transmission;
        if (ready) for (const v of roomSines) if (v.bell && v.until>ctx.currentTime) {
          v.gate.gain.setTargetAtTime(bellPass,ctx.currentTime,.045);
          v.filter.frequency.setTargetAtTime(520+4580*bellPass,ctx.currentTime,.045);
        }
      }
      if (!ready) return;
      sequence();
      step();
      if ((bedWait -= dt) <= 0) {
        bedWait = BED_EVERY;
        bedLevel(chapel);
        if (engineBank && !document.hidden) spatialEngines(time, pressureAge, ear);
        // Outdoors, both the recording and the synth reach the ear from the open bay.
        const dx = 24.42 - ear.x, dz = -ear.z, dist = Math.hypot(dx, dz);
        // Across the wider deck the recording continues to recede toward the doorway, including in either wing.
        const reach = Math.max(0, Math.min(1, -dx / 2)) * dist;
        const panMix = Math.min(1, reach / 7);
        const outside = Math.max(2.4 * chapel, panMix + .4 * (1 - 1 / (1 + Math.max(0, reach - 8) / 12)));
        const pan = dist > 0 ? panMix * 0.9 * (-dx * ear.fz + dz * ear.fx) / dist : 0;
        if (Math.abs(outside - lastDistance) > 0.004 || outside !== lastDistance && (outside === 0 || outside === 1)) {
          doorGain.gain.setTargetAtTime(Math.pow(0.25, outside), ctx.currentTime, 0.09);
          const top = Math.min(22000, ctx.sampleRate * 0.49);
          doorFilter.frequency.setTargetAtTime(top * Math.pow(1600 / top, outside), ctx.currentTime, 0.09);
          lastDistance = outside;
        }
        if (Math.abs(pan - lastPan) > 0.008 || pan === 0 && lastPan !== 0) {
          doorPan.pan.setTargetAtTime(pan, ctx.currentTime, 0.09); lastPan = pan;
        }
      }
      // Small irregular wood pops use a free room voice and follow the room volume.
      if (chapel > 0 && !muted && !document.hidden && (hearthWait -= dt) <= 0) {
        hearthWait = between(.09,.43);
        const r = BL.pokerSalons.ROOMS[0], z = r.z-r.d/2+2;
        const distance = place(r.x,z), now = ctx.currentTime;
        const voice = free(noises,noiseNext,now);
        if (voice) {
          // The vaulted room carries a little of the fire all the way to its doorway.
          AT.level = chapel * (.19 + .81 / (1 + distance*distance/70));
          voice.filter.frequency.setValueAtTime(between(480,2900),now);
          taps(voice,1,0,between(.12,.4),between(.028,.18),now);
        }
      }
      if ((chipWait -= dt) <= 0) {
        chipWait = between(CHIP_MIN, CHIP_MAX);
        const t = tables[Math.random() * tables.length | 0];
        cue("chip", t.x, t.z);
      }
      if ((glassWait -= dt) <= 0) {
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
      window.removeEventListener("pointerup", activate, true);
      window.removeEventListener("keydown", activate, true);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
      timer = 0;
      // The playlist stops: its source and buffer let go, a decode or fetch still in flight dropped when it lands.
      token++;
      mediaFetch?.abort(); mediaFetch = null;
      if (nextMedia) { nextMedia.removeAttribute("src"); nextMedia.load(); nextMedia = null; }
      clearMedia();
      if (source) {
        try { source.stop(); } catch { /* already ended */ }
        source.disconnect();
      }
      source = held = null;
      trims.length = 0;
      state = WAIT;
      playing = fetching = -1;
      playlist.held = 0;
      playlist.decoding = playlist.playing = null;
      playlist.fallback = true;
      for (const motor of motors) { motor.src.stop(); motor.src.disconnect(); }
      stopFlutter();wingBuffer=null;
      motors.length = 0; exhaust = null;
      if (ctx) ctx.close().catch(() => {});
      ctx = buffer = music = synth = fade = room = null;
      stats.open = ready = false;
      triangles.length = sines.length = noises.length = brushes.length = roomSines.length = 0;
      for (const key of Object.keys(bed)) bed[key] = null;
    };

    // `pools`, the voice pools by name, live, for tests and debugging to inspect.
    const pools = Object.freeze({ triangles, sines, noises, brushes, roomSines });
    // Lobby Time opens each visit. Keep the other three in a fresh order, and shuffle whole rounds thereafter.
    shuffle(-1);
    const lobby = order.indexOf(0);
    [order[0], order[lobby]] = [order[lobby], order[0]];
    want();
    // Walking through the portal used a gesture in the previous scene. The room is built after that event;
    // waiting solely for a new keydown left returning or stationary visitors listening to silence.
    if (navigator.userActivation?.hasBeenActive) activate();
    return { update, cue, wingbeats, blockChime, fanfare, setSeated, win, dispose, stats, pools, credits: CREDITS,
      get nowPlaying() { return playing < 0 ? null : NOW[playing]; } };
  };

  BL.pokerAudio = { create, SONGS, CHORDS, TONES, BASS_TONES, ROOM_TONES, NOISES, BRUSHES, TRACKS, CREDITS, TRACK_LEVEL, XFADE, TAIL_PAD, PREFETCH };
})();
