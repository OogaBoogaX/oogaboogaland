# Shared game high scores

Cloud Hopper and Ooga Arcade keep their shared high scores in the existing OBL D1 database.
Each environment retains its own `DB` binding and database ID. `0003_highscores.sql` adds
one `game_highscores` row per game; it does not create another database or touch donations.

Anyone can read the shared records, signed in or out. Only an eligible, signed-in GitHub
account can improve one. The username is the GitHub login, never the selected character,
display name, or a name supplied in a request. GitHub usernames are case-insensitive, so
attributed dictionary keys use their lowercase form.

## Games and machines

`src/js/highscore-rules.js` is the page and Worker's shared allowlist. Machine IDs are
permanent labels attached to the physical machines; rearranging the arcade must retain
them. Every duplicate has its own record.

| Game | IDs / records | Comparison |
|---|---|---|
| Cloud Hopper | One board per level, `cloud-hopper-l1` to `cloud-hopper-l4` (each its own game and machine); fastest distinct runs, with repeated GitHub usernames allowed in the top ten | Lowest completion time, integer milliseconds; levels never compared |
| Cloud Hopper, before levels | `cloud-hopper` / `cloud-hopper-1`, retired: read, never written | As above |
| Ooga Rally | One cabinet; `race-1-{bay,gorge,peak}[-m]-{lap,race}` | Lowest time, integer milliseconds; each track, mirror and metric separate |
| Ooga Drop | `drop-1` | Highest eligible landing score |
| Ooga Orbit | `orbit-1` | Highest flight score |
| Ooga Mine | `mine-1` | Highest run score under its existing rules |
| Thro-ball | `skee-1`, `skee-2` | Highest score |
| Hoop Shot | `hoops-1`, `hoops-2` | Highest score |
| Coconut Toss | `shy-1` | Highest score |
| Claw | `claw-1` through `claw-3` | Highest score |
| Pool | `billiards-1`, `billiards-2` | Highest score |
| Darts | `darts-1`, `darts-2` | Highest score |
| Pinball | `pinball-1`, `pinball-2` | Highest score |
| Rides | `ride-1` through `ride-4` | Highest score |
| Retro cabinets | `invaders-1`, `snake-1`, `pong-1`, `stampede-1`, `flap-1`, `breaker-1`, `dash-1`, `stacker-1` | Highest score, one game row each |

Ghost Hunters, Ember Den poker and every DSB Land game are excluded. The jackpot wheel
pays tickets but has no high-score result; ticket balances, prizes and Rally cup unlocks
remain local progression rather than additional shared boards. Attract-mode NPC games do
not submit scores.

The existing displays determine the record type. Each Cloud Hopper level has an attributed board; the single
board from before the levels keeps its records, retired (`retired: true` in the registry: reads answer, writes
are refused with 400, and the identity triggers still move or remove its names).
The other games retain unattributed bests, with independent entries for each physical
machine or Rally track/mode. A race's finishing order is that race's podium, not an
all-time record for its simulated opponents.

## Stored dictionaries

`highscores` is JSON text whose values are integer scores. For example:

```json
{"game_id":"cloud-hopper-l2","highscores":{"player-one":48320,"player-two":51140}}
{"game_id":"darts","highscores":{"darts-1":420,"darts-2":360}}
```

`score_type`, `direction`, `unit` and `rules_version` describe the record. `achieved` keeps
the first achievement time for each current best, in Unix milliseconds. Equal results
leave both the score and its timestamp unchanged. Each real change increments `revision`,
which lets the browser discard a delayed read that would replace a newer result.

The private `owners` dictionary maps attributed usernames to numeric GitHub account IDs;
it is never returned by the API. Database triggers move a score when that account signs
in under a new username and remove it when the account is deleted. When a different
GitHub account claims a reused username, the previous attribution is removed and its
stale sessions are revoked; that account must sign in again to refresh its current name.
A submission checks that its session is still present and unexpired inside the score
update, including when sign-out, account deletion or a username claim raced the request.
Unattributed machine scores retain no owner and survive account deletion.

