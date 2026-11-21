// Thin client for the Cloudflare Realtime SFU connection API, ported from the OBL-Audio prototype. Only
// the room calls it, with the app secret from the environment; a browser never sees the secret or
// another player's session id. https://developers.cloudflare.com/realtime/sfu/api/

const BASE = "https://rtc.live.cloudflare.com/v1/apps";

const TURN_BASE = "https://rtc.live.cloudflare.com/v1/turn/keys";
const TURN_TLS = "turns:turn.cloudflare.com:443?transport=tcp";
const TURN_TTL = 7200;

export const turnConfigured = (env) => !!(env.REALTIME_APP_ID && env.REALTIME_SECRET
  && env.REALTIME_TURN_KEY_ID && env.REALTIME_TURN_TOKEN && env.VOICE_ICE_LIMITER);

export const turnCredentials = async (env) => {
  if (!turnConfigured(env)) return null;
  const key = encodeURIComponent(env.REALTIME_TURN_KEY_ID);
  // Staging can exercise an allocation renewal in five minutes. Production defaults to two hours.
  const configured = Number(env.REALTIME_TURN_TTL);
  const ttl = Number.isInteger(configured) && configured >= 300 && configured <= TURN_TTL ? configured : TURN_TTL;
  // "manual": a redirect is a 3xx, not `ok`, so it reads as no relay (Workers' fetch has no "error" mode).
  const res = await fetch(`${TURN_BASE}/${key}/credentials/generate-ice-servers`, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(5000),
    headers: { authorization: `Bearer ${env.REALTIME_TURN_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ ttl }),
  });
  if (!res.ok) return null;
  const { iceServers } = await res.json();
  if (!Array.isArray(iceServers)) return null;
  for (const server of iceServers) {
    if (!server || !(server.urls === TURN_TLS || Array.isArray(server.urls) && server.urls.includes(TURN_TLS))) continue;
    if (typeof server.username !== "string" || !server.username || typeof server.credential !== "string" || !server.credential) continue;
    return { iceServers: [{ urls: TURN_TLS, username: server.username, credential: server.credential }], ttl };
  }
  return null;
};

// A session the SFU answers 404 or 410 for is gone for good: Cloudflare documents 410 for `session_error` alone ("create
// a new session"), so it owns no tracks and a cleanup of it is done, whatever the body says. These 410s come after about
// five seconds, and a body without the code had kept such a job retried every wake for an hour.
export const sessionGone = (err) => !!err && (err.status === 404 || err.status === 410);

// One pass over a cleanup queue from an alarm: at most CLEANUP_PARALLEL jobs at once, and none started CLEANUP_BUDGET_MS
// after the pass began, so an SFU slow to answer never holds a wake for minutes (a serial pass of 64 jobs at 5 to 8 s a
// call once ran seven). What is left waits for the next wake. `run` handles its own failures. Answers how many it started.
// `queue` is the live queue: the jobs a pass tried that are still in it go to its back, in order, so the next pass starts
// with those it never reached and slow failures at the head cannot keep the rest from ever being tried.
export const CLEANUP_PARALLEL = 4;
export const CLEANUP_BUDGET_MS = 20000;
export const cleanupPass = async (queue, run, now = Date.now) => {
  const jobs = [...queue], deadline = now() + CLEANUP_BUDGET_MS;
  let next = 0;
  const lane = async () => { while (next < jobs.length && now() < deadline) await run(jobs[next++]); };
  await Promise.all(Array.from({ length: Math.min(CLEANUP_PARALLEL, jobs.length) }, lane));
  // In place, and only now: jobs queued or removed meanwhile keep their places and stay removed.
  const tried = new Set(jobs.slice(0, next));
  const rest = queue.filter((job) => !tried.has(job)), again = queue.filter((job) => tried.has(job));
  queue.splice(0, queue.length, ...rest, ...again);
  return next;
};

// `measured(ms, failed, status)`, when given, hears how long each call took, whether it failed and its HTTP status (0
// for no answer: a timeout or the network), for the inspector's counts.
export const sfuClient = (env, measured = null) => {
  if (!env.REALTIME_APP_ID || !env.REALTIME_SECRET) return null;
  const base = `${BASE}/${env.REALTIME_APP_ID}`;
  const headers = { authorization: `Bearer ${env.REALTIME_SECRET}`, "content-type": "application/json" };
  // Leave time for a bounded error response before the browser's 10 s signalling deadline.
  const call = async (method, path, body, timeout = 5000) => {
    const started = Date.now();
    let failed = true, status = 0;
    try {
      const res = await fetch(base + path, { method, headers, signal: AbortSignal.timeout(timeout), body: body ? JSON.stringify(body) : undefined });
      status = res.status;
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.errorCode) {
        const error = new Error(`SFU request failed: ${res.status} ${data.errorCode || ""}`.trim());
        error.status = res.status; error.code = data.errorCode; throw error;
      }
      failed = false;
      return data;
    } finally {
      if (measured) measured(Date.now() - started, failed, status);
    }
  };
  return {
    // Background cleanup can wait for the SFU's five-second transport response. Request-path cleanup keeps its
    // shorter deadline because it may follow another SFU call inside the browser's ten-second signalling budget.
    getSession: (sessionId, background = false) => call("GET", `/sessions/${sessionId}`, undefined, background ? 8000 : 5000),
    newSession: () => call("POST", "/sessions/new"),
    newTracks: (sessionId, body) => call("POST", `/sessions/${sessionId}/tracks/new`, body),
    renegotiate: (sessionId, sdp) => call("PUT", `/sessions/${sessionId}/renegotiate`, { sessionDescription: { type: "answer", sdp } }),
    closeTracks: (sessionId, mids, background = false) => call("PUT", `/sessions/${sessionId}/tracks/close`, { tracks: mids.map((mid) => ({ mid })), force: true }, background ? 8000 : 5000),
  };
};
