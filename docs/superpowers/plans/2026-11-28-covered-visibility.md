# Covered Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce early-gameplay visibility construction and overlay bandwidth while preserving exact occlusion and readable UI.

**Architecture:** Share one blocker-eligibility predicate between exact visibility collection and idle warming, deduplicate the idle queue, and route overlay sizing through a pure pixel-budget helper. Profile after each independent commit before attempting any exact-boundary algorithm change.

**Tech Stack:** Dependency-free classic JavaScript, Node's built-in test runner in `test/run.mjs`, headless Chrome DevTools profiling.

## Global Constraints

- Baseline is upstream `rock` at `4387b8914473425ef0a2b6c881865d12be4f25d4`.
- No frameworks, dependencies, new test files, console noise, weakened assertions, or changes to the maintainer's dirty checkout.
- Preserve exact visibility semantics, both renderers, and scene disposal.
- Commit with Harry Beckwith `<harry@hotpixelgroup.com>`; open a draft PR after the first working commit and mark ready only with measured improvement.
- Every performance claim includes before/after values, environment, commands, and limitations.

---

### Task 1: Warm only exact-query blockers, once each

**Files:**
- Modify: `src/js/character-visibility.js:262-278,545-593`
- Modify: `test/run.mjs:48736-48755`

**Interfaces:**
- Consumes: existing scene nodes with `geometry`, `visible`, `cameraHidden`, `smokeOpacity`, and geometry flags.
- Produces: one internal `blockerGeometry(node)` predicate used by both `visit` and idle `collect`; a `Set` of pending geometry.

- [ ] **Step 1: Add the failing regression**

Extend the warm fixture with a visible valid mesh plus hidden, camera-hidden, surface-overlay, and translucent-smoke meshes. After the real public warmer drains, assert that none of the ineligible meshes has a BVH:

```js
const ineligible = [
  { visible: false },
  { cameraHidden: true },
  { geometry: { surfaceOverlay: true } },
  { smokeOpacity: 0.5 }
].map((props, i) => ({ geometry: { ...warmGeometry, surfaceOverlay: i === 2 }, children: [], ...props }));
for (const node of ineligible) warmRoot.children.push(node);
check(ineligible.every(node => !meshes.has(node.geometry)), "Idle warmer baked a node the exact query cannot use");
```

Also place the valid geometry on two nodes and keep the existing exact-bake equivalence assertions.

- [ ] **Step 2: Verify the regression fails**

Run: `npm run test:unit`
Expected: FAIL with `Idle warmer baked a node the exact query cannot use`.

- [ ] **Step 3: Implement the shared predicate and deduplication**

Use the same conditions in both paths:

```js
const blockerGeometry = (node) => {
  const geometry = node.geometry;
  return geometry && geometry.faces && geometry.faces.length && !geometry.matrixGlyph && !geometry.surfaceOverlay
    && !geometry.mirrorRippleOnly && !node.mirrorRippleOnly && !node.mirrorPortal
    && !(node.smokeOpacity < 1) && !(renderOpts?.birdsEyeCutaway && geometry.cutawayHide);
};
```

`visit` keeps its existing early `!node.visible || node.cameraHidden` guard and calls `blockerGeometry(node)`. Idle `collect` skips `!node.visible || node.cameraHidden`, checks `blockerGeometry(node)`, and inserts geometry into `new Set()` rather than an array.

- [ ] **Step 4: Verify green**

Run: `npm run test:unit`
Expected: all checks pass with no console errors.

- [ ] **Step 5: Commit and open the draft PR**

```bash
git add src/js/character-visibility.js test/run.mjs docs/superpowers
git commit -m "Stop idle visibility warming from baking non-blockers"
gh pr create --draft --repo OogaBoogaX/oogaboogaland --base rock --head hotpixelgroup:perf/covered-visibility --title "Reduce covered-view visibility and overlay cost" --body "Draft: implementation and A/B evidence in progress."
```

---

### Task 2: Bound overlay backing pixels

**Files:**
- Modify: `src/js/fx.js:298-336,448-459`
- Modify: `test/run.mjs` adaptive-quality/overlay checks

**Interfaces:**
- Consumes: CSS width/height, device DPR, and the active WebGL tier DPR from `BL.glRenderer.QUALITY`.
- Produces: `BL.fx.overlayDpr(width, height, deviceDpr, tierDpr)`, a pure ratio capped at 2.6 million backing pixels.

- [ ] **Step 1: Add the failing regression**

Load the real `fx.js` with its existing minimal BL fixture and assert:

```js
const capped = BL.fx.overlayDpr(3840, 2160, 2, 1.5);
check(Math.abs(3840 * 2160 * capped * capped - 2.6e6) < 1, "Overlay exceeds the pixel budget");
check(BL.fx.overlayDpr(390, 844, 3, 1.25) === 1.25, "Overlay ignores the tier DPR");
check(BL.fx.overlayDpr(390, 844, 3, 1.5) === 1.5, "Overlay ignores the device DPR");
```

- [ ] **Step 2: Verify the regression fails**

