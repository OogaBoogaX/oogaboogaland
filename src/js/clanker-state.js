// Continuation of the managed rig's animation, separate from its controller,
// world physics and player ownership. Versioned ordered fields keep the record
// bounded; no route, callback, geometry or world-object reference is serialized.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const VERSION = 1, MAX_BYTES = 24576, ROSTER_BYTES = 65536;
  const FIELDS = ("form gait walkGait phase walkPhase speed backwards pitch heading groundPlane groundX groundZ groundY "
    + "route routeIndex idleFor gaitFor beat pace driven walkStyle inX inZ inRun vy air jumps revealFor pound chewing biped lounge hipHeight "
    + "poundCharge takeoff landing crouch roll rollBlend rollAngle rollTarget rollSide smash dragging throwProgress hipOffsetZ sideAngle swim swimBlend "
    + "climb climbBlend climbPose climbStride climbDirection climbSide groom groomBlend groomSide groomTime sitLook sitShift "
    + "lab labRunIn coatSplit labWork labPhase labSide labReach labReachGrip labPreviewItem labSqueeze labDie labRoll labPalmLift labBench labTouchArm labTouchSide "
    + "labArmOffsetX labArmOffsetY labArmOffsetZ suit suitSplit seatLegs officeRise officeSeat officeWork officePhase officeLook officeSide "
    + "shrugRX shrugRY shrugRZ shrugLX shrugLY shrugLZ").split(" ");
  const FLAGS = new Set(("backwards groundPlane driven inRun air smash dragging lab labRunIn coatSplit labPreviewItem labSqueeze labDie labTouchArm suit suitSplit seatLegs").split(" "));
  const ENUMS = {
    form: ["ape", "code"], gait: ["idle", "knuckle", "gallop", "hunch", "upright", "beat"],
    walkGait: ["knuckle", "gallop", "hunch"], walkStyle: ["knuckle", "gallop", "hunch"],
    biped: [false, true, "squeeze"],
    lounge: ["", "sit", "back", "left", "right", "lean-left", "lean-right", "lean-back"],
    labWork: ["", "type", "touch", "carry", "roll"], officeWork: ["", "type", "look", "abacus"]
  };
  const TOP = ["v", "pose", "values", "hands", "grip", "bench"];
  const id = value => typeof value === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(value);
  const fail = () => { throw new Error("invalid managed Clanker continuation"); };
  const plain = (value, keys) => value && typeof value === "object" && Reflect.ownKeys(value).length === keys.length
    && keys.every(key => { const d = Object.getOwnPropertyDescriptor(value, key); return d && "value" in d; });
  const dense = (value, length) => Array.isArray(value) && value.length === length && Reflect.ownKeys(value).length === length + 1
    && Array.from({ length }, (_, i) => Object.getOwnPropertyDescriptor(value, i)).every(d => d && "value" in d);
  const scalar = value => Number.isFinite(value) && Math.abs(value) <= 1000000;
  const encode = value => Object.is(value, -0) ? "-0" : Number.isNaN(value) ? null : value;
  const decode = value => value === "-0" ? -0 : value;
  const poseFields = ["v", "world", "profile", "appearance", "held", "nodes"];
  const checked = new WeakMap();
  const decodePose = pose => {
    if (!plain(pose, poseFields) || !dense(pose.profile, 10) || !Array.isArray(pose.nodes)
      || pose.nodes.length > BL.clankerPose.MAX_NODES || !dense(pose.nodes, pose.nodes.length)
      || !pose.nodes.every(row => dense(row, BL.clankerPose.WIDTH))) fail();
    const decoded = { ...pose, profile: pose.profile.map(decode), nodes: pose.nodes.map(row => row.map(decode)) };
    return BL.clankerPose.immutable(decoded);
  };
  const encodePose = pose => ({ ...pose, profile: pose.profile.map(encode), nodes: pose.nodes.map(row => row.map(encode)) });
  const validValue = (key, value) => {
    if (FLAGS.has(key)) return typeof value === "boolean";
    if (ENUMS[key]) return ENUMS[key].includes(value);
    if (key === "route" || key === "pace") return value === null;
    if (key === "labBench") return value === null; // identity is separate, never the world object
    if ((key === "walkPhase" || key === "climbPose") && value === null || key === "walkPhase" && value === "unset") return true;
    return scalar(value) || value === "-0";
  };
  const validate = (snapshot, knownPose) => {
    if (checked.has(snapshot)) return checked.get(snapshot);
    if (!plain(snapshot, TOP) || snapshot.v !== VERSION || !dense(snapshot.values, FIELDS.length)
      || !snapshot.values.every((value, i) => validValue(FIELDS[i], value))
      || !dense(snapshot.hands, 6) || !snapshot.hands.every(value => scalar(value) || value === "-0")
      || !scalar(decode(snapshot.grip)) || decode(snapshot.grip) < 0 || decode(snapshot.grip) > 100
      || !(snapshot.bench === null || id(snapshot.bench))) fail();
    const pose = knownPose || decodePose(snapshot.pose);
    const at = key => snapshot.values[FIELDS.indexOf(key)];
    if (at("labPreviewItem") || at("form") !== snapshot.pose.appearance[0]
      || ["lab", "coatSplit", "suit", "suitSplit", "seatLegs"].some((key, i) => +at(key) !== snapshot.pose.appearance[i + 1])) fail();
    if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > MAX_BYTES) fail();
    return pose;
  };
  const immutable = (snapshot, knownPose) => {
    const pose = validate(snapshot, knownPose);
    for (const row of snapshot.pose.nodes) Object.freeze(row);
    Object.freeze(snapshot.pose.nodes); Object.freeze(snapshot.pose.profile); Object.freeze(snapshot.pose.appearance);
    Object.freeze(snapshot.pose); Object.freeze(snapshot.values); Object.freeze(snapshot.hands); Object.freeze(snapshot);
    checked.set(snapshot, pose); return snapshot;
  };
  const capture = (state, pose, hands, grip, bench = null) => {
    if (!plain(state, FIELDS) || (state.labBench === null ? bench !== null : !bench || !id(bench.id) || bench.value !== state.labBench)) fail();
    BL.clankerPose.immutable(pose);
    const snapshot = { v: VERSION, pose: encodePose(pose),
      values: FIELDS.map(key => key === "labBench" ? null : key === "walkPhase" && state[key] === undefined ? "unset" : encode(state[key])),
      hands: Array.from(hands, encode), grip: encode(grip), bench: bench?.id ?? null };
    return immutable(snapshot, pose);
  };
  const restore = (snapshot, bench = null) => {
    const pose = validate(snapshot);
    if (snapshot.bench === null ? bench !== null : !bench || bench.id !== snapshot.bench || !bench.value) fail();
    const state = {};
    for (let i = 0; i < FIELDS.length; i++) {
      const key = FIELDS[i], value = snapshot.values[i];
      state[key] = key === "labBench" ? bench?.value ?? null
        : key === "walkPhase" && value === "unset" ? undefined
        : value === null && (key === "walkPhase" || key === "climbPose") ? NaN : decode(value);
    }
    return { state, pose, hands: snapshot.hands.map(decode), grip: decode(snapshot.grip) };
  };
  const rosterSize = value => { if (new TextEncoder().encode(JSON.stringify(value)).byteLength > ROSTER_BYTES) fail(); };
  // Roster v2 has a fixed schema, not an arbitrary nested JSON tree. Sparse
  // scalar records omit only explicit defaults; IEEE values are never rounded.
  // A row expands to exactly FIELDS.length + seven scalars. No user dictionary,
  // repeated run, recursive data or previous checkpoint can amplify that work.
  const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const SYMBOLS = [null, false, true, "-0", "unset", 0, 1, -1,
    ...new Set(Object.values(ENUMS).flat().filter(v => typeof v === "string"))];
  const DEFAULTS = [...FIELDS.map(key => FLAGS.has(key) ? false : ENUMS[key] ? ENUMS[key][0]
    : ["route", "pace", "labBench", "walkPhase", "climbPose"].includes(key) ? null : 0), ...Array(7).fill(0)];
  const ROW_BYTES = 1 + DEFAULTS.length * 10, CHUNK_BYTES = 3072;
  const base64 = bytes => {
    let s = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
      s += BASE64[a >>> 2] + BASE64[(a & 3) << 4 | b >>> 4]
        + (i + 1 < bytes.length ? BASE64[(b & 15) << 2 | c >>> 6] : "=")
        + (i + 2 < bytes.length ? BASE64[c & 63] : "=");
    }
    return s;
  };
  const unbase64 = (s, max) => {
    if (typeof s !== "string" || !s.length || s.length % 4 || s.length > Math.ceil(max / 3) * 4
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)) fail();
    const length = s.length / 4 * 3 - (s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0);
    if (length > max) fail();
    const bytes = new Uint8Array(length); let at = 0;
    for (let i = 0; i < s.length; i += 4) {
      const a = BASE64.indexOf(s[i]), b = BASE64.indexOf(s[i + 1]);
      const c = s[i + 2] === "=" ? 0 : BASE64.indexOf(s[i + 2]), d = s[i + 3] === "=" ? 0 : BASE64.indexOf(s[i + 3]);
      bytes[at++] = a << 2 | b >>> 4;
      if (at < length) bytes[at++] = b << 4 | c >>> 2;
      if (at < length) bytes[at++] = c << 6 | d;
      if (i + 4 === s.length && (s[i + 2] === "=" ? b & 15 : s[i + 3] === "=" ? c & 3 : false)) fail();
    }
    return bytes;
  };
  const packScalars = snapshot => {
    const values = [...snapshot.values, ...snapshot.hands, snapshot.grip], bytes = new Uint8Array(ROW_BYTES), view = new DataView(bytes.buffer);
    let at = 1, count = 0;
    for (let i = 0; i < values.length; i++) {
      const value = encode(values[i]); if (Object.is(value, DEFAULTS[i])) continue;
      bytes[at++] = i; count++;
      const symbol = SYMBOLS.findIndex(v => Object.is(v, value));
      if (symbol >= 0) bytes[at++] = symbol;
      else if (Math.fround(value) === value) { bytes[at++] = 254; view.setFloat32(at, value, true); at += 4; }
      else { bytes[at++] = 255; view.setFloat64(at, value, true); at += 8; }
    }
    bytes[0] = count; return base64(bytes.subarray(0, at));
  };
  const unpackScalars = string => {
    const bytes = unbase64(string, ROW_BYTES), view = new DataView(bytes.buffer), values = DEFAULTS.slice();
    let at = 1, previous = -1;
    if (bytes[0] > values.length) fail();
    for (let i = 0; i < bytes[0]; i++) {
      if (at + 2 > bytes.length) fail();
      const index = bytes[at++], tag = bytes[at++];
      if (index <= previous || index >= values.length) fail(); previous = index;
      let value;
      if (tag < SYMBOLS.length) value = SYMBOLS[tag];
      else {
        const width = tag === 254 ? 4 : tag === 255 ? 8 : 0;
        if (!width || at + width > bytes.length) fail();
        value = width === 4 ? view.getFloat32(at, true) : view.getFloat64(at, true); at += width;
        if (!scalar(value) || Object.is(value, -0) || SYMBOLS.some(v => Object.is(v, value)) || width === 8 && Math.fround(value) === value) fail();
      }
      if (Object.is(value, DEFAULTS[index])) fail(); values[index] = value;
    }
    if (at !== bytes.length || !values.slice(0, FIELDS.length).every((v, i) => validValue(FIELDS[i], v))
      || !values.slice(FIELDS.length).every(v => scalar(v) || v === "-0")) fail();
    return values;
  };
  // Pack poses together so field repetition does not consume the whole host
  // checkpoint. Hex chunks stay within the existing JSON packer's string bound;
  // animation values remain ordered data, not executable schemas or references.
  const packRoster = (world, records, compact = false) => {
    if (typeof compact !== "boolean") fail();
    if (!id(world) || !Array.isArray(records) || records.length > 128 || !dense(records, records.length)) fail();
    for (const record of records) if (!plain(record, ["index", "snapshot"]) || !Number.isInteger(record.index) || record.index < 0 || record.index >= 128) fail();
    const sorted = records.slice().sort((a, b) => a.index - b.index), actors = [], poses = [];
    for (let i = 0; i < sorted.length; i++) {
      const record = sorted[i];
      if (i && record.index === sorted[i - 1].index) fail();
      const pose = validate(record.snapshot), s = record.snapshot;
      if (pose.world !== world) fail();
      poses.push({ index: record.index, pose });
      actors.push(compact ? [record.index, packScalars(s), s.bench] : [record.index, s.values.slice(), s.hands.slice(), s.grip, s.bench]);
    }
    const packet = BL.npcPosePacket.pack(world, new Uint32Array([2, 0, 0, 0]).buffer, poses), bytes = new Uint8Array(packet), chunks = [];
    for (let at = 0; at < bytes.length; at += compact ? CHUNK_BYTES : 2048) {
      if (compact) { chunks.push(base64(bytes.subarray(at, at + CHUNK_BYTES))); continue; }
      let chunk = ""; for (let j = at; j < Math.min(bytes.length, at + 2048); j++) chunk += bytes[j].toString(16).padStart(2, "0");
      chunks.push(chunk);
    }
    const result = { v: compact ? 2 : VERSION, world, poses: chunks, actors }; rosterSize(result); return result;
  };
  const unpackRoster = packed => {
    if (!plain(packed, ["v", "world", "poses", "actors"]) || packed.v !== VERSION && packed.v !== 2 || !id(packed.world)
      || !Array.isArray(packed.poses) || !packed.poses.length || packed.poses.length > 16 || !dense(packed.poses, packed.poses.length)
      || !Array.isArray(packed.actors) || packed.actors.length > 128 || !dense(packed.actors, packed.actors.length)) fail();
    if (packed.v === 2) {
      // Check wire size before parsing any row or allocating the pose buffer.
      for (let i = 0; i < packed.actors.length; i++) {
        const row = packed.actors[i];
        if (!dense(row, 3) || !Number.isInteger(row[0]) || row[0] < 0 || row[0] >= 128 || i && row[0] <= packed.actors[i - 1][0]
          || typeof row[1] !== "string" || row[1].length > Math.ceil(ROW_BYTES / 3) * 4 || !(row[2] === null || id(row[2]))) fail();
      }
      for (const chunk of packed.poses) if (typeof chunk !== "string" || chunk.length > 4096) fail();
      rosterSize(packed);
      const chunks = packed.poses.map(s => unbase64(s, CHUNK_BYTES)), length = chunks.reduce((n, b) => n + b.length, 0);
      if (length > BL.npcPosePacket.MAX || chunks.some((b, i) => i < chunks.length - 1 && b.length !== CHUNK_BYTES)) fail();
      const bytes = new Uint8Array(length); let at = 0;
      for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
      const poses = BL.npcPosePacket.unpack(bytes.buffer, true), header = new Uint32Array(poses.ooga);
      if (poses.world !== packed.world || poses.clankers.length !== packed.actors.length
        || header.length !== 4 || header[0] !== 2 || header[1] || header[2] || header[3]) fail();
      return packed.actors.map((row, i) => {
        if (row[0] !== poses.clankers[i].index) fail();
        const values = unpackScalars(row[1]), snapshot = { v: VERSION, pose: encodePose(poses.clankers[i].pose),
          values: values.slice(0, FIELDS.length), hands: values.slice(FIELDS.length, -1), grip: values.at(-1), bench: row[2] };
        return { index: row[0], snapshot: immutable(snapshot, poses.clankers[i].pose) };
      });
    }
    let length = 0;
    for (const chunk of packed.poses) {
      if (typeof chunk !== "string" || !chunk.length || chunk.length > 4096 || chunk.length % 2 || !/^[a-f0-9]+$/.test(chunk)) fail();
      length += chunk.length / 2;
    }
    if (length > BL.npcPosePacket.MAX) fail();
    for (let i = 0; i < packed.actors.length; i++) {
      const row = packed.actors[i];
      if (!dense(row, 5) || !Number.isInteger(row[0]) || row[0] < 0 || row[0] >= 128 || i && row[0] <= packed.actors[i - 1][0]
        || !dense(row[1], FIELDS.length) || !row[1].every((v, k) => validValue(FIELDS[k], v))
        || !dense(row[2], 6) || !row[2].every(v => scalar(v) || v === "-0") || !scalar(decode(row[3]))
        || !(row[4] === null || id(row[4]))) fail();
    }
    rosterSize(packed);
    const bytes = new Uint8Array(length); let at = 0;
    for (const chunk of packed.poses) for (let i = 0; i < chunk.length; i += 2) bytes[at++] = parseInt(chunk.slice(i, i + 2), 16);
    const poses = BL.npcPosePacket.unpack(bytes.buffer, true), header = new Uint32Array(poses.ooga);
    if (poses.world !== packed.world || poses.clankers.length !== packed.actors.length
      || header.length !== 4 || header[0] !== 2 || header[1] || header[2] || header[3]) fail();
    return packed.actors.map((row, i) => {
      if (poses.clankers[i].index !== row[0]) fail();
      const snapshot = { v: VERSION, pose: encodePose(poses.clankers[i].pose), values: row[1].slice(), hands: row[2].slice(), grip: row[3], bench: row[4] };
      return { index: row[0], snapshot: immutable(snapshot, poses.clankers[i].pose) };
    });
  };
  BL.clankerState = { VERSION, MAX_BYTES, ROSTER_BYTES, capture, restore, packRoster, unpackRoster,
    validate(snapshot) { validate(snapshot); return true; } };
})();
