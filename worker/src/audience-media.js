// Ooga Chat's media broker (#666): the Audience object's signalling with the environment's one Realtime SFU app, the
// same app the island's voice uses, so an authorized track is pulled straight from its publisher. Media goes publisher
// to SFU to listener; nothing here carries or mixes audio. The SFU secret stays in the island Worker's environment.
//
// What a listener may pull is decided here, never by the client: it names its own connection, never a session or track
// of anyone else's, and `sync` pulls every speaker of its zone, other than itself, that is publishing:
//   world speakers   the island's outdoor publishers, by the publication reference the Room hands over in `world`
//   chat speakers    Ooga Chat speakers whose lease is active and whose microphone is published (`publish/ready`)
// checked before the SFU call and again after it, so a zone, lease or publication that changed while it was in flight
// keeps nothing it should not: those tracks are closed through the durable cleanup queue before any reply.
// A speaker publishes one track, the microphone alone (never playback, a mix or a loopback), on its own session, only
// under its pending or active lease of the same generation. A publication retired (Leave Voice, a lease ending, a zone
// change, a revocation, the island taking the identity) is removed from the catalog at once, every subscription to it
// is closed at the SFU, and its publisher's session closed, all through the queue, retried by the alarm until it
// succeeds or an hour passes, after every client has gone too. Per connection: `media:<connId>` in storage (sessions
// and pulled mids), restored on a wake; calls run one at a time; at most 64 pulled tracks.
//
// Ops (POST /media/<op>, body `{ connection, generation?, sdp?, mid?, mids? }`):
//   ice              short-lived TURN credentials, as the island's voice has them
//   receive/open     a receive-only session for this connection (a listener never needs a microphone)
//   receive/sync     add the zone's authorized publications and drop the rest: `{ tracks: [{ participant, mid }], closed,
//                    sessionDescription, requiresImmediateRenegotiation }`
//   renegotiate      the client's answer for the receive session
//   receive/close    give up some pulled tracks
//   publish/open     a publish session, under a pending or active lease of `generation`
//   publish/offer    the microphone's offer: one local audio track, answered
//   publish/ready    the publication is connected: the lease becomes an active, muted speaker
//   publish/close    stop publishing and go back to listening (the receive session stays)
//   leave            give up everything

import { sfuClient, turnCredentials } from "./sfu.js";

export const MEDIA_BODY_MAX = 256 * 1024;
export const TRACKS_MAX = 64;
export const CLEANUP_MS = 60 * 60 * 1000;
export const CLEANUP_RETRY_MS = 60 * 1000;
export const CLEANUP_BACKLOG_MAX = 64;
export const VOICE_TRACK = "mic";
const sfuSessionGone = (err) => err.status === 404 || (err.status === 410 && err.code === "session_error");

const answer = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const refuse = (code, status, retryable = false) => answer({ error: { code, retryable } }, status);

export const emptyMedia = () => ({ sub: null, mids: {}, pub: null, pubMid: null, pending: false, track: null, gen: 0, lease: 0 });

