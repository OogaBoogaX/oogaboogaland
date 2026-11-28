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
// Speaking. Join voice (`join`, from the click) asks for the microphone first, inside the gesture, and turns its track
// off before anything can carry it, so it starts muted; only then asks the audience for a speaker lease (`setRole`,
// answered over the feed with the lease's generation in `you.lease`), publishes the one microphone track
// (`publish/open`, `publish/offer`, `publish/ready`) and becomes a speaker only on the server's acknowledgement. A
// refusal, a denied or missing microphone, or a failed connection returns to listening with nothing held and says why
// (`notice`). `mute` flips the track and tells the server (`setMic`). Leave voice (`leave`) stops and releases the
// microphone before telling the server (`publish/close`), and keeps listening. The server ending the lease (a `you` that
// no longer says pending or active: an expiry, a revocation, the island taking the identity) stops capture at once.
// Another zone (`zone`) ends speaking there and drops every voice of the old zone before the new zone's snapshot.
//
// Staying a speaker. A loss that was not the visitor's choice never makes a speaker a listener by itself. A new audience
// connection (the socket dropped: a phone that went to another app, a network change) ends what was held under the old
// one at the server, so the page keeps its microphone, off, and once the new connection's snapshot says it may, asks
// for a lease again by itself (`setRole` naming every connection it may still hold one under, `replaces`, so its own
// stale lease does not refuse it) and publishes. Back within RETURN_MS of the loss with the microphone open before it,
// it is open again: "Voice reconnected. Your microphone is on." Later, or muted before, it lands muted: "Voice
// reconnected. You're muted." A publishing connection that fails is published again the same way. A try that fails for
// a passing reason (no answer, a busy server, a connection that would not come up) is made again after RESUME_WAIT_MS,
// then twice that, RESUME_TRIES in a row at most; a refusal says why and listens. A zone that reads full for a moment
// (`full`) keeps the wish to speak as a dropped socket does. A microphone the browser takes away (another app, a call)
// leaves a muted speaker with nothing captured; Unmute, a click, captures it again.
// A network change (another Wi-Fi, Wi-Fi to cellular) is that same loss, found sooner: a voice connection that drops
// is the first to show it, long before the feed's socket is known dead, so the page asks the feed to check its socket
// at once (`stall`), and a publishing connection still down after DROP_GRACE_MS is published again without waiting for
// the browser to call it failed. A lease asked for over a socket that never answers is that dead socket too: the feed
// is checked, and the try is not counted against the speaker.
// A page that comes straight back (a refresh, a phone that reloads it) is the same loss: `remember()`, called as the page
// is hidden or leaves, leaves word in `memory` that this account was speaking in this zone, under which connection and
// whether its microphone was open, and the next page's first connection within RETURN_MS takes that word up once and
// speaks again the same way.
// `release(reason)` (the account's seam, ooga-chat-auth.js) ends speaking and keeps listening; `stop` ends both.
//
// `create({ broker, rtc, request, allowed, onChange, timers, target, memory, preferenceKey, bareKey, stall })`: `stall()` asks the feed to check
// its socket now (the app's `feed.wake(true)`), `broker()` the adapter's `{ call(op, body) }` or
// null, `rtc` the browser's WebRTC and media (the fixture passes its own), `request(type, fields)` sends a request over
// the audience feed and returns its id (0 when it can't), `allowed()` whether the deployment lets anyone speak now,
// `memory` the tab's own `{ take(), keep(record | null) }` (the app's session storage; none remembers nothing),
// `preferenceKey` the localStorage prefix for each listener's mute and volume choices (empty saves nothing),
// `bareKey` the localStorage key for whether this browser connects without the STUN server (empty saves nothing).
// `rtc.AudioContext` may override the receiver's context (null for synthetic fixture tracks).
// Returns `{ heard(msg), status(feedStatus), zone(next), join(), leave(), mute(), identify(id), muteLocal(id, on), mutedLocally(id), setVolume(id, value), volumeOf(id), VOLUME_MAX, release(reason), stop(), retry(),
// remember(on), dispose(), available, why, state, stats }`; `state` is `{ role, muted, phase, busy, notice, blocked, hearing, speaking,
// talking, elsewhere, localVersion, muteDuels }`; `localVersion` changes with local listening choices. `duel(msg)` takes
// the Commons' pair-only snapshot/start/end or loss; `setMuteDuels(on)` is the account's opt-in, independent of manual
// mute/volume, and `mutedByDuel(id)` explains an automatic mute. `elsewhere` says the account's voice is on another device (the island's, or another Ooga Chat
// page's): Join voice then needs the visitor's word, `join({ takeover: true })`, which moves it here. Speaking is this page's own meter on the captured microphone (as the island's voice.js meters it, the same
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
  // Staying a speaker through a loss: a held microphone is released after MIC_HOLD_MS with nothing to publish it on, and
  // RESUME_TRIES in a row is as often as the page asks again by itself (a speaker for STEADY_MS starts the count afresh),
  // waiting RESUME_WAIT_MS times the tries made after one that failed for a passing reason. STALES_MAX is how many
  // connections it names as possibly still holding its lease.
  const MIC_HOLD_MS = 2 * 60 * 1000, RESUME_TRIES = 3, STEADY_MS = 30000, RESUME_WAIT_MS = 2000, STALES_MAX = 3;
  // A quick return: a speaker's word to the page after it (`remember`) is taken up only this soon after it was left,
  // and only this soon after a loss does a microphone that was open come back open.
  const RETURN_MS = 60 * 1000;
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
    island: "Your voice is on another device. Join voice to move it here.",
    full: "Every speaking spot here is taken. Try again soon.",
    busy: "Too many tries. Wait a moment, then try again.",
    failed: "Voice couldn't connect. Try again.",
    ended: "Your speaking ended. Join voice to speak again.",
    reconnected: "Voice reconnected. Join voice to speak again.",
    mic: "Your microphone stopped.",
    resumed: "Voice reconnected. You're muted.",
    reopened: "Voice reconnected. Your microphone is on.",
    interrupted: "Your microphone was interrupted. Unmute to speak again.",
    moved: "Voice moved to your other device.",
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
      enumerateDevices: devices && typeof devices.enumerateDevices === "function" ? () => devices.enumerateDevices() : null,
      stream: (track) => new MediaStream([track]),
      audio: () => new Audio()
    };
  };
  const IDLE = Object.freeze({ role: "listener", muted: true, phase: "off", busy: false, notice: "", blocked: false, hearing: 0, speaking: false, talking: Object.freeze([]), elsewhere: "", localVersion: 0, muteDuels: false });
  const create = ({ broker, rtc = browser(), request = () => 0, allowed = () => true, onChange = () => {},
    timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) }, target = window, memory = null, preferenceKey = "", bareKey = "", stall = () => {} } = {}) => {
    const R = rtc, HearContext = R.AudioContext === undefined ? target.AudioContext || target.webkitAudioContext : R.AudioContext;
    const VOLUME_MAX = HearContext ? 2 : 1, GAIN_TAU = 0.05;
    let state = IDLE, phase = "off", notice = "", blocked = false, disposed = false;
    // The audience connection everything is held under, the zone asked for (and how many times it has changed), and the
    // server's last word on this connection (`you`).
    let connection = null, zone = null, zoneEpoch = 0, you = null;
    // Receiving: the receive connection (`{ pc, relay, bare, cameUp, syncing, again }`), its ticket (bumped to orphan anything in flight),
    // the pulled voices by mid, and the backoff.
    let sub = null, receiveTicket = 0, tries = 0, retryTimer = 0, dropTimer = 0;
    const voices = new Map();
    // Local listening choices, bounded and keyed by provider id, as on the island. Keep measuring muted voices so
    // their speaking marks still work. Reconnects and new tracks retain the choice; another account loads its own.
    const preferences = new Map(), participantId = (id) => typeof id === "string" && /^(gh|x):[1-9][0-9]{0,19}$/.test(id);
    const duels = BL.duelListening.create();
    let muteDuels = false;
    let preferenceOwner = null, localVersion = 0;
    const mutedLocally = (id) => !!preferences.get(id)?.muted;
    const volumeOf = (id) => preferences.get(id)?.volume ?? 1;
    const syncPreferences = (id = who) => {
      const owner = participantId(id) ? id : null;
      if (owner === preferenceOwner) return;
      preferenceOwner = owner;
      preferences.clear();
      duels.clear();
      muteDuels = false;
      if (owner && preferenceKey) try {
        muteDuels = target.localStorage.getItem(preferenceKey + owner + ".duels") === "true";
        const raw = target.localStorage.getItem(preferenceKey + owner);
        const saved = raw && raw.length <= 32768 ? JSON.parse(raw) : null;
        if (Array.isArray(saved)) for (const item of saved.slice(0, 512)) {
          // The first local-mute release stored ids alone. Keep those choices when adding volume.
          const [id, muted, volume] = typeof item === "string" ? [item, true, 1] : Array.isArray(item) ? item : [];
          if (!participantId(id) || id === owner || typeof muted !== "boolean" || !Number.isFinite(volume) || volume < 0 || volume > 2) continue;
          if (muted || volume !== 1) preferences.set(id, { muted, volume: Math.min(VOLUME_MAX, volume) });
        }
      } catch { /* Storage off or malformed: start with this account's defaults. */ }
      for (const v of voices.values()) if (v.el) setLevel(v, true);
      localVersion++;
    };
    // The session can name the listener before an audience connection opens, so a panel can set a choice even then.
    const identify = (id) => { syncPreferences(id); emit(); };
    const setPreference = (id, muted, volume) => {
      if (disposed || !preferenceOwner || !participantId(id) || id === preferenceOwner) return;
      const previous = preferences.get(id), nextMuted = muted ?? previous?.muted ?? false, nextVolume = volume ?? previous?.volume ?? 1;
      if (nextMuted === (previous?.muted ?? false) && nextVolume === (previous?.volume ?? 1)) return;
      if (!nextMuted && nextVolume === 1) preferences.delete(id);
      else {
        if (!previous && preferences.size >= 512) return;
        preferences.set(id, { muted: nextMuted, volume: nextVolume });
      }
      for (const v of voices.values()) if (v.el && v.participant === id) setLevel(v, nextMuted);
      if (preferenceKey) try { target.localStorage.setItem(preferenceKey + preferenceOwner, JSON.stringify([...preferences].map(([id, p]) => [id, p.muted, p.volume]))); }
      catch { /* Storage off: keep the choice for this visit. */ }
      localVersion++;
      emit();
    };
    const muteLocal = (id, on) => setPreference(id, !!on, null);
    const setVolume = (id, value) => {
      const volume = Number(value);
      if (Number.isFinite(volume)) setPreference(id, null, Math.max(0, Math.min(VOLUME_MAX, volume)));
    };
    const githubId = (id) => typeof id === "string" && id.startsWith("gh:") ? Number(id.slice(3)) : 0;
    const mutedByDuel = (id) => muteDuels && duels.muted(githubId(id), githubId(preferenceOwner));
    const refreshDuels = () => {
      for (const v of voices.values()) if (v.el) setLevel(v, true);
      localVersion++;
      emit();
    };
    const duel = (msg) => { if (duels.apply(msg)) refreshDuels(); };
    const setMuteDuels = (on) => {
      if (disposed || !preferenceOwner || muteDuels === !!on) return;
      muteDuels = !!on;
      if (preferenceKey) try { target.localStorage.setItem(preferenceKey + preferenceOwner + ".duels", String(muteDuels)); } catch { /* This visit only. */ }
      refreshDuels();
    };
    // Speaking: the join's ticket, the microphone, the publishing connection, the lease's generation and the mute.
    let joinTicket = 0, mic = null, pub = null, lease = 0, speaker = false, muted = true, renewTimer = 0, pubDropTimer = 0;
    // Staying a speaker: `again` from the server's acknowledgement until the visitor leaves or the server refuses,
    // `stales` the connections a lease may still be held under at the server (the last speaker's, and any a join was
    // under way on when its socket dropped), `resumes` the tries in a row, `resumeAt` when the next may be made, and the
    // timers. `reopen` is whether the microphone was open when speaking was lost, at `lostAt`.
    // `who` is the account the server last named on this page, and `arrived` that its first connection has come.
    // `unanswered`: a lease asked for under this connection went unanswered once, so the next silence counts as a try.
    let again = false, resumes = 0, holdTimer = 0, steadyTimer = 0, resumeTimer = 0, resumeAt = 0, reopen = false, lostAt = 0, who = null, arrived = false, unanswered = false;
    const stales = [];
    const mayHold = () => {
      if (!connection || stales.includes(connection)) return;
      stales.push(connection);
      if (stales.length > STALES_MAX) stales.shift();
    };
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
    // The voice marks' levels (`level`, `ownLevel`, native-icons.js `shapeLevel`): `subscribeLevels` is heard after each
    // meter read while a level is up, and once more as it falls to nothing, so a mark empties.
    // The heard voices' meter and the own one read on timers of their own, each with its own last word.
    const levelSubs = new Set(), levelsWere = { heard: false, own: false };
    const tellLevels = (from, up) => {
      if (up || levelsWere[from]) for (const fn of levelSubs) fn();
      levelsWere[from] = up;
    };
    const level = (participant) => {
      for (const v of voices.values()) if (v.participant === participant) return v.meter ? v.meter.level : 0;
      return 0;
    };
    const ownLevel = () => meter && state.speaking ? meter.level : 0;
    const subscribeLevels = (fn) => { levelSubs.add(fn); return () => levelSubs.delete(fn); };
    const heardSamples = new Float32Array(SAMPLES);
    // TURN credentials, kept until shortly before they expire; requests waiting on the feed's `result`.
    let ice = null;
    // As on the island (voice.js): WebKit on an IPv6-only mobile network reaches only the first IPv4 address a
    // connection's UDP socket sends to (bugs.webkit.org 330921), which with a STUN server listed is the STUN server,
    // never the SFU. A connection that never came up is tried next without it (`bare`), one that never came up without
    // it with it again, and the way that last worked is kept for this browser. `unreached(was)` takes the way the
    // connection that never came up was built, so two connections failing the same way change it once.
    let bare = false;
    if (bareKey) try { bare = target.localStorage.getItem(bareKey) === "1"; } catch { /* Found again each page. */ }
    const unreached = (was) => {
      if (bare !== was) return;
      bare = !was;
      if (bareKey) try { if (bare) target.localStorage.setItem(bareKey, "1"); else target.localStorage.removeItem(bareKey); } catch { /* This page only. */ }
    };
    const waiters = new Map();
    const stats = { opened: 0, synced: 0, captured: 0, released: 0, published: 0, closed: 0 };

    const emit = () => {
      if (disposed) return;
      let hearing = 0;
      for (const v of voices.values()) if (v.el) hearing++;
      const asleep = !!HearContext && !!hearAudio && hearAudio.state !== "running";
      const next = { role: speaker ? "speaker" : "listener", muted: speaker ? muted : true, phase, busy: BUSY.has(phase), notice, blocked: (blocked || asleep) && hearing > 0, hearing,
        speaking: speaker && !muted && speaking, talking, localVersion, muteDuels,
        // Where the account's voice is while it is not here ("island" or "app"): the page asks before taking it. Not
        // while it means to speak again by itself: the lease still read elsewhere is then its own, from before the loss.
        elsewhere: !again && !speaker && !BUSY.has(phase) && you && (you.elsewhere === "island" || you.elsewhere === "app") ? you.elsewhere : "" };
      const s = state;
      if (s.role === next.role && s.muted === next.muted && s.phase === next.phase && s.notice === next.notice && s.blocked === next.blocked && s.hearing === next.hearing
        && s.speaking === next.speaking && s.talking === next.talking && s.elsewhere === next.elsewhere && s.localVersion === next.localVersion) return;
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
    // The servers a new connection gets, whether a relay is among them, and whether the STUN server was left out. An
    // answer with no relay (none is set up) stands a minute; a request that failed is not kept, so the next connection
    // asks again.
    const iceConfig = async () => {
      if (!ice || Date.now() >= ice.until) {
        ice = null;
        try {
          const data = await call("ice"), s = data && Array.isArray(data.iceServers) ? data.iceServers[0] : null;
          const relay = s && s.urls === TURN_TLS && typeof s.username === "string" && s.username && typeof s.credential === "string" && s.credential
            ? { urls: TURN_TLS, username: s.username, credential: s.credential } : null;
          ice = { relay, until: Date.now() + (relay ? Math.max(60, (Number.isInteger(data.ttl) ? data.ttl : 120) - 60) * 1000 : 60000) };
        } catch { /* No relay this time: the direct candidates alone. */ }
      }
      const relay = ice ? ice.relay : null;
      return { relay: !!relay, bare, config: { iceServers: [...(bare ? [] : [STUN]), ...(relay ? [relay] : [])], bundlePolicy: "max-bundle" } };
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
    // As on the island: a muted element keeps the stream alive; its source feeds the meter and a gain/peak limiter.
    // Only the gain path reaches the speakers. Without Web Audio the element plays, capped at ordinary volume.
    const setLevel = (v, immediate = false) => {
      const muted = mutedLocally(v.participant) || mutedByDuel(v.participant), volume = volumeOf(v.participant);
      if (!HearContext) { v.el.volume = volume; v.el.muted = muted; }
      else if (v.gain) {
        const param = v.gain.gain, value = muted ? 0 : volume;
        v.limiter.ratio.value = volume > 1 ? 20 : 1;
        if (immediate) { param.cancelScheduledValues(hearAudio.currentTime); param.setValueAtTime(value, hearAudio.currentTime); }
        else param.setTargetAtTime(value, hearAudio.currentTime, GAIN_TAU);
      }
    };
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
      let metered = false, up = false;
      for (const v of voices.values()) {
        const m = v.meter;
        if (!m) continue;
        metered = true;
        m.analyser.getFloatTimeDomainData(heardSamples);
        let sum = 0;
        for (let i = 0; i < SAMPLES; i++) sum += heardSamples[i] * heardSamples[i];
        const rms = Math.sqrt(sum / SAMPLES), loud = rms > SPEAK_ON;
        m.quiet = loud ? 0 : m.quiet + 1;
        m.speaking = loud || m.speaking && m.quiet < SPEAK_HOLD;
        m.level = BL.nativeIcons.shapeLevel(m.level, rms);
        if (m.level) up = true;
      }
      if (retalk()) emit();
      tellLevels("heard", up);
      if (metered) hearTimer = timers.set(readHeard, SPEAK_MS);
    };
    const meterHeard = (v) => {
      if (!HearContext || !v.el) return;
      if (!hearAudio) {
        hearAudio = new HearContext();
        hearAudio.addEventListener("statechange", emit);
      }
      const source = hearAudio.createMediaStreamSource(v.el.srcObject);
      v.meter = { source, analyser: null, quiet: 0, speaking: false, level: 0 };
      const analyser = v.meter.analyser = hearAudio.createAnalyser();
      analyser.fftSize = SAMPLES;
      source.connect(analyser);
      v.gain = hearAudio.createGain();
      v.limiter = hearAudio.createDynamicsCompressor();
      v.limiter.threshold.value = -1; v.limiter.knee.value = 0;
      v.limiter.attack.value = 0.003; v.limiter.release.value = 0.1;
      setLevel(v, true);
      source.connect(v.gain);
      v.gain.connect(v.limiter); v.limiter.connect(hearAudio.destination);
      if (!hearTimer) hearTimer = timers.set(readHeard, SPEAK_MS);
    };
    const silence = (v) => {
      if (v.meter) { v.meter.source.disconnect(); v.meter = null; retalk(); }
      if (v.gain) { v.gain.disconnect(); v.gain = null; }
      if (v.limiter) { v.limiter.disconnect(); v.limiter = null; }
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
      if (event.isTrusted && hearAudio && hearAudio.state !== "running") hearAudio.resume().then(emit, emit);
      if (!event.isTrusted || !state.blocked) return;
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
      el.muted = !!HearContext || mutedLocally(v.participant) || mutedByDuel(v.participant);
      el.autoplay = true;
      el.srcObject = R.stream(event.track);
      v.el = el;
      setLevel(v, true);
      try { meterHeard(v); }
      catch { receiveFailed(failure("connection_failed", true)); return; }
      play(v);
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
      if (pc.connectionState === "connected") sub.cameUp = true;
      if (pc.connectionState === "failed") {
        if (!sub.cameUp) unreached(sub.bare);
        receiveFailed(failure("connection_failed", true));
      } else if (pc.connectionState === "disconnected") {
        stall();
        dropTimer = timers.set(() => {
          dropTimer = 0;
          if (sub && sub.pc === pc && pc.connectionState !== "connected") receiveFailed(failure("connection_lost", true));
        }, DROP_GRACE_MS);
      }
    };
    const openReceive = async () => {
      closeReceive();
      if (!connection || disposed || typeof R.PeerConnection !== "function") return;
      const ticket = receiveTicket, live = () => ticket === receiveTicket && !disposed;
      if (!speaker && !BUSY.has(phase)) phase = tries ? "reconnecting" : "connecting";
      emit();
      try {
        const { config, relay, bare: was } = await iceConfig();
        if (!live()) return;
        await call("receive/open");
        if (!live()) return;
        const pc = new R.PeerConnection(config);
        sub = { pc, relay, bare: was, cameUp: false, syncing: false, again: false };
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
            voices.set(t.mid, { mid: t.mid, participant: t.participant, el: null, meter: null, gain: null, limiter: null });
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
      const rms = Math.sqrt(sum / SAMPLES), loud = rms > SPEAK_ON;
      meter.quiet = loud ? 0 : meter.quiet + 1;
      const next = loud || speaking && meter.quiet < SPEAK_HOLD;
      if (next !== speaking) { speaking = next; emit(); }
      meter.level = BL.nativeIcons.shapeLevel(meter.level, rms);
      tellLevels("own", !!meter.level);
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
        meter = { audio, source, analyser, samples: new Float32Array(SAMPLES), timer: 0, quiet: 0, level: 0 };
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
    const releaseMic = () => {
      timers.clear(holdTimer);
      holdTimer = 0;
      stopMeter();
      if (!mic) return;
      mic.track.enabled = false;
      mic.track.removeEventListener("ended", micEnded);
      for (const track of mic.stream.getTracks()) track.stop();
      mic = null;
      stats.released++;
    };
    // The publishing connection closes here, at once and once, and capture ends; the server is told by the caller.
    // `keep` (a loss the page means to come back from) holds the microphone, off, for the next lease, and the wish to
    // speak again with it; anything else ends both.
    const stopSpeaking = (keep = false) => {
      joinTicket++;
      timers.clear(renewTimer);
      timers.clear(steadyTimer);
      timers.clear(pubDropTimer);
      renewTimer = steadyTimer = pubDropTimer = 0;
      const had = !!mic || !!pub || speaker;
      // A microphone open at the moment of a loss comes back open if the return is quick (`join`).
      if (speaker) { reopen = keep && !muted; lostAt = Date.now(); }
      speaker = false;
      muted = true;
      lease = 0;
      again = keep && again;
      if (!again) { reopen = false; resumeAt = 0; timers.clear(resumeTimer); resumeTimer = 0; }
      if (again && mic && mic.track.readyState !== "ended") {
        mic.track.enabled = false;
        speaking = false;
        timers.clear(holdTimer);
        holdTimer = timers.set(() => { holdTimer = 0; if (!speaker && !BUSY.has(phase)) releaseMic(); }, MIC_HOLD_MS);
      } else releaseMic();
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
    // The browser took the microphone away (another app, a call): a speaker stays one, muted, with nothing captured,
    // and Unmute captures it again. While still joining, the join ends.
    function micEnded() {
      if (!speaker) { if (BUSY.has(phase)) endSpeaking(NOTICE.mic); return; }
      releaseMic();
      deviceId = "";
      muted = true;
      phase = "muted";
      notice = NOTICE.interrupted;
      request("setMic", { muted: true });
      emit();
    }
    let deviceId = "", switchingMic = false, switchError = "";
    const capture = async (id = deviceId) => {
      const stream = await R.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        ...(id ? { deviceId: { exact: id } } : {}) }, video: false });
      const track = stream && stream.getAudioTracks()[0];
      // Off from its first frame: nothing is published, and nothing would be heard, until the speaker unmutes.
      if (track) track.enabled = false;
      return { stream, track };
    };
    const hold = ({ stream, track }) => {
      mic = { stream, track };
      stats.captured++;
      startMeter(stream);
      track.addEventListener("ended", micEnded);
    };
    const microphone = () => ({ active: !!mic && mic.track.readyState !== "ended",
      id: mic?.track.getSettings?.().deviceId || deviceId, label: mic?.track.label || "Microphone",
      switching: switchingMic, error: switchError, available: speaker && !!mic && !!R.enumerateDevices && !BUSY.has(phase) });
    const devices = async () => (await R.enumerateDevices()).filter((d) => d.kind === "audioinput")
      .map((d) => ({ deviceId: d.deviceId, label: d.label }));
    const selectDevice = async (id) => {
      if (!speaker || !mic || !pub || switchingMic || recapturing || BUSY.has(phase)) return false;
      const old = mic, publisher = pub, ticket = joinTicket;
      const valid = () => !disposed && speaker && mic === old && pub === publisher && ticket === joinTicket;
      let got = null;
      switchingMic = true; switchError = ""; localVersion++; emit();
      try {
        got = await capture(String(id || ""));
        if (!got.track || got.track.readyState === "ended") throw failure("nodevice");
        if (!valid()) return false;
        await publisher.tx.sender.replaceTrack(got.track);
        if (!valid()) return false;
        if (got.track.readyState === "ended") {
          await publisher.tx.sender.replaceTrack(old.track);
          throw failure("nodevice");
        }
        releaseMic();
        deviceId = String(id || "");
        hold(got); got = null;
        mic.track.enabled = !muted;
        return true;
      } catch {
        if (valid()) switchError = "Could not switch microphones. Your previous microphone is still selected.";
        return false;
      } finally {
        if (got?.stream) for (const t of got.stream.getTracks()) t.stop();
        switchingMic = false; localVersion++; emit();
      }
    };
    // A publishing connection that failed under a live feed: the lease is given back and asked for again, landing as
    // the speaker had it (`reopen`). One that drops is the first sign of a network change: the feed checks its socket
    // now (a dead one brings a new connection, which speaks again by itself), and if the connection is still down after
    // DROP_GRACE_MS under a feed that lives, it is published again as a failed one is.
    const republish = () => {
      if (!speaker || !again) return endSpeaking(NOTICE.failed);
      mayHold();
      stopSpeaking(true);
      phase = listening();
      emit();
      // `recover`: publishing again, not leaving, so a chat keeps this speaker's place and row meanwhile.
      call("publish/close", { recover: true }).then(() => { stats.closed++; }, () => request("setRole", { role: "listener" })).then(resume);
    };
    const watchPublish = (pc) => pc.addEventListener("connectionstatechange", () => {
      if (!pub || pub.pc !== pc) return;
      timers.clear(pubDropTimer);
      pubDropTimer = 0;
      if (pc.connectionState === "failed") return republish();
      if (pc.connectionState !== "disconnected") return;
      stall();
      pubDropTimer = timers.set(() => {
        pubDropTimer = 0;
        if (pub && pub.pc === pc && pc.connectionState !== "connected") republish();
      }, DROP_GRACE_MS);
    });
    // Speaking again by itself, once the server says this connection may: at most RESUME_TRIES in a row, and after a
    // try that failed not before `resumeAt`.
    const resume = () => {
      if (!again || disposed || speaker || BUSY.has(phase) || !connection || !you || Date.now() < resumeAt) return;
      if (you.speak !== "eligible" || !available() || resumes >= RESUME_TRIES) {
        // Waiting on the server's word (a lease just given back reads pending or active a moment longer) is not a no.
        if (you.speak === "pending" || you.speak === "active") return;
        again = false;
        releaseMic();
        notice = NOTICE.reconnected;
        return emit();
      }
      resumes++;
      join({ resumed: true });
    };
    // The word a page leaves the one after it in this tab: written while it is hidden or leaving as a speaker (or on
    // its way back to speaking), taken back when it is shown again, so it is there only for a page that replaces this one.
    // Before this page's own first connection the word there is still the last page's, and is left alone.
    const remember = (on = true) => {
      if (!memory || disposed || !arrived) return;
      memory.keep(on && again && who && zone ? { id: who, zone, connection: connection || stales.at(-1) || "", open: speaker ? !muted : reopen, at: Date.now() } : null);
    };
    // This page's first connection: the word the page before it left, read once. The same account in the same zone, left
    // no longer ago than RETURN_MS, was speaking a moment ago and speaks again as after a dropped socket (`resume`).
    const recall = () => {
      if (arrived) return;
      arrived = true;
      const was = memory ? memory.take() : null;
      if (!was || typeof was !== "object" || again || !who || was.id !== who || was.zone !== zone || !Number.isFinite(was.at)) return;
      const ago = Date.now() - was.at;
      if (ago < 0 || ago >= RETURN_MS) return;
      again = true;
      reopen = was.open === true;
      lostAt = was.at;
      if (typeof was.connection === "string" && was.connection) stales.push(was.connection);
    };
    const join = async ({ resumed = false, takeover = false } = {}) => {
      if (disposed || speaker || BUSY.has(phase) || !connection || !available() || !you) return;
      // Voice held on another device (`you.elsewhere`) is taken only on the visitor's word.
      if (you.speak !== "eligible" && !(takeover && you.elsewhere)) return;
      const ticket = ++joinTicket, live = () => ticket === joinTicket && !disposed;
      if (!resumed) { resumes = 0; again = false; reopen = false; resumeAt = 0; timers.clear(resumeTimer); resumeTimer = 0; }
      // A resumed join that failed for a passing reason (`retry`) is made again after a wait, while tries are left: the
      // microphone and the wish to speak are kept, and a lease the server granted is given back. Anything else listens.
      const fail = (why, retry = false, giveBack = lease > 0) => {
        if (!resumed || !retry || !again || resumes >= RESUME_TRIES) return endSpeaking(why, giveBack);
        stopSpeaking(true);
        if (giveBack) call("publish/close", { recover: true }).then(() => { stats.closed++; }, () => request("setRole", { role: "listener" }));
        phase = listening();
        const wait = RESUME_WAIT_MS * Math.max(1, resumes);
        resumeAt = Date.now() + wait;
        timers.clear(resumeTimer);
        resumeTimer = timers.set(() => { resumeTimer = 0; resumeAt = 0; resume(); }, wait);
        emit();
      };
      const held = !!mic && mic.track.readyState !== "ended";
      phase = held ? "requesting" : "permission";
      notice = "";
      // Inside the click: whatever playback the browser held back may start now too.
      if (blocked) { blocked = false; for (const v of voices.values()) if (v.el) play(v); }
      emit();
      if (held) { timers.clear(holdTimer); holdTimer = 0; }
      else {
        releaseMic();
        let got;
        try {
          got = await capture();
        } catch (err) {
          if (live()) endSpeaking(resumed ? NOTICE.reconnected : micNotice(err), false);
          return;
        }
        if (!live() || !got.track) {
          if (got.stream) for (const t of got.stream.getTracks()) t.stop();
          if (live()) endSpeaking(resumed ? NOTICE.reconnected : NOTICE.nodevice, false);
          return;
        }
        hold(got);
        phase = "requesting";
        emit();
      }
      const { track } = mic;
      // Every connection this page may still hold a lease under is named, so its own stale lease does not refuse it.
      const granted = await ask("setRole", { role: "speaker", ...(stales.length ? { replaces: stales.length === 1 ? stales[0] : stales.slice() } : {}), ...(takeover ? { takeover: true } : {}) });
      if (!live()) return;
      if (!granted.ok) {
        // No answer at all is the feed's socket, not a refusal: it is checked now, and the first such silence under a
        // connection is not a try (a dead socket's next connection speaks again by itself).
        if (resumed && granted.error && granted.error.code === "timeout") {
          if (!unanswered) { unanswered = true; resumes = Math.max(0, resumes - 1); }
          stall();
        }
        return fail(NOTICE[REFUSED[granted.error && granted.error.code]] || NOTICE.failed, !!(granted.error && granted.error.retryable), false);
      }
      lease = granted.you && Number.isSafeInteger(granted.you.lease) ? granted.you.lease : you && Number.isSafeInteger(you.lease) ? you.lease : 0;
      if (!lease) return fail(NOTICE.failed, true, false);
      phase = "negotiating";
      emit();
      try {
        // One more try when the connection never comes up: the other way round (`bare`), on a fresh session.
        for (let attempt = 0; ; attempt++) {
          const { config, relay, bare: was } = await iceConfig();
          if (!live()) return;
          await call("publish/open", { generation: lease });
          if (!live()) return;
          const pc = new R.PeerConnection(config);
          const tx = pc.addTransceiver(track, { direction: "sendonly" });
          pub = { pc, tx };
          await pc.setLocalDescription(await pc.createOffer());
          if (!live()) return;
          await gathered(pc, relay);
          if (!live()) return;
          const res = await call("publish/offer", { generation: lease, sdp: pc.localDescription.sdp, mid: tx.mid });
          if (!live()) return;
          if (!res || !res.sessionDescription || typeof res.sessionDescription.sdp !== "string") throw failure("publish_failed", true);
          await pc.setRemoteDescription(res.sessionDescription);
          if (!live()) return;
          try {
            await connected(pc);
          } catch (err) {
            if (!live()) return;
            unreached(was);
            if (attempt) throw err;
            pub = null;
            pc.close();
            continue;
          }
          if (!live()) return;
          await call("publish/ready", { generation: lease });
          if (!live()) return;
          watchPublish(pc);
          break;
        }
      } catch {
        if (live()) fail(NOTICE.failed, true);
        return;
      }
      stats.published++;
      speaker = true;
      again = true;
      unanswered = false;
      stales.length = 0;
      // Back soon after a loss with the microphone open before it: open again, and the server told. Otherwise muted.
      const open = resumed && reopen && Date.now() - lostAt < RETURN_MS && track.readyState !== "ended";
      reopen = false;
      muted = !open;
      track.enabled = open;
      phase = open ? "open" : "muted";
      if (open) request("setMic", { muted: false });
      if (resumed) notice = open ? NOTICE.reopened : NOTICE.resumed;
      timers.clear(renewTimer);
      renewTimer = timers.set(renew, RENEW_MS);
      timers.clear(steadyTimer);
      steadyTimer = timers.set(() => { steadyTimer = 0; resumes = 0; }, STEADY_MS);
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
    let recapturing = false;
    const mute = async () => {
      if (!speaker || recapturing) return;
      if (!mic) {
        // The browser took the microphone (`micEnded`): Unmute, a click, captures it again onto the same publication.
        const ticket = joinTicket;
        recapturing = true;
        let got = null;
        try {
          got = await capture();
          if (!got.track) throw failure("nodevice");
          if (ticket === joinTicket && speaker && pub) await pub.tx.sender.replaceTrack(got.track);
        } catch (err) {
          if (got && got.stream) for (const t of got.stream.getTracks()) t.stop();
          recapturing = false;
          if (ticket === joinTicket && speaker) { notice = err && err.code === "nodevice" ? NOTICE.nodevice : micNotice(err); emit(); }
          return;
        }
        recapturing = false;
        if (ticket !== joinTicket || !speaker || !pub) { for (const t of got.stream.getTracks()) t.stop(); return; }
        hold(got);
        notice = "";
        muted = true;
      }
      muted = !muted;
      mic.track.enabled = !muted;
      phase = muted ? "muted" : "open";
      request("setMic", { muted });
      emit();
    };
    // The server's word on this connection: a lease it no longer holds ends speaking here at once (`why`: "moved" when
    // the visitor took voice to another device). A connection that may speak again resumes a speaker who lost theirs.
    const learn = (next, why = "") => {
      if (!next || typeof next.speak !== "string") return;
      const was = you && you.elsewhere;
      you = next;
      if (typeof next.id === "string") who = next.id;
      syncPreferences();
      if (was !== next.elsewhere || state.localVersion !== localVersion) emit();
      if (lease && (speaker || BUSY.has(phase)) && next.speak !== "pending" && next.speak !== "active") endSpeaking(why === "moved" ? NOTICE.moved : NOTICE.ended, false);
      else if (again && !speaker && !BUSY.has(phase)) resume();
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
      if (msg.type === "you") { if (msg.zone === zone) learn(msg.you, msg.reason); return; }
      if (msg.type === "media") {
        if (msg.op !== "sync") return;
        drop(msg.closed);
        if (sub) sync();
        return;
      }
      if (msg.type !== "snapshot" || msg.zone !== zone) return;
      if (typeof msg.connection === "string" && msg.connection !== connection) {
        // A new audience connection: nothing held under the old one is ours at the server any more. A speaker keeps
        // their microphone, off, and speaks again under this one once it may (`resume`).
        if (speaker || lease || BUSY.has(phase)) mayHold();
        const was = stopSpeaking(true);
        forgetWaiters();
        connection = msg.connection;
        // A wait after a try that failed was for the connection it failed under.
        unanswered = false; resumeAt = 0; timers.clear(resumeTimer); resumeTimer = 0;
        you = msg.you && typeof msg.you.speak === "string" ? msg.you : null;
        if (you && typeof you.id === "string") who = you.id;
        syncPreferences();
        recall();
        tries = 0;
        if (was && !again) notice = NOTICE.reconnected;
        phase = "connecting";
        openReceive();
        resume();
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
      // A socket that dropped comes back, and so does one a full zone or a busy edge turned away for a moment (`full`):
      // a speaker keeps their microphone, off, for the connection after it. A join under way may have its lease too.
      if (speaker || lease || BUSY.has(phase)) mayHold();
      const was = stopSpeaking(next === "reconnecting" || next === "full");
      forgetWaiters();
      closeReceive();
      connection = null;
      you = null;
      tries = 0;
      phase = "off";
      notice = was && next !== "off" && !again ? NOTICE.reconnected : "";
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
      who = null;
      syncPreferences();
      stales.length = 0;
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
      if (hearAudio) { hearAudio.removeEventListener("statechange", emit); hearAudio.close().catch(() => {}); }
      hearAudio = null;
      disposed = true;
      target.removeEventListener("pointerup", wake, true);
      target.removeEventListener("keydown", wake, true);
    };
    const supported = () => typeof R.PeerConnection === "function" && typeof R.getUserMedia === "function";
    const available = () => supported() && !!allowed();
    return { heard, status, zone: zoneTo, join, leave, mute, microphone, devices, selectDevice, level, ownLevel, subscribeLevels, muteLocal, mutedLocally, setVolume, volumeOf, VOLUME_MAX, duel, setMuteDuels, mutedByDuel, identify, release, stop, retry, remember, dispose,
      get available() { return available(); }, get why() { return supported() ? "" : NOTICE.unsupported; },
      get state() { return state; }, get stats() { return { ...stats, voices: voices.size, receiving: !!sub, publishing: !!pub, capturing: !!mic, connection, lease, relay: !!(ice && ice.relay), bare }; } };
  };
  BL.oogaChatMedia = { create, PHASES, NOTICE, IDLE, TURN_TLS, RETURN_MS, RESUME_TRIES };
})();
