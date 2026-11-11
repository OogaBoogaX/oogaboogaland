# DSB Land — shallow wading across accessible coastlines

DSB Land extends its existing shore walking (not swimming) to all **18 eligible sectors** of the 34-sector authored coast polygon. The **harbor** (segments 22–28) and **rear Olympus cliffs** (segments 31–33 and 0–5) remain excluded, with a two-metre shelf taper where eligible segments meet the excluded regions.

The original Chora beach is unchanged. Rocky coasts receive shallow seabed grading and subdued shoaling optics, **not new beaches**. Body-width depth and slope gates stop movement into deep water. Dry-land terrain, the harbor's 1.35 m deck support, inland routes, buildings, and water level remain unchanged.

## Source changes

- `src/js/dsb-coast.js`: authored coastline eligibility and boundary taper
- `src/js/dsb-geography.js`: matching seabed and body-wide depth gate; one scratch object per land build avoids garbage in the walking hot path
- `src/js/dsb-water.js`: shallow rocky-coast optics and bounded Canvas shoreline triangles

## Test integration

All shoreline assertions are registered with the existing `test/run.mjs` regression ledger and browser driver. No extra test runner, dependency, workflow, or screenshot path is introduced.

- `npm run test:unit` — global rules: all 34 sectors, body-width walking in/out, deep-water stops, 42 distributed shore routes, exclusions, harbor support, original 8,957-sample dry-land fingerprint, shoreline optics and Canvas budget
- `ONLY="DSB shoreline" node test/run.mjs --browser-only dsb` — actual built page in desktop and phone-sized Chrome sessions; verifies navigation through Chora, east/west rocky coasts, harbor and Olympus
- `node test/run.mjs water-unit` — pre-existing detailed water, FFT, ripple and pier route regressions, adapted so approved new offshore depths do not invalidate protection for unchanged dry land
- `npm run build` — rebuild the production page

Source code and tests are inside `feature/dsb-island-wading-upstream-20261111` and are proposed as PR #600 against upstream `rock`. The fork's `feature/dsb-land-master` preview remains untouched. Production is only updated after upstream accepts a merge and its maintainers deploy.
