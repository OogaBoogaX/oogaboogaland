# Ember Den interface revision

The floor needs a clear path from walking in to playing a hand. The previous
table view mixed betting, room preferences and protocol detail, and its Walk
control also relinquished a practice seat. This revision separates those jobs
while retaining the ten tables, nine seats per table, suited gorillas and free
banana chips.

## Player flow

- **Enter:** choose Play a practice hand for four-player practice, or Join live
  tables for the configured service. Each mode is labeled throughout the view.
- **Find a table:** ten compact cards show occupancy and hand status. All
  tables, Open seats and In play filters help find a seat or a hand to watch.
  Open seats means a seat can be taken between hands, not a mid-hand waitlist.
- **Follow a hand:** the oval table emphasizes the board, pot, acting player,
  stacks and round bets. Private cards sit beside the turn prompt. Table tools
  opens hand history and table options.
- **Act:** Fold, Check/Call and Bet/Raise retain their positions. Presets choose
  a size without sending it. The input is a total for the round; helper text
  explains the additional chips and remaining stack. Calls and maximum raises
  explicitly identify all-ins. Refills say they are free.
- **Ask Ooga To Move:** a computer opponent's seat card (on live tables, a seat
  with a guest's figure and no player) offers Ask Ooga To Move on hover or keyboard focus.
  On phones, tap the seat for that action. After a mid-hand request its status reads "Moves after this hand". Your Ooga lifts the guest and
  you carry it; a bar low in the middle of the floor view says what the aim is
  on, shows the keys ("Aim with the camera · Space or Throw throws · Esc puts
  down", or the stick's words on touch) and holds Throw (enabled only while a
  throw would go through a pane) and Put down. The seat is then free for you to
  take. All of it stays on your page; see Computer opponents and Ask Ooga To Move
  in [banana-poker.md](banana-poker.md). Not verified: the bar's place on phones
  beside the sticks, and the seat card's extra line on the narrowest seats.
- **Walk the floor** opens a confirmation for seated players. Stay at table
  dismisses it. Leaving returns the player to the aisle and releases the chair.
  A live departure during a hand finishes through the connected worker.
  Spectators can walk away immediately.
- **Leave:** Table options contains a separate Leave seat control. Practice
  can check/fold remaining turns and leave after settlement; live play requires
  waiting between hands. Walking never silently submits a poker action.

The selected table sets the artwork, title, crest, rail, seat and control palette in practice and live play. Each surface follows its matching floor table. The hosted site fetches the selected picture when the table opens. The single-file build embeds all ten.

On portrait phones the action dock sits below the table. In phone landscape it sits beside the board. Tap a seat to inspect its stack and last action. The seat sheet offers the applicable seating or move action. Bet or Raise opens the sizing sheet, where the player chooses an amount and submits it. Table tools opens on Hand history. Open Options to manage preferences. Choose another table from the casino floor. On touchscreens the floor list starts closed and the Tables button sits above the look stick. A changed turn or connection closes an outstanding bet before it can be submitted.

## The table view

The focused table view now reads as a table in the room rather than a panel
over it:

- **The pot you can see:** three chip stacks sit under the pot figure and grow
  with it, eight chips high at most (`BL.pokerHud.potChips`). Their row keeps
  the same height empty or full, so the board never moves as the pot grows or
  as a result shrinks it to the amount collected.
- **Rail and felt:** the room's ten material palettes and rail fittings appear in the seated view. Card faces and chip counts stay readable over the clear center.
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
  in the panel's colours, so the room shows dimly round the table. The table
  head, status strip, action dock and result banner each sit on a
  solid surface so their text stays readable. On phones the backdrop stays
  solid. The crowd keeps strolling behind the view. The visitor's own Ooga is
  held in its chair while seated, and stands idle rather than frozen
  mid-stride while watching a table unseated. Losing a live seat with the
  view open closes the view.
- **Emotes:** with a live room connection and an Ooga to drive, an Emote
  button sits beside Walk the floor (in the status strip on phones, 44px tall)
  and opens a menu of ten emotes, each an emoji and its name: a dropdown on
  desktop, a sheet along the foot of the view on phones. A choice sends the
  room's existing reaction; the emoji shows over the sender's face at their seat
  and their seated Ooga acts out six of them (see Table emotes in
  [banana-poker.md](banana-poker.md) for the set and who sees what). A refused
  send reads "Not sent" on the button. The menu closes on a choice, a press
  outside, the view closing or Escape, and Escape closes the menu before it
  closes the view. With no backend or signed out the button never shows.
- **Tells and fidgets:** every seated figure shows the hand's body language
  without anyone choosing it: sweat on the brow after 5 seconds on turn (two
  beads at 10), a gulp facing a bet of half the pot or more, a fold's cards
  tossed to the middle, an all in's chips pushed in, a winner's cheer and a
  busted seat's slump, and small fidgets while others act (off under reduced
  motion). A chosen emote wins over them. Each page works them out from the
  table's public state alone (see Tells and fidgets in
  [banana-poker.md](banana-poker.md)); nothing is sent over the wire and no
  card is read.

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
- Use all floor filters, watch a table, then walk back to select another. Walk while
  seated, return on your turn, then deliberately leave after a practice hand.
  Verify Escape, keyboard focus, optional turn sounds and mirror round trips.
- Check phone portrait and landscape, narrow desktop windows, and zoomed text in
  the built page. Confirm cards, nine seats, bets and action
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
  desktop and at phone size. Still to check:
  reduced motion by eye (no deal gesture or card motion), 200% text zoom (the
  pot, board and acting seat stay readable with the room behind), a
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
  pose by eye.
- Emotes: the browser suite checks the Emote button and menu (Escape closing
  the menu before the view, a press outside, Walk the floor from the keyboard),
  the visitor's own emote at their seat with its gesture and its clearing, a
  gesture replaced mid-run leaving the head level, standing mid-gesture, a
  matched player's emote at their seat with their Ooga gesturing, a burst
  showing the newest, the seat clearing when the player leaves, an emote at
  another table showing only once the view switches there, the button going
  when the connection drops, and on a phone the 44px button and the open menu on
  screen with the table still fitting. The room's socket is faked there. Still
  to check: two real accounts trading emotes at a live table; each gesture by
  eye and on a wide-headed or hatted Ooga (so far only Groan,
  Salute and Wow, on one Ooga); the knock, slow clap and shrug;
  the phone menu on a small phone; and a burst at the room's limit.
- Tells and fidgets: the Node checks cover each tell's trigger and timing, the
  big-bet rule through real practice hands, precedence, settling, the fairness
  boundary (a snapshot whose hidden fields throw, and a source naming no card
  field), the bot hold and an allocation-free frame. The browser suite's checks
  passed in the controller's run: a bot's fold, all in, cheer and slump at their
  own seats, the visitor's sweat (and none over a held seat walked away from),
  the bot hold on the scene's clock, an emote over a running tell, standing up
  mid-tell, a remote standing up mid-tell, reduced motion, a tell running
  through the round trip and a fold's toss on Canvas 2D. Reduced motion is read
  once, when the room is entered. Not verified by eye: each tell and fidget on
  screen in the grand hall, the bead's fit on a short, a tall and a remote Ooga,
  the toss and push, and Canvas 2D. Also still to check: two real
  accounts at a live table, and the frame-rate lane.

Keep the existing browser STOP ledger in force. These are acceptance tasks for
the maintainer, not authorization to retry a blocked browser session. Live
deployment and encrypted recovery also require the checks in
[poker-integration.md](poker-integration.md).
