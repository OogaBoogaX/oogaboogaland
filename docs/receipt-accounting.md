# Receipt accounting (#492): the page's side of v1

Status: **implemented on the page, inactive.** The page handles bananapayserver's receipt
accounting v1 whenever a Worker advertises it, and keeps today's legacy behaviour wherever it
does not. Nothing here deploys, migrates, activates or authorizes anything: no Worker turns
`issuance` on, no wallet is touched, no credential or API scope changes. Activation waits on the
gates listed at the end.

The contract is bananapayserver's signed
[`docs/receipt-accounting-v1.md`](https://github.com/OogaBoogaX/bananapayserver/blob/7305bd1cea712ad27dc942cf964d60d24b4cabff/docs/receipt-accounting-v1.md)
at `7305bd1` ([bananapayserver#31](https://github.com/OogaBoogaX/bananapayserver/pull/31)). It
incorporates the three amendments agreed after the first proposal (`0b6b7bf`): private status
address paging and `payableAddress`, the public `invoiceStatus` frame, and pending pricing (see
[Amendments in 7305bd1](#amendments-in-7305bd1)). Two refinements agreed since are implemented
here and await the next backend source (see [Refinements after 7305bd1](#refinements-after-7305bd1)).
This document says how the page consumes it. It introduces no field, value or endpoint of its
own; where the contract is silent or ambiguous the page's reading is listed under
[Questions for the backend](#questions-for-the-backend).

Out of scope: the virtual-host work (#467), the short-phone-drawer work (#491), the built
`oogaboogaland.html`, and every treasury, spending or conversion rule.

## Principles the page keeps

1. **Attribution follows the invoice.** Every receipt BTCPay attaches to an invoice (partial,
   excess, split, late, repeat, after expiry or completion) is credited to the attribution saved
   with that invoice. The page says this is the invoice's donor, never who sent the payment.
2. **Receipts, not invoices, deduplicate effects.** A receipt id keys animation, recent rows and
   private history. The invoice id only associates a receipt with the kiosk or popup showing it.
3. **Ownership is the account.** Private reads go through OBL's Worker with the session's stable
   numeric GitHub id. A handle, a public frame or a tab that hears a frame never confers it.
4. **The server's revisions are authoritative.** The page replaces what it holds with a newer
   revision and never adds up frames it happened to see.
5. **No time decay anywhere,** and gameplay never changes funds.
6. **Lifetime is not remaining.** Lifetime figures come from `tally`, `board` and `recent`; the
   pile is a separate, revisioned projection that may be unknown.
7. **Coverage is `invoice`.** The page never promises permanent or complete monitoring.

## Capabilities

`status.accounting` is read only when it is exactly `{ version: 1, issuance, receipts, history,
coverage, spends, reconciliation }` with booleans, `coverage: "invoice"`, `spends: false` and
`reconciliation` one of `off`, `current`, `behind`, `review`. Anything else, or its absence,
means legacy (`donations.state.accounting` is null). A resent `status` replaces it.

- `issuance` alone decides whether a new invoice asks for receipt mode.
- `receipts` and `history` say what can be read; once true they stay true on the server.
- `reconciliation` is shown, never interpreted as a balance.

## Invoices and their mode

- `POST /donations/invoice` carries `"accounting": 1` only while `issuance` is true.
- The reply's `invoice.accounting` is `receipt-v1` or `legacy` (absent is legacy; any other value
  is refused as `invalid`). A reply of `legacy` to a request that asked for receipt mode is refused
  too: the server never downgrades, so a page never silently accepts one.
- 503 `closed` when receipt mode can't be issued is shown as closed. The page never retries
  without `accounting`.
- An invoice keeps its mode for good. Legacy invoices publish only `donation`; receipt-mode
  invoices only `receipt`. Both streams are handled at once: **there is no global switch that
  ignores legacy events**, and turning `issuance` off changes only what new invoices ask for.

## The socket

The legacy part is unchanged: `donation`, `recent`, `board`, `tally`, `seen` and the `after`
cursor (the last legacy invoice id).

Receipt frames (`type: "receipt"`) and invoice status frames (`type: "invoiceStatus"`) share one
sequenced stream. Both are validated field by field and applied in place:

- **Per receipt:** applied only when `receipt.revision` is newer than the one held (a bounded
  map of revisions by receipt id).
- **Per invoice:** the `invoice` totals (a receipt envelope's are final, committed totals) apply
  only when `invoice.revision` is strictly newer, and only to an invoice this page already tracks
  (created here, or read through private status). A public frame never registers an invoice and
  never makes the viewer its owner.
- **`invoiceStatus`** (`{ type, seq, replay, invoice: { id, due, received, credited, review, left,
  state, revision } }`) carries fee, `left` and review changes that move no receipt. It replaces a
  tracked invoice's totals only when strictly newer, never animates and never counts. Like any
  move of a tracked invoice's totals, it reads private status again, the only way the page learns
  the current `payableAddress`.
- **Animation** happens exactly when `replay === false`, `state === "credited"`,
  `seq === firstCreditedSeq`, the frame's `seq` is past every frame this page has processed (the
  receipt cursor), its revision is newer than the one held, and the receipt id has not animated on
  this page. The sequence gate holds however much the bounded revision and animation rings have
  forgotten. Duplicates, delayed revisions, reconfirmations, reversals, `recentReceipts`, replay
  frames and private replies never animate and never add to a local total.
- **Recent rows:** `recentReceipts` replaces the receipt half of the recent list, except that a
  receipt the stream has already moved past keeps its newer row (or stays out once reversed). Later
  revisions update a row in place; a row whose receipt leaves `credited`/`review` is dropped; a row
  is added only by a frame past the cursor. Rows are ordered by when the receipt was received (its
  frozen price's immutable `receivedAt`, then `firstCreditedSeq`), never by `receipt.at`, which is
  the latest revision's time, so a correction never moves an old donation to the top. Legacy rows
  order by their own `at`, the donation's time, and the two lists merge on those times.
- **Cursors:** the legacy cursor (`after`) and the receipt cursor (`receipts`, the highest `seq`
  seen on either frame type) are independent. A reconnect sends `after` as today and `receipts=<cursor>` only once a
  cursor is known.
- **Replay marker:** `{ type: "replay", after, through, complete }`. With `complete: true` the
  cursor moves to `through`; with `complete: false` (a gap) the cursor moves to `through` and the
  signed-in history is read again too. After either, every tracked invoice reads its private
  status again before it counts as fresh: what was held may predate the reconnect. Tally, pile and
  `recent` arrive on every connect anyway. A marker with `through: null` leaves the cursor unset.
- **Failed reads:** a status read that fails, is refused or falls behind leaves the invoice not
  fresh and drops its payable evidence until a later read succeeds. Nothing retries by itself;
  the next frame, reconnect or the kiosk's CHECK AGAIN reads again.
- **Reads from before a catch-up:** every catch-up moves an epoch, and a status read begun under
  an earlier one is dropped whole when it lands, however new its revision: freshness counts from
  when a read began. The read the catch-up asked for runs instead, and until it succeeds nothing
  about the invoice is current.
- **Messages:** a receipt's `message` was weighed against its own invoice's saved bar when it
  was captured, so the page only sanitizes it, live and in the recent list, and never blanks it
  when the advertised `messageMinSats` later rises. Legacy donations keep today's rule.

## Private status and history

OBL's Worker (`worker/src/donations.js`) passes:

| Page | Binding call | Donor |
|---|---|---|
| `POST /donations/status` | `status(request, donor, visitor)` | from OBL's session, or null |
| `POST /donations/history` | `history(request, donor, visitor)` | from OBL's session, or null |

Only the body and its content type go on; cookies, headers and the browser's request never do.
The donor is `{ id, login }` from the server-side session, exactly as for invoices, and never from
the page's body or handle. bananapayserver decides ownership; the page cannot claim it.

- **Status by `request`:** the bearer token from `invoice`, kept in page memory only (never in a
  URL, localStorage or history).
- **Status by `invoice`:** for a signed-in owner, through the session.
- **History:** one server page at a time, newest first (`{}`), with Older (`{ cursor }`) and
  Newest controls, so every page stays reachable and nothing is accumulated or cut. The page keeps
  the server's order. A page that was on its way while the stream moved one of its invoices keeps
  the newer totals (the page holds every invoice's newest stream totals, bounded), so an older
  reply never regresses `credited`, `review` or `left`. The panel says
  when older donations are on a further page. 409 `resync`, a refused cursor, or a page from
  another `revision` reads the newest page again and says the history changed. History carries no
  address or token; reopening an invoice reads its status by `invoice`.
- **Status pages:** the first page (no cursor) carries the totals, `payableAddress` and the
  newest receipts and addresses. Older receipts page through `cursor`/`next`, older addresses
  through `addressCursor`/`nextAddress` (newest-issued first, `null` at the end); the two never
  mix and one call carries at most one of them. Each list holds exactly one server page (a
  window): Older replaces it with the next page, Newest returns to the first, and a page larger
  than 100 rows is refused rather than cut, so a cursor never skips rows the page didn't keep.
  409 `resync` (stale cursor) and 400 `cursor` (malformed, expired or another scope) return both
  lists to their newest page and read again once. One status read per invoice is in flight at a
  time; a read asked for meanwhile runs after it, and a page reply for a navigation since
  abandoned leaves the list alone.
- **Whole-reply fence:** a status reply whose totals revision is older than the one held (a frame
  overtook it) is dropped whole, its address evidence included, and read again, at most twice in a
  row before the view says it is behind.
- **`payableAddress`:** the address the provider currently takes payment at, or `null`, replaced
  by every applied status reply and remembered with the totals revision it was read at. Any move
  of the totals on the stream leaves that evidence behind until the next reply agrees with them.
  Earlier addresses in `addresses` are history; none is payable because it is listed.
- **Account fences:** every private call carries the page's account generation. Sign-out, a
  revoked session or a different account bumps it, drops tracked invoices, request tokens,
  history and statuses, and any reply from an older generation is discarded. A kiosk or popup
  showing an invoice (either mode) from an older generation closes, and stopping a kiosk flow or
  closing the popup clears what they held and showed: the address, amounts, bananas, donor,
  details and the screen's canvas. A request token is the bearer of
  its own invoice only; it never makes another invoice, or the account, the owner.
- **Signed out after a reload:** an invoice can't be recovered, by design. The Bananas panel says
  so and suggests signing in before donating.

## Kiosk and popup (receipt-mode invoices)

The Factory kiosk and the mainland popup share `factory-kiosk.js`; both read the tracked
invoice's authoritative view every frame and apply it only when its revision moved.

- **States shown:** confirming, credited, in review, invalid and reversed receipts are listed
  apart, with the invoice's `received`, net `credited`, `review` and `left`. What is left to send
  is shown only from a current view; otherwise it reads NOT CURRENT and the ledger says it is
  checking, so a remainder from before a reconnect or a failed read is never put forward. A receipt whose
  `pricing` is still `null` shows its bananas as pending; a frozen price with `rate: null` and
  `bananas: null` shows as unpriced (zero bananas). The page never converts sats itself.
- **Success:** only invoice `state: "paid"` shows the full-payment screen. A credited partial
  receipt stays on the address screen with what was received and what is left. A receipt
  animating in the scene never closes or completes the kiosk; the cooker cooks each credited
  receipt as it comes.
- **The address shown** is the one the visitor picked from the invoice's addresses (Older and
  Newest on the ledger page through the address pages), otherwise `payableAddress` when known,
  otherwise the one this visit was issued, otherwise the newest listed. A listed address that is
  not the known payable one is labelled as earlier and shown as text alone, never as a QR or with
  an amount: being retained is not being payable.
- **Lightning after any receipt:** once any receipt has ever been seen for an invoice (a frame for
  it, a receipt in its status, or `received`, `credited` or `review` above zero), its original
  Lightning code (which asks for the whole target) is cleared from the flow, the quote and a
  reopened invoice alike, and the Lightning screen moves to the ledger. The view latches this for
  its life: a reversal back to zero, or a reply offering the code again, never brings it back. v1 has no
  code for the remainder, so a top-up is on-chain only; Lightning receipts that arrive anyway
  still count as their own receipts.
- **QR codes:** an amount-bearing `bitcoin:` QR is drawn only when the address shown equals
  `payableAddress`, that address was read at the invoice's current totals revision, and the
  invoice's `left` is a positive integer from a fresh authoritative view (the socket connected and
  caught up, no gap awaiting its status read, the invoice unexpired and unpaid). The issuance amount from `/donations/onchain` is never used for a receipt-mode invoice,
  and `left` is never applied to another address or derived from `due − received`. Otherwise the
  QR holds the address alone and the screen says the remaining amount is unavailable (or that
  nothing is left to send). After completion no QR is drawn at all.
- **Expiry:** a receipt-mode invoice's original `expires` is a positive safe integer of Unix
  seconds at issuance, in every status reply and in every history row; v1 has no nullable expiry.
  A missing, null, zero, negative, fractional or non-number one refuses the whole issuance, status
  reply or history page (never a row dropped). Where bananapayserver can't state it, it answers 503
  `closed` for that status or history page: the page keeps every record it holds and withdraws
  freshness and the amount until a later read succeeds. An amount needs a known expiry still ahead;
  there is no "no expiry means payable". Legacy invoices keep their own rule (any finite number).
- **The paying address** (`payingAddress`) is named, labelled "paying" and drawn as a QR only from
  a current view: tracked, fresh, its payable address read at the current totals revision, unpaid,
  expiry ahead. A failed, refused (503 `closed` included) or behind read, a disconnect, an expiry or
  an account change leaves every address as history: text to see and copy, no QR, no amount, no
  "paying" label. The address `/donations/onchain` issued on this visit has its QR (never an amount)
  only until the invoice's first read, only while the stream is up and caught up and the invoice's
  issued expiry is ahead, and never after that read fails. An expiry passing with no event at all
  (no revision, no socket message) is caught on the kiosk's next frame on any screen, the ledger's
  included: the paying label, QR and amount go, "LEFT TO SEND" reads EXPIRED rather than a
  remainder, and the receipts and addresses stay. A view dropped past the 32-view cap (or by
  an account change) is retired for good: a screen still holding it keeps its records as history,
  and no late reply, catch-up or frame makes it current again.
- **Paging lists:** NEWEST on the receipts or the addresses brings back that list alone; the other
  stays on its page, even with a page of it on its way.
- **Account at issuance:** the kiosk fixes the account generation when an invoice is asked for. A
  change while it is on its way resets the kiosk without showing it; an invoice asked for after a
  change belongs to the new account.
- **Snapshot animation (defensive):** `recentReceipts` marks animated only receipts it shows with a
  `firstCreditedSeq`. bananapayserver lists only ever-credited receipts today; the contract does not
  promise that, so one listed before any credit still animates its live first credit.
- **The address stays:** visible and copyable after a partial payment, completion, expiry and a
  reopen, with the line "Payments to this address count for this invoice's donor once credited.
  That is not proof of who sent them." Expiry never erases the address or the receipts.
- **Late and repeat receipts** show as their own rows on the same invoice.
- **Reopen:** a signed-in donor's history rows reopen the invoice in the popup on its ledger, from
  its status (addresses, receipts, totals); its on-chain address is offered from there, its
  Lightning code is not offered again, and no amount is ever derived from `due − received`.
- **Bananas** on the ledger and paid screens are each credited receipt's own frozen value, summed
  only when the receipts in view are all of the invoice's (their credit equals `credited`);
  otherwise each receipt shows its own. The quote's estimate is never shown as a result.
- Legacy invoices keep today's flow unchanged.

## Pile and lifetime figures

- **Decay is gone.** `eatPerHour` is ignored wherever it appears. The director no longer
  extrapolates the pile; the crew's chewing no longer eats from it, in real or simulated mode.
- **Real mode:** the drawn pile follows the latest `pile` message. A receipt-era pile moves only
  forward by `revision` for the page life, reconnects included: an equal revision confirms the
  pile held, a lower one is refused. A pile without a revision is taken only while the API's status
  names no `accounting`, so a legacy message can't stand in for a receipt-era one. While the socket
  is down or no pile has been heard on the current connection, the panel says the figures are the
  last ones heard; the warning clears only when a pile arrives on a live connection. `bananas: null`
  (before the cutover anchor, or after it when a negative correction or unsafe totals leave no
  count), `cutover: "pending"` or `reconciliation: "review"` show the pile as unavailable or
  uncertain; the page never forges a zero or a live wallet balance, and a null pile keeps its
  revision, so an older count never comes back. `basis: "credits"` is labelled as counted
  from credits, not a wallet balance. `uncertain` is shown when it holds credit.
- **Gameplay:** in real mode no scene (DSB Land's included), delivery animation, debug fill
  (`pile.setLevel`, P, B), eating (the crew, the DSB rescue dogs) or reload changes the drawn level;
  scenes add to it only in simulated mode. Before a real count arrives the drawn heap keeps its
  starting size; no label reads it in real mode.
- **Lifetime:** `game.recordDonation` keeps a local ledger only in simulated mode. Real totals,
  the board and the recent list come from the server. Spending, when it exists, will never touch
  them.
- **Display:** the Bananas panel shows the remaining pile beside the lifetime totals, and the
  island's pile label shows both, never one for the other.

## Pricing on receipts

`receipt.pricing` is `null` only while the first detection's pricing intent is unresolved; while
it is, the receipt has `credit: 0` and `firstCreditedSeq: null`, and its first credit waits for the
price to freeze (permanently unpriced included). Once frozen it is `{ receivedAt, rate, bananas }`
and never changes; freezing publishes a newer receipt revision even when the state stays the same,
and a reconfirmation keeps the original `firstCreditedSeq`. `rate: null` with `bananas: null`
means permanently unpriced, zero bananas, which the page shows apart from "pending". The page
refuses a receipt that claims credit or a first credit while its price is `null`, and keeps a
pending receipt's bananas pending in recent rows and the ledger until a frozen revision arrives.
Animations count the receipt's own frozen bananas (zero when unpriced), never a conversion.

## Privacy

The public feed carries no address, request token, account id, txid, outpoint or provider
identifier, and the page reads none from it. Addresses reach only the invoice's own page through
private status. Request tokens stay in memory. Nothing new is written to localStorage.

## Amendments in 7305bd1

Agreed with the backend after the proposal commit `0b6b7bf`, part of the signed contract at
`7305bd1`, and implemented here:

1. **Private status paging and `payableAddress`.** The status body may carry `addressCursor`
   beside `cursor`; the reply adds `nextAddress` (distinct from `next`, `null` at the end).
   Addresses come newest-issued first and bounded. Cursors are fenced by kind, owner, invoice and
   revision: stale gives 409 `resync`, malformed, expired or cross-scope 400 `cursor`. The reply's
   top-level `payableAddress` (`string | null`) is the latest fresh, verified provider destination
   bound to the invoice, present on the first page. Historical addresses alone never imply
   payability.
2. **`invoiceStatus` frames** on the same sequenced receipt stream, for fee, `left` and
   quarantine changes without a receipt transition. They replace only strictly newer status,
   never animate or count, and prompt a private status read for an owned invoice. Receipt
   envelopes carry final committed totals.
3. **Pending pricing.** `receipt.pricing` is `null` only until the first detection's price
   freezes; afterwards an object whose `rate: null, bananas: null` means permanently unpriced.
   Freezing emits a new receipt revision.

## Refinements after 7305bd1

Agreed with the backend and implemented here; they await the next backend source, so they are not
yet in a signed contract:

1. **Ever-observed BOLT11.** `7305bd1` hides the original full-target `bolt11` while `received`,
   `credited` or `review` is above zero and says a full reversal alone never brings it back. The
   agreed refinement makes it permanent: once any receipt has ever been observed for an invoice,
   its original code is never offered again, whatever the totals later read. The page latches this
   for the life of an invoice's view.
2. **A pile without a count after the cutover.** `bananas: null` can also arrive after the anchor
   (`cutover: "done"`, `reconciliation: "review"`, `at: null`, `uncertain: null`, `eatPerHour: 0`),
   when a negative correction or unsafe, unrepresentable totals leave no count to show. The page
   reads it as unavailable, as before the anchor, keeps its revision, and never shows zero.

## Answered by the backend

1. **Connect without a cursor.** A read-capable v1 Worker always sends `recentReceipts` and the
   replay marker; without `receipts=` the marker is the snapshot's high-water mark and nothing
   historical animates.
2. **`receipt.at`** is the latest revision's time, not when the donation happened; ordering uses
   `pricing.receivedAt` (immutable once frozen) and `firstCreditedSeq`.
3. **Receipt-mode invoices** send no legacy `seen` or `donation`; the page also ignores `seen` for
   any invoice it tracks as receipt-mode.
4. **Lightning after a receipt.** Private status returns `bolt11: null` once anything has come; the
   page clears its own cached code too (above).

## Questions for the backend

Readings the page had to choose; each is flagged for agreement, not decided here.

1. **Unknown `accounting.version`.** Treated as legacy for issuance; valid receipt frames are
   still applied.
2. **Status `lightning` and `bolt11`.** Validated but not used: a reopened invoice offers its
   on-chain address alone.
3. **Edit window.** The page keeps saving details through `note` until the server refuses
   (`unknown`), as today; the server's undecided rule governs.
4. **`left` before the first provider read.** Under the amended QR rule a fresh receipt-mode
   invoice shows no amount until a status reply carries `payableAddress` and a positive `left`.
   If the backend leaves `left` null until its first reconcile, the donor sees the address alone
   at first. Seeding `left` and `payableAddress` from the issuance read would avoid that.

## Activation gates (unchanged, not decided here)

Treasury boundary and internal transfers; spend valuation and conversion; starting inventory and
the pile's cutover anchor; confirmation and pending display policy; the edit window; message
carriage on repeat receipts; account deletion, redaction and recovery after signing in again;
the backend's unverified provider behaviour; fences; two-maintainer review of the relay line and
deployment. Rollout order stays the backend's: this page first, then the fence-aware Worker with
`issuance` off, the anchor, the fences, the v1 relay, staging, and production only on separate
authorization. After the first receipt-mode invoice there is no rollback to a Worker that doesn't
know the fences, and turning `issuance` off never reverts an invoice's mode.

## Checks

Coverage is `node test/run.mjs donations-unit`, which runs the existing donation client checks, the
receipt checks and the shared-vector checks in Node VM contexts and nothing else, plus `node --test
worker/test/donations.test.mjs` for the Worker's proxy. They cover underpayment, excess, split and
repeat receipts, late receipts after expiry, tiny receipts, mixed methods and several receipts in one
transaction (distinct receipt ids), duplicate, out-of-order and replayed frames, `invoiceStatus`
frames, reconnect and gap recovery, reload recovery for a signed-in donor, both status cursors and
their 409/400 restarts, pending and unpriced pricing, quarantine, reversal and reconfirmation, account
switches, the `payableAddress` QR rule, and the absence of clock decay.

**Shared vectors.** bananapayserver's fixture is copied byte for byte into
[`docs/vectors/receipt-accounting-v1.json`](vectors/receipt-accounting-v1.json) from bananapayserver
`4deab73fc44665a50b81d5975ba1e1d3e9095cfc` (signed), `tests/fixtures/receipt-accounting-v1.json`
(81803 bytes, SHA-256 `cbeb711339e7feb84c6526e43c5f9771e6d27be336ad8b9d9c694ec2b455baea`; provenance in
[`docs/vectors/README.md`](vectors/README.md)). `donations-unit` refuses any other size or hash, then
feeds every reply and socket message in it unchanged to the page's real `donations.js` and the HUD's
pile text, and checks each socket request the page makes against the producer's recorded one where
the fixture records it; the check's own setup is only which invoice and account are asked for and the
page's clock.

Its core part (unchanged from the earlier `ea14695` fixture):

- the emitted receipt revisions in feed order (price pending, price frozen, credited, review,
  reversed) and the invoiceStatus totals, applied to a tracked invoice by revision; first credit,
  the frozen price and the message kept through review and reversal; a duplicate ignored;
- every feed frame as emitted, `replay: true`, so nothing animates;
- the raw replay results (`replay.complete`, `replay.gap`, `replay.firstConnect`), which carry no
  socket `type`: fed to the socket, none is taken for a connect marker;
- the raw private-status cores, which lack `accounting`, `expires`, `lightning` and `bolt11`:
  returned as a status reply, each is refused and leaves the invoice unread;
- the emitted piles (pending, anchored, anchored without a count) in order, never back to an older
  revision, reading pending, a whole count and unavailable.

Its endpoints part (`read-endpoints`), what bananapayserver's real front door and socket send:

- **First connect** (status, `recentReceipts`, marker `after: null`): the capability, network and
  limits parse; the marker sets the cursor (6) and catches up; nothing animates; the snapshot's three
  credited rows are listed with their own bananas and message.
- **History:** a page, its next page by its own cursor, then 401 `signin` and 503 `closed`, each
  keeping the rows shown and saying why, then the page again.
- **Status** for a reopened invoice: the first page; the receipts page by `cursor` and the addresses
  page by `addressCursor`, each moving only its own list (the other reply's list ignored); NEWEST on the
  receipts alone; 400 `cursor` and 409 `resync` restarting at the newest; 404 `unknown` and 503
  `closed` keeping every record held but nothing current. No status reply here names a payable
  address, so none is ever offered.
- **Live first credit** (`replay: false`): the detection animates nothing, the first credit animates
  exactly once with its own bananas and received time, a duplicate never does, the status replies
  the moved totals prompt (revision 12, older than the live 15) never take the totals back and leave
  the invoice not current, the pile message that follows (no count yet, `cutover: "pending"`)
  reads pending rather than zero and animates nothing, a reconnect resumes at `receipts=8`, and the
  same frame after it never animates again.
- **Replay from zero** on a page holding nothing: snapshot, six replayed frames and the marker apply
  in order with nothing animated and no row taken back to an older revision.
- **Invoice** 503 `closed` is returned as `closed`, once, never retried as legacy. (The fixture's
  issuance is off, so the receipt-mode request itself, with `accounting: 1`, is not exercised by it.)
- An account change drops the donor's private reads, a status reply on its way for the old account
  included.

Its projection part (`projection-publication`), each publication's messages in order, its tally
compared with `d1`, the lifetime figure D1 holds afterwards:

- **First credit:** the detection animates nothing; the live first credit animates once with its own
  bananas and received time; the board and tally that follow replace the page's (tally equal to `d1`).
- **Stopped after a durable batch** (its refresh never went out): the second receipt's live first
  credit animates once, and the tally and board stay as the last publication left them, behind
  `d1`; the page adds nothing of its own.
- **Crash recovery** (the restart's refresh) and **the same refresh repeated:** tally and board equal
  to `d1` each time; nothing animates, nothing is added twice.
- **Reversal** (review, then reversed) and **reconfirmation** at the frozen price: no animation (the
  reconfirmed credit's seq is not its first credit's); tally and board back down to `d1`, then up to
  it again.

Its payable part (`read-endpoints-payable`). Context set up by the check, not producer output: the
page's clock from the fixture's own times (created 1790856000000 ms, expiring 1790856900 s) and the
signed-in account. Every socket request the page makes is checked against the producer's recorded one.

- **First connect:** the page asks `/donations/socket`, exactly the producer's `initialConnect`
  request, and its messages (status, a pending pile, an empty board and tally, empty lists, the marker
  with `through: null`) catch the page up with no cursor and nothing animated.
- **Live first credit** for the payable invoice: animates once; its detection and a duplicate don't.
- **Payable:** the donor signs in after the credit, and the reopened invoice's status (asked for by
  invoice id alone) names its bound address as paying with 6,000 sats to ask for there and nothing at
  the invoice's other address; the history row shows 6,000 left. With the clock past expiry the same
  reply offers no address or amount.
- **Withdrawn live:** the freshness frame alone takes the address and amount away, and the history
  row's remainder, before any read; the status and history replies after it say the same at the
  newer revision, with the addresses and receipt kept.
- **Current reconnect:** the page reconnects from its own cursor, `/donations/socket?receipts=3`,
  exactly the request the producer answered with `socket.currentReconnect`: caught up with no gap, the
  invoice read again.
- **The early gap**, on a separate page from the start of that world: `earlyConnect` for exactly its
  request, the live detection (seq 1), a drop; past the invoice's expiry the donor signs in and reopens
  the invoice (`status.atEarlyGap`, `history.atEarlyGap`); the reconnect asks
  `/donations/socket?receipts=1`, exactly the producer's `earlyGap` request, and its marker (through 4,
  incomplete) resyncs once, the invoice and history read again, nothing animated (the first credit,
  seq 2, happened while the page was away); the next reconnect asks `/donations/socket?receipts=4`,
  exactly `earlyCurrent`'s request, and catches up with no further resync.
- **Expired:** Lightning reads `expired`, nothing is payable, the addresses and receipt stay, and the
  history keeps the invoice.
- An account change then retires the view.

The older `socket.gapMarker`, which the producer sent to a page asking from cursor 0, is no longer
fed: no message the producer sends leaves this page holding cursor 0 (its first marker is `through:
null`), so that request is one this client never makes, and the early gap above is the one it does.

Its pile part (`anchored-pile`), each step's messages in order:

- The pile follows the API's figure, revision and health at every step: 10 on connect, 11 for a credit
  read behind and then current (a new revision at the same level), 11 in review with its 1,000 sats
  uncertain, 10 for the reversal, 11 for the reconfirmation, unchanged while a second credit is bridged
  before a stop, 13.5 from the next start's recovery; the HUD shows each whole count
  (`10|11|11|11|10|11|11|13|13`).
- The reconnect's equal revision confirms the pile held rather than handing it on again; an older
  revision is refused; nothing animates and the page adds, decays or counts nothing of its own.

No incompatibility was found: the client parsed every reply and message as sent.

**Still not proven by any vector:** an issuance reply with `accounting: "receipt-v1"` and an
available Lightning code (issuance stays off in production and no BOLT11 is verified, so the corpus
has neither, and nothing here closes that gap); how an operator applies the pile's anchor (the
producer's test applies it directly); and anything about provider ingestion, real D1, Durable Object or
socket runtime behaviour, or reconciliation, which the fixture says it does not prove. The producer's
per-page enqueue positions and bounded retry of failed sends need no page change (no new
acknowledgement), and nothing here tests them.

**Pile health, and what the pile vectors can and cannot show.** The panel's pile note warns "behind"
or "review" when either the latest pile message or the latest status frame's
`accounting.reconciliation` says so, taking the worse of the two. That is intended: the producer
publishes both. In the signed producer
([`worker/object.mjs` at 4deab73](https://github.com/OogaBoogaX/bananapayserver/blob/4deab73fc44665a50b81d5975ba1e1d3e9095cfc/worker/object.mjs)),
`projectReceipts()` recomputes the accounting capability and broadcasts a changed status message
before it publishes the pile, and `pushReceiptFrames` likewise broadcasts a changed capability before
the pile, so on the real wire a page whose pile turns current also hears the status that says so. The
`pile` vectors are filtered to pile messages only, so they cannot show that pairing. The pile-only probe
run proves the pile's own count and health handling (behind and review warn, review naming its
uncertain sats, current clears); the run that first fed the payable world's first-connect status
(`behind`) and then the pile vectors proves an old global `behind` stays a warning when no newer status
arrives. Neither is the complete same-world wire sequence, and neither runs the producer's runtime or a
staging deployment.

**Visual check (synthetic, outside the suite).** A probe outside the repository served the source
tree locally and replaced `fetch` for `/donations/*` and the donation `WebSocket` before the page
loaded, so the real client, popup, kiosk and HUD ran against the fixture's replies and messages. It
ran at 1440x900 and at 390x844 with touch, and logged every request and which reply answered it. It
is a simulation of the endpoint, not a real provider: nothing was paid or issued by bananapayserver.
The page clock was set from the fixture's own timestamps (invoices created at 1790856000000 ms,
expiring at 1790856900 s): 1790856300000 for current states, 1790856960000 for expiry.

From the fixture's bytes alone:

- Bananas panel: "PILE NOW 12" (the anchored pile) beside the lifetime totals (BANANAS · CURRENT
  VALUE, DONATIONS, SATS DONATED, shown as "—" since the fixture holds no tally), with the
  reconciliation and offline notes; history rows from `history.page`.
- Shared popup, reopened from the history row's own button: the ledger from `status.byToken` with
  its address labelled "ADDRESS" (no payable address, so no QR) and "< ADDRESS" disabled.
- Paging by real taps on the screen: receipts OLDER sent `cursor` and took `status.receiptPage`; the
  first addresses OLDER stepped through the page held, the second sent `addressCursor` and took
  `status.addressPage` while the receipts stayed on their page; receipts NEWEST and addresses NEWEST
  each brought back only their own list.
- `status.metadataClosed` (503): records kept, "LEFT TO SEND NOT CURRENT", CHECK AGAIN.
- The Factory's own kiosk (opened through the scene's own way to it, since the page drove no Ooga):
  the fixture's first status says `open: false`, so the kiosk shows CLOSED and refuses Enter; no
  invoice is asked for.

With synthetic replies (named SYNTHETIC in the probe's log and files), because the signed corpus has
no issuance reply and no status naming a payable address:

- `status.byToken` with `payableAddress` set to its own first listed address: PAYING ADDRESS, then
  the amount QR (7,000 sats) on "< ADDRESS".
- Passive expiry on the ledger screen: the clock moved past expiry with no request and no socket
  message; the next frame withdrew PAYING ADDRESS, disabled "< ADDRESS", and showed LEFT TO SEND as
  EXPIRED, rows kept.
- The socket closed (stale): NOT CURRENT, "CHECKING FOR CURRENT FIGURES...", no paying label. Then
  reconnected: the page reconnected with `receipts=6` and was sent the fixture's first-connect
  messages (which the producer sends to a cursor-less connect, so the request context differs); its
  catch-up read made the view current and paying again.
- The Factory kiosk with a status frame whose `open` and `issuance` were switched on, a synthetic
  receipt-mode invoice and on-chain reply: the invoice request carried `accounting: 1`; the chain
  screen showed the amount QR at the paying address; past expiry it moved to INVOICE EXPIRED with no
  QR or amount.

No console errors or warnings in either size. That pass found the Factory booth's touch sticks lying
over the kiosk's BACK and RECEIPTS buttons on a phone. They now stand aside while the booth has the
screen (`booth-held` on the body, set and cleared with the booth's other held controls in
`boothHud`, so a close, the walk away, `endBooth` and the scene's `leave` all bring them back, and a
stick held as it opens is let go); this is not yet confirmed in a browser. Not looked at: the hub's donation arrival and the cooker's show for a receipt
credit in a browser.

**Second visual pass (5b05e90 vectors, after one build).** The probe (outside the repository) ran at
1440x900 and at 390x844 with touch against the served source, with every `/donations/*` reply and socket
message taken unmodified from the pinned fixture. SYNTHETIC-CONTEXT, not producer output: the page clock
from the fixture's own times (1790856300000 ms current, 1790856960000 ms past expiry), account 9, the
capability frame (the endpoints' first status frame), the payable stream marked caught up before its
first read, the booth opened through the scene's own `toKiosk` entry, and the payable invoice shown in
the booth through the flow's own `reopen` (the booth has no history list). No issuance reply exists or
was made, and nothing here is a real provider. Results, at both sizes:

- Projection on the Bananas panel: after each publication the tally and board equal `d1`; after the
  stopped batch they stay at the previous publication until the restart's refresh; the reversal brings
  them down and the reconfirmation back up.
- Payable: the history row (6,000 left), PAYING ADDRESS, and the 6,000-sat QR at the bound address;
  passive expiry on the ledger with no request sent (LEFT TO SEND reads EXPIRED, "< ADDRESS"
  disabled); the live freshness withdrawal and the withdrawn replies (no paying address, UNAVAILABLE);
  `socket.expired` with the expired replies (Lightning `expired`), the history keeping the invoice.
- The Factory booth with the current payable invoice: the sticks hidden while it is open (move stick
  reads 0,0), and on the in-world screen, by real touch on the phone and clicks on the desktop, "<
  ADDRESS" to the QR, RECEIPTS back to the ledger, "< ADDRESS" again and BACK, each answered as expected
  with the sticks still hidden; the sticks back after DONE, after Escape from the attract screen, after a
  tap beside the screen (walking away) and after leaving the scene. The phone's walk-away was checked
  in a second small run, because the first run's "beside" point fell outside a 390 px viewport (the
  booth correctly stayed open).
- No console errors or warnings. Gap: the phone's "history retained" screenshot shows the drawer
  folded; that state is evidenced by the recorded history (`PayableInv1` kept at revision 9), not the
  picture.

**Scoped browser validation.** `ONLY="signed-out donation" node test/run.mjs hub lab factory` (after
one `npm run build`): 470/470, exit 0, with the hub, lab and factory receipt-delivery extension passing
(9 bananas shown once for the two first credits, nothing more, the pile at 26 and the ledger at 0, the
tally ending as D1's).

These browser results were taken with the `5b05e90` fixture. Moving to `4deab73` changed no frontend
source, and every vector they used (`projection`, the payable replies and frames) is the same value in
`4deab73`, so they were not repeated.

**Pile probe (4deab73 vectors, served source, no build).** A small probe outside the repository fed the
`pile` section's messages, unmodified, to the hub through a stubbed donation socket and read the Bananas
panel and the scene after each step, advancing 90 frames each time. The figure and the scene's level
followed every revision (10, 11, 11, 11, 10, 11, 11, 13, 13: 13.5 drawn as 13), nothing moved between
messages and nothing landed. With no status frame, the note followed the pile's own health; with the
payable world's first-connect status first (`behind`, a different producer world's, deliberately left
stale), it stayed "behind" (see "Pile health" above). Evidence: `/tmp/obl-visual/final2/pile-probe.json`, `pile-probe-pile-only.json` and four
screenshots.

**The broad runs' stopped checks.** An earlier `npm test -- factory hub` gave 1005/1037 (many from a hung
and lost Chrome); the reruns gave Factory 538/539 and hub 950/973, and the runner stopped 22 checks that
failed twice (`untracked/test-ledger.json` keeps their evidence; none was fixed, rerun in place, marked
open or weakened). The maintainer has directed that unrelated scene failures not be the sole review
blocker, so the broad suites were not run again.

**Before-and-after comparison of the crew-related ones.** By the user's explicit exception to the
STOP rule ("you can resume tests under the repo rules", for one bounded comparison of the checks that
touch the changed crew, pile and shared-scene paths), six stopped groups were compared on the pre-PR
commit `f5b38586748f9d1f0659aeeb5127758cc830346b` and this branch: `hub distant effects` (its `hub
distant animations` record), `hub working arrival`, `chilling Ooga placement`, `hub round trip`, `lab
work rotation` and `gorilla work apron descent`. The worktree's own STOP ledger was not touched.

*First round, diagnostic only* (`/tmp/obl-compare`): one unfrozen run per side through `node
test/run.mjs hub` with those step names in `ONLY`. Its clock was the real `Date.now()` (the query's
`hour=12&day=80` sets the scene's clock, not the one `contributors` ages activity by), its randomness
unseeded, and it ran the global unit tier needlessly. Both sides failed the same five groups; it shows
those five fail before the PR, nothing more.

*Controlled round* (`/tmp/obl-controlled`, `manifest.json` there):

- Two fresh copies: `git archive` of the pre-PR commit, and this branch's working tree. The same three
  instrumentation patches to the copies' runner, each asserted to apply exactly once on both: the
  global unit tier off; one control script added to every session before its own init script and
  navigation; a guard that throws if any step outside the six, or any non-scene task, would run.
- The control script (SHA-256 `a3ce74d4…d9b7`), installed before any page script: `Date` from a fixed
  epoch (2026-11-06T17:00:00Z) advanced by elapsed `performance.now()`; `Math.random`,
  `crypto.getRandomValues` and `crypto.randomUUID` from one seeded mulberry32 stream (seed `0x5eed0b1`).
- Identical on both sides, by hash: the six selected steps' source, the inputs the pages read
  (`jumbotron-data.js`, `characters.js`, `contributors.js`, `math.js`, `scripts/characters.mjs`), each
  scene's query, `LANES=1`. The 11 hunks that differ between the two patched runners are all donation
  code.
- One run per side: 21/26 checks on both (exit 1 on both), the same pass/fail set, and the five
  failures' recorded details byte-identical on both sides. The round trip passed in all four of its
  sessions on both.

| Group | Pre-PR (controlled) | This branch (controlled) | Reading |
|---|---|---|---|
| hub distant animations | fail | fail, identical detail | same signature before the PR |
| working arrival | fail | fail, identical detail | same signature before the PR |
| chilling arrival | fail | fail, identical detail | same signature before the PR |
| lab work | fail | fail, identical detail | same signature before the PR |
| gorilla work apron descent | fail | fail, identical detail | same signature before the PR |
| hub round trip | pass ×4 | pass ×4 | its broad-run failure not reproduced on either side |

What this shows: under the same clock, seed, assertions and thresholds, the branch behaves identically
to the pre-PR commit on these six groups; the five failures carry the same signature before the PR.
What it does not: the random stream starts identically but how many draws happen before each step
depends on how many real animation frames run, so the two sides' streams are not guaranteed aligned
(their identical details suggest they were); real-frame timing was not controlled. The round trip's
failure in the broad run stays unresolved and unattributed. The intended change (Oogas no longer eat
from the pile) shows no difference in these checks, none of which measures the pile's level; the
probe's simulated pile (50 bananas) held at 50 over 30 s with an Ooga eating in every frame (before
this PR, eating took `EAT_RATE` from it by the source; that side was not measured). The other 16 stopped
checks (the Cloud Hopper camera and framing, hammock, jetpack, matrix, player stacking, guide,
canvas2d tour and `factory lifecycle`) exercise code this work doesn't touch and were not compared;
whether any of them is introduced remains unknown, and by the user's direction they are disclosed
rather than made the sole blocker.

**Coverage of the published PR's own changes.** The crew no longer eats from the pile, `pile.js`'s
`eatFromPile` and `setLevel` leave a real pile alone, `game.recordDonation` keeps no ledger in real
mode, and the director holds the API's pile. In real mode the existing signed-out donation check covers
these through the running app: the pile stays the API's (no frame moves it), a duplicate counts once,
and the page's ledger stays put; the receipt extension above adds the same for receipt frames. Not
covered by a suite check: the crew not eating from a simulated pile. The real-mode check can't show it
(the director rewrites the level every frame), the only suite check is the source-text `noDecay` one,
and a hub check that waits on an eating Ooga would lean on arrival behaviour that fails before this PR
too. The probe recorded it instead: the simulated pile held at 50 over 30 s with an eating Ooga in
every frame.
