# Connecting caves and independent lands

Connection contract for [#85](https://github.com/OogaBoogaX/oogaboogaland/issues/85).
The **Caves and lands** button in ₿IFRÖST lists mainland project caves, integrated
worlds and independent sites. `/bifrost` opens the chamber directly; the portable
page uses `#/bifrost`. The first external entry reuses the EntropyLab site already
linked from the lab display.

The default is reversible: a source-controlled directory, separate-site travel
without player-state transfer, and no new cave geometry or displaced mirrors.
Use the [submission template](templates/cave-connection.md) to add a land. This
connection layer does not implement cross-site SSO, shared voice or an economy.

## Two kinds of connection

| Kind | Runs where | Trust and loading |
|---|---|---|
| Integrated scene | Inside OBL's page, through `BL.scenes` | Reviewed OBL code, with access to the page's shared systems. Hosted builds can defer its same-origin code until needed. |
| Independent land | Its own HTTPS site, reached by an explicit link | Separate document and origin, its own renderer, saves, permissions and services. No executable code is imported into OBL. |

Use an independent land for a separately maintained repository that must be able
to change without changing mainland behavior. Use an integrated scene only when
the maintainers want to own and review that code as part of OBL. A separate Git
repository, an IIFE, or a deferred script is not a security boundary.

Today DSB is an integrated scene. `deferred.js` downloads same-origin scripts and
runs them in OBL's realm. `scene-deferred.js` registers shells for several other
scenes. These reduce initial loading; they do not sandbox a contributor's code.
Do not migrate existing scenes as a side effect of adding this connection layer.

**Independent-land contract:** ordinary same-tab navigation with
no player-state transfer. This avoids running two active worlds by default and
needs neither an iframe nor a cross-origin message protocol. It gives up seamless
avatar/voice continuity. If that continuity is required, agree a separate,
server-authorized handoff before implementing it.

## 1. Placement and discovery

A new repository does not automatically consume a mainland cave. Entrance
allocation is an OBL-maintained map, not a formula based on a repository name,
creation date or GitHub activity. Existing identifiers and positions remain stable.

Current physical entries, from `src/js/caves.js` and `bifrost-models.js`:

| Entry | Current use |
|---|---|
| `c11`, 11 o'clock | EntropyLab; integrated hub work site |
| `c10`, 10 o'clock | B.C.A.; a room within the hub |
| `c9`, 9 o'clock | Dark, without a scene or repository; not reserved by the directory |
| `c730`, 7.25 o'clock; `c5`, 4.75 o'clock | Headquarters |
| `c1`, 1 o'clock | OBL's Matrix mirror cave |
| `c2`, 2 o'clock | Lightning Factory; Lightning Foundry and Banana Pay Server |
| `c3`, 3 o'clock | Ooga Arcade; its repository link does not make it an NPC work site |
| ₿IFRÖST `dsb`, `poker` windows | Integrated DSB Land and The Ember Den |
| ₿IFRÖST `west`, `east` windows | Mirrors; no new destination is assigned here |

Independent lands appear in the accessible **Caves and lands** directory at
₿IFRÖST before adding more geometry. Each listing shows its name, repository,
site hostname, description, status and **Visit external site** action. A dedicated
cave/window is optional and requires a separate footprint and approach review.
Listing an external site never fetches its code or builds a remote preview.

For a physical entrance, the submission names its parent area and requested slot;
maintainers assign the stable slot ID, position, facing and safe return point.
Check walking clearance, existing NPC work lanes, camera visibility and both
renderers. Never move another entrance or replace a mirror automatically. If no
slot is agreed, use the directory entry without reserving a physical slot.

Keep repository identity separate from scenery: `caves.js`'s `repo` participates
in NPC work-site logic, while `link` is only a sign's repository link. Adding an
external listing must not silently create or reassign contributor work.

## 2. Repository and release template

Copy [the connection template](templates/cave-connection.md) into the land's
repository. It supplies a minimal standalone page, a metadata record and the
review checklist. The land owns its source, build/run instructions, license,
service inventory, storage/retention policy and release evidence. OBL owns the
reviewed directory entry and mainland entrance, if one is approved.

Record source/release review in the connection PR, separately from the runtime
link. The existing EntropyLab entry reuses a current link, not a newly audited
release. A live independent site can change after review; listing it means linking
to an independently operated site, not certifying its code. Ownership or
destination-origin changes need another OBL review.

An integrated scene instead follows **Adding things** and **Scenes and the
director** in [AGENTS.md](../AGENTS.md). Keep a new scene WIP until approved. Use
the existing `prepare`/`enter`/`leave` contract, same-origin deferred groups and
bounded scene resources. Do not import a remote script or relax CSP to make a
separate repository look like a plugin.

## 3. Data permitted across the boundary

The first contract transfers **no application payload**. OBL uses only an
approved static destination URL. It does not append its current query, fragment,
identity, pose, or saved game state. The land's return link is also a reviewed
literal URL, not a visitor-supplied `returnTo` value.

| Data | Rule |
|---|---|
| Public project name, repository, description and destination | Reviewed metadata, kept in OBL's source; copied locally for signs/directory, not fetched from arbitrary manifests at runtime |
| OBL account, GitHub login, avatar/look, presence and poses | Not transferred; a land that needs accounts provides its own sign-in |
| Chat, private messages, voice/audio, microphone access | Not transferred or inherited; ask separately on the destination if needed |
| Session cookies/tokens, SFU/TURN credentials, OAuth data | Never passed in URLs, messages, storage copies or scripts |
| Inventory, tickets, donations, balances, achievements | Remain with their current authority; no cross-world rewards or writes |
| Browser/device preferences | Not copied; the land can independently honor standard browser preferences |

A normal navigation still contacts the destination, exposing the connection's IP
address and ordinary browser request metadata. The UI must name the external
hostname. Use `referrerpolicy="no-referrer"`; if the visitor opens a new tab, use
`rel="noopener noreferrer"`. Do not claim navigation is anonymous. Do not
prefetch remote HTML, scripts, pictures or connection manifests just because a
visitor walks near the entrance.

Do not accept `postMessage`, a URL parameter or a GitHub handle as proof of OBL
identity. Cross-origin authentication, shared economies, voice, or remote world
state would need a new threat model and an explicit protocol, server validation,
limits and deletion rules. They are outside this zero-payload contract.

## 4. What OBL stores

`src/js/cave-directory.js` owns a schema-1 registry, capped at 64 external entries.
Each entry has exactly `id`, `name`, `description`, `repository`, `url` and `status`.
The repository names its public owner; placement is the ₿IFRÖST directory, keyed
by the stable ID. No per-visitor record, visit history, database or poll is added.

`npm run build` evaluates the registry's validator before producing the page.
It rejects unknown schemas/fields, duplicate IDs, oversized/control-character
labels, invalid repository names, noncanonical URLs, non-HTTPS schemes,
credentials, custom ports and query/fragment payloads. The validated registry is
frozen. The template gives the exact shape and limits. Text is rendered through
`textContent`, never as HTML. No external manifest is discovered or executed.

Statuses are **open**, **unavailable** and **retired**. The last two keep the
listing and source link, but omit its travel action. Do not reuse a retired ID
for a different operator. These are reviewed statuses, not claims that an
unpolled remote site is currently healthy. Keep unapproved proposals out of the
runtime registry. A physical entrance later needs its own reviewed assignment.

## 5. Addresses, navigation and return

- An independent land's canonical entry is its approved absolute HTTPS URL.
  Its own deep links use paths below that origin, for example
  `https://example.invalid/observatory/`. That hostname is a placeholder, never
  a destination to publish. Direct entry, reload and internal Back/Forward must
  work without first visiting OBL.
- A connection ID is an OBL catalogue key, not a new mainland route. This
  implementation adds no `/worlds/<id>` or redirect endpoint. `/bifrost` is the
  ordinary scene route to the directory. If aliases are wanted
  later, design and test them in `routes.js`, the router and site generator.
- Existing OBL path routes and portable `#/<route>` routes remain unchanged.
  For example, `/entropylab` is the hub's lab view, not an external redirect.
- A new land follows the template and offers **Return to Ooga Booga Land**, using
  a literal approved route such as `https://oogabooga.land/`. The existing
  EntropyLab site is not changed by this PR; its directory entry tells visitors
  to use browser Back. A later physical-entry PR may choose a more specific
  existing route. Never concatenate the current location, an arbitrary return
  parameter or an untrusted manifest value into that link.
- Travel requires a deliberate accessible action, not automatic navigation on
  collision. Display the destination before activation. A cancel leaves the
  current Ooga and input state unchanged. Keep repository browsing separate
  from visiting the land; existing repository signs open GitHub in a new tab.
- For the default same-tab crossing, the old document must stop rendering,
  timers, voice and networking. Existing `director.js` destroys on non-persisted
  `pagehide`, closing voice, networking and scene resources. A browser-cached
  document is frozen by the browser and resumes through normal Back behavior.
  The directory adds no alternate renderer, timer, iframe or background bridge.
  Test real signed-in voice/device behavior separately from offline fixtures.
- Browser Back and the visible return link are both valid. Returning establishes
  a normal OBL visit and its own authentication; it does not import remote state
  or promise to restore the exact actor pose. Destination failure leaves the
  browser's Back available; OBL cannot reliably detect a cross-origin load failure.

## 6. Visual and functional ecosystem map

The directory is the scalable map: OBL at the root, integrated scenes grouped
under their actual mainland entrances, independent lands grouped under
₿IFRÖST, and repository links clearly marked as source rather than travel.
A listing and a physical sign must resolve the same reviewed record; do not keep
two competing destination URLs. A land may link to another land, but that does
not register the latter in OBL or give it OBL permissions.

Show **Integrated**, **External**, **Unavailable** or **Retired** in text. External
entries name their hostname and zero-transfer boundary. Keep keyboard focus,
touch targets, reduced motion and Canvas 2D fallbacks usable without a live 3D
preview. No remote page, renderer, scene graph or audio runs to draw the directory.

## 7. Adding and validating a connection

1. Copy the [template](templates/cave-connection.md), build the independent page
   and establish its real HTTPS destination. Document its operator, source,
   network use and return link. A different origin owns its own data and services.
2. In an OBL PR, add one reviewed row to `registry.entries` in
   `src/js/cave-directory.js`. No scene, character, terrain or NPC work-site change
   is necessary. Use the next free stable ID, not an index-based placement.
3. Run the build and syntax checks. Under an authorized test scope, run the unit
   lane and the focused directory checks in `test/run.mjs` (desktop and emulated
   phone). They cover schema boundaries, modal/input handling, repeated opening,
   scene disposal, navigation with an intercepted external fixture and Back.
4. Check the real site's direct entry/deep links, return, failure behavior and
   accessibility before publishing a new destination. The fixture is not a
   certificate of the live service. Review destination or ownership changes.
5. For an integrated scene or physical entrance, follow AGENTS.md's scene,
   route/card, lifecycle and renderer contracts and run its applicable checks.
   Do not confuse the zero-payload link contract with a sandboxed plugin API.

No external code, renderer or polling is added to OBL's per-frame work. The
small directory module and styles load with the page; its DOM rows are built
only when opened and removed with the chamber. The registry adds no network
requests while browsing. No measured FPS, real-phone, live voice or heap saving
is claimed. Current verification and remaining gates are recorded in the PR.

Sources: [cave slots](../src/js/caves.js),
[₿IFRÖST windows](../src/js/bifrost-models.js),
[routes](../src/js/routes.js), [router](../src/js/router.js),
[deferred loading](../src/js/deferred.js),
[director lifecycle](../src/js/director.js), and
[authentication/presence](auth-and-presence.md).
