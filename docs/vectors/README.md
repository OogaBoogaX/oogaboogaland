# Shared contract vectors

Bytes another repository produced and this page is checked against. Never edit them here: a change
comes from the producing repository at a new commit, copied byte for byte, with the pins below and
in `test/run.mjs` (`RECEIPT_VECTORS`) moved together.

## `receipt-accounting-v1.json`

| | |
|---|---|
| Repository | [OogaBoogaX/bananapayserver](https://github.com/OogaBoogaX/bananapayserver) |
| Commit | `4deab73fc44665a50b81d5975ba1e1d3e9095cfc` (signed; GitHub reports its signature verified) |
| Path there | `tests/fixtures/receipt-accounting-v1.json` |
| Git blob | `ea150c32795b997d2ca431cd5aeb80953491de62` |
| Size | 81803 bytes |
| SHA-256 | `cbeb711339e7feb84c6526e43c5f9771e6d27be336ad8b9d9c694ec2b455baea` |

Fetched from that exact commit through GitHub's contents API (`?ref=<commit>`, raw), never from a
working copy, and checked against the blob id, size and hash above. `node test/run.mjs
donations-unit` refuses any other size or hash.

It replaces the fixture from commit `5b05e909bba65339a268ec2e9907749748570ab4` (62510 bytes, SHA-256
`2a15bfe5…69216`), which replaced `a12cc5f874d15a57cac1feef45357f0eaea40313` (34966 bytes, SHA-256
`d84d7540…d8696`) and the core-only `ea14695d81bdf4d305f15b237c825fbfa34774c6` (10750 bytes, SHA-256
`f53a5328…ed699`). Against `5b05e90`: `note`, the core `vectors` and `projection` are the same values;
`endpoints.socket.liveFirstCredit` gains the pile message that follows the credit; `payable` gains the
producer's recorded socket requests, its first connect, and an early page's connect, live detection,
gap and current reconnects with the replies of that moment; and `pile` is new.

What it holds:

- **`vectors` (core-only):** public receipt and invoiceStatus frames and pile messages as
  bananapayserver's ledger and pile emit them from a synthetic scenario, every feed frame shown as
  replayed (`replay: true`); the raw replay results its feed builds (`frames`, `after`, `through`,
  `complete`, no socket `type`); and raw private-status cores without the fields the endpoint wrapper
  adds. Those replay results are not the socket's markers and the cores are not endpoint replies; the
  page's check feeds them as they are and expects them refused as such.
- **`endpoints` (`read-endpoints`):** what bananapayserver's real front door answers, `{ status, body }`
  each, for synthetic receipt-mode invoices: `POST /donations/status` (a first page, a receipts page
  and an addresses page on their cursors, 404 `unknown`, 400 `cursor`, 409 `resync`, 503 `closed` for
  metadata it can't state), `POST /donations/history` (a page, its next page, 401 `signin`, 503
  `closed`), `POST /donations/invoice` with `accounting: 1` while receipt mode is closed (503), and the
  socket's messages on a first connect, on a replay from zero, and for a live first credit. Its own note
  says what it does not prove: provider ingestion, D1 projection, reconciliation and any consumer's
  parsing. Issuance is off in it, and no status reply in it names a payable address.
- **`projection` (`projection-publication`):** what an open page's socket hears when the D1 projection
  publishes lifetime figures (receipt, board and tally messages), each with `d1`, the lifetime tally D1
  holds afterwards: a first credit, a durable batch whose refresh never went out, the refresh a
  restart sends, the same refresh repeated, a reversal and a reconfirmation at the frozen price.
- **`payable` (`read-endpoints-payable`):** the positive payable path through the real front door,
  object and socket for a synthetic snapshot: a status and history naming a bound regtest address and
  6,000 sats left while fresh, the live withdrawal past the freshness bound and the replies after it,
  a reconnect too far behind (the gap marker) and one from the current cursor, and the invoice past
  its expiry with Lightning expired. It records each socket request the producer answered
  (`socket.requests`, and a `request` on each connect sequence), its first connect (`initialConnect`,
  whose marker is `through: null`), and an early page that connects, hears the detection (seq 1),
  drops, and reconnects from cursor 1 (`earlyGap`: through 4, incomplete) and then 4 (`earlyCurrent`),
  with the status and history of that moment (`atEarlyGap`). Issuance stays off and no BOLT11 is
  verified, so no vector holds an issuance reply or an available Lightning code.
- **`pile` (`anchored-pile`):** the pile messages an open page hears as receipts move an anchored pile:
  on connect, a credit read behind and then current, the receipt in review (its credit uncertain), its
  reversal and reconfirmation, nothing while a second credit is bridged before a stop, the next start's
  recovery heard by the surviving page, and a page connecting after. The anchor is applied by the
  producer's test as an operator would; no endpoint applies it.

The page's check (`donationContractChecks` and `donationEndpointChecks` in `test/run.mjs`) feeds every
reply and socket message as these bytes, unchanged, and checks each socket request the page makes
against the producer's recorded one where the fixture records it. Its own setup is only which invoice
and account are asked for, and the page's clock (from the fixture's own times).