Each Cloud Hopper board retains the all-time top 1,024 personal bests, so its JSON row remains
bounded. Migration `0007_cloud_hopper_runs.sql` also retains up to 1,024 distinct finishes per
level in `cloud_hopper_runs`. Its public `runs` array contains the fastest ten, ordered by
milliseconds, first achievement, numeric account ID and run ID; multiple rows may name the
same player. Each run also has a public `id`, the SHA-256 hex fingerprint of
`JSON.stringify([game, playerId, runId])`; raw replay tickets and numeric account IDs remain private.
Personal bests remain eligible if their run fell outside retained history and
other accounts are later removed. The list and revision are read in one SQL snapshot.
The migration imports only existing bests and leaves their scores, timestamps and replay
pointers intact. It cannot reconstruct overwritten historical finishes. A newcomer enters
a full board only by beating its last score; ties keep the
existing player. Its SQL update and removal of the last entry are one D1 batch transaction.
Machine dictionaries are bounded by the registry's fixed machine IDs. The retained run
history is bounded; there is no per-frame telemetry table.

The eight retro video cabinets plus Drop, Orbit and Mine also publish an attributed top-ten
run board. `highscoreRules.cabinets` is their eleven-game allowlist. Migration
`0008_cabinet_runs.sql` adds `cabinet_runs`, retaining the best 1,024 distinct finishes per
game. The additive public `runs` array uses the same `{id, username, score, achieved}` shape
as Cloud Hopper, ordered by score descending, achievement ascending, numeric account ID,
then run ID. Repeated usernames are allowed. The existing machine record and its meaning
remain unchanged; historical machine scores lack an owner, so the migration does not
invent attributed rows. Physical multiplayer machines do not gain run boards.

New cabinet clients send one UUID `runId` per completed signed-in run. A duplicate identity
cannot update either the accepted run or machine record. Legacy requests without `runId`
still improve the machine record only. Both writes and their session checks share a D1
transaction. Non-record finishes can enter the leaderboard and increment its revision,
notifying live clients through the same durable outbox. Names follow renames, reused names
lose the prior account's attribution, and account deletion removes its runs while retaining
the unattributed machine record. No scores are uploaded from local saves.

## API and client lifecycle

- `GET /api/highscores/<game>` is public and returns `{game, highscores, achieved,
  scoreType, direction, unit, version, revision}` plus `runs` for Cloud Hopper levels and
  the eleven cabinet leaderboards. Reads do not create players or sessions.
- `GET /api/highscores/arcade` returns `{boards, refreshAfterMs}` for the 16 Arcade
  machine kinds in `highscoreRules.arcade`, using one indexed `IN` query with the retro run
  lists in the same SQL snapshot. A public-only
  synthetic Cache API entry shares that snapshot at the current Cloudflare data center
  for 30 seconds; concurrent misses share work within an isolate. Cookie and authorization
  headers are never copied into the key or response. Missing rows and failures are not cached.
- `GET /api/highscores/arcade-live` returns the same public boards directly from D1,
  bypassing the edge snapshot. Both snapshot routes are GET-only and use the public read
  limiter. The signed-in client chooses the fresh route; it contains no account-specific data.
- `POST /api/highscores/<game>` accepts `{machine, score, version, playerId}` and optional
  `runId` for Cloud Hopper levels and the eleven cabinet boards. The Worker
  resolves identity from the existing session. `playerId` is only a guard against a
  different account's cookie replacing the account that began the run; a mismatch is 409.
  For level boards, an optional UUID `runId` identifies one completed run. The page reuses
  its replay ticket token as that ID when available, including numeric fallback after an
  upload timeout, or generates a UUID when replay tickets are unavailable. Retrying a
  retained ID cannot append or alter its run. Older clients without an ID retain their
  personal-best submission behavior; accepted improvements are preserved as legacy runs.
  Caller-supplied usernames or other extra fields are rejected.
- Writes require same-site request metadata, JSON bodies of at most 512 bytes, a known
  game and machine, the current scoring version, and a positive integer within its game's
  bound. The server compares and replaces an entry inside SQL; retries, worse scores and
  equal scores cannot undo a better result.
- `HIGHSCORE_LIMITER` allows 120 requests per minute per key, separating public reads by
  IP from writes by account. Rate-limited replies are 429; unavailable storage replies
  with `closed` and 503. HTTP responses to browsers are `no-store`. Only the separate
  public Arcade cache entry has a TTL; individual boards and the live snapshot stay fresh.

