# Custom panel tabs (planned)

**Status: a plan. Nothing here is built yet.** No code reads a character's tab, and the
automatic intake rejects a `tab` field today. Until the registry below lands, a new tab
still falls under **Ask first** in [CONTRIBUTING.md](../CONTRIBUTING.md). This page says
where the system is going, so builders know what to prepare and maintainers can review the
stages one at a time.

## The idea

The panels' tabs are something every visitor shares, so the stock set stays small. Instead
of adding tabs to it, the game will let each visitor shape their own:

- **Builders can offer a tab with their character.** It is declared in their own
  `src/characters/<handle>.js`, as data, and says who may see it: any visitor, signed-in
  players only, or contributors only. It is **off by default**: nobody sees it until a
  visitor chooses to add it.
- **Visitors can hide panels they don't use**, add the character tabs they like and put
  their tabs in the order they want, in a tab customization dialog. The choice is theirs,
  kept in their browser.
- **The locked tabs always stay, in front.** On the island that is Bananas, first. In
  Ooga Chat it is the Ooga Chat tab, first, then Bananas: the app is for chatting, so its
  own tab stays. Locked tabs can't be hidden, moved or put behind another tab. The island's
  Ooga Chat tab is not locked: a player there who doesn't want to chat can hide it.

## How tabs work today

There are two surfaces with two lists, and both are fixed in code:

| | The island (`sheet.js`, `hud.js`, `src/index.html`) | Ooga Chat (`src/ooga-chat/ooga-chat-app.js`) |
|---|---|---|
| Order | Bananas, Contributing Oogas, Online Oogas, The Commons, Ooga Chat | Ooga Chat, Bananas, Contributing Oogas, Online Oogas, The Commons |
| Defined by | `NAMES` in `sheet.js` and the buttons in `#sheet`'s `.sheet-panels` | the `tabs` array passed to `BL.oogaChatShell.create` (`docs/ooga-chat-app.md`, Shell) |
| Shown when | `available(name)`: Online Oogas and The Commons signed in, Ooga Chat where the room speaks `audience-v1` | `visible(state)`: Online Oogas and The Commons only while `gates` says `contributor` |
| Icons | `native-icons.js` (`bananas`, `roster`, `players`, `chat`, `cloud`) | the same module |
| Saved | `oogaboogaland.sheet.v1`: the open tab, folds, docks and floating windows | `ooga-chat.v1.tab`: the chosen tab |
| Unread | `sheet.setBadge`, `note`, `unnote` for `players` and `chat`; the bell lists them | none |

