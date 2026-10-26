# Foliage levels of detail (task 2.3)

The later hub foliage redesign replaces the four ordinary tree and three bush variants with closed, faceted clumps. Medium keeps every lobe and reduces its tessellation; the existing far atlas uses that medium model. Flowers and berries keep their attachment positions across the two mesh levels. Tree landing support follows the new visible crowns. Sight queries use an eight-triangle core buried inside each crown group; decorative outer lobes do not add visibility-query work. The other foliage families retain their leaf-based models. Measurements below describe the earlier implementation, not this redesign; no new FPS or memory result is claimed here.

Trees, bushes, palms, rainforest canopies, ferns, shrubs and three undergrowth families now own three render meshes. The high source, collision geometry, climb data and random sequence are unchanged. Medium keeps complete coarse leaf groups; far uses three orthogonal two-sided silhouette planes (12 triangles) with a 384×128 atlas. Atlas painting performs no pixel readback. `renderer.prepareScene(liveSet)` prepares far-LOD atlases behind the entry fade before first visible use; Canvas uses the high source. The measurements below predate this preparation hook and include its earlier first-draw atlas work.

The WebGL collector selects per ordinary instance, groups instances by selected mesh and keeps numeric hysteresis state in weak maps. Projection bounds include depth extent, off-axis and blended/orthographic views, shear, scale and wind. High thresholds are 120/150 px and 24/32 px; medium 150/185 and 30/40; low 180/220 and 36/46. Near-plane intersections retain high. Explicit batches and aperture wrappers retain their source. An owner check prevents spread wrappers from releasing another mesh's alternatives. Hidden alternatives participate in cache liveness, context restoration and disposal. Ordinary vertex/shadow shader bytes stay unchanged; only far silhouettes use an alpha-tested shadow program.

Medium triangle counts range from 22–44% of original trees/bushes/palms/canopies; the palm trunk and nuts are retained. Undergrowth keeps 44–54% where preserving blade shape costs more. Far is 12 triangles per family. The brief's 25%/5% ratios are guides, not achieved uniform ratios.

One ARM64 Chrome 155 game used the Apple M1 Pro Metal renderer, 1440×900, DPR 1, the pile camera, 8 s warmup and 5 s measurement per tier. Before is 899e437; after is the final staged source (SHA in JSON). Dynamic glyph phases and crew vary; no deterministic pixel or general FPS claim follows from these samples.

| Tier | Main triangles before → after | Main draws before → after | FPS before → after |
|---|---:|---:|---:|
| high |2,717,734 →2,577,494|479.4 →484.5|60.00 →60.00|
| medium |2,658,387 →2,541,199|479.2 →485.2|60.00 →57.61|
| low |2,441,554 →2,265,128|479.1 →473.5|60.00 →60.00|

Medium had 12 frames over 33 ms after versus 0 before; this sample is a regression, not a claimed speedup. CPU render time was 3.09 → 3.04 ms high, 2.53 → 2.62 medium and 2.58 → 2.74 low. Upload traffic remains about one call per frame. These count hooks create records and their heap-drop proxy must not be used as GC evidence.

A second rainforest-overlook A/B uses the same build, turning off only foliage selection for the full-source reference. Main triangles high 1,236,639 → 1,175,439; medium 1,178,982 → 1,092,961; low 940,694 → 850,641. FPS was 60/59.8/60 in both runs. This is a render-count comparison, not a memory comparison: both builds construct alternatives.

The pile-view targets (<2M high,<1.2M low) are **not met**. A separate actual Hub draw inventory found Matrix glyph batches alone contribute about 1.31–1.32M triangles. They are separate boxes with 5 mm gaps, so coplanar greedy merging would fill real gaps. Low cannot meet 1.2M through foliage reduction alone. A conservative glyph-depth alternative will be measured separately while retaining all glyph cells and close voxel geometry.

Validation: 275/275 global and focused Hub lifetime/Canvas tour checks passed. Native isolated core checks found 12/12 close RGBA images identical to the high reference, stable hysteresis, correct alpha shadows, 3 real context restorations and zero GPU objects after disposal. Projection, ownership, model/hash, atlas and PR 193/267 compatibility oracles are recorded in the JSON. The isolated visual fixtures predate the final radius tightening, owner guard and five undergrowth additions; source-specific later oracles cover those changes. The stopped Canvas Timechain crossing was not rerun; this is not a full-suite pass.

Visual differences: medium reduces leaf rosettes and reveals more dark canopy core when enlarged; far has a three-plane silhouette. The screenshots in untracked/performance/phase-2-3-{before,final,pool-full,pool-lod}-{high,medium,low}.png cover all tiers. Close high source bytes are identical, but no-popping at every normal camera distance is still a maintainer play-test item. Quantitative data and exact source hashes are in `untracked/performance/evidence/performance-foliage-evidence.json` (ignored local evidence, not committed).
