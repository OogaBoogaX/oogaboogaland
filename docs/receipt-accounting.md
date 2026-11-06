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

The browser suite is not run for this work (standing stop). Coverage is `node test/run.mjs
donations-unit`, which runs the existing donation client checks and the receipt checks in Node VM
contexts and nothing else, plus `node --test worker/test/donations.test.mjs` for the Worker's
proxy. They cover underpayment, excess, split and repeat receipts, late receipts after expiry,
tiny receipts, mixed methods and several receipts in one transaction (distinct receipt ids),
duplicate, out-of-order and replayed frames, `invoiceStatus` frames, reconnect and gap recovery,
reload recovery for a signed-in donor, both status cursors and their 409/400 restarts, pending
and unpriced pricing, quarantine, reversal and reconfirmation, account switches, the
`payableAddress` QR rule, and the absence of clock decay. Visual layout of the new kiosk lines and panel rows is left to the
maintainer's play-test.

**Integrated contract validation is pending.** The page and the backend agreed on shared vectors
(`tests/fixtures/receipt-accounting-v1.json` and `tests/receipt-contract.test.mjs` in
bananapayserver, an emitter-equality fixture pinned at a committed SHA). That artifact does not
exist yet, so no check here validates against what the backend actually emits: the checks above
use synthetic frames and replies written from the contract text. When the fixture lands, a check
reading it at its pinned SHA joins `donations-unit`; until then that check is missing, not passed
and not skipped. The page has not run against a real receipt-accounting endpoint.
