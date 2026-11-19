// The Block Party's radio: a live dance station playing in the room, and the beat its lights follow, found in the music
// as it plays. Its channels (`STATIONS`) are commercial-free and their streams answer with Access-Control-Allow-Origin,
// so the page may route them through Web Audio and read them (a station without that header can be heard but not
// analysed, and its redirect must send it too): EDM Sessions through radio.co (stream.edmsessions.com's redirect sends
// no such header, so this is the address it redirects to), and four of SomaFM's listener-supported channels, whose
// streams and their redirects send it. The room starts on the first; the DJ changes channel from behind the booth
// (`tune`, `next`), and in a shared room everyone there is tuned to the channel the DJ chose (net.js `sendParty`).
//
// The beat is found on the audio's own clock, never the frame rate's: each frame reads the newest stretch of the
// stream through a low-pass (the kick), and `meter` cuts it into blocks of a RATE-th of a second by absolute sample
// number, each block's onset the rise in log energy from the block before. `tracker` keeps SPAN of those onsets, finds
// the tempo by autocorrelation every EVERY seconds and the beat's phase from the onsets' Fourier component at that
// tempo, and says whether to trust it (`live`). Both are pure, load in Node and allocate nothing as they run.
//
// `create` is the player: one <audio> through a delay of LOOKAHEAD seconds and a gain to the speakers, and undelayed
// through the low-pass to an analyser and, whole, to a second analyser, so the room reads the music LOOKAHEAD seconds
// before it is heard: what is heard now (the beat, `energy`, and the spectrum and wave the booth's screen shows,
// `spectrum`, `scope`) and what is coming (`ahead`). It reads the station's now-playing feed too (`song`). A context
// only after a gesture, the page-wide mute on the gain (the lights still follow a muted room), a watchdog and
// retries with backoff. Where a browser hands Web Audio silence for a live stream (Safari has), or the stream stops
// answering cross-origin, it falls back to a plain element: heard, not analysed, the lights on their own steady beat.
// Off under `nosim` (unless `timechain=1`) and `timechain=0`, with the room's other feeds.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // A SomaFM channel's song list's newest, as "Artist - Title".
  const soma = (j) => { const t = j.songs && j.songs[0]; return t ? (t.artist ? `${t.artist} - ${t.title}` : t.title) : ""; };
  const STATIONS = [
    { name: "EDM Sessions", short: "EDM SESSIONS", url: "https://s2.radio.co/s30844a0f4/listen", meta: "https://public.radio.co/stations/s30844a0f4/status", song: (j) => j.current_track && j.current_track.title },
    { name: "SomaFM · The Trip", short: "THE TRIP", url: "https://ice1.somafm.com/thetrip-128-mp3", meta: "https://somafm.com/songs/thetrip.json", song: soma },
    { name: "SomaFM · Beat Blender", short: "BEAT BLENDER", url: "https://ice1.somafm.com/beatblender-128-mp3", meta: "https://somafm.com/songs/beatblender.json", song: soma },
    { name: "SomaFM · DEF CON Radio", short: "DEF CON RADIO", url: "https://ice1.somafm.com/defcon-128-mp3", meta: "https://somafm.com/songs/defcon.json", song: soma },
    { name: "SomaFM · Dub Step Beyond", short: "DUB STEP BEYOND", url: "https://ice1.somafm.com/dubstep-128-mp3", meta: "https://somafm.com/songs/dubstep.json", song: soma }
  ], STATION = STATIONS[0];
  // The tracker: RATE onsets a second, SPAN of them kept, RECENT of them for how hard the beat hits now; tempo between
  // MIN_BPM and MAX_BPM, leaning toward LEAN so a half or double tempo loses; estimated every EVERY seconds once WARM
  // seconds are in; trusted once the onsets' normalized autocorrelation at the beat reaches CONF and until it falls
  // under KEEP (beatless noise peaks near 0.15; house off the radio scores 0.25 to 0.8), and while onsets keep coming (FRESH
  // seconds). A gap longer than GAP seconds starts it afresh.
  const RATE = 100, SPAN = 8 * RATE, RECENT = 2 * RATE, MIN_BPM = 90, MAX_BPM = 180, LEAN = 125, EVERY = 0.5, WARM = 3;
  const CONF = 0.25, KEEP = 0.18, FRESH = 0.5, GAP = 0.5;
  const LAG_MIN = Math.floor(RATE * 60 / MAX_BPM), LAG_MAX = Math.ceil(RATE * 60 / MIN_BPM);
  // The analysis: the low-pass's corner, and how many samples the analyser holds (enough for a frame of 0.17 s); for the
  // screen, the whole signal's FFT size, its range in dB, the spectrum's lowest and highest frequencies, and the power a
  // band's level is raised to so loud, compressed music still moves the bars rather than holding them up.
  const KICK_HZ = 150, WAVE = 8192, LOUD_N = 2048, FFT = 2048, DB_MIN = -90, DB_MAX = -20, LOW_HZ = 35, HIGH_HZ = 16000, SPREAD = 2.2;
  // The player: its volume, how long a stall may last, the first retry's wait (doubling to RETRY_MAX), and how long
  // Web Audio may hand silence for a stream that plays before the plain element takes over.
  const VOLUME = 0.32, STALL_MS = 12000, RETRY_MS = 5000, RETRY_MAX = 60000, SILENT_S = 4;
  // The lookahead: the speakers play LOOKAHEAD seconds behind what the room reads, so the room sees a drop coming. The
  // player keeps HISTORY frames of its readings, one each `sample` at least GAP_S seconds after the last, so the ring
  // holds the same span of time on a 60 Hz display as on a 240 Hz one (the beat's, the loudness, the spectrum's BANDS
  // and the wave's POINTS), and a reading more than STALE seconds from the time asked for counts as none (a hidden
  // tab's gap). What's playing: each station's own feed, asked every META_MS while the radio plays, a song at most
  // SONG_MAX characters.
  const LOOKAHEAD = 8, GAP_S = 0.015, STALE = 0.5, HISTORY = Math.ceil((LOOKAHEAD + 2 * STALE) / GAP_S), BANDS = 96, POINTS = 512, META_MS = 20000, SONG_MAX = 90;
  const TAU = Math.PI * 2;

  // `rate` is how many onsets come a second (a block's whole samples make it a hair off RATE at some sample rates).
  const tracker = (rate = RATE) => {
    const env = new Float32Array(SPAN), scores = new Float64Array(4 * LAG_MAX + 2);
    let first = -1, last = -1, nextEstimate = 0, period = 0, phi = 0, conf = 0, strength = 0, trusted = false;
    const at = (slot) => env[slot % SPAN];
    const reset = () => { env.fill(0); first = last = -1; period = phi = conf = strength = 0; trusted = false; nextEstimate = 0; };
    const estimate = (slot) => {
      const filled = Math.min(SPAN, slot - first + 1);
      let mean = 0;
      for (let k = 0; k < filled; k++) mean += at(slot - k);
      mean /= filled;
      let energy = 0;
      for (let k = 0; k < filled; k++) { const d = at(slot - k) - mean; energy += d * d; }
      if (energy <= 1e-12) { conf = strength = 0; trusted = false; return; }
      for (let l = LAG_MIN; l <= 4 * LAG_MAX && l < filled; l++) {
        let s = 0;
        for (let k = 0; k + l < filled; k++) s += (at(slot - k) - mean) * (at(slot - k - l) - mean);
        scores[l] = s / energy * filled / (filled - l);
      }
      // A beat repeats two beats and a bar on, where a bassline's off-beat figure does not: each lag is scored with
      // its double and quadruple, then leant toward LEAN.
      let best = -Infinity, lag = 0;
      for (let l = LAG_MIN; l <= LAG_MAX; l++) {
        const lean = Math.log2(60 * RATE / l / LEAN);
        const w = (scores[l] + 0.5 * (2 * l < filled ? scores[2 * l] : 0) + 0.25 * (4 * l < filled ? scores[4 * l] : 0)) * Math.exp(-2 * lean * lean);
        if (w > best) { best = w; lag = l; }
      }
      // The peak between whole lags, from the parabola through it and its neighbours.
      const a = scores[Math.max(LAG_MIN, lag - 1)], b = scores[lag], c = scores[Math.min(LAG_MAX, lag + 1)], bend = a - 2 * b + c;
      const off = bend < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / bend)) : 0;
      period = lag + off; conf = b; trusted = conf >= (trusted ? KEEP : CONF);
      // The onsets' component at that period over absolute slots: its angle is where in the period they fall. Its size
      // over the last RECENT slots against the whole span is how hard the beat hits now (a breakdown's is small).
      let re = 0, im = 0, reNow = 0, imNow = 0;
      const recent = Math.min(filled, RECENT);
      for (let k = 0; k < filled; k++) {
        const s = slot - k, x = at(s) - mean, ang = TAU * (s % period) / period, cx = x * Math.cos(ang), sx = x * Math.sin(ang);
        re += cx; im += sx;
        if (k < recent) { reNow += cx; imNow += sx; }
      }
      phi = ((Math.atan2(im, re) / TAU) * period % period + period) % period;
      const whole = Math.hypot(re, im) / filled;
      strength = whole > 0 ? Math.min(1, Math.hypot(reNow, imNow) / recent / whole) : 0;
    };
    // The onset of block `slot` (its start at slot / RATE seconds on the audio clock); missed blocks count as none.
    const push = (slot, onset) => {
      if (last >= 0 && (slot <= last || slot - last > GAP * RATE)) reset();
      if (first < 0) { first = slot; last = slot - 1; }
      for (let s = last + 1; s < slot; s++) env[s % SPAN] = 0;
      env[slot % SPAN] = onset;
      last = slot;
      if (slot - first >= WARM * RATE && slot >= nextEstimate) { nextEstimate = slot + EVERY * RATE; estimate(slot); }
    };
    // What a listener hearing the music at `time` should see: the tempo, where in the beat they are (0 on it), how hard
    // the beat hits now against the last few seconds, and whether to trust any of it.
    const read = (time, out) => {
      const now = time * rate;
      out.live = trusted && last >= 0 && now - last < FRESH * rate;
      out.bpm = period > 0 ? 60 * rate / period : 0;
      out.phase = period > 0 ? (((now - phi) / period) % 1 + 1) % 1 : 0;
      out.level = strength;
      out.conf = conf;
      return out;
    };
    return { push, read, reset };
  };

  // Onsets from a low-passed wave at `sampleRate`: `take(wave, end, track)` with `wave` holding the newest samples, the
  // last of them numbered `end` - 1 from the context's start, pushes every whole block not yet taken; each block's
  // energy is taken over it and the block before, its onset the rise in log energy since the last block. Returns
  // whether any sample it took was not silent.
  const meter = (sampleRate) => {
    const block = Math.round(sampleRate / RATE);
    let done = -1, before = 0, prevLog = 0, primed = false;
    const take = (wave, end, track) => {
      if (done < 0 || end < done || end - done > wave.length) {
        done = Math.ceil((end - wave.length) / block) * block; primed = false;
        if (done < 0) done = 0;
      }
      let heard = false;
      while (done + block <= end) {
        let e = 0;
        for (let i = wave.length - (end - done), n = i + block; i < n; i++) { const x = wave[i]; e += x * x; }
        if (e > 0) heard = true;
        const log = Math.log((e + before) / (2 * block) + 1e-10);
        track.push(done / block, primed ? Math.max(0, log - prevLog) : 0);
        prevLog = log; before = e; primed = true;
        done += block;
      }
      return heard;
    };
    return { take, block };
  };

  const create = () => {
    const q = new URLSearchParams(location.search);
    const enabled = q.get("timechain") !== "0" && (!q.has("nosim") || q.get("timechain") === "1");
    let track = tracker();
    let context = null, filter = null, analyser = null, sink = null, gain = null, wave = null, beats = null, element = null, source = null;
    let whole = null, bins = null, signal = null, edges = null, delay = null;
    // The history: each frame's time on the audio's clock, its beat's strength and whether it was trusted, loudness,
    // spectrum and wave; the frame heard now (`heard`, -1 for none yet).
    let hAt = null, hLevel = null, hLive = null, hLoud = null, hBass = null, hBands = null, hWave = null, hHead = 0, hCount = 0, heard = -1;
    const now = { live: false, bpm: 0, phase: 0, level: 0, conf: 0 }, spec = new Float32Array(BANDS);
    // What's playing: the song the feed named, shown once the speakers reach it.
    let song = "", songNext = "", songAt = 0, metaTimer = 0, metaAsk = null;
    let mode = enabled ? "waiting" : "off", plain = false, disposed = false, timer = 0, watchdog = 0, epoch = 0;
    let failures = 0, quiet = 0, lastTime = -1, starts = 0, channel = 0;
    const soundChannel = BL.sound.channel("party");
    if (!enabled) soundChannel.show(false);
    const applyVolume = () => {
      if (gain) gain.gain.setTargetAtTime(plain || BL.sound.muted ? 0 : VOLUME, context.currentTime, 0.4);
      if (element && plain) { element.muted = BL.sound.muted; element.volume = VOLUME * soundChannel.gain; }
    };
    const dropElement = () => {
      epoch++; clearTimeout(watchdog); watchdog = 0;
      if (source) { source.disconnect(); source = null; }
      if (element) {
        element.onplaying = element.onerror = element.onended = element.onwaiting = element.onstalled = null;
        element.pause(); element.removeAttribute("src"); element.load(); element = null;
      }
      quiet = 0; lastTime = -1; track.reset();
      hCount = 0; heard = -1;
      if (context) beats = meter(context.sampleRate);
      // The delay still holds the last stream's seconds: a fresh one, so a new channel starts clean.
      if (delay && !disposed) { delay.disconnect(); delay = lineOf(context); }
    };
    const lineOf = (c) => { const d = c.createDelay(LOOKAHEAD + 1); d.delayTime.value = LOOKAHEAD; d.connect(gain); return d; };
    // The station's now-playing feed, asked while the radio plays; a song arriving waits for the speakers to reach it.
    const askSong = () => {
      clearTimeout(metaTimer); metaTimer = 0;
      if (disposed || mode !== "live" || typeof fetch !== "function") return;
      const station = STATIONS[channel], ask = metaAsk = new AbortController();
      fetch(station.meta, { signal: ask.signal, cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((j) => {
        if (ask !== metaAsk || !j) return;
        const name = String(station.song(j) || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, SONG_MAX);
        if (name && name !== songNext) { songNext = name; songAt = performance.now() + (plain ? 0 : LOOKAHEAD * 1000); }
      }).catch(() => {});
      metaTimer = setTimeout(askSong, META_MS);
    };
    const failed = () => {
      if (disposed) return;
      dropElement(); failures++;
      // Twice refused through Web Audio, try the plain element: the music without the beat beats no music.
      if (!plain && failures >= 2) { plain = true; mode = "idle"; start(); return; }
      mode = "offline";
      clearTimeout(timer);
      timer = setTimeout(() => { timer = 0; if (!disposed) { mode = "idle"; start(); } }, Math.min(RETRY_MAX, RETRY_MS * 2 ** (failures - 1)));
    };
    const start = () => {
      if (disposed || !enabled || mode === "live" || mode === "connecting" || mode === "offline") return;
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) { mode = "waiting"; return; }
      if (!context) {
        context = new AudioContext();
        gain = context.createGain(); gain.gain.value = 0; gain.connect(soundChannel.node(context));
        filter = context.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = KICK_HZ;
        analyser = context.createAnalyser(); analyser.fftSize = WAVE;
        // The analyser reaches the speakers through a silent gain, so every browser keeps running it.
        sink = context.createGain(); sink.gain.value = 0;
        filter.connect(analyser); analyser.connect(sink); sink.connect(context.destination);
        whole = context.createAnalyser(); whole.fftSize = FFT; whole.minDecibels = DB_MIN; whole.maxDecibels = DB_MAX; whole.smoothingTimeConstant = 0.55;
        whole.connect(sink);
        delay = lineOf(context);
        wave = new Float32Array(WAVE); bins = new Uint8Array(FFT / 2); signal = new Float32Array(FFT);
        hAt = new Float64Array(HISTORY); hLevel = new Float32Array(HISTORY); hLive = new Uint8Array(HISTORY); hLoud = new Float32Array(HISTORY);
        hBass = new Float32Array(HISTORY); hBands = new Float32Array(HISTORY * BANDS); hWave = new Float32Array(HISTORY * POINTS);
        track = tracker(context.sampleRate / meter(context.sampleRate).block);
      }
      if (context.state === "suspended") context.resume().catch(() => {});
      dropElement();
      const attempt = epoch; starts++;
      element = new Audio(); element.preload = "none";
      if (!plain) {
        element.crossOrigin = "anonymous";
        source = context.createMediaElementSource(element); source.connect(delay); source.connect(filter); source.connect(whole);
      }
      mode = "connecting";
      applyVolume();
      element.onplaying = () => { if (attempt !== epoch) return; clearTimeout(watchdog); watchdog = 0; mode = "live"; failures = 0; applyVolume(); askSong(); };
      element.onerror = element.onended = () => { if (attempt === epoch) failed(); };
      element.onwaiting = element.onstalled = () => {
        if (attempt === epoch && !watchdog) watchdog = setTimeout(() => { if (attempt === epoch) failed(); }, STALL_MS);
      };
      watchdog = setTimeout(() => { if (attempt === epoch) failed(); }, STALL_MS);
      element.src = `${STATIONS[channel].url}?_=${Date.now()}`;
      element.play().catch((error) => {
        if (attempt !== epoch || disposed) return;
        if (error.name === "NotAllowedError") { dropElement(); mode = "waiting"; } else failed();
      });
    };
    const gesture = () => {
      if (context && context.state === "suspended") context.resume().catch(() => {});
      if (mode === "waiting") start();
    };
    if (enabled) { document.addEventListener("pointerdown", gesture); document.addEventListener("keydown", gesture); }
    const offSound = BL.sound.subscribe(() => applyVolume());
    soundChannel.subscribe(() => applyVolume());
    start();
    // The newest frame read at or before `time` on the audio's clock, within STALE of it, or -1.
    const frameAt = (time) => {
      for (let k = 0; k < hCount; k++) {
        const i = (hHead - 1 - k + HISTORY) % HISTORY;
        if (hAt[i] <= time) return time - hAt[i] <= STALE ? i : -1;
      }
      return -1;
    };
    // What the room shows for what is heard now: the frame LOOKAHEAD seconds back, and the tempo and phase then.
    const heardNow = (at, lag, out) => {
      heard = frameAt(at - LOOKAHEAD);
      track.read(at - lag - LOOKAHEAD, out);
      out.live = heard >= 0 && hLive[heard] === 1; out.level = heard >= 0 ? hLevel[heard] : 0;
      return out;
    };
    // Once a frame: the newest stretch of the stream into the tracker and into the history with its loudness, spectrum
    // and wave, and what the room should show for what is heard now, LOOKAHEAD seconds behind (the tempo and phase at
    // that time, and how hard the beat hit then). Where Web Audio hands only silence for a stream that is playing, the
    // plain element takes over.
    const sample = (out) => {
      heard = -1;
      if (mode !== "live" || plain || !analyser) { out.live = false; out.level = 0; return out; }
      analyser.getFloatTimeDomainData(wave);
      const sounding = beats.take(wave, Math.round(context.currentTime * context.sampleRate), track);
      if (!sounding && lastTime >= 0 && element.currentTime > lastTime) {
        // A frame vouches only for the stretch the analyser holds: a late frame (a stalled page, a view change's
        // hitch) that finds the stream catching its breath is one quiet moment, not all the time since the last.
        quiet += Math.min(element.currentTime - lastTime, WAVE / context.sampleRate);
        if (quiet > SILENT_S) { plain = true; mode = "idle"; start(); out.live = false; return out; }
      } else if (sounding) quiet = 0;
      lastTime = element.currentTime;
      const lag = context.outputLatency || context.baseLatency || 0, at = context.currentTime, i = hHead;
      if (hCount && at - hAt[(hHead - 1 + HISTORY) % HISTORY] < GAP_S) return heardNow(at, lag, out);
      track.read(at - lag, now);
      hAt[i] = at; hLevel[i] = now.level; hLive[i] = now.live ? 1 : 0;
      let e = 0;
      for (let k = WAVE - LOUD_N; k < WAVE; k++) e += wave[k] * wave[k];
      hBass[i] = 10 * Math.log10(e / LOUD_N + 1e-12);
      whole.getFloatTimeDomainData(signal);
      e = 0;
      for (let k = 0; k < FFT; k++) e += signal[k] * signal[k];
      hLoud[i] = 10 * Math.log10(e / FFT + 1e-12);
      readSpectrum(spec);
      hBands.set(spec, i * BANDS);
      const span = FFT / 2;
      let from = 0;
      for (let k = 1; k < FFT - span; k++) if (signal[k - 1] < 0 && signal[k] >= 0) { from = k; break; }
      for (let k = 0, o = i * POINTS; k < POINTS; k++) hWave[o + k] = signal[from + Math.floor(k * span / POINTS)];
      hHead = (hHead + 1) % HISTORY; hCount = Math.min(HISTORY, hCount + 1);
      return heardNow(at, lag, out);
    };
    // How loud the music heard now is, in dB of its RMS: `out.loud` the whole signal over the analyser's FFT samples,
    // `out.bass` the low-passed kick band over its newest LOUD_N samples (as `sample` read them, so call it after).
    // False when there is nothing to read (the room then runs its own arrangement). `ahead(d, out)` is the same `d`
    // seconds after what is heard now (up to LOOKAHEAD; a little before it too).
    const energy = (out) => {
      if (heard < 0) return false;
      out.loud = hLoud[heard]; out.bass = hBass[heard];
      return true;
    };
    const ahead = (d, out) => {
      if (heard < 0) return false;
      const i = frameAt(hAt[heard] + d);
      if (i < 0) return false;
      out.loud = hLoud[i]; out.bass = hBass[i];
      return true;
    };
    // The screen's spectrum of what is heard now: BANDS bands into `out`, low to high on a log scale, each the loudest
    // bin in it (0 to 1, raised to SPREAD). False when there is nothing to read (the screen then makes its own from the
    // beat). The bands' bins are worked out once.
    const spectrum = (out) => {
      if (heard < 0) return false;
      for (let k = 0, o = heard * BANDS; k < BANDS; k++) out[k] = hBands[o + k];
      return true;
    };
    const readSpectrum = (out) => {
      whole.getByteFrequencyData(bins);
      const n = out.length;
      if (!edges || edges.length !== n + 1) {
        edges = new Uint16Array(n + 1);
        const hz = context.sampleRate / FFT;
        for (let i = 0; i <= n; i++) edges[i] = Math.min(bins.length, Math.max(i ? edges[i - 1] + 1 : 1, Math.round(LOW_HZ * (HIGH_HZ / LOW_HZ) ** (i / n) / hz)));
      }
      for (let i = 0; i < n; i++) {
        let most = 0;
        for (let b = edges[i]; b < edges[i + 1]; b++) if (bins[b] > most) most = bins[b];
        out[i] = (most / 255) ** SPREAD;
      }
    };
    // The screen's wave of what is heard now: POINTS samples of the newest half of the analyser's window from a rising
    // zero crossing, so it stands still on a steady note.
    const scope = (out) => {
      if (heard < 0) return false;
      for (let k = 0, o = heard * POINTS; k < POINTS; k++) out[k] = hWave[o + k];
      return true;
    };
    // Another channel: the stream let go and the new one asked for at once (after the first gesture, as ever), the
    // beat found afresh and the plain element given up, so a channel that answers cross-origin is read again.
    const tune = (index) => {
      if (disposed || !enabled) return;
      const wanted = ((index % STATIONS.length) + STATIONS.length) % STATIONS.length;
      if (wanted === channel && mode !== "offline") return;
      channel = wanted;
      song = songNext = ""; if (metaAsk) metaAsk.abort(); metaAsk = null; clearTimeout(metaTimer); metaTimer = 0;
      clearTimeout(timer); timer = 0;
      dropElement();
      plain = false; failures = 0;
      if (mode !== "waiting") mode = "idle";
      start();
    };
    const reading = { live: false, bpm: 0, phase: 0, level: 0, conf: 0 };
    // A line for a tap on the booth, the decks or the speakers.
    const words = () => {
      const muted = BL.sound.muted ? " · sound muted (M, or the speaker button's Sound on/off)" : "";
      const name = STATIONS[channel].name;
      if (mode === "off") return "The radio is off on this page";
      if (mode === "waiting") return `${name} · tap or press a key to tune in`;
      if (mode === "connecting" || mode === "idle") return `Tuning in to ${name}…`;
      if (mode === "offline") return `${name} isn't answering · trying again shortly`;
      if (plain) return `Live · ${name}${muted}`;
      track.read(context.currentTime, reading);
      return reading.live ? `Live · ${name} · ${Math.round(reading.bpm)} BPM · the lights follow the beat${muted}` : `Live · ${name} · finding the beat${muted}`;
    };
    return {
      sample, energy, ahead, spectrum, scope, words, tune,
      next: () => tune(channel + 1),
      // How far ahead of the speakers the readings run (0 where they are not delayed), whether the speakers have yet to
      // reach the first reading, and the song playing now, as the station's feed named it ("" for none yet).
      get lookahead() { return mode === "live" && !plain ? LOOKAHEAD : 0; },
      get warming() { return mode === "live" && !plain && heard < 0; },
      get song() { if (songNext !== song && performance.now() >= songAt) song = songNext; return song; },
      get channel() { return channel; }, get station() { return STATIONS[channel]; },
      get stats() { return { mode, plain, starts, failures, channel, contexts: context ? 1 : 0, elements: element ? 1 : 0, ...track.read(context ? context.currentTime : 0, reading) }; },
      dispose() {
        if (disposed) return;
        disposed = true;
        clearTimeout(timer); timer = 0; clearTimeout(metaTimer); metaTimer = 0;
        if (metaAsk) metaAsk.abort();
        document.removeEventListener("pointerdown", gesture);
        document.removeEventListener("keydown", gesture);
        offSound(); soundChannel.release();
        dropElement();
        for (const node of [filter, analyser, whole, sink, gain, delay]) if (node) node.disconnect();
        if (context) context.close().catch(() => {});
        context = filter = analyser = whole = sink = gain = delay = wave = beats = bins = signal = null;
        hAt = hLevel = hLive = hLoud = hBass = hBands = hWave = null; hCount = 0; heard = -1;
        mode = "disposed";
      }
    };
  };

  BL.timechainPartyRadio = { STATION, STATIONS, RATE, CONF, LOOKAHEAD, BANDS, POINTS, tracker, meter, create };
})();
