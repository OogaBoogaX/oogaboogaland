# Ember Den interface revision

The floor needs a clear path from walking in to playing a hand. The previous
table view mixed betting, room preferences and protocol detail, and its Walk
control also relinquished a practice seat. This revision separates those jobs
while retaining the ten stone tables, nine seats per table, suited gorillas,
five cave themes and free banana chips.

## Player flow

- **Enter:** choose Play a practice hand for four-player practice, or Join live
  tables for the configured service. Each mode is labeled throughout the view.
- **Find a table:** ten compact cards show occupancy and hand status. All
  tables, Open seats and In play filters help find a seat or a hand to watch.
  Open seats means a seat can be taken between hands, not a mid-hand waitlist.
- **Follow a hand:** the oval table emphasizes the board, pot, acting player,
  stacks and round bets. Private cards sit beside the turn prompt. A separate
  information rail holds public actions, table options and expandable details.
- **Act:** Fold, Check/Call and Bet/Raise retain their positions. Presets choose
  a size without sending it. The input is a total for the round; helper text
  explains the additional chips and remaining stack. Calls and maximum raises
  explicitly identify all-ins. Refills say they are free.
- **Walk:** Walk the floor keeps the seat, exposes movement controls and moves
  the avatar into an aisle. The lobby shows a return button and turn status.
  Return restores the seated view. Turn sounds, if enabled, work while walking.
- **Leave:** Table options contains a separate Leave seat control. Practice
  can check/fold remaining turns and leave after settlement; live play requires
  waiting between hands. Walking never silently submits a poker action.

The gold, emerald and ivory interface uses the room's existing theme variables
and original vector cards. Banana Club's room is now white marble (see the
marble hall in [banana-poker.md](banana-poker.md)), but its table view keeps
its dark green and gold on purpose, so its text stays readable; only the
style's lobby swatch turned white and gold. Smaller viewports stack the information rail below
the hand, with a scrollable panel and compact private-card layout. Buttons keep
visible keyboard focus; card motion respects reduced-motion preferences. Theme,
history, verification and rules remain available without filling the action
area. This is source-level implementation, not a claim of completed visual QA.

## The table view

The focused table view now reads as a table in the room rather than a panel
over it:

- **The pot you can see:** three chip stacks sit under the pot figure and grow
  with it, eight chips high at most (`BL.pokerHud.potChips`). Their row keeps
  the same height empty or full, so the board never moves as the pot grows or
  as a result shrinks it to the amount collected.
- **Rail and felt:** the rail is wider and stitched like leather, and a faint
  weave lies over the felt in all five themes. The chips, rail, felt and stitch
  take their colours from the room's theme variables, so they follow a theme
  switch at once.
- **Faces at the seats:** every occupied seat shows its character's face: the
  visitor's own Ooga, a computer opponent's cast member, a live player's own
  Ooga when they sit in that chair as themselves, or else their hashed
  stand-in (see Players at the tables in [banana-poker.md](banana-poker.md)). By default it is a 22px round badge on the seat's edge, on
  the side away from that seat's cards and bet, so it covers no text; a seat
  112px or wider shows two columns with a 48px face beside the name. The acting
  seat's face ring glows and a folded seat's face dims. A face is painted only
  when the character at that seat changes, and an emptied seat loses it.
  Occupied seats are drawn solid; only folded and open seats are dimmed.
- **The dealer:** the dealer shows the room's own gorilla's face over the
  suited bust (48px, 40px on phones and short desktops). On each new hand at
  the table shown, the dealer dips and a card swings out for 700 ms. Nothing
  moves under reduced motion, and switching tables or joining or leaving live
  play does not trigger it.
- **The room behind the table:** on desktop the backdrop is a see-through veil
  in the theme's colours, so the room shows dimly round the table. The table
  head, status strip, information rail, dock and result banner each sit on a
  solid surface so their text stays readable. On phones the backdrop stays
  solid. The crowd keeps strolling behind the view. The visitor's own Ooga is
  held in its chair while seated, and stands idle rather than frozen
  mid-stride while watching a table unseated. Losing a live seat with the
  view open closes the view.

