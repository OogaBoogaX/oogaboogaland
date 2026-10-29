# Free Puppies Rescue · permanent address VAC 1

Source checkpoint: `19080eb9d236733d262c8012468005027b04210e`.

VAC 1 is now occupied by **Free Puppies Rescue**. Its historical geography identity is still `VACANT 21`, at x=5 m, z=51 m, yaw −0.4229, with the same 4 × 4 m exterior footprint. The existing facade plaque now reads `Free Puppies Rescue`; the house, its door, steps, terrain, collision, plants and routes are unchanged. VAC 3–6 and VAC 8–35 keep their original numbers, identities and signs, VAC 2 is Free Hardware Wallets, and VAC 7 stays SVRN Society. There are 32 remaining vacant properties.

The plaque is 3.7 × 0.42 m, centred 0.77 m above the address's original mounting height (3.55 m above the floor). A 4 m house carries two facade lanterns at ±1.6 m and 2.6 m, so a plaque wide enough for the name at the original height would sit behind them; above them it reads whole from the plaza and the beach. The lettering is the same DSB sign glyph geometry in cream on the venue blue.

The shared interior controller enters from this property's existing facade and returns the same player to its approach (x≈3.6, z≈54.2; height sampled from existing terrain).

## Why VAC 1

VAC 1–6 line the lower, harbour-facing edge. VAC 1 stands in the front row on the plaza beside Meme Factory House, its door facing the open plaza and the sea, so its plaque is seen from the beach and the waterfront road. It lies 23 m along the same promenade from VAC 2 (Free Hardware Wallets, if both establishments land). VAC 5 faces inland with a market stall in front of its door, VAC 6 faces west behind olive trees, and VAC 4 is a 3 × 3 m house; VAC 7 is SVRN Society's.

## The room

`rescue-room.js` builds an 18 × 20 m larger-inside kennel hall with a 5 m ceiling: whitewashed walls with a blue band, timber beams, terracotta tiles at the front and a grass yard at the back behind a low picket fence, open in the middle.

