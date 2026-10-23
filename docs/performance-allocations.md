# Walking allocations (task3.2)

The ordinary clear view no longer emits object contours that sight-guides will not read. The existing15Hz sight recompute materializes them only when needed; blocker membership and transforms stay current every frame. Deferred actor/owner references are cleared on emission, refresh and disposal. Sleeping Ooga/gorilla mark occlusion shares that cadence, with immediate invalidation for camera jumps, projection/mode/cutaway/portal changes, zero-dt inspection and bed occupant changes. Mark motion and projection still run every frame.

Several brief premises were already implemented: object outlines use cached WeakMap bakes and pooled typed lines; terrain/NPC boolean probes have no returned vectors or per-call closures; scene matrices use output parameters; rock/banana/sight guides already run at15Hz. No duplicate rewrite was added.

One focused1920×1080 Chrome155 tab, Metal/M1Pro, DPR1, AC power, frozen noon and feeds off. Exact25cfca9 baseline versus this patch, same actor and alternating real keyboard path, five-second warmup and15-second window. Chrome itself was forced toARM64 and independently verified with an OS sample. ARM Node alone had still launched translated Chrome; those startup failures are preserved outside acceptance data. The driver now accepts CHROME_ARCH=arm64 on macOS. No CPU recording or forcedGC runs inside the measured window.

| Clear walking, high | Before | After |
|---|---:|---:|
| Sampled bytes/frame |1,784,139|579,854|
| Sampled MiB/s |102.09|33.18|
| Delivered FPS |60.003|60.003|
| Frames over33ms |0|0|
| Frame-boundary heap-drop MiB/s |1.41|17.44|

Sampling includes objects collected by minor and majorGC. This is a67.5% sampled-allocation reduction, not the requested50KB/frame target. Remaining leading stacks are instance packing, sleeping-mark collision probes and object collection. A frame-boundary heap-drop sum misses collections inside a frame: it must not be substituted for the allocation estimate or presented as a GC win. Its requested<3MiB/s target is also not met after this change.

The separate unsampled covered-camera comparison retained medium throughout:59.87→60.00FPS,899/901→901/901 outlined frames,2→0 intervals over33ms; heap-drop proxy20.16→30.82MiB/s. These variable heap drops do not establish an allocation regression or improvement on that path. More work remains against both allocation budgets.

Validation:268/268 global checks, including the extended existing visibility-storage proof. Eager/lazy owner and contour results match across60 frames; retained scratch is cleared. Sleep oracle performs15 occlusion computations over60 frames and recomputes on invalidation. Full-suite acceptance is not claimed; the previously stopped Canvas Timechain crossing was not retried.

Reproduce after staging the site: CHROME_ARCH=arm64 node scripts/profile-allocations.mjs . label --sample. Omit --sample for delivered-frame/heap-drop recording; add --covered for the under-rock camera path. Use the same verified runtime/browser architecture for both sides. Raw accepted summaries and oracle results are in performance-allocations-evidence.json.
