// Ooga Chat's voice (#654, docs/ooga-chat-app.md "Voice"): one controller, apart from any view, that hears the chosen
// outdoor zone and lets an eligible contributor speak in it, through the server's opaque media operations (#666,
// `POST /api/chat/media/<op>`) on the environment's one Cloudflare Realtime SFU app. Audio goes publisher to SFU to
// listener: no browser mesh, no mix, and the page never names a session or track of anyone's but its own connection's.
//
// Listening. Every signed-in page with a live audience feed listens: a receive-only connection (`receive/open`) under the
// feed's own audience connection (the snapshot's `connection`), and `receive/sync`, which pulls whatever the server
// allows in the zone and closes what it no longer does. The page syncs on each snapshot and whenever the server says so
// (`{ type: "media", op: "sync", closed? }`); `closed` mids are dropped at once. A listener never asks for a microphone.
// One <audio> element per pulled voice plays it; a browser that blocks playback until a gesture marks the state
// `blocked`, and the next tap or key anywhere on the page plays them all. A receiver that fails is opened again with
// backoff (1 s to 30 s, RECEIVE_TRIES), then reads `failed` until `retry`.
//
// Speaking. Join Voice (`join`, from the click) asks for the microphone first, inside the gesture, and turns its track
// off before anything can carry it, so it starts muted; only then asks the audience for a speaker lease (`setRole`,
// answered over the feed with the lease's generation in `you.lease`), publishes the one microphone track
// (`publish/open`, `publish/offer`, `publish/ready`) and becomes a speaker only on the server's acknowledgement. A
// refusal, a denied or missing microphone, or a failed connection returns to listening with nothing held and says why
// (`notice`). `mute` flips the track and tells the server (`setMic`). Leave Voice (`leave`) stops and releases the
// microphone before telling the server (`publish/close`), and keeps listening. The server ending the lease (a `you` that
// no longer says pending or active: an expiry, a revocation, the island taking the identity) stops capture at once.
// Another zone (`zone`) ends speaking there and drops every voice of the old zone before the new zone's snapshot; a new
// audience connection ends everything held under the old one, and speaking is never put back by itself.
// `release(reason)` (the account's seam, ooga-chat-auth.js) ends speaking and keeps listening; `stop` ends both.
//
// `create({ broker, rtc, request, allowed, onChange, timers, target })`: `broker()` the adapter's `{ call(op, body) }` or
// null, `rtc` the browser's WebRTC and media (the fixture passes its own), `request(type, fields)` sends a request over
// the audience feed and returns its id (0 when it can't), `allowed()` whether the deployment lets anyone speak now.
// Returns `{ heard(msg), status(feedStatus), zone(next), join(), leave(), mute(), release(reason), stop(), retry(),
// dispose(), available, why, state, stats }`; `state` is `{ role, muted, phase, busy, notice, blocked, hearing, speaking,
// talking }`. Speaking is this page's own meter on the captured microphone (as the island's voice.js meters it, the same
// levels): true while an unmuted speaker's voice is loud enough, whoever else is listening, so the visitor sees it work
// alone. `talking` is the participants whose voices this page hears speaking now, from a meter on each voice it plays
// (as the island's Online Oogas reads its own), a frozen list replaced only when someone starts or stops.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const STUN = Object.freeze({ urls: "stun:stun.cloudflare.com:3478" });
  const TURN_TLS = "turns:turn.cloudflare.com:443?transport=tcp";
  const GATHER_MS = 1500, RELAY_GATHER_MS = 3500, CONNECT_MS = 10000, DROP_GRACE_MS = 5000, ASK_MS = 10000;
  const BACKOFF_MS = [1000, 30000], RECEIVE_TRIES = 6, TRACKS_MAX = 64;
  // Phases: off (no feed), connecting (opening the receiver), listening, reconnecting (a receiver opening again after a
  // failure), failed (given up until `retry`), permission (asking for the microphone), requesting (asking for a lease),
  // negotiating (publishing it), muted and open (an acknowledged speaker), leaving.
  const PHASES = ["off", "connecting", "listening", "reconnecting", "failed", "permission", "requesting", "negotiating", "muted", "open", "leaving"];
  const BUSY = new Set(["permission", "requesting", "negotiating", "leaving"]);
  // The own meter: RMS over SPEAK_ON starts speaking at once, SPEAK_HOLD quiet reads in a row end it (voice.js's values).
  const SPEAK_MS = 150, SPEAK_ON = 0.02, SPEAK_HOLD = 4, SAMPLES = 1024;
  // While a lease is held the page makes a media call this often (`ice`, the lightest): the island's Audience re-reads
  // the session with each call and carries the connection's authorisation on from it, so its hourly re-authentication
  // never closes a speaker's socket and takes the lease (worker/src/audience.js `mediaRequest`).
  const RENEW_MS = 20 * 60 * 1000;
  const NOTICE = {
    denied: "Microphone access is blocked. Allow it for this site to speak.",
    nodevice: "No microphone was found.",
    inuse: "The microphone is in use by another app.",
    refused: "Speaking isn't open to this account right now.",
    unchecked: "Contributions can't be checked right now. Try again soon.",
    island: "You're in voice on the island. Leave voice there to speak here.",
    full: "Every speaking spot here is taken. Try again soon.",
    busy: "Too many tries. Wait a moment, then try again.",
    failed: "Voice couldn't connect. Try again.",
    ended: "Your speaking ended. Join Voice to speak again.",
    reconnected: "Voice reconnected. Join Voice to speak again.",
    mic: "Your microphone stopped.",
    receive: "Can't hear the zone right now.",
    unsupported: "This browser can't do voice here."
  };
  const REFUSED = { capability_required: "refused", capability_unavailable: "unchecked", source_in_use: "island", speaker_capacity: "full", rate_limited: "busy" };
  const micNotice = (err) => {
    const name = err && err.name;
    return name === "NotAllowedError" || name === "SecurityError" ? NOTICE.denied : name === "NotFoundError" || name === "OverconstrainedError" ? NOTICE.nodevice
      : name === "NotReadableError" || name === "AbortError" ? NOTICE.inuse : NOTICE.failed;
  };
  const browser = () => {
    const devices = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
    return {
      PeerConnection: typeof RTCPeerConnection === "function" ? RTCPeerConnection : null,
      getUserMedia: devices && typeof devices.getUserMedia === "function" ? (constraints) => devices.getUserMedia(constraints) : null,
      stream: (track) => new MediaStream([track]),
      audio: () => new Audio()
    };
  };
  const IDLE = Object.freeze({ role: "listener", muted: true, phase: "off", busy: false, notice: "", blocked: false, hearing: 0, speaking: false, talking: Object.freeze([]) });
  const create = ({ broker, rtc = browser(), request = () => 0, allowed = () => true, onChange = () => {},
    timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) }, target = window } = {}) => {
    const R = rtc;
    let state = IDLE, phase = "off", notice = "", blocked = false, disposed = false;
    // The audience connection everything is held under, the zone asked for (and how many times it has changed), and the
    // server's last word on this connection (`you`).
    let connection = null, zone = null, zoneEpoch = 0, you = null;
    // Receiving: the receive connection (`{ pc, relay, syncing, again }`), its ticket (bumped to orphan anything in flight),
    // the pulled voices by mid, and the backoff.
    let sub = null, receiveTicket = 0, tries = 0, retryTimer = 0, dropTimer = 0;
    const voices = new Map();
    // Speaking: the join's ticket, the microphone, the publishing connection, the lease's generation and the mute.
    let joinTicket = 0, mic = null, pub = null, lease = 0, speaker = false, muted = true, renewTimer = 0;
    const renew = () => {
      renewTimer = 0;
      if (!speaker || disposed) return;
      call("ice").catch(() => {});
      renewTimer = timers.set(renew, RENEW_MS);
    };
    // The own meter while a microphone is held: `{ audio, source, analyser, samples, timer, quiet }`, and its reading.
    let meter = null, speaking = false;
    // The voices heard: one context for their meters (`v.meter`, `{ source, analyser, quiet, speaking }`), one read of
    // them all every SPEAK_MS while any is metered, and who is talking (`talkKey` its participants, one a line).
    let hearAudio = null, hearTimer = 0, talking = IDLE.talking, talkKey = "";
    const heardSamples = new Float32Array(SAMPLES);
    // TURN credentials, kept until shortly before they expire; requests waiting on the feed's `result`.
    let ice = null;
    const waiters = new Map();
    const stats = { opened: 0, synced: 0, captured: 0, released: 0, published: 0, closed: 0 };

    const emit = () => {
      if (disposed) return;
      let hearing = 0;
      for (const v of voices.values()) if (v.el) hearing++;
      const next = { role: speaker ? "speaker" : "listener", muted: speaker ? muted : true, phase, busy: BUSY.has(phase), notice, blocked: blocked && hearing > 0, hearing,
        speaking: speaker && !muted && speaking, talking };
      const s = state;
      if (s.role === next.role && s.muted === next.muted && s.phase === next.phase && s.notice === next.notice && s.blocked === next.blocked && s.hearing === next.hearing
        && s.speaking === next.speaking && s.talking === next.talking) return;
      state = Object.freeze(next);
      onChange(state);
    };
    const failure = (code, retryable = false) => Object.assign(new Error(code), { code, retryable });
    const call = (op, body = {}) => {
      const b = broker();
      if (!b || !connection) return Promise.reject(failure("unavailable", true));
      return b.call(op, { connection, ...body });
    };
    // A request over the audience feed, answered by its `result` (or not at all, in ASK_MS).
    const ask = (type, fields) => new Promise((resolve) => {
      const id = request(type, fields);
      if (!id) return resolve({ ok: false, error: { code: "unavailable", retryable: true } });
      const timer = timers.set(() => { waiters.delete(id); resolve({ ok: false, error: { code: "timeout", retryable: true } }); }, ASK_MS);
      waiters.set(id, (msg) => { timers.clear(timer); resolve(msg); });
    });
    const forgetWaiters = () => {
      for (const done of [...waiters.values()]) done({ ok: false, error: { code: "unavailable", retryable: true } });
      waiters.clear();
    };
    const iceConfig = async () => {
      if (ice && Date.now() < ice.until) return ice.config;
      let servers = [STUN], until = Date.now() + 60000;
      try {
        const data = await call("ice"), s = data && Array.isArray(data.iceServers) ? data.iceServers[0] : null;
        if (s && s.urls === TURN_TLS && typeof s.username === "string" && s.username && typeof s.credential === "string" && s.credential) {
          servers = [STUN, { urls: TURN_TLS, username: s.username, credential: s.credential }];
          until = Date.now() + Math.max(60, (Number.isInteger(data.ttl) ? data.ttl : 120) - 60) * 1000;
        }
      } catch { /* No relay: the direct candidates alone. */ }
      ice = { config: { iceServers: servers, bundlePolicy: "max-bundle" }, until };
      return ice.config;
    };
    const gathered = (pc, relay) => new Promise((resolve) => {
      if (pc.iceGatheringState === "complete") return resolve();
      const done = () => { timers.clear(timer); pc.removeEventListener("icegatheringstatechange", change); resolve(); };
      const change = () => { if (pc.iceGatheringState === "complete") done(); };
      const timer = timers.set(done, relay ? RELAY_GATHER_MS : GATHER_MS);
      pc.addEventListener("icegatheringstatechange", change);
    });
    const connected = (pc) => new Promise((resolve, reject) => {
      if (pc.connectionState === "connected") return resolve();
      const done = (ok) => { timers.clear(timer); pc.removeEventListener("connectionstatechange", change); if (ok) resolve(); else reject(failure("connection_failed", true)); };
      const change = () => { if (pc.connectionState === "connected") done(true); else if (pc.connectionState === "failed" || pc.connectionState === "closed") done(false); };
      const timer = timers.set(() => done(false), CONNECT_MS);
      pc.addEventListener("connectionstatechange", change);
    });
    const listening = () => (sub ? "listening" : connection ? "connecting" : "off");

    // --- hearing ---
    const play = (v) => {
      const out = v.el.play();
      if (out && typeof out.catch === "function") out.catch((err) => {
        if (!err || err.name !== "NotAllowedError" || !voices.has(v.mid) || voices.get(v.mid) !== v) return;
        blocked = true;
        emit();
      });
    };
    // Who is talking now, rebuilt only when it changed; true when it did.
    const retalk = () => {
      let key = "";
      for (const v of voices.values()) if (v.meter && v.meter.speaking) key += `${v.participant}\n`;
      if (key === talkKey) return false;
      talkKey = key;
      talking = Object.freeze(key ? key.slice(0, -1).split("\n") : []);
      return true;
    };
    const readHeard = () => {
      hearTimer = 0;
      let metered = false;
      for (const v of voices.values()) {
        const m = v.meter;
        if (!m) continue;
        metered = true;
        m.analyser.getFloatTimeDomainData(heardSamples);
        let sum = 0;
        for (let i = 0; i < SAMPLES; i++) sum += heardSamples[i] * heardSamples[i];
        const loud = Math.sqrt(sum / SAMPLES) > SPEAK_ON;
        m.quiet = loud ? 0 : m.quiet + 1;
        m.speaking = loud || m.speaking && m.quiet < SPEAK_HOLD;
      }
      if (retalk()) emit();
      if (metered) hearTimer = timers.set(readHeard, SPEAK_MS);
    };
    const meterHeard = (v) => {
      const Ctx = target.AudioContext || target.webkitAudioContext;
      if (!Ctx || !v.el) return;
      try {
        if (!hearAudio) hearAudio = new Ctx();
        const source = hearAudio.createMediaStreamSource(v.el.srcObject), analyser = hearAudio.createAnalyser();
        analyser.fftSize = SAMPLES;
        source.connect(analyser);
        v.meter = { source, analyser, quiet: 0, speaking: false };
        if (!hearTimer) hearTimer = timers.set(readHeard, SPEAK_MS);
      } catch { v.meter = null; }
    };
    const silence = (v) => {
      if (v.meter) { v.meter.source.disconnect(); v.meter = null; retalk(); }
      if (!v.el) return;
      try { v.el.pause(); } catch { /* Already stopped. */ }
      v.el.srcObject = null;
      v.el = null;
    };
    const stopTransceiver = (mid) => {
      if (!sub) return;
      const tx = sub.pc.getTransceivers().find((t) => t.mid === mid);
      try { if (tx) tx.stop(); } catch { /* Already stopped. */ }
    };
    const drop = (mids) => {
      if (!Array.isArray(mids)) return;
      for (const mid of mids) {
        const v = typeof mid === "string" && voices.get(mid);
        if (!v) continue;
        silence(v);
        voices.delete(mid);
        stopTransceiver(mid);
      }
      emit();
    };
    const dropAll = () => {
      for (const [mid, v] of voices) { silence(v); stopTransceiver(mid); }
      voices.clear();
    };
    // A tap or key anywhere plays what the browser held back, inside that gesture as it requires.
    const wake = (event) => {
      if (event.isTrusted && hearAudio && hearAudio.state === "suspended") hearAudio.resume().catch(() => {});
      if (!event.isTrusted || !blocked) return;
      blocked = false;
      for (const v of voices.values()) if (v.el) play(v);
      emit();
    };
    target.addEventListener("pointerup", wake, true);
    target.addEventListener("keydown", wake, true);
    const onTrack = (pc, event) => {
      if (!sub || sub.pc !== pc) return;
      const mid = event.transceiver && event.transceiver.mid, v = typeof mid === "string" ? voices.get(mid) : null;
      if (!v) return;
      silence(v);
      const el = R.audio();
      el.autoplay = true;
      el.srcObject = R.stream(event.track);
      v.el = el;
      play(v);
      meterHeard(v);
      emit();
    };
    const closeReceive = () => {
      receiveTicket++;
      timers.clear(retryTimer);
      timers.clear(dropTimer);
      retryTimer = dropTimer = 0;
      dropAll();
      if (sub) { const pc = sub.pc; sub = null; pc.close(); }
    };
    const receiveFailed = (err) => {
      closeReceive();
      if (!connection || disposed) return;
      const shown = !speaker && !BUSY.has(phase);
      if (++tries > RECEIVE_TRIES) {
        if (shown) phase = "failed";
        notice = NOTICE.receive;
        return emit();
      }
      if (shown) phase = "reconnecting";
      emit();
      const wait = Math.min(BACKOFF_MS[1], BACKOFF_MS[0] * 2 ** (tries - 1)) * (0.75 + Math.random() * 0.5);
      retryTimer = timers.set(() => { retryTimer = 0; openReceive(); }, err && err.code === "permission_changed" ? 250 : wait);
    };
    const watchReceive = (pc) => {
      if (!sub || sub.pc !== pc) return;
      timers.clear(dropTimer);
      dropTimer = 0;
      if (pc.connectionState === "failed") receiveFailed(failure("connection_failed", true));
      else if (pc.connectionState === "disconnected") dropTimer = timers.set(() => {
        dropTimer = 0;
        if (sub && sub.pc === pc && pc.connectionState !== "connected") receiveFailed(failure("connection_lost", true));
      }, DROP_GRACE_MS);
    };
    const openReceive = async () => {
      closeReceive();
      if (!connection || disposed || typeof R.PeerConnection !== "function") return;
      const ticket = receiveTicket, live = () => ticket === receiveTicket && !disposed;
      if (!speaker && !BUSY.has(phase)) phase = tries ? "reconnecting" : "connecting";
      emit();
      try {
        const config = await iceConfig();
        if (!live()) return;
        await call("receive/open");
        if (!live()) return;
        const pc = new R.PeerConnection(config);
        sub = { pc, relay: config.iceServers.length > 1, syncing: false, again: false };
        stats.opened++;
        pc.addEventListener("track", (event) => onTrack(pc, event));
        pc.addEventListener("connectionstatechange", () => watchReceive(pc));
        if (!speaker && !BUSY.has(phase)) phase = "listening";
        if (notice === NOTICE.receive) notice = "";
        emit();
        await sync();
      } catch (err) {
        if (live()) receiveFailed(err);
      }
    };
    // One sync at a time a receiver; another asked for meanwhile runs right after it.
    const sync = async () => {
      const mine = sub;
      if (!mine) return;
      if (mine.syncing) { mine.again = true; return; }
      mine.syncing = true;
      const { pc } = mine, live = () => sub === mine && !disposed;
      try {
        do {
          mine.again = false;
          const epoch = zoneEpoch;
          const res = await call("receive/sync");
          if (!live()) return;
          stats.synced++;
          drop(res && res.closed);
          // Asked before a zone change: those voices are the old zone's, which the server closes; never played here.
          const tracks = res && Array.isArray(res.tracks) && epoch === zoneEpoch ? res.tracks : [];
          for (const t of tracks) {
            if (!t || typeof t.mid !== "string" || typeof t.participant !== "string" || voices.size >= TRACKS_MAX) continue;
            const had = voices.get(t.mid);
            if (had) silence(had);
            voices.set(t.mid, { mid: t.mid, participant: t.participant, el: null, meter: null });
          }
          // The SFU's offer is answered whatever its tracks were for, so the session stays in step with the server.
          const offer = res && res.sessionDescription;
          if (res && res.requiresImmediateRenegotiation && offer && typeof offer.sdp === "string") {
            await pc.setRemoteDescription(offer);
            if (!live()) return;
            await pc.setLocalDescription(await pc.createAnswer());
            if (!live()) return;
            await gathered(pc, mine.relay);
            if (!live()) return;
            await call("renegotiate", { sdp: pc.localDescription.sdp });
            if (!live()) return;
          }
          tries = 0;
        } while (mine.again && live());
      } catch (err) {
        if (live()) receiveFailed(err);
      } finally {
        mine.syncing = false;
      }
    };

    // --- speaking ---
    // The own meter, on the held microphone's stream, where the browser has Web Audio (none in the suite's fakes).
    const readMeter = () => {
      if (!meter) return;
      meter.analyser.getFloatTimeDomainData(meter.samples);
      let sum = 0;
      for (let i = 0; i < SAMPLES; i++) sum += meter.samples[i] * meter.samples[i];
      const loud = Math.sqrt(sum / SAMPLES) > SPEAK_ON;
      meter.quiet = loud ? 0 : meter.quiet + 1;
      const next = loud || speaking && meter.quiet < SPEAK_HOLD;
      if (next !== speaking) { speaking = next; emit(); }
      meter.timer = timers.set(readMeter, SPEAK_MS);
    };
    const startMeter = (stream) => {
      const Ctx = target.AudioContext || target.webkitAudioContext;
      if (!Ctx || meter) return;
      try {
        const audio = new Ctx(), source = audio.createMediaStreamSource(stream), analyser = audio.createAnalyser();
        analyser.fftSize = SAMPLES;
        source.connect(analyser);
        if (audio.state === "suspended") audio.resume().catch(() => {});
        meter = { audio, source, analyser, samples: new Float32Array(SAMPLES), timer: 0, quiet: 0 };
        meter.timer = timers.set(readMeter, SPEAK_MS);
      } catch { meter = null; }
    };
    const stopMeter = () => {
      if (!meter) return;
      timers.clear(meter.timer);
      meter.source.disconnect();
      meter.audio.close().catch(() => {});
      meter = null; speaking = false;
    };
    // Capture ends and the publishing connection closes here, at once and once; the server is told by the caller.
    const stopSpeaking = () => {
      joinTicket++;
      stopMeter();
      timers.clear(renewTimer);
      renewTimer = 0;
      const had = !!mic || !!pub || speaker;
      speaker = false;
      muted = true;
      lease = 0;
      if (mic) {
        mic.track.enabled = false;
        mic.track.removeEventListener("ended", micEnded);
        for (const track of mic.stream.getTracks()) track.stop();
        mic = null;
        stats.released++;
      }
      if (pub) { const pc = pub.pc; pub = null; pc.close(); }
      return had;
    };
    // Back to listening with `why` said; a lease the server granted is given back (best effort: it also expires).
    const endSpeaking = (why, giveBack = lease > 0) => {
      stopSpeaking();
      if (giveBack) call("publish/close").then(() => { stats.closed++; }, () => request("setRole", { role: "listener" }));
      phase = listening();
      notice = why || "";
      emit();
    };
    function micEnded() {
      if (speaker || BUSY.has(phase)) endSpeaking(NOTICE.mic);
    }
    const watchPublish = (pc) => pc.addEventListener("connectionstatechange", () => {
      if (pub && pub.pc === pc && pc.connectionState === "failed") endSpeaking(NOTICE.failed);
    });
    const join = async () => {
      if (disposed || speaker || BUSY.has(phase) || !connection || !available() || !you || you.speak !== "eligible") return;
      const ticket = ++joinTicket, live = () => ticket === joinTicket && !disposed;
      phase = "permission";
      notice = "";
      // Inside the click: whatever playback the browser held back may start now too.
      if (blocked) { blocked = false; for (const v of voices.values()) if (v.el) play(v); }
      emit();
      let stream;
      try {
        stream = await R.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      } catch (err) {
        if (live()) endSpeaking(micNotice(err), false);
        return;
      }
      const track = stream && stream.getAudioTracks()[0];
      // Off from its first frame: nothing is published, and nothing would be heard, until the speaker unmutes.
      if (track) track.enabled = false;
      if (!live() || !track) {
        if (stream) for (const t of stream.getTracks()) t.stop();
        if (live()) endSpeaking(NOTICE.nodevice, false);
        return;
      }
      mic = { stream, track };
      stats.captured++;
      startMeter(stream);
      track.addEventListener("ended", micEnded);
      phase = "requesting";
      emit();
      const granted = await ask("setRole", { role: "speaker" });
      if (!live()) return;
      if (!granted.ok) return endSpeaking(NOTICE[REFUSED[granted.error && granted.error.code]] || NOTICE.failed, false);
      lease = granted.you && Number.isSafeInteger(granted.you.lease) ? granted.you.lease : you && Number.isSafeInteger(you.lease) ? you.lease : 0;
      if (!lease) return endSpeaking(NOTICE.failed, false);
      phase = "negotiating";
      emit();
      try {
        const config = await iceConfig();
        if (!live()) return;
        await call("publish/open", { generation: lease });
        if (!live()) return;
        const pc = new R.PeerConnection(config);
        pub = { pc };
        const tx = pc.addTransceiver(track, { direction: "sendonly" });
        await pc.setLocalDescription(await pc.createOffer());
        if (!live()) return;
        await gathered(pc, config.iceServers.length > 1);
        if (!live()) return;
        const res = await call("publish/offer", { generation: lease, sdp: pc.localDescription.sdp, mid: tx.mid });
        if (!live()) return;
        if (!res || !res.sessionDescription || typeof res.sessionDescription.sdp !== "string") throw failure("publish_failed", true);
        await pc.setRemoteDescription(res.sessionDescription);
        if (!live()) return;
        await connected(pc);
        if (!live()) return;
        await call("publish/ready", { generation: lease });
        if (!live()) return;
        watchPublish(pc);
      } catch {
        if (live()) endSpeaking(NOTICE.failed);
        return;
      }
      stats.published++;
      speaker = true;
      muted = true;
      phase = "muted";
      timers.clear(renewTimer);
      renewTimer = timers.set(renew, RENEW_MS);
      emit();
    };
    const leave = async () => {
      if (disposed) return;
      if (BUSY.has(phase) && phase !== "leaving") return endSpeaking("");
      if (!speaker) return;
      const giving = lease > 0;
      stopSpeaking();
      phase = "leaving";
      notice = "";
      emit();
      if (giving) {
        try { await call("publish/close"); stats.closed++; } catch { request("setRole", { role: "listener" }); }
      }
      if (phase === "leaving") { phase = listening(); emit(); }
    };
    const mute = () => {
      if (!speaker || !mic) return;
      muted = !muted;
      mic.track.enabled = !muted;
      phase = muted ? "muted" : "open";
      request("setMic", { muted });
      emit();
    };
    // The server's word on this connection: a lease it no longer holds ends speaking here at once.
    const learn = (next) => {
      if (!next || typeof next.speak !== "string") return;
      you = next;
      if (lease && (speaker || BUSY.has(phase)) && next.speak !== "pending" && next.speak !== "active") endSpeaking(NOTICE.ended, false);
    };

    // --- the feed ---
    const heard = (msg) => {
      if (!msg || typeof msg !== "object" || disposed) return;
      if (msg.type === "result") {
        const done = waiters.get(msg.requestId);
        if (!done) return;
        waiters.delete(msg.requestId);
        learn(msg.you);
        return done(msg);
      }
      if (msg.type === "you") { if (msg.zone === zone) learn(msg.you); return; }
      if (msg.type === "media") {
        if (msg.op !== "sync") return;
        drop(msg.closed);
        if (sub) sync();
        return;
      }
      if (msg.type !== "snapshot" || msg.zone !== zone) return;
      if (typeof msg.connection === "string" && msg.connection !== connection) {
        // A new audience connection: nothing held under the old one is ours at the server any more.
        const was = stopSpeaking();
        forgetWaiters();
        connection = msg.connection;
        you = null;
        learn(msg.you);
        tries = 0;
        if (was) notice = NOTICE.reconnected;
        phase = "connecting";
        openReceive();
        return;
      }
      learn(msg.you);
      if (sub) sync();
      else if (connection && !retryTimer && tries <= RECEIVE_TRIES) openReceive();
    };
    // The feed lost its socket (or ended): its connection, and so everything held under it, is gone.
    const status = (next) => {
      // Connecting is a first socket or a fixture's zone change, never a lost one (that says reconnecting first).
      if (next === "live" || next === "joining" || next === "connecting") return;
      const was = stopSpeaking();
      forgetWaiters();
      closeReceive();
      connection = null;
      you = null;
      tries = 0;
      phase = "off";
      notice = was && next !== "off" ? NOTICE.reconnected : "";
      emit();
    };
    const zoneTo = (next) => {
      if (next === zone) return;
      const first = zone === null;
      zone = next;
      zoneEpoch++;
      if (first) return;
      // The server ends a lease at the join; capture stops here first, and the old zone's voices go now.
      stopSpeaking();
      dropAll();
      phase = listening();
      notice = "";
      emit();
    };
    const release = () => {
      if (!mic && !pub && !speaker && !BUSY.has(phase)) return;
      endSpeaking("");
    };
    const stop = () => {
      stopSpeaking();
      forgetWaiters();
      closeReceive();
      connection = null;
      you = null;
      tries = 0;
      phase = "off";
      notice = "";
      blocked = false;
      emit();
    };
    const retry = () => {
      if (sub || retryTimer || !connection) return;
      tries = 0;
      notice = "";
      openReceive();
    };
    const dispose = () => {
      stop();
      timers.clear(hearTimer);
      hearTimer = 0;
      if (hearAudio) hearAudio.close().catch(() => {});
      hearAudio = null;
      disposed = true;
      target.removeEventListener("pointerup", wake, true);
      target.removeEventListener("keydown", wake, true);
    };
    const supported = () => typeof R.PeerConnection === "function" && typeof R.getUserMedia === "function";
    const available = () => supported() && !!allowed();
    return { heard, status, zone: zoneTo, join, leave, mute, release, stop, retry, dispose,
      get available() { return available(); }, get why() { return supported() ? "" : NOTICE.unsupported; },
      get state() { return state; }, get stats() { return { ...stats, voices: voices.size, receiving: !!sub, publishing: !!pub, capturing: !!mic, connection, lease }; } };
  };
  BL.oogaChatMedia = { create, PHASES, NOTICE, IDLE, TURN_TLS };
})();
