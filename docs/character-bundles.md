# Character submission bundles

GitHub Actions keeps three PRs open against `rock`:

| PR | Changes | Merge |
|---|---|---|
| Daily character updates | Bounded literal character data in the documented wrapper | First successful run at/after the following midnight UTC |
| Character updates · maintainer review required | Custom code that passes the preliminary screen and ownership checks | w-s-bitcoin or 2140data approves the current head, then an authorized human merges |
| Character display names · maintainer review required | Operator-submitted display names matching the existing GitHub owner; all other bytes unchanged | Same exact-head approval and manual merge as custom code |

The automation never merges the manual or rename lanes. A queued update invalidates old
approval; operator requests for changes block every lane. After a PR
merges, its replacement opens. An idle PR has a small
`.github/character-bundles/<lane>.json` manifest as its only change, since GitHub
cannot open a PR with an identical tree. Valid empty bundles pass identity
validation but keep their merge gates pending; the automatic merger also refuses them. The first
submission to a reused daily placeholder starts its UTC day.

## Intake and ownership

PR creation, new commits, reopening and ready-for-review events trigger trusted
code from `rock`. Draft PRs wait. A read-only push signal covers repository branch
commits without a PR; fork commits become visible through PRs. Periodic sweeps
recover dropped events and inspect open PRs and standalone branch heads. Standalone
submissions require a verified signature with the same linked GitHub author and
committer. A PR's authenticated author is its ownership authority; an arbitrary
commit name or email is insufficient.