- **Six dog houses** (`rescue-models.js`: planked walls, a gable roof in its own colour, a dark doorway, a bone over the door), one for each breed, with a waiting puppy's spot in front of each.
- **Five bowls** between them, food and water by turns.
- **The board** on the back wall: `EVERY OOGA NEEDS A DOG`, and under it the visitor's own line, `SIGN IN TO ADOPT A PUPPY`, `A PUPPY IS WAITING FOR YOU` or `YOUR DOG IS WITH YOU`, rewritten only when it changes.
- **The adoption desk** by the door under its `ADOPT A PUPPY` sign, travel crates and a bench along the left wall, planters by the door and in the yard.
- **Puppies asleep**: a wire pen with two curled up in it and a ball, round dog beds and a wicker basket by the walls, a sleeping puppy (each in a breed's coat, `z Z` over it) in two of them. They are scenery; the puppies up for adoption wait at the dog houses.
- **Toys and food**: balls, rope tug toys and bones about the floor, a stack of kibble sacks with paw prints by the desk and a row of four bowls on a bench along the front wall.
- **The vet's corner**: a steel table with a stethoscope and a scale, a wall cabinet with a red cross and bottles, a `VET` sign.
- **Posters** `ADOPT, DON'T SHOP`, `EVERY DOG DESERVES A HOME` and `ADOPT ME!`, and a muddy trail of paw prints from the door through the fence's gap into the yard.
- **Warm light**: six enamel pendant lamps with glowing bulbs hang between the beams; the light itself stays the five point lights.

Every piece is cached shared geometry from `rescue-models.js`, merged per piece; `'` and `,` are cut on the sign alphabet's 3x5 grid in `dsb-models.js`'s text, since the island's carved alphabet has none.

The existing `dsb-interiors` transition, lighting and audio gates, contextual menu zones and the shared menu shell are reused; the room uses the existing shop ambience. Zones: the dog houses, the puppies' spots and the desk say **Adopt a puppy**; the bowls say **Feed your dog**; anywhere else adopts. A tap on the desk sign opens the adoption too.

## The dogs

`rescue-dogs.js` owns every dog in DSB Land, ported from the island version and moved into the Chora; `rescue-dsb.js` attaches it to the scene with the rescue's storage, adoption, desk and board (below).

- **Six breeds** (Shiba, Dalmatian, Bulldog, Corgi, Pit Bull, Labrador), each a voxel body, four legs swung about the hip and a tail, one instanced batch per part per breed.
- **Adoption** through the dialog (`rescue-menu.js`, built from SVRN Society's menu classes, so it adds no CSS): six painted portraits and a name (sanitized, 16 characters, falling back to the suggestion), for the signed-in visitor's own Ooga only (`BL.net.ownCharacter`, checked with `BL.net.mayDrive` when adopting). One dog a login. Signed out there is no adoption: the Ooga a signed-out visitor drives belongs to a contributor, so the desk, the dog houses and a tap on a stray open the dialog on **Sign in to adopt a puppy.** alone, with Back and no puppies, name or Adopt (a toast at the screen's edge was easy to miss). Strays and scooping are everyone's.
- **Following**: the own dog follows its Ooga a step behind, through every door and back out, while that login drives its own Ooga. Its floor is looked up at the dog's own height plus a step, never its Ooga's, so it climbs no roof and wades onto no seabed, and every step is checked with the strays' `clearSegment`. Stopped by a wall it waits; it turns up beside its Ooga only when that Ooga is out of reach on its own level behind a wall, or was moved (a door, the deep-water return). Under an Ooga up on a roof it waits on the ground, looking up.
- **Flying**: when its Ooga flies (thrusting off the ground or 1.2 m above what lies under it), the dog flies too, on a small jetpack of the Ooga's own look (`BL.hubModels.jetpack`/`jetFlame`, the cached meshes, two nodes) with the flame and sparks, 1.7 m behind and a little below at up to 1.35 times `BL.crew.JET_SPEED`, climbing and sinking at `JET_RISE`. It climbs over what stands in its way (the scene's `flyable`, up to 8 m over where it is going) and never through it, keeps above the water's surface over the sea, and takes nothing within a step over its feet for its floor, so it climbs no mast. Its Ooga down, it picks dry open ground with nothing over it within 14 m (behind its Ooga first), flies over and comes straight down, then walks on. It never squats in the air, and poop only ever lands on dry open ground. Strays never fly: one tagging along stops when its Ooga leaves its level.
- **Hunger**: full to empty in 600 s of scene time; past 70 % it sits, whines and shows a hungry sign; a tap feeds it one banana from the shared pile (`world.level`); left empty for 90 s it goes back to the rescue and its Ooga may adopt again.
- **Poop everywhere**: a fed dog poops only out in DSB Land on the ground, every 120–240 s, and every stray every 240–480 s wherever it roams (its first one due anywhen in that, so piles start at once); the piles are a ring of 512, oldest first, saved, and scooped with a tap. The driven Ooga stepping in one says so.
- **Strays** roam all of DSB Land, not the hub: 300, 150 or 60 by quality tier (`STRAY_TIER`), at 300 homes seeded with `mulberry32(5281)` (`homesAcross`): 96 a step off the Chora's lanes and the rest anywhere on the island's walkable ground, clear of buildings, props and water and at least 3 m apart. The homes come shuffled, so the homes a tier fills spread over the whole island, except that the four nearest the rescue's doorstep lead. A stray wanders up to 3.5 m from home along clear straight lines, sniffs, sits, poops into the same ring, sleeps at home while the daylight is low, and now and then trots beside the passing Ooga for 6–12 s within 16 m of home, every step a clear one (stopped, it goes home, popping in there when the way back is not clear). A tap opens the adoption with that very dog chosen; adopted, it follows; a newcomer takes its home 45 s later. When the tier drops, the extra strays go at once. The homes are laid out on the first visit and kept for the page's life.
- **Distance**: a dog is drawn only within the tier's draw distance of the camera (60, 42 or 28 m) and before it, at most 128, 72 or 32 strays a frame, and only strays within 16 m of the camera cast shadows (the yard's puppies and the own dog always do); piles within 40, 30 or 22 m, at most 160, 96 or 48, with two flies over each of the nearest 48 within 18 m. A stray further than the draw distance plus 12 m thinks one frame in eight with the time it missed (a step never overshoots, so it still lands where it walks).
- **Spaces**: a dog is in the Chora, in the yard or with its Ooga. Only the visitor's space is drawn and picked; the rest wait unmoved, so the room and the Chora share coordinates.

Fixed capacity: 332 dog slots in typed arrays, 512 poop slots, per breed and part an instanced batch of 24 dogs that cast shadows and one of 160 that do not (the second shares the first's vertices), two batches for poop and flies, the jetpack's two nodes, and 672 pick targets (160 handed each frame to the dogs drawn, 512 for the piles) made once a visit and removed in `dispose`. The frame loop writes `instanceData` in place and allocates no objects or arrays.

## Storage and loading

`rescue-dsb.js` and the four modules before it are in the `dsb` deferred group, before `dsb-interiors.js` (which reads `BL.rescueRoom`): a visitor who never enters DSB Land downloads and runs none of it, and nothing of the rescue is created, timed or stored until they do. `scene-dsb.js` keeps one-line calls into the object `BL.rescueDsb.attach` returns (`update`, `drawOverlay`, `onTap`, `onKey`, `isOpen`, `menuForRoom`, `stats`, `dispose`).

The rescue keeps its own `localStorage` key, `oogaboogaland.rescue.v1`, read and validated on every visit: one dog for each signed-in login on this browser (at most 16, the oldest adoption giving way), the 512 newest piles within 200 m of the middle and the scoop count, each bad part dropped alone. It is kept in memory during the visit and written every 15 s while there is a dog to keep or a pile has changed, on leaving DSB Land, and at once for an adoption or a dog going back; hunger is saved to three decimals and coordinates to the centimetre. Nothing of it is in `game.js` except Right Shift+R's `resetAll`, which deletes the key with the island's own save.

Measured in Node with the real DSB geography (`waterWorld`, 2400 frames at 60 fps, one core of the build machine): the whole system's `update` takes 0.05 ms a frame on high with 300 strays (p95 0.10 ms), 0.03 ms on medium and 0.007 ms on low, and 0.05 ms with the ring full at 512; in the browser (SwiftShader, no GPU) the rescue's share of a DSB update is about 0.4 ms with 300 strays, flying or not. Seeding the 300 homes takes about 70 ms, once a page. A dog is about 670 triangles and a pile 412 (piles and flies cast no shadow), so the caps bound the dogs at about 86k, 48k and 21k triangles by tier and the piles at 66k, 40k and 20k.

Controls add no key: Space or the touch context button at the dog houses, desk or bowls; a tap on a puppy, a stray, the own dog (feed) or a pile (scoop); Escape closes the dialog.

## Privacy and resilience

Everything is local and offline: no requests, no remote images. The adoptions (keyed by the signed-in GitHub login), hunger and poop stay in this browser's localStorage under the rescue's own key; a malformed entry is dropped alone on load.

## Deterministic review links

Base: any build of this branch (`oogaboogaland.html`, or `npm run serve`).

- Exterior: `?scene=dsb&debug=1&view=rescue-door&weather=clear&time=1200`
- Strays in the lanes by the rescue: `?scene=dsb&debug=1&view=rescue-strays&weather=clear&time=1200`
- Strays across the Chora from above: `?scene=dsb&debug=1&view=rescue-island&weather=clear&time=1200`
- Interior: `?scene=dsb&debug=1&interior=puppy-rescue&view=<view>&weather=clear&time=1200`
- Views: `rescue-entrance`, `rescue-yard`, `rescue-kennels`, `rescue-desk`, `rescue-wide`; `rescue-adopt` opens the adoption dialog at the dog houses.
- Debug helpers: `__ooga.dsb.rescue` (`open`, `adopt` under the same rules as the dialog, `menu`, `store`, `save`, `line`) and `__ooga.dsb.rescue.dogs` (`hunger`, `poop`, `feed`, `scoop`, `strays`, `waiting`, `dog`, `shadows`, `hold`, `place`). Adopting needs a signed-in visitor; on a page without the Worker, `BL.net.state.me = { id: 1, login: "<the Ooga's GitHub login>" }` stands in for one.

Focused checks: `node test/run.mjs rescue-unit` (the rescue's own save, address, room navigation and zones, homes across the island, spaces, the strays' capacity, drawing, shadows and far thinking, tiers, adoption, hunger, poop, the ring of 512 and its drawing, night, disposal, the own dog round a house, over it and the sea on a jetpack and under an Ooga on a roof, and the dialog); permanent addresses: `node test/run.mjs vacancy-unit`. Browser sessions: `ONLY="rescue checkpoint" npm test -- dsb` (real door, signed out refused, signed in the dialog, one dog a login, following, door round trips), `ONLY="rescue care" npm test -- dsb` (feeding and scooping with real clicks), `ONLY="rescue flight" npm test -- dsb` (a stray's tap signed out and in, then a flight over the Meme Factory House and the harbour) and `ONLY="rescue phone" npm test -- dsb`.
