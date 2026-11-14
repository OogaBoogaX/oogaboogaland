// The Cloud Archive as a scene: this shell is always on the page; the archive itself (cloud-archive-interior.js, its
// models and its data) is deferred on a hosted page and arrives only when the visitor climbs in. Work in progress:
// `wip` keeps it unregistered (and its cloud off the island) unless the page opts in with ?wip=cloudarchive.
// A solo visit for now: no presence, poses or voice (docs/cloud-archive/BUILD-PLAN.md, Phase 2).
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  let impl = null;
  const scene = {
    id: "cloudarchive",
    wip: true,
    voiceZone: "none",
    root: null, camera: null, input: null, debug: null,
    get renderOpts() { return impl.renderOpts; },
    // The interior's own motion (cloud-archive-interior.js), as the Timechain scene forwards its rooms': an idle visit
    // lets the director throttle unfocused frames; LOAD's racks, the sign's glide, the TV's snow, tweens and particles
    // keep full rate.
    get inMotion() { return !!impl && impl.inMotion; },
    prepare() {
      const loading = BL.deferred.load("cloudarchive");
      return loading ? loading.then(() => null) : null;
    },
    enter(ctx) { impl = BL.cloudArchiveInterior.create(scene, ctx); },
    update: (dt, elapsed) => impl.update(dt, elapsed),
    overlay: (dt) => impl.overlay(dt),
    onDonation: (donation, bananas) => impl.onDonation(donation, bananas),
    onKey: (e) => impl.onKey(e),
    stay: () => { if (impl) impl.stay(); },
    leave() {
      const out = impl.leave();
      impl = null;
      return out;
    },
    stats: () => impl.stats(),
    liveGeometry: (set) => impl.liveGeometry(set)
  };
  BL.scenes = BL.scenes || {};
  BL.scenes.cloudarchive = scene;
})();
