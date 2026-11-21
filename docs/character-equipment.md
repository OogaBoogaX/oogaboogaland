# Live character hats

Implementation issue: [#839](https://github.com/OogaBoogaX/oogaboogaland/issues/839).

This first equipment flow lets a player try the existing contributor hats in
the character studio and save one for their own account. Hats are freely
available. The HQ store and purchases will use the same equipment path later.
This work builds on the independent character catalog stack and starts on
staging; it does not enable production.

## Content and ownership

Each hat has a stable item ID, creator attribution and an immutable version.
Publishing a creator's updated hat advances that item's current version. Historical
geometry stays available: a wearer gets an update notice and can accept it or
keep their version. Accepting updates their saved selection and live avatar;
declining suppresses that revision's notice without changing their appearance.
A later revision can offer another update. New selections use the current
version. The authored appearance and no hat are separate choices.

An explicit registry extracts only hats from the existing designs. Hair,
glasses, facial features, weapons and character ownership do not transfer.
Attachment adapters preserve the recipient's head and animation. Contributor
NPCs keep their authored appearance; saved equipment belongs to the player's
driven body.

The first registry contains the straw hat, spiked helmet, green Bitcoin beanie,
flame crown, Taproot cap, gold space helmet, ruby crown, top hat and gold crown.
Normal and slim heads, the nine source characters and `w-s-bitcoin`'s apple head
have fittings. Other replacement skulls, masks and custom heads show an explicit
fitting limitation and retain their own appearance. Gorillas keep their own look.

Apple fittings use each hat's authored crown size: the five voxel caps need only
small side clearance, while the straw hat, ruby crown and top hat retain their
width and depth. The space helmet sits upright around the head; its donor-only
muzzle lining is hidden. Closed hats tuck the apple's stalk and leaf away using
a cached head variant. Open flame/ruby crowns, no hat and the original look
restore them. The original head, face, tusks and blink geometry remain intact.

## Updating an authored hat

The nine existing custom character files expose `dress.hat(k, v)` for hat-only
voxels and, where needed, `dress.hatNodes(k)` for hat-only nodes attached to
`k.parts.head`. Hair, glasses and facial details remain in their existing hooks.
Contributors submit only their character file, including when changing a hat.
Their authored appearance changes with that character's code release.

Ordinary builds generate shared wearable data from the committed catalog and
immutable archives. They validate archive hashes, size, schema and retained
history without reading or executing creator files for this step. A voice,
body, date or hat edit therefore does not force a contributor to change shared
files. Wearers keep the published geometry until a maintainer publishes an update.

After reviewing local source changes, a maintainer can check for drift:

```sh
node scripts/equipment-hats.mjs --check-sources
```

This read-only command loads the allowlisted character files and extracts their
hat geometry using the current model helpers. Its JSON lists `sourceChanged`
(whole-file provenance differs) separately from `geometryChanged` (extracted
geometry differs from the published current version). Only geometry drift gives
exit status 1; an unrelated character edit can change provenance without changing
a hat. Normal builds and contributor CI do not run this source-executing check.
The `sources` hashes in `catalog.json` record the files used at the last explicit
authoring operation; they are provenance, not a build freshness requirement.

Review every reported geometry change before publishing; both commands inspect
all nine approved sources. Then run:

```sh
node scripts/equipment-hats.mjs --author
```

This loads the reviewed allowlisted character files and invokes their explicit
hat builders in the local authoring process, writes immutable plain geometry under `src/equipment/hats/`,
and advances that item's current version in `catalog.json`. The stable item ID
does not change. All previous archives and their index entries stay committed.
The maintainer commits the updated catalog and new archives in a separately
reviewed change. A source edit alone never advances a wearable version.

These initial hats come from custom JavaScript, so creator changes still require
an approved manual code release and character-catalog baseline handoff. The
equipment geometry served to wearers is data only. An already-open browser can
fetch a newer immutable version when accepting an offer without replacing its
character catalog or executing downloaded JavaScript.

## Studio and live state

The local `character:studio` command stays an offline preview. A hosted studio
uses same-origin account APIs to save equipment without taking over an island
tab's room connection. Previewing another character never edits that character
or its owner's equipment.

The server stores the selected item/version, personal size and a monotonic appearance revision
against the numeric account ID. Changes validate the session, origin, item and
expected revision, and persist before acknowledgement. The live Room sends
small appearance updates to the wearer and players who can see the avatar,
including mutually visible main-world zones. Arrivals and reconnects receive
current state, and stale updates cannot replace newer equipment. Pose handling
performs no equipment storage reads.

Open the hosted studio at `/?scene=studio`, sign in, select a hat and press
**Save hat for my Ooga**. **Hat size** normally previews 80–120% of the reviewed fitting;
**Reset fitted size** returns to 100%. Both remain previews until Save. The
percentage scales the hat uniformly around its fitting point (the center for
the space helmet), reusing the attachment and geometry. A different hat starts
at 100%; selecting the saved hat restores its saved size. This personal override
does not create a catalog version or notify other wearers. It can remain open beside an island tab on the same
account; the studio does not join the Room. Local preview links to the staging
studio for account saving. A new creator version offers **Accept update** or
**Keep my version**; a later distinct version can offer again.

The gold space helmet on `w-s-bitcoin` has a 100% minimum, its reviewed fit
around the apple shell. The slider offers 100–120% and explains the minimum;
other hat/head combinations retain 80–120%. The shared `minimumSize` fitting
rule also applies to saved choices and live rendering, including old messages
or catalog versions. Older undersized saves are corrected to 100% with a new
equipment revision, preserving the selected version and declined-update choice.
The UI and API report the corrected size; the limit is not a hidden enlargement.

Every equipped hat uses the renderer's `geometry.depthOffset` surface priority,
including future catalog versions and every personal size. WebGL applies the
same small depth bias in the depth prepass, normal view and reflections, so a
hat wins coincident head/hair surfaces without changing its geometry or shadow.
Ordinary nearer surfaces still occlude it. Canvas and HUD portraits use a small
face-sort tie bias as their painter fallback. This prevents depth fighting; it
does not turn a hat that is too small into a correct fit or hide hair protruding
through it. The helmet minimum prevents the known apple-shell intersection.

`GET /api/equipment` returns the account's current record. `PUT /api/equipment`
takes its expected `revision` and either `selection` (with optional `size`),
`size` alone, or a `decline` version. `size` is an integer percentage from 80 to
120. Omission preserves the saved size, including during Accept/Keep; older
records and appearance messages without size default to 100.
An original appearance is `selection: null`, and a bare head is
`{ item: "none", version: null }`. Conflicts return 409 and the current record.
The browser reads immutable geometry at `/api/equipment/hats/<sha256>.json`.
Failed reads retry through one shared timer after 1, 4, 15 and then at most every
30 seconds while that version is still selected. Hidden pages pause retries;
removing or replacing a selection cancels its retry interest. Successful reads
update waiting own/peer models and the Studio without requiring another snapshot.
Late reads can warm the immutable cache but cannot restore an obsolete choice.

Hat-riding pets remeasure their support after item, version or size changes,
including no hat and the original appearance. Seats are cached by the canonical
open head and equipment appearance, with at most 64 entries per head. The pet
keeps its motion phase and quaternion; steady posing does not rescan geometry.

Migration `0012_player_equipment.sql` adds one account row with deletion cascade.
Migration `0013_player_equipment_size.sql` adds the validated size, defaulting
existing choices to 100. An older Worker can still update the other columns.
There is no purchase history or paid inventory in this iteration.

Staging sets `EQUIPMENT_ENABLED=1`; production keeps it `0`. The staging workflow
has an explicit `catalog_preview` dispatch option so this draft can use the
catalog-aware handoff without changing repository-wide automatic release flags.
Turning equipment off hides account saving and live updates while keeping stored
choices. Re-enable only with the immutable versions those choices reference.

Before fencing a catalog release, the deployment workflow compares the live
public `/api/equipment/catalog` history with the target's hash-checked archives.
Keeping every published version also covers a player who equips during the
deployment. This history check also runs for a feature-off release, so disabling
equipment cannot discard versions needed when it is enabled again. After
migrations, a second check reads only distinct saved item and
version pairs from D1 and refuses missing archives. A pre-equipment Worker can
return 404 at the first bootstrap; other reading failures stop the release.
Pin `CHARACTER_CATALOG_TOOLING_SHA` to tooling containing
`scripts/equipment-retention.mjs` before using this workflow.

Use this guarded workflow for releases. A direct `wrangler versions rollback`
does not run the retention checks. To roll back rendering changes while keeping
equipment enabled, make a forward release that retains the entire hat history.
An explicit feature-off release can stop equipment temporarily without deleting
account choices. Historical archives remain in every release, including while
the feature is disabled.

The Room's private admission session digest prevents an account deleted and
recreated under the same numeric ID from inheriting a stale connection's
equipment revision. It never appears in equipment messages or public metadata.

## Acceptance before rollout

- Try every supported hat, restore authored headwear, remove it, and verify
  hair, face, motion and gameplay state remain intact.
- Save from the studio while another tab remains in the world; a nearby player
  sees the change without refreshing. A distant player catches up on arrival.
- Refresh, reconnect and restore the Room with the same saved equipment.
- Reject invalid IDs, cross-origin and unauthenticated writes, and conflicting
  revisions. Account deletion removes saved equipment.
- Publish another version of one existing hat; accept on one wearer and decline
  on another. Both choices survive reconnects, with the older geometry retained.
- Record Worker and browser checks and real staging evidence separately. Keep
  the PR draft while implementation or staging acceptance remains.

### Local validation (2026-11-20)

The maintainer chose local multiplayer coverage plus a single-account live
staging check. The local browser run, `node test/run.mjs equipment-app`, passed
27/27 checks using the real hosted studio and renderer with explicit account,
HTTP and socket fixtures. It covered all nine hat previews without reallocating
the wearer, saving and reloading a pinned version, fixture creator revisions
with **Accept update** and **Keep my version**, a later offer after declining,
concurrent-save conflicts, authored/no-hat restoration, the apple-head fitting,
and desktop and phone controls. Sizing checks cover preview-only slider/Reset,
saved percentages across reloads, Accept/Keep preserving size, size-only live
updates reusing attachments, legacy messages defaulting to 100, invalid/stale
updates and a delayed Accept losing to a later Keep choice. Minimum-size checks
cover the apple helmet's 100% slider limit, legacy undersized reads and live
messages, save/reload at the displayed size, and other hats/characters retaining
their 80% minimum. Normal flows had clean consoles; the intentional
409 response was checked separately for its expected browser resource error.
Download recovery checks reject two reads before succeeding without another
appearance message, then verify retry cancellation and late-result cleanup.

The browser also applied fixture messages to local and remote avatar models:
changes preserved pose and gameplay nodes, reused immutable geometry, rejected
older revisions, cleared equipment on leaving visibility and restored it from
an arrival snapshot. These were modeled peers in the browser, not two actual
signed-in Chrome accounts connected to staging.

Worker integration tests exercised the Room implementation with simulated
sockets and SQLite-backed account choices. They verified delivery to visible
peers while excluding distant scenes, catch-up on zone entry, reconnect and
hibernation recovery, interrupted-publication recovery, concurrent-save revision
checks, and retained Accept/Keep choices across reloads and newer metadata.
Model tests separately checked all nine attachments, shared geometry, preserved
authored heads and the reviewed apple fitting. Immutable archive validation and
deployment retention checks cover keeping previously published versions.
The 15 hat-model checks include physical apple clearances, reversible leaf/stalk
tucking, six recipient types at 80/100/120%, fixed fitting anchors and repeated
resizing without transform drift. Every legacy 80–99% apple-helmet request returns
to the exact 100% fit without replacing nodes; its crown clears the actual inner
lining faces by at least 0.2 voxel. The pet controller regression covers removal,
replacement, sizing, restoration, cloning and blink-independent support, with no
geometry scans or matrix allocations in steady frames. Focused hub pet browser
checks passed 6/6 (`ONLY='hub pet' node test/run.mjs --browser-only hub`), excluding
the global tier. Historical head goldens and the archived straw proportions use
fixed reviewed source inputs, retaining their assertions while allowing live
creator files to change. Full local Worker validation passed 839/839
checks, including local-server integration checks. The focused equipment API and
Room run passed 23/23, including durable fit correction, revision conflicts,
canonical ownership, peer/wake recovery and catalog expiry/outage handling.

At revision `39dc21ed82465bdbe22b25aee2e857aa3aadf649`,
[Linux CI run 44800255713](https://github.com/OogaBoogaX/oogaboogaland/actions/runs/44800255713)
passed 831 root unit checks and 827 Worker checks. This CI record and the local
browser results are separate from live staging acceptance.

### Live staging validation (2026-11-20)

[Staging release 44801155812](https://github.com/OogaBoogaX/oogaboogaland/actions/runs/44801155812)
deployed application baseline `39dc21ed82465bdbe22b25aee2e857aa3aadf649` using
tooling `61faffb7df2168855cb4db833a2d690f93929982`. Worker version:
`387084f9-48b2-44cc-afae-2bda165eed3e`. Migration
`0012_player_equipment.sql`, all 827 Worker checks, both retention gates and live
catalog verification passed. The release finished at generation 8 with no
pending transition. The 58-character catalog is revision
`7767c79cc99775c3dc819cb8306f0db972b81018bc5e8c04f88352216e4d5e2d`,
activation generation 1.

Using the maintainer's existing signed-in account, the hosted studio displayed
all nine hats and saved the straw hat. The already-open island tab visibly
changed from the original apple head to the straw hat without navigating or
refreshing. The studio retained the selection after a full reload. Leaving the
island for the studio and returning created a fresh Room connection, still
wearing the saved hat with one account online. Restoring the original character
look updated the existing island tab live and survived another studio reload.
The account was left with its original appearance.

The public registry returned nine items and nine versions. The straw archive
returned HTTP 200, the expected SHA-256 bytes and ETag, and a one-year immutable
cache policy. A post-deployment retention preflight confirmed all nine published
versions remain in the next target. Screenshots are local acceptance artifacts
under `untracked/equipment/staging/`: `studio-straw.png`,
`live-island-straw.png`, `reconnected-island-straw.png` and
`restored-island.png`.

The first render attempts exposed an unused background WebGL context's Linux
GPU readback warnings and one Chrome startup failure. The offline portrait
tool now opens that background through the existing Canvas mode; the actual
portrait renderer is unchanged. Local before/after PNG and manifest bytes were
identical, strict console checks remained enabled, and the Linux render passed.
The unpublished failed target was replaced under the guarded release lock;
the final successful run resumed its exact prepared application baseline.

No second real staging account participated, and no synthetic creator revision
was published to staging. Nearby/far-player propagation, Room hibernation and
Accept/Keep across creator revisions are covered by the local checks above.
Production and automatic publishing flags were not changed.
