# Connecting caves and independent lands

Design proposal for [#85](https://github.com/OogaBoogaX/oogaboogaland/issues/85).
This document and its [submission template](templates/cave-connection.md) define a
reviewable connection contract. They do not register a new cave, ship an external
world loader, reserve a physical entrance or change the site's permissions.
Maintainers must agree the decisions below before a connection is implemented.

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
Do not migrate existing scenes as a side effect of adopting this proposal.

**Proposed first independent-land contract:** ordinary same-tab navigation with
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
| `c9`, 9 o'clock | Dark, without a scene or repository; not a reservation for this proposal |
| `c730`, 7.25 o'clock; `c5`, 4.75 o'clock | Headquarters |
| `c1`, 1 o'clock | OBL's Matrix mirror cave |
| `c2`, 2 o'clock | Lightning Factory; Lightning Foundry and Banana Pay Server |
| `c3`, 3 o'clock | Ooga Arcade; its repository link does not make it an NPC work site |
| ₿IFRÖST `dsb`, `poker` windows | Integrated DSB Land and The Ember Den |
| ₿IFRÖST `west`, `east` windows | Mirrors; no new destination is assigned here |

Proposed discovery rule: list independent lands in one accessible directory at
₿IFRÖST before adding more geometry. Give each listing its name, repository,
operator/site hostname, short description, status and **Visit external land**
action. Use text as well as color for status. A dedicated cave/window is optional
and requires a separate footprint and approach review. The directory and its
interaction are implementation work, not present in this patch.

For a physical entrance, the submission names its parent area and requested slot;
maintainers assign the stable slot ID, position, facing and safe return point.
Check walking clearance, existing NPC work lanes, camera visibility and both
renderers. Never move another entrance or replace a mirror automatically. If no
slot is agreed, keep the entry proposed and unlaunchable.

Keep repository identity separate from scenery: `caves.js`'s `repo` participates
in NPC work-site logic, while `link` is only a sign's repository link. Adding an
external listing must not silently create or reassign contributor work.

## 2. Repository and release template

Copy [the connection template](templates/cave-connection.md) into the land's
repository. It supplies a minimal standalone page, a metadata record and the
review checklist. The land owns its source, build/run instructions, license,
service inventory, storage/retention policy and release evidence. OBL owns the
reviewed directory entry and mainland entrance, if one is approved.

Record the exact source revision reviewed. A link to a mutable branch is not a
release identifier. A live independent site can change after review; listing it
means linking to an independently operated site, not certifying every later
release. Ownership or destination-origin changes need another OBL review.

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

One bounded, source-controlled record per approved listing, maintained by PR.
Use the fields in the template: schema version, stable lowercase ID, display
name, canonical `owner/repo`, responsible public GitHub account, HTTPS entry URL,
fixed return URL, connection kind, placement, status and reviewed source revision.
An optional preview is a reviewed local asset, not remote executable content.
No per-visitor record, visit history, new database or background poll is needed.

Validate records before publication: unique IDs and physical slots, bounded
plain-text labels, exact HTTPS destinations without credentials, no dynamically
supplied redirect target, and an existing OBL return route. Reject unknown
schema versions or connection kinds instead of silently interpreting them.
Store proposed entries separately from launchable entries; a metadata file by
itself grants no runtime capability.

Lifecycle: **proposed → enabled → unavailable or retired**. Enabling requires
review plus implementation evidence. Unavailable/retired entries keep their
identity and location label but disable travel and explain why. Do not redirect
a retired ID to a different operator. Availability is a reviewed status, not a
claim that an unpolled remote site is currently healthy.

## 5. Addresses, navigation and return

- An independent land's canonical entry is its approved absolute HTTPS URL.
  Its own deep links use paths below that origin, for example
  `https://example.invalid/observatory/`. That hostname is a placeholder, never
  a destination to publish. Direct entry, reload and internal Back/Forward must
  work without first visiting OBL.
- A connection ID is an OBL catalogue key, not a new mainland route. This
  proposal adds no `/worlds/<id>` or redirect endpoint. If aliases are wanted
  later, design and test them in `routes.js`, the router and site generator.
- Existing OBL path routes and portable `#/<route>` routes remain unchanged.
  For example, `/entropylab` is the hub's lab view, not an external redirect.
- The land always offers **Return to Ooga Booga Land**, using a literal approved
  route such as `https://oogabooga.land/`. A later physical-entry PR may choose a
  more specific existing route. Never concatenate the current location, an
  arbitrary return parameter or an untrusted manifest value into that link.
- Travel requires a deliberate accessible action, not automatic navigation on
  collision. Display the destination before activation. A cancel leaves the
  current Ooga and input state unchanged. Keep repository browsing separate
  from visiting the land; existing repository signs open GitHub in a new tab.
- For the default same-tab crossing, the old document must stop rendering,
  timers, voice and networking. Existing `director.js` destroys on non-persisted
  `pagehide`, but skips destruction for the back/forward cache. Verify and, if
  necessary, implement an explicit suspend/resume path before enabling travel.
  Do not promise that a hidden or cached OBL page immediately stops all work.
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

Show **Integrated**, **External**, **Unavailable** or **Proposed** in text. External
entries name their hostname and zero-transfer boundary. Keep keyboard focus,
touch targets, reduced motion and Canvas 2D fallbacks usable without a live 3D
preview. No remote page, renderer, scene graph or audio runs to draw the directory.

## 7. Implementation gates and evidence

The design covers the seven definition/template requests in #85. It is not
runtime completion evidence. Before enabling the first independent land:

1. Agree the same-tab, zero-payload boundary and directory-first placement. If
   maintainers want seamless shared avatars/voice instead, revise the contract
   before building a bridge.
2. Select a real destination, verify its operator/repository, choose its location
   and return route, and review the completed template and pinned revision.
3. Implement the reviewed directory/entry, validation and navigation lifecycle.
   Keep external code and requests absent until an explicit visit.
4. With the requested test scope, verify keyboard/touch activation, cancel,
   repeated clicks, offline destination, direct deep links, return link,
   reload, Back/Forward (including cache restoration), voice shutdown and
   connection cleanup. Confirm no identity/state appears in URLs or referrers,
   and no external script executes in OBL.
5. Record before/after boot bytes, retained memory and active client work under
   matching conditions, plus repeated trips and real-phone evidence where
   available. No performance saving is claimed by this documentation change.
6. Record build/syntax and applicable suite results under AGENTS.md. Keep missing
   browser/device or integration evidence explicit. Enabling or deploying the
   first connection is a separate reviewed change.

Sources: [cave slots](../src/js/caves.js),
[₿IFRÖST windows](../src/js/bifrost-models.js),
[routes](../src/js/routes.js), [router](../src/js/router.js),
[deferred loading](../src/js/deferred.js),
[director lifecycle](../src/js/director.js), and
[authentication/presence](auth-and-presence.md).
