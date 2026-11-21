# Independent character catalogs

Implementation issue: [#831](https://github.com/OogaBoogaX/oogaboogaland/issues/831).

The catalog lets approved plain-data characters reach production independently
of code merged into `rock`. Code releases remain manual. This document describes
the staged implementation. Runtime support starts disabled; merging its code
does not publish a catalog or change the running island.

## Release boundary

A catalog starts from an explicitly selected production baseline. Each automatic
revision applies only entries from a verified, merged daily character bundle to
the previous published catalog. It never exports the current `src/characters/`
directory as a replacement for production.

The character's expected base must match its published source lineage. A changed
owner, alias, path, unsupported appearance field, or dependency on an undeployed
custom character stops that publication. Compiled custom characters remain part
of the manual release baseline; the automatic lane cannot replace their code.

Use the existing bounded character parser. Character source is text, never code
to execute while inspecting a submission or holding publication credentials.
No catalog may supply a function, script URL, executable dress hook, or property
outside its declared format.

## Separate identities

Keep these identities separate:

- The production baseline and supported engine version identify the code with
  which a catalog can be interpreted.
- The content digest identifies immutable catalog bytes.
- The activation generation identifies an operator's ordered publication or
  rollback decision. Rolling back content must advance this generation.
- The roster compatibility identity describes shared NPC ordering. A cosmetic
  color change alone must not unnecessarily invalidate that ordering.

The browser's chosen revision is never an ownership credential. Numeric account
identity overrides, reserved handles, bans and session authorization remain
server policy.

## Foundation commands

`scripts/character-catalog.mjs` is the pure planner. Its seed input explicitly
names `environment` (`staging` or `production`), `engine`, the 40-character
production `baseline` commit, and `sources`. Each source has its repository
`path`, exact `source` text, Git `blob` SHA and `kind` (`data` or `custom`). The
caller must obtain that input from the approved production release; a supplied
baseline label alone is not evidence that files came from that release.

The planner checks both source hashes and identity reservations. Custom entries
carry their identity and source hashes, with `row: null`; their compiled code
stays in the manually deployed baseline. Stored catalogs use canonical JSON and
a SHA-256 digest, with at most 128 characters and 2 MiB of encoded data.

The read-only CLI writes proposals to stdout:

```sh
node scripts/character-catalog-plan.mjs seed baseline-input.json > catalog.json
node scripts/character-catalog-plan.mjs verify catalog.json
node scripts/character-catalog-plan.mjs activate catalog.json --expected-generation 0 > activation.json
node scripts/character-catalog-plan.mjs plan catalog.json activation.json --pr BUNDLE_NUMBER --merge MERGE_SHA --bot TRUSTED_BOT_LOGIN > next-catalog.json
node scripts/character-catalog-plan.mjs activate next-catalog.json activation.json --expected-generation 1 > next-activation.json
```

Only `plan` reads the network. It requires `GH_TOKEN` or `GITHUB_TOKEN` with
read access to the repository and the provenance/permission information used
by character intake. Its verifier pins the merged bundle and source history,
compares complete Git trees, checks regular-file modes and hashes, and refuses
unrelated changes or incomplete evidence. Later source-PR edits do not change
the bytes being verified. The trusted bot login must come from operator
configuration, never the submission. No command uploads or activates anything.

To propose rollback, pass a previously accepted catalog to `activate` with the
current activation file, its expected generation and `--rollback`. The manifest
retains consumed events even when content rolls back. Re-delivery cannot apply
the reverted bundle again. Event history is bounded at 512 entries; reaching
that bound requires an explicit new-baseline handoff, not silently discarding
replay protection. An update based on reverted bytes still needs reconciliation.

The publisher integration must verify the seed against its approved release,
replay events in merge order, validate the runtime's supported engine, upload
immutable bytes, and conditionally compare-and-swap the stored activation.
The pure planner's generation check alone provides no distributed write lock.

## Runtime configuration

The Worker opts in only with `CHARACTER_CATALOG_ENABLED="1"`. Both checked-in
environment configurations keep it `"0"`. Before enabling, bind that
environment's private R2 bucket as `CHARACTER_CATALOGS`, set
`CHARACTER_CATALOG_ENGINE` to the supported engine identifier, and set
`CHARACTER_CATALOG_BASELINE` to the approved deployed 40-character commit.
`ENVIRONMENT` must match the catalog. Enabling with missing configuration fails
closed; it does not silently authorize against the embedded cast.

Each baseline has its own `catalogs/<baseline>/active.json` pointer and immutable
`catalogs/<baseline>/<sha256>.json` snapshots. A new code release cannot switch
an old reader to an incompatible baseline by replacing its pointer.

`GET /api/characters/catalog` (also `HEAD`) returns the validated current
revision, activation generation and catalog. Optional `baseline` and `engine`
queries refuse incompatible readers with 409; they cannot choose the server's
ownership revision. Disabled is 404, unavailable is 503 with `Retry-After`, and
responses are `no-store`. This endpoint publishes character data, never source
code or account sessions.

## Runtime integration

The environment-scoped Worker loader validates canonical bytes, content hashes,
schema, environment, baseline and activation history before accepting a complete
snapshot. It checks at most once a minute, shares in-flight reads, bounds a read
to four seconds and 2 MiB per object, and retains a last good authority for at
most fifteen minutes. A failed read cannot replace a newer successful one.
Compiled owners remain reserved; compiled custom looks cannot become data-only
entries through a catalog update.

The Room persists its accepted snapshot before using it and restores that
snapshot before checking hibernated connections. Storage reads happen at
restore, admission and existing sweep boundaries, never in pose processing.
Unavailable authority refuses new ownership grants without interpreting the
outage as a revocation of every existing player. Cleanup, bans, expiry and
account removal remain active. Sign-in and `/api/me` report unavailable authority
as a retryable service failure. ChatBridge's cast cache follows catalog revision
and activation generation; capability decisions and Audience checks use the
same environment-scoped ownership policy.

The staged island pauses its remaining classic modules after the compiled cast
and before contributors or models initialize. Explicit build variables
`CHARACTER_CATALOG_BASELINE`, `CHARACTER_CATALOG_ENGINE` (currently
`island-character-data-v1`) and `CHARACTER_CATALOG_ENVIRONMENT` opt Worker pages
into the loader. All three are required together; a build never infers its
approved release identity from a branch name. Browser and Worker share the same
schema validator. Complete validation precedes an atomic registry replacement;
compiled custom source hashes and identities must match the page's baseline.

A page pins its appearance catalog for its lifetime; refresh adopts new visuals.
Offline, source, studio and preview pages retain the embedded cast. Shared NPC
compatibility uses engine, baseline and ordered handles rather than cosmetic
revision. Incompatible readers hold the crew and cannot host or relay NPC frames;
voice and presence remain independent. Deploy these readers before enablement
and refresh older pre-reader tabs: code already running in those tabs cannot
understand the new hold protocol.

Ooga Chat receives revision-matched portrait metadata with its cast. The index
and PNG switch together, with immutable bytes served through the app's own
origin. The app does not load the island's renderer. `scripts/character-catalog-render.mjs`
reads an approved baseline checkout, overlays serialized validated data rows and
unchanged custom source, and draws the atlas with that baseline's renderer. It
never writes the checkout or runs submitted source. Run it in a separate job
without publication credentials. Portrait objects live under
`portraits/<catalog-revision>/manifest.json` and
`portraits/<catalog-revision>/<image-sha256>.png`; every object must be verified
before the catalog's active pointer advances.

## Publication and manual releases

Immutable JSON and portrait objects live in separate staging and production R2
buckets. `scripts/character-catalog-store.mjs` signs bounded GET and conditional
PUT requests to one configured bucket. The publisher uploads and reads back
every object before advancing the active pointer with its exact previous ETag.
An ambiguous acknowledgment is reconciled against stored bytes, never retried
as an unconditional write. This uses R2's [atomic conditional writes](https://developers.cloudflare.com/r2/api/s3/conditional-operations/).

The publisher workflow uses an explicitly approved immutable tooling commit.
Planning has read-only GitHub and storage access. Rendering runs in a separate
job without publication credentials, using the approved deployed baseline.
The writer re-verifies the source evidence and current storage state. Its
bucket-scoped credentials do not permit Worker deployment. The character
workflow never deploys a Worker, applies database migrations or refreshes other
site assets.

`scripts/character-catalog-release.mjs` recovers missed bundles in first-parent
merge order. It starts after the latest consumed event, including events
retained across rollback, or the baseline for a fresh catalog. It publishes one
outstanding daily bundle per run. Unrelated merges are inspected for ordering,
never exported as a new cast. History longer than 512 commits refuses and needs
an explicit baseline handoff. A duplicate cannot resurrect a rolled-back event.

Manual releases share the `cloudflare-staging` or `cloudflare-production` workflow
lock with publication. `scripts/character-catalog-handoff.mjs` requires the new
approved baseline to preserve published plain-data source hashes and every
existing identity. Reviewed custom code may change through that baseline.
`release.json` records the active baseline and a pending transition. Beginning
a transition also advances the old activation generation without changing its
content, fencing out a publisher holding an earlier ETag. The new namespace is
prepared before deployment; the release context changes only after the new
runtime reports the expected baseline, engine, revision and generation.
Failures retain the barrier. There is no timeout that silently steals it.

The catalog-aware manual deployment builds a temporary Wrangler configuration
with the selected baseline and bucket binding. Checked-in configurations stay
disabled. An interrupted deployment resumes the same target and transition;
it must not select a newer `rock` commit as an implicit replacement.
Historical accepted snapshots also reserve rolled-back additions: a new
baseline cannot silently restore a character that the active catalog removed.
Reconcile the target source with the deliberate rollback before preparing that
release, or explicitly restore an accepted catalog while accounting for any
later characters it would replace.

For a failed deployment after fencing, rerun the manual deployment with
`catalog_resume_sha` set to the pending transition's exact target SHA. It reuses
already published portraits and catalogs, verifies the live runtime, and then
completes the transition. Inspect a held transition using:

```sh
node scripts/character-catalog-deploy.mjs status --environment staging
```

If a staging build needs a code correction before its target catalog has been
published, first confirm its workflow has finished. Dispatch the corrected
revision with `catalog_preview=true` and `catalog_replace_held_sha` set to the
failed target's exact SHA, leaving `catalog_resume_sha` empty. The existing
environment lock must cover the entire replacement and deployment. The tooling
checks that both target namespaces remain unpublished, the live Worker still
serves the fenced source, and the replacement preserves all published
characters. It conditionally changes only the pending target and token; the
source fence and publication barrier remain intact. Old plan artifacts become
invalid. Rendering, build, tests, retention checks and deployment then run
normally for the corrected SHA. Once a target catalog has been published, use
the exact-target resume path instead. Never run replacement concurrently with
an earlier release.

If a publisher won the race before the fence, the transition remains
**unfenced**, so no catalog-aware deployment could have passed its admission
check. Explicitly cancel that unfenced transition with the token and quoted
ETag returned by `status`:

```sh
node scripts/character-catalog-deploy.mjs cancel-unfenced --environment staging --token TOKEN --expected-etag '"ETAG"'
```

Cancellation first fences the latest accepted source, then clears only the
matching unfenced transition. It refuses an already committed original fence
or a fenced transition; those must resume or use the guarded unpublished-target
replacement above. Never clear `release.json` by hand.

## Operator setup and rollout

Create protected GitHub environments `character-catalog-staging` and
`character-catalog-production`, each with its own private R2 bucket. Keep the
storage credentials scoped to that bucket, with separate read-only and writer
keys. The renderer job does not enter either environment.

| Setting | Location and purpose |
|---|---|
| `CHARACTER_CATALOG_TOOLING_SHA` | Environment variable: reviewed 40-character tooling commit containing this implementation |
| `CHARACTER_CATALOG_BASELINE` | Environment variable: explicitly approved deployed baseline for initial bootstrap |
| `CHARACTER_CATALOG_ENGINE` | Environment variable: `island-character-data-v1` |
| `CHARACTER_CATALOG_R2_ACCOUNT_ID`, `CHARACTER_CATALOG_R2_BUCKET` | Environment variables: this environment's account and bucket |
| `CHARACTER_CATALOG_R2_READ_ACCESS_KEY_ID`, `CHARACTER_CATALOG_R2_READ_SECRET_ACCESS_KEY` | Environment secrets: read-only planner access |
| `CHARACTER_CATALOG_R2_WRITE_ACCESS_KEY_ID`, `CHARACTER_CATALOG_R2_WRITE_SECRET_ACCESS_KEY` | Environment secrets: conditional publication and handoff access |
| `CHARACTER_BOT_LOGIN` | Trusted daily-bundle bot login, matching existing intake configuration |
| `CHARACTER_CATALOG_STAGING_RUNTIME_ENABLED`, `CHARACTER_CATALOG_PRODUCTION_RUNTIME_ENABLED` | Repository variables: opt each manual deployment into catalog-aware preparation and runtime configuration |
| `CHARACTER_CATALOG_PUBLISH_ENABLED` | Repository variable: enables automatic production publication after acceptance; initially absent or `false` |

The existing character App can provide read-only inspection tokens; otherwise
the workflow uses its read-only Actions token. Existing Cloudflare deployment
credentials belong only to the manual deployment workflow.

1. Review and merge the staged implementation. Manually deploy the disabled
   island foundation and the updated Ooga Chat app/edge Worker, including its
   portrait proxy. Record the exact deployed island baseline; a later merge into
   `rock` is not evidence of deployment.
2. Configure staging storage and approved tooling/baseline. Dispatch **Publish
   character catalog** with `environment=staging`, `operation=bootstrap` while
   automatic publication remains off.
3. Enable the staging runtime variable and run the manual staging deployment.
   Verify initial character models, sign-in, Room hibernation, matching and
   mismatched tabs, and Chat's revised portrait sheet.
4. Manually publish a daily-bundle revision in staging, then roll back to an
   accepted digest. Repeat delivery and recovery; prove the Worker version and
   unrelated static assets remain unchanged. Test a manual code release after
   publication and an interrupted handoff resumed at its original target.
5. Bootstrap production from its own approved deployed baseline, enable its
   runtime through the manual deployment, and verify the same read paths.
   Only then set `CHARACTER_CATALOG_PUBLISH_ENABLED=true` for automatic updates.

Disabling automatic publication does not roll content back. Use the explicit
rollback operation with an accepted revision. To disable runtime loading, use
the ordinary manual deployment with that environment's runtime variable off;
the page then uses the compiled cast. Keep the accepted catalogs and release
state for deliberate recovery, never overwrite their history by hand.

## Implementation sequence

1. Catalog validation, deterministic planning and merged-bundle provenance.
2. Backend snapshot loading, ownership consumers and Room/Chat compatibility.
3. Island bootstrap, old-tab behavior and revisioned Ooga Chat portraits.
4. Conditional publication, recovery, manual baseline handoff and rollout.

Runtime support and automation start disabled. A manually deployed foundation,
an explicit production baseline, staging publication/rollback acceptance, and
operator enablement are required before automatic production updates begin.

## Acceptance

The decisive release check merges an unrelated code change before a daily
character bundle, then proves the character publishes while the Worker version
and unrelated assets remain unchanged. Also cover identity collisions, invalid
or truncated provenance, wrong environments, unsupported versions, source-base
conflicts, repeated/reversed events, failed uploads, conditional-write races,
manual-release preservation and rollback recovery.

Runtime acceptance additionally covers first model creation, old/new tabs,
multiplayer host compatibility, Room hibernation, auth and Chat caches, portraits,
offline fallback, strict CSP and bounded resource use. Record checks actually
run separately from this acceptance plan. Follow AGENTS.md's testing policy.

## Implementation validation (2026-11-20)

- Full Worker suite: **784/784 passed**, including storage preconditions,
  timeout/lost-acknowledgment recovery, rollback exclusions, direct publication
  ordering, handoff fencing/cancellation and manual deployment configuration.
- Dedicated staged catalog/Chat browser acceptance: **7/7 passed**. It proves
  catalog loading precedes model construction, appearance stays pinned in an
  open page, refresh adopts cosmetics without changing roster compatibility,
  and an already open Chat strip changes to the matching portrait revision.
- Standalone Ooga Chat browser suite: **7/7 passed**. Actual portrait renderer
  smoke: 59 fixture characters, including a new synthetic data-only character,
  with a clean console. These are local fixtures, not production publication.
- Site build, Chat build, syntax for 57 changed/new JavaScript files, and all
  four affected workflow YAML parses passed. Chat first load is 239.2 KiB gzip
  against its 244 KiB budget.
- Root unit suite: **830/831 passed**. The poker marble geometry golden hash
  failure reproduces with identical hashes on untouched baseline `fa2a62e`.
  Targeted Studio teardown (31 input targets remaining) and combined hub
  live-wake/separate-bodies geometry (849 to 852) failures also reproduce on
  that baseline. Their assertions remain intact; they were not rerun again.

## Live staging acceptance (2026-11-20)

This run used an explicit temporary fixture: runtime code `2c1fbd5c` with the
57-character source cast from `45e02fd4`, before NEEDcreations was added. It
reverified the real merged daily bundle [#146](https://github.com/OogaBoogaX/oogaboogaland/pull/146)
(`491ecb11873be8c01c5860fb6753499ae72a8184`), including NEEDcreations's source
PR #812, and published those verified bytes to staging R2. This was a controlled
historical replay through the CLI, not a normal GitHub workflow run: the catalog
workflows were not yet on `rock`, and `2c1fbd5c` was an unmerged runtime commit.

| Step | Characters | Generation | Catalog revision |
|---|---:|---:|---|
| Bootstrap | 57 | 1 | `39ceee6f…` |
| Publish NEEDcreations | 58 | 2 | `55b1a092…` |
| Roll back | 57 | 3 | `39ceee6f…` |

- All three snapshots retained Worker version
  `2afa014b-fced-4480-b33a-f3ab3077e55a`. The HTML and served main JavaScript,
  stylesheet and jumbotron data had identical SHA-256 hashes throughout.
  Publication and rollback changed catalog data without deploying code or
  replacing those assets.
- Re-delivery after rollback was a no-op at generation 3. Preparing a new
  baseline that would silently reintroduce NEEDcreations was refused by the
  historical rollback-preservation check.
- Real R2 testing exposed a compressed GET response with a weakened ETag.
  The storage adapter now requests `Accept-Encoding: identity` on GET while
  retaining strict strong-ETag validation for conditional writes; its focused
  publication suite passed **13/13**, including that regression.
- Staging storage and the `character-catalog-staging` environment were
  configured with separate bucket-scoped read-only and read/write credentials,
  using the four `CHARACTER_CATALOG_R2_READ_*` and
  `CHARACTER_CATALOG_R2_WRITE_*` secret names in the setup table. A PUT using
  the read-only credentials returned **403**. Production publication remains
  disabled.
- Browser checks confirmed an existing tab retained 57 characters while a
  new tab loaded 58 and rendered NEEDcreations. After rollback, the published
  tab retained its appearance and a new tab loaded 57. Visible contributor
  panels also showed old/new counts of 57/58 while signed in as `w-s-bitcoin`.
  These observations do not establish live NPC host negotiation or Room
  hibernation behavior; those checks remain outstanding.
- Chat's public response reached the 58-character revision with its matching
  portrait manifest. Its same-origin portrait endpoint served a valid 640×640
  atlas whose SHA-256 matched that manifest. The strict live Chat console check
  **failed** on a 401 resource error and a PWA install-banner message; the
  assertion remains intact. The PWA code
  matches the baseline byte for byte, and the 401 appears consistent with the
  signed-out session request, but this does not count as clean-console
  acceptance.

Manual handoff and interrupted-release recovery also passed. The accepted
58-character revision was deliberately restored at generation 4, then fenced
at generation 5. The pending transition refused publication, a stale publisher
and a different resume target. Completion while the old Worker still ran was
refused. Resuming preserved the transition token, release ETag and target
activation, reused identical portraits, and restaged as `already-published`.

After the deliberate code deployment, Worker version
`57994074-f640-4829-93f0-dd27765f3d6d` confirmed the exact application baseline
`2c1fbd5c0d7b6378540d983f71f528d2cca9c55f`, 58 characters and catalog
`332a972b…` at generation 1 in its new namespace. The release state completed
at generation 4 with `pending: null`; a subsequent no-op rollback plan
succeeded, confirming the publication gate reopened.

`CHARACTER_CATALOG_STAGING_RUNTIME_ENABLED` remains unset until the catalog-aware
workflow is merged. The current legacy staging workflow on `rock` would
replace this setup and disable catalog loading. The normal GitHub workflow
path, a new daily bundle after an unrelated merge, live NPC negotiation, Room
hibernation and production rollout remain unverified.
