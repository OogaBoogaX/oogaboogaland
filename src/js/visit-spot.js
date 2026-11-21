// Where the visitor's Ooga stands in the place the page shows, kept in this browser across reloads and restarts
// (localStorage KEY): the scene, the place in it (a Timechain room's number, a DSB Land venue, the island's routed
// place; "" for a scene that is one place), the feet and the heading, and, from a scene that passes its pilot to `note`,
// the view it was seen in (`pilot.viewState()`, read only as the page hides). The scene the visitor walks in notes it
// every frame while its Ooga stands free (`note`), the director forgets it on every scene change (`clear`), and it is
// written when the page hides or closes, as pilot.js keeps the view. The page opened at the bare address goes back to
// that scene and place (`resume`, read by the director), and a page that opens on that same scene and place takes the
// spot once (`take`) and stands its Ooga there if its own floor is still under it and it could walk on from there
// (`holds`); another place or a spot nobody can stand on arrives as it always did. Debug pages neither read nor write
// it, so fixtures and the suite arrive at each scene's own spot.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const KEY = "ooga-visit-spot", MAX = 1e3, SLACK = 0.02, REACH = 0.3, NAME = /^[a-z0-9.-]{0,40}$/;
  const KEEP = !new URLSearchParams(location.search).has("debug");
  const SPOT = { scene: "", place: "", x: 0, y: 0, z: 0, yaw: 0, view: null };
  const VIEWS = ["first-person", "shoulder", "orbit"];
  // The pilot the spot was last noted with, asked for its view only as the page hides.
  let viewOf = null;
  const viewOk = (v) => !!v && VIEWS.includes(v.view) && typeof v.combat === "boolean" && [v.relYaw, v.pitch, v.distance, v.height].every(Number.isFinite)
    && Math.abs(v.pitch) <= Math.PI / 2 && v.distance > 0 && v.distance < MAX && Math.abs(v.height) < MAX && (v.side === 1 || v.side === -1);
  // `held` is what this page opened with, until taken or the first scene change; `noted` that SPOT is current, and
  // `touched` that this page has had a say, so one that hides before its first scene stands keeps what it opened with.
  let held = null, noted = false, touched = false;
  if (KEEP) {
    let v = null;
    try { v = JSON.parse(window.localStorage.getItem(KEY)); } catch { /* Storage may be unavailable. */ }
    if (v && typeof v.scene === "string" && NAME.test(v.scene) && v.scene && typeof v.place === "string" && NAME.test(v.place)
      && [v.x, v.y, v.z, v.yaw].every(Number.isFinite) && Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) < MAX)
      held = { scene: v.scene, place: v.place, x: v.x, y: v.y, z: v.z, yaw: v.yaw, view: viewOk(v.view) ? v.view : null };
    const save = () => {
      if (!touched) return;
      try {
        if (noted) {
          const v = viewOf && viewOf.viewState();
          SPOT.view = viewOk(v) ? v : null;
          window.localStorage.setItem(KEY, JSON.stringify(SPOT));
        } else window.localStorage.removeItem(KEY);
      } catch { /* Storage may be unavailable. */ }
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") save(); });
  }
  // A body standing free counts as where the visitor is: not in the air, on a seat or lying down. Written in place.
  const note = (scene, place, cave, pilot = null) => {
    if (!KEEP || cave.hop !== 0 || cave.hopV > 0 || cave.camp.seat || cave.root.quaternion) return;
    viewOf = pilot;
    const p = cave.root.position;
    SPOT.scene = scene; SPOT.place = place; SPOT.x = p.x; SPOT.y = p.y - cave.baseY; SPOT.z = p.z; SPOT.yaw = cave.root.rotation.y;
    noted = touched = true;
  };
  /** The spot this page opened with when it was noted in `scene` at `place` (any of its places with none named), once; else null. */
  const take = (scene, place = null) => {
    const spot = held && held.scene === scene && (place === null || held.place === place) ? held : null;
    held = null;
    return spot;
  };
  const clear = () => { held = null; noted = false; touched = true; viewOf = null; };
  /** Where the page opened at the bare address goes back to: the scene and place the spot was noted in, or null. */
  const resume = () => held ? { scene: held.scene, place: held.place } : null;
  /**
   * Whether `cave` left at `spot` could walk on from it: one of eight short steps away passes the scene's own step test
   * `walkable(ax, az, bx, bz, feet, height, actor)`. A step, not the spot itself: a body resting against a wall, or
   * settled at a stair's foot, stands where no step may end and still walks away, while one outside the walls cannot.
   */
  const holds = (spot, walkable, cave) => {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      if (walkable(spot.x, spot.z, spot.x + Math.sin(a) * REACH, spot.z + Math.cos(a) * REACH, spot.y, cave.bodyHeight, cave)) return true;
    }
    return false;
  };
  // SLACK: how much nearer than its own width a remembered body may stand to a wall it was left resting against.
  BL.visitSpot = { note, take, clear, resume, holds, SLACK };
})();
