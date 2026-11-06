// Finite compatibility/size audit. Actual source validators and Room parser,
// authored meadow/prop bodies only; no Hub, browser, sockets or activation.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MESSAGE_MAX, parseClientMessage } from '../src/protocol.js';
import { fixture } from '../test/fixtures/clanker-body-world-fixture.mjs';

const rows = [], world = fixture(), request = 'a'.repeat(32);
const fields = object => Object.fromEntries(Object.entries(object).map(([key, value]) =>
  [key, Buffer.byteLength(JSON.stringify({ [key]: value })) - 2]));
try {
  for (const profile of ['static-body-3', 'terrain-body-3']) {
    // The authored standing point is the prop's y=2 top. Static profiles have
    // no prop-support query, so their authored plane must match that surface.
    const body = world.make({ profile, ...(profile === 'static-body-3' ? { groundAt: () => 2 } : {}) });
    world.seed(body); assert.equal(body.sim.activate(), true);
    const bridge = body.sim.bodyCheckpoint;
    const codec = world.B.clankerBodyTransfer.create({ world: 'movement-wire-fixture',
      baseline: bridge.baseline(), owner: body.sim.list[0].owner.id, rules: bridge.records });
    const physical = bridge.liveBodyState();
    for (const [label, values] of [
      ['standing', physical],
      ['precision-boundary', [physical[0], 1234.1234567890123, 2345.2345678901234, -3456.3456789012345,
        1.2345678901234567, -4567.456789012345, 5678.567890123456, -6789.678901234567, 2, 30]],
      ['signed-zero', [physical[0], -0, 2, -0, -0, -0, 0, -0, 0, 1]],
    ]) {
      assert.equal(bridge.records.validate(values), true);
      const checkpoint = codec.encode(values);
      const envelope = { t: 'body-motion', request, sequence: Number.MAX_SAFE_INTEGER, checkpoint };
      const text = JSON.stringify(envelope), parserResult = parseClientMessage(text);
      // Comparison only: seven exact binary64 values and two bounded byte slots.
      // A future protocol must derive owner/world/profile from the authenticated
      // retained handoff; removing those fields without that binding is unsafe.
      const binary = Buffer.alloc(58);
      for (let i = 1; i <= 7; i++) binary.writeDoubleLE(values[i], (i - 1) * 8);
      binary[56] = values[8]; binary[57] = values[9];
      const base64 = binary.toString('base64'), decoded = Buffer.from(base64, 'base64');
      const restored = [values[0], ...Array.from({ length: 7 }, (_, i) => decoded.readDoubleLE(i * 8)), decoded[56], decoded[57]];
      // Source arrays originate in the controller VM. Compare exact scalar
      // values, including signed zero, rather than cross-realm prototypes.
      assert.equal(restored.length, values.length);
      for (let i = 0; i < values.length; i++) assert.ok(Object.is(restored[i], values[i]));
      assert.equal(bridge.records.validate(restored), true);
      const candidate = JSON.stringify({ t: 'body-motion-1', request, sequence: Number.MAX_SAFE_INTEGER, data: base64 });
      assert.ok(candidate.length <= MESSAGE_MAX);
      assert.equal(parseClientMessage(candidate), null, 'proposal is not an enabled protocol');
      if (text.length > MESSAGE_MAX) assert.equal(parserResult, false, 'ordinary size guard closes this frame');
      rows.push({ profile, case: label, envelopeCharacters: text.length, envelopeBytes: Buffer.byteLength(text),
        envelopeFields: fields(envelope), envelopePunctuationBytes: Object.keys(envelope).length + 1,
        checkpointFields: fields(checkpoint), checkpointBytes: Buffer.byteLength(JSON.stringify(checkpoint)),
        currentParser: parserResult === false ? 'close' : parserResult === null ? 'ignore' : 'accept',
        proposalBinaryBytes: binary.length, proposalBase64Characters: base64.length,
        proposalEnvelopeCharacters: candidate.length, proposalEnvelopeBytes: Buffer.byteLength(candidate),
        proposalHeadroom: MESSAGE_MAX - candidate.length, exactNumericRoundTrip: true });
    }
    body.sim.dispose();
  }
} finally { world.dispose(); }
const paths = ['../src/protocol.js', '../../src/js/clanker-body-transfer.js', '../../src/js/clankers.js', './body-movement-wire.mjs'];
console.log(JSON.stringify({ messageCharacterLimit: MESSAGE_MAX, rows,
  sourceHashes: Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex')])),
  limitations: [
    'No protocol, parser, capability, rate policy or activation change; candidate is an offline encoding comparison only.',
    'Standing uses a real source controller; precision-boundary and signed-zero are source-admitted authored records, not observed player trajectories.',
    'Maximum sequence width included; candidate length is independent of numeric magnitude and owner/world/profile lengths because these require retained server binding.',
    'Candidate applies only to the current ten-slot Clanker record. Ooga state and future body versions need separate contracts.',
    'No CPU, browser, transport, provider storage or billing benchmark. This does not validate full-world collision or movement acceptance.',
  ] }, null, 2));