Run: `npm run test:unit`
Expected: FAIL because `BL.fx.overlayDpr` is not a function.

- [ ] **Step 3: Implement the pure helper and use it in `drawOverlay`**

```js
const OVERLAY_PIXELS = 2.6e6;
const overlayDpr = (width, height, deviceDpr, tierDpr) => Math.min(deviceDpr, tierDpr,
  Math.sqrt(OVERLAY_PIXELS / Math.max(1, width * height)));
```

In `drawOverlay` use:

```js
const dpr = overlayDpr(w, h, window.devicePixelRatio || 1,
  BL.glRenderer.QUALITY[renderer.quality]?.dpr || 1);
```

Export `overlayDpr` beside `create` on `BL.fx`.

- [ ] **Step 4: Verify green and desktop/phone overlay behavior**

Run: `npm run test:unit`
Expected: all checks pass. Run the targeted hub browser checks only after Task 3's A/B setup is complete; backing pixels must not exceed 2.6 million and speech/nameplates remain readable.

- [ ] **Step 5: Commit**

```bash
git add src/js/fx.js test/run.mjs
git commit -m "Cap overlay backing pixels with the active quality tier"
```

---

### Task 3: Measure and review before changing exact boundaries

**Files:**
- Create: `docs/covered-visibility-evidence.md`
- Modify: PR description through `gh pr edit`

**Interfaces:**
- Consumes: Tasks 1–2 and `scripts/profile-covered-movement.mjs`.
- Produces: baseline/head frame metrics and a keep/revise decision for any further boundary algorithm work.

- [ ] **Step 1: Build and check changed files**

```bash
npm run build
node --check src/js/character-visibility.js
node --check src/js/fx.js
node --check test/run.mjs
```

Expected: clean build and no syntax errors.

- [ ] **Step 2: Run focused correctness checks**

```bash
npm run test:unit
ONLY="wall movement performance" node test/run.mjs --browser-only hub
```

Expected: unit tier passes. Record, but do not weaken, the wall-performance result. Do not rerun it into a second consecutive failure; use `scripts/profile-covered-movement.mjs` for the subsequent A/B investigation.

- [ ] **Step 3: Capture head profile under the baseline workload**

```bash
CHROME_ARCH=arm64 node scripts/profile-covered-movement.mjs --cpu
```

Record both movement rows, hotspot ranking, `objectGuides.stats`, browser, DPR, viewport, and baseline/head SHAs. Compare against baseline `untracked/covered-movement-profile.json` copied to `untracked/covered-movement-baseline.json` before this run.

- [ ] **Step 4: Write evidence and update the draft PR**

Include exact before/after values, methodology, checks, and remaining gaps. Mark ready only if the improvement is material and reproducible; otherwise keep draft and investigate the remaining projected-boundary cost rather than claiming completion.


---

### Task 4: Prepare projected boundaries only when the lazy sight query reaches them

**Files:**
- Modify: `src/js/object-guides.js:1695-1815`
- Modify: `src/js/scene-hub.js:12790-12798`
- Modify: `test/run.mjs` existing owner-boundary fixture

**Interfaces:**
- Consumes: existing exact eager `ownerBoundaryAt(owner,x,y,z,dx,dy,dz)` behavior and entry hit hints.
- Produces: optional final `lazy` boolean. Default `false` retains eager preparation and existing tests. The hub's sight-guide options pass `true`. Lazy mode still uses identical triangle/depth/clip predicates.

- [ ] **Step 1: Add an eager-oracle regression**

In the existing near-boundary fixture, create a second registry over the same geometry. For the same world/camera and query points, compare default eager calls with `ownerBoundaryAt(...,true)` calls. Require identical booleans and fewer `boundaryBuilds` after a coherent second lazy query. Keep every existing eager assertion unchanged.

- [ ] **Step 2: Verify the regression fails**

Run: `npm run test:unit`
Expected: FAIL because the current implementation eagerly prepares all visible owner parts and has no lazy final argument.

- [ ] **Step 3: Implement lazy preparation**

Propagate a `lazy` flag through `ownerBoundaryAt`, `ownerHit`, and `entryBoundaryHit`. In eager mode retain the existing group-wide `boundaryBounds` and `indexBoundary` calls. In lazy mode:

- compute only `endDepth` up front;
- try `group.boundaryEntries[side]` before other parts;
- call `boundaryBounds(entry)` only when `entry.boundaryStamp !== collectStamp` and the exact entry query is reached;
- do not build `indexBoundary(group)` until/unless a separate later task proves it beneficial;
- keep the exact same `ownerHit` boolean result and depth/triangle/clip tests.

In `scene-hub.js`, wrap the existing function once in `guideOptions` so its sight path passes `true` without allocating a closure per query.

- [ ] **Step 4: Verify correctness and profile**

Run `npm run test:unit` and require all checks to pass. Then run `CHROME_ARCH=arm64 node scripts/profile-covered-movement.mjs --cpu` and compare against the preserved baseline. Keep lazy mode only if exact results match and both preparation count and delivered frame metrics improve materially; otherwise revert it and record the negative result.

- [ ] **Step 5: Commit if the oracle and performance evidence pass**

