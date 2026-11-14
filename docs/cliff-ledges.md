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
- Three rope ladders join the circuits and three rappel ropes reach the top.
  The browser check pins all six routes in the shipped layout.
- GAME MODE disables the ropes. Scene activity and ordinary player pose updates
  remain in charge; no room messages are added.

There is no new sea-swimming mechanic. Walking or jumping off uses the hub's
existing fall and return-to-island behavior. The ropes' on-screen help says so.

## Connections and acceptance

The shelves intentionally provide another way to reach HQ: each is 0.75 m below
its four balcony landings, so an Ooga can hop up or drop back down. The panorama
window lip is also within an ordinary jump from the upper shelf. Physical
play-testing should cover these crossings and the exterior/interior camera
handoff, plus gorillas climbing the cliff under the new overhangs. The unrelated
gorilla population handoff investigation remains deferred by the maintainer.

The reviewed terrain fixture grows from 167,374 to 184,274 faces (about 10%),
leaving 15,726 below the unchanged 200,000-face snapshot cap. Canvas 2D also pays
for those faces; this is geometry headroom, not a frame-rate measurement.

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

## Integration review — 2026-11-14

Updated through the world-map merge (#480). The terrain check passed all 4,320
samples (1/1 check), and the focused hub cliff and Factory ladder browser checks
passed 4/4, including clean consoles. All three rappel ropes and all three rope
ladders climbed, held, landed and descended on the current modelled Ooga body;
jump release with an idle jetpack and GAME MODE detach/block/re-enable passed.
Factory's existing vertical ladders retained their controls and landing behavior.
Build, changed-JavaScript syntax and diff whitespace checks passed.

This is focused coverage. The maintainer deferred the broader suite investigation;
physical phone controls, live multiplayer, HQ camera handoffs and gorilla cliff
crossings remain acceptance work. Existing shared gait and network pose handling
are retained; no new protocol or Worker change is introduced.
