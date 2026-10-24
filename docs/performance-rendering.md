# Rendering evidence

All rows use one focused native Chrome155 tab at1440×900 on AC power, M1 Pro/ANGLE Metal, DPR1, noon/day80, feeds off, pile preset. The automatic governor remains enabled; each recorded tier stayed selected. `scripts/profile-rendering.mjs` records five seconds per tier, groups submitted work by framebuffer and viewport, and saves three-tier screenshots under `untracked/performance`. Its GPU hooks allocate diagnostic bookkeeping: their heap-drop readings are **not** valid GC acceptance measurements. Use the separate clean walking sampler for allocation claims. Timings here are instrumented, vsync-limited, and cannot establish spare GPU capacity.

## 2.1 Depth prepass


Revised after review: the tier change was measured only on Apple silicon, where the named-GPU rule already skipped the prepass, so it gave no gain there and could only cost other GPUs late-Z overdraw (the mesh shader discards). Every tier keeps the prepass again unless the GPU is named Apple silicon; `prepass=0|1` still overrides. The note below records the original change.
Low and medium disable the prepass on every GPU. High retains the named-Apple-silicon policy. `prepass=0|1` overrides ordinary geometry in every tier; rigs retain their dedicated path. Existing classification coverage now also tests tier/override/rig policy. Global checks:268/268.

| Tier | Before FPS | After FPS | Before total draws/frame | After total draws/frame |
|---|---:|---:|---:|---:|
| High |60.00|60.00|712.2|712.1|
| Medium |60.00|60.00|647.1|647.1|
| Low |60.00|60.00|620.4|619.9|

Default M1 behavior was already off, so these results correctly show no default gain. A separate medium `prepass=1` run submits about908 main-target draws/frame; ordinary medium submits about479. Both deliver60FPS on this rig. This proves the override works on the available GPU; **Intel/NVIDIA/AMD/Android hardware acceptance remains unmeasured**. Three-tier screenshots were inspected: no new depth artifacts. Open PR267 GPU packing and193 video patches still apply independently; neither feature was copied.

## 2.2 Reflection capture

The small129×96 hub capture in the real baseline is the main mirror, not `reflectorNodes` (Factory/Bifrost). Changing only the named loop left the measured hub work unchanged. The same tier policy now covers both paths: low keeps authored pane materials without captures; medium needs at least150×150 CSS pixels and uses cadence2 plus large, reflection-frustum-visible instances, excluding sway/foliage, image surfaces and projective geometry. Existing instance buffers are reused through contiguous run offsets and restored in `finally`. High retains its previous capture set and cadence.

At pile, the before medium reflection submitted up to2,170,341 triangles on150/301 frames; low up to2,168,889 on101/301 frames. After, both submit **zero** capture frames because the pane is below threshold. High still captures every frame with up to2,170,461 triangles (before2,170,497), and all tiers remain60FPS. The clear-pane low/medium appearance is an intentional quality difference. Three-tier images are retained next to the raw runs.

At a close, readable mirror, medium captures146/291 frames with **496,533 peak triangles per capture**, versus the old full-set work of roughly2.17million at the other view. The different cameras preclude treating those as a controlled percentage improvement. The required250,000 budget is **still unmet**; the large terrain/prop meshes survive the reduction. This is carried forward for geometry work, not averaged with the skipped cadence frames. Close-view measured FPS58.01 includes one>33ms frame; it does not establish the60FPS target there.

The original terrain already uses greedy meshing by material, direction, Matrix/cave and cutaway metadata. Task2.4's claim that faces are unmerged is false in this checkout. Removing the path/window cell boundaries would break authored curved cutaways. Further reduction needs a separate coarse render representation, rather than another greedy pass over identical inputs.
