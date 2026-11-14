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
  const res = await fetch(`${TURN_BASE}/${key}/credentials/generate-ice-servers`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
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

// `measured(ms, failed)`, when given, hears how long each call took and whether it failed (the inspector's counts).
export const sfuClient = (env, measured = null) => {
  if (!env.REALTIME_APP_ID || !env.REALTIME_SECRET) return null;
  const base = `${BASE}/${env.REALTIME_APP_ID}`;
  const headers = { authorization: `Bearer ${env.REALTIME_SECRET}`, "content-type": "application/json" };
  // Leave time for a bounded error response before the browser's 10 s signalling deadline.
  const call = async (method, path, body, timeout = 5000) => {
    const started = Date.now();
    let failed = true;
    try {
      const res = await fetch(base + path, { method, headers, signal: AbortSignal.timeout(timeout), body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.errorCode) {
        const error = new Error(`SFU request failed: ${res.status} ${data.errorCode || ""}`.trim());
        error.status = res.status; error.code = data.errorCode; throw error;
      }
      failed = false;
      return data;
    } finally {
      if (measured) measured(Date.now() - started, failed);
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
