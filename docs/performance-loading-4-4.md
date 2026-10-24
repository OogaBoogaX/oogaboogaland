# Prefetch on approach (task 4.4)

`deferred.prefetch(group)` and `prefetchScene(id)` request a scene's code without preparing or entering it. The hub checks four times a second whether the driven Ooga (or the free camera) is within 15 m of an open mouth, and hovering a cave mouth or its sign prefetches too; in the arcade the same check runs against the four stage cabinets, and hovering one prefetches its game. The HUD's destination and preset buttons prefetch on pointer enter and focus. A group is requested once at a time; a failed prefetch waits 60 s before trying again, while a deliberate entry still retries at once. A hidden tab prefetches nothing. The old patch's chain-panel hunks were stale and are left out, so the task 3.1 chain sign is unchanged.

Hosted, ARM64 Chrome (`untracked/performance/prefetch-probe.mjs`):

| | Local server | 150 ms, 1.6 Mbit/s |
|---|---:|---:|
| Factory, cold entry from 40 m | 845–959 ms | 2,987 ms |
| Factory, after 6 s within 10 m | 958 ms, nothing left to fetch | 960 ms |
| Arcade, cold entry from 40 m | 846–869 ms | 6,159 ms |
| Arcade, after 6 s within 10 m | 878 ms | 2,328 ms (its 0.9 MB group was still arriving) |

On a local server the download is near-instant, so the fade and the scene's build set entry time and prefetch changes nothing; the throttled rows show what it saves on a slow connection. The throttle is applied after the hub has booted and chunks are served uncompressed, so the absolute times are pessimistic.

The factory and arcade mouths are about 11 m apart, so approaching either prefetches both. The arcade hall is within 15 m of its stage cabinets everywhere, so entering it prefetches Rally, Drop, Orbit and Mine (about 290 KB uncompressed) at once. With the factory chunk refused, standing at the mouth for 4 s made one request, and walking in then fetched it and entered. The portable page made no request.

The arcade's hosted check refused Drop only after the hall had loaded, and prefetch now loads it first, so that refusal never happened. It now refuses Drop from the first request and counts only the two requests its Space presses make, still requiring the refusal, the refused Leave and the reopening. Unit 269/269; arcade 281/281 and lab 286/286 with orbit's hosted check. The hub suite was not rerun: five of its checks are under STOP from the task 4.2 run, and the probe drove the hub's prefetch directly. Raw rows: `untracked/performance/evidence/performance-loading-4-4-evidence.json`.
