import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../src/js/body-motion.js';
import { parseClientMessage, MESSAGE_MAX } from '../src/protocol.js';
const motion = globalThis.BL.bodyMotion;

test('Ooga compact motion preserves exact position and equipment without sending identity or exceeding the message cap', () => {
  const codec = globalThis.BL.oogaMotion, identity = { world: 'world-1', profile: 'standing-1', name: 'owner' };
  const checkpoint = globalThis.BL.oogaBody.codec(identity).encode(
    { x: -0, y: 123.45678901234567, z: -999999.9999999999, yaw: 6.283185307179586 },
    { weapon: 'gun', mode: 'combat', primaryOwned: true, secondaryOwned: true, selectedSlot: 2,
      unlimited: false, jetpack: true, jetpackOwned: true });
  const data = codec.pack(checkpoint), message = { t: codec.TYPE, request: 'a'.repeat(32), sequence: Number.MAX_SAFE_INTEGER, data };
  assert.equal(data.length, 48); assert.equal(JSON.stringify(message).length, 157); assert.equal(MESSAGE_MAX, 256);
  assert.deepEqual(parseClientMessage(JSON.stringify(message)), message);
  assert.deepEqual(codec.unpack(data, checkpoint), checkpoint);
  assert.equal(codec.unpack(data, { ...checkpoint, name: 'server-owner' }).name, 'server-owner');
  for (const bad of [{ ...message, name: 'injected' }, { ...message, data: data.slice(0, 45) + 'B==' },
    { ...message, t: motion.TYPE }, { ...message, sequence: 0 }]) assert.equal(parseClientMessage(JSON.stringify(bad)), null);
  for (const change of [b => b.writeDoubleLE(Infinity, 0), b => b[32] = 3, b => b[33] |= 128,
    b => b[33] &= ~2]) {
    const bytes = Buffer.from(data, 'base64'); change(bytes); assert.throws(() => codec.unpack(bytes.toString('base64'), checkpoint));
  }
});

test('compact motion preserves binary64 and signed zero within the unchanged ordinary message cap', () => {
  const values = ['trusted-owner', -0, 2345.2345678901234, -3456.3456789012345,
    1.2345678901234567, -4567.456789012345, 5678.567890123456, -6789.678901234567, 2, 30];
  const data = motion.pack(values), m = { t: motion.TYPE, request: 'a'.repeat(32), sequence: Number.MAX_SAFE_INTEGER, data };
  assert.equal(data.length, 80); assert.equal(JSON.stringify(m).length, 184); assert.equal(MESSAGE_MAX, 256);
  assert.deepEqual(parseClientMessage(JSON.stringify(m)), m);
  const result = motion.unpack(data, values[0]);
  for (let i = 0; i < values.length; i++) assert.ok(Object.is(result[i] === '-0' ? -0 : result[i], values[i]));
  assert.equal(motion.pack(result), data);
  assert.equal(motion.unpack(data, 'other-trusted-owner')[0], 'other-trusted-owner', 'wire cannot supply identity');
});

test('compact motion refuses identity injection, noncanonical encodings and nonfinite body data', () => {
  const values = ['trusted-owner', 0, 2, 3, 1, 0, 0, 0, 0, 1];
  const m = { t: motion.TYPE, request: 'a'.repeat(32), sequence: 1, data: motion.pack(values) };
  for (const bad of [{ ...m, accountId: 9 }, { ...m, world: 'other' }, { ...m, sequence: 0 },
    { ...m, request: 'bad' }, { ...m, data: m.data.slice(0, 77) + 'B==' }])
    assert.equal(parseClientMessage(JSON.stringify(bad)), null);
  const bytes = Buffer.from(m.data, 'base64'); bytes.writeDoubleLE(Infinity, 0);
  assert.throws(() => motion.unpack(bytes.toString('base64'), values[0]), /compact body/);
  assert.throws(() => motion.pack([...values.slice(0, 8), 2, 1]), /compact body/);
  assert.equal(parseClientMessage(JSON.stringify({ ...m, data: 'a'.repeat(257) })), false);
});