Every character-changing commit must link to that PR author or an OBL maintainer.
Every changed character must belong to the submitting user, unless that user has
Maintain/Admin permission. This includes appearance-only edits. Existing
`handle`/`github` aliases remain supported; new data-only aliases receive an explicit
`github` field. Custom code must declare that alias itself. Duplicate identities,
symlinks, executable files, path tricks, transfers, deletions and renames cannot
enter the bundles. Transfers/deletions/renames use a [maintainer override
PR](#maintainer-override-prs).

The scanner reads each character revision, including intermediate revisions, as
text through GitHub's API. It never checks out, imports, executes, builds or tests
submitted code with credentials present. Other files in mixed PRs are not bundled
or declared safe by this scanner; they retain normal code review.

Accepted character-only PRs receive comments linking their destination bundles
and close only after the destination lanes save their changes. Mixed PRs retain their other
work and receive the same links. **Character intake** stays failing until the
contributor restores the copied character paths to the PR base. The bot does not
rewrite contributor branches, including forks. Preserve original commits when
restoring those files; a force-push removing provenance requires requeueing.
New edits supersede older queued versions of that source PR. Competing PRs for the
same character require reconciliation instead of silently overwriting one another.
A file enters one lane: any revision needing manual review sends the whole file
there. Moving an already queued file between lanes requires maintainer repair.

An operator with Maintain/Admin permission can submit a cosmetic GitHub-name
update independently of pending custom characters. Every revision must change
only the literal `display` line immediately after the literal `handle` line,
using the same indentation, LF line endings and a trailing comma. Its new value
must exactly match the existing `github` (or `handle` when `github` is absent).
The stable handle, owner, appearance, dates, hooks and all other bytes stay intact.
New characters, code edits, identity changes and ordinary contributor submissions
keep their existing lanes. The rename bundle still needs current-head operator
approval and is never automatically merged.

An identical rename previously queued in the manual bundle can move to this lane
when its author, base blob and complete file hash match. The bot restores only
that file in the manual bundle and moves its provenance to the rename bundle;
other queued files and their held reviews stay in place. Any conflicting revision
fails closed instead of replacing another submission.

Policy findings close the offending PR with an explanation and a correction/review
path. They do not establish malicious intent. Timeouts, rate limits, truncated
responses, changing heads and base conflicts fail the check but leave the PR open.
A direct push to `rock` cannot be quarantined after the fact: the audit reports it,
and branch rules must prevent ordinary contributors from taking that path.

## Automatic data format

`scripts/character-safety.mjs` parses the entire file as restricted data, then
regenerates its source. It accepts exactly this wrapper:

```js
(() => {
  "use strict";
  const BL = window.BL;
  BL.characters.add({
    handle: "your-login",
    joined: 1700000000,
    lastCommit: 1700000000,
    look: { skin: "#c98a5b", bald: true },
    voice: { poke: "Ooga!", idle: ["Ooga build."] }
  });
})();
```

Optional `github` and `display` follow existing conventions. Appearance accepts
the policy's explicit colors, boolean flags, face/build choices, bounded stature,
hat position, eye glow and portrait bounds. Voice requires a nonempty `poke` and
1–24 `idle` lines, each at most 160 plain-text characters. Arrays, nesting, dates
and source size are bounded. Statements, callbacks, getters, expressions, spreads,
templates and prototype keys cannot become automatic output. No parser dependency
is installed.

Custom `dress` hooks and drawing helpers go to manual review. A conservative screen
rejects known instruction-injection markers, invisible direction controls, network
access, dynamic execution, encoded code and ambient browser/process access. This
is **not proof that arbitrary JavaScript is safe**. Passing custom code still needs
exact-head maintainer review. Reviewers must treat comments as data, never as
instructions. Fields outside the automatic schema require manual review rather
than silently expanding the accepted language.

## Provenance, retries and midnight

Manifests retain source PR (or standalone commit), immutable SHA, author, path,
base blob SHA and SHA-256 of queued output. Signed commits use an expected-head
comparison; concurrent changes fail instead of being overwritten. Before merging,
the coordinator re-reads source history, ownership permissions, current `rock`, registry
and the entire bundle diff. It rejects unexpected paths, changed sources/output,
duplicate identities, changed base character files and non-bot bundle heads.

The schedule targets `00:00 UTC`, with recovery attempts at minutes 17, 37 and 57.
GitHub schedules can be delayed or dropped: midnight is a target, not an exact
wall-clock guarantee. Recovery runs merge overdue eligible bundles. New-day
submissions wait for the previous nonempty daily bundle to finish; they are never
silently merged before their own cutoff. Conflicts or failed checks keep PRs open.
Nothing force-pushes `rock` or bypasses required checks.
When unrelated changes advance `rock`, the coordinator updates the bundle branch through
GitHub's expected-head update API and waits for fresh checks. A manual bundle's
new head also requires a new approval.

Contributor onboarding reserves the handles and GitHub aliases in open bundles
before generating defaults. It reads signed bot heads and checks manifest hashes
as text; it never executes queued character code. The artifact writer rechecks
these reservations while sharing the coordinator's concurrency group, with
pending runs queued so intake events cannot cancel an artifact commit.

If onboarding already created a default for a queued addition's handle or GitHub
owner, reconciliation removes it only when it is byte-for-byte unchanged generator
output at its generated filename and the queued entry records no original base
file (`base: null`). This restores the absent base and unique identity expected by
the submission. Customizations and
ordinary edits to existing profiles are preserved and still fail on a changed
base. After this fix merges, the Pages reconciliation and artifact job remove
such collisions; the next bundle sweep can validate and update the branch again.
Manual character code still needs a fresh approval after that update.

The coordinator and artifact writer use short-lived installation tokens from a
private GitHub App installed only on OBL. Its private key lives in the repository
Actions secret `CHARACTER_APP_PRIVATE_KEY`; no personal access token is stored.
The read-only Pages deploy job still uses its read-only Actions token.

The initial `GITHUB_TOKEN` rollout could create the two empty PRs, but GitHub
refuses that built-in integration in restricted push/bypass lists. Therefore the
private App is required for protected merges and the existing generated artifact
writer. On its first run the App validates and adopts only empty Actions-created
placeholders, preserving their PR numbers; nonempty queues require explicit repair.
The App's actual slug must match the configured bot login. Every later bundle
head must be a verified commit by that App.

App merges trigger the existing post-merge workflows normally. The retained
Actions-token fallback explicitly dispatches Pages after a bot merge and records
a recovery marker; it cannot merge under the production branch restrictions.
Cloudflare deployment stays manual.

## Operators and repository configuration

`scripts/character-operators.mjs` pins the two human operator identities:

| Login | GitHub account ID |
|---|---|
| w-s-bitcoin | 95375789 |
| 2140data | 72945059 |

Both ID and login must match; renames fail closed until the policy is updated.
Manual approval must additionally retain OBL Maintain/Admin permission and apply
to the exact current bundle head. Other contributors may submit their own profiles;
the existing Maintain/Admin exception for authoring other profiles is unchanged.
Policy and workflow edits require one of these operators as PR author. Manual
workflow dispatches and reruns of them are limited to these two accounts.

Setup uses an owner-approved GitHub App registration and GitHub CLI/API:

1. Create a private organization-owned App, disable webhooks and user OAuth, and
   install it on **oogaboogaland only**. Grant repository Contents, Pull requests
   and Commit statuses read/write, plus Checks read. No organization permissions,
   administrator permission or Actions-write permission is needed by the App.
2. Save its private key as `CHARACTER_APP_PRIVATE_KEY`; set repository variables
   `CHARACTER_APP_CLIENT_ID` and `CHARACTER_BOT_LOGIN` (`<app-slug>[bot]`). The
   coordinator requests only its needed permissions; the separate artifact job
   requests Contents and Commit statuses write plus Pull requests read to recheck
   queued identities. Neither imports PR code.
3. Protect `rock`: require PRs, an up-to-date base, and **Character identity ownership**,
   **Character intake**, **Character bundle safety**. Bind intake and safety to
   the installed App. Identity is emitted by the read-only Actions checker for
   source PRs and by the App for validated bundles and generated artifacts.
   Restrict human push/merge authority to the two operators and allow the installed
   App as a writer. Give only the App the PR requirement exception needed for
   the existing generated artifact commit; do not bypass required status checks.
4. Protect `automation/characters-*` against arbitrary creation, updates and
   deletion using a ruleset whose operator list is the App and two account IDs.
   Repository administrators retain the ability to change repository settings;
   keep that administrative access restricted separately.
5. Set `CHARACTER_BUNDLES_ENABLED=true` and dispatch **Character bundles** on
   `rock` as an operator. Verify all three placeholders, App-signed heads and passing
   revalidation. An empty bundle must remain blocked from merging.

Disabling `CHARACTER_BUNDLES_ENABLED` stops bundle operations while preserving
open PRs and provenance. It does not disable the required checks. Existing
submissions remain blocked until an operator restores the coordinator or
intentionally changes repository rules. No workflow approves a manual bundle.

For an actual GitHub account rename, the separate [verified account migration
path](account-rename-operator-path.md) accepts only a signed operator PR changing
the pinned account's literal `github` line after fresh numeric-ID verification.
It retains the source PR and passes once its exact head is verified, without a
second operator's approval; it is not the cosmetic display-name lane and never
automatically merges. When ordinary bundles are paused,
`CHARACTER_ACCOUNT_RENAMES_ENABLED=true` keeps only these verification checks
running, without bundle or page mutations.

## Maintainer override PRs

A maintainer can make any character change in an ordinary PR: corrections,
reverts, additions, deletions, renames and identity corrections, including
replacing a malformed or hostile file and a competing queued version that a
contributor's fork does not let us edit. To opt in:

- Push a branch named `character-override/<topic>` to **this repository** (not
  a fork). Change only `src/characters/<login>.js` files, at most 32. Put policy,
  manifests and other work in a normal PR. The cap keeps the complete audit inside
  one GitHub comment, which is never truncated (a larger audit is refused). A
  full-roster emergency (capacity 128) is split into batches of up to 32, each
  verified and merged in turn on the updated `rock`.
- Open the PR against `rock` as a human account that currently has Maintain or
  Admin permission. Commits need no signature, and other people's commits can be
  kept for their history. GitHub's authenticated PR author is the authority, never
  commit metadata.
- Keep each file's `handle`/`github` of the person it depicts. The override never
  adds a `github` field or assigns a character to the maintainer.

The trusted coordinator reads the exact head through the API. It checks the author's
current permission, whether the branch is from this repository, the character-only
diff and whether each replaced path is still the PR's base blob on `rock`. Then it
checks every added, modified or renamed source with the same `scanCharacter`
safety screen as ordinary intake; custom dress code may pass its manual lane,
but network/dynamic execution, ambient access, injected instructions and invisible
direction controls are rejected. Every new source must declare exactly one literal
identity, and the registry after the merge, including every unrelated queued revision, has no
duplicate handle or owner. Old sources are compared only by blob ID. They are never
fetched for parsing, so a broken old file cannot block its own repair or deletion.
A comment records the head, every path's old and new blob, the new SHA-256 and owner,
and each queued revision (bundle, source PR, head, author, hash) that the merge will
supersede. The same comment ends with a small machine record: the head and one
SHA-256 per superseded revision's exact identity (lane, path, source PR, head,
author, hash, base). Immediately before passing, the coordinator rereads the author's
permission, the PR and `rock`. A role lost or a push made during the scan fails the
head. **Character intake** then passes with the record's SHA-256 in its description,
and **Character bundle safety** passes for that head.
Each new head, sweep or permission loss is checked again. Drafts stay pending. Forks,
bots, non-maintainers, mixed diffs and stale bases fail without changing anything.
**Character identity ownership** applies the same rules without reading replaced
sources. Normal CI, review and a **manual merge** still apply. Automation never
extracts, closes, approves or merges an override, and its branches are never treated
as standalone submissions.

