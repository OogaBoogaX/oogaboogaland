# Ooga Chat operations

How Ooga Chat's backend (`docs/ooga-chat-backend.md`) is measured, watched, released and rolled back (#669). The
repository holds the instruments, the caps, the local control-plane figures, the cost model and this runbook. The
staging load runs, the device matrix, billing alerts and the sign-off are the owner's, and their results are recorded
here as runs are made. Nothing below has been run against staging or production yet.

## The launch envelope

Proposed, to be confirmed or revised by the staging matrix and then signed off by the owner:

| | Proposed | Where it is set |
|---|---|---|
| Listeners a zone, both zones active | 500 on staging; production starts at 100 and rises in steps | island `AUDIENCE_LISTENERS` |
| Cloud speakers a zone | 8 (one a cloud seat, `cloud-seats-v1`) | island `AUDIENCE_SPEAKERS`, `cloud-seats.js` |
| Island outdoor publishers | the Room's 32 players at most | `MAX_PLAYERS` |
| Connections in all, and a person's tabs | 1,200, and 3 | `DEFAULT_LIMITS` in `audience-model.js` |
| Reaction fan-out a zone | 5,000 frames a second (30 reactions a second up to about 160 people, 10 at 500) | island `AUDIENCE_FANOUT` |
| Commons members | 128 a Room, 3 an account | `room-commons.js` |
| p95 roster and role convergence | 1 s or less | staging matrix |
| p95 first audible media after a permitted gesture | 3 s or less (browser permission and autoplay time reported apart) | staging matrix |
| Recovery after an ordinary network interruption | a current roster and media within 10 s | staging matrix |
| Private-room exclusion | zero newly private samples on any outdoor subscription after the barrier (#667) | correctness, not a rate |

Record with the sign-off: the weakest supported phone and browser, the regions tested, and the expected peak duration.

## What the backend reports

Three instruments, each bounded and each free of personal data. None records SDP, a URL with its query, a token, a
cookie, an address, audio, chat or private text, a position, an avatar fetch's credentials or a free-form error.

**The edge's metric lines** (`worker/chat/src/metrics.js`). The edge Worker writes one JSON line to Workers Logs for each
notable answer: a socket upgrade (refused or not), a media call, a sign-in start or callback, a donation call, and any
error status anywhere. A public read that succeeds is not logged, so the volume follows sign-ins, sockets and media, not
page loads. Each line is `{ ooga: "chat", v: 1, env, route, status, close?, signin? }`. `route` is a fixed name
(`audience`, `commons`, `media:<op>`, `auth:<provider>:start|callback`, `donations:<op>`, `me`, `logout`, `bootstrap`,
`health`, `version`, `public`, `avatar`, or `…:unknown`). `close` is a refused socket's close code (4401 signed out, 4403
not allowed, 4429 limited, 4503 off). `signin` is the callback's result (`ok`, `denied`, `failed`, `unavailable`,
`rate-limited`). Both edge configs set `observability.logs.invocation_logs` to false: Cloudflare's own invocation logs
would hold each request's URL, an OAuth callback's code and state among them. Workers Logs tags every line with the
Worker version, which is the deployment id for correlation; `v` is the line's schema.

X profile reads are counted here: the edge reads an X profile once a sign-in (`auth:x:callback`) and never refreshes or
caches it, so those lines by `signin` are the billed reads and their failures.

**The Audience in the owner's Inspector** (`worker/src/audience.js`, the Inspector of `docs/auth-and-presence.md`). The
Audience reports to the existing private Inspector, under its rules: nothing at all unless `INSPECTOR_IDS` names an
account; owner-only at `/inspect`; reports ride calls the object already makes (no timer, so an idle audience still
hibernates); rows kept a day. Its card shows:

- Counters, as rates: admissions (`admitGithub`, `admitX`), refusals (`refuseFull`, `refuseIdentity` for too many tabs,
  `refusePrincipal`), closes (`closeAuth`, `closeBad`, `closeProtocol`, `closeFull`, `closeOff` by the kill switch, and
  `gone` for clients leaving), `resync` (a client saw a revision gap), `rateLimited` (control frames dropped), `snapshots`
  and `snapshotBytes`, `deltaFrames` (delta frames sent), `speakerGranted` and `speakerRefused`, `reactions` and `reactionsLimited`, `media`,
  `mediaBusy` (429/503: a queued or backlogged negotiation) and `mediaRefused`, `sfu` calls with `sfuMs` and failures by
  class (`sfu429`, `sfu5xx`, `sfu4xx`, `sfuTimeout`), and `cleanupDone` and `cleanupExpired`.
