// Run one resumable construction slice per task. Each generator yields inside its real work, rather than merely
// before or after a monolithic builder. Scope and cancellation belong to the requested visit, never the active one.
(() => {
  "use strict";
  const BL = window.BL;
  // A construction slice's budget. It runs while the screen holds black, so throughput matters more than frame
  // pacing; staying under the 50 ms long-task line keeps input and the fade responsive.
  const SLICE_MS = 40;
  // A builder's checkpoints: `yield* pause(slice)` once per row or model piece; in a tight per-face or per-vertex
  // loop, where a call each time costs more than the work, `if (due(slice, 63))` in front of it reads the clock every
  // 64th time. Each builder file binds the two to these only when sliced, so an unsliced build (the terrain worker's,
  // a Node check's) runs without this file. Without a slice neither pauses.
  const due = (slice, mask = 0) => !!slice && (!mask || (++slice.work & mask) === 0) && performance.now() >= slice.until;
  // The deadline restarts on resuming, so waiting for the next task never spends construction budget.
  const pause = function* (slice) {
    if (!due(slice)) return;
    yield;
    slice.until = performance.now() + slice.budget;
  };
  const later = () => {
    // Hidden tabs clamp idle callbacks and timers; there is no visible frame to yield for while the page is hidden.
    if (typeof document !== "undefined" && document.hidden) return Promise.resolve();
    if (globalThis.scheduler && typeof scheduler.postTask === "function") return scheduler.postTask(() => {}, { priority: "user-visible" });
    return new Promise(resolve => {
      if (typeof requestIdleCallback === "function") requestIdleCallback(resolve, { timeout: 16 });
      else setTimeout(resolve, 0);
    });
  };
  // Account only synchronous construction, including nested prepare/run calls once. Task, network and storage
  // waiting must not make a fast device look slow to the director's boot-quality probe.
  let cpu = 0, measuring = 0;
  const measure = (work) => {
    const start = measuring++ === 0 ? performance.now() : 0;
    try { return work(); }
    finally { if (--measuring === 0) cpu += performance.now() - start; }
  };
  const run = async (steps, scope, signal = null) => {
    try {
      for (;;) {
        if (signal && signal.aborted) throw signal.reason || new DOMException("Build cancelled", "AbortError");
        const step = measure(() => BL.models.withScope(scope, () => steps.next()));
        if (step.done) return step.value;
        await later();
      }
    } finally {
      // Partial terrain is private to the iterator until completion; closing it releases every construction array.
      measure(() => BL.models.withScope(scope, () => steps.return()));
    }
  };
  BL.buildTasks = { SLICE_MS, due, pause, run, measure, get cpu() { return cpu; } };
})();