`/api/me` advertises `highscores` when this Worker has D1. The shared page client uses
that capability before requesting scores, preserving portable pages and older Workers.
The new `highscoreSnapshots` capability enables combined Arcade reads; older Workers
keep the per-game read contract.
It captures the signed-in account at the start of a run and checks it again at completion.
Starting signed out, signing out mid-run, or changing accounts makes that run local only.
The Worker also authenticates every submission. Optional winning replays have session-bound
tickets, but numeric submissions remain client-reported: a client can fabricate a plausible
score. These are
community high scores, not proof of a competitively verified performance.

Local personal records remain playable offline. Shared records begin empty; existing
localStorage scores are never uploaded after sign-in or assigned to a duplicate machine
whose identity was not stored. Fetches happen when boards are used and submissions happen
at eligible completion, never in a per-frame loop.

Cloud Hopper's timer shows the selected level's global leader, following the same time,
achievement timestamp and stable identity ordering as its shared top ten. Loading, unavailable,
empty and stale replies are labeled; a failed refresh retains the last good shared result.
Browser personal bests remain separately labeled in the selection/results panel. Only the
selected board is watched, using the existing entry, run-start and tab-return refreshes.
When the optional replay storage is configured, the timer can load the current winner's recording on demand.
No available recording means a disabled ghost control; there is no personal/session ghost fallback.
See [Shared winning replays](cloud-hopper-replays.md) for format, publication, retention and deployment requirements.

Mine keeps its start-account eligibility across visits in the same page. Runs restored
from localStorage after a reload remain local, since the page cannot establish who began
them. Continuing an eligible run retains that account requirement and uses Mine's existing
score rules; continued and ordinary runs share the machine record.

## Live delivery and recovery

Only a successful change to a score row calls `ROOM.getByName("island").refreshHighscores(game)`.
This binding-only RPC has no public HTTP or WebSocket command. It accepts a game id,
reads D1 itself and broadcasts `{t: "highscore", board}` on the existing signed-in sockets.
Rejected scores and duplicate submissions do not call it. A distinct Cloud Hopper finish
retained in the run board notifies watchers even when it is slower than that player’s best.
The Worker uses `waitUntil` so room
latency does not delay the submitter's score response. No guest live socket is opened.

`0004_highscore_notifications.sql` adds a pending-revision table with at most one row
per game. Its trigger runs in the score transaction, also covering identity cleanup.
The room acknowledges only revisions it has read and sent: a newer concurrent commit
cannot be removed by an older acknowledgement. Failed delivery, failed acknowledgement
and a Worker dying after commit leave recoverable work. The existing one-minute room
sweep drains pending changes while players are connected; no additional alarm or interval
is created, and an empty room does no recovery reads. Rename/removal is delivered by this
sweep. A restart can redeliver a revision; clients and the awake room deduplicate it.

Boards are complete replacements of one game's public projection, not whole-Arcade
broadcasts. The existing registry bounds machine entries and 1,024 attributed entries;
the server also refuses dictionaries larger than 100,000 characters each before parsing.
Private ownership never reaches the wire. Client validation and monotonic per-game
revisions reject malformed, duplicate and reordered data, including a stale HTTP response
arriving after a newer socket update. The ordinary D1 binding reads the primary; do not
switch these reads to unconstrained replica sessions.

A live connection token change forces fresh reads of watched boards after welcome.
Unwatched snapshots are invalidated by that token before their next use. This closes the
snapshot/subscription race and recovers messages lost with a disconnected socket. Signed-in
pages do not poll scores; normal delivery is immediate after commit and the room read,
not a guaranteed latency SLA. A failed notification can take the next successful one-minute
sweep to recover (longer during an outage).

Guest watches use one page timer only while the document is visible and a board is watched.
For Arcade, it uses the response's remaining cache lifetime, plus 100 ms (minimum 1 second),
not another 30 seconds after an old cached response. Hiding the page or leaving its last
board cancels the timer. Returning to a visible page refreshes due boards; errors retain
the last good scores and back off for 30 seconds. The intended guest lag is about 30 seconds
plus request time and timer scheduling, not a strict upper bound during network failures.

## Cost and verification

