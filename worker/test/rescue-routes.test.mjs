import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildRescueTerrain, extractRescueRoutes, limitedRescueHomes, routeModule, routeSegmentClear } from '../../scripts/rescue-routes.mjs';
import { RESCUE_ROUTES, RESCUE_ROUTE_SOURCE, RESCUE_ROUTE_REVISION, RESCUE_ROUTE_LIMITED } from '../src/rescue-routes.js';
import { validateRoutes } from '../src/rescue-world.js';

// Rule: every server slot belongs to real DSB dry ground, and the entire closed
// walk it projects must clear the same terrain and exterior solids as the page.
test('DSB source bake preserves home IDs, deterministic routes and every closing segment', { timeout: 120000 }, async () => {
  const world = await buildRescueTerrain();
  try {
    const routes = extractRescueRoutes(world);
    assert.equal(world.fingerprint, RESCUE_ROUTE_SOURCE, 'source changed: regenerate and review checkpoint migration');
    assert.deepEqual(routes, RESCUE_ROUTES);
    assert.deepEqual(extractRescueRoutes(world), routes, 'same island and seed must produce identical IDs and paths');
    assert.equal(validateRoutes(routes), routes);
    assert.match(RESCUE_ROUTE_REVISION, /^[0-9a-f]{64}$/);
    const limited = limitedRescueHomes(world);
    assert.deepEqual(limited, RESCUE_ROUTE_LIMITED);
    for (const id of limited) assert.equal(routes[id].length, 1, `uncertified lower-body clearance never adds travel at ${id}`);
    assert.equal(await readFile(new URL('../src/rescue-routes.js', import.meta.url), 'utf8'), routeModule(routes, world.fingerprint, limited));
    let moving = 0, mountain = 0, chora = 0;
    for (let id = 0; id < routes.length; id++) {
      const route = routes[id], home = route[0];
      assert.equal(home[0], Math.round(world.homes[id * 3] * 100), `home ${id} x`);
      assert.equal(home[2], Math.round(world.homes[id * 3 + 2] * 100), `home ${id} z`);
      assert.ok(Object.isFrozen(RESCUE_ROUTES[id]) && RESCUE_ROUTES[id].every(Object.isFrozen));
      if (route.length > 1) moving++;
      if (home[1] > 1800) mountain++;
      if (home[0] > 0 && home[2] > 0) chora++;
      for (let node = 0; node < route.length; node++) {
        assert.ok(routeSegmentClear(world, route[node], route[(node + 1) % route.length]), `slot ${id}, segment ${node} including closure`);
        if (route.length > 1) assert.ok(routeSegmentClear(world, route[node], route[(node + 1) % route.length], true), `moving slot ${id} clears its body`);
      }
    }
    assert.ok(moving > 250, 'the actual island provides roaming paths, not 300 stationary fixtures');
    assert.ok(mountain > 10 && chora > 50, 'homes cover Olympus and the Chora');
    const home = routes[0][0], raised = [home[0], home[1] + 100, home[2]];
    assert.equal(routeSegmentClear(world, raised, raised), false, 'a floating endpoint is rejected');
    assert.equal(routeSegmentClear(world, home, [0, -500, 12000]), false, 'dry endpoints cannot authorize a sea crossing');
    const building = world.land.buildings[0];
    const inside = [Math.round(building.x * 100), Math.round(building.floor * 100), Math.round(building.z * 100)];
    assert.equal(routeSegmentClear(world, inside, inside), false, 'an actual building interior is not stray ground');
  } finally { world.dispose(); }
});

// Regression: endpoint-only validation accepted a chord through a hill/wall and
// did not check the last-to-home edge. The sweep reads intermediate support and
// collision rather than treating a coordinate list as clearance evidence.
test('segment certification checks intermediate floor and collision', () => {
  const world = { groundAt: x => x > .4 && x < .6 ? 1 : 0, clear: () => true,
    solids: { segmentClear: () => true } };
  assert.equal(routeSegmentClear(world, [0, 0, 0], [100, 0, 0]), false);
  world.groundAt = () => 0;
  world.clear = (ax, _az, bx) => bx < .5 || ax > .5;
  assert.equal(routeSegmentClear(world, [0, 0, 0], [100, 0, 0]), false);
});
