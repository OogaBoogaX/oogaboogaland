# Cloud Archive · review repairs

Repairs to `feature/cloud-archive` after review of `ddcef532833710ef4fa9767050d009d6ef8d3a5e`. The findings are the
maintainer's consolidated list from the Astra and Claude browser reviews, grouped by priority as given. Each row says
what changed and what shows it. "Unit" means `npm run test:unit`, whose `cloud archive history` check holds every
regression case below. "Browser" means the scripted sessions run on software GL (SwiftShader) for this repair, which
are described in the report that accompanies these commits.

## 1 · Contributor attribution and PR accuracy

| Finding | Resolution | Evidence |
|---|---|---|
| Display names were mapped to logins, so two people sharing a name became one identity | Removed. An identity is a GitHub account only through a noreply address; any other author is its own identity per exact address. Labels are numbered when two identities share one, and an account's login is never renamed | Unit: `collision`, `unknown`. Before/after: fails on `ddcef53`, passes now |
| The branch owner in "from owner/branch" was credited as the PR's author | Removed. PR authorship is not shown; a merge commit keeps its own git author | Unit: `noBranchOwner`. Before/after |
| A merge-looking subject or a "(#N)" suffix counted as a merged PR | A PR number is shown only for a PR-head match: a merge commit whose second parent is the head GitHub publishes for exactly one PR (`refs/pull/<n>/head`, read with `git ls-remote`). Subjects prove nothing. See Astra's follow-up below for why this is no longer called "merged" | Unit: `fakeMerge`, `headMatch`. Before/after |
| Use verified GitHub metadata, or describe the narrower attribution honestly | The API is not reachable from the build container for the official repository, so the archive claims only what git and GitHub's published PR refs show. The provenance, the plan and every day's note say so | Snapshot `provenance`; board note |
| Organisations, automation and agents mixed with human counts; kinds read from display names | Kinds come only from a `[bot]` noreply login (automation) or the reviewed mapping `scripts/cloud-archive-identities.json` (agents, organisations), never a display name. Counts and boards list authors apart from automation and agents | Unit: `unknown` (a person named "Claude" stays an unlinked author) |
| Reviewed identity mapping; no email addresses; no speculative matches | The mapping holds two entries, Claude Code's and Codex's service identities, keyed by SHA-256, never by address. No address, and no hash of a personal one, reaches the data. Addresses inside titles are replaced (one PR merge's first body line was a `Co-Authored-By` trailer) | Unit: `noAddress`, `snapshot` |
| History came from whatever HEAD was checked out | `npm run archive -- --rev <sha>` requires a full SHA on official `rock`, read with `ls-remote`. It refuses fork commits, short SHAs and shallow clones. Provenance records repo, branch, rev and official tip, and commit links point at that repository | Unit: `selectsRev`, `refusesFork` (temporary repositories, end to end). Before/after: the reviewed script shelves a fork-only commit |
| Regenerate after reviewing the generator | Regenerated from `rock` at `37d9f3947bbff844f792595471e3eb99ab13e7f9` against 324 PR refs (digest `9734213d…`): 2,029 commits on 53 UTC days; 257 PR numbers matched by 261 merges; 1 merge of a head two PRs share, credited to none; author identities: 13 account, 13 unlinked, 2 automation, 2 agent, 0 uncertain | `src/js/cloud-archive-data.js` |

## 2 · Keyboard and touch access

| Finding | Resolution | Evidence |
|---|---|---|
| No keyboard way to read a shelf | Facing a shelf on the floor, Space (or the act button, READ) opens its day, through the crew's own `useNear` | Browser: real Space at rack 2 opens day 2 |
| Chairs and shelves could compete for Space | One resolver (`findNear`) picks the nearer of a faced shelf and a free chair; Space does exactly that one thing | Browser: Space by a chair sits and opens no board |
| Touch wording, and a usable stalk-entry action | On the island the beanstalk's prompt said "ENTER ARCADE", because the act chain had no branch for it. It now reads CLIMB, with touch hints. Inside, the act button reads READ, SIT, STAND UP! or ISLAND as appropriate | Browser (touch emulation): tapping CLIMB enters; tapping READ opens the day |
| Board keys, closing and focus must not move the Ooga or leave | Checked with real keys: the arrow keys flip days, the Ooga stays where it stood, and Escape closes the board without leaving the scene | Browser session 1 |

## 3 · Safe exit and arrival

| Finding | Resolution | Evidence |
|---|---|---|
| Falling into the shaft sent the visitor home | Home now takes a deliberate act: getting off the ladder at the foot after having climbed, Space (ISLAND) at the foot, Leave, or Escape. A fall lands at the foot with a hint, and the Ooga can climb back up | Browser: walked into the shaft, still in the archive after 3 s; Space at the foot then goes home |
| Direct entry had no coherent return | Any way out marks the beanstalk as standing (`world.archiveRevealed`), so a page that opened straight in the archive returns beside a stalk. Leave is visible from arrival, and the TV says how to tune in | Browser session 2 |
| Unused `archiveExit` state | Removed | Code |
| Fragile `children[1]` reference | `build()` returns `stalk` by name | Code |

## 4 · Motion, buffers and snapshots

| Finding | Resolution | Evidence |
|---|---|---|
| Reduced motion was ignored by the cloud hit and the TV | Under `prefers-reduced-motion` a hit neither flashes nor pulses the cloud, and the stalk stands at once. The TV has no snow and no auto-advance, and changes only by hand | Browser session 2 |
| The TV changed page under someone reading its board | While the island-cam board is open the TV holds its channel; pages turn only by hand | Browser session 1: 12 s with the board open, channel unchanged |
| Per-paint `ImageData` and per-shot canvases | The snow `ImageData`, channel captions and counters are made once per visit. Island pictures go into at most six 480x360 canvases, made once a page, reused by every climb and filled at climb time; nothing is allocated per frame | Code |
| Snapshot approach; live cutaway and player state contaminating captures | `renderArchiveView` in the hub draws as `snapFromShield` does: cutaway off, the visitor's own Ooga hidden. The options go into one reused object | Code |
| Bound capture resolution and work; measure | At most six pictures, one a frame during the 0.45 s move in, each copied once at 480x360 from a centred 4:3 crop. Draw-and-copy times are recorded per picture (`shotCosts`). SwiftShader timings appear in the report and are not hardware claims | Browser session 1 |

## 5 · History completeness and packaging

| Finding | Resolution | Evidence |
|---|---|---|
| A day over 192 commits silently lost books | The generator's `SHELF` rule: a busier day keeps 191 books plus one overflow binder, counted on the plaque and board. The models check at load that their rack matches the data's capacity. No day overflows today (the busiest has 184) | Unit: `overflow`, `rackOverflow` (the real models build a 250-commit day as 191 books plus the binder) |
| UTC day links and date-filter semantics | Days are UTC by committer date. The day link no longer uses `since`/`until` (GitHub reads those in the viewer's time zone); it opens history from the day's last commit SHA, which is exact | Code; board links |
| Portable-page size impact | The single-file `oogaboogaland.html` grows from 39,316,029 to 39,603,300 bytes (+287 KB, +115 KB gzipped, about 0.7%). The data accounts for 223 KB (93 KB gzipped) of that. On the hosted site it is all in the deferred `cloudarchive` chunk, fetched only on climbing in. No packaging change was made | Build measurements |
| Inconsistent location descriptions | The plan now says "west meadow", as the code does (foot at x = -9, z = 5). The plan's "no chairs or TV" line now describes the lounge the maintainer asked for | Docs |

## Astra's follow-up review of the first repair (`4dbfff8`)

Astra applied the draft patch to `ddcef53`, ran syntax checks and reproduced three remaining failures. Each now fails
on `4dbfff8` and passes on this branch (`regression-three-way` in the review ZIP, and the unit check).

| Finding | Resolution | Evidence |
|---|---|---|
| P2 · `cloud-archive-lib.mjs` 72–78: a second parent matching `refs/pull/N/head` doesn't prove PR N was merged; open, closed-unmerged and duplicate PRs can share a head, and choosing the lowest number can credit the wrong PR | Renamed everywhere to "PR-head match", in data, provenance, board, plaque, plan and CLI. `pullsByHead` keeps every PR per head; `pullMatch` credits a number only when exactly one PR has that head. A shared head credits none, is flagged (`flags & 4`) and counted (`sharedHeadMerges`). On `rock`, PRs #40 and #65 share head `29c62adb`; its merge was credited to #40 before and is credited to neither now (257 matches) | Unit: `headMatch` (the corrected positive assertion), `sharedHead`. Three-way: FAIL on `4dbfff8`, PASS now |
| P2 · `cloud-archive-lib.mjs` 69: addresses escaped through author display names (an author named `contact@example.com` exported unchanged) | Every exported label is scrubbed, git names and the reviewed mapping's labels alike, before labels are de-duplicated. The check scans the complete generated output | Unit: `noAddress` (display name, mapping label, title, trailer, whole output), `snapshot`. Three-way: FAIL on `4dbfff8`, PASS now |
| P3 · `cloud-archive-lib.mjs` 63: `alice@` and `123+alice@` noreply addresses became two identities with identical labels and two accounts | Numbered addresses key on the account number. An unnumbered address joins one only through a reviewed alias (`login` + `noreplyId`). Without one, while the same login also appears numbered, it stays apart as `unconfirmed`, labelled "alice (unconfirmed)" and not counted as an account. A final pass guarantees that no two exported labels are equal, even when a git name reads "sam (1)". Today's history has no unnumbered noreply addresses, so this is preventive | Unit: `mixedNoreply`, `uniqueLabels`. Three-way: FAIL on `4dbfff8`, PASS now |

## The browser review's findings on `3cb308f` (reproduced by Astra)

| Finding | Resolution | Evidence |
|---|---|---|
| 1 · Unicode, local-domain and bracketed-IP addresses escaped the scrubber | The scrubber no longer tries to recognise addresses: any run of non-space text with something on both sides of an "@" is replaced, in every exported title and label, git names and reviewed labels alike. "@mentions" are kept | Unit `noAddress`, with an oracle independent of the scrubber: every exported string walked for an "@" between text, plus each example's own fragments (`josé@exämple.com`, `用户@例子.广告`, `admin@localhost`, `root@[192.168.1.10]`, `ops@[IPv6:2001:db8::1]`). Four-way: FAIL on `3cb308f`, PASS now. The whole snapshot scanned the same way (4,184 strings, none) |
| 2 · Mixed numbered and unnumbered noreply forms were handled only for accounts | One rule for every kind: an unnumbered form joins a numbered identity only through a reviewed alias. Otherwise both stay, the unnumbered one marked `uncertain` with a label saying so, whether account, automation, agent or organisation. Counts are `counts.identities` per kind plus `uncertainIdentities`; nothing claims a count of unique people or bots | Unit `mixedNoreply`, `mixedKinds`. Four-way: the automation and agent cases FAIL on `3cb308f`, PASS now |
| 3 · Labels did not follow renames | A numbered account is labelled by the newest login recorded for it, and an unlinked address by the newest git name recorded with it (commits are read oldest first). The provenance, plan and board note say these are self-reported historical identities, not verified current account ownership | Unit `renames` (and an unnumbered address under the old login stays apart, uncertain). Four-way: FAIL on `3cb308f`, PASS now |
| 4 · Wording | The plaque reads "N PR-head matches · N author identities", sized to fit. The board header and note say "author identities". Links read "PR #N (PR-head match) · merge message: “…”". Unlinked names show "(git name)" instead of `*`, explained in the note | Code; browser evidence |
| 5 · PR-ref provenance | `provenance.pullRefs` records `fetchedAt`, `source`, `count` and a deterministic SHA-256 `digest` of the sorted `<n> <sha>` lines. The provenance, plan and note say matches depend on that snapshot as well as `--rev`. `prHeadMatches` (distinct PR numbers, 257) is counted apart from `prHeadMatchRows` (matching merges, 261). `--pull-refs <file>` regenerates against a saved ref list, and doing so reproduces the committed snapshot exactly, apart from fetch time and source | Unit `pullRefs`, `snapshot`. Snapshot validation in the ZIP |

## Found by the browser checks on `66dcb3b`

| Finding | Status | Evidence |
|---|---|---|
| **Space at an armchair jumped instead of sitting** for wide Oogas. The chair's stand-up spot sat 1.1 m from its centre; with the chair's 0.5 m solid, an Ooga wider than 0.6 m (this run's has a 0.82 m body radius) could not stand there, so the crew's `sitPlayer` refused the seat and Space fell through to a jump | **Fixed** in the commit after `66dcb3b`: `SEAT_BACK` 1.35, as the Timechain Sphere's chairs leave for the widest Ooga | `diagnose-chair*` logs: SIT shown and the chair nearest, yet `sitPlayer` refused while grounded with no key involved; the 0.82 m radius against the 1.1 m gap. Re-checked on the fix commit |
| **After a page opens straight in the archive, the island arrives with no Ooga under control.** Leaving by Escape or by the Leave button gives the same result. Leaving an archive entered from the island (the usual path) keeps the Ooga | **Fixed in the pre-PR commit.** Root cause: on a direct entry, the archive chose the roster's first drivable Ooga, usually "away" on a local page. `crew.stateOf` keeps an away Ooga away (it ignores the hub's wake-up `override` unless that Ooga is the player or the signed-in owner), so the hub's `pilot.possess` on the way home refused it ("…is in another place"), and its result went unchecked. The archive now prefers an Ooga the island will hand back (not away) | Diagnostic A and B on `66dcb3b` (no Ooga); the short direct-entry diagnostic on the fix commit (an Ooga under control after Leave and after Escape) |
| Session 2's double Escape: is it the probe? | **Not the cause.** The first Escape does detach inside the archive (pilot's Escape steps: free the mouse, detach, then leave), so two presses are "detach, leave", but variant B shows the defect without any Escape | Diagnostic A and B |

## Pre-PR repairs (Billy's decisions)

| Decision or finding | Resolution | Evidence |
|---|---|---|
| Author names come from GitHub's own records | `--github-authors <file>` takes the REST commits API's author per commit (`author.login`, `id`, `type`), saved with one `gh` command (in the script's header and `inputs/README.md`). A linked commit is labelled by that login, one identity per account id; one GitHub links to no account is an "unlinked contributor"; the `[bot]` and reviewed-agent rules stay; GitHub's `Bot` and `Organization` types set those kinds. A git display name is never used in any mode. The provenance records the source, read time (the file's), digest and linked/unlinked counts. A file that misses a commit at `--rev` is refused. The build container could not reach GitHub's API for the official repository, so Billy saved the records with the `gh` command (2026-11-01 03:52 UTC, digest `17e2ac95…`) and regenerated, in commit `32b97aa`: 2,022 of 2,029 commits linked; author identities 17 account, 1 unlinked contributor, 2 automation, 2 agent, 0 organisation, 0 uncertain | Unit `githubRecords` (login, neutral label, kinds, no git name anywhere in either mode, missing record refused), `authorRecordsCli` (refused without records or `--provisional`; a covering file used and described; a partial one refused) |
| Inputs kept for reproduction | `docs/cloud-archive/inputs/pull-refs-37d9f39.txt` (the PR refs read 2026-11-01 02:29 UTC) and `github-authors-37d9f39.ndjson` (GitHub's author records, only `sha`, `login`, `id` and `type`) | Regenerating from both reproduces the committed snapshot, apart from file read times |

## Review findings on issue #385 and draft PR #386

| Finding | Resolution | Evidence |
|---|---|---|
| Walking collision allocated an object a rack a step (`clearOfRacks` called `L.rackAt(i)`) | The racks' home places are read once a visit into two `Float32Array`s; a step reads them and allocates nothing | `cloud-archive-interior.js` `RACK_X` / `RACK_Z` |
| The Cloud Hopper records channel read its scores as a cabinet's (`machines: ["cloud-hopper-1"]`), but the game's `scoreType` is `ooga`: records are keyed by player login, so the channel found none | `scoresOf(rule, data)` reads by the game's own score type: a machine game one record a cabinet (only its own cabinets), Cloud Hopper one a player, best first. The arcade is three channels: cabinet records, Rally (a track and mode each) and Cloud Hopper players | `cloud archive tv` in the global tier: `machineScores`, `playerScores`, `cabinetChannel`, `hopperChannel` |
| The TV rebuilt arrays and formatted unchanged readings on every update | Each channel has a `stamp` (numbers only) that moves only with what it shows; the TV checks the tuned channel's stamp once a second and formats and repaints only when it moved. The guide rewrites a row's status only when it changes | `stamps` in the check; the smoke check counts no repaints while nothing changes |

## Astra's follow-ups on `f4a6339` (#385/#386)

The rack-allocation and Cloud Hopper findings are closed.

| Finding | Resolution | Evidence |
|---|---|---|
| A GitHub pick opened the Oogatron at whatever page the sign showed, with no reading hold | `detailFor(channel, reader)`: an Oogatron page opens its own view; Repositories opens the top repository's totals, filtered to it. The board's readers are made through `selector.holdDetail`, which holds rotation and block cuts until the last of them is disposed (a floating board disposes its reader on close; leaving closes all; `settle` releases a board that never opened; the selector's `dispose` releases everything) | unit `detailPage`, `detailRepos`, `detailBoard`, `detailHolds`, `detailReleases`, `settleReleases`, `disposeReleases`; the focused browser check |
| Enabled was shown as LIVE | Status comes from each feed's own record. The Oogatron uses `lastAt` against 60 s and is HELD (the bake) before a good read once one failed. The totems' poll and failure counters are noted as they move (the feed keeps no success time) and judged against the 90 s step: an error in the newest attempt, or no movement for three steps, is STALE. Lightning Jet's single read is LIVE for its 30 min cache, then STALE, and its bake or cache is HELD. The chain is OFF when it has failed before any reading. `stampOf` folds the status into the repaint key | unit `oogatronNever`/`Failed`/`Fresh`/`Stale`, `totemNever`/`Failed`/`Fresh`/`Failing`/`Quiet`, `jetAbsent`/`Bake`/`Fresh`/`Old`, `statusInStamp`; `before-after.txt` on `f4a6339` |
| Players online missed a zone-only move | The stamp folds every remote's zone in through an allocation-free string code, bounded by the room's size | unit `zoneMove` (same population and NPC version) |

## Integration with official rock `edf2c08`

| Finding | Resolution | Evidence |
|---|---|---|
| rock retired Cloud Hopper's single board (`cloud-hopper`: still read, never updated) and moved its records to a player-keyed board a level (`cloud-hopper-l1`…`l4`, `cloudHopperLevels`). The TV's Cloud Hopper channel would have shown only the frozen board as LIVE | The channel reads each level's board (named from `cloudHopperLevels`) and the retired board, best player by login, and watches all five lazily | `cloud archive tv`: `hopperChannel`, `watchesOnShow` fail on the `30a9c7cc` channel and pass after |
| Watched records refresh about every 30 s for signed-out visitors where the island server keeps them (rock's #437), now for up to five Cloud Hopper boards plus Rally and the cabinet games | Not changed (upstream's watch contract); documented in `LIVE-SYSTEMS.md` | — |

## Block Frenzy view-assist branch

`feature/block-frenzy-view-assist` (`5f42979…`) was inspected. Its `view-assist.js` is byte-identical to this branch's,
and none of these findings touch view assist's logic, so it needs no matching change and was left untouched.

## Final Totems freshness qualification (#385 / #386)

The first observed successful-poll count is now only a baseline: pre-existing readings show HELD, not LIVE. A later observed success starts the guide's age clock. Failures and clearing an error cannot refresh that clock. Disabled, never-loaded and failed feeds retain their OFF/WAITING/STALE handling. No feed changes, polling, sockets or requests were added.

The existing TV rule proof now checks entry with old data, failure on that data, cleared errors, an observed success and failures that must not renew stale data. Live-server, production-CSP, phone and reduced-motion browser acceptance remain unverified.
