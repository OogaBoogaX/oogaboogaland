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
| Cloud Hopper | `cloud-hopper-1`; one best per GitHub username | Lowest completion time, integer milliseconds |
| Ooga Rally | One cabinet; `race-1-{bay,gorge,peak}[-m]-{lap,race}` | Lowest time, integer milliseconds; each track, mirror and metric separate |
| Ooga Drop | `drop-1` | Highest eligible landing score |
| Ooga Orbit | `orbit-1` | Highest flight score |
| Ooga Mine | `mine-1` | Highest run score under its existing rules |
| Thro-ball | `skee-1`, `skee-2` | Highest score |
| Hoop Shot | `hoops-1`, `hoops-2` | Highest score |
| Coconut Toss | `shy-1` | Highest score |
| Claw | `claw-1` through `claw-3` | Highest score |
| Air Hockey | `hockey-1` through `hockey-3` | Highest score |
| Pool | `billiards-1`, `billiards-2` | Highest score |
| Darts | `darts-1`, `darts-2` | Highest score |
| Pinball | `pinball-1`, `pinball-2` | Highest score |
| Rides | `ride-1` through `ride-4` | Highest score |
| Retro cabinets | `invaders-1`, `snake-1`, `pong-1`, `stampede-1`, `flap-1`, `breaker-1`, `dash-1`, `stacker-1` | Highest score, one game row each |

Ghost Hunters, Ember Den poker and every DSB Land game are excluded. The jackpot wheel
pays tickets but has no high-score result; ticket balances, prizes and Rally cup unlocks
remain local progression rather than additional shared boards. Attract-mode NPC games do
not submit scores.

The existing displays determine the record type. Cloud Hopper has an attributed board.
The other games keep unattributed bests, with independent entries for each physical
machine or Rally track/mode. A race's finishing order is that race's podium, not an
all-time record for its simulated opponents.

## Stored dictionaries

`highscores` is JSON text whose values are integer scores. For example:

```json
{"game_id":"cloud-hopper","highscores":{"player-one":48320,"player-two":51140}}
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

Cloud Hopper retains the all-time top 1,024 personal bests, so the JSON row remains
bounded. A newcomer enters a full board only by beating its last score; ties keep the
existing player. Its SQL update and removal of the last entry are one D1 batch transaction.
Machine dictionaries are bounded by the registry's fixed machine IDs. There is no run
history or per-frame telemetry table.

## API and client lifecycle

- `GET /api/highscores/<game>` is public and returns `{game, highscores, achieved,
  scoreType, direction, unit, version, revision}`. Reads do not create players or sessions.
- `POST /api/highscores/<game>` accepts `{machine, score, version, playerId}`. The Worker
  resolves identity from the existing session. `playerId` is only a guard against a
  different account's cookie replacing the account that began the run; a mismatch is 409.
  Caller-supplied usernames or extra fields are rejected.
- Writes require same-site request metadata, JSON bodies of at most 512 bytes, a known
  game and machine, the current scoring version, and a positive integer within its game's
  bound. The server compares and replaces an entry inside SQL; retries, worse scores and
  equal scores cannot undo a better result.
- `HIGHSCORE_LIMITER` allows 120 requests per minute per key, separating public reads by
  IP from writes by account. Rate-limited replies are 429; unavailable storage replies
  with `closed` and 503. Responses are `no-store`, including public reads, so subsequent
  reads reflect account deletion and score changes.

`/api/me` advertises `highscores` when this Worker has D1. The shared page client uses
that capability before requesting scores, preserving portable pages and older Workers.
It captures the signed-in account at the start of a run and checks it again at completion.
Starting signed out, signing out mid-run, or changing accounts makes that run local only.
The Worker also authenticates every submission. There is no server-issued run ticket or
server replay in this version: a client can fabricate a plausible score. These are
community high scores, not proof of a competitively verified performance.

Local personal records remain playable offline. Shared records begin empty; existing
localStorage scores are never uploaded after sign-in or assigned to a duplicate machine
whose identity was not stored. Fetches happen when boards are used and submissions happen
at eligible completion, never in a per-frame loop.

Mine keeps its start-account eligibility across visits in the same page. Runs restored
from localStorage after a reload remain local, since the page cannot establish who began
them. Continuing an eligible run retains that account requirement and uses Mine's existing
score rules; continued and ordinary runs share the machine record.

## Wrangler and rollout

The existing migration directory and deploy workflows already apply this migration. No
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
