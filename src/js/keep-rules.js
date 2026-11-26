// The Byzantine Keep's quest rules: its puzzles and the passages they open, as data, and one small state machine over
// them. Pure and loadable in Node and the Worker (worker/src/games/keep.js imports it unchanged): no DOM, no clock, no
// Math.random. The land's own Durable Object runs these for everyone signed in, so a page cannot skip a puzzle; a page
// alone (signed out, or with no backend) runs the same rules itself.
//
// A puzzle is one row of `PUZZLES`: its `id`, the `chapter` it belongs to, its `type` and what that type needs, and
// the passage it `opens` once solved. Both rooms of a clue chain read the one row, so changing an answer cannot leave
// a clue pointing at the old one. Types so far:
//   rotate   `parts` things, each turned a step at a time through `steps` facings, solved when they stand at `goal`
// A solved puzzle keeps its answer: its parts no longer turn, and its passage stays open for as long as the land's
// state is kept.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};

  // A statue's facing counts quarter turns from +z (toward the forest), turning toward +x. The two knights flank the
  // way to the moat at x -5.5 and x 5.5: both start facing whoever walks in, and face each other at 1 and 3.
  const PUZZLES = Object.freeze([
    Object.freeze({ id: "statues", chapter: 0, type: "rotate", parts: 2, steps: 4, start: Object.freeze([0, 0]), goal: Object.freeze([1, 3]), opens: "drawbridge" })
  ]);
  const PASSAGES = Object.freeze(["drawbridge"]);
  const BY_ID = new Map(PUZZLES.map((p) => [p.id, p]));
  const has = (id) => BY_ID.has(id);
  const MAX_PARTS = PUZZLES.reduce((n, p) => Math.max(n, p.parts), 0);

  const create = () => {
    // Each puzzle's parts as they stand, and whether it is solved.
    const parts = new Map(PUZZLES.map((p) => [p.id, p.start.slice()])), solved = new Set();
    const settled = (p) => parts.get(p.id).every((v, i) => v === p.goal[i]);
    /** Acts on part `part` of puzzle `id`; true when anything changed. */
    const act = (id, part) => {
      const p = BY_ID.get(id);
      if (!p || solved.has(id) || !Number.isInteger(part) || part < 0 || part >= p.parts) return false;
      const at = parts.get(id);
      if (p.type === "rotate") at[part] = (at[part] + 1) % p.steps;
      if (settled(p)) solved.add(id);
      return true;
    };
    const snapshot = () => ({ v: 1, parts: Object.fromEntries([...parts].map(([id, at]) => [id, at.slice()])), solved: [...solved] });
    /** Takes a snapshot whole, or refuses it and changes nothing. */
    const load = (snap) => {
      if (!snap || typeof snap !== "object" || snap.v !== 1 || !snap.parts || typeof snap.parts !== "object" || !Array.isArray(snap.solved)) return false;
      const next = new Map();
      for (const p of PUZZLES) {
        const at = Object.hasOwn(snap.parts, p.id) ? snap.parts[p.id] : null;
        if (!Array.isArray(at) || at.length !== p.parts || !at.every((v) => Number.isInteger(v) && v >= 0 && v < p.steps)) return false;
        next.set(p.id, at.slice());
      }
      if (!snap.solved.every((id) => typeof id === "string" && BY_ID.has(id))) return false;
      for (const [id, at] of next) parts.set(id, at);
      solved.clear();
      // A puzzle is solved only where its parts stand at its goal, whatever the snapshot claims.
      for (const id of snap.solved) if (settled(BY_ID.get(id))) solved.add(id);
      return true;
    };
    const reset = () => {
      for (const p of PUZZLES) parts.set(p.id, p.start.slice());
      solved.clear();
    };
    return {
      act, snapshot, load, reset,
      partsOf: (id) => parts.get(id),
      solved: (id) => solved.has(id),
      /** Whether passage `name` stands open. */
      open: (name) => PUZZLES.some((p) => p.opens === name && solved.has(p.id)),
      /** Nothing has been touched: there is nothing worth keeping. */
      pristine: () => solved.size === 0 && PUZZLES.every((p) => parts.get(p.id).every((v, i) => v === p.start[i]))
    };
  };

  BL.keepRules = { PUZZLES, PASSAGES, MAX_PARTS, has, create };
})();
