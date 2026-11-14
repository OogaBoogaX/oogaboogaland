// The way to watch Block Frenzy: a walk-through doorway in the east wall of its entry hall (`BLOCK_HALL`), between the
// torch and the last map picture, with the shared Ooga portal in it. It is separate from the zipline, which stays the way
// to play. Layout, the signed-in rule and the door's walking are pure, for scene-arcade.js and the tests. `goToWatchDeck`
// is the one place the viewer leaves for Block Frenzy's viewing chairs. The way back is `PLACE`: the chairs send a viewer
// to `go("arcade", PLACE)` and they stand at `ARRIVAL`; `PLACE_FULL` is the same, for five chairs already taken.
(() => {
  "use strict";
  const BL = window.BL;
  const { BLOCK_HALL: BH } = BL.arcadeModels, CENTRE = -35.4, H = 3, Y = BH.y;
  // `z0`, `z1` the clear opening; `plane` the portal's surface, a little proud of the rock; `reach` how far a body's edge
  // may press past it, so its middle just crosses the surface and no further.
  const DOOR = { z: CENTRE, z0: CENTRE - 1.2, z1: CENTRE + 1.2, plane: BH.x1 - 0.15, reach: BH.x1 + 0.27, h: H, y: Y };
  // Over the tallest walker's head, in the view from the hall's middle: the hanging sign and the blade sign's heights.
  const SIGN_Y = 2.6, BLADE_Y = 3.1;
  const APERTURE = Object.freeze({ width: 2.5, height: H, footWidth: 2.5, footHeight: 0, inset: 0.06 });
  const PLACE = BL.blockWire.DOOR_PLACE, PLACE_FULL = BL.blockWire.DOOR_FULL_PLACE, ARRIVAL = Object.freeze({ x: BH.x1 - 1.6, z: CENTRE, facing: -Math.PI / 2, deck: true });
  // How far a body reaches into rock here, negative in the clear: the hall's walk bound carried on to the portal, only
  // on the hall's own level and only across the opening.
  const doorDepth = (x, z, r, feet) => feet < Y - 1 || feet > Y + H ? Infinity : Math.max(BH.x0 + r - x, x + r - DOOR.reach, DOOR.z0 + r - z, z + r - DOOR.z1);
  // A walker pressed up to the portal: its middle at the surface, inside the opening, on the hall's floor. A trigger zone
  // rather than one exact crossing, so a jump, a slow frame or a step back can't lose the walk-through.
  const atPortal = (x, z, feet) => x >= DOOR.plane - 0.05 && z > DOOR.z0 && z < DOOR.z1 && Math.abs(feet - Y) < 0.6;
  const mayWatch = (signedIn, debug) => !!signedIn || !!debug;
  const SIGN_IN = "Sign in to watch Block Frenzy", FULL = "The viewing chairs are full. Try again in a moment";
  // Off to the chairs, through the scene's own way of changing scene (`open`).
  const goToWatchDeck = (open) => BL.blockLive.openWatchDeck(open);
  BL.arcadeBlockWatch = { SIGN_Y, BLADE_Y, DOOR, APERTURE, PLACE, PLACE_FULL, ARRIVAL, SIGN_IN, FULL, doorDepth, atPortal, mayWatch, goToWatchDeck };
})();
