# First-visit Bananas panel

A visitor's first visit opens the Bananas panel by itself, a beat after the world shows. Every later visit restores
the panel layout they left, as before.

## What counts as a first visit

The panels already save their layout in localStorage under `oogaboogaland.sheet.v1` (`sheet.js`): the open state,
the selected tab, the main panel's rectangle and dock, and any detached panels. A first visit is that key being
absent on the page's first read, judged once a page. A saved closed panel, another tab, a detached layout or a fold
is a return visit and is left alone. Storage that cannot be read is no first visit either: a later close could not
be remembered, so the panel would open on every visit.

Nothing new is stored. The welcome opens Bananas through the ordinary `select`, which saves it like a click would;
once the visitor closes it or picks another tab, that choice is what the next visit restores. Even a visitor who
leaves before the welcome has their layout saved on `pagehide`, so it is never offered twice.

## When it opens

The director starts one timer when the first frame is drawn and the curtain begins to part (0.9 s), and calls
`BL.sheet.welcome()` 1.8 s later, so the world is in view for about a second first. It is asked once a page and
does nothing when:

- the visitor made a panel choice first: a tab, a close, a fold, a drag, a panel resize or any press on a panel, or a
  shortcut that selects a tab (`selectTab`, `foldPanels`);
- a scene change is under way or the visitor has left the scene they landed in;
- the panels are hidden (GAME MODE, a kiosk) or folded for a game (a cabinet route lands in a game);
- the page is gone (`destroy` clears the timer).

## Quiet pages

`?nosim=1` pages (the suite, the preview cards) skip it so their panels start as they always have; `welcome=1` asks
for it there, and `welcome=0` turns it off anywhere (`scripts/cards.mjs` passes it, since the Mempool card runs
without `nosim`). The `side panel persistence` check in the hub scene covers a fresh visit through the real timer,
a saved closed layout, a choice made first and unreadable storage.
