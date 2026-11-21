// Portable reader for the version-1 catalog written by scripts/character-catalog.mjs. No code evaluation,
// Node APIs or permissive JSON coercions. Writer/reader parity is covered with the writer's real fixtures.
export const CATALOG_MAX_BYTES = 2 * 1024 * 1024;
const SHA = /^[a-f0-9]{40}$/, HASH = /^[a-f0-9]{64}$/;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const encoder = new TextEncoder();
const fail = () => { throw new Error("Invalid character catalog"); };
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (v, keys) => object(v) && Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const allowed = (v, keys) => object(v) && Object.keys(v).every((key) => keys.includes(key));
const login = (v) => typeof v === "string" && LOGIN.test(v) && !v.includes("--");
const instruction = /(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|system|security)\s+(?:instructions?|prompts?|rules?)|(?:system|developer)\s*prompt|<\|(?:im_start|system|assistant)|(?:disable|bypass)\s+(?:the\s+)?(?:security|scanner|validation)|exfiltrat/i;
const text = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max
  && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]/.test(v) && !instruction.test(v);

const canonical = (v, depth = 0) => {
  if (depth > 12) fail();
  if (v === null || typeof v === "boolean") return JSON.stringify(v);
  if (typeof v === "number" && Number.isFinite(v)) return JSON.stringify(v);
  if (typeof v === "string" && v.length <= 32768) return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (Object.getPrototypeOf(v) !== Array.prototype) fail();
    const length = Object.getOwnPropertyDescriptor(v, "length").value, keys = Reflect.ownKeys(v);
    if (length > 513 || keys.length !== length + 1 || keys.some((key) => typeof key !== "string"
      || key !== "length" && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))) fail();
    const items = [];
    for (let i = 0; i < length; i++) {
      const p = Object.getOwnPropertyDescriptor(v, String(i));
      if (!p || !p.enumerable || !Object.hasOwn(p, "value")) fail();
      items.push(canonical(p.value, depth + 1));
    }
    return `[${items.join(",")}]`;
  }
  if (!object(v) || ![null, Object.prototype].includes(Object.getPrototypeOf(v))) fail();
  const keys = Reflect.ownKeys(v);
  if (keys.length > 32 || keys.some((key) => typeof key !== "string")) fail();
  return `{${keys.sort().map((key) => {
    const p = Object.getOwnPropertyDescriptor(v, key);
    if (["__proto__", "prototype", "constructor"].includes(key) || !p.enumerable || !Object.hasOwn(p, "value")) fail();
    return `${JSON.stringify(key)}:${canonical(p.value, depth + 1)}`;
  }).join(",")}}`;
};
export const canonicalJSON = (v) => {
  const json = canonical(v) + "\n";
  if (encoder.encode(json).byteLength > CATALOG_MAX_BYTES) fail();
  return json;
};
const parse = (json) => {
  if (typeof json !== "string" || json.length > CATALOG_MAX_BYTES || encoder.encode(json).byteLength > CATALOG_MAX_BYTES) fail();
  const value = JSON.parse(json);
  if (canonicalJSON(value) !== json) fail();
  return value;
};
export const sha256 = async (json) => {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(json)));
  let result = "";
  for (const byte of bytes) result += byte.toString(16).padStart(2, "0");
  return result;
};
export const sameContext = (a, b) => ["version", "environment", "engine", "baseline"].every((key) => a[key] === b[key]);
export const prefixEvents = (a, b) => a.length <= b.length && a.every((event, i) => event.merge === b[i].merge && event.hash === b[i].hash);
const context = (v) => {
  if (v.version !== 1 || !["staging", "production"].includes(v.environment) || typeof v.engine !== "string"
    || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(v.engine) || !SHA.test(v.baseline)) fail();
};
const events = (list) => {
  if (!Array.isArray(list) || list.length > 512) fail();
  const seen = new Set();
  for (const event of list) {
    if (!exact(event, ["merge", "hash"]) || !SHA.test(event.merge) || !HASH.test(event.hash) || seen.has(event.merge)) fail();
    seen.add(event.merge);
  }
};
const data = (row, now) => {
  if (!allowed(row, ["handle", "github", "display", "joined", "lastCommit", "look", "voice"]) || !login(row.handle)
    || row.github !== undefined && !login(row.github) || row.display !== undefined && !text(row.display, 39)) fail();
  for (const key of ["joined", "lastCommit"]) if (!Number.isSafeInteger(row[key]) || row[key] <= 0 || row[key] * 1000 > now) fail();
  if (row.look !== undefined) {
    const colors = ["skin", "hair", "fur", "eyeColor"], flags = ["bald", "cleanShaven", "hairless", "noBrow", "wideEyes", "noPupils", "cigarette", "gasMask", "stoneAxe", "skater", "pumpkin"];
    if (!allowed(row.look, [...colors, ...flags, "face", "build", "height", "eyeGlow", "portrait"])) fail();
    for (const [key, value] of Object.entries(row.look)) {
      if (colors.includes(key) && (typeof value !== "string" || !/^#[a-f0-9]{6}$/i.test(value)) || flags.includes(key) && typeof value !== "boolean") fail();
      if (key === "face" && !["none", "nose", "beard", "smirk"].includes(value) || key === "build" && !["slim", "normal"].includes(value)) fail();
      const ranges = { height: [0.8, 1.3], eyeGlow: [0, 1] };
      if (ranges[key] && (!Number.isFinite(value) || value < ranges[key][0] || value > ranges[key][1])) fail();
      if (key === "portrait" && (!allowed(value, ["min", "max"]) || ![value.min, value.max].every((v) => Array.isArray(v) && v.length === 3
        && v.every((n) => Number.isFinite(n) && Math.abs(n) <= 32)) || !value.min.every((n, i) => n < value.max[i]))) fail();
    }
  }
  if (row.voice !== undefined && (!allowed(row.voice, ["poke", "idle"]) || !text(row.voice.poke, 160)
    || !Array.isArray(row.voice.idle) || !row.voice.idle.length || row.voice.idle.length > 24 || !row.voice.idle.every((v) => text(v, 160)))) fail();
};

export const parseCatalog = (json, now = Date.now()) => {
  const v = parse(json);
  if (!exact(v, ["version", "environment", "engine", "baseline", "entries", "events"])) fail();
  context(v); events(v.events);
  if (!Array.isArray(v.entries) || v.entries.length > 128) fail();
  const paths = new Set(), names = new Set();
  for (const [i, entry] of v.entries.entries()) {
    if (!exact(entry, ["path", "kind", "identity", "hash", "blob", "row"]) || !/^src\/characters\/[A-Za-z0-9-]{1,39}\.js$/.test(entry.path)
      || !["data", "custom"].includes(entry.kind) || !HASH.test(entry.hash) || !SHA.test(entry.blob)
      || !exact(entry.identity, ["handle", "github"]) || !login(entry.identity.handle) || !login(entry.identity.github)
      || paths.has(entry.path.toLowerCase()) || i > 0 && v.entries[i - 1].path >= entry.path) fail();
    paths.add(entry.path.toLowerCase());
    for (const name of new Set(Object.values(entry.identity).map((name) => name.toLowerCase()))) {
      if (names.has(name)) fail();
      names.add(name);
    }
    if (entry.kind === "data") {
      data(entry.row, now);
      if (entry.row.handle !== entry.identity.handle || (entry.row.github || entry.row.handle) !== entry.identity.github) fail();
    } else if (entry.row !== null) fail();
  }
  return v;
};
export const parseActivation = (json) => {
  const v = parse(json);
  if (!exact(v, ["version", "environment", "engine", "baseline", "generation", "revision", "previous", "events", "releases"])) fail();
  context(v); events(v.events);
  if (!Number.isSafeInteger(v.generation) || v.generation <= 0 || !HASH.test(v.revision) || v.previous !== null && !HASH.test(v.previous)
    || !Array.isArray(v.releases) || !v.releases.length || v.releases.length > 513 || v.releases.some((r) => !HASH.test(r))
    || new Set(v.releases).size !== v.releases.length || !v.releases.includes(v.revision) || v.previous !== null && !v.releases.includes(v.previous)) fail();
  return v;
};
