// Voice between signed-in players near the pile, on Cloudflare Realtime SFU, ported from the OBL-Audio
// prototype. Two peer connections, as in Cloudflare's video-room example: one publishes the microphone
// (the browser offers, the SFU answers), one receives (the SFU offers, the browser answers), so each
// negotiates in one direction only. Every SFU call goes through the Worker (`/api/voice/*`); the page
// never holds credentials or another player's session. The room says whom to hear (`setPeers`, from its
// `voice` message) and this module makes it so one change at a time, since a session's changes must be
// serialised. The room lets a player hear only those in the same place (out on the island, HQ, one cave);
// this visitor can quiet or boost each player and turn their own hearing range down (below).
// `enable` must run inside the click that asks for the microphone; `toggle` is the account's button.
// `setMuted` changes mute state without acquiring a microphone, including while joining or only listening.
// Who is speaking is measured here, for the roster: an analyser on the microphone and on each voice
// received, read every SPEAK_MS while voice is on (`stats.speaking` for this page, `speaking(id)` for
// others). A player muted for this listener alone (`muteLocal`, by stable player id) is still pulled and measured,
// only not played. Mute and volume are saved locally under this listener's account id; old browser-wide login
// mutes are not imported, since they may belong to another account on a shared browser.
// The room's lists carry each voice's publication count, so a microphone published again (its owner
// reconnected or restarted) is pulled again rather than left on a dead track; a connection that fails or stays
// dropped after it was up starts voice over on its own, and a pull that misses a wanted voice is retried.
// Alone (#181): while the room's list of whom to hear is empty, nobody here can hear this page either (the room
// lists exactly the players driving an Ooga in the same place with a live microphone, and lets a page pull only
// those), so the microphone track is held off as a mute holds it (`stats.alone`), and comes back by itself when the
// room lists someone. It is still published, so the room can tell others this page is here to be heard. Alone is
// not a mute: the room is not told, and a visitor's own mute stands whoever comes and goes. In DSB Studio an
// audience can listen without publishing, so there the room's `voice` message also counts the other receive
// sessions (`listeners`), and that count holds the gate instead; no count ever acquires a microphone.
// Hearing range (#380): a visitor may turn their own hearing down from no limit to RADIUS_MIN..RADIUS_MAX metres
// (`setRadius`, `stats.radius`, 0 for no limit, kept in localStorage). It changes only how loud this page plays each
// voice it receives, never the microphone or what anyone else hears; the room still decides who is pulled, so nothing
// is saved on the network. A voice plays at full inside the radius and is silent at or beyond it (`falloff`).
// Distances are this page's last reported position (`net.state.self`)
// to each remote's, in the place both stand in: a voice in another place of the same voice group, which has coordinates
// of its own, or one not yet placed here counts as past the radius; a page with no position of its own here plays everyone.
// Movement updates the cutoff on the speaking meter's own 150 ms read; changing the range applies it immediately.
// No distance fade or volume ramp crosses the cutoff. A local mute still wins.
// Voice links (net.js `voiceLink`): the room also lists a linked partner wherever they are, and that voice plays at full
// whatever the crossing or this visitor's hearing range. `inEarshot` says whether a player can be heard where both stand.
// Levels and crossings (#392): between two levels of the main world, or along a crossing between two places
// (voice-blend.js), the room also lets a player hear the other, and each voice plays at its equal-power share
// (`BL.voiceBlend.gain`, from `net.state.blendT` and the speaker's step), gated by the hearing range, so the two fade
// into each other. Only this share eases by NEAR_STEP. The main world's zones, and Ooga Arcade's hall, its haunted
// hallway and Ghost Hunter's Arena (#422), each share one scene's coordinates (`BL.voiceBlend.sameFrame`), so the range
// is measured between them too.
// Where a voice's level goes: with Web Audio (`GAIN_PLAY`), each voice plays through a gain fed by its
// speaking meter's own source, in the context the Join click made, while its element stays muted and only keeps the
// stream flowing; the gain carries the receive level, the hearing range, local volume and mute alike. A limiter after
// it protects boosted peaks; at ordinary volume its ratio is 1, leaving the voice unchanged. The output never joins
// the page-wide environment mute (sound.js), which voice has never joined. Its nodes are made when a voice's track lands and disconnected when the voice is dropped, a restart or a stop (`unplug`).
// Safari suspends or interrupts that context (a call, another app), which silences every voice, so then the voices
// count as blocked, as a refused element play does, and the next tap or key wakes it (`wake`). `fades` says whether a
// range can be heard at all: where the element's volume is honoured, or through a gain. Without Web Audio, the
// element remains the playback path and volume tops out at 1 rather than offering a boost it cannot play.
// Coming back: a visitor who pressed Join voice and has not pressed Leave voice since, in this browser and account
// (`JOINED_KEY`), is put back in voice muted whenever the room lets them in (`restart(true)`), however the last session
// ended. The microphone stays closed (`stats.returning`, a listening connection) until they unmute, which opens it inside
// that press. Browsers hold sound until a first click or key, so that press connects them, or the room's welcome on a page
// that has had one. DSB Studio's sound and microphone stay its own choices, there and on the way in.
// Exports enable, listen, dropMic, preflight, cancelPreflight, devices, selectDevice, setReceiveLevel, setMuted, toggle, leave, restart, stop,
// setPeers, subscribe, dispose, inspect, speaking, inEarshot, muteLocal, mutedLocally, setVolume, volumeOf, VOLUME_MAX, setRadius, falloff, fades,
// RADIUS_MIN, RADIUS_MAX and stats.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const ICE = { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }], bundlePolicy: "max-bundle" };
  const TURN_TLS = "turns:turn.cloudflare.com:443?transport=tcp";
  const ICE_GATHER_MS = 1500, RELAY_GATHER_MS = 3500, CONNECT_MS = 10000, RETRY_MS = 2000, SLOW_RETRY_MS = 15000, RESTART_TRIES = 3, RESTART_WAIT_MS = 3000;
  // A connection that drops after it was up gets this long to come back on its own before voice starts over.
  const DROP_GRACE_MS = 5000;
  // Speaking: RMS over SPEAK_ON starts it at once; SPEAK_HOLD quiet reads in a row end it, so words do not flicker.
  const SPEAK_MS = 150, SPEAK_ON = 0.02, SPEAK_HOLD = 4, SAMPLES = 1024;
  const PREF_KEY = "oogaboogaland.voice-players.", PREF_MAX = 512;
  const JOINED_KEY = "oogaboogaland.voice-joined.", STUDIO_ZONE = "dsb-studio";
  // Hearing range: the radius in metres (0 is no limit), a crossing share's most change per meter read.
  const RADIUS_KEY = "oogaboogaland.voice-radius", RADIUS_MIN = 1, RADIUS_MAX = 60, NEAR_STEP = 0.15;
  // Gains support a modest +6 dB boost on desktop as well as iOS, whose elements ignore their volume.
  // Without Web Audio, keep the element path and expose only the volume range it can actually play.
  const probe = document.createElement("audio");
  probe.volume = 0.5;
  const ELEMENT_VOLUME = probe.volume === 0.5, GAIN_PLAY = typeof window.AudioContext === "function", GAIN_TAU = 0.05;
  const VOLUME_MAX = GAIN_PLAY ? 2 : 1;
  const subscribers = new Set();
  const subs = new Map();
  // Each wanted voice's publication count from the room: a new count is a microphone published again.
  const wantedGen = new Map();
  const stats = { enabled: false, muted: false, alone: false, micWanted: false, returning: false, speaking: false, joining: false, peers: 0, hearing: 0, error: "", micError: "", publishing: false, blocked: false, ready: false, preflight: false, preflightPending: false, permission: "unknown", deviceId: "", receiveLevel: 1, micLevel: 0, receiveState: "off", radius: 0 };
  const samples = new Float32Array(SAMPLES);
  const preferences = new Map();
  let preferenceOwner = 0;
  let mic = null, pubPc = null, subPc = null, desired = [], queue = Promise.resolve();
  let listenerCount = null;
  let lifecycle = 0, micGeneration = 0, microphoneWanted = stats.micWanted = false;
  let cleanup = Promise.resolve(), receiverOpening = null;
  // A returning visitor: waiting for a first press, connecting, and an Unmute pressed while that connects.
  let armed = false, rejoining = false, unmuteAsked = false;
  const requests = new Set();
  const current = (token) => { if (token !== lifecycle) throw new Error("voice operation cancelled"); };
  const abortRequests = () => { for (const controller of requests) controller.abort(); requests.clear(); };
  let audio = null, micMeter = null, speakTimer = 0, changed = false;
  // Each connection's own pending restart after a drop, so one connection's change never cancels the other's.
  const dropTimers = new Map();
  const validId = (id) => Number.isSafeInteger(id) && id > 0;
  // Login callers (the contributing roster) resolve only against the current room. Saves never key by a name,
  // so a rename keeps its settings and a different account acquiring the old name inherits nothing.
  const playerId = (player) => {
    if (validId(player)) return player;
    if (typeof player !== "string") return 0;
    const login = player.toLowerCase();
    for (const [id, rec] of BL.net.remotes) if (rec.login.toLowerCase() === login) return id;
    return 0;
  };
  const syncPreferences = () => {
    const me = BL.net.state.me, owner = me && validId(me.id) ? me.id : 0;
    if (owner === preferenceOwner) return;
    preferenceOwner = owner; preferences.clear();
    if (owner) try {
      const raw = localStorage.getItem(PREF_KEY + owner);
      const saved = raw && raw.length <= 65536 ? JSON.parse(raw) : null;
      if (Array.isArray(saved)) for (const item of saved.slice(0, PREF_MAX)) {
        if (!Array.isArray(item) || !validId(item[0]) || typeof item[1] !== "boolean" || !Number.isFinite(item[2]) || item[2] < 0 || item[2] > 2) continue;
        if (item[1] || item[2] !== 1) preferences.set(item[0], { muted: item[1], volume: Math.min(VOLUME_MAX, item[2]) });
      }
    } catch {
      // Storage off or malformed: this account starts with defaults, never another account's settings.
    }
    // Reset synchronously on an account change, before any caller can play media with the previous listener's gain.
    for (const [id, s] of subs) { hear(s, heard(id)); setLevel(s, true); }
    emit();
  };
  const savePreferences = () => {
    if (!preferenceOwner) return;
    try {
      localStorage.setItem(PREF_KEY + preferenceOwner, JSON.stringify([...preferences].map(([id, p]) => [id, p.muted, p.volume])));
    } catch {
      // Storage off: this account's settings last until the page closes.
    }
  };
  // A radius in metres, held to the range; anything else (0, past RADIUS_MAX, not a number) is no limit.
  const radiusOf = (value) => {
    const metres = Math.round(Number(value));
    return metres > 0 && metres <= RADIUS_MAX ? Math.max(RADIUS_MIN, metres) : 0;
  };
  try {
    stats.radius = radiusOf(localStorage.getItem(RADIUS_KEY));
  } catch {
    // Storage is off: no limit.
  }

  const emit = () => {
    for (const fn of subscribers) fn(stats);
  };

  const gathered = (pc, relay = false) => new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => {
      window.clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const timer = window.setTimeout(done, relay ? RELAY_GATHER_MS : ICE_GATHER_MS);
    pc.addEventListener("icegatheringstatechange", onChange);
  });

  // Pulling a publication before its connection is up fails, so the mic is announced only once connected.
  const connected = (pc) => new Promise((resolve, reject) => {
    if (pc.connectionState === "connected") return resolve();
    const done = (ok) => {
      window.clearTimeout(timer);
      pc.removeEventListener("connectionstatechange", onChange);
      if (ok) resolve();
      else reject(new Error("voice connection failed"));
    };
    const onChange = () => {
      if (pc.connectionState === "connected") done(true);
      else if (pc.connectionState === "failed" || pc.connectionState === "closed") done(false);
    };
    const timer = window.setTimeout(() => done(false), CONNECT_MS);
    pc.addEventListener("connectionstatechange", onChange);
  });

  const meter = (stream) => {
    if (!audio) return null;
    const source = audio.createMediaStreamSource(stream), analyser = audio.createAnalyser();
    analyser.fftSize = SAMPLES;
    source.connect(analyser);
    return { source, analyser, quiet: 0, speaking: false };
  };

  // One read of a meter; true when its speaking flag changed.
  const readMeter = (m) => {
    if (!m) return false;
    m.analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < SAMPLES; i++) sum += samples[i] * samples[i];
    const level = Math.sqrt(sum / SAMPLES);
    if (m === micMeter) stats.micLevel = level;
    const loud = level > SPEAK_ON;
    m.quiet = loud ? 0 : m.quiet + 1;
    const speaking = loud || m.speaking && m.quiet < SPEAK_HOLD;
    if (speaking === m.speaking) return false;
    m.speaking = speaking;
    return true;
  };
  const listenSub = (s) => {
    if (readMeter(s.meter)) changed = true;
  };

  // Full volume inside the radius, silence at or beyond it; 0 for the radius is no limit.
  // Unknown distances are silent while a range is set.
  const falloff = (metres, radius) => !radius || Number.isFinite(metres) && metres < radius ? 1 : 0;
  // The smoothly changing share across a crossing (#392), independent of the hard hearing-range cutoff.
  const nearness = (id) => {
    const s = BL.net.state, zone = s.zone, rec = BL.net.remotes.get(id);
    let share = 1;
    if ((s.blendTo || rec && rec.blendTo) && BL.net.voiceLink(id) !== "linked") {
      if (!rec) return 0;
      share = BL.voiceBlend.gain(zone, s.blendTo, s.blendT, rec.zone, rec.blendTo, rec.blendK / BL.voiceBlend.STEPS);
    }
    return share;
  };
  // Two zones a crossing joins share coordinates, so a voice across it is measured too.
  const withinRange = (id) => {
    if (!stats.radius || BL.net.voiceLink(id) === "linked") return 1;
    const s = BL.net.state, zone = s.zone, me = s.self, rec = BL.net.remotes.get(id);
    if (me.zone !== zone) return 1;
    const frame = BL.voiceBlend.sameFrame;
    const across = rec && (frame(rec.zone, zone) || rec.zone === s.blendTo || rec.blendTo === zone);
    if (!across || rec.poseZone !== rec.zone) return 0;
    return falloff(Math.hypot(rec.x - me.x, rec.y - me.y, rec.z - me.z), stats.radius);
  };
  // Whether this visitor could hear player `id` where both stand now: a voice link, or one place by the room's rule
  // (`sharesPlace` in worker/src/protocol.js) and inside the hearing range. For the Online Oogas panel's faded mark.
  const inEarshot = (id) => {
    if (BL.net.voiceLink(id) === "linked") return true;
    const s = BL.net.state, rec = BL.net.remotes.get(id), B = BL.voiceBlend;
    if (!rec || !withinRange(id)) return false;
    const k = s.blendTo ? Math.max(1, Math.min(B.STEPS, Math.round(s.blendT * B.STEPS))) : 0;
    return s.blendTo || rec.blendTo || B.world(s.zone) || B.world(rec.zone) ? B.shares(s.zone, s.blendTo, k, rec.zone, rec.blendTo, rec.blendK) : B.group(s.zone) === B.group(rec.zone);
  };
  const localVolume = (id) => preferences.get(id)?.volume ?? 1;
  const playVolume = (s) => stats.receiveLevel * s.near * s.inRange * localVolume(s.id);
  // A voice's level where it plays: its element's volume, or on GAIN_PLAY its gain (nothing until its track lands), which
  // also carries whether it is heard at all.
  const setLevel = (s, immediate = false) => {
    if (!GAIN_PLAY) s.el.volume = playVolume(s);
    else if (s.gain) {
      const value = s.on ? playVolume(s) : 0, param = s.gain.gain;
      s.limiter.ratio.value = localVolume(s.id) > 1 ? 20 : 1;
      if (immediate) { param.cancelScheduledValues(audio.currentTime); param.setValueAtTime(value, audio.currentTime); }
      else param.setTargetAtTime(value, audio.currentTime, GAIN_TAU);
    }
  };
  // Plays a received voice or silences it for this page: its element's mute, or on GAIN_PLAY its gain, the element
  // staying muted.
  const hear = (s, on) => {
    s.on = on;
    if (GAIN_PLAY) setLevel(s, !on);
    else s.el.muted = !on;
  };
  const nearSub = (s, id) => {
    const want = nearness(id), near = s.near, inRange = withinRange(id), cutoff = inRange !== s.inRange;
    if (want === near && !cutoff) return;
    s.inRange = inRange;
    s.near = want > near ? Math.min(want, near + NEAR_STEP) : Math.max(want, near - NEAR_STEP);
    setLevel(s, cutoff);
  };
  const poll = () => {
    syncPreferences();
    changed = false;
    readMeter(micMeter);
    subs.forEach(listenSub);
    subs.forEach(nearSub);
    const self = stats.publishing && !!(micMeter && micMeter.speaking) && !stats.muted && !stats.alone;
    if (self !== stats.speaking) {
      stats.speaking = self;
      changed = true;
    }
    if (changed || stats.preflight) emit();
  };

  const PLAY_BLOCKED = "Press Enable sound to hear voices";
  // A voice with media is blocked until a gesture when its element's play was refused, or on GAIN_PLAY while the
  // context is not running.
  const reflectBlocked = () => {
    const asleep = GAIN_PLAY && !!audio && audio.state !== "running";
    stats.blocked = [...subs.values()].some((sub) => (sub.blocked || asleep) && sub.el.srcObject);
    if (stats.blocked) stats.error = PLAY_BLOCKED;
    else if (stats.error === PLAY_BLOCKED) stats.error = "";
    emit();
  };
  const playSub = (sub) => {
    const token = lifecycle, stream = sub.el.srcObject;
    if (!stream) return;
    sub.el.play().then(() => {
      if (token !== lifecycle || sub.el.srcObject !== stream) return;
      sub.blocked = false; reflectBlocked();
    }).catch(() => {
      if (token !== lifecycle || sub.el.srcObject !== stream) return;
      sub.blocked = true; reflectBlocked();
    });
  };
  // On GAIN_PLAY a voice sounds through a gain and peak limiter on its meter's own source. Its first
  // level is set at once, so a voice that lands faded or muted never starts at full.
  const plug = (s) => {
    s.gain = audio.createGain(); s.limiter = audio.createDynamicsCompressor();
    s.gain.gain.value = s.on ? playVolume(s) : 0;
    s.limiter.threshold.value = -1; s.limiter.knee.value = 0; s.limiter.ratio.value = localVolume(s.id) > 1 ? 20 : 1;
    s.limiter.attack.value = 0.003; s.limiter.release.value = 0.1;
    s.meter.source.connect(s.gain);
    s.gain.connect(s.limiter); s.limiter.connect(audio.destination);
  };
  // Lets go of a voice's audio nodes; a source is bound to its one stream, so nothing here is kept for reuse.
  const unplug = (s) => {
    if (s.meter) s.meter.source.disconnect();
    if (s.gain) s.gain.disconnect();
    if (s.limiter) s.limiter.disconnect();
    s.meter = s.gain = s.limiter = null;
  };
  const silence = (s, notify = true) => {
    s.el.muted = true;
    s.el.pause();
    if (s.el.srcObject) for (const track of s.el.srcObject.getTracks()) track.stop();
    s.el.srcObject = null; s.blocked = false;
    if (notify) reflectBlocked();
    unplug(s);
  };

  // Whether this page plays a remote voice: the room wants it heard and this visitor has not muted them.
  const heard = (id) => {
    if (!preferenceOwner || !desired.includes(id)) return false;
    const sub = subs.get(id);
    return (!sub || sub.gen === wantedGen.get(id)) && !preferences.get(id)?.muted;
  };

  const api = async (op, body, token = lifecycle) => {
    current(token);
    const controller = new AbortController();
    requests.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), CONNECT_MS);
    try {
      const res = await fetch(`/api/voice/${op}`, {
        method: "POST", credentials: "same-origin", signal: controller.signal,
        headers: { "content-type": "application/json", "x-room-token": BL.net.state.connectionToken || "" },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      current(token);
      if (!res.ok) throw new Error(data.error || `voice ${op} ${res.status}`);
      return data;
    } finally { window.clearTimeout(timeout); requests.delete(controller); }
  };

  // Keep the direct candidates. A configured Worker can add a short-lived TLS relay to both peers.
  let relayConfig = ICE, relayRequest = null, relayTimer = 0, relayProbe = null;
  const relayRenewals = [];
  const scheduleRelay = (token, ttl) => {
    window.clearTimeout(relayTimer);
    relayTimer = window.setTimeout(() => token === lifecycle ? renewRelay(token, true) : undefined, (ttl - 60) * 1000);
  };
  const clearRelay = () => {
    window.clearTimeout(relayTimer);
    relayTimer = 0; relayRequest = null; relayConfig = ICE; relayProbe = null;
  };
  const renewRelay = (token, renewal = false) => {
    if (token !== lifecycle) return;
    const sample = renewal ? { startedAt: Date.now(), credentialsMs: null, rebuildAt: null, rebuildMs: null, firstTrackMs: null,
      status: "fetching", peers: desired.length, muted: stats.muted } : null;
    if (sample) { if (relayRenewals.length === 8) relayRenewals.shift(); relayRenewals.push(sample); }
    const refresh = async () => {
      const data = await api("ice", null, token).catch(() => null);
      current(token);
      if (relayRequest !== pending) return ICE;
      const server = data?.iceServers?.[0], ttl = data?.ttl;
      if (!server || server.urls !== TURN_TLS || !server.username || !server.credential || !Number.isInteger(ttl) || ttl < 120 || ttl > 172800) {
        if (sample) sample.status = "credentials-unavailable";
        if (relayConfig !== ICE) relayTimer = window.setTimeout(() => renewRelay(token, true), 60000);
        return relayConfig;
      }
      const config = { ...ICE, iceServers: [...ICE.iceServers, server] };
      // setConfiguration alone does not replace an established TURN allocation. Rebuild both
      // connections before expiry. Mint credentials while the old audio still runs, then use
      // the ordinary recovery path (one publication per account) with its preserved mute.
      if (sample) {
        sample.credentialsMs = Date.now() - sample.startedAt; sample.rebuildAt = Date.now(); sample.status = "rebuilding";
        await restart(false, { config, ttl, sample });
        sample.rebuildMs = Date.now() - sample.rebuildAt; sample.status = stats.enabled ? "rebuilt" : "stopped";
      } else { relayConfig = config; scheduleRelay(token, ttl); }
      return config;
    };
    const pending = refresh().catch(() => { if (sample) sample.status = "cancelled"; return ICE; });
    relayRequest = pending;
    return pending;
  };
  const iceFor = (token) => {
    if (!BL.net.state.voiceTurn) return ICE;
    if (!relayRequest) renewRelay(token);
    return relayRequest;
  };

  // Either connection failing, or staying disconnected past DROP_GRACE_MS, after it was up: start voice over, which
  // publishes the microphone again (a new count, so every listener pulls it anew) and pulls every voice again.
  const watch = (pc) => {
    pc.addEventListener("connectionstatechange", () => {
      if (pc !== pubPc && pc !== subPc) return;
      if (pc === subPc) { stats.receiveState = pc.connectionState; emit(); }
      window.clearTimeout(dropTimers.get(pc));
      dropTimers.delete(pc);
      if (pc.connectionState === "failed") restart();
      else if (pc.connectionState === "disconnected") dropTimers.set(pc, window.setTimeout(() => {
        dropTimers.delete(pc);
        if ((pc === pubPc || pc === subPc) && pc.connectionState !== "connected") restart();
      }, DROP_GRACE_MS));
    });
  };

  // The microphone's session and connection, announced only once connected; one more try on a fresh session
  // when the first connection does not come up.
  const publish = async (token, generation) => {
    await cleanup;
    const valid = () => { current(token); if (!microphoneWanted || generation !== micGeneration) throw new Error("microphone cancelled"); };
    for (let attempt = 0; ; attempt++) {
      valid();
      const config = await iceFor(token); valid();
      let pc = null;
      try {
        await api("session", { kind: "pub" }, token); valid();
        pc = new RTCPeerConnection(config);
        pubPc = pc;
        const tx = pc.addTransceiver(mic.getAudioTracks()[0], { direction: "sendonly" });
        const offer = await pc.createOffer(); valid();
        await pc.setLocalDescription(offer); valid();
        await gathered(pc, config !== ICE); valid();
        const pub = await api("publish", { sdp: pc.localDescription.sdp, mid: tx.mid }, token); valid();
        await pc.setRemoteDescription(pub.sessionDescription); valid();
        await connected(pc); valid();
        watch(pc);
        await api("live", null, token); valid();
        return;
      } catch (err) {
        if (pc) { pc.close(); if (pubPc === pc) pubPc = null; }
        valid();
        if (attempt) throw err;
      }
    }
  };

  const teardown = () => {
    clearRelay();
    window.clearTimeout(retryTimer);
    retried = false;
    for (const timer of dropTimers.values()) window.clearTimeout(timer);
    dropTimers.clear();
    window.clearInterval(speakTimer);
    speakTimer = 0;
    // Retire connections before close callbacks or UI notifications can observe them.
    const oldPub = pubPc, oldSub = subPc;
    pubPc = subPc = null;
    stats.enabled = false;
    if (oldPub) oldPub.close();
    if (oldSub) oldSub.close();
    for (const s of subs.values()) silence(s, false);
    subs.clear();
    stats.ready = false; stats.receiveState = "off";
    stats.blocked = false;
    if (stats.error === PLAY_BLOCKED) stats.error = "";
    stats.publishing = false;
    stats.speaking = false;
    stats.peers = stats.hearing = 0;
  };

  const activate = () => {
    syncPreferences();
    if (!audio && window.AudioContext) {
      audio = new AudioContext();
      if (GAIN_PLAY) audio.addEventListener("statechange", reflectBlocked);
    }
    if (audio) audio.resume().catch(() => {});
    for (const s of subs.values()) playSub(s);
  };
  // On GAIN_PLAY a tap or key wakes a context Safari left suspended or interrupted, inside that gesture as it requires;
  // a touch counts as a gesture only as it lifts, so pointerup rather than pointerdown.
  const wake = (e) => {
    if (e.isTrusted && audio && audio.state !== "running" && audio.state !== "closed") audio.resume().catch(() => {});
  };
  if (GAIN_PLAY) {
    window.addEventListener("pointerup", wake, true);
    window.addEventListener("keydown", wake, true);
  }

  // What a visitor in voice hears as a hidden tab nears leaving the room (net.js), and the hang-up as it does: on this
  // page alone, straight to the context's output as the voices go, so the environment mute does not silence them. One
  // oscillator and gain for the context's life; a cue only schedules automation on them. Each note is [Hz, seconds].
  const CUE_LEVEL = 0.22, CUE_EDGE = 0.012, CUE_GAP = 0.05, CUE_START = 0.02;
  const CUE_WARNINGS = [[[659.25, 0.16], [880, 0.24]], [[880, 0.12], [880, 0.12], [880, 0.2]]];
  const CUE_HANG_UP = [[523.25, 0.16], [392, 0.16], [261.63, 0.36]];
  let cueOsc = null, cueGain = null;
  const playCue = (notes) => {
    if (!stats.enabled || !audio || audio.state !== "running") return 0;
    if (!cueGain) {
      cueGain = audio.createGain();
      cueGain.gain.value = 0;
      cueGain.connect(audio.destination);
      cueOsc = audio.createOscillator();
      cueOsc.type = "triangle";
      cueOsc.connect(cueGain);
      cueOsc.start();
    }
    const gain = cueGain.gain, begin = audio.currentTime + CUE_START;
    gain.cancelScheduledValues(begin);
    let t = begin;
    for (let i = 0; i < notes.length; i++) {
      const hz = notes[i][0], seconds = notes[i][1];
      cueOsc.frequency.setValueAtTime(hz, t);
      gain.setValueAtTime(0, t);
      gain.linearRampToValueAtTime(CUE_LEVEL, t + CUE_EDGE);
      gain.setValueAtTime(CUE_LEVEL, t + seconds - CUE_EDGE);
      gain.linearRampToValueAtTime(0, t + seconds);
      t += seconds + CUE_GAP;
    }
    return Math.ceil((t - audio.currentTime) * 1000);
  };
  const warnLeaving = (stage) => { playCue(CUE_WARNINGS[stage]); };
  // How long the hang-up lasts, in milliseconds, so the room is left once it has played; 0 for a visitor not in voice.
  const hangUp = () => playCue(CUE_HANG_UP);

  // Listening does not acquire or publish a microphone. Both entry points run inside a gesture.
  const listen = async () => {
    activate();
    if (stats.enabled || stats.joining) return;
    const token = lifecycle;
    stats.joining = true; stats.error = ""; emit();
    try {
      await openReceiver(token);
      if (token !== lifecycle) return;
      stats.enabled = true; stats.ready = true;
      window.clearInterval(speakTimer);
      speakTimer = window.setInterval(poll, SPEAK_MS);
      schedule();
    } catch {
      if (token === lifecycle) { stats.error = "voice unavailable"; teardown(); }
    } finally {
      if (token === lifecycle) { stats.joining = false; emit(); }
    }
  };
  const micConstraints = () => ({ audio: { echoCancellation: true, noiseSuppression: true,
    autoGainControl: true, ...(stats.deviceId ? { deviceId: { exact: stats.deviceId } } : {}) } });
  const devices = async () => {
    const list = await navigator.mediaDevices.enumerateDevices();
    return list.filter((device) => device.kind === "audioinput").map((device) => ({ deviceId: device.deviceId, label: device.label }));
  };
  // Hardware preview is local only: it never calls the SFU or grants publication consent.
  const preflight = async (deviceId = stats.deviceId) => {
    if (stats.publishing || stats.joining) return false;
    cancelPreflight();
    stats.deviceId = String(deviceId || "");
    activate();
    const token = lifecycle, generation = ++micGeneration;
    stats.permission = "requesting"; stats.preflightPending = true; stats.micError = ""; emit();
    try {
      const stream = await navigator.mediaDevices.getUserMedia(micConstraints());
      if (token !== lifecycle || generation !== micGeneration) {
        for (const track of stream.getTracks()) track.stop(); return false;
      }
      mic = stream; micMeter = meter(stream);
      stats.preflight = true; stats.preflightPending = false; stats.permission = "granted";
      window.clearInterval(speakTimer); speakTimer = window.setInterval(poll, SPEAK_MS);
      emit(); return true;
    } catch (err) {
      if (token === lifecycle && generation === micGeneration) {
        stats.preflightPending = false;
        stats.permission = err.name === "NotAllowedError" ? "denied" : "unknown";
        stats.micError = err.name === "NotAllowedError" ? "microphone blocked" : "microphone unavailable"; emit();
      }
      return false;
    }
  };
  const cancelPreflight = () => {
    if (stats.publishing || microphoneWanted) return;
    micGeneration++;
    if (mic) for (const track of mic.getTracks()) track.stop();
    mic = null;
    if (micMeter) micMeter.source.disconnect();
    micMeter = null; stats.preflight = false; stats.preflightPending = false; stats.micLevel = 0;
    if (stats.permission === "requesting") stats.permission = "unknown";
    if (!stats.enabled) { window.clearInterval(speakTimer); speakTimer = 0; }
    emit();
  };
  const selectDevice = async (deviceId) => {
    if (stats.publishing || microphoneWanted) dropMic();
    return preflight(deviceId);
  };
  const setReceiveLevel = (value) => {
    const level = Number(value);
    if (!Number.isFinite(level)) return;
    stats.receiveLevel = Math.max(0, Math.min(1, level));
    for (const s of subs.values()) setLevel(s);
    emit();
  };
  // This visitor's hearing range, for this browser on every visit; apply its cutoff immediately.
  const setRadius = (metres) => {
    const radius = radiusOf(metres);
    if (radius === stats.radius) return;
    stats.radius = radius;
    try {
      localStorage.setItem(RADIUS_KEY, String(radius));
    } catch {
      // Storage off: the range lasts this page.
    }
    subs.forEach(nearSub);
    emit();
  };
  // The microphone itself went (unplugged, a headset switched off): the speaker would go on hearing everyone and sending
  // nothing, with nothing to say so. Back in on the device that is there.
  const micLost = () => {
    if (!stats.publishing) return;
    if (mic) for (const track of mic.getTracks()) track.stop();
    mic = null;
    stats.deviceId = "";
    if (micMeter) micMeter.source.disconnect();
    micMeter = null;
    restart();
  };
  const enable = async (preserveMute = false) => {
    activate();
    if (stats.joining || stats.publishing) return;
    disarm();
    const token = lifecycle, generation = ++micGeneration;
    stats.joining = true; stats.micError = ""; microphoneWanted = stats.micWanted = true; stats.permission = "requesting"; stats.preflight = false; stats.preflightPending = false;
    if (!preserveMute) stats.muted = false;
    emit();
    let openingReceiver = false, openingPublisher = false;
    try {
      const stream = mic || await navigator.mediaDevices.getUserMedia(micConstraints());
      if (token !== lifecycle || generation !== micGeneration || !microphoneWanted) { for (const track of stream.getTracks()) track.stop(); return; }
      mic = stream; stats.permission = "granted";
      for (const track of mic.getAudioTracks()) { track.enabled = !stats.muted; track.onended = micLost; }
      micMeter = micMeter || meter(mic);
      gate();
      openingPublisher = true;
      await publish(token, generation);
      openingPublisher = false;
      if (token !== lifecycle || generation !== micGeneration || !microphoneWanted) return;
      stats.publishing = true;
      if (!subPc) { openingReceiver = true; await openReceiver(token); }
      if (token !== lifecycle) return;
      stats.enabled = true; stats.ready = true; stats.returning = false;
      setMuted(stats.muted);
      window.clearInterval(speakTimer);
      speakTimer = window.setInterval(poll, SPEAK_MS);
      schedule();
    } catch (err) {
      if (token === lifecycle && generation === micGeneration) {
        if (openingReceiver || openingPublisher) stats.error = "voice connection unavailable";
        else {
          stats.permission = err.name === "NotAllowedError" ? "denied" : "unknown";
          stats.micError = err.name === "NotAllowedError" ? "microphone blocked" : "microphone unavailable or not permitted";
        }
        dropMic();
      }
    } finally {
      if (token === lifecycle && generation === micGeneration) { stats.joining = false; gate(); emit(); }
    }
  };

  // The receiving side: a fresh session and connection, every remote voice pulled into it anew. Also the
  // recovery when the SFU refuses a pull on a receive session it calls disconnected.
  const openReceiver = (token = lifecycle) => {
    if (receiverOpening && receiverOpening.token === token) return receiverOpening.promise;
    const opening = { token, promise: null };
    opening.promise = createReceiver(token).finally(() => {
      if (receiverOpening === opening) receiverOpening = null;
    });
    receiverOpening = opening;
    return opening.promise;
  };
  const createReceiver = async (token) => {
    await cleanup;
    current(token);
    for (const s of subs.values()) silence(s);
    subs.clear();
    if (subPc) subPc.close();
    subPc = null;
    const config = await iceFor(token); current(token);
    await api("session", { kind: "sub" }, token);
    current(token);
    const pc = new RTCPeerConnection(config);
    subPc = pc; stats.receiveState = "idle";
    watch(pc);
    pc.addEventListener("track", (e) => {
      if (token !== lifecycle || pc !== subPc) return;
      syncPreferences();
      for (const [id, s] of subs) {
        if (s.mid !== e.transceiver.mid) continue;
        if (relayProbe?.token === token && relayProbe.sample.firstTrackMs === null) relayProbe.sample.firstTrackMs = Date.now() - relayProbe.sample.rebuildAt;
        // A track landing again for the same voice replaces its nodes, so it never plays twice.
        unplug(s);
        s.near = nearness(id); s.inRange = withinRange(id); hear(s, heard(id) && s.gen === wantedGen.get(id)); setLevel(s, true);
        s.el.srcObject = new MediaStream([e.track]);
        s.meter = meter(s.el.srcObject);
        if (GAIN_PLAY) plug(s);
        playSub(s);
      }
      countHearing();
    });
  };

  // The microphone sends only when this visitor has not muted it and the room lists someone to hear it.
  const gate = () => {
    // Only a visitor who opted in to speak (passed the mic test and permission step) is ever "alone";
    // a listen-only visitor has no microphone to hold off.
    stats.alone = microphoneWanted && (stats.publishing || stats.joining) && (listenerCount ?? desired.length) === 0;
    if (mic) for (const t of mic.getAudioTracks()) t.enabled = !stats.muted && !stats.alone;
  };

  const setMuted = (on) => {
    stats.muted = on;
    gate();
    BL.net.setMuted(on);
    emit();
  };

  // Whether this account pressed Join voice here and has not pressed Leave voice since.
  const joinedBefore = () => {
    const me = BL.net.state.me;
    try {
      return !!me && validId(me.id) && localStorage.getItem(JOINED_KEY + me.id) === "1";
    } catch {
      return false;
    }
  };
  const rememberJoined = (on) => {
    const me = BL.net.state.me;
    if (!me || !validId(me.id)) return;
    try {
      if (on) localStorage.setItem(JOINED_KEY + me.id, "1");
      else localStorage.removeItem(JOINED_KEY + me.id);
    } catch {
      // Storage off: the next session starts out of voice.
    }
  };

  const firstPress = (e) => {
    if (e.isTrusted && !(navigator.userActivation && !navigator.userActivation.hasBeenActive)) rejoin();
  };
  const disarm = () => {
    if (!armed) return;
    armed = false;
    window.removeEventListener("pointerup", firstPress, true);
    window.removeEventListener("keydown", firstPress, true);
  };
  const notReturning = () => { disarm(); stats.returning = false; setMuted(false); };
  const rejoin = async () => {
    disarm();
    if (BL.net.state.zone === STUDIO_ZONE) { notReturning(); return; }
    const token = lifecycle;
    BL.net.setMuted(true);
    rejoining = true;
    await listen();
    rejoining = false;
    if (token !== lifecycle) return;
    const unmute = unmuteAsked;
    unmuteAsked = false;
    if (!stats.enabled) notReturning();
    else if (unmute) join();
  };
  const resume = () => {
    if (armed || stats.enabled || stats.joining || BL.net.state.zone === STUDIO_ZONE || !joinedBefore()) return;
    armed = stats.returning = stats.muted = true;
    window.addEventListener("pointerup", firstPress, true);
    window.addEventListener("keydown", firstPress, true);
    emit();
    if (navigator.userActivation && navigator.userActivation.hasBeenActive) rejoin();
  };

  const join = () => enable().then(() => { if (stats.publishing) rememberJoined(true); });

  // The footer's button: join, then mute and unmute. An Unmute while a returning visitor connects waits for that.
  const toggle = () => {
    if (armed) rejoin();
    if (rejoining) unmuteAsked = true;
    else if (!stats.publishing) join();
    else setMuted(!stats.muted);
  };

  // Leave voice, the visitor's own choice: unlike every other stop, the next session starts out of voice.
  const leave = () => { rememberJoined(false); stop(); };

  // Leaving voice for good (Leave voice, sign-out, another tab took over): the microphone is released too.
  const stop = () => {
    lifecycle++; micGeneration++; abortRequests(); microphoneWanted = stats.micWanted = false;
    disarm(); rejoining = unmuteAsked = stats.returning = false;
    const was = stats.enabled || stats.joining || !!pubPc || !!subPc;
    stats.joining = false; teardown();
    if (mic) for (const t of mic.getTracks()) t.stop();
    mic = null; stats.preflight = false; stats.preflightPending = false; stats.micLevel = 0;
    if (stats.permission === "requesting") stats.permission = "unknown";
    if (micMeter) micMeter.source.disconnect();
    micMeter = null;
    if (audio) audio.close().catch(() => {});
    audio = null;
    cueOsc = cueGain = null;
    stats.muted = stats.alone = false; stats.micError = "";
    BL.net.setMuted(false);
    desired = [];
    listenerCount = null;
    wantedGen.clear();
    if (was) cleanup = api("leave").catch(() => {});
    emit();
  };

  // Revocation releases hardware while keeping receive-only audio available.
  const dropMic = () => {
    micGeneration++; microphoneWanted = stats.micWanted = false; stats.joining = false;
    if (!stats.enabled) clearRelay();
    if (mic) for (const track of mic.getTracks()) track.stop();
    mic = null; stats.preflight = false; stats.preflightPending = false; stats.micLevel = 0;
    if (stats.permission === "requesting") stats.permission = "unknown";
    if (micMeter) micMeter.source.disconnect();
    micMeter = null;
    if (pubPc) pubPc.close();
    pubPc = null; stats.publishing = false; stats.speaking = false; stats.alone = false;
    stats.muted = true; BL.net.setMuted(true);
    cleanup = api("unpublish").catch(() => {});
    emit();
  };
  // `welcomed`: the room has just let this page in, which puts a visitor out of voice back in if they were.
  let restarting = false;
  const restart = async (welcomed = false, preparedRelay = null) => {
    // A welcome during a restart is the same blip: it must not put a speaker back in as a muted listener.
    if (!stats.enabled) { if (welcomed && !restarting) resume(); return; }
    const wanted = microphoneWanted, muted = stats.muted;
    const token = ++lifecycle; micGeneration++; abortRequests();
    teardown(); stats.joining = false;
    if (preparedRelay) {
      relayConfig = preparedRelay.config; relayRequest = Promise.resolve(relayConfig);
      relayProbe = { token, sample: preparedRelay.sample }; scheduleRelay(token, preparedRelay.ttl);
    }
    restarting = true;
    try {
      cleanup = api("leave", null, token).catch(() => {});
      await cleanup;
      if (token !== lifecycle) return;
      if (!wanted || !microphoneWanted) { await listen(); return; }
      // A failed call here is usually the same network blip that caused the restart: it should not end a speaker's voice.
      for (let tries = 1; ; tries++) {
        await enable(true);
        if (token !== lifecycle || stats.publishing || stats.permission === "denied" || tries === RESTART_TRIES) return;
        await new Promise((resolve) => window.setTimeout(resolve, RESTART_WAIT_MS));
        if (token !== lifecycle) return;
        // Giving up the microphone muted this page; the next try comes back as the visitor had it.
        microphoneWanted = stats.micWanted = true; stats.muted = muted;
      }
    } finally { restarting = false; }
  };

  // Whom the room wants heard, and each one's publication count (`gens`; none from an older room).
  const setPeers = (ids, gens = null, listeners = null) => {
    syncPreferences();
    desired = ids.slice();
    listenerCount = Number.isSafeInteger(listeners) && listeners >= 0 && listeners < 32 ? listeners : null;
    wantedGen.clear();
    for (let i = 0; i < ids.length; i++) wantedGen.set(ids[i], gens ? gens[i] : 0);
    for (const [id, s] of subs) hear(s, heard(id));
    const was = stats.alone;
    gate();
    if (stats.alone !== was) emit();
    schedule();
  };

  // A failed change is tried once more after RETRY_MS on a fresh receive session (the SFU can call a new
  // one disconnected) before the button says voice is unavailable; the room's next change tries again.
  let retried = false, retryTimer = 0;
  const schedule = () => {
    const token = lifecycle;
    queue = queue.then(() => { current(token); return apply(token); }).then(() => {
      if (token !== lifecycle) return;
      retried = false;
      if (!stats.error || stats.blocked) return;
      stats.error = ""; emit();
    }, () => {
      if (token !== lifecycle || !stats.enabled) return;
      if (!retried) {
        retried = true;
        window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(() => {
          if (token !== lifecycle || !stats.enabled) return;
          queue = queue.then(() => openReceiver(token)).catch(() => {});
          schedule();
        }, RETRY_MS);
        return;
      }
      stats.error = "voice unavailable"; emit();
      // Whoever is still wanted goes on being tried, slowly, rather than waiting on the room's next change.
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => { if (token === lifecycle && stats.enabled) schedule(); }, SLOW_RETRY_MS);
    });
  };

  // Close whom the room no longer wants heard, and anyone whose microphone was published again; pull whom it
  // newly wants; renegotiate when the SFU asks. A wanted voice the pull did not deliver fails the change, so
  // it is retried rather than left silent.
  const apply = async (token) => {
    current(token);
    if (!stats.enabled) return;
    // A retry that could not open a new receive session leaves none, and nothing else would notice: open one or fail the change.
    if (!subPc) { await openReceiver(token); current(token); }
    const pc = subPc;
    const valid = () => { current(token); if (pc !== subPc) throw new Error("receiver replaced"); };
    const want = new Set(desired);
    const mids = [];
    for (const [id, s] of subs) {
      if (want.has(id) && s.gen === wantedGen.get(id)) continue;
      silence(s);
      const tx = pc.getTransceivers().find((t) => t.mid === s.mid);
      try {
        if (tx) tx.stop();
      } catch {
        // Already stopped.
      }
      mids.push(s.mid);
      subs.delete(id);
    }
    if (mids.length) { await api("close", { mids }, token); valid(); }
    const add = desired.filter((id) => !subs.has(id));
    if (add.length) {
      stats.receiveState = pc.connectionState === "connected" ? "connected" : "connecting"; emit();
      const generations = new Map(add.map(id => [id, wantedGen.get(id)]));
      const res = await api("pull", { ids: add }, token); valid();
      for (const t of res.tracks) {
        if (t.errorCode || t.id === null) continue;
        const el = new Audio(), sub = { id: t.id, mid: t.mid, el, meter: null, gain: null, limiter: null, on: false, blocked: false, gen: generations.get(t.id), near: nearness(t.id), inRange: withinRange(t.id) };
        setLevel(sub);
        el.autoplay = true;
        el.muted = true;
        hear(sub, heard(t.id) && generations.get(t.id) === wantedGen.get(t.id));
        subs.set(t.id, sub);
      }
      if (res.requiresImmediateRenegotiation && res.sessionDescription) {
        await pc.setRemoteDescription(res.sessionDescription); valid();
        const answer = await pc.createAnswer(); valid();
        await pc.setLocalDescription(answer); valid();
        await gathered(pc, relayConfig !== ICE); valid();
        await api("renegotiate", { sdp: pc.localDescription.sdp }, token); valid();
      }
      // Against the list as it stands now: someone who left while this pull was out is no failure, and must not cost the listener every other voice.
      for (const id of add) if (!subs.has(id) && desired.includes(id)) throw new Error("voice pull incomplete");
    }
    if (!subs.size && pc.connectionState === "new") stats.receiveState = "idle";
    if (stats.peers !== subs.size) {
      stats.peers = subs.size;
      emit();
    }
    countHearing();
  };

  // How many remote voices have media arriving: pulled is not heard until the track lands.
  const countHearing = () => {
    let n = 0;
    for (const s of subs.values()) if (s.el.srcObject) n++;
    if (n === stats.hearing) return;
    stats.hearing = n;
    emit();
  };

  // Whether a voice this page receives is speaking now; false for anyone not received.
  const speaking = (id) => {
    const s = subs.get(id);
    return !!(s && s.meter && s.meter.speaking);
  };

  // Preferences are available before joining voice: no context, microphone or network operation is needed.
  const setPreference = (player, muted, volume) => {
    syncPreferences();
    const id = playerId(player);
    if (!preferenceOwner || !id || id === preferenceOwner) return;
    const previous = preferences.get(id), nextMuted = muted ?? previous?.muted ?? false, nextVolume = volume ?? previous?.volume ?? 1;
    if (nextMuted === (previous?.muted ?? false) && nextVolume === (previous?.volume ?? 1)) return;
    if (!nextMuted && nextVolume === 1) preferences.delete(id);
    else {
      if (!previous && preferences.size >= PREF_MAX) return;
      preferences.set(id, { muted: nextMuted, volume: nextVolume });
    }
    savePreferences();
    const sub = subs.get(id);
    if (sub) { hear(sub, heard(id)); setLevel(sub); }
    emit();
  };
  const muteLocal = (player, on) => setPreference(player, !!on, null);
  const mutedLocally = (player) => { syncPreferences(); return !!preferences.get(playerId(player))?.muted; };
  const setVolume = (player, value) => {
    const volume = Number(value);
    if (Number.isFinite(volume)) setPreference(player, null, Math.max(0, Math.min(VOLUME_MAX, volume)));
  };
  const volumeOf = (player) => { syncPreferences(); return localVolume(playerId(player)); };

  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };

  const unsubscribeAccount = BL.net.subscribe(syncPreferences);
  syncPreferences();

  const dispose = () => {
    unsubscribeAccount();
    stop();
    subscribers.clear();
  };

  // For the feed panel and debugging: whom the room wants heard, whom this page pulled, both connections, where voices play
  // and the context's state.
  const inspect = () => ({ desired: desired.slice(), pulled: [...subs.keys()], publish: pubPc ? pubPc.connectionState : "none", receive: subPc ? subPc.connectionState : "none",
    playback: GAIN_PLAY ? "gain" : "element", context: audio ? audio.state : "none",
    relayRenewals: relayRenewals.map(sample => ({ ...sample })) });

  BL.voice = { warnLeaving, hangUp, preflight, cancelPreflight, devices, selectDevice, setReceiveLevel, enable, listen, dropMic, setMuted, toggle, leave, restart, stop, setPeers, subscribe, dispose, inspect, speaking, inEarshot, muteLocal, mutedLocally, setVolume, volumeOf, VOLUME_MAX, setRadius, falloff, fades: ELEMENT_VOLUME || GAIN_PLAY, RADIUS_MIN, RADIUS_MAX, stats };
})();
