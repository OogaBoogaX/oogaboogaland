# Bifrost entry (task 4.3)

Bifrost now opens with its authored destination stand-ins. It loads DSB and poker in idle callbacks after arrival, then takes one photograph per idle callback, retaining the previous view until decoding finishes. Leaving cancels pending work by visit epoch. A failed destination download returns control to the same Ooga, holds the crossing until the player steps back, and permits a new attempt on crossing again.

One cold, focused native Chrome per run, 1440×900, M1 Pro/Metal, DPR 1, high, fixed noon/day 80, live feeds off, `hubcache=keep`. Both runs use `profile-residency.mjs <label> bifrost --no-gc --tasks --reuse` against the staged build. Entry is measured until the director reports its transition finished; later preview jobs are reported separately.

| Metric | Before | After |
|---|---:|---:|
| Cold entry | 919 ms | 523.4 ms |
| Longest task during transition | 535 ms | 107 ms |
| Longest task including later previews | 535 ms | 349 ms |

Entry meets the 600 ms target. The later DSB/poker construction still includes a 349 ms task; moving it off entry does not time-slice the destination builder (task 4.5). The final photograph content and high-tier rendering remain unchanged. No destination chunks are requested during Bifrost enter. The existing playthrough checks now inspect stand-ins at arrival and await both real photographs; destination 503 recovery is tested at the actual DSB window, where that load now belongs.
