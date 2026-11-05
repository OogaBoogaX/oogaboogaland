# Verified account rename: operator PR and database execution

This path changes a pinned character's GitHub login after the account owner has renamed the same numeric GitHub account. It does not transfer a character to another person, rename the account, run SQL or deploy anything automatically. The ordinary ownership policy remains unchanged.

## Separate operator PR

Use a source branch in this repository and a PR authored by a configured operator (`scripts/character-operators.mjs`) who still has Maintain/Admin permission. Keep every commit signed and attributed to that operator. The complete PR and every revision may change only the existing character's literal `github` line; its stable handle, display, appearance, dates, voice and companion must be byte-for-byte unchanged. Additional files, reverted changes, merge commits and unpinned characters are refused.

The trusted-base coordinator checks the pinned numeric ID through both GitHub `/user/<id>` and `/users/<new-login>`. Both must return a human account with that ID and the proposed current login. A proposed or reused login, old-login redirect, failed API request or operator display name is insufficient. The current character blob must match the PR base and there may be no competing queued change or registry collision.

The PR remains separate: no extraction into the cosmetic/manual bundles, auto-close or automatic merge. `Character intake` records verified identity/history; `Character bundle safety` passes once those checks verify this exact head; no second operator's approval is required. The identity-ownership check and other required branch checks remain enforced. A new head requires fresh verification. The existing unprivileged review signal still causes the trusted coordinator to refresh these checks.

This policy change must land on `rock` before an owner-login PR can pass, because submitted policy code is never used to validate itself. It needs a normal operator policy PR. It changes Actions tooling, not the application Worker, so installing the policy alone needs no Cloudflare deployment. The later actual character change does require the normal matching page/Worker deployment.

The unit workflow prepares a fresh Oogatron activity bake for a pinned, literal github-only change. A committed pre-rename bake still names the old login, so it cannot test the new login's activity join. The preparation uses the same snapshot generator as deployment, requires a fresh contributor row under the proposed login, and then runs every existing unit assertion. It changes only the runner's local bake; the owner PR still contains just its character file. Other PRs keep testing the committed bake. A failed fetch, stale snapshot or missing login must be resolved before this check can pass. This unprivileged preparation proves nothing about GitHub identity: the trusted-base identity and signed-history checks of the exact head still apply. Land this CI prerequisite before opening the character-only PR.

## Keep rename checks available during the pause

Save the original variable/workflow states. During the separately authorized cutover window, keep the **Character submission push** signal, **Check character identities** and **Character bundles** workflows enabled, set `CHARACTER_BUNDLES_ENABLED=false`, and set `CHARACTER_ACCOUNT_RENAMES_ENABLED=true`. The coordinator then runs only account-rename verification and its refresh. It cannot create/extract bundles, sweep submissions, auto-merge, close PRs, edit branches or dispatch page builds in this mode. Unrelated submissions receive no successful checks from this mode.

Pause automatic page/contributor generation separately and keep Oogatron ingestion quiescent. Do not disable branch protections or fabricate statuses. Coordinate the verified owner PR, manual merge and explicit page/Worker deployment before restoring ordinary generation. Restore both variables and workflow states to their recorded values afterward. A prior absent variable should be restored to absent, not left enabled. Keep unrelated queued work intact.

## Atomic database execution runbook

The existing `scripts/account-migration.mjs` is intentionally a verifier and SQL generator. Run it only after the actual GitHub rename, with the genuine immediately-before-rename UTC observation as its cutoff. Keep its output in the approved private cutover directory. For Bill's case, use only the `oogaboogaland` and `oogatron` groups; BananaPayServer #29 is closed and its group must not run.

Use **one reviewed SQL file per database** with Wrangler's remote `d1 execute --file` import path, not separate `--command` calls. The installed Wrangler implementation sends a file through D1's import API, polls completion and requires a final bookmark. Cloudflare documents that failed file execution returns the database to its original state. This can make that database temporarily unavailable, so use the coordinated maintenance window. Do not insert explicit `BEGIN`/`COMMIT` statements or assume two databases share one transaction.

Before writing either file:

1. Record exact database IDs/configs, deployed guards, backup hashes and a final quiescent baseline. Verify the owner ID, old/current login, no destination collision, expected owner row count and expected history state. Keep Bill from signing in or submitting a score mid-cutover; an automatic sign-in refresh would change the expected old-login precondition.
2. Include an ordinary assertion table with a unique reviewed name (for example `_account_rename_preflight`) at the beginning of each file: `CREATE TABLE _account_rename_preflight(ok INTEGER NOT NULL CHECK(ok=1));`. The table must not already exist; do not use `IF NOT EXISTS` or drop an existing table to work around a failed precondition.
3. Insert `1` or `0` from `CASE WHEN <reviewed preconditions> THEN 1 ELSE 0 END` into that table. Require exactly one owner under the expected old login, zero conflicting destination owners and zero duplicate-login groups. For the first Oogatron activation, also require no existing history for this transition. These checks must be in the same file as the writes, not only an earlier read.
4. Copy the verifier's approved statements into that file in order. Immediately after each owner-row update and the Oogatron history insertion, assert `changes()=1` using the CHECK table. Verify the resulting new-login owner and matching immutable cutoff in SQL. OBL's scoped session deletion is intentional and can affect zero or more of that owner's sessions.
5. Drop only the assertion table created at the start of the file after all assertions pass. Rehearse the exact file on an isolated restored copy, including failed-precondition and failed-postcondition rollback, and review the diff and expected results before remote execution. A failure must stop the entire database file.

The operator's future commands, from the OBL checkout, are:

```sh
node worker/node_modules/wrangler/bin/wrangler.js d1 execute oogaboogaland-production --remote --config wrangler.production.jsonc --file /absolute/private/cutover/obl.sql
node worker/node_modules/wrangler/bin/wrangler.js d1 execute oogatron --remote --config ../oogatron/worker/wrangler.toml --file /absolute/private/cutover/oogatron.sql
```

The paths above are placeholders, not generated executable plans. Confirm live configs and actual private paths at execution. Run sequentially, inspect completion/bookmark and post-state after each, and keep services paused until both verify. A timeout is an unknown outcome: inspect current state and the import status before retrying. A completed first database is not undone by failure in the second. Resolve that state through reviewed forward completion or repair; never blindly replay the whole cutover.

After both files complete, compare stable IDs, contribution events and rollups, scores/times, run IDs and replay pointers against the final baseline. Then complete the character PR/deployment, owner reauthentication and cache verification. Existing guard migrations remain installed throughout recovery. Never restore an old full backup over unrelated new production activity or assume the old GitHub login can be reclaimed.

Verification evidence is deliberately separated: an isolated local D1 test confirmed that a SQL-file constraint failure rolled back its preceding write, and that a successful file committed both statements. The remote import semantics are supported by Cloudflare's documentation and the installed CLI's import implementation; no remote write experiment or live account migration was executed as preparation.

References: [Cloudflare D1 getting started and file execution](https://developers.cloudflare.com/d1/get-started/), [D1 Worker batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/), [cron propagation](https://developers.cloudflare.com/workers/configuration/cron-triggers/), and [the account-specific cutover plan](bitcoin-bill-account-migration.md).
