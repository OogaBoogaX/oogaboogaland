// Offline, source-only DSB route bake. No browser, renderer, storage or network.
// The Worker imports the small result, never these scene meshes or Node APIs.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const root = new URL('../', import.meta.url);
const target = new URL('worker/src/rescue-routes.js', root);
const modules = ['math', 'scene', 'compact-geometry', 'models', 'hub-models', 'dressing', 'dressing-mediterranean',
  'dressing-chora', 'dressing-coastal', 'convex', 'solid-props', 'walk-rules', 'ooga-portal-models',
  'dsb-coast', 'dsb-geography', 'dsb-models', 'dsb-nature', 'dsb-exterior', 'dsb-enrichment',
  'dsb-town', 'dsb-atmosphere', 'dsb-olympus', 'dsb-vacancies', 'dsb-noderunner', 'dsb-collision'];
const sha = value => createHash('sha256').update(value).digest('hex');
// Fail closed if a refactor makes a boundary disappear or ambiguous. These are
// complete declarations from the page, not a second implementation of physics.
function section(source, from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start + from.length);
  if (start < 0 || end < 0 || source.indexOf(from, start + from.length) >= 0) throw Error(`rescue routes: source boundary ${from}`);
  return source.slice(start, end);
}

export async function routeSources() {
  const sources = await Promise.all(modules.map(async name => [name, await readFile(new URL(`src/js/${name}.js`, root), 'utf8')]));
  const scene = await readFile(new URL('src/js/scene-dsb.js', root), 'utf8');
  const rescue = await readFile(new URL('src/js/rescue-dsb.js', root), 'utf8');
  const dogs = await readFile(new URL('src/js/rescue-dogs.js', root), 'utf8');
  const parts = {
    lamps: section(scene, '  const LAMP_SPOTS=', '\n'),
    lampBuild: section(scene, '    const lampGeometry=', '    sampleDaylight();'),
    portara: section(scene, '    const portara=S.createNode', '    panel=document.getElementById'),
    exterior: section(scene, '    nature=BL.dsbNature.create', '    waterInteraction=BL.dsbWaterInteraction.create'),
    collision: section(scene, '    collision=BL.dsbCollision.create', '\n'),
    ground: section(scene, '    const groundAt=', '    pilot=BL.pilot.create'),
    walk: section(scene, '    const walkable=', '    const flyable='),
    capacity: section(dogs, '  const STRAY_CAP =', '\n'),
    homes: section(dogs, '  const HOME_GAP =', '  // Joins the builder caches'),
    clear: section(rescue, '    const dry=', '    // Dry open ground'),
    seed: section(rescue, '    const rescueDoor=', '    const room='),
    dog: section(rescue, '    const store=load(),DOG=', '\n').replace('const store=load(),', 'const ')
  };
  // Include the extractor itself: changing quantization or route selection also
  // requires an explicit route revision, even if the island did not move.
  const extractor = await readFile(fileURLToPath(import.meta.url), 'utf8');
  return { sources, parts, fingerprint: sha(JSON.stringify({ sources, scene, rescue, dogs, parts, extractor })) };
}

export async function buildRescueTerrain(input = null) {
  const { sources, parts, fingerprint } = input || await routeSources();
  const context = createContext({ window: { location: { search: '' } }, URLSearchParams });
  for (const [name, source] of sources) runInContext(source, context, { filename: `${name}.js` });
  const world = runInContext(`(() => {
    const BL=window.BL,S=BL.scene,root=S.createNode(),exterior=root;
    const land=BL.dsbGeography.build();S.addChild(root,land.root);S.removeChild(land.root,land.sea);
    const renderer={kind:"webgl2",quality:"high"},camera=S.createCamera(),ctx={renderer};
    const weather={state:{wind:{strength:0}}},structures=[],interiors={active:null},STEP=BL.walkRules.step;
    let nature,detail,enrichment,town,olympus,vacancies,collision;
    ${parts.lamps}
    ${parts.lampBuild}
    const floor=land.heightAt(-45,-48),gate=BL.oogaPortalModels.build(2.5,2.8,BL.dsbAtmosphere.portaraAperture);
    ${parts.portara}
    const noderunner=BL.dsbNoderunner.create({root:exterior,land});
    ${parts.exterior}
    ${parts.collision}
    ${parts.ground}
    ${parts.walk}
    ${parts.homes}
    ${parts.capacity}
    const D={homesAcross,STRAY_CAP};let homes=null;
    ${parts.dog}
    ${parts.clear}
    ${parts.seed}
    return {land,groundAt:(x,z,feet)=>groundAt(x,z,feet,undefined,DOG),clear,homes,solids:collision.solids,random:BL.math.mulberry32,
      dispose:()=>{collision.dispose();vacancies.dispose();olympus.dispose();town.dispose();
        enrichment.dispose();detail.dispose();nature.dispose();noderunner.dispose();}};
  })()`, context, { filename: 'rescue-route-terrain.js' });
  if (world.homes.length !== 900) throw Error('rescue routes: actual DSB homes did not fill 300 slots');
  return { ...world, fingerprint };
}

