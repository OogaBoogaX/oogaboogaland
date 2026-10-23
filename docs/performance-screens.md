# Stable canvas screens (task3.1)

Jumbotron, Mempool paintings/chain sign and Mine labels now keep one surface geometry and revisioned canvas texture instead of rebuilding lit-pixel faces. Curved boards keep their authored strips/arc. Equal-sized updates use texSubImage2D. Each panel owns its canvas, including Mine's two panels that share a scratch painter. Existing video-only PR193 remains independent; PR267's GPU mesh format is unchanged.

The Canvas fallback retains lighting, tip and Matrix color transforms. Revision-cached coverage masks preserve opaque antialiased pigment and transparent gaps; the existing Matrix sampler is clipped through that coverage. Native software-Canvas checks cover full/crossing fronts, no transparent-gap leaks, no per-frame new canvases and disposal. These are separate from real-Chrome checks.

Measurements use one focused native Chrome155/M1Pro/Metal at1440×900, DPR1, high. The board is on screen. The harness parks RAF, waits for the previously scheduled frame, then samples ten accepted feed refreshes plus repaint and full renderer submission with4096-byte CDP allocation sampling, including objects collected by minor/majorGC. Source code before is the exact f12587b revision in a temporary export; after is the current source. No forcedGC runs during the window. Earlier Page lifecycle-freeze diagnostics allowed queued scene frames into the sample and are not used for acceptance.

| Per refresh | Before | After |
|---|---:|---:|
| Recent sampled allocation |2,694,028 B|411,058 B|
| Totals sampled allocation |5,204,657 B|346,388 B|
| Recent CPU submission |7.47 ms|4.04 ms|
| Totals CPU submission |11.84 ms|3.34 ms|
| GPU buffers created/deleted |2/2|0/0|
| Texture subimage updates |0|1|

The100KB whole-refresh allocation target remains unmet: the remaining sample is dominated by feed normalization/parsing and full-frame uploadInstances submission. The pixel-face allocation and buffer churn are removed. Three-tier close-board screenshots were inspected against before: glyph rasterization, curve, colors and frame remain consistent. Samples are probabilistic and timings include profiling overhead; these are not uninstrumented FPS claims.

Chalkboard's5×5 averaging, maximum-brightness gain and color quantization still use its existing pixel geometry path; a naive native-resolution texture would change its authored appearance. Hub/Bifrost getImageData calls implement one-time photograph grading and already produce image textures. HUD's read is one-time favicon recoloring. These were inspected and are not silently presented as converted. Navigation dots still swap their small geometry on slide changes, so the idle buffer-churn target is carried to2.6.

Validation: existing Mine save/resume/finish, jumbotron reader/draft/stable-surface checks and the ordinary Canvas2D scene tour pass with clean consoles. All268 global checks pass after extending the isolated rig-link GL fixture for the new sampler binding; its assertions are unchanged. The additional Canvas Timechain crossing again exceeded its120-second session deadline. This is the second observed timeout for that check, so AGENTS.md's STOP rule applies and it must not be retried. The focused run then aborted on the incomplete mock before its ledger flush; the raw run log preserves that timeout. Full-suite acceptance is not claimed.

## Follow-up: copy-on-write repository normalization

`activityRepos.normalizeStats` now keeps a repository row or recent row unless its name actually changes, caches each distinct name per call, and returns the input root when nothing changed, as `contributorIdentities.normalizeStats` already does. `parseStats` builds its own model from the result, so no caller-owned object is shared with the retained board. A 131-fixture oracle (frozen, sparse, alias, duplicate and mutable inputs) matched the old normalizer and parser output exactly; on the baked feed, copied recent rows fell 1365 to 0 and name calls 1373 to 8.

Same harness, now forced to ARM64 Chrome under ARM Node, base 51079c4, two runs a side. The board refresh (inclusive `refreshData`, per refresh):

| View | Before | After |
|---|---:|---:|
| Recent | 239,543 / 246,984 B | 158,300 / 168,875 B |
| Totals | 244,048 / 231,715 B | 167,788 / 185,560 B |

The whole sampled window is now 625–723 KB on recent, higher than the 411 KB above, because the renderer's share (`render`, about 453–467 KB per refresh on recent) is now led by `flushInstanceStream` and `uploadInstances` after task 2.6. The 100 KB whole-refresh target remains unmet. Raw rows: `performance-screens-normalize-evidence.json`. 269/269 global checks.
