# Ooga Chat backend

Ooga Chat (#650) is a standalone app at `ooga.chat`: authenticated listeners hear the island's public outdoor
conversation, and verified GitHub contributors can speak from a cloud. The app itself, its build and its browser
contracts are `docs/ooga-chat-app.md`. This document is the server side: the Cloudflare resources, the edge Worker that
serves the app, the private bridge into the island's Worker, the feature flags, secrets, deployment order and rollback.
Measuring, watching, releasing and rolling it back (caps, metrics, alerts, the load matrix, the cost model, the release
runbook and the incident drill) are `docs/ooga-chat-operations.md` (#669).
Its sections grow with the backend issues: infrastructure (#662), sign-in (#663), public data and donations (#664), the
audience (#665), media (#666), private-room exclusion (#667), reactions and clouds (#668), the Commons (#670) and the
release (#669).

## Shape

```
 browser ──https──▶ ooga-chat-<env>  (edge Worker: the staged app, /api/*, /auth/*, /donations/*)
                     │  D1 ooga-chat-<env>: principals, sessions, sign-ins in flight, capability answers
                     │
                     ├─ OBL ───────▶ oogaboogaland-<env>  #ChatBridge  (private entrypoint, worker/src/chat-bridge.js)
                     │                 contributor policy, public data, audience zones, the SFU secret, the room
                     │
                     └─ DONATIONS ─▶ bananapayserver-<env>  #PageApi  (the same payment service the island uses)
```

- **The edge** (`worker/chat/src/`, `wrangler.ooga-chat.<env>.jsonc`) serves the app the app's own build stages
  (`npm run build:ooga-chat` → `untracked/ooga-chat`) and, on the same origin, every server route. It owns Ooga Chat's
  accounts and sessions in its own D1, and nothing else: it never reads the island's tables, holds the SFU secret, or
  runs presence.
- **The bridge** is a named `WorkerEntrypoint` in the island's Worker. A named entrypoint is reachable only through a
  service binding that names it, never from public HTTP, so the edge is its only caller. The island's Worker is the
  authority for everything the island already decides: who is a contributor (the cast and Oogatron), what the island
  shows, who stands where, and the media (one SFU app per environment, shared by the island and Ooga Chat so an
  authorized track can be pulled directly).
- **Audience state** for hundreds of listeners lives in Durable Objects of its own beside the island's `Room` (#665),
  never in the `Room`, whose 32 players and 15 Hz poses are a game's.

## Environments

| | Staging | Production |
|---|---|---|
| Edge Worker | `ooga-chat-staging` | `ooga-chat-production` |
| Origin (`SITE_ORIGIN`) | `https://ooga-chat-staging.wickedsmartbitcoin.workers.dev` | `https://ooga.chat` (custom domain; no workers.dev copy) |
| Config | `wrangler.ooga-chat.staging.jsonc` | `wrangler.ooga-chat.production.jsonc` |
| D1 | `ooga-chat-staging` (`109e1799-…`, ENAM) | `ooga-chat-production` (`c4a02871-…`, ENAM) |
| Bridge (`OBL`) | `oogaboogaland-staging#ChatBridge` | `oogaboogaland-production#ChatBridge` |
| Donations | `bananapayserver-staging#PageApi` (signet) | `bananapayserver-production#PageApi` (mainnet) |
| Rate limiters | namespaces 2010–2014 | namespaces 1010–1014 |
| Deploys | by hand (`ooga-chat-staging.yml`) | by hand on `rock` (`ooga-chat-production.yml`) |

Staging lives on workers.dev for now. `ooga.chat` is a zone in this account since 2026-11-15, on Cloudflare's
nameservers. A Custom Domain can't be created over an existing DNS record for the same name, so the apex's records
carried over from Squarespace (its four A records) are deleted before production's first deploy; until then that deploy
uploads the Worker and fails at its route. Staging later moves to `staging.ooga.chat` (a custom-domain route,
`SITE_ORIGIN` and its OAuth callbacks together). The canonical origin is the apex: `www.ooga.chat` becomes a proxied record
that a Redirect Rule sends to `https://ooga.chat`, as `www.oogabooga.land` does, and HTTP redirects to HTTPS at the
edge (Always Use HTTPS on the zone).

Environments never cross. Each environment's edge writes its `ENVIRONMENT` into every bridge envelope, and the
bridge refuses one from another environment (`environment_mismatch`). Cookies are host-only on each origin, the OAuth
apps are separate, and the D1 databases are separate, so a staging session, cookie, callback or grant cannot be
replayed into production or the other way round.

## The private bridge

`worker/src/chat-bridge-protocol.js` is the wire, shared unchanged by both ends. An envelope is
`{ v, env, requestId, op, principal, payload }`; a reply is `{ ok: true, requestId, result }` or
`{ ok: false, error: { code, retryable, retryAfter? } }`. `ChatBridge.call` checks, in order: the envelope is an object
of at most 16 KiB, `v` is this bridge's version, `env` is this Worker's `ENVIRONMENT`, `requestId` is 8–64 of
`[A-Za-z0-9_-]`, and `op` is one of its own operations (never an inherited name). An operation refuses with a
`BridgeRefusal(code, retryable, retryAfter)`; any other throw becomes `internal`, with nothing of its message. The edge
reads a reply through `readReply`, which turns anything malformed into `unavailable`, never into a fallback.

`principal` is written only by the edge, from its own validated session. Identity headers a browser sent
(`x-ooga-chat-*`, `x-player-*`, `x-room-token`, `x-game-name`, `x-client`) are dropped at the edge (`scrubbed`) before
anything is handed on, and the bridge never reads a browser header at all.

| Operation | Needs | Answers |
|---|---|---|
| `hello` | nothing | `{ version, environment, features, voice }`: what the bridge can do now, with no binding, secret or account id |
| `capability` | `bridge`; a GitHub principal | `{ state, character, reason, policy, checkedAt }` from the island's contributor policy (`chat-capability.js`): `eligible` (a bundled owner, or an unbundled contributor Oogatron vouches for), `ineligible` (a verified snapshot said no, the island banned the account, or `identity-collision`: another GitHub id holds that login on the island, by its own `players_identity_insert` rule) or `unknown` (the island's D1 or the snapshot could not be read). An X principal is refused (`capability_required`) |
| `cast` | nothing (public browsing stays up under the kill switch) | `{ rows, revision, count }`: the registered Oogas from the island's build (`chat-public.js`), each `{ handle, github, display, joinedAt, lastCommitAt }`, sorted by join then handle, `revision` the hash of exactly those rows |
| `revoke` | nothing (cleanup works while admissions are off) | `{ revoked }`: the Audience closes every socket of that principal with 4401 (`logout`, `logout-all`, `deleted`), or for `eligibility` ends its lease and its right to ask again while it keeps listening; `deleted` also removes the island player row a Commons name made for an account that never signed in there |
| socket `/audience` (`ChatBridge.fetch`) | `bridge`, the `AUDIENCE` binding | the audience socket (#665, below), handed to the Audience object with the edge's assertion as `x-audience-principal`, and only the WebSocket headers |
| `POST /media/<op>` (`ChatBridge.fetch`) | `bridge`, the `AUDIENCE` binding | a media call (#666, below), its body passed on to the Audience object with the same assertion |
| `display` | `bridge` and `commons`; a GitHub principal | `{ display }`: the account's island display name (`players.display`) set as the island's `PATCH /api/me` sets it, by its rules (`sanitizeDisplay`: 3 to 24 letters, digits, spaces or simple punctuation, else `invalid_display`), after the island decides again that the account is an eligible contributor (`capability_required` otherwise, banned included). An account that never signed in on the island gets a player row (id, login and the name) marked as never signed in (`last_login_at` 0, `chat-display.js`), which `revoke` with `deleted` takes back; a first island sign-in makes it an ordinary account |

Later issues add their operations here.

## Feature flags

Two sets of flags, one at each end. Both default to everything off.

**The edge's `FEATURES`** (comma-separated, in `vars`): `github`, `x`, `listen`, `speak`, `feed`, `commons`, `cloud`. A
flag counts only when what it needs is there too (`effective` in `worker/chat/src/config.js`):

| Feature | Needs |
|---|---|
| `github` | its flag, `GITHUB_CLIENT_ID`, the secret `GITHUB_CLIENT_SECRET`, the D1 |
| `x` | its flag, `X_CLIENT_ID`, the secret `X_CLIENT_SECRET`, the D1 |
| `listen` | its flag, a sign-in provider, and a bridge of this environment and version that has `bridge` on and an SFU |
| `speak` | its flag, `listen`, and GitHub sign-in (X is never a speaker) |
| `feed` | its flag and the `DONATIONS` binding |
| `commons` | its flag, GitHub sign-in, and the bridge's `commons` |
| `cloud` | its flag, `speak`, and the bridge's `cloud` |

**The island's `OOGA_CHAT_FEATURES`** (in `wrangler.<env>.jsonc`): `bridge` turns on every operation but `hello`;
`outdoor` (island voices heard by Ooga Chat's audience), `cloud` (Ooga Chat speakers on clouds) and `commons` (The
Commons from Ooga Chat, read) each need `bridge`, and `commons-send` (members may also send lines) needs `commons`. This end is the authority: whatever the edge's flags say, an island deployed
with `OOGA_CHAT_FEATURES` empty refuses every outward operation, so redeploying it empty is the kill switch for the
whole path. A media feature switched off this way also runs its cleanup (#666, #667): it is not a hidden button.

## Browser contract

The app's own contract (`docs/ooga-chat-app.md`) is the source of truth for shapes; these are its server ends.

| Route | Answer |
|---|---|
| `GET /api/bootstrap` (also `/api/chat/config`) | `{ version: 1, build, environment, protocols: { identity: [1], audience: [1], media: [1] }, features: { github, x, voice, feed, speak, commons, cloud }, paths: { login: { github?, x? }, session?, logout?, audience? } }`. `build` is the staged app's (its `build.json`), so an open page hears of a newer one. `voice` is `listen`. A provider's login path appears only when it is on, the audience path only while listening is. `no-store`; rate-limited per IP |
| `GET /api/chat/health` | `{ schema: 1, environment, status, checks: { assets, database, bridge, auth: { github, x }, voice, speak, feed, commons, media, publicData } }`. `status` is `ok` (assets, D1 and bridge, and whatever is on is well), `degraded` (assets serve, something else is off or unwell) or `down` (no staged app). `bridge` is `ok`, `mismatch` (another environment or version), `unavailable` or `unbound`; `media` is `off` or `{ sfu: ok\|degraded\|off, cleanup: ok\|backlog }`; `publicData` is `ok`, `stale`, `unavailable` or `unknown` (#669, `docs/ooga-chat-operations.md`) |
| `GET /api/chat/version` | `{ schema: 1, environment, worker, build, protocols, bridge }`: the Worker version id, the app build and the bridge version, for correlating a report with a deployment |
| `GET /auth/github`, `GET /auth/x` | starts a sign-in (below); 302 to the provider, or 303 home with the result when it cannot start |
| `GET /auth/<provider>/callback` | finishes it: 303 to `/?signin=<ok\|denied\|failed\|unavailable\|rate-limited>&provider=<provider>`, nothing else in the address |
| `GET /api/chat/me` | the session (identity protocol 1, below); 401 signed out, 503 when it could not tell |
| `DELETE /api/chat/me` | deletes the account (from the app's own page); 204 |
| `POST /api/chat/logout`, `?all=1` | ends this session, or every one of the account's (from the app's own page); 204 once done |
| `GET /api/chat/avatar/<principal>/<key>` | the principal's picture on this origin (below) |
| `GET /api/chat/public/contributors` | the native Contributing Oogas panel's data for anyone (below); `public, max-age=30` with an ETag |
| `POST /donations/invoice`, `/note`, `/onchain`; `GET /donations/socket` | the native Feed the Oogas popup, through to bananapayserver (below) |
| `GET /api/chat/audience`, upgraded | the audience socket (#665, below), from the app's own page with a session |
| `POST /api/chat/media/<op>` | media signalling (#666, below), from the app's own page with a session; `publish/*` needs `speak` and GitHub |
| `GET /api/chat/commons`, upgraded | The Commons and Online Oogas (#670, below), from the app's own page, for an eligible GitHub contributor |
| `POST /api/chat/commons/name` | `{ display }` → `{ display }`: the member's name, saved as their island display name through the bridge's `display`, from the app's own page, for an eligible GitHub contributor while the Commons is on: 401 no session, 403 not eligible now, 429 too many saves (`CHAT_AUTH_LIMITER`), 400 a name the island refuses, 503 off or unanswered. The app then joins the Commons again, so the Room's welcome and every later line carry the new name |
| any other `/api/*`, `/auth/*`, `/donations/*` | a JSON 404 (`{ error: { code: "not_found" } }`), never the app's HTML |

Every other path is served from the staged app. Only `/api/*`, `/auth/*` and `/donations/*` run the Worker
(`run_worker_first`); the app's `_headers` (its content policy, `frame-ancestors 'none'`, the microphone for its own
origin only) apply to everything else. No route adds `unsafe-inline`, `unsafe-eval`, a non-`self` script or style
origin, or credentialed CORS.

## Sign-in and accounts (#663)

Anyone can sign in with GitHub or, where it is on, X, and every sign-in lands as a **listener**. Authentication never
opens a microphone or makes a speaker: speaking is a lease the audience grants (#665), checked again at every
privileged step. The island's own sign-in (`worker/src/auth.js`), which refuses a non-contributor, is untouched; Ooga
Chat's is separate code, cookies, OAuth apps and database.

**Accounts.** A principal is one provider identity, `(provider, provider_user_id)` unique, with an opaque public id
(`pr_` and 22 base64url characters) that everything per person keys on. Provider ids are text at every boundary (an X
id outgrows a safe integer). Login, display name and picture are display data refreshed at each fresh sign-in: a rename
keeps the principal. GitHub and X are never linked, however their names, emails or pictures match, and an X account is
always a listener. Email is never read.

**A sign-in.** `/auth/<provider>` stores a single-use state (its SHA-256) in D1 with its provider, a ten-minute expiry,
the SHA-256 of a nonce held in the browser's own short-lived cookie (`__Host-ooga_chat_oauth`), and for X a PKCE
verifier. The callback spends the state first (`DELETE … RETURNING`), then requires the same provider, the same browser
and an unexpired state, so a replayed, crossed (GitHub's at X's callback), stolen or stale state fails without a
session. GitHub asks no scope and reads `/user`; X uses authorization code with PKCE `S256`, a confidential exchange
(HTTP Basic with the client secret), the scopes `tweet.read users.read` (no `offline.access`), reads
`GET /2/users/me?user.fields=profile_image_url`, and revokes the token at once. Every provider call is made with
`redirect: "manual"` (Workers' fetch has no `"error"` mode), so a redirect comes back as a 3xx and fails as any refusal
does, never followed, and times out at 5 s. Results: `denied` (consent refused), `rate-limited` (429, or our own limiter), `unavailable` (402
credits, 5xx, a provider switched off), `failed` (anything else, a bad state or profile, a banned account); the reason
code goes to the Worker's log only.

**The session.** A random token in a host-only `__Host-ooga_chat_session` cookie (`HttpOnly; Secure; SameSite=Lax;
Path=/`; plain names on http for local development), stored as its SHA-256, 30 days, its last use written at most every
ten minutes. A GitHub login is the donor's name and the island's contributor key, so a GitHub sign-in with a login
another GitHub principal still holds (renamed away on GitHub, then taken) first ends that principal's sessions and its
capability answer, as the island's own sign-in does for its players. `GET /api/chat/me`:

```json
{ "schema": 1,
  "identity": { "principal": "pr_…", "provider": "github", "providerUserId": "583231", "login": "someone", "display": "Someone",
                "avatar": "/api/chat/avatar/pr_…/9f86d081884c7d65" },
  "capabilities": { "listen": true, "react": true, "speak": true, "contributor": true, "raiseHand": true },
  "eligibility": { "state": "eligible", "checkedAt": 1763000000000, "staleAfter": 900, "policy": "obl-contributor-v1" },
  "character": { "handle": "someone" },
  "expiresAt": 1765592000000 }
```

`speak`, `contributor` and `raiseHand` (the right to raise a hand *while* a speaker) are true only for a GitHub
principal whose answer is `eligible` and inside its window. They are the server's word for display; nothing a client
sends back grants anything.

**Capability.** The edge asks the island (`capability`) and keeps the answer with its time in `capabilities`. It asks
again after five minutes. If the bridge cannot answer, the last answer stands until 15 minutes after it was checked
(`staleAfter` 900 s), then reads `unknown`: a listener stays signed in, and nothing new is granted on an old answer. An
account that was eligible and is now refused reads `revoked` until it is eligible again, and its live speaking is asked
to end (`revoke`). Signing out, signing out everywhere and deleting the account also call `revoke`, and work whatever
the account's eligibility. A new legitimate contribution qualifies as soon as Oogatron reports it (the island's
unbundled-contributor fallback), with no character bundle deploy; a display name, a leaderboard number, a roster entry
or a donation never does. "Made a contribution" is the island's existing rule, unchanged: a bundled owner, or at least
one commit in the bounded Oogatron snapshot, bots and AI aliases excluded.

**Pictures.** A provider's picture address is kept only on its own image host over https (`avatars.githubusercontent.com`;
`pbs.twimg.com`, `abs.twimg.com`), sized for a face, and served on this origin at
`/api/chat/avatar/<principal>/<key>`, the key being the address's hash: a picture that changed, or an account deleted,
answers 404 rather than an old face: the account's row is read before the edge cache, which is keyed by the path alone,
so a cached copy never outlives its account or key. Only the stored address is fetched, with no cookie or token, a
redirect never followed, a
5 s limit, at most 512 KiB, and only PNG, JPEG, GIF or WebP (never SVG). It is public, as the face beside a name on
GitHub or X is, and cached a day at the edge and in the browser. A failure is a 404, and the app shows the native Ooga
face. GitHub's address is fixed per account, so a new GitHub picture shows within a day.

**Housekeeping.** Daily at 04:15 UTC the edge purges expired sessions and abandoned sign-ins (`triggers`).

**X: cost and policy, for the owner to confirm.** X documents pay-per-use credits, with user lookup listed at about
$0.010 a resource; that is a planning figure, not a verified entitlement or price. Each fresh X sign-in reads
`/2/users/me` once (it proves who authorized the sign-in, so no cache stands in for it); page loads, roster paints, zone
changes and role changes never call X, since the principal keeps its profile from its last sign-in. Before turning `x`
on: confirm `/2/users/me` access and its billed category in the developer console, set a spending cap, and treat a
credit exhaustion (402) as X sign-in unavailable while GitHub keeps working.

## Public panels and Feed the Oogas (#664)

The app's Bananas, full Contributing Oogas and Feed the Oogas reuse the island's native code; the backend gives them the
same data and payment service the island uses, for anyone, signed in or not, with no game socket and no player slot.
Browsing them never changes a voice role, zone, microphone or hand.

**Contributors.** `GET /api/chat/public/contributors` answers one envelope:

```json
{ "schema": 1, "revision": "3f2c9a1b0d4e5f67", "generatedAt": 1763121540000, "stale": false,
  "sources": { "cast": { "state": "ok", "revision": "a1b2c3d4e5f60718", "count": 56 },
               "stats": { "state": "ok", "generatedAt": 1763121540000, "source": "oogatron" } },
  "cast": [ { "handle": "ooga-dev", "github": "ooga-dev", "display": null, "joinedAt": 1756684800000, "lastCommitAt": 1759276800000 } ],
  "stats": { "meta": { "schema_version": 3, "org": "OogaBoogaX", "generated_at": "…" }, "contributors": [ … ] } }
```

- `cast` is the island's registered roster (the bridge's `cast`), whatever its size: today 56 Oogas, a different set
  from Oogatron's 70 contributor rows, and neither is a limit or an authority for speaking.
- `stats` is Oogatron's schema-3 snapshot passed through whole, checked at the boundary (schema, org, a generation time
  not in the future, at most 4,096 rows, at most 2 MiB read), so the native panel applies it with its own categories
  (commits, PRs, reviews, issues, comments), sorting, expansion and identity normalization (`contributors.js`).
- Each source's `state` is `ok`, `stale` (the last look failed, or the snapshot is over 15 minutes old: the last good
  copy is shown) or `unavailable` (none, or a snapshot over a day old: `null`, never zeros). `stale` at the top is true
  when either is not `ok`. `revision` (and the ETag) change only when what the body says changes; a matching
  If-None-Match answers 304.
- The edge asks Oogatron at most once a minute and the island at most every five minutes per isolate, so no browser
  fetches either itself. It reaches Oogatron through its `OOGATRON` service binding: Cloudflare refuses one Worker
  fetching another of the same account's `workers.dev` addresses.

**Feed the Oogas.** The same routes and wire answers as the island's relay (`worker/src/donations.js`), to the same
`bananapayserver-<env>` `PageApi` (protocol v0.2, pinned at bananapayserver `ede387d9`):

| Browser route | `PageApi` call |
|---|---|
| `POST /donations/invoice` | `invoice(request, donor, visitor)` |
| `POST /donations/note` | `note(request, visitor)` |
| `POST /donations/onchain` | `onchain(request, visitor)` |
| `GET /donations/socket?after=…` | `fetch(request)`, the WebSocket upgrade |

- Calls must come from the app's own page; bodies are at most 1 KiB; only the body and its type go on (never the
  browser's request or cookies), with the visitor's address (`CF-Connecting-IP`) beside each call and as the socket's
  `X-Client`, replacing anything the browser sent. Only `after` goes on with the socket.
- **The donor** is Ooga Chat's own session: a GitHub principal is `{ id, login }` with GitHub's numeric id (any GitHub
  account, contributor or not; bananapayserver marks a donation `verified` only when the chosen handle also matches that
  login). An X principal or a signed-out visitor is `null`, an anonymous donor whose handle is just what they typed: an
  X account never fills the GitHub id or earns the check. A session that cannot be read closes the call rather than
  quietly making a signed-in donor anonymous.
- `feed` must be on (its flag and the binding), else every call answers `{ "error": "closed" }` with 503, as does a
  bananapayserver that throws: never a simulated payment. A per-IP limiter answers `{ "error": "busy" }`, 429.
- A donation is not a contribution and grants nothing. Invoices, notes, on-chain addresses, expiry, partial and seen
  payments, settlement, prices, `network` labels (signet on staging), `minSats` and `messageMinSats` are
  bananapayserver's, unchanged; its read socket's tally, recent list and leaderboard are the same public events the
  island hears, with its own ids and `seq` for resuming and deduplicating. No second ledger, processor or relay.

## The audience (#665)

Who listens and who speaks in each outdoor zone, `main` (Main Island) and `dsb` (DSB Land), is one Durable Object in the
island's Worker: `Audience` (binding `AUDIENCE`, migration `v4`, one object named `audience`, `worker/src/audience.js`
with its model in `audience-model.js`). It is apart from the island's `Room`: listeners never take one of its 32 player
slots or receive its poses and NPC frames. One object for both zones serializes each identity's sources and leases in
one place.

**Who is listed.** One row a person a zone, keyed by public provider id (`gh:<github id>`, `x:<x id>`), never by login
and never twice, however many tabs or sources they have. In precedence: a **world speaker** (the island reports them
publishing outdoors in that zone), a **chat speaker** (one of their Ooga Chat sockets there holds an active lease), a
**listener** (one of their Ooga Chat sockets is there). Island players who are not speaking outdoors are not listed, and
nothing about interiors, private rooms or positions reaches a row. The session's `identity.participant` is the same id,
so the app finds its own row.

**Roles and leases.** Every socket joins as a listener. `setRole: speaker` asks the island's contributor policy afresh
(not the edge's cached answer), then grants a **pending** lease (still a listener; `you.speak: "pending"`) that the
microphone's publication must acknowledge within 30 s (#666) to become an **active**, muted speaker. One lease an
identity across both zones and every tab; none while the island reports the identity in its own voice anywhere (its
source wins, and its arrival ends a chat lease first: `source_in_use`); at most `AUDIENCE_SPEAKERS` (8) chat speakers a
zone and `AUDIENCE_LISTENERS` (500) listeners, proposals for #669 to measure, never satisfied by demoting an island
speaker. Leaving speaking, a real zone change, an expiry, a revocation or a closed socket end the lease and the hand.
Choosing the zone already chosen changes nothing. A listener's `setMic` is refused.

**The app's protocol** (audience protocol 1). Page: `{ type: "join", zone, protocol: 1 }`, `{ type: "resync", zone }`,
`{ type: "setRole", requestId, role }`, `{ type: "setMic", requestId, muted }`. Server:

```json
{ "type": "snapshot", "zone": "main", "epoch": 1763120000000, "revision": 41,
  "participants": [ { "id": "gh:583231", "generation": 1763121000000, "source": "app", "role": "listener", "login": "someone",
                      "display": "Someone", "face": "/api/chat/avatar/pr_…/…", "contributions": null, "muted": true,
                      "provider": "github", "character": null, "mic": "off", "speaking": false, "hand": "", "self": true } ],
  "you": { "id": "gh:583231", "speak": "eligible" }, "limits": { "listeners": 500, "chatSpeakers": 8 }, "features": ["roles-v1"] }
{ "type": "delta", "zone": "main", "epoch": 1763120000000, "base": 41, "revision": 42, "upsert": [ … ], "remove": [ { "id": "x:9", "generation": 1763120500000 } ] }
{ "type": "you", "zone": "main", "you": { "id": "gh:583231", "speak": "pending" } }
{ "type": "result", "requestId": 3, "ok": false, "error": { "code": "source_in_use", "retryable": false }, "you": { … } }
```

`you.speak` is `eligible`, `pending`, `active`, `denied` (eligible, but the island has this identity) or `none`; while a
lease is held, `you.lease` is its generation, which the page names in its media calls (#654). A
delta's `revision` is always `base + 1` within an epoch; the epoch is fixed for the object's life (it changes only if its
storage is reset), and each zone's revision is stored, so an object woken from hibernation carries on where it was and
clients never resync for a nap. Generations follow the clock and only rise. A request repeated with the same
`requestId` gets its first answer again. Close codes: 4401 (signed out, deleted, or the hourly re-authentication: the
app checks its session and reconnects), 4426 (another protocol), 4429 (full, too many tabs, or too many sockets
lately), 4400 (an unreadable frame), 4503 (listening is off).

**The island's panel** (`audience-v1`, advertised in the Room's `welcome` only with the bridge on and the binding): the
page's `audience-view` and `audience-resync` (`{ v: 1, zone }`) are answered by the Room (`room-audience.js`) with
`{ t: "audience", v: 1, kind: "snapshot", epoch, rev, zone, part, parts, you, rows }` in parts of 100 rows, and then
`kind: "delta"` with `base`, relayed from the Audience in order for the zones a panel is open on (`watch`). Rows there
use the panel's shape (`source` `world` or `chat` on speakers only, `mic` `on`/`muted`/`off`, `avatar`, `self`). An
island player's `you.speak` is `active` while they speak outdoors, else `eligible`.

**The island's word.** The Room calls `world(seq, speakers, active)` whenever who publishes outdoors (players the
outdoor handshake has opened, #667) or who is in its voice at all changes, newest `seq` winning; the Audience stores it.
A world speaker's `contributions` (for ordering only) are Oogatron's counts, read by the Audience at most every ten
minutes; an unknown total sorts last and is never shown as zero.

**For the clients (hotpixelgroup).** Two notes from wiring this to #675 and #677. First, the app keys its own row on the
session's `principal`. The audience ids are `gh:`/`x:` ids, as the island panel's contract already has them, so the app
should find itself by `self: true`, `you.id` or the session's new `identity.participant`. Second, after an ordinary
reconnect, a snapshot can carry the same epoch and revision the app already holds. The fix is the app's: take an equal
snapshot after a reconnect as a confirmation (the review on #677). The two clients' row shapes differ (`source`
`app`/`chat`, `face`/`avatar`, `muted`/`mic`). The server sends each client its own shape from one model, and a single
shape later is welcome.

## Media (#666)

Ooga Chat's audio goes publisher to SFU to listener on the environment's one Realtime SFU app, the island's own, so a
track is pulled straight from whoever publishes it, island player or Ooga Chat speaker. Nothing in a Worker or Durable
Object carries or mixes audio, and the SFU secret stays in the island Worker. The broker is the Audience object
(`audience-media.js`); the edge passes calls on (`worker/chat/src/media.js`).

**What may be pulled is the server's choice.** A client names only its own audience connection (`connection`, from its
snapshot), never a session or track. `receive/sync` pulls every speaker of the connection's zone that is publishing,
other than its own identity: island speakers by the publication reference the Room hands over with `world` (never
given to a client), and Ooga Chat speakers whose lease is active and whose microphone is up. It checks before the SFU
call and again after it; anything that changed in flight (a zone, a lease, a publication) keeps nothing: the tracks the
SFU made are closed before the reply. At most 64 pulled tracks a connection. A listener never needs a microphone or a
publish session.

**Publishing.** One local audio track, the microphone, on a session of its own, only under the connection's pending or
active lease of the same generation: `publish/open`, `publish/offer` (answered), then `publish/ready`, which makes the
lease an active, muted speaker and the publication pullable, with a fresh publication generation. Playback, a mix or a
loopback is never published. `publish/close` goes back to listening and keeps the receive session.

**Retiring.** A publication that ends (Leave Voice, a lease ending, a real zone change, a revocation, the island
taking the identity, the socket going) leaves the catalog at once; its track is closed at the SFU, and so is every
listener's pull of it, server-side, without waiting for the listener, who is told to `sync`. An island speaker leaving
the outdoors (a new `world` without them) or publishing again (a new generation) closes every pull of the old
publication the same way. A listener changing zone loses the old zone's pulls at once.

**Telling receivers.** Every connection with a receive session hears `{ type: "media", op: "sync", closed? }` over its
audience socket when its pulls were closed (`closed` the mids, so the page drops them at once) and when its zone's
publications change (a chat speaker going live, an island speaker's publication arriving or changing), so a page pulls a
new voice without polling. A mute changes no publication and asks nobody to sync.

**Durable cleanup.** Every close goes through a queue kept in storage (`mediaCleanup`) and retried by the alarm until
the SFU confirms (`close_track_error` counts as gone) or an hour has passed, after every client has left too. A
session whose tracks are unknown (a failed call) is swept whole, and any track that sweep finds and fails to close is
kept for the next try. Two runs over one job (the alarm's and a new close merged into it) never remove another job. With
64 jobs pending, publishing and receiving wait
(`cleanup_pending`) while giving things up still works. A woken object restores each connection's media from
`media:<connId>` and sweeps the sessions of a socket that went while it slept.

**Ops** (`POST /api/chat/media/<op>`, body `{ connection, generation?, sdp?, mid?, mids? }`, at most 256 KiB, one at a
time per connection, `CHAT_MEDIA_LIMITER` per principal): `ice` (TURN credentials, as the island's voice has them),
`receive/open`, `receive/sync` (`{ tracks: [{ participant, mid }], closed, sessionDescription,
requiresImmediateRenegotiation }`), `renegotiate`, `receive/close`, `publish/open`, `publish/offer`, `publish/ready`,
`publish/close`, `leave`. Errors are `{ error: { code, retryable } }`: `stale_epoch` (another connection's, or a lease
that moved on), `capability_required`, `permission_changed`, `receive_required`, `cleanup_pending`, `voice_unavailable`,
`upstream_failed`.

**The island hears Ooga Chat speakers.** The Audience sends the Room its speakers' publications
(`audienceSources`: GitHub id, zone, reference, generation) whenever they change. The Room keeps the list in its
storage, so it survives the Room's hibernation; the Audience keeps the last list it delivered, so a wake sends only a
change and a failed send is tried again. An island player whose outdoor grant
is open in a zone (#667) gets that zone's Ooga Chat speakers as voice peers by GitHub id, pulls them through its usual
`/api/voice/pull` by the Audience's reference alone (checked again after the SFU call), and loses them, closed at the
SFU, when they stop. An island player without a grant never hears them. A chat speaker's id is never an island player's
too: the island's own voice ends a chat lease first.

**Capacity, for #669 to measure.** Many listeners mainly cost SFU egress; many speakers cost each listener's decoding
and downlink. The worst case to test is every island outdoor publisher (up to 32) plus 8 Ooga Chat speakers, 40
publications a listener. If direct tracks fail the phone target, a server-side mix is a separate design with its own
cost, latency and security review; no speaker is dropped to fit.

## The privacy boundary (#667)

The guarantee: the island's private audio (a cave, a level below, a Sphere room, the Bifrost chamber, a DSB room, any
other scene, a voice link) is never discoverable or subscribable through Ooga Chat, and a valid transition out of the
outdoors cannot carry new private microphone samples to a subscription that was public. Launch waits on this.

**Who decides the scope.** The page decides first and finer, from the body's own geometry (`src/js/outdoor-scope.js`,
#658: a cave's doorway plane, the Sphere's shell), and asks the Room with the handshake (#661). The Room admits only a
scope its own registry agrees with (`worker/src/outdoor-policy.js`), from what it holds about the player: its zone, its
body, a level crossing (`blendTo`) and a cabinet seat. The registry is default-deny, every public zone named one by one:

| Zone | Scope |
|---|---|
| `outside`, `between`, `sphere`, `rainforest`, `bifrost` | `main` |
| `dsb-outside` | `dsb` |
| no body; any crossing to or between levels; a seat at a hall cabinet (the cave apron's outdoor seats are `outside`) | none |
| every other zone, known or not: `hq`, `hq-basement`, `rainforest-under`, `repos` (Merge Rock, no decision yet), `sphere-0`…`sphere-9`, `bifrost.chamber`, every DSB room, every other scene's zone | none |

A new outdoor is added here with a check; a new interior needs nothing to stay excluded. The checks enumerate the island's
world zones and DSB Land's rooms from their own sources, so a new one is caught as it lands.

**The handshake** (the Room's `outdoor-voice-v1`, offered only with the island's `outdoor` switch; frames in
`docs/auth-and-presence.md`, "Outdoor voice bridge"). Each connection's grant is `none`, `open` or `closing`:

```
 none ──enter(epoch, scope), Room agrees──▶ open ──leave(≥epoch), or the Room's own view disagrees──▶ closing
  ▲                                                                                                    │
  └──────────── closed(epoch): the Audience confirms no outdoor subscription to the publication is left ──┘
```

- Frames are handled one at a time a connection, in order. An epoch the page gave up never opens again, however it is
  replayed; an `open` answers only the latest `enter`, for the scope asked; a repeated `enter` of the open epoch opens
  nothing new; a `leave` below the open epoch closes nothing that is held.
- `enter` is refused with a reason (`scope`, `interior`, `descending`, `no-body`, `cabinet`, `pending` while another scope
  is still closing, `unavailable` with the switch off).
- The Room takes a grant back **by itself** whenever its own view stops agreeing: a zone message (the next scene's zone,
  a room, a level), a body released or changed, a crossing begun, a hall cabinet taken, the switch found off on a wake.
  This closes the transition gap found in review on #673 and #676, where a page keeps reporting `main` through a scene
  change: the next scene's zone reaches the Room, and the grant goes, unprompted.
- **The barrier, in order.** A grant leaving `open` first leaves the island's word (`world`), so the Audience removes the
  publication from its catalog and refuses any new subscription. The Audience then closes, at the SFU, every Ooga Chat
  listener's pull of that publication (#666), and the Room closes every island player's pull of Ooga Chat speakers that
  the grant allowed. The Room sends `closed` only when the Audience answers that none of those closes for this
  identity is still unconfirmed. If the SFU has not confirmed (a timeout, a 5xx), nothing is said: the grant stays
  `closing`, the page keeps its microphone track held, the close is retried from the Audience's durable queue, and its
  confirmation (`audienceConfirmed`, sent by whichever cleanup run finishes it) sends `closed` when it comes. If the
  Audience itself could not be told, the Room tells it again from its own alarm, backing off from 2 s to a minute, until
  it lands, so a grant the Room took back unprompted never leaves its publication listed. Each sweep also asks again
  for every grant still `closing`, so a lost confirmation costs a minute, not a microphone held for good. The page's own
  retries of `leave` ask again too.
- A socket closing takes its grants back. A new connection of the same account gets its `welcome` only after the old
  connection's word has reached the Audience (a bounded wait, 3 s).
- An island player with an open grant hears its zone's Ooga Chat speakers (`sources`) and the zone's listener count
  (`audience`), so a lone outdoor speaker is not "alone". Without a grant, never.

**Samples already sent.** The guarantee is about new samples. Audio the microphone captured while the grant was open
may still be in flight to a subscriber for a moment after; what is said after the page's `leave`, with its track held, is
never captured into the publication, and no subscription survives to the next unheld sample: the hold lifts only on
`closed`, which follows the SFU's confirmation.

**The kill switch.** Deploying the island Worker with `OOGA_CHAT_FEATURES` lacking `outdoor` stops the handshake from
being offered, takes back every grant a woken Room holds (`closed`, reason `unavailable`), lists no island publication in
the Audience, and closes every pull of one. Unrelated island voice is untouched. Turning `bridge` off as well stops
every outward operation but `hello`, `cast` and `revoke`.

**Threat model.** No web application can stop someone from re-broadcasting audio they can already hear, and no server
can prove a browser's physical place in a game the browser simulates. The Room's view is built from what the page
reports (zones, bodies, crossings), so a deliberately modified page could claim to stand outdoors while it does not.
What this design guarantees is that the product, used as built, never exposes private audio: public grants exist only
for zones named as outdoors, every application transition the Room sees takes the grant back, the page's hold and the
server's confirmed closes together keep new private samples out of anything public, and an older page without the
handshake is never admitted at all.

## Reactions, hands and clouds (#668)

**Reactions.** Anyone in a zone, listener or speaker, GitHub or X, sends `{ type: "reaction", requestId, emoji }` over
the audience socket. The emoji must pass the island's own policy (`reaction-policy.js` over `emoji-data.js`: one known
emoji, plain or in a skin tone, never text). The server supplies the sender and time, and every accepted occurrence is
its own event, even the same emoji twice:

```json
{ "type": "reaction", "eventId": "r1763121000123", "participantId": "gh:583231", "zone": "main", "epoch": 1763120000000,
  "emoji": "🔥", "at": 1763121000123, "expiresAt": 1763121002723 }
```

Each lives 2,600 ms on its own (`REACTION_MS`, the island's own display time), so a new one never ends an earlier one or
the hand beneath it. A retried `requestId` gets its first answer and no second event. Limits: 3 a second with a burst
of 6 per identity across its tabs (the island's room's own), and per zone 30 a second with a burst of 60 while the zone
holds up to about 160 people, shrinking as it fills so its fan-out stays within `AUDIENCE_FANOUT` frames a second (5,000:
10 a second at 500 people, never under one; #669, `zoneReactHz` in `audience-model.js`). Nothing is kept: a snapshot or reconnect carries hands, never past reactions. The island's panels on
a zone get each as `{ t: "audience", kind: "react", id, e, rid }`; an island player with an open outdoor grant gets a
GitHub account's as the bridge's `{ t: "outdoor", op: "react", rid, id, e, speaker }` (an X id does not fit the bridge's
account id, so those show in the panel alone). Both carry the event's id, so a page that hears both shows it once.
An island speaker's own reactions while its grant is open reach Ooga Chat's listeners in its zone too.

**Hands.** `{ type: "hand", requestId, on, tone?, emoji? }`: only an active speaker raises or pins one (a listener's,
or a pending speaker's, is refused); lowering is always allowed and idempotent. The roster's `hand` is the pinned emoji
(`hand-emoji-v1`) or the hand in the chosen skin tone, and it stays beneath reactions until lowered, the speaker goes
back to listening, the zone really changes, or the lease ends. It rides the connection's attachment, so a wake keeps it
once; a new lease starts without one. An island outdoor speaker's raised hand is in the roster from its own `hand`.

**Clouds.** An active Ooga Chat speaker (GitHub only) sits on one seat of its zone's catalog (`worker/src/cloud-seats.js`,
`cloud-seats-v1`: `main-cloud-1`…`main-cloud-8` over the island, `dsb-cloud-1`…`dsb-cloud-8` in DSB Land's sky, each
drawn only in its own zone), taken when its microphone goes live and kept for the life of the lease. A full catalog is
no speaker, never a shared seat. The character is the island's canonical one for that GitHub account, from the
contributor policy at the lease's grant, never one a client named. The Audience sends the Room its clouds
(`audienceClouds`) whenever they change (both keep the last list, so it outlasts either one's hibernation and a failed
send is retried), and the Room sends every page `{ t: "clouds", v: 1, revision, clouds: [{ id,
character, zone, seat, seatRevision, lease, mic, hand, login, display }] }` (and the list now after each `welcome`;
`login` and `display` name the speaker over their cloud and in Online Oogas). The world (#659)
draws a seated speaker from its seat, the scene and its clock, and ghosts that character's NPC while any source owns
it: the island's own drivers (each player's `body`) and these clouds together are the canonical owner set, so one
leaving never un-ghosts a character still driven elsewhere. Clouds need the island's `cloud` switch; off, none is sent
and the welcome omits `cloud-seats-v1`. Ending a lease ends its cloud. No cloud takes a game slot or names a private
room.

## The Commons and Online Oogas (#670)

The Commons is the island's one Ooga Chat conversation, and Online Oogas its live players, shown in the app to a GitHub
contributor who is eligible now. Nothing is copied: `GET /api/chat/commons` (upgraded, from the app's own page) goes
through the private bridge (`ChatBridge.fetch /commons`) to the island's `Room` as a **community member**, a second kind
of socket beside its players (`worker/src/room-commons.js`). The edge refuses with a closed socket: 4401 signed out,
4403 an X account or a contributor answer that is not eligible and fresh, 4429 too many sockets lately (the shared
`CHAT_SOCKET_LIMITER`), 4503 the Commons is off. The bridge checks the assertion again (this environment, this version,
GitHub, eligible) and needs the island's `commons` switch; the Room checks the account against its own cast and
contributor rule and its ban list before accepting, as it does a player.

**One conversation.** A member's `{ t: "chat", text, clientId }` goes through the Room's own `say`: the same ring of the
last 100 lines, ids, order and timestamps, the same Unicode policy (`chat-unicode-v1`), the same retry dedupe and the
same rate bucket by account, so a contributor's island tabs and Ooga Chat tabs together keep to 3 lines and 1 a second.
Every line reaches every player and member once, with the island's own `{ t: "chat", ... }` frame; the member gets its
`chat-ack` or `chat-rejected` as a player does. Retention is the island's: in memory, gone on a wake. The display name is
the island's for that account when it has one, so a line reads the same from either app.

**Online Oogas, without positions.** The member's welcome is `{ t: "community", v: 1, op: "welcome", epoch, send, you:
{ id, login, display }, players: [...], features: ["chat-unicode-v1", "commons-v1"] }` then `chat-history`. A player is `{ id, login,
display, body, zone, voice, muted, hand, handTone, handEmoji }`, and after that only the Room's `join`, `leave`, `body`,
`zone`, `vstate`, `hand`, `chat` and `clouds` broadcasts are relayed. No pose, snapshot, distance, NPC frame, SFU id,
voice link, private-conversation frame, reaction over a body, game state or chalk ever reaches a member.

**The contract names (#670), over the island's own frames.** No second chat format: `communitySnapshot` is the welcome,
`commonsHistory` the `chat-history` after it, `onlineDelta` the relayed `join`, `leave`, `body`, `zone`, `vstate` and
`hand` (and `clouds` for cloud speakers), `commonsMessage` the island's `chat` line `{ t: "chat", id, at, login, name,
text }`, and the acknowledgement and refusal its `chat-ack { clientId }` and `chat-rejected { clientId, reason }`
(`rate`, `conflict`, `read_only`; a line the Unicode policy refuses is dropped unanswered, as the island's is). **Reconnects:** history is the ring as it stands, merged by `id`, which
follows the Room's clock; `epoch` is the life of the Room's memory, so a welcome with a new `epoch` says the Room woke or
restarted and whatever was said meanwhile is gone (never stored anywhere, attachments included), not that it was quiet.
A socket kept open across a hibernation misses nothing and gets no second welcome.

**The capability matrix.**

| | Signed out | X account | GitHub, not a contributor | GitHub contributor (eligible) | Island player |
|---|---|---|---|---|---|
| Public panels, Feed the Oogas (#664) | yes | yes | yes | yes | yes |
| Listen in the audience (#665) | no | yes | yes | yes | in its own world |
| Reactions, hand in the audience (#668) | no | reactions | reactions | reactions; a hand as a speaker | island reactions |
| Speak from a cloud (#666, #668) | no | no | no | yes, with `speak` and `cloud` | its own voice |
| The Commons: read and send lines | no | no | no | yes, with `commons` | yes |
| Online Oogas: who is here, zone, voice, hand | no | no | no | yes, without positions | yes, with distances |
| Private conversations, voice links | no | no | no | no (island only) | yes |
| A body, poses, NPC host, games, chalk | no | no | no | no | yes |
| Edit the display name | no | no | no | yes, the name field at the top of The Commons (`POST /api/chat/commons/name`), saved as the island's own; shown in both | yes (`PATCH /api/me`) |

**Access ends.** Signing out, deleting the account or losing eligibility (the edge's `revoke`, #663) closes every member
socket of that account at once (`communityRevoke`); the Room's minute sweep closes one past its hourly re-authentication
deadline (`authUntil`, never past the session's own), no longer a contributor, banned, or silent past `STALE_MS` with its
auto-answered pings. A Room wake restores members from their attachments as members, never as players.

**Bounds and cost.** At most 128 members a Room and 3 an account (`COMMUNITY_MAX`, `COMMUNITY_PER_ACCOUNT`); the next is
closed 4429. A member holds no player slot (`MAX_PLAYERS` is the island's alone), voice or NPC follower count. While any
member is connected the Room keeps its once-a-minute sweep, as it does for a player, and nothing else: a member is
relayed only what the Room already broadcasts. With the island's `commons` switch off nobody new connects; members
already in leave at their next sweep or reconnect.

**Rollout.** Reading first: `commons` alone lets members in with `send: false`, and a line gets `chat-rejected` with
`read_only` (the app keeps the draft); `commons-send` then opens sending, staging before production. Private text stays
the island's: the standalone app gets no private-conversation or voice-link capability until a reviewed origin-safe
design exists (a pad must never be used independently from two origins).

## Secrets and variables

Names only; values live in Workers secrets and the owner's password manager (`worker/chat/dev.vars.example`).

| Name | Kind | Where | What |
|---|---|---|---|
| `ENVIRONMENT` | var | edge and island | `staging` or `production`; must match across the bridge |
| `SITE_ORIGIN` | var | edge | the app's origin, for redirects, cookies, callbacks and the Origin check |
| `FEATURES` | var | edge | the edge's flags, above |
| `OOGA_CHAT_FEATURES` | var | island | the bridge's flags, above |
| `GITHUB_CLIENT_ID` | var | edge | Ooga Chat's own GitHub OAuth App in this environment (not the island's) |
| `GITHUB_CLIENT_SECRET` | secret | edge | that app's secret |
| `X_CLIENT_ID` | var | edge | the X app's OAuth 2.0 client id (confidential web app) |
| `X_CLIENT_SECRET` | secret | edge | that app's secret |
| `AUDIENCE_LISTENERS`, `AUDIENCE_SPEAKERS`, `AUDIENCE_FANOUT` | var | island | the audience's caps a zone and its reaction fan-out budget (`docs/ooga-chat-operations.md`) |
| `REALTIME_APP_ID`, `REALTIME_SECRET` | var, secret | island only | the environment's one SFU app, shared with Ooga Chat through the bridge; never on the edge |

CI deploys with the repository's account-owned `CLOUDFLARE_API_TOKEN` (Workers Scripts and D1 edit). Frontend
contributors need none of these values: they work against the app's fixture adapter.

## Operator checklist

Done:
- [x] D1 databases `ooga-chat-staging` and `ooga-chat-production` created (2026-11-14) and in the configs.
- [x] Staging and production configs with separate D1, bridge target, payment target and rate-limit namespaces.
- [x] Bridge kill switch (`OOGA_CHAT_FEATURES`) and `ENVIRONMENT` on both island configs, both empty or off.
- [x] Manual deploy workflows; production only from `rock`.

To do, by the owner:
- [ ] Record the account, Workers plan and the zone plan in the private runbook (no secrets or tokens in issues).
- [ ] Move `ooga.chat` to this account; then add `staging.ooga.chat`, the production custom domain, the `www` redirect
      and Always Use HTTPS, and record certificate status.
- [x] GitHub OAuth Apps registered in OogaBoogaX (2026-11-14): "Ooga Chat (staging)" and "Ooga Chat", callbacks
      `<SITE_ORIGIN>/auth/github/callback`, client ids in `vars`.
- [ ] Generate each app's client secret and store it with `wrangler secret put GITHUB_CLIENT_SECRET --config
      ../wrangler.ooga-chat.<env>.jsonc` from `worker/`, once that environment's edge is deployed.
- [x] X developer account "Ooga Chat" on @w_s_bitcoin (pay-per-use, 2026-11-14) and its "Ooga Chat" app: OAuth 2.0
      confidential web app, read only, no email, callbacks `<SITE_ORIGIN>/auth/x/callback` for both environments, its
      client id in both configs' `vars`.
- [ ] Regenerate the X app's client secret and store it with `wrangler secret put X_CLIENT_SECRET` for each edge; buy
      credits and set the console's spending limit, then confirm the price of `/2/users/me` there, before turning `x` on.
- [ ] Deploy the island's Worker with the `ChatBridge` entrypoint before the edge's first deploy, or the edge's
      deploy fails on the binding.
- [ ] Before changing any existing Worker's compatibility date, verify WebSocket close and hibernation on staging.

## Local development

Run the island and the edge side by side; wrangler's dev registry joins the `OBL` binding by service name.

```bash
cd worker && npm run dev
```

```bash
cd worker && npm run migrate:chat:local && npm run dev:chat -- --env-file chat/.dev.vars --var FEATURES:github,listen
```

The edge listens on `http://localhost:8788` with `SITE_ORIGIN` overridden to match, so its cookies are plain local
ones. `chat/.dev.vars` (copied from `dev.vars.example`, gitignored) holds a development OAuth app's secret, never
production's. Both local Workers read `ENVIRONMENT` `staging` from the staging configs, so the bridge accepts the edge.
Without the app's build on the branch (`npm run build:ooga-chat`, #651), `worker/chat/stage.mjs` stages a placeholder page
instead, so the edge still deploys and answers its API, and health says `down` for the app.

## Deployment order and rollback

Order: additive D1 migrations and the island's bridge entrypoint (with `OOGA_CHAT_FEATURES` off) first; then the edge
with every `FEATURES` flag off; then the app's compatible build; then each capability, staging before production,
public browsing before sign-in before listening before speaking (the release runbook in `docs/ooga-chat-operations.md`).

Rollback: turn new admissions off (the edge's `FEATURES`, or the island's `OOGA_CHAT_FEATURES` for anything outward),
let the media cleanup (#667) retire what is open, then redeploy the previous compatible Worker version
(`npx wrangler rollback --config ../wrangler.ooga-chat.<env>.jsonc` from `worker/`, or the previous commit through the
workflow). Never drop D1 tables or Durable Object namespaces as a rollback: old clients and cleanup still need them. A
DNS change alone does not end an open audio session; the island's kill switch does.
