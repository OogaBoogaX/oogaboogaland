// Thin client for the Cloudflare Realtime SFU connection API, ported from the OBL-Audio prototype. Only
// the room calls it, with the app secret from the environment; a browser never sees the secret or
// another player's session id. https://developers.cloudflare.com/realtime/sfu/api/

const BASE = "https://rtc.live.cloudflare.com/v1/apps";

// `measured(ms, failed)`, when given, hears how long each call took and whether it failed (the inspector's counts).
export const sfuClient = (env, measured = null) => {
  if (!env.REALTIME_APP_ID || !env.REALTIME_SECRET) return null;
  const base = `${BASE}/${env.REALTIME_APP_ID}`;
  const headers = { authorization: `Bearer ${env.REALTIME_SECRET}`, "content-type": "application/json" };
  // Leave time for a bounded error response before the browser's 10 s signalling deadline.
  const call = async (method, path, body) => {
    const started = Date.now();
    let failed = true;
    try {
      const res = await fetch(base + path, { method, headers, signal: AbortSignal.timeout(5000), body: body ? JSON.stringify(body) : undefined });
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
    getSession: (sessionId) => call("GET", `/sessions/${sessionId}`),
    newSession: () => call("POST", "/sessions/new"),
    newTracks: (sessionId, body) => call("POST", `/sessions/${sessionId}/tracks/new`, body),
    renegotiate: (sessionId, sdp) => call("PUT", `/sessions/${sessionId}/renegotiate`, { sessionDescription: { type: "answer", sdp } }),
    closeTracks: (sessionId, mids) => call("PUT", `/sessions/${sessionId}/tracks/close`, { tracks: mids.map((mid) => ({ mid })), force: true }),
  };
};
