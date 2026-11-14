# Ooga Chat backend

Ooga Chat (#650) is a standalone app at `ooga.chat`: authenticated listeners hear the island's public outdoor
conversation, and verified GitHub contributors can speak from a cloud. The app itself, its build and its browser
contracts are `docs/ooga-chat-app.md`. This document is the server side: the Cloudflare resources, the edge Worker that
serves the app, the private bridge into the island's Worker, the feature flags, secrets, deployment order and rollback.
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

Staging lives on workers.dev for now: `ooga.chat` is on Squarespace's nameservers (checked 2026-11-14), not a zone in
this account. Once the zone is moved here, staging moves to `staging.ooga.chat` (a custom-domain route, `SITE_ORIGIN`
and its OAuth callbacks together), and production's custom domain can be created. Until then a production deploy fails
at its route, which is the intended state. The canonical origin is the apex: `www.ooga.chat` becomes a proxied record
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
| `revoke` | `bridge` | ends whatever the principal holds live (leases, publications, a cloud); added by #665, and until then the edge treats `unknown_operation` as nothing to end |

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
Commons from Ooga Chat) each need `bridge`. This end is the authority: whatever the edge's flags say, an island deployed
with `OOGA_CHAT_FEATURES` empty refuses every outward operation, so redeploying it empty is the kill switch for the
whole path. A media feature switched off this way also runs its cleanup (#666, #667): it is not a hidden button.

## Browser contract

The app's own contract (`docs/ooga-chat-app.md`) is the source of truth for shapes; these are its server ends.

| Route | Answer |
|---|---|
| `GET /api/bootstrap` (also `/api/chat/config`) | `{ version: 1, build, environment, protocols: { identity: [1], audience: [1], media: [1] }, features: { github, x, voice, feed, speak, commons, cloud }, paths: { login: { github?, x? }, session?, logout?, audience? } }`. `build` is the staged app's (its `build.json`), so an open page hears of a newer one. `voice` is `listen`. A provider's login path appears only when it is on, the audience path only while listening is. `no-store`; rate-limited per IP |
| `GET /api/chat/health` | `{ schema: 1, environment, status, checks: { assets, database, bridge, auth: { github, x }, voice, speak, feed, commons } }`. `status` is `ok` (assets, D1 and bridge), `degraded` (assets serve, something else is off) or `down` (no staged app). `bridge` is `ok`, `mismatch` (another environment or version), `unavailable` or `unbound` |
| `GET /api/chat/version` | `{ schema: 1, environment, worker, build, protocols, bridge }`: the Worker version id, the app build and the bridge version, for correlating a report with a deployment |
| `GET /auth/github`, `GET /auth/x` | starts a sign-in (below); 302 to the provider, or 303 home with the result when it cannot start |
| `GET /auth/<provider>/callback` | finishes it: 303 to `/?signin=<ok\|denied\|failed\|unavailable\|rate-limited>&provider=<provider>`, nothing else in the address |
| `GET /api/chat/me` | the session (identity protocol 1, below); 401 signed out, 503 when it could not tell |
| `DELETE /api/chat/me` | deletes the account (from the app's own page); 204 |
| `POST /api/chat/logout`, `?all=1` | ends this session, or every one of the account's (from the app's own page); 204 once done |
| `GET /api/chat/avatar/<principal>/<key>` | the principal's picture on this origin (below) |
| `GET /api/chat/public/contributors` | the native Contributing Oogas panel's data for anyone (below); `public, max-age=30` with an ETag |
| `POST /donations/invoice`, `/note`, `/onchain`; `GET /donations/socket` | the native Feed the Oogas popup, through to bananapayserver (below) |
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
  fetches either itself.

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
public browsing before sign-in before listening before speaking (#669's runbook).

Rollback: turn new admissions off (the edge's `FEATURES`, or the island's `OOGA_CHAT_FEATURES` for anything outward),
let the media cleanup (#667) retire what is open, then redeploy the previous compatible Worker version
(`npx wrangler rollback --config ../wrangler.ooga-chat.<env>.jsonc` from `worker/`, or the previous commit through the
workflow). Never drop D1 tables or Durable Object namespaces as a rollback: old clients and cleanup still need them. A
DNS change alone does not end an open audio session; the island's kill switch does.
