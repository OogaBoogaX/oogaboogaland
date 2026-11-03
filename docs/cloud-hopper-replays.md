# Shared winning replays

Each of `cloud-hopper-l1` through `cloud-hopper-l4` has one current winning replay. Guests can read it. Only an
eligible signed-in character owner can submit a recording from a run begun in the same account/session. The timer
shows the shared record holder, a small ghost button immediately left of the time, and the existing race clock.
The ghost defaults off on each attempt, loads only when enabled, and retains that attempt's selected winner
through the active run. Numeric boards keep updating independently, including the timer and result card. Ending
the run stops playback and releases the selection, so an accepted finish updates the results immediately.
There is no browser-personal-best playback fallback. Numeric local bests remain.
Clouds are randomized each attempt: this is a historical comparison, not a route guide or collision actor.

## Format and validation

`cloud-hopper-replay-codec.js` is shared by the browser and Worker. Version 1 has a 12-byte header (ASCII `CHR1`,
little-endian JSON byte length, little-endian float count), UTF-8 metadata padded to a four-byte boundary, then
little-endian Float32 poses. The existing recorder samples 11 parts at 20 Hz, thinning its fixed 12,001-sample
buffer when full while keeping the endpoints. Each pose has time plus 14 values per part (155 floats).

Metadata includes account ID, character key, recorded username, board, course version, duration, seed, departure
drift and an appearance version. Appearance is the actual bounded node/geometry snapshot, including custom
clothes, captured once at departure; playback does not look up today's character traits or execute dress code.
Its root appearance position uses the model's ground offset for pre-start staging, while motion samples retain
world coordinates; cloud elevation is added only once. Its node parents must precede children, geometry indices
must exist, and all values must be finite. Limits are
256 nodes/geometries, 60,000 vertices/faces/lines, 4 MiB metadata and 12 MiB total binary. Duration is at most one
hour. Sample times start at zero, strictly increase and end at the declared duration; count, quaternion, scale,
visibility, version, board, identity and score are checked. Out-of-bounds appearance leaves replay unavailable
while the numeric score can still save. The normal game's clean-finish/DQ checks remain the capture gate.

**These are authenticated client recordings, not server-authoritative physics verification.** Run tickets bind
the current session/account/level and reject impossible elapsed wall time, but cannot prove an honest route or
prevent a modified client from fabricating plausible data.

## Requests and publication

- `POST /api/cloud-hopper-replays/<board>/ticket` issues one current ticket per account/level, valid for 65 minutes.
- `POST /api/cloud-hopper-replays/<board>/finish` takes the binary and `X-Cloud-Hopper-Ticket`. A ticket can claim
  only one content hash. Same-origin/session checks and the existing account write limiter apply.
- `GET /api/highscores/<board>` includes `replay` metadata only when it matches the exact current winner's
  account, score and achievement timestamp. Reads require no login. Old score-only clients still work.
- `GET /api/cloud-hopper-replays/<board>/<sha256>.bin` publicly serves a current or retained recording with
  `max-age=3600, immutable`. The client verifies its SHA-256, format, board, version and score before playback.

The client avoids uploading a run known to be slower than the shared record. The server checks again; slower
finishes still update personal shared scores without storing a replay. The first accepted finish on an empty
board establishes its winner and recording. Equal times from another player cannot displace the earlier winner.
An existing winner without a replay can recover by submitting another clean run with that same winning time,
or a new strictly faster record; the UI never invents or synthesizes their missing historical run. Once a
recording exists, another equal-time attempt (including the same owner's) cannot replace it.

Before R2 writes, D1 reserves an expiring object row. The object is named `v1/<board>/<sha256>.bin`. Once written,
one D1 batch applies the existing conditional score improvement and associates a pointer only if that exact
account/time is now #1 and the session/ticket are still valid. D1 and R2 are not one transaction: a failed batch
can leave a tracked orphan, never a usable mismatched pointer. A failed upload falls back to the ordinary numeric
score submission. A score-only improvement invalidates the old pointer on read. Lost responses retry the same
hash; a missing object returns unavailable and an identical recording can restore it on retry. Missing objects
or offline fetches never substitute a local ghost. Login changes invalidate client upload tickets. Replacement/expiry of a ticket during an upload also gates the
numeric score transaction. Replay-only repairs advance the board revision and use the existing durable score
notification path; clients fetch coherent replay metadata after a score-only room notification.

## Bounded storage and deployment

Migration `0006_cloud_hopper_replays.sql` adds four pointer slots, an object registry capped in SQL at 128 rows
(including current/staged/retired objects), and at most 256 active run tickets. At 12 MiB maximum this caps
registered object storage at 1.5 GiB; normal recordings are smaller. Each winner stays while current. The existing
daily scheduled handler retires older versions with a 24-hour grace starting when retirement is first observed,
then deletes them and expired staged orphans. Current winners are excluded. Deletion is marked in D1 before R2
cleanup, preventing concurrent attachment to an object being deleted. Retried uploads renew the object reservation
before touching R2. Failed deletes remain retryable. If the
cap fills, replay publication fails closed until cleanup; numeric scores remain available. This is not an archive.

No remote infrastructure is created by this patch. To enable after review:

1. Provision a private R2 bucket for the chosen environment and enable the commented `CLOUD_HOPPER_REPLAYS`
   binding example in that environment's Wrangler config using the actual bucket name. Staging and production
   must use separate buckets. Public access is through the Worker; no public bucket URL or credentials belong
   in the page. The unbound default keeps ordinary scores working and replay controls unavailable.
2. Apply the additive D1 migration before deploying the Worker. The existing deployment workflows apply
   migrations. Use local D1/R2 emulation for development; no remote bucket is needed for the focused tests.
3. Verify real staging sign-in, first record, guest download, account switch, stale/offline states and scheduled
   cleanup before any production deployment. These live/infrastructure checks were not performed locally.

Focused checks: `node --test worker/test/cloud-hopper-replays.test.mjs worker/test/highscores.test.mjs`,
`node test/run.mjs cloud-hopper-controller`, `node test/run.mjs cloud-hopper-record`, and `npm run build`.