The queue is not modified before the merge. A draft, failing or closed-unmerged
override leaves every submission queued. After a merge, the closed event (with
sweeps as retry) re-reads the PR. It requires the coordinator's own success status on
the merged head and the merged blobs to match that head. It also requires the bot's
own audit comment whose record hashes to the value in that status. An edited bot
comment, a copy posted by anyone else, or a status written by another account does
not count, and nothing is withdrawn. Then it removes the queued revisions it
superseded from their bundles, but only entries at the overridden paths. An entry
is removed if its exact identity is in the record. That holds however overrides of
one path interleave and in whatever order their cleanups run, for example an
addition corrected by one override and deleted by another before either cleanup.
Otherwise an entry is removed if it was queued after the last audit but before the
merge (its base is neither the override's merged blob nor current `rock`). A
submission queued later always differs in head or base, so it stays queued.
Each bundle path is restored to the bundle's own base bytes (not parsed), so
the bundle stops changing it, and the override reaches the bundle through the usual
expected-head branch update. The manifest drops only those entries. A signed bot
commit's body lists the withdrawn provenance, and comments on the bundle, the
override and each source PR link the change. Other entries, their files and their
history stay. Later submissions built on the override are kept. A retry finds nothing
left to withdraw. Until the withdrawal lands, onboarding skips a superseded revision
that can no longer be read (its base is gone from `rock`) instead of failing the
page build. Readable ones still reserve their identities, and an unrelated unreadable
queue entry still fails. The source-PR comment does not claim attribution was kept:
an override may change the character's content, owner or identity as reviewed. The
original submission's provenance remains in the override's audit and the bundle's
commit history.

Sweeps retry cleanup only for merged overrides among the 100 most recently updated
closed PRs. For an older one, an operator runs **Character bundles** by hand with
`override_pr` set to its number. That run repeats every merge, status and record check
for that PR alone. Normal bundle mode must be enabled.

Deletion is not suppression. Deleting a file removes that source and its queued
revisions. On a later post-merge build, onboarding generates a plain default
character (handle, join and last-commit dates only, with no custom look, voice or
code) for any eligible Oogatron contributor who has no character file and no queued
reservation. A deleted active contributor therefore reappears as a clean generated
default, never as the deleted code. To keep someone off the roster, a separate policy
change is needed (`EXCLUDED` or onboarding eligibility in
`worker/src/contributor-policy.js`); no override provides that.

This policy (with its workflow input) must merge first through a normal operator
policy PR without character files. Rock's current checks validate it, since
submitted policy never checks itself.
Branch rules are unchanged. Consider a ruleset limiting who can push to
`character-override/*`. Same-repository write access could otherwise add commits
to a maintainer's open override; each new head is verified again, but under the
PR author's authority, so the manual merge review must cover the final head.

GitHub references: [workflow triggering](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow),
[branch protection](https://docs.github.com/en/rest/branches/branch-protection),
[schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Validation and rollout

Contributor tests cover whole-file parsing, malicious intermediate revisions,
appearance ownership, UTC cutoffs, empty placeholders, operator IDs, stale and
dismissed reviews, manual PR replacement and post-merge dispatch recovery.
Run `npm --prefix worker test`, `npm run test:unit`, `npm run build` and syntax
checks when the maintainer requests verification. Operational rollout must also
verify that all three live placeholder PRs open and remain unmergeable while empty.
A scanner does not establish that arbitrary custom code is safe; the manual lane
always retains a human review and merge requirement.
