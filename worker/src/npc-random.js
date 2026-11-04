// The existing Clanker RNG, with a bounded, versioned continuation word. This
// does not replace the crew's crypto choices or provide a complete AI checkpoint.
import "../../src/js/math.js";

const word = n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
export function createNpcRandom(seed) {
  if (!word(seed)) throw new Error("invalid NPC random seed");
  const next = globalThis.BL.math.mulberry32(seed, true);
  return { next, capture: () => ({ v: 1, word: next.capture() }) };
}

export function restoreNpcRandom(saved) {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)
    || Object.keys(saved).length !== 2 || saved.v !== 1 || !word(saved.word)
    || !Object.hasOwn(saved, "v") || !Object.hasOwn(saved, "word")) {
    throw new Error("invalid NPC random checkpoint");
  }
  return createNpcRandom(saved.word);
}