// Check the exact centimetre endpoints/interpolation that rescue-world sends.
// A chord may pass through a hill even when both endpoints stand on dry ground.
export function routeSegmentClear(world, a, b, fullBody = false) {
  const length = Math.hypot(b[0] - a[0], b[2] - a[2]) / 100;
  const steps = Math.max(1, Math.ceil(length / .1));
  let px = a[0] / 100, py = a[1] / 100, pz = a[2] / 100;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = (a[0] + (b[0] - a[0]) * t) / 100;
    const y = (a[1] + (b[1] - a[1]) * t) / 100, z = (a[2] + (b[2] - a[2]) * t) / 100;
    if (Math.abs(world.groundAt(x, z) - y) > .02 || !world.clear(px, pz, x, z, py)
      || fullBody && !world.solids.segmentClear(px, py + .03, pz, x, y + .03, z, .3, .57)) return false;
    px = x; py = y; pz = z;
  }
  return true;
}

const homeFor = (world, id) => {
  const x = Math.round(world.homes[id * 3] * 100), z = Math.round(world.homes[id * 3 + 2] * 100);
  return [x, Math.round(world.groundAt(x / 100, z / 100) * 100), z];
};
export function limitedRescueHomes(world) {
  const ids = [];
  for (let id = 0; id < 300; id++) {
    const home = homeFor(world, id);
    if (!routeSegmentClear(world, home, home, true)) ids.push(id);
  }
  return ids;
}

export function extractRescueRoutes(world) {
  const routes = [], random = world.random(5281384);
  for (let id = 0; id < 300; id++) {
    const home = homeFor(world, id), [x, , z] = home, route = [home];
    if (!routeSegmentClear(world, home, home)) throw Error(`rescue routes: uncleared quantized home ${id} at ${home}`);
    // Existing STEP and dog height are both .6: the page clears the dog's top
    // plane, not its whole body. Keep those inherited overlaps at home rather
    // than authorizing new travel through a shape we cannot certify.
    if (!routeSegmentClear(world, home, home, true)) { routes.push(route); continue; }
    for (let tries = 0; tries < 160 && route.length < 8; tries++) {
      const angle = random() * Math.PI * 2, radius = 60 + random() * 289;
      const nx = x + Math.round(Math.cos(angle) * radius), nz = z + Math.round(Math.sin(angle) * radius);
      const point = [nx, Math.round(world.groundAt(nx / 100, nz / 100) * 100), nz];
      if (Math.hypot(nx - x, nz - z) > 350 || route.some(p => Math.hypot(nx - p[0], nz - p[2]) < 40)) continue;
      // Every accepted prefix is a safe closed loop, including a one-node home.
      if (routeSegmentClear(world, route.at(-1), point, true) && routeSegmentClear(world, point, home, true)) route.push(point);
    }
    routes.push(route);
  }
  return routes;
}

export function routeModule(routes, fingerprint, limited) {
  const revision = sha(JSON.stringify(routes));
  return `// Generated by node scripts/rescue-routes.mjs. Do not edit coordinates.\n`
    + `// Slot order is the page's homesAcross seed 5281; a new revision needs explicit checkpoint migration.\n`
    + `export const RESCUE_ROUTE_SOURCE = '${fingerprint}';\n`
    + `export const RESCUE_ROUTE_REVISION = '${revision}';\n`
    + `// Existing seeded homes whose lower body is not certified: stationary until the scene clearance is corrected.\n`
    + `export const RESCUE_ROUTE_LIMITED = Object.freeze(${JSON.stringify(limited)});\n`
    + `export const RESCUE_ROUTES = Object.freeze([\n${routes.map(route => `  ${JSON.stringify(route)},`).join('\n')}\n].map(route => Object.freeze(route.map(point => Object.freeze(point)))));\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) throw Error('usage: node scripts/rescue-routes.mjs [--check]');
  const world = await buildRescueTerrain();
  try {
    const source = routeModule(extractRescueRoutes(world), world.fingerprint, limitedRescueHomes(world));
    if (process.argv.includes('--check')) {
      if (await readFile(target, 'utf8') !== source) throw Error('rescue routes: stale artifact; regenerate and review route/checkpoint migration');
    } else await writeFile(target, source);
  } finally { world.dispose(); }
}