/** The media half of an Audience object; `aud` is the object, whose model, storage and sockets it uses. */
export const createMediaBroker = (aud) => {
  const env = aud.env;
  const sfu = sfuClient(env);
  const states = new Map();
  const queues = new Map();
  let cleanup = [];

  const stateOf = (connId) => {
    let s = states.get(connId);
    if (!s) { s = emptyMedia(); states.set(connId, s); }
    return s;
  };
  const save = async (connId) => {
    const s = states.get(connId);
    if (s) await aud.ctx.storage.put(`media:${connId}`, s);
  };
  const forget = async (connId) => { states.delete(connId); queues.delete(connId); await aud.ctx.storage.delete(`media:${connId}`); };

  // --- the durable cleanup queue ---
  const persistCleanup = () => aud.ctx.storage.put("mediaCleanup", cleanup);
  /** Close `mids` on `session` (or everything still open on it, `all`), now and, if that fails, from the alarm. */
  const queueClose = async (session, mids, all = false) => {
    if (!sfu || !session || (!mids.length && !all)) return;
    let job = cleanup.find((j) => j.session === session);
    // A merge bumps the job's version, so a run already in flight for it leaves it for the run this one starts.
    if (job) { job.mids = [...new Set(job.mids.concat(mids))]; job.all = job.all || all; job.v = (job.v || 0) + 1; }
    else cleanup.push(job = { session, mids: [...new Set(mids)], all, at: Date.now(), tries: 0 });
    await persistCleanup();
    await runCleanup(job);
  };
  // Two runs can hold the same job at once (the alarm's, and `queueClose`'s after a merge: an SFU call opens the object's
  // input gate), so a job leaves the queue only if it is still there, never by a stale index.
  const removeJob = (job) => { const i = cleanup.indexOf(job); if (i >= 0) cleanup.splice(i, 1); };
  const runCleanup = async (only = null) => {
    for (const job of [...cleanup]) {
      if (only && job !== only) continue;
      if (!cleanup.includes(job)) continue;
      if (Date.now() - job.at > CLEANUP_MS) { removeJob(job); continue; }
      job.tries++;
      const v = job.v || 0;
      try {
        let mids = job.mids.slice();
        if (job.all) {
          const state = await sfu.getSession(job.session, true);
          mids = [...new Set(mids.concat((state.tracks || []).filter((t) => t.status !== "inactive" && typeof t.mid === "string").map((t) => t.mid)))];
        }
        const res = mids.length ? await sfu.closeTracks(job.session, mids, true) : { tracks: [] };
        // `close_track_error` confirms a track already gone; anything else unconfirmed is tried again, those `all` found
        // included, and anything merged in meanwhile is kept.
        const done = new Set((res.tracks || []).filter((t) => t && typeof t.mid === "string" && (!t.errorCode || t.errorCode === "close_track_error")).map((t) => t.mid));
        job.mids = [...new Set(job.mids.concat(mids))].filter((mid) => !done.has(mid));
        // Merged into meanwhile (its version moved): the run `queueClose` started finishes it, with `all` as asked.
        if ((job.v || 0) === v) { if (!job.mids.length) removeJob(job); else job.all = false; }
      } catch (err) {
        if (sfuSessionGone(err)) removeJob(job);
      }
    }
    await persistCleanup();
  };

  // --- what may be pulled ---
  /** participant -> { session, track, gen } for every publishing speaker of `conn`'s zone but its own identity. */
  const authorizedFor = (conn) => {
    const out = new Map();
    if (!conn || !conn.zone) return out;
    for (const s of aud.island.speakers) {
      if (s.zone === conn.zone && s.id !== conn.id && s.pub && s.pub.session && s.pub.track) out.set(s.id, { session: s.pub.session, track: s.pub.track, gen: s.pub.gen || 0 });
    }
    for (const c of aud.model.conns.values()) {
      if (c.zone !== conn.zone || c.id === conn.id || !c.lease || c.lease.state !== "active") continue;
      const m = states.get(c.connId);
      if (m && m.pub && m.track && !out.has(c.id)) out.set(c.id, { session: m.pub, track: m.track, gen: m.gen });
    }
    return out;
  };

  /** Chat speakers' publications by zone, for the Room's island players with an open outdoor grant there. */
  const chatSources = () => {
    const out = [];
    for (const c of aud.model.conns.values()) {
      if (!c.zone || !c.lease || c.lease.state !== "active" || !c.id.startsWith("gh:")) continue;
      const m = states.get(c.connId);
      if (m && m.pub && m.track) out.push({ id: Number(c.id.slice(3)), zone: c.zone, session: m.pub, track: m.track, gen: m.gen });
    }
    return out.sort((a, b) => a.id - b.id);
  };

  /** Close every pulled track that is no longer allowed (a publication retired, a zone left): server-side, at once. */
  const prune = async () => {
    for (const [connId, s] of states) {
      if (!s.sub) continue;
      const allowed = authorizedFor(aud.model.conns.get(connId));
      const gone = Object.entries(s.mids).filter(([, [participant, gen]]) => { const a = allowed.get(participant); return !a || a.gen !== gen; }).map(([mid]) => mid);
      if (!gone.length) continue;
      for (const mid of gone) delete s.mids[mid];
      await save(connId);
      await queueClose(s.sub, gone);
      const ws = aud.sockets.get(connId);
      if (ws) aud.send(ws, { type: "media", op: "sync" });
    }
  };

  /** A publication ends: out of the catalog first, then closed at the SFU, then every subscription to it. */
  const retirePublication = async (connId) => {
    const s = states.get(connId);
    if (!s || !s.pub) return;
    const session = s.pub, mid = s.pubMid;
    s.pub = s.pubMid = s.track = null; s.pending = false; s.lease = 0;
    await save(connId);
    await queueClose(session, mid ? [mid] : [], !mid);
    await prune();
    aud.sourcesChanged();
  };

  const releaseAll = async (connId) => {
    const s = states.get(connId);
    if (!s) return;
    if (s.sub) await queueClose(s.sub, Object.keys(s.mids), !Object.keys(s.mids).length);
    if (s.pub) await queueClose(s.pub, s.pubMid ? [s.pubMid] : [], !s.pubMid);
    const had = !!s.pub;
    await forget(connId);
    if (had) { await prune(); aud.sourcesChanged(); }
  };

  // --- one op ---
  const operation = async (op, conn, body) => {
    if (op === "ice") {
      const data = await turnCredentials(env).catch(() => null);
      return answer(data || {});
    }
    if (!sfu) return refuse("voice_unavailable", 503, true);
    if (cleanup.length >= CLEANUP_BACKLOG_MAX && !["leave", "publish/close", "receive/close"].includes(op)) return refuse("cleanup_pending", 503, true);
    const s = stateOf(conn.connId);
    const current = () => aud.model.conns.get(conn.connId) === conn;
    const leaseOk = () => !!conn.lease && conn.lease.generation === body.generation;
    if (op === "receive/open") {
      if (s.sub) { await queueClose(s.sub, Object.keys(s.mids), !Object.keys(s.mids).length); s.sub = null; s.mids = {}; }
      const { sessionId } = await sfu.newSession();
      if (!current()) { await queueClose(sessionId, [], true); return refuse("stale_epoch", 409); }
      s.sub = sessionId; s.mids = {};
      await save(conn.connId);
      return answer({ ok: true });
    }
    if (op === "receive/sync") {
      if (!s.sub) return refuse("receive_required", 400);
      const session = s.sub, allowed = authorizedFor(conn);
      const closed = Object.entries(s.mids).filter(([, [participant, gen]]) => { const a = allowed.get(participant); return !a || a.gen !== gen; }).map(([mid]) => mid);
      for (const mid of closed) delete s.mids[mid];
      if (closed.length) await queueClose(session, closed);
      const held = new Set(Object.values(s.mids).map(([participant]) => participant));
      const wanted = [...allowed].filter(([participant]) => !held.has(participant)).slice(0, Math.max(0, TRACKS_MAX - held.size));
      if (!wanted.length) { await save(conn.connId); return answer({ tracks: [], closed, requiresImmediateRenegotiation: false }); }
      const requested = new Map(wanted.map(([participant, a]) => [a.session, { participant, track: a.track, gen: a.gen }]));
      let res;
      try { res = await sfu.newTracks(session, { tracks: wanted.map(([, a]) => ({ location: "remote", sessionId: a.session, trackName: a.track })) }); }
      catch (err) {
        // Unknown mids after a failure: this receiver is abandoned and swept whole.
        if (s.sub === session) { s.sub = null; s.mids = {}; await save(conn.connId); }
        await queueClose(session, [], true);
        throw err;
      }
      // The zone, a lease or a publication may have changed meanwhile: keep only what is still allowed now.
      const live = current() && s.sub === session, now = live ? authorizedFor(conn) : new Map();
      const kept = [], drop = [];
      for (const t of res.tracks || []) {
        const asked = requested.get(t.sessionId), a = asked && now.get(asked.participant);
        if (live && asked && a && a.session === t.sessionId && a.track === asked.track && a.gen === asked.gen && typeof t.mid === "string" && !t.errorCode) {
          s.mids[t.mid] = [asked.participant, asked.gen];
          kept.push({ participant: asked.participant, mid: t.mid });
        } else if (typeof t.mid === "string" && !t.errorCode) drop.push(t.mid);
      }
      await save(conn.connId);
      if (drop.length) await queueClose(session, drop);
      if (!live) return refuse("permission_changed", 409, true);
      return answer({ tracks: kept, closed, sessionDescription: res.sessionDescription, requiresImmediateRenegotiation: !!res.requiresImmediateRenegotiation });
    }
    if (op === "renegotiate") {
      if (!s.sub || typeof body.sdp !== "string") return refuse("malformed", 400);
      await sfu.renegotiate(s.sub, body.sdp);
      return answer({ ok: true });
    }
    if (op === "receive/close") {
      if (!s.sub || !Array.isArray(body.mids)) return refuse("malformed", 400);
      const mids = body.mids.filter((mid) => typeof mid === "string" && Object.hasOwn(s.mids, mid)).slice(0, TRACKS_MAX);
      for (const mid of mids) delete s.mids[mid];
      await save(conn.connId);
      if (mids.length) await queueClose(s.sub, mids);
      return answer({ ok: true });
    }
    if (op === "publish/open") {
      if (!leaseOk()) return refuse("capability_required", 403);
      if (s.pub) await retirePublication(conn.connId);
      const { sessionId } = await sfu.newSession();
      if (!current() || !leaseOk()) { await queueClose(sessionId, [], true); return refuse("stale_epoch", 409); }
      s.pub = sessionId; s.pubMid = null; s.track = null; s.pending = false; s.lease = body.generation;
      await save(conn.connId);
      return answer({ ok: true });
    }
    if (op === "publish/offer") {
      if (!leaseOk() || !s.pub || s.lease !== body.generation) return refuse("capability_required", 403);
      if (typeof body.sdp !== "string" || typeof body.mid !== "string" || body.mid.length > 32) return refuse("malformed", 400);
      const session = s.pub;
      let res;
      try { res = await sfu.newTracks(session, { sessionDescription: { type: "offer", sdp: body.sdp }, tracks: [{ location: "local", mid: body.mid, trackName: VOICE_TRACK }] }); }
      catch (err) { if (s.pub === session) { s.pub = s.pubMid = null; await save(conn.connId); } await queueClose(session, [body.mid], true); throw err; }
      const t = res.tracks && res.tracks[0];
      if (!t || t.errorCode) return refuse("publish_failed", 502, true);
      if (!current() || !leaseOk() || s.pub !== session) { await queueClose(session, [t.mid || body.mid]); return refuse("stale_epoch", 409); }
      s.pubMid = t.mid || body.mid; s.pending = true;
      await save(conn.connId);
      return answer({ sessionDescription: res.sessionDescription });
    }
    if (op === "publish/ready") {
      if (!leaseOk() || !s.pub || !s.pending || s.lease !== body.generation) return refuse("capability_required", 403);
      s.track = VOICE_TRACK; s.pending = false;
      // A new publication generation every time a microphone goes live: whoever pulled an older one pulls this one.
      s.gen = aud.nextGeneration();
      await save(conn.connId);
      const r = aud.model.activate(conn.connId, body.generation);
      if (!r.ok) { await retirePublication(conn.connId); return refuse("stale_epoch", 409); }
      aud.save(conn.connId);
      await aud.flush();
      aud.sourcesChanged();
      aud.tellYou(conn.connId);
      return answer({ ok: true, publication: s.gen });
    }
    if (op === "publish/close") {
      const lease = aud.model.endLease(conn.connId);
      await retirePublication(conn.connId);
      aud.save(conn.connId);
      await aud.flush();
      if (lease) aud.tellYou(conn.connId);
      return answer({ ok: true });
    }
    if (op === "leave") {
      aud.model.endLease(conn.connId);
      await releaseAll(conn.connId);
      aud.save(conn.connId);
      await aud.flush();
      return answer({ ok: true });
    }
    return refuse("unknown_operation", 404);
  };

  /** One op from a connection, after every earlier op of the same connection has finished. */
  const request = (op, conn, body) => {
    const run = (queues.get(conn.connId) || Promise.resolve()).catch(() => {}).then(async () => {
      try { return await operation(op, conn, body); }
      catch { return refuse("upstream_failed", 502, true); }
    });
    const tail = run.then(() => {}, () => {});
    queues.set(conn.connId, tail);
    aud.background(tail);
    return run;
  };

  const restore = async () => {
    cleanup = (await aud.ctx.storage.get("mediaCleanup")) || [];
    const stored = await aud.ctx.storage.list({ prefix: "media:" });
    for (const [key, value] of stored) {
      const connId = key.slice(6);
      if (aud.model.conns.has(connId)) states.set(connId, value);
      // A socket that went while the object slept: its sessions are swept.
      else { if (value.sub) cleanup.push({ session: value.sub, mids: Object.keys(value.mids || {}), all: true, at: Date.now(), tries: 0 });
        if (value.pub) cleanup.push({ session: value.pub, mids: value.pubMid ? [value.pubMid] : [], all: !value.pubMid, at: Date.now(), tries: 0 });
        await aud.ctx.storage.delete(key); }
    }
    if (cleanup.length) await persistCleanup();
  };

  return {
    request, restore, retirePublication, releaseAll, prune, chatSources, authorizedFor, runCleanup,
    get cleanup() { return cleanup; }, get states() { return states; }, get configured() { return !!sfu; },
    nextCleanup: () => (cleanup.length ? Date.now() + CLEANUP_RETRY_MS : Infinity),
  };
};
