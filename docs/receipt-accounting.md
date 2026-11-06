# Receipt accounting (#492): plan and client contract

Status: **plan only.** Nothing here is implemented yet. This is the Ooga Booga Land side of
[#492](https://github.com/OogaBoogaX/oogaboogaland/issues/492); the backend side lives in a
companion bananapayserver PR. The exact wire fields are **pending agreement** with that PR, so
every field name below is provisional and marked as such. This document does not authorize a
deployment, a wallet transaction, a credential or API-scope change, or activation of any
capability; each of those needs its own separate approval.

Out of scope: the virtual-host work (#467), the short-phone-drawer work (#491), the built
`oogaboogaland.html`, and any treasury or spending policy not settled below.

## What the page does today (rock at f5b38586)

The page counts **one donation per invoice**, keyed by the invoice id, and trusts the
server's pile minus a local hourly decay.

| Where | What it does | Why it matters for #492 |
|---|---|---|
| `src/js/donations.js:223` | A `donation` event is dropped when its `id` (the invoice id) is in the 64-entry `played` ring | A second real receipt on the same invoice would be dropped as a duplicate |
| `src/js/donations.js:282` | The socket reconnects with `after=<last invoice id>` | The replay cursor is an invoice, not a receipt |
| `src/js/donations.js:262` | `seen` carries cumulative `sats`, `due`, `left` for an invoice; it is neither kept nor replayed | After a reload or reconnect the page has no partial-payment state |
| `src/js/donations.js:136` | `waitFor`/`waited`: at most 16 invoices, page life only | No history across sessions |
| `src/js/donations.js:250`, `src/js/director.js:653`, `:844`, `:867` | The pile message carries `eatPerHour`; the director subtracts it every frame | Time-based decay, to be removed |
| `src/js/factory-kiosk.js:633-643` | `flow.receive` moves the kiosk to `paid` on the first `donation` for its invoice id | A partial receipt would close as full success once receipts are per payment |
| `src/js/factory-kiosk.js:648-662` | `flow.seen` replaces the QR with `bitcoin:<address>?amount=<left>` while something is left | Correct while open; after completion an amount-bearing QR invites a duplicate payment |
| `src/js/donation-popup.js:308-312` | The mainland popup closes on its invoice's `donation` | Same closing-on-first-event problem |
| `src/js/game.js:217` | `recordDonation` adds every event it is handed to the browser's local totals | Totals are correct only if every caller deduplicates first |
| `src/js/crew.js:5551-5556`, `src/js/pile.js:619-621`, scene `onDonation`s | Eating, reloading and donations change `world.level` locally | In real mode the director overwrites `world.level` from the server every frame, so these are visual only; the invariant is implicit and must become explicit |
| `worker/src/donations.js` | Passes `/donations/*` on and names the donor as `{ id, login }` from the session | The numeric GitHub id is already the stable owner; the handle is display text |

The production note in `docs/cloudflare-setup.md` (`PILE_EAT_PER_HOUR=0`) records a past
configuration. It is not verification of today's live setting.

## Invariants (maintainer direction)

1. **Attribution follows the address.** Every on-chain sat actually received at an address
   issued for an invoice (partial, excess, split, repeated, late, after expiry or after
   completion) is attributed permanently to that invoice's original owner. This is a
   bookkeeping **policy, not proof of who sent it**, and the page never says otherwise.
2. **Receipt identity deduplicates.** Ownership, effects (toasts, animations, totals) and
   history are keyed by a receipt id, never by the invoice id. One invoice can have many
   receipts; one receipt is counted once however often it is delivered.
3. **Ownership is the account, not the handle.** A signed-in owner is the backend's stable
   account id. An editable handle never moves ownership, and a tab that merely receives a
   notice never claims it.
4. **States are distinct.** At least *observed* (seen, unconfirmed), *credited* (counted),
   *quarantined* (discrepancy, not counted as reconciled) and *reversed* (auditable
   correction of an earlier credit). A partial confirmed receipt never closes as a full
   success.
5. **No time decay anywhere.** Not in the backend's pile, not in the page's extrapolation, not
   in defaults, docs or tests.
6. **Gameplay never touches funds.** Eating, reloading, ammunition and delivery animations
   may change what is drawn; they never change the authoritative pile, lifetime totals or any
   record, and never send anything.
7. **Lifetime is not remaining.** Lifetime donor credit (receipts, rank, history) is separate
   from the remaining pile. Spending never reduces a donor's lifetime figures.
8. **Deductions come only from backend records.** Future spend-based pile changes arrive as
   backend-authoritative, traceable records. The page never computes, forges or caches a
   balance of its own in real mode.
9. **Honest monitoring claims.** The page never promises permanent or complete monitoring of
   an address until the backend verifies it; it shows stale or unreconciled state as such.
10. **Old backends keep working.** The new behaviour is gated on a capability the backend
    advertises; without it the page keeps today's invoice-level behaviour, minus decay.

## Client contract (semantic; field names pending)

What the page needs from the backend, independent of spelling. The companion PR proposes
the exact shapes; this section changes to match once agreed.

**Capability.** The socket's `status` (or `/api/me`) names a receipt capability, for example
`features: ["receipts-v2"]` *(name pending)*. The page switches modes only on that word. In
receipt mode it ignores legacy invoice-level `donation` events for counting and animation, so
an old notice can never double-credit a new receipt.

**Receipt** *(fields pending)*: an opaque `receiptId` stable across retries, restarts and
reconfirmation; the `invoiceId` it is attributed to; `method` (`onchain` or `lightning`);
actual `sats`; `state` (observed, credited, quarantined, reversed, and whatever finer
backend states map onto these); the attribution snapshot (handle, message under the message
bar, verified flag) taken from the invoice; the banana value and rate frozen once at
attribution, never repriced; times; and a monotonic sequence or revision for ordering and
replay. The public feed must not carry txids, output indexes, addresses or account ids:
linking a handle to an on-chain output would publish the donor's wallet.

**Invoice status** *(fields pending)*: authoritative and revisioned, cumulative per invoice:
`due`, observed `received`, `credited`, `remaining` (what is still asked for, network fee
included), whether the invoice is complete, its receipts, the issued address(es), and a
revision that only increases. The page replaces its view with each newer revision and never
sums messages it happened to see. Delivered only to the invoice's owner: the in-session page
by its `request` key, a signed-in owner by account.

**History** *(endpoint pending)*: a signed-in owner's invoices, addresses and receipts across
sessions, read through OBL's Worker with the session's account id, exactly as invoice
creation already passes `{ id, login }`. Signed-out recovery is a policy gate (below).

**Pile and totals** *(fields pending)*: the remaining pile as a value with its revision and
its basis (reconciled as of a time, or stale/unreconciled); lifetime totals, board and tally
as today, built from credited receipts. No `eatPerHour`. Pending activity is shown apart
from the pile, never folded into it.

**Replay.** The reconnect cursor is the last receipt sequence, not an invoice id. On every
(re)connect and page load the page asks for, or is sent, current snapshots (pile, totals,
recent receipts, and its own invoice statuses) before applying live events.

## Page work, in order

Each step is small, keeps legacy behaviour without the capability, and lands with its
Node-level checks.

1. **Remove decay.** `donations.js` accepts a pile message with or without `eatPerHour` and
   ignores it; the director shows the last authoritative value, never extrapolated. Docs and
   test fixtures that mention `eatPerHour` are updated, not weakened.
2. **Receipt dedupe.** In receipt mode `donations.js` dedupes and replays by receipt id and
   sequence in bounded structures; `game.recordDonation` is called once per credited receipt.
   Legacy mode keeps the invoice-id ring.
3. **Kiosk and popup states.** Both are driven by invoice status, not by the first event:
   - open with nothing received: today's Lightning or on-chain QR;
   - partially received or credited: *received X, credited Y, Z still to send*, the same
     address, and an amount-bearing QR for Z only while the invoice is open; no success screen;
   - complete: the success screen and the cooker, **with no amount-bearing QR**; the address
     stays visible and copyable with a plain note that further payments to it are credited
     to this invoice's donor after confirmation (wording reviewed; no sender claim, no
     permanent-monitoring promise);
   - later receipts after completion or expiry: shown as their own receipts on the same
     invoice;
   - quarantined or reversed: shown as such, never as credited.
4. **Feeds and effects.** Recent list, board, tally, toasts and delivery animations take one
   entry and one animation per credited receipt; a later receipt to the same address shows
   the invoice's original attribution. Replays and other tabs never duplicate an effect or
   reassign ownership.
5. **Reload and reconnect.** Snapshots refresh state on load and on every reconnect; the
   page-life `waiting` set gives way to backend status and history.
6. **Remaining versus lifetime.** The Bananas panel and pile label show the remaining pile
   separately from all-time donations, and say when the pile is stale or unreconciled.
7. **Gameplay isolation.** In real mode the drawn pile is a view of the authoritative value;
   scene additions, eating and reload consumption stay visual, and a check pins that they
   never change the authoritative value or produce a request.
8. **Docs.** `AGENTS.md`'s donation lines, `docs/cloudflare-setup.md`'s decay note and this
   document follow the agreed contract.

## Rollout and rollback

- Order: the page first (it understands both modes and has no decay), then the backend's
  migration, then the backend advertises the capability. The page never turns receipt mode on
  by itself.
- Rollback: the backend stops advertising the capability and the page falls back to
  invoice-level behaviour. Records the backend keeps are its concern; the page holds no
  balance to roll back.
- Staging (signet) and fixtures first. Activation on either Worker is a separate, explicit
  decision; this PR deploys nothing.

## Limits to state honestly

- The page shows what the backend reports. It cannot verify a receipt, a confirmation or a
  balance, and it labels reconciliation that is stale or unavailable instead of presenting a
  live balance.
- Address monitoring today follows BTCPay's invoice monitoring and the relay's windows (open
  invoices checked each minute, only the last 24 hours reloaded after a restart, unpaid
  attribution records expiring after seven days by default, per the issue). Payments outside those windows may be missed until the backend's
  reconciliation exists and is verified on the real installation. The page makes no stronger
  claim.
- Historical receipts without retained evidence stay unattributed or await reviewed
  reconciliation; the page never guesses an owner.

## Policy gates (blocked until the maintainer decides)

From the issue, unchanged and not decided here:

1. **Treasury boundary.** Whether moves between our own wallets, cold storage, Lightning and
   channels (opens, closes, splices, swaps, rebalances, liquidity purchases) are internal
   transfers or spending, and how their fees are separated.
2. **Spend-to-banana valuation.** Original recorded value, spending-time price or another
   rule; lot allocation, rounding, missing prices, negative balances.
3. **Starting inventory.** How existing wallet funds, the current pile, imports, unattributed
   and already-spent funds reconcile at cutover.
4. **Confirmation thresholds.** For crediting receipts and for deductions, and what shows
   while pending or while reconciliation is unavailable.
5. **Attribution presentation.** How repeat payments inherit handle and message, and what
   signed-in and signed-out donors can recover later.

Raised by this plan, also undecided:

6. **Signed-out recovery.** Today the `request` key stays in memory only. Durable signed-out
   history needs a decision on what, if anything, is kept in localStorage and what it may read.
7. **After completion.** Whether the reusable address is shown as text only (the plan's
   default) or also as a bare-address QR.
8. **Board grouping.** The board combines matching handles across accounts and guests. That
   is a presentation choice, separate from ownership; whether it changes is open.
9. **Capability name and exact fields.** Pending the backend PR.

Until gates 1–3 are settled, no spend deduction, internal-transfer rule or conversion is
implemented on either side.

## Testing constraints

The browser suite (`npm test`, `npm run test:full`, any scene or Hub session) is **not run**
for this work under the current standing stop. Allowed: `npm run build`, `node --check` on
touched files, and focused Node-level unit or contract checks of pure functions. No check is
weakened or skipped; existing donation checks in `test/run.mjs` that assume invoice-level
events or `eatPerHour` are updated to the new rule in the same change that moves the rule,
and browser verification is left to the maintainer's play-test.

Cases the checks must cover (from the issue's acceptance list, page side): underpayment,
excess, split payments, repeated payment after completion, late payment after expiry, mixed
methods, a receipt below the minimum, duplicate and out-of-order delivery, reconnect and
reload mid-invoice, quarantine and reversal, and no full-success screen on a first partial
receipt.
