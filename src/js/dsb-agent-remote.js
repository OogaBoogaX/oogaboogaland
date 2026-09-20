// Provider-independent conversation boundary. Mock remains the shipping default.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const LIMITS = Object.freeze({ message: 1000, response: 1000, history: 12, events: 8, requestBytes: 49152, responseBytes: 8192, timeoutMs: 8000 });
  const EVENTS = new Set(["player_seen", "player_left", "player_greeted", "food_seen", "food_activity", "tomato_hit", "shot_nearby", "weapon_hit", "follow_started", "follow_stopped"]);
  const LOCATIONS = new Set(["arrival", "perch", "snack_watch", "west", "west_lane", "shop_lane", "courtyard", "east_lane", "garden", "east", "watch", "dsb_land"]);
  const MOODS = new Set(["content", "watchful", "offended", "alarmed"]), encoder = new TextEncoder();
  const cleanText = (value, limit) => {
    if (typeof value !== "string" || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error("invalid_text");
    const text = value.replace(/\r\n?/g, "\n").trim();
    if (!text) throw new Error("empty_text");
    return text;
  };
  const makeRequest = (message, context, history) => {
    const body = { version: 1, agent: "zuzu", message: cleanText(message, LIMITS.message), session: {
      playerName: cleanText(context.playerName, 40), location: LOCATIONS.has(context.location) ? context.location : "dsb_land",
      mood: MOODS.has(context.mood) ? context.mood : "content", foodCount: Math.min(18, Math.max(0, Math.trunc(context.foodCount) || 0)),
      recentEvents: context.recentEvents.slice(-LIMITS.events).filter(e => EVENTS.has(e.type) && Number.isSafeInteger(e.seq) && e.seq > 0 && Number.isFinite(e.time) && e.time >= 0 && Number.isFinite(e.value)).map(e => ({ seq: e.seq, time: Math.min(1e8, Math.round(e.time * 10) / 10), type: e.type, entity: "player", value: Math.min(1e6, Math.max(0, e.value)) }))
    }, history: history.slice(-LIMITS.history).map(row => {
      if (row.role !== "player" && row.role !== "zuzu") throw new Error("invalid_role");
      return { role: row.role, text: cleanText(row.text, row.role === "player" ? LIMITS.message : LIMITS.response) };
    }) };
    if (encoder.encode(JSON.stringify(body)).length > LIMITS.requestBytes) throw new Error("request_too_large");
    return body;
  };
  const validateResponse = (raw) => {
    if (typeof raw !== "string" || encoder.encode(raw).length > LIMITS.responseBytes) throw new Error("response_too_large");
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value !== "object" || value.version !== 1 || Object.keys(value).length !== 2 || !Object.hasOwn(value, "text")) throw new Error("invalid_response");
    const text = cleanText(value.text, LIMITS.response);
    if (/<\/?[a-z][^>]*>/i.test(text)) throw new Error("html_not_allowed");
    return Object.freeze({ version: 1, text });
  };
  const mock = async () => JSON.stringify({ version: 1, text: "You've got my attention. Briefly. This is a local mock reply; my AI isn't connected yet. We can still discuss the alarming lack of snacks." });
  // Fixed same-origin endpoint only: provider identity and credentials stay on the server.
  const httpTransport = async (body, { signal }) => {
    const response = await fetch("/api/zuzu/chat", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body, signal, credentials: "omit", redirect: "error", cache: "no-store" });
    if (!response.ok || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get("content-type") || "") || Number(response.headers.get("content-length")) > LIMITS.responseBytes || !response.body) {
      if (response.body) response.body.cancel().catch(() => {});
      throw new Error("service_unavailable");
    }
    const reader = response.body.getReader(), bytes = new Uint8Array(LIMITS.responseBytes);
    let count = 0, complete = false;
    try {
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) { complete = true; break; }
        if (count + value.byteLength > bytes.length) throw new Error("response_too_large");
        bytes.set(value, count); count += value.byteLength;
      }
      signal.throwIfAborted();
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, count));
    } finally { if (!complete) reader.cancel().catch(() => {}); reader.releaseLock(); }
  };
  const create = ({ mode = "mock", transport = httpTransport, timeoutMs = LIMITS.timeoutMs } = {}) => {
    if (mode !== "mock" && mode !== "remote" || mode === "remote" && typeof transport !== "function" || !Number.isFinite(timeoutMs) || timeoutMs < 50 || timeoutMs > 15000) throw new Error("invalid_adapter");
    const send = async (message, context, history, signal) => {
      const body = JSON.stringify(makeRequest(message, context, history));
      if (signal.aborted) throw new Error("cancelled");
      const controller = new AbortController();
      const cancel = () => controller.abort(new Error("cancelled"));
      signal.addEventListener("abort", cancel, { once: true });
      let abortListener;
      const aborted = new Promise((resolve, reject) => { abortListener = () => reject(controller.signal.reason); controller.signal.addEventListener("abort", abortListener, { once: true }); });
      const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
      try {
        const raw = await Promise.race([Promise.resolve().then(() => { if (controller.signal.aborted) throw new Error("cancelled"); return (mode === "mock" ? mock : transport)(body, { signal: controller.signal }); }), aborted]);
        if (controller.signal.aborted) throw new Error("cancelled");
        return validateResponse(raw);
      } finally {
        clearTimeout(timer); signal.removeEventListener("abort", cancel); controller.signal.removeEventListener("abort", abortListener);
      }
    };
    return { mode, send };
  };
  BL.dsbAgentRemote = { create, httpTransport, makeRequest, validateResponse, cleanText, LIMITS, endpoint: "/api/zuzu/chat" };
})();
