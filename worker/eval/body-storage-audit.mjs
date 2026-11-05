// Finite Node size/codec-cost comparison. No account or runtime deployment.
import assert from "node:assert/strict";
import { gzipSync, gunzipSync, brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { SessionRegistry } from "../src/host-sessions.js";
import { HOST, SESSION_PROTOCOL } from "../src/virtual-host.js";
import { createCheckpointPack } from "../src/checkpoint-pack.js";
import { createClankerBodyCheckpoint } from "../src/clanker-roaming.js";
import { BODY_STORAGE } from "../src/host-body-storage.js";
import { clankerController } from "../test/fixtures/clanker-controller-fixture.mjs";
const world = "body-capacity-fixture-1", bytes = x => Buffer.byteLength(JSON.stringify(x));
const pack = createCheckpointPack(16384, { intern: true }), componentPack = createCheckpointPack(8192, { intern: true });
const equipment = { weapon: "gun", mode: "combat", magazine: 17, spareAmmo: [4, 22], primaryOwned: true,
  secondaryOwned: true, selectedSlot: 2, unlimited: false, jetpack: true, jetpackOwned: true, fuel: .37 };
const claim = { protocol: SESSION_PROTOCOL, world, accountId: 123, bodyId: "body-0", zone: "outside",
  body: { kind: "clanker", motion: { x: -4, y: 4, z: -4, yaw: .7, vx: 1, vy: -2, vz: 1, grounded: false }, equipment } };
const registry = new SessionRegistry({ protocol: SESSION_PROTOCOL, world, adapter: { stepPassive: m => m } });
const ref = registry.connect(claim, 100000).session, live = registry.checkpoint().sessions[0];
registry.disconnect(ref, 100000); const grace = registry.checkpoint().sessions[0];
registry.advance(160000); const pending = registry.checkpoint().pending[0];
// Keep representative wire measurements repeatable; never use this fixture token
// for authentication. The live registry above used its own generated token.
live.token = grace.token = "7a941e0df2b3c5806e19ad4270fbc635";
const worst = entry => {
  const v = structuredClone(entry), b = v.body || v;
  v.accountId = v.generation = Number.MAX_SAFE_INTEGER; v.bodyId = "b".repeat(64); v.zone = "z".repeat(64);
  for (const k of ["lastSeenAt", "deadline", "stepAt", "at"]) if (Object.hasOwn(v, k)) v[k] = Number.MAX_SAFE_INTEGER;
  if (v.type === "depart") { v.id = `depart:${Number.MAX_SAFE_INTEGER}`; v.handback = { npc: "n".repeat(64) }; }
  else { v.token = "f".repeat(32); v.occupancy = { kind: "hammock", id: "s".repeat(64) }; }
  // Conservative JSON byte upper bound, not a restorable registry record.
  for (const k of ["x", "y", "z", "yaw", "vx", "vy", "vz"]) b.motion[k] = "9".repeat(25);
  b.equipment.fuel = "9".repeat(25); b.equipment.weapon = "primary"; b.equipment.spareAmmo = [30, 30];
  for (const k of ["primaryOwned", "secondaryOwned", "unlimited", "jetpack", "jetpackOwned"]) b.equipment[k] = false;
  return v;
};
const compressions = {
  gzip: { encode: b => gzipSync(b, { level: 6 }), decode: b => gunzipSync(b) },
  brotli4: { encode: b => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }), decode: b => brotliDecompressSync(b) },
};
const rows = [], numeric = { compactConstants: 0, int16: 0, exactFloat32: 0, requiresFloat64: 0 };
const countNumbers = v => {
  if (typeof v === "number") {
    if ([0, 1, -1].includes(v)) numeric.compactConstants++;
    else if (Number.isInteger(v) && Math.abs(v) <= 65535) numeric.int16++;
    else if (Math.fround(v) === v) numeric.exactFloat32++;
    else numeric.requiresFloat64++;
  } else if (v && typeof v === "object") for (const item of Object.values(v)) countNumbers(item);
};
const f = clankerController({ checkpointRandom: true, checkpointProfile: "body-1", start: false });
const codec = createClankerBodyCheckpoint(f.sim, world, f.B.clankerState);
try {
  f.start(); f.sim.possess(f.sim.list[0]); codec.neutralize(); for (let i = 0; i < 4; i++) f.step();
  f.sim.control({ x: .6, z: .8, heading: .7, run: true, jumpHeld: true, jumpPressed: true }); f.step(); codec.neutralize();
  for (let i = 0; i < 48; i++) {
    const component = codec.capture(), expanded = componentPack.unpack(component);
    if (!i) countNumbers(expanded);
    const complete = { ...grace, continuation: component }, encoded = Buffer.from(JSON.stringify(complete));
    const start = performance.now(), packed = pack.pack(complete), packedMs = performance.now() - start;
    const decodeAt = performance.now(); assert.deepEqual(pack.unpack(packed), complete); const unpackMs = performance.now() - decodeAt;
    const compression = {};
    for (const [name, c] of Object.entries(compressions)) {
      const encodeCpu = process.cpuUsage(), at = performance.now(), compressed = c.encode(encoded), compressMs = performance.now() - at;
      const encodeUsed = process.cpuUsage(encodeCpu), decodeCpu = process.cpuUsage();
      const decodeAt = performance.now(), restored = c.decode(compressed); const decompressMs = performance.now() - decodeAt;
      const decodeUsed = process.cpuUsage(decodeCpu);
      assert.deepEqual(restored, encoded);
      compression[name] = { binaryBytes: compressed.length, jsonBase64Bytes: bytes({ v: 1, codec: name, data: compressed.toString("base64") }), compressMs, decompressMs,
        encodeCpuUs: encodeUsed.user + encodeUsed.system, decodeCpuUs: decodeUsed.user + decodeUsed.system };
    }
    rows.push({ frame: i, componentBytes: bytes(component), expandedComponentBytes: bytes(expanded),
      encodedComponentParts: Object.fromEntries(Object.entries(component).map(([k, v]) => [k, bytes(v)])),
      completeGraceBytes: encoded.length, completePendingBytes: bytes({ ...pending, continuation: component }),
      completePackedBytes: bytes(packed), packedMs, unpackMs, compression });
    f.step(); codec.neutralize();
  }
} finally { f.dispose(); }
const stats = values => { const v = values.slice().sort((a, b) => a - b); return { min: v[0], p50: v[Math.floor(v.length * .5)], p95: v[Math.floor(v.length * .95)], max: v.at(-1) }; };
console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, sourceHashes: f.hashes,
  internalBounds: { root: HOST.checkpointBytes, simulation: 65536, metadata: HOST.metadataBytes, slot: HOST.sessionSlotBytes, slotNodes: HOST.sessionSlotNodes },
  envelopes: Object.fromEntries(Object.entries({ live, grace, pending }).map(([k, v]) => [k, { bytes: bytes(v), conservativeUpperBytes: bytes(worst(v)), fields: Object.keys(v) }])),
  currentMaximalBodyEnvelopeBytes: Math.max(bytes(worst(grace)), bytes(worst(pending))) + BODY_STORAGE.componentBytes + 16,
  numericWidthsFirstExpandedSample: numeric,
  slotCapacityAt64KiBWorld: [1024, 2048, 3072, 4096, 9216].map(slot => ({ slotBytes: slot, admitted: Math.floor((HOST.checkpointBytes - 65536 - HOST.metadataBytes) / slot) })),
  separateStorageBound: { root: BODY_STORAGE.rootBytes, row: BODY_STORAGE.rowBytes, rowsAt64KiBWorld: 30,
    aggregateAt30: BODY_STORAGE.rootBytes + 30 * BODY_STORAGE.rowBytes, aggregateAt32: BODY_STORAGE.rootBytes + 32 * BODY_STORAGE.rowBytes },
  measurements: Object.fromEntries(["componentBytes", "expandedComponentBytes", "completeGraceBytes", "completePendingBytes", "completePackedBytes", "packedMs", "unpackMs"].map(k => [k, stats(rows.map(r => r[k]))])),
  compression: Object.fromEntries(Object.keys(compressions).map(k => [k, Object.fromEntries(["binaryBytes", "jsonBase64Bytes", "compressMs", "decompressMs", "encodeCpuUs", "decodeCpuUs"].map(field => [field, stats(rows.map(r => r.compression[k][field]))]))])),
  limitations: ["48 successive restricted Clanker states, one synthetic registry envelope; Ooga inventory here is metadata only, not an Ooga restoration test.",
    "Worst envelope overestimates JSON numeric length; component 8192-byte cap is a storage refusal bound, not proof all future body dynamics fit.",
    "Compression numbers include headers and show both binary and JSON/base64 envelopes; no assumption that arbitrary future state compresses similarly.",
    "Node zlib and wall-time measurements are not workerd CPU, SQLite billing, sustained 4Hz cost, browser latency or maximum-memory measurements.",
    "No schema migration, live body command, paid API, deployment or activation."], rows }, null, 2));
