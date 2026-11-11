# Cliff ledges

The hub has two unrailed rock circuits beneath the basement windows. The upper
floor is at −7.75 m and the lower floor at −13.25 m. Each has about 2 m of usable
width, with wider rock landings at the ropes. Both floors, their headroom and the
rock beneath them belong to the island's voxel mesh and collision queries.

The cliff is widened locally and its outer window reveals meet the shelves.
Room interiors, inner window apertures, existing paths and all top voxels remain
unchanged. Construction consumes no extra seeded random draws. Rope anchors are
chosen after scenery placement; a blocked top anchor is skipped rather than
moving a tree or prop.

## Controls

- Walk toward a rope from its lower landing to attach. Forward climbs, backward
  descends, and releasing movement holds position.
- Walk outward from the anchor stake at an upper rappel landing to descend.
  The Ooga holds the rope across the stepped rim before lowering. Release forward
  before reversing direction.
- Space, or the ordinary touch jump control, releases the rope with a jump.
- Three rope ladders join the circuits. Two or three rappel ropes reach the top,
  depending on clear existing anchor positions.
- GAME MODE disables the ropes. Scene activity and ordinary player pose updates
  remain in charge; no room messages are added.

There is no new sea-swimming mechanic. Walking or jumping off uses the hub's
existing fall and return-to-island behavior. The ropes' on-screen help says so.

## Ownership and validation

`terrain.js` owns the hub-only voxel option and cache identity. Other island
scenes keep their original terrain. The terrain snapshot contains the same voxel
and window data, so its existing queries serve both variants.

The cliff mesh merges static rock faces beneath route ceilings only when their
material, route key, ceiling and window ownership agree. It retains the original
route metadata and every collision voxel; removable roofs and detailed room
floors keep their original meshing. The snapshot face limit remains unchanged.

`hub-cliffs.js` builds six bounded rope route records and their static meshes.
`crew.js` uses the existing ladder controls, with an optional sloped route and
outward departure before descending through a rock lip. No per-frame route
objects are created. The hub owns and clears the records with its ordinary
placed-node lifetime.

The unit rule checks both complete circuits on three walking lines, direct and
snapshot-restored support/headroom, and unchanged top voxels, room definitions,
inner window apertures and paths. The hub browser rule exercises climb, pause,
descent, jump release and GAME MODE through the ordinary keyboard path. The
existing Factory ladder rule covers unchanged vertical-ladder behavior.

Run the focused terrain rule with `node test/run.mjs cliffs-unit`. After a build,
`ONLY="hub cliff ledges" node test/run.mjs --browser-only hub` runs its browser
rule without the global tier or other scenes.
