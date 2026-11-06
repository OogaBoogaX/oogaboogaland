// Ooga thump: a supportive reaction in island voice. A visitor in voice (talking, or listen-only without ever a
// microphone) presses Thump beside the voice controls, and their Ooga taps its club on the ground instead of them
// unmuting to say "yes!". The room takes `{"t":"thump"}` only from a voice participant and relays it to every other
// voice participant sharing that voice place (`thumpPeers` in worker/src/protocol.js), two a second with a burst of three
// per account; this page mirrors that bucket so it never sends what the room would drop.
// Each thump shown here, the visitor's own or relayed, does three things: the thumper's body acts
// (`BL.remotePlayers.thumped`: a one-off arm, or a fallback mallet where the body cannot safely move), a mallet shows a
// moment beside their voice mark in Online Oogas (`BL.players.pulse`), and, only where this visitor would hear that
// player's voice, it sounds. Sight never depends on hearing: a player muted for this visitor (`BL.voice.muteLocal`), one
// past this visitor's hearing range, or one the room says this page would not hear (a DSB Studio speaker's audience,
// `a` absent on the frame) is still seen to thump, only silently. What is heard follows voice's own rules: the room's
// word (`a: 1`, by `thumpAudible`), the local mute, and the hearing range and crossing share (`BL.voice.nearness`), which
// scales the thump's level as it scales a voice. The visitor's own thump sounds at full.
// Thumps belong to one voice membership: the zone group and, in the Ember Den, the table (`voiceTogether` in
// worker/src/protocol.js), while the room is live and voice is on. Any change of it (another group or table, leaving or
// rejoining voice, a disconnect) clears the marks (`BL.players.clearPulses`) and the bodies' mallets, taps and beats
// (`BL.remotePlayers.clearThumps`), and another group or table drops thumps for SETTLE_MS while voice settles there.
// Sound is one synthesized thump, never a recording: a sine thud falling 120 to 48 Hz over 35 ms with a 110 ms decay,
// a 30 ms low-passed noise puff and a 12 ms 1.6 kHz wood knock, slightly detuned each time and panned by where the
// thumper stands on screen. VOICES pooled voices, built once, sound at most at a time, at most RATE_MAX start in any
// second, quietly and lower still under speech; a thump that cannot sound now is dropped, never queued. A context the
// browser suspended resumes only inside a Thump press, a real gesture (`navigator.userActivation.isActive`), never from a
// relayed thump; the thump that woke it and every one missed while it slept stay silent, never replayed, and a refused
// resume leaves thumps silent until the next press. The page mute (`BL.sound`) silences them through `output`.
// Nothing plays or shows while the tab is hidden, the room is not live or the zone is changing.
// Calm (prefers-reduced-motion) holds the marks still and shows the mallet rather than moving a body.
// No frame work and no idle timers: everything happens on a press or a relayed thump. Exports press, heard, stats and,
// for the unit tier, createMixer.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  // The room's own bucket (THUMP_HZ, THUMP_BURST in worker/src/protocol.js).
  const SEND_HZ = 2, SEND_BURST = 3;
  // A move into another voice group or table drops thumps for SETTLE_MS while voice settles there.
  const SETTLE_MS = 1500;
  // Sound: VOICES at once, each busy VOICE_S; at most RATE_MAX started in any RATE_S; LEVEL, DUCK of it under speech.
  const VOICES = 4, VOICE_S = 0.16, RATE_MAX = 6, RATE_S = 1, LEVEL = 0.22, DUCK = 0.5;

  // The pooled thump voices on `context`, into `out` (the page mute's gate). `play(pan, ducked, level)` schedules one now
  // at `level` (0 to 1, voice's own nearness for a heard thump) or answers false; nothing is ever scheduled ahead.
  const createMixer = (context, out, random = Math.random) => {
    const master = context.createGain();
    master.gain.value = 1;
    master.connect(out);
    const noise = context.createBuffer(1, context.sampleRate, context.sampleRate), data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
    const voices = [];
    for (let i = 0; i < VOICES; i++) {
      const pan = context.createStereoPanner();
      pan.connect(master);
      const body = context.createOscillator(), bodyGain = context.createGain();
      body.type = "sine"; bodyGain.gain.value = 0;
      body.connect(bodyGain); bodyGain.connect(pan);
      const knock = context.createOscillator(), knockGain = context.createGain();
      knock.type = "triangle"; knockGain.gain.value = 0;
      knock.connect(knockGain); knockGain.connect(pan);
      const puff = context.createBufferSource(), filter = context.createBiquadFilter(), puffGain = context.createGain();
      puff.buffer = noise; puff.loop = true; filter.type = "lowpass"; filter.frequency.value = 650; puffGain.gain.value = 0;
      puff.connect(filter); filter.connect(puffGain); puffGain.connect(pan);
      body.start(); knock.start(); puff.start(0, i * 0.23);
      voices.push({ pan, body, bodyGain, knock, knockGain, puffGain, until: 0 });
    }
    const starts = new Float64Array(RATE_MAX).fill(-Infinity);
    let next = 0, playing = 0;
    const counts = { played: 0, busy: 0, rate: 0 };
    const play = (pan, ducked, level = 1) => {
      if (context.state !== "running" || !(level > 0)) return false;
      const now = context.currentTime;
      // The oldest of the last RATE_MAX starts must be over a second gone.
      if (now - starts[next] < RATE_S) { counts.rate++; return false; }
      let v = null;
      playing = 0;
      for (const c of voices) if (c.until > now) playing++; else if (!v) v = c;
      if (!v) { counts.busy++; return false; }
      starts[next] = now; next = (next + 1) % RATE_MAX;
      v.until = now + VOICE_S;
      playing++;
      counts.played++;
      const peak = LEVEL * Math.min(1, level) * (ducked ? DUCK : 1), pitch = 1 + (random() - 0.5) * 0.12;
      v.pan.pan.setValueAtTime(Math.max(-1, Math.min(1, pan * 0.8)), now);
      const f = v.body.frequency, g = v.bodyGain.gain;
      f.cancelScheduledValues(now); f.setValueAtTime(120 * pitch, now); f.exponentialRampToValueAtTime(48 * pitch, now + 0.035);
      g.cancelScheduledValues(now); g.setValueAtTime(0, now); g.linearRampToValueAtTime(peak, now + 0.004); g.setTargetAtTime(0, now + 0.006, 0.024); g.setValueAtTime(0, now + VOICE_S);
      const p = v.puffGain.gain;
      p.cancelScheduledValues(now); p.setValueAtTime(0, now); p.linearRampToValueAtTime(peak * 0.45, now + 0.003); p.setTargetAtTime(0, now + 0.004, 0.007); p.setValueAtTime(0, now + 0.06);
      const kf = v.knock.frequency, k = v.knockGain.gain;
      kf.setValueAtTime(1600 * pitch, now);
      k.cancelScheduledValues(now); k.setValueAtTime(0, now); k.linearRampToValueAtTime(peak * 0.3, now + 0.001); k.setTargetAtTime(0, now + 0.002, 0.0028); k.setValueAtTime(0, now + 0.03);
      return true;
    };
    return { play, get playing() { return playing; }, counts, voices: VOICES };
  };

  const net = BL.net, voice = BL.voice;
  const $ = (id) => document.getElementById(id);
  const button = $("account-thump");
  if (!button) {
    BL.thump = { createMixer };
    return;
  }
  const buttons = [button, $("players-account-thump"), $("chat-account-thump")].filter(Boolean);
  for (const control of buttons) control.prepend(BL.hud.malletIcon.cloneNode(true));
  const bucket = { tokens: SEND_BURST, at: -Infinity };
  // shown: thumps drawn; dropped: refused by the gates (hidden, not live, settling); unheard: shown with no sound due
  // (the room's word, a local mute, past the hearing range); sounded and unsounded: due a sound, and whether it played.
  const stats = { sent: 0, heard: 0, shown: 0, dropped: 0, unheard: 0, sounded: 0, unsounded: 0, resumes: 0, resumeFailed: 0, resets: 0 };
  let context = null, mixer = null, place = null, inVoice = false, settleUntil = 0, shownHidden = null;

  const groupOf = (zone) => { const dot = zone.indexOf("."); return dot < 0 ? zone : zone.slice(0, dot); };
  // Where voice joins this page: the zone group, and in the Ember Den the table (the floor when none), as the room's
  // `voiceTogether` decides; "" while the room is not live.
  const placeOf = () => {
    if (net.state.room !== "live") return "";
    const group = groupOf(net.state.zone);
    return group === "ember-den" ? `${group}:${net.state.pokerVoice ?? "floor"}` : group;
  };
  const participant = () => net.state.room === "live" && !!net.state.me && voice.stats.enabled;
  const quiet = (now) => document.hidden || !participant() || net.state.zone === "none" || now < settleUntil;
  const speech = () => {
    if (voice.stats.speaking) return true;
    for (const id of net.remotes.keys()) if (voice.speaking(id)) return true;
    return false;
  };
  const audio = () => {
    if (mixer) return context.state === "closed" ? null : mixer;
    if (!window.AudioContext || navigator.userActivation && !navigator.userActivation.hasBeenActive) return null;
    context = new window.AudioContext();
    mixer = createMixer(context, BL.sound.output(context));
    return mixer;
  };
  // Inside a Thump press, while the browser counts it a gesture: make the context, or ask a suspended (or interrupted)
  // one to run again. Nothing is played on its answer: what this press and anything before it could not sound stays
  // unsounded, and a refusal only waits for the next press.
  const wake = () => {
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    if (!audio() || context.state === "running") return;
    const asked = context;
    stats.resumes++;
    asked.resume().catch(() => { if (context === asked) stats.resumeFailed++; });
  };
  const closeAudio = () => {
    if (!context) return;
    context.close().catch(() => {});
    context = mixer = null;
  };
  const render = () => {
    const hidden = !participant();
    if (hidden !== shownHidden) {
      shownHidden = hidden;
      for (const control of buttons) control.hidden = hidden;
    }
  };

  // A new voice membership: none of the last one's marks or reactions carry over.
  const clearShown = () => {
    stats.resets++;
    BL.players.clearPulses();
    if (BL.remotePlayers) BL.remotePlayers.clearThumps();
  };
  // One thump, the visitor's own (`id` 0, `level` 1) or a remote player's, on this page: always seen, and heard at
  // `level` when that is above 0.
  const effect = (id, level) => {
    stats.shown++;
    const pan = BL.remotePlayers ? BL.remotePlayers.thumped(id) : null;
    BL.players.pulse(id);
    if (!(level > 0)) { stats.unheard++; return; }
    const m = audio();
    if (m && m.play(pan || 0, speech(), level)) stats.sounded++;
    else stats.unsounded++;
  };
  const take = (now) => {
    bucket.tokens = Math.min(SEND_BURST, bucket.tokens + (now - bucket.at) * SEND_HZ / 1000);
    bucket.at = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  };
  const press = () => {
    const now = performance.now();
    if (quiet(now) || !take(now) || !net.sendThump()) return false;
    stats.sent++;
    wake();
    effect(0, 1);
    return true;
  };
  // A relayed thump: `audible` is the room's word that this page would hear that player's voice where it stands.
  const heard = (id, audible = false) => {
    stats.heard++;
    const now = performance.now(), rec = net.remotes.get(id);
    if (quiet(now) || !rec) { stats.dropped++; return; }
    effect(id, audible && !voice.mutedLocally(rec.login) ? voice.nearness(id) : 0);
  };

  // Another voice membership: another group or table, or none, settles; leaving or rejoining voice starts over too.
  const follow = () => {
    const next = placeOf(), joined = voice.stats.enabled;
    if (next === place && joined === inVoice) { render(); return; }
    if (next !== place) settleUntil = performance.now() + SETTLE_MS;
    place = next; inVoice = joined;
    clearShown();
    render();
  };
  net.subscribe(follow);
  net.subscribeRoster(follow);
  net.subscribeThump(heard);
  voice.subscribe(() => {
    if (!voice.stats.enabled && !voice.stats.joining) closeAudio();
    follow();
  });
  render();

  BL.thump = {
    press, heard, createMixer,
    get stats() { return { ...stats, playing: mixer ? mixer.playing : 0, audio: mixer ? { ...mixer.counts } : null }; },
  };
})();