A fresh Arcade visit makes one browser request instead of 17 (94.1% fewer). A cache miss
reads 17 game rows in one SQL query; a cache hit reads none. Cache API hits still invoke
the Worker, and independent data centers and isolates can have independent misses.
Visible guests refresh once per cache lifetime, adding requests that the old static open
screen did not make. Counts per fresh visit must not be confused with total session traffic.

The focused SQLite/cache fixture measures 17 simultaneous requests coalescing into one
17-row query, then a cache hit making zero score queries. Client fixtures measure one
request for 17 watches, visible-only refreshes and no signed-in score timer. Room fixtures
measure one board frame per connected player and no duplicate frame for the same revision
while awake, plus recovery after rehydration. A changed score adds a pending-row write,
one RPC, an outbox lookup, a board read and conditional acknowledgement; its normal score
write and submitter response remain. Each active-room maintenance sweep adds one bounded
pending-table query, even when there are no pending changes.

Calculated examples: 100,000 fresh visits go from 1.7 million score requests to 100,000;
1 million visits go from 17 million to 1 million. With one island room and 20 connected
players, 10,000 delivered changes produce 200,000 outgoing board frames and normally
10,000 notification RPCs, before retries/coalescing. These are operation estimates, not
measured Cloudflare bills. CPU, D1 billed row metrics, cache hit rate across data centers,
actual commit-to-screen latency and long-lived guest traffic require staging measurements.

Focused checks when authorized: `node test/run.mjs highscores-unit`, `node test/run.mjs chat-unit`,
and `node --test worker/test/highscores.test.mjs worker/test/chat.test.mjs worker/test/protocol.test.mjs worker/test/auth.test.mjs`.
They cover real SQLite transactions/triggers, failure retention, notification/commit races,
room rehydration and client ordering/lifecycle. They mock Cloudflare cache/room hosting and
browser networking; they do not replace a two-player staging smoke test or CI at the PR head.

## Wrangler and rollout

The existing migration directory and deploy workflows apply `0004_highscore_notifications.sql` and
`0005_cloud_hopper_levels.sql`, `0006_cloud_hopper_replays.sql`, `0007_cloud_hopper_runs.sql` and
`0008_cabinet_runs.sql`
before the Worker. These add the level rows, replay registry and bounded run history. No
`d1 create`, new database binding, secret, Durable Object or scheduled job is needed.
The configs add limiter namespaces `2006` on staging and `1006` in production; the local
donations preview uses `3006` and still keeps scores in its local D1.

From `worker/`, apply the schema to isolated local storage and serve the Worker:

```sh
npm run migrate:local
npm run dev
```

After review, use the existing **Deploy Cloudflare staging** workflow, which applies D1
migrations before deploying. Verify signed-out reads, signed-in improvements, both dart
boards and other duplicate machines, Cloud Hopper's username/times, and account deletion.
Then use **Deploy Cloudflare production** from `rock`. Merging alone does not deploy.
The migration is additive; rolling back the Worker code can leave this table and its
identity-cleanup triggers in place without changing existing account/session columns.

`worker/test/highscores.test.mjs` exercises the actual migration and SQL against SQLite,
including public reads, authentication, invalid values, machine isolation, concurrent
updates, rename/deletion, stale sessions and the bounded board. It runs with the Worker's
existing test command when checks are requested; follow AGENTS.md's default `wait` mode
otherwise.

When a scoring rule changes incompatibly, bump its shared registry version and use a new
migration to reset that game's dictionaries and increase `revision`. Keep `revision`
monotonic across resets. Do not silently reinterpret existing scores under new rules.

Air Hockey is scoreless for leaderboard purposes: its points are match goals only. Local bests are ignored, its public GET/POST highscore route is unavailable, and aggregate Arcade snapshots omit it. Historical D1 rows remain stored without being served or updated.

Completed eligible Cloud Hopper runs appear immediately in provisional score order with “saving...”.
Pending uploads are separate from confirmed records and never select a winning ghost. Confirmed
responses reconcile the server order, with public run fingerprints preventing duplicate rows when
a live read beats the upload response. Failed uploads retain a labelled local time outside the
shared ranking; at most ten pending/failed notices per level are held for the current account.
Account changes clear these notices, and level watches detach on leaving.
