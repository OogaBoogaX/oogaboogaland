# Performance improvement program design

## Baseline and authorship

- Baseline: upstream `rock` at `4387b8914473425ef0a2b6c881865d12be4f25d4`.
- Implementation occurs in isolated worktrees; the maintainer's dirty checkout is never edited.
- Commits use Harry Beckwith `<harry@hotpixelgroup.com>`; pull requests use the authenticated `hotpixelgroup` account.
- Existing failures are recorded, not weakened or omitted. The baseline unit tier passes 404/404; the baseline wall-performance lane passes 1/3.

## Approaches considered

1. **Independent, metric-gated PRs (selected).** Each PR has a narrow optimization, correctness checks, and a reproducible before/after measurement. Draft first; ready only after evidence supports the claim.
2. **One monolithic performance PR.** Rejected: overlapping renderer, scene, and lifecycle changes would make regressions and attribution difficult.
3. **Measurement-only recommendations.** Retained as a fallback for an idea that cannot demonstrate a correctness-preserving improvement; it will not be represented as a completed optimization.

## PR sequence

1. Covered-view visibility and overlay sizing.
2. Allocation and transform hot paths.
3. Transition construction and BVH building.
4. Cold start, deferred payload, and constrained audio loading.
5. Scene and GPU retention attribution and bounding.
6. Adaptive-quality robustness and visitor controls.
7. Low/medium postprocessing waste.
8. Reflection/coarse geometry, only if current measurements justify it.
9. Lifecycle, background operation, and bounded network requests.

Independent PRs may be implemented in parallel when their files and benchmark lanes do not contend. Each branch starts from the same upstream baseline; later integration conflicts are resolved without combining performance claims.

## Measurement contract

Every PR description contains:

- baseline and head revisions;
- hardware, browser, viewport/DPR, build, and relevant flags;
- exact benchmark command and scenario;
- before/after median and distribution where repeated runs are available;
- frame pacing or task duration, not only average FPS;
- memory, allocation, network, or payload evidence where relevant;
- correctness commands and counts, including known baseline failures;
- limitations and any unverified hardware paths.

No percentage improvement is reported without numerator and denominator. No sampler result is presented as exact allocation accounting. No first-use warming result is presented as steady state. No two-tour growth result is called an unbounded leak without a longer plateau test. No mobile claim is made from desktop measurements.

## Correctness and completion

- Preserve the content policy, dependency-free classic JavaScript, both renderers, visibility semantics, collision results, and scene leave contracts.
- Add a focused failing regression before each behavioral fix where practical.
- Run build, changed-file syntax checks, the unit tier, and targeted scene/performance checks appropriate to the PR.
- Do not rerun a check the ledger has marked STOP except under an explicit maintainer-authorized investigation with new evidence.
- A PR is ready only when its implementation is complete, its targeted checks pass, and its measured improvement is material and reproducible. Otherwise it remains draft with the negative or inconclusive result documented.
