# Foliage levels of detail (task2.3)

Trees, bushes, palms, rainforest canopies, ferns, shrubs and three undergrowth families now own three render meshes. The high source, collision geometry, climb data and random sequence are unchanged. Medium keeps complete coarse leaf groups; far uses three orthogonal two-sided silhouette planes (12 triangles) with a 384×128 atlas. Atlas painting is lazy and performs no pixel readback. Canvas uses the high source.

The WebGL collector selects per ordinary instance, groups instances by selected mesh and keeps numeric hysteresis state in weak maps. Projection bounds include depth extent, off-axis and blended/orthographic views, shear, scale and wind. High thresholds are120/150px and24/32px; medium150/185 and30/40; low180/220 and36/46. Near-plane intersections retain high. Explicit batches and aperture wrappers retain their source. An owner check prevents spread wrappers from releasing another mesh's alternatives. Hidden alternatives participate in cache liveness, context restoration and disposal. Ordinary vertex/shadow shader bytes stay unchanged; only far silhouettes use an alpha-tested shadow program.

Medium triangle counts range from22–44% of original trees/bushes/palms/canopies; the palm trunk and nuts are retained. Undergrowth keeps44–54% where preserving blade shape costs more. Far is12 triangles per family. The brief's25%/5% ratios are guides, not achieved uniform ratios.

One ARM64 Chrome155 game used the Apple M1 Pro Metal renderer,1440×900, DPR1, the pile camera,8s warmup and5s measurement per tier. Before is899e437; after is the final staged source (SHA in JSON). Dynamic glyph phases and crew vary; no deterministic pixel or general FPS claim follows from these samples.

| Tier | Main triangles before → after | Main draws before → after | FPS before → after |
|---|---:|---:|---:|
| high |2,717,734 →2,577,494|479.4 →484.5|60.00 →60.00|
| medium |2,658,387 →2,541,199|479.2 →485.2|60.00 →57.61|
| low |2,441,554 →2,265,128|479.1 →473.5|60.00 →60.00|

Medium had12 frames over33ms after versus0 before; this sample is a regression, not a claimed speedup. CPU render time was3.09→3.04ms high,2.53→2.62 medium and2.58→2.74 low. Upload traffic remains about one call per frame. These count hooks create records and their heap-drop proxy must not be used as GC evidence.

A second rainforest-overlook A/B uses the same build, turning off only foliage selection for the full-source reference. Main triangles high1,236,639→1,175,439; medium1,178,982→1,092,961; low940,694→850,641. FPS was60/59.8/60 in both runs. This is a render-count comparison, not a memory comparison: both builds construct alternatives.

The pile-view targets (<2M high,<1.2M low) are **not met**. A separate actual Hub draw inventory found Matrix glyph batches alone contribute about1.31–1.32M triangles. They are separate boxes with5mm gaps, so coplanar greedy merging would fill real gaps. Low cannot meet1.2M through foliage reduction alone. A conservative glyph-depth alternative will be measured separately while retaining all glyph cells and close voxel geometry.

Validation:275/275 global and focused Hub lifetime/Canvas tour checks passed. Native isolated core checks found12/12 close RGBA images identical to the high reference, stable hysteresis, correct alpha shadows,3 real context restorations and zero GPU objects after disposal. Projection, ownership, model/hash, atlas and PR193/267 compatibility oracles are recorded in the JSON. The isolated visual fixtures predate the final radius tightening, owner guard and five undergrowth additions; source-specific later oracles cover those changes. The stopped Canvas Timechain crossing was not rerun; this is not a full-suite pass.

Visual differences: medium reduces leaf rosettes and reveals more dark canopy core when enlarged; far has a three-plane silhouette. The screenshots in untracked/performance/phase-2-3-{before,final,pool-full,pool-lod}-{high,medium,low}.png cover all tiers. Close high source bytes are identical, but no-popping at every normal camera distance is still a maintainer play-test item. Quantitative data and exact source hashes are in performance-foliage-evidence.json.
