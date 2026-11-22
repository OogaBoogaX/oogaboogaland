# Character equipment: hats and the wardrobe

Implementation issues: [#839](https://github.com/OogaBoogaX/oogaboogaland/issues/839) (hats) and
[#868](https://github.com/OogaBoogaX/oogaboogaland/pull/868) (the wardrobe beside them).

A signed-in player tries what the contributors' Oogas wear in the character
studio and saves a look for their own Ooga: a hat, and a piece for every other
slot (see [The wardrobe](#the-wardrobe)). Everything is freely available. The HQ
store and purchases will use the same equipment path later. Staging and
production both enable it.

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

## Shared hats and variants

The catalog follow-up in [#831](https://github.com/OogaBoogaX/oogaboogaland/issues/831)
keeps item identity separate from shared geometry. New revisions reuse identical
geometry, and identical wearable choices appear together with their creator credits.
An edited fork has its own item and update history, with a parent item and exact
parent version. The Studio groups forks in expandable variants under the original.

Each published geometry version is complete and immutable; loading it never
requires applying patches to a parent. A parent update does not change its forks.
Saved item/version choices, personal size and declined updates remain intact, and
only an update to the selected item's own history offers Accept or Keep. Existing
archives stay readable during the transition. Fitting rules remain explicit, so
sharing geometry cannot accidentally change a helmet's minimum size or attachment.

A new version is an immutable revision record containing its item, fitting profile,
parent reference and content hash. That hash names a complete geometry object
with transforms, faces and colors, independent of item identity. Both objects are
validated and hash-checked; no runtime patch chain is involved. Two revisions can
share the same content object and rendering buffers while keeping independent
creator attribution, saved selections and update decisions. Geometry alone does
not merge choices with different fitting profiles.

The initial nine full archives and their current hashes are retained unchanged.
Registering this catalog format therefore does not offer a cosmetic update when
nothing changed. New clients can load either archive format. An older client
that cannot load the new format keeps its old selection; refresh the page before
accepting a newly published format-2 version.

The Studio lists the hat in the hat tile's editor beside every other slot (see [The
wardrobe](#the-wardrobe)): one dropdown option for identical current choices, its
creators in the option's tooltip and under the dropdown, and each fork as an
indented option under its original, a fork's own forks indented again. Selecting
a shared option preserves an already-saved member's exact item/version and update
stream. A saved historical version stays available, as an option of its own,
while trying other hats.

## The wardrobe

Beside the hat, an Ooga wears a body and something in each of these slots, in the
studio's order: body, height, pet, skin, hair colour, eye colour, hair, eyes, glasses, mask, mouth, beard, shirt, gloves, belt, pants,
shoes, back (wings, capes and what else is built out past the trunk) and its
primary weapon. `src/js/equipment-wardrobe.js` is the contract, shared unchanged
by the page, the Worker and the authoring script: the slots (`SLOTS`), what a
piece is as data in each, which authored block belongs to which body slot
(`regionOf`), and a saved wardrobe's shape.

A piece is data read from a character's own design, never a hook: blocks for the
hair, the glasses and the body slots (in the character's own colours, or the
wearer's skin, hair or fur by name), traits for the eyes and the mouth, a colour
for the beard and for the skin, hair and eye colours, and a mesh for the mask and
the weapon. Identical pieces are one
item credited to everyone whose Ooga wears it, and the stock outfit's pieces are
credited to the project. An item is named by its content's hash: a creator's
later change makes a new item, and the old one stays registered, retired, for
whoever wears it. There is no update offer for wardrobe pieces; choosing the
piece again in the studio wears the current one.

The studio shows a tile for each slot, two to a row: its pixel mark and its name,
in the accent colour when something other than the Ooga's own is worn there.
Choosing a tile opens its editor across the grid under that tile's row: a dropdown
showing what is worn, who made the piece and, for the hat and the mask, a size. The
colours have no tiles: the skin's is in the body's editor, the hair colour in the
hair's and the eye colour in the eyes'.
Each dropdown starts with **Original look** (the character's own) and, where an
Ooga can go without one, the slot's none (**Bald**, **Clean-shaven**, **No shirt**,
**Barefoot**…). The foot counts unsaved changes beside **Save my look**, which
saves the hat and the whole wardrobe at once, and its **Reset** puts the saved look
back on. The signed-in account row's **My look** opens the studio on the player's own Ooga.

The body wears the pieces by building its character again with them as data
(`models.js` `templateFor`, keyed by what is worn) and giving each of its nodes the
geometry of the same node in that build (`src/js/character-wardrobe.js`): the
character's own hooks run as ever, nobody else's do, and nodes, poses, gear,
controls and companions keep their identities. A build takes a few milliseconds
and is cached. A mask is a node of its own on the head, as a hat is, and the
hat is lifted off while the head changes under it and put back on.

Where a character shaped a part itself, that slot keeps its look: the head slots
need the stock head (no `skull`, `hat`, `crown`, `eyes`, `mark`, `refine` or
`model` hook), a beard and a mouth the regular build's face, the body slots a
body the character does not model, the mask a head it did not shape, and the
weapon a hand without a nunchaku. The studio says so on the row.

The body is the build an Ooga is drawn in: **Male** or **Female** (the regular and
slim builds), each also **lean** (a narrower trunk, thinner limbs, and on the male build smaller feet) or **big-boned**
(a bigger, softer frame: the waist filled out, the chest's step and the limbs'
swells evened, the arms only a little thicker, sloped shoulders domed over the top (`dome`, extra rings between
the trunk and the shoulder, and the arm topped by a round cap), corners rounded off, no kneecap or line down the
breastbone; its nipples stay, on the chest's flat face), the shapes in
`hero-body.js` `SHAPES`. Every body has a crotch under the trunk
between them in what the thighs wear, so trousers read as one garment; over bare thighs it
is bare, so shorts end flat at their own hem. Under its foot every trunk tapers in over
`SEAT` to the tops of the thighs (straight down a little first, `SEAT_BAND`, then sloping in), in
what the thighs wear, or over bare thighs what the hips wear, so the seat slopes to the legs
rather than standing square over them; this reaches every Ooga's own look. A build without a shape keeps its own
crotch exactly. The regular (male) build's trunk widens a little toward its foot, so its
thighs meet the trunk's sides there rather than standing out past it; this reaches every
male Ooga's own look. On every build and shape a belt goes round the trunk's own rings a
snug `BELT_OUT` proud of them, and a skirt under it hangs from the trunk's ring there
(`SKIRT_OUT`), so both lie flat on the hips. A shape fits its legs to the trunk's foot
(`buildOf`): where its thighs would stand out past it, the whole leg is drawn smaller and the
legs closer together (`THIGH_IN` inside the trunk's sides, the build's own gap between the
thighs); a shape with a `legGap` (the big-boned male) draws its legs larger instead, `legGap`
apart, until their outsides meet the trunk's sides. Either way the feet keep their length and
narrow only as far as they must not to meet (`FEET_GAP`). The big-boned female's thighs are
thicker (`slimThigh`) so her legs fill her waist.

A male (regular) build's shins are drawn `SHIN` (0.9) units longer (`hero-body.js`): the
leg is stretched between `SHIN_RAMP`, under the knee and above any boot, and what is put on
the leg below (a boot, its foot, anklets, toes, a model's boot bands) goes down whole, never
taller. Every male Ooga stands about 3.5% taller; its hip
(`cave.hip`), eyes and root follow, and a body swap between builds moves the root so the
feet stay on the ground.

What a model merges onto the limbs it was handed (`wear()`: a boot's bands, a cuff, the
legs of shorts) is fitted to the worn limb automatically (`heroBody.refit`): the surface
of the limb its own build would have handed and of the worn one are read at each height,
and a detail keeps its share of the way out inside the surface and its distance past it
outside, so a boot band drawn for a slim boot stands on a male boot as on its own.

A file draws for its own build, so a worn build moves what it drew to the same place on
the new one. `trunk()` lines a height up between the two by their hips, belt and
shoulders (`from`, `to`, and `own`, the file's own build's trunk), so a garment drawn at
heights read off its own body (a belt, the hem of a top) sits where it did. What a
hook hung on the trunk (`models.js`, after the model) moves the same way, measured by
where its mesh shows: up or down with the heights, out to the worn side (a bag at the hip),
and out with the worn front, back or belt (SatsMason's pockets). A shape never changes height, hands, feet or the
head; the height is its own slot (below).
Everything drawn on the body (worn pieces, belt, skirt, strap, cuffs, boots, what a
hook laid on the trunk) is drawn on the shape's own rings, so it fits them. The swap
also moves each part the new build stands differently (a female build's arms and
legs) where the crew has not posed it away, and the crew measures the body's girth
again. A female build's face takes no beard or mouth piece. A character that models
its own body keeps its build and height until its model has been reviewed in every
build, shape and height (`character-wardrobe.js` `REVIEWED_BODIES`: six of the seven today;
midy-machete joins it with her fitted file, which is in the character lane).
While a model is built, `hero-body.js` gives its `trunk()` and `build()` the build
being worn (`dressed`), whatever build the file names, so a garment laid on the trunk
(YellowBrokeIt's tank top, rules-without-rulers' straps) and a
body built by hand (tiffanyvarty) follow it. A new character that models its body is
added to the list once it has been drawn in every combination.

The height is a slider under the body's dropdown, read out in metres from the Ooga's
feet to its crown: any whole hundredth of the game's height from 0.80 to 1.20
(`equipment-wardrobe.js` `HEIGHT`; the cast's own heights run from 0.8 to 1.16),
saved as `{ item: "custom", version: null, height: 80..120 }`, and the Ooga's own
height is Original. The body is built again at that height, pieces and all, and
stands on the same feet: the swap moves its hip (`baseY`), eyes (`headOffset`) and
`traits.height`, and the crew measures again what it hung on the body (the gun's
flash, the stun birds, a worn jetpack, its height and girth); another player's copy
reads its hip and height from the body. A pet keeps the size its file built it at,
whatever height its Ooga is worn at: the swap leaves the pet's node alone and keeps it
on the ground (the crew's `pet.lift` follows the hip).

The Pet section, shown only for an Ooga with a pet (`parts.dog`), sets the pet's own
height, read out in metres: any whole per cent from 50 to 150 of the height its file
builds it at (`equipment-wardrobe.js` `PET`),
saved as `{ item: "custom", version: null, size: 50..150 }` and set as the pet node's
scale (with its lying-down drop), so it builds nothing again.

The colour slots take a swatch from a short palette, the character's own colour
(the first swatch), or any colour from the wheel at the end of the swatches or typed
as a hex (saved as `{ item: "custom", version: null, color: "#rrggbb" }`, lower
case; only the skin, hair and eye colours take one). **Skin** and **Hair color**
recolour whatever the body paints in the wearer's skin or hair, and **Eye color** gives a stock head an iris in that
colour (a head the character shaped itself takes it as its eyes' colour). A
character that models its own body keeps its skin and hair, and one with its own
eyes hook keeps its eyes.

Taking a piece off leaves the body's own shape bare: its blocks turn skin, a
belt's turn the cloth over (or under) it, and only what was built out past the
trunk goes, so a row never reads another slot's blocks.

`scripts/equipment-wardrobe.mjs --author` (maintainer only) runs the character
files in a sandbox, as the hat's script does, and writes each piece under
`src/equipment/wardrobe/<hash>.json` with `catalog.json`; `labels.json` holds the
reviewed names of pieces whose generated name says too little. Every build checks
the committed pieces against their hashes and writes `equipment-wardrobe.gen.js`
(the registry, in the page and the Worker) and `equipment-wardrobe-data.gen.js`
(the pieces, about 0.7 MB, in their own deferred `wardrobe` chunk, fetched the
first time a body on the page wears one, in the studio the first one previewed).

The wardrobe is kept in `player_equipment.wardrobe` (migration
`0014_player_wardrobe.sql`), checked JSON under the hat's revision, so a save of
either is one compare-and-swap. `PUT /api/equipment` takes `wardrobe` beside any
hat change or alone (null wears the character's own look); an older page's
hat-only save keeps it. Equipment messages and snapshots carry it. A page that
does not know an item treats its slot as the character's own look rather than
refusing the rest. `/api/equipment/wardrobe/catalog` lists every piece ever
published, and the release preflight refuses a target missing one.

## Updating an authored hat

The existing custom character files expose `dress.hat(k, v)` for hat-only
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

Review every reported geometry change before publishing. The reviewed definitions
in `src/equipment/hats/sources.json` identify each item's creator, fitting profile,
parent item/version and source. A `character` source names the allowlisted character
file whose hat hooks the authoring operation may execute. A `reuse` source names an
existing item/version and reuses its complete geometry without executing that
creator's file. Adding a creator does not approve an unreviewed custom recipient
head for other hats.

An edited fork gets a new stable item ID and its own creator, with its exact parent
reference. Parentage is bounded, acyclic and validated against retained versions;
parent updates never advance the fork. To publish reviewed sources, run:

```sh
node scripts/equipment-hats.mjs --author
# Or publish only a named reviewed definition:
node scripts/equipment-hats.mjs --author <item-id>
```

This loads the selected reviewed definitions, invokes only the named character
hat builders when needed, and writes complete immutable geometry and revision
records under `src/equipment/hats/`. Identical content reuses its existing hash;
a no-op authoring pass leaves the current version unchanged. A changed hat advances
only that item's current version in `catalog.json`. The stable item ID
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

Open the hosted studio at `/?scene=studio` (or **My look** in the account row),
sign in, open the hat's row, choose a hat and press **Save my look**. **Hat size** normally previews 80–120% of the reviewed fitting;
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
The browser reads immutable revisions and full geometry at `/api/equipment/hats/<sha256>.json`. Shared content downloads and render buffers are reused; each wearer still owns their attachment nodes and saved item/version.
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

Staging and production set `EQUIPMENT_ENABLED=1`. The staging workflow
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
