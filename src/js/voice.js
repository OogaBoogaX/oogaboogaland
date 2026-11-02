// Voice between signed-in players near the pile, on Cloudflare Realtime SFU, ported from the OBL-Audio
// prototype. Two peer connections, as in Cloudflare's video-room example: one publishes the microphone
// (the browser offers, the SFU answers), one receives (the SFU offers, the browser answers), so each
// negotiates in one direction only. Every SFU call goes through the Worker (`/api/voice/*`); the page
// never holds credentials or another player's session. The room says whom to hear (`setPeers`, from its
// `voice` message) and this module makes it so one change at a time, since a session's changes must be
// serialised. Each remote voice plays on its own <audio> element at one volume: the room lets a player
// hear only those in the same place (out on the island, HQ, one cave), and within it everyone is equal,
// unless this visitor turns their own hearing range down (below).
// `enable` must run inside the click that asks for the microphone; `toggle` is the footer's button.
// `setMuted` changes mute state without acquiring a microphone, including while joining or only listening.
// Who is speaking is measured here, for the roster: an analyser on the microphone and on each voice
// received, read every SPEAK_MS while voice is on (`stats.speaking` for this page, `speaking(id)` for
// others). A player muted for this page alone (`muteLocal`, by GitHub login, kept in localStorage) is still
// pulled and measured, only not played.
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
// is saved on the network. A voice plays at full within half the radius and fades to silence at it along a smoothstep,
// so it never cuts in or out at the edge (`falloff`). Distances are this page's last reported position (`net.state.self`)
// to each remote's, in the place both stand in: a voice in another place of the same voice group, which has coordinates
// of its own, or one not yet placed here counts as past the radius; a page with no position of its own here plays everyone.
// Gains are worked out on the speaking meter's own 150 ms read, so nothing runs while voice is off, and each moves at
// most NEAR_STEP a read, so a jump (a new radius, a teleport) fades over about a second. A local mute still wins.
// Crossings (#392): on a bridge between two places (voice-blend.js) the room also lets a player hear the place ahead,
// and each voice plays at its equal-power share (`BL.voiceBlend.gain`, from `net.state.blendT` and the speaker's step),
// times the hearing range's, so the two places fade into each other along the crossing. It eases as the range does.
// Where a voice's level goes: its element's `volume` wherever the browser honours one, as before. iOS and iPadOS ignore
// an element's volume (it always reads 1), so there (`GAIN_PLAY`) each voice plays through a Web Audio gain fed by its
// speaking meter's own source, in the context the Join click made, while its element stays muted and only keeps the
// stream flowing; the gain carries the receive level, the hearing range and the local mute alike. The gain goes straight
// to the context's output, never through the page-wide environment mute (sound.js), which voice has never joined. Its
// nodes are made when a voice's track lands and disconnected when the voice is dropped, a restart or a stop (`unplug`).
// Safari suspends or interrupts that context (a call, another app), which silences every voice, so then the voices
// count as blocked, as a refused element play does, and the next tap or key wakes it (`wake`). `fades` says whether a
// range can be heard at all: where the element's volume is honoured, or through a gain.
// Exports enable, listen, dropMic, preflight, cancelPreflight, devices, selectDevice, setReceiveLevel, setMuted, toggle, restart, stop,
// setPeers, subscribe, dispose, inspect, speaking, muteLocal, mutedLocally, setRadius, falloff, fades, RADIUS_MIN, RADIUS_MAX and stats.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const ICE = { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }], bundlePolicy: "max-bundle" };
  const ICE_GATHER_MS = 1500, CONNECT_MS = 10000, RETRY_MS = 2000;
  // A connection that drops after it was up gets this long to come back on its own before voice starts over.
  const DROP_GRACE_MS = 5000;
  // Speaking: RMS over SPEAK_ON starts it at once; SPEAK_HOLD quiet reads in a row end it, so words do not flicker.
  const SPEAK_MS = 150, SPEAK_ON = 0.02, SPEAK_HOLD = 4, SAMPLES = 1024;
  const MUTED_KEY = "oogaboogaland.voice-muted", MUTED_MAX = 512;
  // Hearing range: the radius in metres (0 is no limit), the share of it at full volume, and a gain's most change a read.
  const RADIUS_KEY = "oogaboogaland.voice-radius", RADIUS_MIN = 5, RADIUS_MAX = 60, FULL_SHARE = 0.5, NEAR_STEP = 0.15;
  // Whether this browser plays an element at the volume it is given; iOS and iPadOS keep every element at 1. Where it does
  // not and Web Audio is there, voices play through gains, each change eased over GAIN_TAU seconds so it never clicks.
  const probe = document.createElement("audio");
  probe.volume = 0.5;
  const ELEMENT_VOLUME = probe.volume === 0.5, GAIN_PLAY = !ELEMENT_VOLUME && typeof window.AudioContext === "function", GAIN_TAU = 0.05;
  const subscribers = new Set();
  const subs = new Map();
  // Each wanted voice's publication count from the room: a new count is a microphone published again.
  const wantedGen = new Map();
  const stats = { enabled: false, muted: false, alone: false, micWanted: false, speaking: false, joining: false, peers: 0, hearing: 0, error: "", micError: "", publishing: false, blocked: false, ready: false, preflight: false, preflightPending: false, permission: "unknown", deviceId: "", receiveLevel: 1, micLevel: 0, receiveState: "off", radius: 0 };
  const samples = new Float32Array(SAMPLES);
  const mutedLogins = new Set();
  let mic = null, pubPc = null, subPc = null, desired = [], queue = Promise.resolve();
  let listenerCount = null;
  let lifecycle = 0, micGeneration = 0, microphoneWanted = stats.micWanted = false;
  let cleanup = Promise.resolve(), receiverOpening = null;
  const requests = new Set();
  const current = (token) => { if (token !== lifecycle) throw new Error("voice operation cancelled"); };
  const abortRequests = () => { for (const controller of requests) controller.abort(); requests.clear(); };
  let audio = null, micMeter = null, speakTimer = 0, changed = false;
  // Each connection's own pending restart after a drop, so one connection's change never cancels the other's.
  const dropTimers = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem(MUTED_KEY));
    if (Array.isArray(saved)) for (const login of saved.slice(0, MUTED_MAX)) if (typeof login === "string" && login.length <= 39) mutedLogins.add(login.toLowerCase());
  } catch {
    // No list, or storage is off: nobody is muted.
  }
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

  const gathered = (pc) => new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => {
      window.clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const timer = window.setTimeout(done, ICE_GATHER_MS);
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

  // How loud a voice `metres` away plays within a hearing radius: full to FULL_SHARE of it, then a smoothstep down to
  // silence at the radius, flat at both ends so it never jumps; 0 for the radius is no limit. A distance that is not a
  // number plays nothing, so an element's volume is never set to NaN.
  const falloff = (metres, radius) => {
    if (!radius) return 1;
    const t = (radius - metres) / (radius * (1 - FULL_SHARE));
    return t >= 1 ? 1 : t > 0 ? t * t * (3 - 2 * t) : 0;
  };
  // The gain one remote voice wants now: its share across a crossing (#392), times the hearing range's, measured in
  // the place both players stand in. Two zones a crossing joins share coordinates, so a voice across it is measured too.
  const nearness = (id) => {
    const s = BL.net.state, zone = s.zone, rec = BL.net.remotes.get(id);
    let share = 1;
    if (s.blendTo || rec && rec.blendTo) {
      if (!rec) return 0;
      share = BL.voiceBlend.gain(zone, s.blendTo, s.blendT, rec.zone, rec.blendTo, rec.blendK / BL.voiceBlend.STEPS);
    }
    if (!stats.radius) return share;
    const me = s.self;
    if (me.zone !== zone) return share;
    const across = rec && (rec.zone === zone || rec.zone === s.blendTo || rec.blendTo === zone);
    if (!across || rec.poseZone !== rec.zone) return 0;
    return share * falloff(Math.hypot(rec.x - me.x, rec.y - me.y, rec.z - me.z), stats.radius);
  };
  const playVolume = (s) => stats.receiveLevel * s.near;
  // A voice's level where it plays: its element's volume, or on GAIN_PLAY its gain (nothing until its track lands), which
  // also carries whether it is heard at all.
  const setLevel = (s) => {
    if (!GAIN_PLAY) s.el.volume = playVolume(s);
    else if (s.gain) s.gain.gain.setTargetAtTime(s.on ? playVolume(s) : 0, audio.currentTime, GAIN_TAU);
  };
  // Plays a received voice or silences it for this page: its element's mute, or on GAIN_PLAY its gain, the element
  // staying muted.
  const hear = (s, on) => {
    s.on = on;
    if (GAIN_PLAY) setLevel(s);
    else s.el.muted = !on;
  };
  const nearSub = (s, id) => {
    const want = nearness(id), near = s.near;
    if (want === near) return;
    s.near = want > near ? Math.min(want, near + NEAR_STEP) : Math.max(want, near - NEAR_STEP);
    setLevel(s);
  };
  const poll = () => {
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
  // On GAIN_PLAY a voice sounds through a gain on its meter's own source, straight to the context's output. Its first
  // level is set at once, so a voice that lands faded or muted never starts at full.
  const plug = (s) => {
    s.gain = audio.createGain();
    s.gain.gain.value = s.on ? playVolume(s) : 0;
    s.meter.source.connect(s.gain);
    s.gain.connect(audio.destination);
  };
  // Lets go of a voice's audio nodes; a source is bound to its one stream, so nothing here is kept for reuse.
  const unplug = (s) => {
    if (s.meter) s.meter.source.disconnect();
    if (s.gain) s.gain.disconnect();
    s.meter = s.gain = null;
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
    if (!desired.includes(id)) return false;
    const rec = BL.net.remotes.get(id);
    return !rec || !mutedLogins.has(rec.login.toLowerCase());
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
      await api("session", { kind: "pub" }, token); valid();
      const pc = new RTCPeerConnection(ICE);
      pubPc = pc;
      try {
        const tx = pc.addTransceiver(mic.getAudioTracks()[0], { direction: "sendonly" });
        const offer = await pc.createOffer(); valid();
        await pc.setLocalDescription(offer); valid();
        await gathered(pc); valid();
        const pub = await api("publish", { sdp: pc.localDescription.sdp, mid: tx.mid }, token); valid();
        await pc.setRemoteDescription(pub.sessionDescription); valid();
        await connected(pc); valid();
        watch(pc);
        await api("live", null, token); valid();
        return;
      } catch (err) {
        pc.close(); if (pubPc === pc) pubPc = null;
        valid();
        if (attempt) throw err;
      }
    }
  };

  const teardown = () => {
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
    subs.forEach(setLevel);
    emit();
  };
  // This visitor's hearing range, for this browser on every visit; the next meter read eases each voice toward it.
  const setRadius = (metres) => {
    const radius = radiusOf(metres);
    if (radius === stats.radius) return;
    stats.radius = radius;
    try {
      localStorage.setItem(RADIUS_KEY, String(radius));
    } catch {
      // Storage off: the range lasts this page.
    }
    emit();
  };
  const enable = async (preserveMute = false) => {
    activate();
    if (stats.joining || stats.publishing) return;
    const token = lifecycle, generation = ++micGeneration;
    stats.joining = true; stats.micError = ""; microphoneWanted = stats.micWanted = true; stats.permission = "requesting"; stats.preflight = false; stats.preflightPending = false;
    if (!preserveMute) stats.muted = false;
    emit();
    let openingReceiver = false;
    try {
      const stream = mic || await navigator.mediaDevices.getUserMedia(micConstraints());
      if (token !== lifecycle || generation !== micGeneration || !microphoneWanted) { for (const track of stream.getTracks()) track.stop(); return; }
      mic = stream; stats.permission = "granted";
      for (const track of mic.getAudioTracks()) track.enabled = !stats.muted;
      micMeter = micMeter || meter(mic);
      gate();
      await publish(token, generation);
      if (token !== lifecycle || generation !== micGeneration || !microphoneWanted) return;
      stats.publishing = true;
      if (!subPc) { openingReceiver = true; await openReceiver(token); }
      if (token !== lifecycle) return;
      stats.enabled = true; stats.ready = true;
      setMuted(stats.muted);
      window.clearInterval(speakTimer);
      speakTimer = window.setInterval(poll, SPEAK_MS);
      schedule();
    } catch (err) {
      if (token === lifecycle && generation === micGeneration) {
        stats.permission = err.name === "NotAllowedError" ? "denied" : "unknown";
        if (openingReceiver) stats.error = "voice unavailable";
        else stats.micError = err.name === "NotAllowedError" ? "microphone blocked" : "microphone unavailable or not permitted";
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
    await api("session", { kind: "sub" }, token);
    current(token);
    const pc = new RTCPeerConnection(ICE);
    subPc = pc; stats.receiveState = "idle";
    watch(pc);
    pc.addEventListener("track", (e) => {
      if (token !== lifecycle || pc !== subPc) return;
      for (const s of subs.values()) {
        if (s.mid !== e.transceiver.mid) continue;
        // A track landing again for the same voice replaces its nodes, so it never plays twice.
        unplug(s);
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

  // The footer's button: join, then mute and unmute.
  const toggle = () => {
    if (!stats.publishing) enable();
    else setMuted(!stats.muted);
  };

  // Leaving voice for good (Leave voice, sign-out, another tab took over): the microphone is released too.
  const stop = () => {
    lifecycle++; micGeneration++; abortRequests(); microphoneWanted = stats.micWanted = false;
    const was = stats.enabled || stats.joining || !!pubPc || !!subPc;
    stats.joining = false; teardown();
    if (mic) for (const t of mic.getTracks()) t.stop();
    mic = null; stats.preflight = false; stats.preflightPending = false; stats.micLevel = 0;
    if (stats.permission === "requesting") stats.permission = "unknown";
    if (micMeter) micMeter.source.disconnect();
    micMeter = null;
    if (audio) audio.close().catch(() => {});
    audio = null;
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
  const restart = async () => {
    if (!stats.enabled) return;
    const wanted = microphoneWanted;
    const token = ++lifecycle; micGeneration++; abortRequests();
    teardown(); stats.joining = false;
    cleanup = api("leave", null, token).catch(() => {});
    await cleanup;
    if (token !== lifecycle) return;
    if (wanted && microphoneWanted) await enable(true);
    else await listen();
  };

  // Whom the room wants heard, and each one's publication count (`gens`; none from an older room).
  const setPeers = (ids, gens = null, listeners = null) => {
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
    });
  };

  // Close whom the room no longer wants heard, and anyone whose microphone was published again; pull whom it
  // newly wants; renegotiate when the SFU asks. A wanted voice the pull did not deliver fails the change, so
  // it is retried rather than left silent.
  const apply = async (token) => {
    current(token);
    if (!stats.enabled || !subPc) return;
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
        const el = new Audio(), sub = { mid: t.mid, el, meter: null, gain: null, on: false, blocked: false, gen: generations.get(t.id), near: nearness(t.id) };
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
        await gathered(pc); valid();
        await api("renegotiate", { sdp: pc.localDescription.sdp }, token); valid();
      }
      for (const id of add) if (!subs.has(id) && want.has(id)) throw new Error("voice pull incomplete");
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

  // Silences one player for this visitor alone, on every visit, until unmuted.
  const muteLocal = (login, on) => {
    const key = String(login).toLowerCase();
    if (on === mutedLogins.has(key)) return;
    if (on) {
      if (mutedLogins.size >= MUTED_MAX) return;
      mutedLogins.add(key);
    } else {
      mutedLogins.delete(key);
    }
    try {
      localStorage.setItem(MUTED_KEY, JSON.stringify([...mutedLogins]));
    } catch {
      // Storage off: the mute lasts this page.
    }
    for (const [id, s] of subs) hear(s, heard(id));
    emit();
  };
  const mutedLocally = (login) => mutedLogins.has(String(login).toLowerCase());

  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };

  const dispose = () => {
    stop();
    subscribers.clear();
  };

  // For the feed panel and debugging: whom the room wants heard, whom this page pulled, both connections, where voices play
  // and the context's state.
  const inspect = () => ({ desired: desired.slice(), pulled: [...subs.keys()], publish: pubPc ? pubPc.connectionState : "none", receive: subPc ? subPc.connectionState : "none",
    playback: GAIN_PLAY ? "gain" : "element", context: audio ? audio.state : "none" });

  BL.voice = { preflight, cancelPreflight, devices, selectDevice, setReceiveLevel, enable, listen, dropMic, setMuted, toggle, restart, stop, setPeers, subscribe, dispose, inspect, speaking, muteLocal, mutedLocally, setRadius, falloff, fades: ELEMENT_VOLUME || GAIN_PLAY, RADIUS_MIN, RADIUS_MAX, stats };
})();
