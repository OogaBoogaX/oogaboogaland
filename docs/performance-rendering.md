# Rendering evidence

All rows use one focused native Chrome 155 tab at 1440×900 on AC power, M1 Pro/ANGLE Metal, DPR 1, noon/day 80, feeds off, pile preset. The automatic governor remains enabled; each recorded tier stayed selected. `scripts/profile-rendering.mjs` records five seconds per tier, groups submitted work by framebuffer and viewport, and saves three-tier screenshots under `untracked/performance`. Its GPU hooks allocate diagnostic bookkeeping: their heap-drop readings are **not** valid GC acceptance measurements. Use the separate clean walking sampler for allocation claims. Timings here are instrumented, vsync-limited, and cannot establish spare GPU capacity.

## 2.1 Depth prepass


Revised after review: the tier change was measured only on Apple silicon, where the named-GPU rule already skipped the prepass, so it gave no gain there and could only cost other GPUs late-Z overdraw (the mesh shader discards). Every tier keeps the prepass again unless the GPU is named Apple silicon; `prepass=0|1` still overrides. The note and table below record the original change and its historical draw counts, before that correction; they have not been remeasured for the current policy.
Low and medium disable the prepass on every GPU. High retains the named-Apple-silicon policy. `?debug=1&prepass=0|1` overrides ordinary geometry in every tier; rigs retain their dedicated path. Existing classification coverage now also tests tier/override/rig policy. Global checks: 268/268.

| Tier | Before FPS | After FPS | Before total draws/frame | After total draws/frame |
|---|---:|---:|---:|---:|
| High |60.00|60.00|712.2|712.1|
| Medium |60.00|60.00|647.1|647.1|
| Low |60.00|60.00|620.4|619.9|

Default M1 behavior was already off, so these results correctly show no default gain. A separate medium `prepass=1` run submits about 908 main-target draws/frame; ordinary medium submits about 479. Both deliver 60 FPS on this rig. This proves the override works on the available GPU; **Intel/NVIDIA/AMD/Android hardware acceptance remains unmeasured**. Three-tier screenshots were inspected: no new depth artifacts. Open PR 267 GPU packing and 193 video patches still apply independently; neither feature was copied.

## 2.2 Reflection capture

The small 129×96 hub capture in the real baseline is the main mirror, not `reflectorNodes` (Factory/Bifrost). Changing only the named loop left the measured hub work unchanged. The same tier policy now covers both paths: low keeps authored pane materials without captures; medium needs at least 150×150 CSS pixels and captures every frame while readable, using large, reflection-frustum-visible instances and character parts, excluding sway/foliage, image surfaces and projective geometry. Medium before its first capture or below readable size, and low throughout, draw the authored face. Existing instance buffers are reused through contiguous run offsets and restored in `finally`. High keeps its full capture set and cadence for planar mirrors and reflectors, but environment cube captures (the shards) take the reduced set on every tier, high included. The reduced set keeps every geometry marked `characterPart` whatever its size: caveman parts, both weapon skins, head swaps and tint twins, swag, gorilla forms and clothing, and the worn jetpack and its flame; the unit check `mirror character ownership` runs the renderer's own predicate over that builder output.

**Historical sample:** the capture counts, triangles, draws and frame timings below predate `a9bc6b2` and `58fddb6`. That version used medium cadence 2 and a clear-pane fallback; those two behaviors are superseded by the current policy above. These figures have not been remeasured on the current head.

At pile, the before medium reflection submitted up to 2,170,341 triangles on 150/301 frames; low up to 2,168,889 on 101/301 frames. After, both submitted **zero** capture frames because the pane is below threshold. High captured every frame with up to 2,170,461 triangles (before 2,170,497), and all tiers remained 60 FPS. The clear-pane low/medium appearance in those images belongs to that historical sample; the current fallback is the authored face. Three-tier images are retained next to the raw runs.

At a close, readable mirror, that historical medium run captured 146/291 frames with **496,533 peak triangles per capture**, versus the old full-set work of roughly 2.17 million at the other view. The different cameras preclude treating those as a controlled percentage improvement. The required 250,000 budget was **unmet in that sample**; current-policy capture cost has not been remeasured, and the large terrain/prop meshes survive the reduction. This is carried forward for geometry work, not averaged with the skipped cadence frames. Close-view measured FPS 58.01 includes one > 33 ms frame; it does not establish the 60 FPS target there.

The original terrain already uses greedy meshing by material, direction, Matrix/cave and cutaway metadata. Task 2.4's claim that faces are unmerged is false in this checkout. Removing the path/window cell boundaries would break authored curved cutaways. Further reduction needs a separate coarse render representation, rather than another greedy pass over identical inputs.
