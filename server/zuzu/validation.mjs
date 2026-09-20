// Server-owned copy of the public v1 contract. Never import browser code as authority.
export const LIMITS = Object.freeze({ message: 1000, response: 1000, history: 12, events: 8, requestBytes: 49152, responseBytes: 8192 });
const encoder = new TextEncoder();
const EVENTS = new Set(["player_seen", "player_left", "player_greeted", "food_seen", "food_activity", "tomato_hit", "shot_nearby", "weapon_hit", "follow_started", "follow_stopped"]);
const LOCATIONS = new Set(["arrival", "perch", "snack_watch", "west", "west_lane", "shop_lane", "courtyard", "east_lane", "garden", "east", "watch", "dsb_land"]);
const MOODS = new Set(["content", "watchful", "offended", "alarmed"]);
const fail = () => { throw new Error("invalid_payload"); };
const shape = (value, keys) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail();
};
const text = (value, max) => {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail();
  const result = value.replace(/\r\n?/g, "\n").trim();
  if (!result) fail();
  return result;
};
const number = (value, max, integer = false) => {
  if (!Number.isFinite(value) || value < 0 || value > max || integer && !Number.isSafeInteger(value)) fail();
  return value;
};
export const validateRequest = raw => {
  if (typeof raw !== "string" || encoder.encode(raw).length > LIMITS.requestBytes) fail();
  const body = JSON.parse(raw);
  shape(body, ["version", "agent", "message", "session", "history"]);
  if (body.version !== 1 || body.agent !== "zuzu") fail();
  const s = body.session;
  shape(s, ["playerName", "location", "mood", "foodCount", "recentEvents"]);
  if (!LOCATIONS.has(s.location) || !MOODS.has(s.mood) || !Array.isArray(s.recentEvents) || s.recentEvents.length > LIMITS.events || !Array.isArray(body.history) || body.history.length > LIMITS.history) fail();
  const recentEvents = s.recentEvents.map(e => {
    shape(e, ["seq", "time", "type", "entity", "value"]);
    if (!EVENTS.has(e.type) || e.entity !== "player" || e.seq < 1) fail();
    return Object.freeze({ seq: number(e.seq, Number.MAX_SAFE_INTEGER, true), time: number(e.time, 1e8), type: e.type, entity: "player", value: number(e.value, 1e6) });
  });
  const history = body.history.map(row => {
    shape(row, ["role", "text"]);
    if (row.role !== "player" && row.role !== "zuzu") fail();
    return Object.freeze({ role: row.role, text: text(row.text, row.role === "player" ? LIMITS.message : LIMITS.response) });
  });
  return Object.freeze({ version: 1, agent: "zuzu", message: text(body.message, LIMITS.message), history: Object.freeze(history), session: Object.freeze({ playerName: text(s.playerName, 40), location: s.location, mood: s.mood, foodCount: number(s.foodCount, 18, true), recentEvents: Object.freeze(recentEvents) }) });
};
export const validateResponse = value => {
  shape(value, ["version", "text"]);
  if (value.version !== 1) fail();
  const reply = text(value.text, LIMITS.response);
  if (/<\/?[a-z][^>]*>/i.test(reply)) fail();
  const result = Object.freeze({ version: 1, text: reply });
  if (encoder.encode(JSON.stringify(result)).length > LIMITS.responseBytes) fail();
  return result;
};
