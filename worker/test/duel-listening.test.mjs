import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const context = { window: {} };
runInNewContext(readFileSync(new URL("../../src/js/duel-listening.js", import.meta.url), "utf8"), context);
const create = context.window.BL.duelListening.create;

test("duel listening exempts only the listener's pair and removes each temporary mute on end or loss", () => {
  const d = create();
  assert.equal(d.muted(2, 1), false);
  d.apply({ op: "list", duels: [{ id: 10, a: 1, b: 2 }, { id: 11, a: 3, b: 4 }] });
  assert.equal(d.muted(1, 1), false);
  assert.equal(d.muted(2, 1), false);
  assert.equal(d.muted(3, 1), true);
  assert.equal(d.muted(4, 1), true);
  assert.equal(d.muted(1, 9), true);
  d.apply({ op: "end", id: 11 });
  assert.equal(d.muted(3, 9), false);
  assert.equal(d.muted(4, 9), false);
  assert.equal(d.muted(1, 9), true);
  d.apply({ op: "lost" });
  assert.equal(d.muted(1, 9), false);
  d.apply({ op: "start", id: 12, a: 3, b: 4 });
  d.apply({ op: "end", id: 11 });
  assert.equal(d.muted(3, 9), true, "an old end cannot remove a newer duel");
  d.apply({ op: "list", duels: [] });
  assert.equal(d.muted(3, 9), false, "reconnect snapshot replaces the old list");
});

test("duel listening refuses malformed, overlapping and oversized snapshots atomically", () => {
  const d = create();
  d.apply({ op: "start", id: 1, a: 2, b: 3 });
  for (const duels of [[{ id: 2, a: 4, b: 4 }], [{ id: 2, a: 4, b: 5 }, { id: 3, a: 5, b: 6 }],
    [{ id: 2, a: "4", b: 5 }], Array.from({ length: 129 }, (_, i) => ({ id: i + 10, a: i * 2 + 10, b: i * 2 + 11 }))]) {
    assert.equal(d.apply({ op: "list", duels }), false);
    assert.equal(d.muted(2, 9), true);
    assert.equal(d.muted(4, 9), false);
  }
  assert.equal(d.apply({ op: "start", id: 2, a: 3, b: 4 }), false);
  assert.equal(d.apply({ op: "hp", id: 1 }), false);
});
