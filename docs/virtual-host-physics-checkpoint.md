# Physics continuity checkpoint before frozen-body pivot

This checkpoint preserves the implementation through local v50 before changing
its disconnected-player physics policy. It is deliberately incomplete and remains
in draft PR #467 for issue #377. No activation, deployment or production migration
is included. Tess is excluded. Burst delivery remains disabled.

The planned preservation ref is
`checkpoint/377-physics-before-freeze-20261105`; the parent of this checkpoint is
`35163a93150491303f8c8b6b201ebacb83d9e34b`. The frozen-body pivot must start only
after this complete checkpoint is committed successfully with existing signing
settings. Preserve the ref rather than rewriting or amending its history.

The saved implementation includes bounded passive Clanker physics, separate body
records, server ownership/recovery fencing, durable Room reclaim and movement
inboxes, observation-aware movement, restart/close/replay handling, browser reclaim
and scene-attachment scaffolding, mixed pose packets and strict publication trials.
Player resource quantities and rig/animation continuation are already reset on
recovery. The prior staged patch and index are also preserved separately in the
local task workspace, along with untracked source copies and verification logs.

Verification before preservation: 77 focused Worker/source checks passed, followed
by the 13-test Room suite with a coupled actual Clanker/VirtualHost/Room-inbox
lost-reply recovery case. Build passed with 322 scripts; syntax and whitespace
checks passed. The existing 20-entry Hub ledger is unchanged. Hub/browser/full/
scene checks remain STOP-restricted and were not run. UI behavior, real cross-DO
concurrency, full-world AI/Ooga/occupancy/riders and production costs remain open.

The last actual restricted workerd trial used 53 roaming NPCs, 30 separate passive
bodies and 32 protocol clients including one stalled receiver. It delivered
119/120 sweeps, 82 late, with first-client p95 264.42 ms and last-client p95
326.46 ms. Its 30 target seconds incurred 960 host transactions, 1,106 key writes
and 62,510,497 JSON value bytes. These are local fixture observations, not billed
CPU, peak memory or production readiness. The current movement path adds writes
that this older trial did not measure. The strict four-Hz gate still fails.

To revisit physics continuity, inspect or create an isolated checkout from the
preserved checkpoint ref. Do not reset the active worktree or discard later work.
Restoring this checkpoint does not authorize deployment: its unfinished integration
and failed delivery gate still apply. The later pivot documentation should record
the resolved checkpoint commit SHA and behavioral tradeoffs.