The two lists are already close: Ooga Chat's tabs are the island's own panels (#656). The
plan makes them one list.

## One registry for both surfaces

A new shared module, `src/js/panel-tabs.js` (`BL.panelTabs`), reading nothing at load but
`window.BL`, so Ooga Chat can load it as it does `roster-panel.js`. It holds:

- **The stock tabs**, each `{ id, label, icon, surfaces, locked, available(ctx) }`, where
  `locked` names the surfaces a tab is locked on, in the order it is locked in: Bananas
  (locked on both), Ooga Chat (locked first in the app, a normal tab on the island),
  Contributing Oogas, Online Oogas and The Commons.
  `available` keeps today's gates, so a hidden or added tab never changes who may see what.
- **The character tabs**: every character with a valid `tab`, under the id
  `char:<handle>`, in roster order, each `available` by its `audience` through the same
  gates as the stock tabs. The island reads them from `BL.characters.all()`. Ooga Chat has
  no character files (its build loads only `SHARED` in `scripts/ooga-chat.mjs`, which
  leaves out `characters.js` and `characters.gen.js`), so it is handed the same data (see
  Ooga Chat's character tabs, below).
- **`REFUSED`**, the maintainers' kill switch: a list of character tab ids the registry
  will not offer, so a bad tab can be pulled in one line without editing the character's
  file. A refused tab leaves every row and the dialog as a removed one does (below).
- **`list(surface, prefs, ctx)`**: the tabs to show, in order. The surface's locked tabs
  first, always (the island: Bananas; the app: Ooga Chat, Bananas); then every other tab
  the visitor shows (stock tabs not hidden, character tabs added and `available`), in the
  visitor's `order`. A tab missing from `order` comes after the
  ordered ones, in the default order (the stock order, then character tabs in the order
  they were added). Unknown, removed or refused ids in `prefs` are skipped, never an error.
- **`prefs` load and save**, `{ hidden, added, order }`, checked at the boundary as
  `game.load` is: a bad piece falls back to its default (nothing hidden, nothing added, the
  default order). A locked tab's id in `hidden` or `order` is ignored.

`sheet.js` builds its buttons and panels from `list("island", …)` instead of `NAMES` and the
fixed markup, and Ooga Chat passes `list("chat", …)` to its shell. Saved layouts naming a
tab no longer offered (a hidden tab, a removed character) fall back to the surface's first
locked tab, as a saved tab that is not `available` does today.

## A character's tab

### What it is

Data, never code. A builder adds one field to their character:

```js
tab: {
  title: "KARAOKE",
  audience: "everyone",
  icon: [
    "..aa..",
    ".abba.",
    ".abba.",
    "..aa..",
    "...b..",
    "..bbb."
  ],
  palette: { a: "#f2c14e", b: "#3b2a1a" },
  blocks: [
    { heading: "Welcome to the lounge" },
    { text: "Pick a song, grab the mic, and sing for the island." }
  ]
}
```

The exact shape is decided in stage 3; this is the direction:

- **`title`**: up to 16 characters the cave-sign alphabet carves (`SIGN_GLYPHS`), shown as
  the panel's carved title and as the tab's accessible name.
- **`icon`**: a small pixel grid (at most 16 by 16), `.` for empty and a letter for each
  colour in `palette` (at most four, six-digit hex), drawn as `native-icons.js` draws the
  stock ones. No pictures, no URLs.
- **`audience`**: who may see the tab, `"everyone"`, `"signed-in"` or `"contributors"`.
  **Required, with no default**: a builder has to choose. The registry applies it as the
  stock tabs' gates apply (`signed-in` as Online Oogas is, `contributors` as Ooga Chat's
  contributor tabs are), so a character tab never shows anyone more than a stock tab would.
  **Audience is not privacy.** Every character file is built into the page every visitor
  downloads, so a `signed-in` or `contributors` tab's text can be read in the page's source
  by anyone. `audience` only decides where the tab shows. Put nothing private in a tab.
- **`blocks`**: up to 24 blocks of plain text, each a `heading` (60 characters) or `text`
  (500 characters). Rendered with `textContent` by one shared renderer, never as HTML.

The shared renderer adds a credit line under the title, "by <display>'s Ooga", from the
character's display name. A builder can't edit or remove it, so a visitor always knows whose
tab they are reading.

### What it can't do

A character's tab is a page of text and a picture made of squares. It never runs code, and
it never reaches outside the page:

- no scripts, event handlers, HTML, CSS, iframes or `dress`-style hooks;
- no network requests, images, fonts, audio or links to other origins. The content policy
  (`src/index.html`) does not change for it;
- no reading or writing storage, the account, the room or other panels;
- no badges, toasts, sounds or anything that asks for attention;
- nothing under **Not wanted** or **Promotion** in CONTRIBUTING.md: a tab is not an advert,
  a donation link to anyone but Ooga Booga Land, or a landing page for another project.

Links out are the most likely thing builders will want. They are left out of the first
version on purpose (see open questions).

### How it is screened

`scripts/character-safety.mjs` gains a validator for `tab`, as it has for `look` and
`voice`: known keys only, every string through the same `text` check (bounded, no control
or direction characters, no instruction text), the grid and palette checked for size and
format, and `audience` one of its three values: a missing or unknown `audience` is refused.
A valid tab keeps the file in the automatic lane; anything else sends the whole file to
manual review, as an unknown field does today. The tab counts toward the character file's
32 KiB cap like everything else in it: a long tab leaves less room for the Ooga's own
code. `npm run character:check` reports the tab's size, its audience and the lane, and the
character studio shows the tab beside the Ooga.

### Who counts as a contributor

`contributors` has to mean the same thing on both surfaces. Ooga Chat already decides it
on the server: the bridge's `capability` op (`worker/src/chat-capability.js`) answers
`eligible` for a GitHub account that owns a bundled Ooga or one Oogatron vouches for. The
island has no such gate on its panels today: Online Oogas and The Commons ask only for a
signed-in account. For `contributors` the island uses its own version of that same rule:
the signed-in account has an Ooga of its own (`BL.net.ownCharacter()`, a bundled character
or the temporary one Oogatron vouches for, `contributors.addTemporary`). Stage 3 checks that
the two agree for the same account.

### Ooga Chat's character tabs

The app gets character tabs as data, never as character code. Two ways:

- **The bridge (recommended).** `build:site` already writes the cast to
  `worker/src/characters.gen.json`, and the island Worker's bridge op `cast`
  (`worker/src/chat-public.js`) serves it to Ooga Chat's edge for Contributing Oogas. Each
  row gains the character's validated `tab`, and the app's registry reads the tabs from that
  reply. One source, it follows every island deploy, and no character code ever reaches the
  app. The cast's revision hash already covers what is sent, so a changed tab is a changed
  cast.
- **Baked into the app's build.** `scripts/ooga-chat.mjs` writes the tabs into the app as a
  data file. Simpler, but the app's tabs then lag the island's until Ooga Chat is deployed
  again.

### When it changes or goes

- **The owner edits it.** Visitors who added the tab see the new text on the next deploy.
  Its tab button carries an "updated" mark (a dot, with "updated" in its accessible name)
  until they open it. The registry knows by a hash of the tab's data, kept with the added
  id in `prefs`; nothing is sent anywhere.
- **The owner removes it, or the character leaves the cast.** The tab drops off every row
  silently, with no toast or notice. Its id stays in `prefs` and is skipped, so the tab comes
  back where it was if it returns.
- **A maintainer refuses it** (`REFUSED`). The same as a removal, without touching the
  character's file.

## Choosing tabs

### The tab customization dialog

One dialog, opened from a **Choose tabs** button in the panel header, never from the tab
row: on the island beside the notification bell in each panel's carved title, and in the
same place on the app's panels. The tab row has no room for another button on a phone
(below). The dialog is modal and keyboard-reachable, with the controller's Menus context
through `pad-focus.js` on the island:

- **Your tabs**: every tab on the row, in its order, stock and character tabs together.
  The locked tabs are shown first, locked on, with a line saying they always stay there.
  Each other row has a switch to hide it (or remove it, for a character tab) and **Move up** and
  **Move down** buttons. Stock tabs the visitor can't see yet (signed out, not a
  contributor) are listed with why, and stay off the row until they can.
