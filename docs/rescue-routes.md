# Server-owned DSB stray routes

`worker/src/rescue-routes.js` is a committed, immutable centimetre-coordinate
table for the shared rescue simulation. It is not accepted from a browser, and
does not activate the rescue host, add an endpoint or deploy anything.

## Source and clearance

`node scripts/rescue-routes.mjs` reconstructs the actual DSB geography and all
exterior collision contributors in Node: building/deck shells, Noderunner,
nature, facade dressing, coastal enrichment, town, Olympus, vacancy plaques,
the scene's lamps, Portara and its dialer. It uses existing geometry and solid
queries, not authored proxy obstacles or another height formula. It runs no
browser, rendering, game storage or network. No generated mesh assets are kept.

The baker executes the page's `groundAt`, `walkable`, rescue clearance, home
seeding and `homesAcross` declarations directly from their source files. Missing
or ambiguous source boundaries fail the bake. Home slots retain the existing
seed 5281, count 300, lane allocation and rescue-door ordering. Their x/z values
are rounded to centimetres; y is the actual dog-radius supported floor at those rounded
coordinates. A home that cannot be certified fails the bake, rather than dropping
or reordering dogs.

Each route has 1–8 nodes within 3.5 m of its home. A fixed route-selection seed
chooses candidates. Every consecutive segment **and the closing segment to
home** is checked against the actual walking query and dry ground. Moving
routes additionally pass a full-height dog collision sweep. The centimetre chord must remain within 2 cm of the real
support surface at intervals of at most 10 cm. This is a conservative sampled
terrain check, not a claim of continuous mathematical clearance. The solid-body
sweeps are continuous between those samples. A confined home may stay still.

The current scene passes a 0.6 m dog height to a walking query whose step height
is also 0.6 m. That query therefore clears a plane at feet + 0.6 m, not the lower
body. Some original seeded homes overlap a lower exterior solid. This bake does
not change that existing rule or silently move those IDs. `RESCUE_ROUTE_LIMITED`
lists affected home slots; each is a stationary one-node route. Full-body
clearance is **not** claimed for those homes. Correcting that inherited scene
collision limitation is an activation gate, alongside host/transport integration.

## Revision and activation contract

`RESCUE_ROUTE_SOURCE` fingerprints the loaded geometry/query sources, extracted
scene declarations and the baker. `RESCUE_ROUTE_REVISION` hashes the resulting
route table. Consumers must bind the route revision to the world/checkpoint and
refuse a mismatched saved revision. Never silently discard a checkpoint or
reuse old dog IDs against new routes. A source change requires regeneration and
review even if it happens to preserve route coordinates. A coordinate change
requires an explicit migration or a new world generation under host ownership.

Import `RESCUE_ROUTES` on the server as trusted configuration. The route module
alone does not enforce checkpoint compatibility; the host must enforce this
contract before enabling shared rescue traffic. The existing solo page remains
responsible for its local dogs until that integration is enabled.

## Focused verification

- `node scripts/rescue-routes.mjs --check` rebuilds and refuses stale output.
- `node --test worker/test/rescue-routes.test.mjs` verifies the real source bake,
  unchanged home ordering, reproducibility, route bounds, supported floors,
  all segment closures and known obstructed/unsupported locations.

These source-only checks do not exercise browser rendering, the live host,
transport, authentication or deployment. They do not run the general scene or
performance suites.
