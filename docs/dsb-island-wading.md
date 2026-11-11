# DSB Land — island-wide shallow wading

Upstream integration branch: `feature/dsb-island-wading-upstream-20261111` in `YellowBrokeIt/oogaboogaland`.
Pinned upstream base: `2d7c396ac7c4c907201b5d46862a66b1d4fb39b9` from `OogaBoogaX/oogaboogaland:rock`.
Original implementation was validated in `feature/dsb-island-wading` and merged into the fork's `rock`; its production shoreline modules are transferred unchanged here.

## Scope and constraints

Extend the existing **shallow walking/wading** system to every accessible DSB shoreline, **not swimming**. Keep the working harbor (coast polygon sectors 22–28) and the rocky rear of Olympus (31–33 and 0–5) excluded. The remaining 18 of 34 sectors share a gradual underwater shelf, with a 2 m taper where accessible sectors meet exclusions.

No new sand beaches, no beach behind Olympus, no changes to the terrain above water, inland roads, building locations, piers, player controls, water level, texture budget, or interiors. Beach-only stronger swash remains at Chora. The shore water is shallow; existing depth constraints block users entering deep water.

## Files

- `src/js/dsb-coast.js`: nearest coast segment, eligible access mask, boundary taper, original beach treatment.
- `src/js/dsb-geography.js`: grade only offshore seabed and keep terrain rendering and collision grounded in the same mesh. Harbor deck elevations remain.
- `src/js/dsb-water.js`: subtle water optics for eligible rocky coasts and bounded shoreline tessellation for Canvas.
- `test/dsb-island-wading.test.mjs`: island sectors, walk-and-return, deep-water stop, piers, 8,957-point inland invariant, ocean optics and clipping.
- `test/dsb-island-browser.mjs`: repeatable desktop/phone smoke checks and screenshots of selected coasts.
- `package.json`: include the dedicated regression in the existing browser-free unit test lane.

## Verification

The original isolated feature passed GitHub Actions shoreline validation, browser-free unit lane, production build, and desktop/phone Chromium smoke check:
https://github.com/YellowBrokeIt/oogaboogaland/actions/runs/43042202670

This integration branch is based on a newer upstream commit. That old green run is **not** a substitute for fresh CI/review on this integration branch. Before merge, require fresh `npm run test:unit`, `npm run build`, and browser navigation/visual validation against the integrated page.