- **Character tabs**: every character that offers one, by display name, with its icon,
  title, audience and a preview of its text before it is added. A tab the visitor can't see
  is listed with "Sign in to see" (or "For contributors"), and its Add button stays off.
- **Reset** puts everything back: nothing hidden, no character tabs added, the default
  order.

Reordering never needs a drag. Each row's buttons move it one place, and with a row
focused, Alt+Up and Alt+Down do the same; focus follows the row it moved. Nothing can move
above a locked tab: the first movable row's Move up is disabled. On the island a controller
drives the dialog through the Menus context (`pad-focus.js`): the d-pad moves between rows
and buttons, A presses one. A drag may be added later as a shortcut, never as the only
way.

### Where the choice lives

Per browser, in localStorage: `ooga-tabs-v1` on the island, `ooga-chat.v1.tabs` in the app
(a different origin, so a separate choice). `{ hidden: [ids], added: [{ id, seen }],
order: [ids] }`, nothing else (`seen` the hash of the tab's data when last opened, for the
"updated" mark).
Nothing is sent to the server, and nothing is kept for visitors who don't change anything.
Syncing the choice to a signed-in account is a later question, not part of this plan.

### What hiding means

Hiding a tab hides its button and panel, nothing else. It never signs in or out, leaves
voice, closes a socket, or stops The Commons from receiving lines. Its unread count is
dropped while it is hidden: a hidden Online Oogas or The Commons adds nothing to the bell,
and a join or a line still shows its toast where it does today.

## Phone layout and accessibility

