# Rendering evidence

All rows use one focused native Chrome155 tab at1440×900 on AC power, M1 Pro/ANGLE Metal, DPR1, noon/day80, feeds off, pile preset. The automatic governor remains enabled; each recorded tier stayed selected. `scripts/profile-rendering.mjs` records five seconds per tier, groups submitted work by framebuffer and viewport, and saves three-tier screenshots under `untracked/performance`. Its GPU hooks allocate diagnostic bookkeeping: their heap-drop readings are **not** valid GC acceptance measurements. Use the separate clean walking sampler for allocation claims. Timings here are instrumented, vsync-limited, and cannot establish spare GPU capacity.

## 2.1 Depth prepass

Low and medium disable the prepass on every GPU. High retains the named-Apple-silicon policy. `prepass=0|1` overrides ordinary geometry in every tier; rigs retain their dedicated path. Existing classification coverage now also tests tier/override/rig policy. Global checks:268/268.

| Tier | Before FPS | After FPS | Before total draws/frame | After total draws/frame |
|---|---:|---:|---:|---:|
| High |60.00|60.00|712.2|712.1|
| Medium |60.00|60.00|647.1|647.1|
| Low |60.00|60.00|620.4|619.9|

Default M1 behavior was already off, so these results correctly show no default gain. A separate medium `prepass=1` run submits about908 main-target draws/frame; ordinary medium submits about479. Both deliver60FPS on this rig. This proves the override works on the available GPU; **Intel/NVIDIA/AMD/Android hardware acceptance remains unmeasured**. Three-tier screenshots were inspected: no new depth artifacts. Open PR267 GPU packing and193 video patches still apply independently; neither feature was copied.
