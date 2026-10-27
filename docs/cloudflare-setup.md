# Cloudflare setup

The island runs as two Cloudflare Workers in the account `1e5c1e8f7c343bf6cabced151b1ae2c6`. Each serves the staged site (`npm run build:site` → `_site/`) from static assets plus GitHub sign-in on D1, the island room and voice (see `docs/auth-and-presence.md`):

| Worker | Address | Config | Deploys |
|---|---|---|---|
| `oogaboogaland-staging` | https://oogaboogaland-staging.wickedsmartbitcoin.workers.dev | `wrangler.staging.jsonc` | by hand on `rock` (`cloudflare-staging.yml`) |
| `oogaboogaland-production` | https://oogabooga.land (www redirects there; the workers.dev address serves the page signed out) | `wrangler.production.jsonc` | by hand on `rock` (`cloudflare-production.yml`) |

The two share code and nothing else: each has its own D1 database, room, OAuth App, Realtime app, secrets and rate-limit counters. Everything below is done once per Worker.

## What exists, per Worker

| Thing | Name | Set where |
|---|---|---|
| D1 database | `oogaboogaland-staging`, `oogaboogaland-production` | `d1_databases` (`database_id`), migrations in `worker/migrations` |
| Rate limiters | `AUTH_LIMITER` 10 sign-ins a minute per IP; `ROOM_LIMITER` 20 room connections and `VOICE_LIMITER` 120 voice calls a minute per player; `TESS_LIMITER` 5 questions to Tess a minute per IP | `ratelimits` (staging namespaces 2001–2005, production 1001–1005) |
| Durable Object | `Room`, one named `island` | `durable_objects`, `migrations` |
| Cron | daily 04:00 UTC, purges expired sessions and Tess's questions not asked for 90 days | `triggers` |
| Service binding | `DONATIONS` → `bananapayserver-staging`'s `PageApi` on staging, `bananapayserver-production`'s on production | `services`, with `/donations/*` in `run_worker_first`. The bound Worker must exist before a deploy carries the binding |
| Vars | `SITE_ORIGIN`, `GITHUB_CLIENT_ID`, `REALTIME_APP_ID`; optionally `TESS_DAILY_CENTS` (Tess's daily cap, 50 when unset) and `STUDIO_HOST_IDS`, the comma-separated numeric GitHub ids that may host DSB Studio (unset, empty or malformed: nobody; see `docs/dsb-studio-session.md`) | `vars` |
| Worker secrets | `GITHUB_CLIENT_SECRET`, `REALTIME_SECRET`; optionally `ANTHROPIC_API_KEY` for Tess's answers, and `GITHUB_TOKEN`, a fine-grained token with no repository permissions (public read only) that lifts the totems' GitHub scans from 60 requests an hour per Cloudflare address to 5,000 for the token. Give each Worker its own token: staging runs on `workers.dev`, where the Cache API stores nothing and `/api/totems` has no limiter, so every staging request is an authorized GitHub call and a token shared with production could be drained through staging. Fine-grained tokens expire (the default is 30 days): set a reminder, or the longest expiry GitHub allows. An expired or revoked token answers 401 and the scan carries on unauthenticated, so the totems keep working on the shared 60 an hour until the secret is replaced | `wrangler secret put` |
| Realtime SFU app | `oogaboogaland-staging`, `oogaboogaland-production` | Realtime → Serverless SFU |
| GitHub OAuth App | one per Worker, no scopes | the OogaBoogaX org's Developer settings |
| GitHub repo secret | `CLOUDFLARE_API_TOKEN` | OogaBoogaX repo Settings → Secrets and variables → Actions |

## Who administers it

Workers, databases, rooms, rate limiters, secrets and Realtime apps belong to the account, so any of its Super Administrators (or Administrators) can change, redeploy or rotate them whoever created them. Two things are tied to an owner, so they live where they outlast any one person:
- The deploy token is an **account-owned** API token (Manage Account → Account API Tokens), not a personal one.
- The OAuth Apps belong to the **OogaBoogaX** GitHub org, where every org owner can manage them.

Secrets cannot be read back once set; keep the OAuth client secrets, Realtime app secrets and the Anthropic key in a shared password manager. A lost one is regenerated and set again.

## One-time setup, per Worker

Run from `worker/` after `npm ci`, logged in with `npx wrangler login` as a member of the account (`npx wrangler whoami` lists it). `<env>` is `staging` or `production`.

1. **D1.** `npx wrangler d1 create oogaboogaland-<env>`; put its id in `database_id` (wrangler may offer to add a second binding: keep only `DB`).
2. **GitHub OAuth App** (OogaBoogaX → Settings → Developer settings → OAuth Apps → New): homepage `https://oogaboogaland-<env>.wickedsmartbitcoin.workers.dev`, callback `https://oogaboogaland-<env>.wickedsmartbitcoin.workers.dev/auth/callback`. Put the client id in `vars.GITHUB_CLIENT_ID`, then `npx wrangler secret put GITHUB_CLIENT_SECRET --config ../wrangler.<env>.jsonc`.
3. **Voice.** dash.cloudflare.com → Realtime → Serverless SFU → Create `oogaboogaland-<env>`; put the App ID in `vars.REALTIME_APP_ID`, then `npx wrangler secret put REALTIME_SECRET --config ../wrangler.<env>.jsonc` with the App token. Without it **Join voice** says voice is unavailable and everything else works.
4. **Tess's answers** (optional). An Anthropic API key from a workspace with a monthly spend limit, one key per Worker: `npx wrangler secret put ANTHROPIC_API_KEY --config ../wrangler.<env>.jsonc`. Without it `/api/tess` answers `closed` and Tess says only what the page knows by itself.
5. `npm run deploy:<env>`: builds `_site`, applies the D1 migrations and deploys.
6. **Deploy token**, once for both: Manage Account → Account API Tokens → Create, with *Workers Scripts → Edit* and *D1 → Edit* on this account. Save it in the OogaBoogaX repo as `CLOUDFLARE_API_TOKEN`.

## The oogabooga.land domain

The zone `oogabooga.land` is in this account. Production serves the apex as a Worker Custom Domain (`routes` in `wrangler.production.jsonc`). `www` is a proxied DNS record (`CNAME www → oogabooga.land`) that a Redirect Rule in the zone (Rules → Redirect Rules, "Redirect from WWW to root", 301, keeping the path and query) sends to the apex; it never reaches the Worker. `SITE_ORIGIN` is `https://oogabooga.land`, and the production OAuth App's homepage and callback match it (`https://oogabooga.land/auth/callback`): sign-in cookies belong to that host alone. A Custom Domain can't be created over an existing DNS record for the same name, so a record left over from another host is deleted first. A deploy that changes `routes` needs *Zone → Workers Routes → Edit* on `oogabooga.land` in the deploy token.

## Every deploy

Both `cloudflare-staging.yml` and `cloudflare-production.yml` run by hand on `rock`: Actions → Deploy Cloudflare staging (or production) → Run workflow. Merging does not deploy either Worker. Each takes a fresh jumbotron snapshot, runs `npm run build:site`, installs the Worker's locked dependencies (`npm ci --prefix worker --omit=dev`, the Anthropic SDK its bundle imports), runs the Worker's checks, applies D1 migrations and deploys. Every deploy drops live sockets, and clients reconnect on their own. These workflows are the normal deploy path: keep Workers Builds (a Worker's Settings → Build) disconnected and don't deploy from the dashboard, or a second deploy can replace the Worker and drop its secrets. If GitHub Actions is unavailable, the README documents the emergency laptop deployment procedure.

Production's `DONATIONS` binding to `bananapayserver-production`'s `PageApi` and `/donations/*` in `assets.run_worker_first` must be committed to `rock` before deploying; a live-only binding is replaced by the checked-out config. The Worker's donation checks enforce both before the workflow deploys.

On `bananapayserver-production`, keep `PILE_START=0` and `PILE_EAT_PER_HOUR=0` as Cloudflare secrets, set with `wrangler secret put` in that repository. Normal Wrangler deploys preserve secrets absent from the config, so these settings stay out of `vars` and need no deploy-time reset. Donation records and donor totals live in its D1 database, and the corrected pile lives in its existing Durable Object namespace; keep both resource identities and migrations intact. `PILE_START` initializes a new pile only, so never use it to re-credit a donation already recorded.

## Local development

```sh
cp worker/.dev.vars.example .dev.vars   # at the repo root, next to the wrangler configs; fill in the local OAuth App
cd worker
npm run migrate:local
npm run dev                             # http://localhost:8787, with the staging config
```

The local OAuth App has homepage `http://localhost:8787` and callback `http://localhost:8787/auth/callback`. `npm run dev` builds `_site/` and passes `--local-upstream localhost:8787`, so the Origin check sees the local address. Local D1 and the room live in `.wrangler/` and never touch staging.

To show production donation totals and the leaderboard with the local page, sign in to
Wrangler and run this from the repository root:

```sh
npm --prefix worker run dev:live-donations
```

Open `http://localhost:8787`. `wrangler.local-donations.jsonc` serves the current local build
and connects only `DONATIONS` remotely, to `bananapayserver-production`'s `PageApi`. Sign-in
and the room use local storage; optional local OAuth and voice credentials still come from
`.dev.vars`. Viewing totals does not require sign-in. The donation kiosk in this preview
uses real production invoices. Use this config only with `wrangler dev`, never deploy it.
If using local sign-in, first apply its local schema with
`wrangler d1 migrations apply DB --local --config wrangler.local-donations.jsonc`.

The feed reflects the currently deployed backend. The independent sats leaderboard requires
bananapayserver's donor-sats migration and updated feed to be deployed; starting this local
preview does not deploy either.