- The tab row must keep each tab at least 44 px wide. A phone's row is the drawer's width
  less 80 px (`PHONE_TAB_INSET`, which leaves room for the 44 px chevron at its end), so a
  390 px phone has 310 px: seven tabs at 44.3 px each, and not one button more. That is why
  **Choose tabs** lives in the panel header, not on the row. The registry enforces a cap:
  **at most two character tabs added**, so the row never exceeds seven with every stock tab
  showing. The dialog says so when the cap is reached.
- The dialog's reorder buttons are real buttons with names ("Move The Commons up"), and a
  move is announced through a polite live region ("The Commons moved to place 3 of 6").
- Character tabs use the same `role="tab"` and `role="tabpanel"` wiring, roving focus and
  arrow keys as the stock ones. The accessible name is the title, spelled out (not carved).
- Text blocks are real text: selectable, readable by screen readers, scaled with the page.
  The icon is decorative (`aria-hidden`).
- Under reduced motion nothing in a character tab moves, since nothing in it can.
- The suite's phone sessions cover the row with two character tabs added.

## Rollout

Each stage is its own issue with a maintainer's yes, and its own reviewable PR. Nothing
in a later stage is merged before the one before it.

1. **One registry, no visible change.** `panel-tabs.js` holds the stock tabs; `sheet.js` and
   the Ooga Chat shell read their list from it. The tab rows look and behave as today.
2. **Hide, show and reorder stock tabs.** The customization dialog with the stock tabs only,
   the locked tabs first, reordering by buttons, keys and the controller, the per-browser
   choice, badges dropped for hidden tabs, the suite's checks for both surfaces at phone and
   desktop sizes.
3. **Character tabs.** The `tab` field, `audience` required, in `character-safety.mjs`, the
   bundle docs and the registry; `REFUSED`; the island's `contributors` check, matched
   against the bridge's `capability`; the tabs carried to Ooga Chat in the bridge's `cast`
   reply; the shared renderer with its credit line; the character tabs section of the
   dialog, off by default; the "updated" mark; `character:check` and the studio's preview.
   A sample tab on a maintainer's character.
4. **Later, if wanted.** Links under rules the maintainers set, account sync, more block
   kinds. Each needs its own issue.

## What a builder can do now

- **Don't add a `tab` field to a character file yet.** Nothing reads it, and the automatic
  intake will send the file to manual review.
- **Write the tab down.** A title, who should see it (everyone, signed-in players or
  contributors), the text, and a sketch of the icon, in an issue. When stage 3 lands it is
  a few lines to add.
- **Keep it public.** Anyone can read a tab's text in the page's source, whatever its
  audience. Nothing private, no contact details, nothing you would not post on the island.
- **Think in text.** If the tab needs to do something (play, vote, sing, fetch live data),
  it isn't a character tab: it is a feature or a place, and it goes through **Ask first**.

## Open questions for the maintainers

Decided: in Ooga Chat, the Ooga Chat tab stays first and locked, with Bananas locked after
it. On the island, Bananas alone is locked, and the Ooga Chat tab can be hidden.

1. **Which other stock tabs can be hidden?** Everything but the locked tabs can go. Should
   Contributing Oogas stay?
2. **Links.** None at first. Later: the builder's own GitHub profile only, repositories on
   Merge Rock, or a maintainer-reviewed list?
3. **Review.** Is a schema-valid tab enough for the automatic lane, or does every tab's text
   get a maintainer's read, as custom dress code does?
4. **The cap.** Two added character tabs, or a scrolling tab row so more can be added?
5. **Signed out.** A signed-out visitor can add `everyone` tabs; `signed-in` and
   `contributors` tabs show in the dialog as "Sign in to see" and can't be added. Is that
   right, or should signed-out visitors see no character tabs at all?
6. **Discovery.** Should a character's tab also be reachable from their Ooga (its tooltip
   or roster row) as well as from the dialog?
7. **Announcing new tabs.** Is a new character tab announced anywhere (a line in the
   dialog, Tess's news, a toast)? The plan's default: nowhere, since tabs are opt-in.
8. **How Ooga Chat gets character tabs.** The plan recommends the bridge's `cast` reply
   carrying each character's validated `tab`. Or should the app's build bake them in?