## Live feedback and request handling

The interface distinguishes initial connection, connected play, sending a move,
automatic reconnection and a stopped connection. It shows the server's table
deadline and offers Reconnect after a stopped worker. Reconnecting uses the
existing account-bound browser checkpoint; it cannot extend a deadline or
recover cleared keys. Leaving the scene aborts pending connection work so a
late response cannot attach a worker to a later scene visit.

Each UI action gets a local request number. Controls lock immediately, and the
worker includes an acknowledgment in a subsequent verified state only after
that action finishes. An older state response cannot unlock another bet. An
uncertain signed command remains pending through the existing exact-byte retry
and recovery path. Network failure blocks new actions until a refreshed state
arrives; a stopped worker cannot be revived by a late state message. Request
numbers are UI bookkeeping, not a new signature, proof or server authorization.

Shuffle/reconnect progress clears when verified state arrives. Action errors
and explicit verification results survive unrelated refreshes. The shuffle,
betting rules, payout accounting and private-card filtering are unchanged.

## Validation handoff

Per `AGENTS.md`, validation defaults to **wait**: build and JavaScript syntax
checks only. The added live-bridge regression covers duplicate input, stale
acknowledgments, reconnection, progress/error notices and stopped-worker state.
It is written but has not been executed in this revision. No browser sessions,
screenshots, runtime tests or performance measurements were run.

Found / maintainer play-tests before marking the PR ready:

- Complete practice hands using all action types, preset sizes, short all-ins,
  free refills and automatic dealing; compare chip totals and showdown results.
- Use all table filters and the table switcher as a spectator. Walk while
  seated, return on your turn, then deliberately leave after a practice hand.
  Verify Escape, keyboard focus, optional turn sounds and mirror round trips.
- Check phone portrait and landscape, narrow desktop windows, zoomed text and
  all five themes in the built page. Confirm cards, nine seats, bets and action
  controls remain readable and reachable without horizontal scrolling.
- Complete a live hand with two signed-in accounts. Interrupt and restore the
  network, delay an accepted action response, reload, reconnect a stopped
  worker and exit during initial connection. Check the turn timer and that no
  second action can be submitted while a move is uncertain.
- Walk a spectator between floor and table voice, with an occupied seat
  walking and returning too. Check visual presence and private-card boundaries.
- The table view: the browser suite now checks that every occupied seat shows
  its own face and an emptied seat loses it, and that the dealer's face is
  painted and the deal gesture shows and ends; the `poker` and `bifrost`
  browser sessions pass with them. The view was looked at by eye on
  desktop in Banana Club and Crystal Grotto and at phone size. Still to check:
  reduced motion by eye (no deal gesture or card motion), 200% text zoom (the
  pot, board and acting seat stay readable with the room behind), all five
  themes switched while seated (felt, rail, chips and veil follow at once), a
  20-character player name at 390px wide (it wraps and the seat stays on the
  table), and a live table with two signed-in accounts (faces and the deal
  gesture on live seats).
- Seated players: the browser suite checks a remote seated as itself in a
  chair this page has empty, hidden behind a computer opponent, standing at
  floor height, and, with the tables made live as far as the scene reads them,
  that a matched player takes the stand-in down within a frame and shows their
  own face, that a hidden body leaves the stand-in and its face alone, and that
  the stand-in and its face come back the frame after the player leaves. Still
  to check: two real accounts at a live table (each sees the other seated, with
  their own face), a rename between the room and the poker service (the seat
  falls back to the stand-in), a full table of nine real players, a player
  sitting down from the aisle, held items against the rail, and the sitting
  pose by eye in all five themes.

Keep the existing browser STOP ledger in force. These are acceptance tasks for
the maintainer, not authorization to retry a blocked browser session. Live
deployment and encrypted recovery also require the checks in
[poker-integration.md](poker-integration.md).
