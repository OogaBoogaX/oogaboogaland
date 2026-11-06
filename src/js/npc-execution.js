// Shared deterministic execution inputs for the existing Ooga controller.
// This captures random continuation only, not actor/world state or ownership.
(() => {
  'use strict';
  const scope = typeof window === 'undefined' ? globalThis : window;
  const BL = scope.BL = scope.BL || {}, MAX_STREAMS = 129;
  const word = n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  const fail = () => { throw Error('invalid NPC execution checkpoint'); };
  const create = ({ seed, planSteps = 64 }) => {
    if (!word(seed) || !Number.isInteger(planSteps) || planSteps < 1 || planSteps > 256) fail();
    const streams = new Map();
    const stream = (name, initial) => {
      if (typeof name !== 'string' || !/^[A-Za-z0-9_.:-]{1,80}$/.test(name) || !word(initial)) fail();
      const old = streams.get(name);
      if (old) { if (old.initial !== initial) fail(); return old.draw; }
      if (streams.size >= MAX_STREAMS) fail();
      const row = { initial, next: BL.math.mulberry32(initial, true), draw: null };
      row.draw = () => row.next(); streams.set(name, row); return row.draw;
    };
    const random = stream('crew', seed);
    return Object.freeze({
      version: 1, planSteps, random, stream,
      randomInt(n) { if (!Number.isSafeInteger(n) || n < 1 || n > 0xffffffff) fail(); return Math.floor(random() * n); },
      capture() {
        return { v: 1, seed, planSteps, streams: [...streams].map(([name, row]) => [name, row.initial, row.next.capture()]) };
      },
      restore(saved) {
        if (!saved || Object.keys(saved).sort().join() !== 'planSteps,seed,streams,v'
          || saved.v !== 1 || saved.seed !== seed || saved.planSteps !== planSteps
          || !Array.isArray(saved.streams) || saved.streams.length !== streams.size) fail();
        const rows = [...streams];
        // Validate the entire roster before replacing any continuation word.
        for (let i = 0; i < rows.length; i++) {
          const item = saved.streams[i];
          if (!Array.isArray(item) || item.length !== 3 || item[0] !== rows[i][0]
            || item[1] !== rows[i][1].initial || !word(item[2])) fail();
        }
        for (let i = 0; i < rows.length; i++) rows[i][1].next = BL.math.mulberry32(saved.streams[i][2], true);
      },
    });
  };
  BL.npcExecution = { create, MAX_STREAMS };
})();
