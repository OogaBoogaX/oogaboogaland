# Independent character catalogs

Implementation issue: [#831](https://github.com/OogaBoogaX/oogaboogaland/issues/831).

The catalog lets approved plain-data characters reach production independently
of code merged into `rock`. Code releases remain manual. This document describes
the staged implementation; the foundation does not enable publishing, add a
public endpoint, or change the running island.

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

## Planned runtime

One environment-scoped Worker loader will validate complete immutable snapshots
and construct ownership maps and cast indexes. It will deduplicate bounded
refreshes, avoid storage requests in per-frame/message work, and restore the
Room's accepted snapshot before checking hibernated connections. ChatBridge's
public cast and capability consumers will use revision-aware caches.

The island must finish catalog loading before the contributor roster and models
are initialized. A page initially pins its appearance catalog for its lifetime;
refresh adopts new visuals. Offline, source, studio and preview pages retain the
embedded cast. Unsupported shared NPC roster revisions need an explicit hold
and refresh path, not independent simulation of the same shared crew.

Ooga Chat needs revision-matched portrait metadata and atlas bytes as well as
the cast rows. Generate those with the approved deployed renderer in a separate
job without publication credentials, and serve them through the app's own
origin. The app does not load the island's renderer.

## Planned publication

Immutable JSON and portrait objects will live in separate staging and production
R2 buckets. Upload and verify every object before conditionally advancing the
active pointer. Pointer writes must compare the expected previous generation;
GitHub workflow serialization alone does not prevent an operator or delayed
writer from replacing newer state.

The trusted publisher will run from approved tooling, not arbitrary newly merged
code. Its storage credentials will not permit Worker deployment. The publication
workflow will not deploy the Worker, apply database migrations, or refresh other
site assets. Duplicate events, missed events and interrupted acknowledgments
must be recoverable without losing a newer activation or undoing a rollback.

Manual releases must reconcile already-published plain-data revisions with their
new baseline and reviewed custom code. Prepare, deploy, verify and activate under
the same environment release lock; refuse a release that regresses published
characters or exposes a catalog unsupported by a running reader.

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