```bash
git add src/js/object-guides.js src/js/scene-hub.js test/run.mjs
git commit -m "Prepare covered-view boundaries on demand"
```


---

### Task 5: Gate detailed boundary preparation with conservative projected AABBs

**Files:**
- Modify: `src/js/object-guides.js` entry registration, `indexBoundary`, `entryBoundaryHit`, `ownerBoundaryAt`
- Modify: `src/js/scene-hub.js:12794`
- Modify: `test/run.mjs` existing owner-boundary fixture

**Interfaces:**
- Consumes: reverted Task 4, default eager behavior, and the hub's optional final `deferTriangles` argument.
- Produces: per-entry `coarseBounds`/`coarseStamp`, computed from eight transformed local-AABB corners. Default `deferTriangles=false` retains all eager behavior. Hub sight options pass `true`.

- [ ] **Step 1: Add the exact-oracle regression**

For the same near-boundary points, compare eager results with `ownerBoundaryAt(...,true)`. Require identical booleans, active owner grids in both paths, and fewer detailed `boundaryBuilds` after a coherent second lazy query. Preserve all original eager assertions.

- [ ] **Step 2: Verify the regression fails**

Run `npm run test:unit`; expected FAIL because detailed preparation remains eager and the optional argument has no effect.

- [ ] **Step 3: Implement conservative coarse gating**

For each entry, transform its eight local AABB corners by `cameraView * entry.world`. Project corners with positive depth; if the box crosses the near plane use an unbounded rectangle, and if every corner is behind it use an empty rectangle. Store this per `collectStamp` in allocation-free reused fields.

Default mode retains the current full `boundaryBounds` group preparation. Coarse-lazy mode prepares only `coarseBounds` up front and uses those conservative rectangles for `indexBoundary`. `entryBoundaryHit` first rejects against `coarseBounds`, then calls full `boundaryBounds` only for a candidate. Existing detailed bounds, grid traversal, hit hints, triangle/depth/clip predicates, and booleans stay unchanged.

- [ ] **Step 4: Verify correctness and profile**

Run `npm run test:unit`, then `CHROME_ARCH=arm64 node scripts/profile-covered-movement.mjs --cpu`. Keep only if exact results match, detailed builds fall, owner grids remain active, and delivered frame metrics do not regress. Revert on a material regression.

- [ ] **Step 5: Commit if both gates pass**

```bash
git add src/js/object-guides.js src/js/scene-hub.js test/run.mjs
git commit -m "Gate detailed boundary preparation with coarse bounds"
```


---

### Task 6: Share one BVH between object guides and character visibility

**Files:**
- Modify: `src/js/character-visibility.js` public export only
- Modify: `src/js/object-guides.js:338-355`
- Modify: `test/run.mjs` existing BVH/object-guide fixtures

**Interfaces:**
- Consumes: `BL.characterVisibility.meshOf(geometry)`, returning `{vertices,indices,order,nodes}` with nodes `{box,from,to,left,right}`.
- Produces: object-guide typed columns `bounds,left,right,starts,counts,indices,triangleIndices` adapted from that same mesh without rebuilding triangles or BVHs.

- [ ] **Step 1: Add shared-identity and exact-ray regressions**

In the existing object-guide fixture, assert that the descriptor's `indices` and `triangleIndices` are the exact same typed arrays as `BL.characterVisibility.meshOf(geometry).order` and `.indices`. Exercise the existing brute-force visibility and boundary oracles unchanged. Before implementation this identity assertion must fail.

- [ ] **Step 2: Verify the regression fails**

Run `npm run test:unit`; expected FAIL on BVH identity, while independent ray results may already agree.

- [ ] **Step 3: Implement the adapter**

Export `meshOf` beside `create` on `BL.characterVisibility`. In `object-guides.geometryOf`, keep all existing edge/sample/cover-face construction, but replace its independent triangle BVH build with:

```js
const shared = BL.characterVisibility.meshOf(geometry), count = shared.indices.length / 3;
const bounds = [], left = [], right = [], starts = [], counts = [];
for (const node of shared.nodes) {
  bounds.push(...node.box);
  left.push(node.left); right.push(node.right);
  starts.push(node.from); counts.push(node.to - node.from);
}
const indices = shared.order, triangleIndices = shared.indices;
```

Use those arrays in the existing `cached` descriptor, retaining `coverFaces`, `triangleCoverFaces`, samples, lines, and `sphere`. The character builder's leaf size may differ from the old object-guide builder; correctness is judged by the existing exact oracles, not node-for-node layout.

- [ ] **Step 4: Verify green and profile**

Run `npm run test:unit`, then `CHROME_ARCH=arm64 node scripts/profile-covered-movement.mjs --cpu`. Require all exact oracles to pass and a material reduction in on-demand `build` samples without a frame-time regression. Otherwise revert and record why sharing is unsuitable.

- [ ] **Step 5: Commit if both gates pass**

```bash
git add src/js/character-visibility.js src/js/object-guides.js test/run.mjs
git commit -m "Share visibility BVH construction between query systems"
```
