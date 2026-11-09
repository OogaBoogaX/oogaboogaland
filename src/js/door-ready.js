// What stands behind a door, readied while the visitor is still on this side of it, as the Timechain Sphere's doorway
// readies a room behind its doors: the place's code (deferred on a hosted page), then its pure construction and
// uploads, a slice a frame, so the frame that crosses over has little left to do.
//
// Nearing the door only asks speculatively (`approach`: deferred.js's `prefetch`, which Save-Data and a failed try's
// back-off turn down); walking in asks for real (`commit`). A request that fails leaves it `failed` until the next
// `commit`, so nothing retries by itself. `extra` is code the place opens better with and opens without: `extraDone`
// says it has arrived or will not. The owner calls `step(budget)` once a frame, in milliseconds of that frame, while
// someone is near or walking in. Nothing here allocates a frame beyond what the builders themselves do.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const create = ({ code, extra = null, scope, steps = null }) => {
    // The slice the builders check in with (build-tasks.js), lent to them for a frame at a time.
    const slice = { until: 0, budget: 0, work: 0 };
    let phase = "idle", iterator = null, attempt = 0, committed = false, extraAsked = false, extraGone = false;
    const advance = () => iterator.next(), close = () => iterator.return();
    const approach = () => {
      if (phase === "failed") return;
      if (!BL.deferred.present(code)) BL.deferred.prefetch(code);
      // Only once its base is here: asking first would fetch the base a second time through the extra's prerequisite.
      else if (extra) BL.deferred.prefetch(extra);
    };
    const commit = () => {
      const mine = ++attempt;
      committed = true;
      extraAsked = extraGone = false;
      if (phase === "failed") phase = "idle";
      const loading = BL.deferred.load(code);
      if (loading) loading.catch(() => { if (mine === attempt) phase = "failed"; });
    };
    const step = (budget) => {
      if (phase === "failed" || !BL.deferred.present(code)) return;
      if (committed && extra && !extraAsked) {
        extraAsked = true;
        const loading = BL.deferred.load(extra);
        if (loading) loading.catch(() => { extraGone = true; });
      }
      if (phase === "ready") return;
      if (phase === "idle") {
        phase = "building";
        iterator = steps ? BL.models.withScope(scope, steps, slice) : null;
      }
      if (iterator) {
        slice.budget = budget;
        slice.until = performance.now() + budget;
        if (!BL.models.withScope(scope, advance).done) return;
        iterator = null;
      }
      phase = "ready";
    };
    // Back to nothing asked and nothing readied: partial construction is private to its iterator and goes with it.
    const reset = () => {
      if (iterator) BL.models.withScope(scope, close);
      iterator = null;
      phase = "idle";
      committed = extraAsked = extraGone = false;
      attempt++;
    };
    return {
      approach, commit, step, reset,
      get phase() { return phase; },
      get ready() { return phase === "ready"; },
      get failed() { return phase === "failed"; },
      get working() { return phase === "building"; },
      get extraDone() { return !extra || extraGone || BL.deferred.present(extra); }
    };
  };
  BL.doorReady = { create };
})();
