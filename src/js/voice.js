// Voice between signed-in players near the pile, on Cloudflare Realtime SFU, ported from the OBL-Audio
// prototype. Two peer connections, as in Cloudflare's video-room example: one publishes the microphone
// (the browser offers, the SFU answers), one receives (the SFU offers, the browser answers), so each
// negotiates in one direction only. Every SFU call goes through the Worker (`/api/voice/*`); the page
// never holds credentials or another player's session. The room says whom to hear (`setPeers`, from its
// `voice` message) and this module makes it so one change at a time, since a session's changes must be
// serialised. Each remote voice plays on its own <audio> element at one volume: the room lets a player
// hear only those in the same place (out on the island, HQ, one cave), and within it everyone is equal.
// `enable` must run inside the click that asks for the microphone; `toggle` is the footer's button.
// Who is speaking is measured here, for the roster: an analyser on the microphone and on each voice
// received, read every SPEAK_MS while voice is on (`stats.speaking` for this page, `speaking(id)` for
// others). A player muted for this page alone (`muteLocal`, by GitHub login, kept in localStorage) is still
// pulled and measured, only not played.
// The room's lists carry each voice's publication count, so a microphone published again (its owner
// reconnected or restarted) is pulled again rather than left on a dead track; a connection that fails or stays
// dropped after it was up starts voice over on its own, and a pull that misses a wanted voice is retried.
// Exports enable, toggle, restart, stop, setPeers, subscribe, dispose, inspect, speaking, muteLocal, mutedLocally and stats.
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
  const subscribers = new Set();
  const subs = new Map();
  // Each wanted voice's publication count from the room: a new count is a microphone published again.
  const wantedGen = new Map();
  const stats = { enabled: false, muted: false, speaking: false, joining: false, peers: 0, hearing: 0, error: "", publishing: false, blocked: false };
  const samples = new Float32Array(SAMPLES);
  const mutedLogins = new Set();
  let mic = null, pubPc = null, subPc = null, desired = [], queue = Promise.resolve();
  let lifecycle = 0, micGeneration = 0, microphoneWanted = false;
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
    const loud = Math.sqrt(sum / SAMPLES) > SPEAK_ON;
    m.quiet = loud ? 0 : m.quiet + 1;
    const speaking = loud || m.speaking && m.quiet < SPEAK_HOLD;
    if (speaking === m.speaking) return false;
    m.speaking = speaking;
    return true;
  };
  const listenSub = (s) => {
    if (readMeter(s.meter)) changed = true;
  };
  const poll = () => {
    changed = false;
    readMeter(micMeter);
    subs.forEach(listenSub);
    const self = !!(micMeter && micMeter.speaking) && !stats.muted;
    if (self !== stats.speaking) {
      stats.speaking = self;
      changed = true;
    }
    if (changed) emit();
  };

  const silence = (s) => {
    s.el.pause();
    s.el.srcObject = null;
    if (s.meter) s.meter.source.disconnect();
    s.meter = null;
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
    for (const s of subs.values()) silence(s);
    subs.clear();
    if (pubPc) pubPc.close();
    if (subPc) subPc.close();
    pubPc = subPc = null;
    stats.enabled = false;
    stats.publishing = false;
    stats.speaking = false;
    stats.peers = stats.hearing = 0;
  };

  const activate = () => {
    if (!audio && window.AudioContext) audio = new AudioContext();
    if (audio) audio.resume().catch(() => {});
    for (const s of subs.values()) if (s.el.srcObject) s.el.play().then(() => {
      stats.blocked = false; emit();
    }).catch(() => { stats.blocked = true; stats.error = "Press Enable sound to hear voices"; emit(); });
  };

  // Listening does not acquire or publish a microphone. Both entry points run inside a gesture.
  const listen = async () => {
    activate();
    if (stats.enabled || stats.joining) return;
    const token = lifecycle;
    stats.joining = true; stats.error = ""; emit();
    try {
      await openReceiver(token);
      if (token !== lifecycle) return;
      stats.enabled = true;
      window.clearInterval(speakTimer);
      speakTimer = window.setInterval(poll, SPEAK_MS);
      schedule();
    } catch {
      if (token === lifecycle) { stats.error = "voice unavailable"; teardown(); }
    } finally {
      if (token === lifecycle) { stats.joining = false; emit(); }
    }
  };
  const enable = async (preserveMute = false) => {
    activate();
    if (stats.joining || stats.publishing) return;
    const token = lifecycle, generation = ++micGeneration;
    stats.joining = true; stats.error = ""; microphoneWanted = true;
    if (!preserveMute) stats.muted = false;
    emit();
    try {
      const stream = mic || await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (token !== lifecycle || generation !== micGeneration || !microphoneWanted) { for (const track of stream.getTracks()) track.stop(); return; }
      mic = stream;
      for (const track of mic.getAudioTracks()) track.enabled = !stats.muted;
      micMeter = micMeter || meter(mic);
      await publish(token, generation);
      if (token !== lifecycle || generation !== micGeneration || !microphoneWanted) return;
      stats.publishing = true;
      if (!subPc) await openReceiver(token);
      if (token !== lifecycle) return;
      stats.enabled = true;
      setMuted(stats.muted);
      window.clearInterval(speakTimer);
      speakTimer = window.setInterval(poll, SPEAK_MS);
      schedule();
    } catch (err) {
      if (token === lifecycle && generation === micGeneration) {
        stats.error = err.name === "NotAllowedError" ? "microphone blocked" : "microphone unavailable or not permitted";
        dropMic();
      }
    } finally {
      if (token === lifecycle && generation === micGeneration) { stats.joining = false; emit(); }
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
    subPc = pc;
    watch(pc);
    pc.addEventListener("track", (e) => {
      if (token !== lifecycle || pc !== subPc) return;
      for (const s of subs.values()) {
        if (s.mid !== e.transceiver.mid) continue;
        s.el.srcObject = new MediaStream([e.track]);
        s.meter = meter(s.el.srcObject);
        s.el.play().catch(() => { stats.blocked = true; stats.error = "Press Enable sound to hear voices"; emit(); });
      }
      countHearing();
    });
  };

  const setMuted = (on) => {
    stats.muted = on;
    if (mic) for (const t of mic.getAudioTracks()) t.enabled = !on;
    BL.net.setMuted(on);
    emit();
  };

  // The footer's button: join, then mute and unmute.
  const toggle = () => {
    if (!stats.publishing) enable();
    else setMuted(!stats.muted);
  };

  // Leaving voice for good (sign-out, another tab took over): the microphone is released too.
  const stop = () => {
    lifecycle++; micGeneration++; abortRequests(); microphoneWanted = false;
    const was = stats.enabled || stats.joining || !!pubPc || !!subPc;
    stats.joining = false; teardown();
    if (mic) for (const t of mic.getTracks()) t.stop();
    mic = null;
    if (micMeter) micMeter.source.disconnect();
    micMeter = null;
    if (audio) audio.close().catch(() => {});
    audio = null;
    stats.muted = false;
    BL.net.setMuted(false);
    desired = [];
    wantedGen.clear();
    if (was) cleanup = api("leave").catch(() => {});
    emit();
  };

  // Revocation releases hardware while keeping receive-only audio available.
  const dropMic = () => {
    micGeneration++; microphoneWanted = false; stats.joining = false;
    if (mic) for (const track of mic.getTracks()) track.stop();
    mic = null;
    if (micMeter) micMeter.source.disconnect();
    micMeter = null;
    if (pubPc) pubPc.close();
    pubPc = null; stats.publishing = false; stats.speaking = false;
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
  const setPeers = (ids, gens = null) => {
    desired = ids.slice();
    wantedGen.clear();
    for (let i = 0; i < ids.length; i++) wantedGen.set(ids[i], gens ? gens[i] : 0);
    for (const [id, s] of subs) s.el.muted = !heard(id);
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
      const res = await api("pull", { ids: add }, token); valid();
      for (const t of res.tracks) {
        if (t.errorCode || t.id === null) continue;
        const el = new Audio();
        el.autoplay = true;
        el.muted = !heard(t.id);
        subs.set(t.id, { mid: t.mid, el, meter: null, gen: wantedGen.get(t.id) });
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
    for (const [id, s] of subs) s.el.muted = !heard(id);
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

  // For the feed panel and debugging: whom the room wants heard, whom this page pulled, and both connections.
  const inspect = () => ({ desired: desired.slice(), pulled: [...subs.keys()], publish: pubPc ? pubPc.connectionState : "none", receive: subPc ? subPc.connectionState : "none" });

  BL.voice = { enable, listen, dropMic, toggle, restart, stop, setPeers, subscribe, dispose, inspect, speaking, muteLocal, mutedLocally, stats };
})();