- Peaks: `connections`, `snapshotBytesMax`, `sfuMsMax`, `cleanupJobs`.
- State: connections against the cap, each zone's listeners, cloud and island speakers, roster rows and revision, the
  caps, the island's switches, the media cleanup queue (jobs and the oldest job's age), media readiness, and how many
  island panels watch. Never an id, login, principal or display name.

The Room's own card already shows the island's voice, its SFU calls and its voice cleanup queue.

**The public health view** (`GET /api/chat/health`). It says what is off or unwell without naming anyone or showing a
setting: `assets`, `database`, `bridge`, `auth.github`, `auth.x`, `voice`, `speak`, `feed`, `commons`; `media`, which is
`off` while listening is off, else the Audience's `{ sfu: ok|degraded|off, cleanup: ok|backlog }` (or `unavailable`); and
`publicData` (`ok`, `stale`, `unavailable`, or `unknown` before the isolate has read it). `status` is `ok` only when
assets, the database and the bridge are well and whatever is on is well; `degraded` otherwise, `down` with no app. The
SFU reads `degraded` after 3 failures within 5 minutes with no success since; the cleanup queue reads `backlog` at half
its 64 jobs or once a job has waited 10 minutes. Both are since the Audience last woke.

| The issue's measure | Where it is |
|---|---|
| Authenticated admissions; refusals by reason | edge `audience`/`commons` lines by `close`; Audience `admit*`, `refuse*` |
| Active unique listeners and publishers by zone and source | Audience state, each zone's listeners, cloud and island speakers |
| Socket reconnect and close class | Audience `close*`, `gone`; edge lines; admissions against connections |
| Control-frame drops and rate limits | Audience `rateLimited`, `reactionsLimited`, `mediaBusy`; edge 429 lines |
| Snapshot bytes; roster revision gaps | Audience `snapshotBytes`, `snapshotBytesMax`; `resync` |
| Queued negotiations; SFU latency and status | Audience `mediaBusy`, `sfu`, `sfuMs`, `sfuMsMax`, `sfu429`… |
| Publication generations; stale lease cleanup | Audience cloud speakers; `closeAuth`; speaker media timeouts end leases (#666) |
| Cleanup backlog age | Audience state `cleanup.oldestMs`; Room card's voice cleanup |
| Upstream data freshness | health `publicData`; the panels' own `stale` and `sources` |
| X profile fetch and cache counts | edge `auth:x:callback` lines by `signin` (no cache: one read a sign-in) |
| Deployment and schema ids | Inspector rows carry the version; Workers Logs the script version; lines carry `v` |

## Alerts

Each one names what to do. The owner sets them in Cloudflare's notifications, the X developer console and an outside
monitor polling `/api/chat/health` once a minute.

| Alert | Threshold | Action |
|---|---|---|
| Unsafe cleanup | any `cleanupExpired`, or health `media.cleanup` `backlog` for 10 minutes | an outdoor subscription may still be open: turn `outdoor` off (kill switch below), check the SFU, then drain |
| SFU degraded | health `media.sfu` `degraded` for 5 minutes, or `sfu429` sustained | stop new speakers (`speak` off on the edge); check Cloudflare Realtime status |
| Repeated authorization failures | edge lines with `close` 4401 or `signin` `failed` over 20 a minute for 10 minutes, or `closeAuth` climbing | check the OAuth apps and the session table; look for a bad client release |
| High reconnects | admissions over twice the connections in 10 minutes, or `resync` over 1 a second | look for a client loop or an edge restart; the socket limiter holds each principal to 20 a minute |
| Sudden egress growth | Realtime egress over twice the cost model's line for the hour | lower `AUDIENCE_LISTENERS` or turn `listen` off |
| X credit exhaustion | the X console's spend cap alert, or `auth:x:callback` `signin` `rate-limited`/`failed` spikes | turn `x` off on the edge; GitHub sign-in and existing sessions go on |

## Capacity, measured locally

`node scripts/ooga-chat-capacity.mjs` runs the Audience's own roster model with no network, at 10, 100 and 500
listeners a zone in both zones. It measures the control plane's frames and bytes, not Cloudflare's sockets, the SFU or
phones. On an M4 Max with Node 22:

| A zone | Snapshot a joiner gets | Joins: frames sent, bytes | A tenth leaving and back | Reactions at the limit |
|---|---|---|---|---|
| 10 | 3.3 KB | 110 frames, 44 KB staggered | 38 frames, 11 KB | 30/s = 300 frames/s |
| 100 | 30.8 KB | 10,100 frames, 4.1 MB staggered | 3,980 frames, 1.1 MB | 30/s = 3,000 frames/s |
| 500 | 154 KB | 250,500 frames, 102 MB staggered; 1,000 frames, 154 MB in one burst | 99,900 frames, 28.6 MB | 10/s = 5,000 frames/s |

The model's own time is a few milliseconds at every size. What these figures decided:

- **Reactions.** A zone's reactions go to everyone in it, so the fixed 30 a second of #668 would have been 15,000 frames
  a second at 500. The zone's limit now shrinks as it fills, under `AUDIENCE_FANOUT` (5,000 frames a second): 30 a second
  up to about 160 people, 10 at 500, never under one. A person's own 3 a second is unchanged.
- **Join storms.** Every join is one delta to everyone already in the zone, so filling a zone of N one by one sends about
  N²/2 frames: 125,000 for 500. Staging must ramp 500 joins in 10 seconds and watch the Audience's CPU and `deltaFrames`.
  If it saturates, the next step is coalescing deltas over a short window, which needs a timer while busy; that is a
  decision for the staging result, not made here.
- **Snapshots** stay far under the 1 MiB WebSocket message limit at 500 (154 KB).

## The load and failure matrix (staging)

Each row is run by the owner on staging only, never production, and recorded with the template below. A failed target
leads to a capacity, configuration or media decision, never to weaker privacy checks or a speaker silently left out.

1. **Audience ramps.** 10, 100 and 500 listeners a zone, staggered and in bursts, a steady hold, departures and
   reconnects, and an idle audience long enough to see the Audience hibernate (its Inspector row stops reporting while
   sockets stay open).
2. **Publishers.** 1, 8 and the worst case (32 island and 8 cloud) with real encoded audio, measuring downlink and decode
   on the physical target phones.
3. **Mixed traffic.** Roster churn, reactions at normal and limit rates, hands, cloud seats, both native panels, the
   donation socket and a signet invoice, while island play goes on.
4. **Injected failures.** SFU timeout, 429 and partial track success, a lost session-create reply, connection failure, a
   slow socket consumer, a stale public snapshot, X 429 and credit exhaustion, OAuth denial, malformed payloads, and an
   unbound service binding.
5. **Lifecycles.** Logout, logout everywhere, deletion, eligibility loss, the same account on the island and in the app,
   a second tab, every private transition (#667's adversarial evidence), a Worker or object restart, and a deployment
   while audio plays.
6. **Devices** (with #671): iOS Safari and PWA, Android Chrome and PWA, desktop browsers: the first gesture, output mute
   and volume, microphone permission, Bluetooth changes, tab switching, screen lock and background, network handoff and
   foreground resume. Record what continues, pauses and needs a tap; promise nothing beyond it.

**Synthetic listeners need an owner decision.** The edge admits only real sessions: there is deliberately no test login
or key. Functional rows can use a few real test GitHub and X accounts. A 500-listener ramp needs either that many
accounts or a staging-only way to mint listener sessions behind a secret, which would be a new authentication path to
review before it is built. Until then rows 1 and 3 run at the scale real test accounts allow.

**A run's record:**

```text
Date, operator, environment:
Edge and island Worker versions (Workers Logs / /api/chat/version), app build, schema versions:
Flags: edge FEATURES=…, island OOGA_CHAT_FEATURES=…, AUDIENCE_LISTENERS=…, AUDIENCE_SPEAKERS=…, AUDIENCE_FANOUT=…
Clients: synthetic …, real … (devices, browsers and versions), regions:
Publishers: island …, cloud …; codec and bitrate assumed:
Duration and ramp:
Audience (Inspector): peak connections, CPU and duration, deltaFrames/s, snapshotBytesMax, sfuMs avg and max, failures
Room (Inspector): sockets, voice cleanup, alarm timings
Media: first audio p95, convergence p95, recovery time; egress GB (Realtime dashboard)
Errors and refusals (edge lines by route and close):
Audio observed, privacy checks, anything that needed a tap:
Cleanup back to zero at the end: yes/no
```

## Cost model and budget gates

Cloudflare Realtime bills egress, at $0.05 a GB when #669 was written, after a first 1,000 GB a month shared by the
SFU and TURN; ingress is free. Recheck the published pricing and the account's plan before release, and never count
the shared allowance twice across the island, Ooga Chat or the two environments.

Planning formula, before protocol overhead: `egress GB = listeners × subscribed tracks × bits a second × seconds ÷ 8 ÷
1e9`. `node scripts/ooga-chat-capacity.mjs --cost` prints:

| Listeners | Tracks | Bitrate | Hours | GB | At $0.05/GB |
|---|---|---|---|---|---|
| 500 | 8 | 32 kbps | 1 | 57.6 | $2.88 |
| 1,000 | 8 | 32 kbps | 1 | 115.2 | $5.76 |
| 1,000 | 40 | 32 kbps | 1 | 576 | $28.80 |
| 1,000 | 4 | 24 kbps | 2 | 86.4 | $4.32 |

These are not a bill: Opus with DTX sends little in silence, overhead and TURN relays add to it, and the real mix of
listeners and speakers is the staging run's to measure. Durable Objects are billed by duration and incoming messages
(outgoing WebSocket messages are not billed as requests), Workers by request and CPU, D1 by rows read and written; the
Audience hibernates when idle and the Room's sweep is its only timer. X bills each profile read; there is one a sign-in.

**Gates.** The owner sets daily and monthly spend alerts in Cloudflare and a cap in the X console before `listen` or `x`
goes on in production. What each switch stops, and what it never stops:

| Off | Stops | Goes on |
|---|---|---|
| edge `x` | X sign-in (new X sessions) | existing X sessions until they end; everything else |
| edge `speak` / island `cloud` | new cloud speakers (publish calls) / clouds in the world | listening; a live speaker until the lease ends |
| edge `listen` | new audience sockets and media calls | sockets already open; sign-in, the public panels, Feed the Oogas, logout |
| island `outdoor` | island voices to Ooga Chat; open grants revoked and their subscriptions closed (#667) | the island's own voice |
| island `commons-send` / `commons` | lines from the app / the app's Commons sockets | the island's own Ooga Chat |
| island `bridge` (all empty) | every outward operation; on the island's restart every audience socket closes (4503) and its media is released | the island; payment settlement (bananapayserver is separate) |

Lowering `AUDIENCE_LISTENERS` refuses new listeners over the cap and never closes those already in.

## Release runbook

Each step on staging first, then production, recording the run each time.

- [ ] Record the edge and island Worker versions, the app build, D1 migrations applied (`ooga-chat-*` 0001; the island's
      `AUDIENCE` object at migration `v4`), the island page's protocol features, and the bridge targets.
- [ ] Deploy the island with `OOGA_CHAT_FEATURES` empty, then the edge with `FEATURES` empty: health `ok`, every flag
      off.
- [ ] Turn on `github` (and later `x`) with `feed`: sign-in, logout, deletion and the native public panels and Feed the
      Oogas flow, before any audio.
- [ ] Island `bridge`; edge `listen`: the read-only roster and receive-only audio, with no speaker yet. Check the caps,
      the Inspector card and the health view.
- [ ] Island `outdoor`, only after #667's privacy-barrier evidence: island voices reach the audience.
- [ ] Edge `speak` and `cloud`, island `cloud`: a small contributor cloud-speaker canary.
- [ ] Edge `commons`, island `commons`: The Commons read-only; then island `commons-send`.
- [ ] Raise production's `AUDIENCE_LISTENERS` in steps (100, 250, 500) while the alerts stay quiet. Keep `x` switchable
      on its own.
- [ ] Record what the app shows for full, disconnected, stale, provider unavailable and microphone denied, and that no
      speaker or cloud outlives its lease.
- [ ] Put the measured browser and PWA background limits in the app's help, with how to resume.
- [ ] The owner signs off the envelope, data retention and spend caps. This gates the release; it does not promise any
      provider's availability.

## Rollback and the incident drill

In order, on staging first as a drill while a hostile client keeps its receiver open:

1. **Stop admissions.** Deploy the edge with `listen` (and `speak`) off: no new sockets or media calls. Sockets already
   open stay until step 2.
2. **Retire publications.** Deploy the island with `outdoor` and `cloud` off, or `OOGA_CHAT_FEATURES` empty for
   everything. Open grants are revoked and the Audience drops island publications and prunes subscriptions to them. With
   the bridge empty, every audience socket that survives the restart is closed (4503) and its sessions are queued for
   cleanup, so a browser that kept its connection keeps no audio; a deployment normally disconnects the object's sockets
   anyway, and the drill confirms which happened.
3. **Close SFU generations.** The media cleanup queue closes every outdoor subscription; the Room says `closed` only once
   the Audience confirms it (#667).
4. **Drain.** Watch the Inspector until the Audience's media cleanup and the Room's voice cleanup are both at zero and
   `cleanupExpired` stayed at zero.
5. **Clear ownership.** Ending leases removes clouds and hands; check the island's clouds list is empty.
6. **Restore versions.** `npx wrangler rollback --config ../wrangler.ooga-chat.<env>.jsonc` from `worker/` for the edge,
   and the island's previous version through its workflow, if the problem was the code.

Then check that the hostile client's receiver hears nothing new: a surviving browser connection must not keep private
or outdoor audio. Public browsing stays up when it is not the problem; island voice and donation settlement go on. Do
not wipe D1 or Durable Object storage, and do not rotate unrelated secrets in the moment.

The release is complete when the owner can follow this runbook, every correctness check passes, the measured limits and
budget are recorded above, cleanup returns to zero after the tests, and the device limits are attached to #671.
