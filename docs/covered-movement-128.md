# Covered movement profiling helper: issue #128

`scripts/profile-covered-movement.mjs` runs the suite's own `wallPerformance` workload (ordinary and covered movement during a donation, at 1920x1080) in one Chrome, with the suite's acceptance checks, and writes what it saw. It changes no engine behaviour and no check.

Run `npm run build`, then `node scripts/profile-covered-movement.mjs`. Add `--cpu` to sample the CPU as well. Sampling adds overhead, so don't compare frame rates between runs with and without it.

It writes, under the ignored `untracked/`:

- `covered-movement-profile.json`: the capture time, `workloadSha256` (the SHA-256 of the suite's workload slice, from `const wallPerformance =` to `const adaptiveQualityChecks =`, the same field #194's captures record), `suiteSha256`, `pageSha256`, the browser version, both rows with their details, the object-guide stats, the hot list and the browser logs.
- `covered-movement.cpuprofile`, with `--cpu`: open it in Chrome DevTools' Performance panel. The hot list in the JSON sums self samples by function (file, line and column) before ranking, and `paths` counts the call paths merged into each row.

It exits non-zero when either row fails or the browser logged anything. Captures stay out of the tree: their timings belong to one machine and one moment, and console logs may hold `file://` paths. Run it on AC power with no other browser work. A changed `workloadSha256` means the suite's workload changed, so captures from either side of the change aren't comparable.
