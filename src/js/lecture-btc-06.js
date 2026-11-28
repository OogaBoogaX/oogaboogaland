// Bitcoin from First Principles, lecture 6: a block as a page of the ledger (a batch of transactions under an 80-byte header), the header's six fields, the Merkle root that commits it to every transaction, the previous-block hash that makes a chain, the genesis block and height, how a light client checks that a payment is in with headers and a short proof (and what that leaves unchecked), and the limit on a block, counted as weight.
(() => {
  "use strict";
  window.BL.lectures.add({
    id: "btc-06", course: "first-principles", n: 6, title: "Blocks and the Chain",
    reading: [
      { title: "Bitcoin: A Peer-to-Peer Electronic Cash System", by: "Satoshi Nakamoto, 2008: sections 3, 7 and 8" },
      { title: "Bitcoin Developer Guide: Block Chain", by: "developer.bitcoin.org" }
    ],
    sources: [
      "Satoshi Nakamoto, Bitcoin: A Peer-to-Peer Electronic Cash System (2008), sections 3 (Timestamp Server), 7 (Reclaiming Disk Space) and 8 (Simplified Payment Verification), https://bitcoin.org/bitcoin.pdf and https://nakamotoinstitute.org/library/bitcoin/",
      "Bitcoin Developer Reference, Block Chain: block headers, block versions, merkle trees and the serialized block, https://developer.bitcoin.org/reference/block_chain.html",
      "Bitcoin Developer Guide, Block Chain: block height, the chain of header hashes and merkle trees, https://developer.bitcoin.org/devguide/block_chain.html",
      "Bitcoin Developer Guide, Operating Modes: simplified payment verification and its weaknesses, https://developer.bitcoin.org/devguide/operating_modes.html",
      "Eric Lombrozo, Johnson Lau and Pieter Wuille, BIP 141: Segregated Witness (Consensus layer), for block weight, https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki",
      "Gavin Andresen, BIP 34: Block v2, Height in Coinbase, https://github.com/bitcoin/bips/blob/master/bip-0034.mediawiki",
      "Bitcoin Core, Segregated Witness Benefits (26 January 2016), for why witness data is counted at a lower rate, https://bitcoincore.org/en/2016/01/26/segwit-benefits/",
      "Bitcoin Wiki, Genesis block, https://en.bitcoin.it/wiki/Genesis_block",
      "The chain's own data, read from mempool.space on 16 November 2026: block 0, https://mempool.space/block/000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f, block 1, https://mempool.space/block/00000000839a8e6886ab5951d76f411475428afc90947ee320161bbf18eb6048, block 481,824 (24 August 2017), https://mempool.space/block/0000000000000000001c8018d9cb3b742ef25114f27563e3fc4a1902167f9893, and the height that day, 976,175"
    ],
    sections: [
      { id: "ledger-pages", title: "Pages of the Ledger", topics: ["block", "batch of transactions", "header", "why blocks", "order of payments"],
        beats: [
          { slide: { k: "title", kicker: "Lecture 6", title: "Blocks and the Chain", sub: "Headers, Merkle roots and proof that a payment is in" },
            at: "lectern", g: "open",
            say: [
              "Welcome back.",
              "Last time we looked closely at locks.",
              "Every coin, we saw, sits under a small program that says what must be shown before it can be spent.",
              "Put that together with lecture 4 and you can read a whole transaction: coins in, coins out, and a lock on each new coin.",
              "But a ledger is more than a heap of valid transactions.",
              { s: "A ledger needs an order, and it needs to be awkward to change after the fact.", g: "count" },
              { s: "So today we bind the loose transactions into pages, and the pages into a book.", g: "lean" }
            ] },
          { slide: { k: "points", title: "Today: pages and their binding", start: 0, points: [
              "A block: a batch of transactions under a header",
              "The header's six fields, in 80 bytes",
              "One root that commits to every transaction",
              "Each header names the one before it",
              "Proving a payment is in, with headers alone",
              "How big a page may be"
            ] },
            at: "centre", g: "open",
            say: [
              { s: "First, what a block is: a batch of transactions with a small label on top, called the header.", show: 1 },
              { s: "Then we open that header and go through its six fields, one at a time.", show: 2 },
              { s: "We will see how a single fingerprint in the header stands for every transaction on the page.", show: 3 },
              { s: "We will see how each header names the one before it, which is what turns a pile of pages into a chain.", show: 4 },
              { s: "Then comes my favourite part: how a phone can check that a payment is in the ledger without holding the ledger.", show: 5, g: "up" },
              { s: "And we end with a plain question: how big is a page allowed to be?", show: 6 }
            ] },
          { slide: { k: "figure", title: "A block is a page of the ledger", ops: [
              { box: [50, 18, 60, 9], t: "transaction 1", at: 1 },
              { box: [50, 28, 60, 9], t: "transaction 2", at: 1 },
              { box: [50, 38, 60, 9], t: "transaction 3", at: 1 },
              { text: "... and a few thousand more", x: 80, y: 51, a: "c", size: 4, c: "grey", at: 1 },
              { text: "the batch", x: 45, y: 33, a: "r", size: 4, c: "grey", at: 1 },
              { box: [50, 4, 60, 12], t: "header", c: "amber", fill: true, at: 2 },
              { text: "80 bytes", x: 115, y: 10, size: 4, c: "amber", at: 2 },
              { text: "one page = header + batch", x: 80, y: 60, a: "c", size: 4.5, at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "Think of the ledger as a bound book, and of a block as one page of it.",
              "Most of the page is a list of transactions, often a few thousand of them, written one after another.",
              "On top sits the header, a label of exactly 80 bytes that describes the page.",
              { s: "Eighty bytes is very little: the sentence I am speaking now would take more room than that if you typed it out.", g: "pinch" },
              "Everything that makes a block a block lives in those 80 bytes, and the transactions hang underneath."
            ] },
          { at: "centre", g: "open",
            say: [
              { s: "Why batch at all, rather than add payments to the ledger one by one?", g: "shrug" },
              "Because the network needs moments when everyone can say: this much is settled, and in this order.",
              "A page gives us that, since everything on page 500 comes after everything on page 499.",
              "A new page is added about every ten minutes, and how it is held at ten minutes is a story for next time.",
              { s: "Today I care only about the page as an object: what is written on it, and what holds it in place.", g: "chop" }
            ] }
        ] },

      { id: "header-fields", title: "Eighty Bytes: The Header", topics: ["block header", "version", "timestamp", "bits", "nonce", "block hash", "header fields"],
        beats: [
          { slide: { k: "section", title: "Eighty Bytes: The Header", sub: "Six fields, and what each one is for" },
            at: "lectern", g: "open",
            say: [
              "Let us open the label.",
              "A header has six fields, always in the same order and always the same size.",
              "There are no optional extras and nothing of variable length, which is why every header ever made is exactly 80 bytes.",
              { s: "I will draw them first, and then we will sort them out.", g: "point" }
            ] },
          { board: { clear: true, title: "The header: six fields, 80 bytes", ops: [
              { text: "bytes", x: 26, y: 5, a: "r", size: 4, c: "grey", at: 0 },
              { text: "4", x: 26, y: 14.5, a: "r", size: 5, c: "grey", at: 1 },
              { box: [30, 10, 60, 9], t: "version", at: 1 },
              { text: "which rules", x: 94, y: 14.5, size: 4, c: "grey", at: 1 },
              { text: "32", x: 26, y: 25.5, a: "r", size: 5, c: "grey", at: 2 },
              { box: [30, 21, 60, 9], t: "previous block hash", c: "blue", at: 2 },
              { text: "the page before", x: 94, y: 25.5, size: 4, c: "blue", at: 2 },
              { text: "32", x: 26, y: 36.5, a: "r", size: 5, c: "grey", at: 3 },
              { box: [30, 32, 60, 9], t: "Merkle root", c: "amber", at: 3 },
              { text: "every transaction", x: 94, y: 36.5, size: 4, c: "amber", at: 3 },
              { text: "4", x: 26, y: 47.5, a: "r", size: 5, c: "grey", at: 4 },
              { box: [30, 43, 60, 9], t: "time", at: 4 },
              { text: "seconds since 1970", x: 94, y: 47.5, size: 4, c: "grey", at: 4 },
              { text: "4", x: 26, y: 58.5, a: "r", size: 5, c: "grey", at: 5 },
              { box: [30, 54, 60, 9], t: "bits", at: 5 },
              { text: "how hard to make", x: 94, y: 58.5, size: 4, c: "grey", at: 5 },
              { text: "4", x: 26, y: 69.5, a: "r", size: 5, c: "grey", at: 6 },
              { box: [30, 65, 60, 9], t: "nonce", at: 6 },
              { text: "free to change", x: 94, y: 69.5, size: 4, c: "grey", at: 6 },
              { line: [14, 77, 28, 77], at: 7 },
              { text: "80", x: 26, y: 83, a: "r", size: 6, c: "green", at: 7 }
            ] },
            say: [
              "Here is the header as a column of six slots, with the size of each, in bytes, on the left.",
              "First come four bytes for a version number, which says which set of rules this block claims to follow.",
              "Second, 32 bytes hold the fingerprint of the header before this one, and that is the link that makes a chain.",
              "Third, another 32 bytes hold the Merkle root, a single fingerprint that stands for every transaction on the page.",
              "Fourth, four bytes give the time, counted in seconds since the first of January 1970.",
              "Fifth, four bytes that we call bits state how hard this block had to be to make.",
              "And sixth, four bytes called the nonce hold a number with no meaning at all, which the block's maker is free to change.",
              { s: "Four, and 32, and 32, and then three more fours: 80 bytes.", g: "count" }
            ] },
          { slide: { k: "table", title: "What each field is for", head: ["Field", "Bytes", "What it is for"], rows: [
              ["version", "4", "which rules apply"],
              ["previous block hash", "32", "links to the page before"],
              ["Merkle root", "32", "pins every transaction"],
              ["time", "4", "when it was made"],
              ["bits", "4", "how hard it had to be"],
              ["nonce", "4", "a free number to vary"]
            ], note: "Bitcoin developer reference: the block header" },
            at: "left", g: "open",
            say: [
              "Let me sort the six into two groups.",
              { s: "Version, time and bits are housekeeping: which rules, what time, how hard.", g: "count" },
              "The time is the block maker's own clock reading, and the network checks it only loosely.",
              "It must be later than the middle value of the previous 11 blocks' times, and a node rejects a block stamped more than two hours ahead of its own clock.",
              "So a block's time is good to within an hour or two, not to the second.",
              "Bits and the nonce belong to mining, and I will leave both sealed until lecture 7.",
              { s: "That leaves the two 32-byte fields, and those two are the heart of today's lecture.", g: "pinch" }
            ] },
          { slide: { k: "figure", title: "A block's name is its header's hash", ops: [
              { box: [4, 16, 48, 14], t: "header: 80 bytes", c: "amber" },
              { arrow: [54, 23, 66, 23], at: 1 },
              { box: [68, 16, 30, 14], t: "SHA-256", c: "blue", fill: true, at: 1 },
              { text: "twice", x: 83, y: 35, a: "c", size: 4, c: "grey", at: 1 },
              { arrow: [100, 23, 110, 23], at: 2 },
              { text: "000000...8ce26f", x: 112, y: 23, size: 5, c: "green", mono: true, at: 2 },
              { text: "the block hash", x: 133, y: 31, a: "c", size: 4, c: "grey", at: 2 },
              { text: "in: the header only, not the transactions", x: 80, y: 45, a: "c", size: 4.5, at: 3 },
              { text: "the hash is written nowhere inside the block", x: 80, y: 53, a: "c", size: 4.5, c: "red", at: 4 }
            ], note: "The hash shown is the first block's, shortened in the middle." },
            at: "screen", g: "point",
            say: [
              "Now, where does a block get its name?",
              "Take the 80 bytes of the header and put them through SHA-256, the fingerprint machine from lecture 2, twice over.",
              "The 32 bytes that come out are the block hash, and that hash is the block's name everywhere in the system.",
              "Notice what went into the machine: the header only, never the long list of transactions underneath.",
              { s: "And notice that the hash is written nowhere inside the block itself, because a thing cannot contain its own fingerprint.", g: "lean" },
              "Anyone holding the header can work the name out afresh, so nobody has to be trusted to supply it."
            ] },
          { say: ["Let me check that before we go further.", "What goes into the hash that gives a block its name?"],
            quiz: {
              q: "What goes into the hash that gives a block its name?",
              options: [
                "Every transaction in the block, in full",
                "The name of whoever made the block",
                "Only the nonce and the time",
                "The 80-byte header, and nothing else"
              ],
              answer: 3,
              right: ["Yes: 80 bytes in, one name out, and the transactions are not hashed again."],
              wrong: [
                ["The transactions are not fed in directly, however many there are.", "Only the 80-byte header is hashed, and it carries one fingerprint that stands for them all."],
                ["A header has no field for its maker's name at all.", "The block hash is the fingerprint of the 80-byte header, and nothing else."],
                ["Those are two of the six fields, but the hash covers all six.", "The whole 80-byte header goes in, and nothing else."],
                null
              ]
            } }
        ] },

      { id: "merkle-root", title: "One Root for Every Transaction", topics: ["merkle root", "merkle tree", "transaction id", "commitment", "odd number of transactions", "changing a transaction"],
        beats: [
          { slide: { k: "section", title: "One Root for Every Transaction", sub: "How 32 bytes pin down a whole page" },
            at: "lectern", g: "open",
            say: [
              "That answer leaves us with a puzzle.",
              "If only the header is hashed, what stops someone swapping a transaction on the page and keeping the same header?",
              { s: "The answer is the third field, the Merkle root.", g: "point" },
              "You met the Merkle tree in lecture 2, so today we put it to work."
            ] },
          { board: { clear: true, title: "A page of four transactions", ops: [
              { box: [10, 68, 26, 11], t: "ID of A", at: 1 },
              { box: [48, 68, 26, 11], t: "ID of B", at: 1 },
              { box: [86, 68, 26, 11], t: "ID of C", at: 1 },
              { box: [124, 68, 26, 11], t: "ID of D", at: 1 },
              { path: [23, 68, 42, 53, 61, 68], c: "grey", at: 2 },
              { box: [29, 42, 26, 11], t: "A + B", c: "blue", at: 2 },
              { path: [99, 68, 118, 53, 137, 68], c: "grey", at: 2 },
              { box: [105, 42, 26, 11], t: "C + D", c: "blue", at: 2 },
              { path: [42, 42, 80, 27, 118, 42], c: "grey", at: 3 },
              { box: [60, 16, 40, 11], t: "Merkle root", c: "amber", at: 4 },
              { arrow: [102, 21, 116, 21], c: "amber", at: 5 },
              { text: "into the header", x: 118, y: 21, size: 4, c: "amber", at: 5 }
            ] },
            say: [
              "Suppose a small block with just four transactions, which I will call A, B, C and D.",
              "Each transaction already has a fingerprint of its own, its transaction ID, so we start with four of those.",
              "Pair them up and hash each pair together: A with B, and C with D.",
              "Now we have two fingerprints, so we pair those and hash again.",
              "One fingerprint is left, and that is the Merkle root.",
              { s: "Those 32 bytes go into the header, and the header is what gets hashed into the block's name.", g: "point" }
            ] },
          { slide: { k: "figure", title: "Change one payment, change the name", ops: [
              { box: [2, 18, 34, 12], t: "C altered", c: "red", at: 1 },
              { text: "transaction", x: 19, y: 35, a: "c", size: 3.5, c: "grey", at: 1 },
              { arrow: [38, 24, 46, 24], c: "red", at: 2 },
              { box: [48, 18, 28, 12], t: "new ID", c: "red", at: 2 },
              { text: "its fingerprint", x: 62, y: 35, a: "c", size: 3.5, c: "grey", at: 2 },
              { arrow: [78, 24, 86, 24], c: "red", at: 3 },
              { box: [88, 18, 30, 12], t: "new root", c: "red", at: 3 },
              { text: "in the header", x: 103, y: 35, a: "c", size: 3.5, c: "grey", at: 3 },
              { arrow: [120, 24, 128, 24], c: "red", at: 4 },
              { box: [130, 18, 28, 12], t: "new name", c: "red", fill: true, at: 4 },
              { text: "block hash", x: 144, y: 35, a: "c", size: 3.5, c: "grey", at: 4 },
              { text: "one changed digit shows at the very top", x: 80, y: 52, a: "c", size: 4.5, at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "Now try to cheat.",
              "Go into the page and alter transaction C, say by changing who gets paid.",
              "Its transaction ID is a fingerprint of its contents, so the ID changes completely.",
              "That ID fed the pair above it, and the pair fed the root, so the root changes too.",
              "The root sits in the header, so the header has changed, and the block now hashes to a different name.",
              { s: "One altered digit, anywhere on the page, shows up at the very top.", g: "pinch" },
              "That is what we mean when we say the header commits to its transactions: it pins them down without containing them."
            ] },
          { slide: { k: "points", title: "Details of the tree", start: 0, points: [
              "Order counts: swap two transactions, new root",
              "Odd one out: it is paired with a copy of itself",
              "One transaction only: its ID is the root",
              "Any number of transactions, still 32 bytes"
            ] },
            at: "right", g: "count",
            say: [
              { s: "A few details, because the tree has to work for any page, and not only for my tidy page of four.", g: "open" },
              { s: "The order matters: swap two transactions and the pairs change, so the root changes.", show: 1 },
              { s: "If a row has an odd number of fingerprints, the last one is simply paired with a copy of itself.", show: 2 },
              { s: "If the block holds a single transaction, there is nothing to pair, and that transaction's ID is the root.", show: 3 },
              { s: "And whether the page holds one transaction or 5,000, the root is always 32 bytes and the header is always 80.", show: 4, g: "wide" },
              "By the way, the first transaction on every page is a special one that pays the block's maker, and it too waits for lecture 7."
            ] },
          { at: "left", g: "open",
            say: [
              "You may fairly ask why we bother with a tree.",
              "Hashing the whole list in one go would also give a fingerprint that changes if anything changes.",
              { s: "It would, but then the only way to check one transaction would be to fetch them all.", g: "weigh" },
              "The tree gives us something a flat fingerprint cannot: a short proof that one transaction is in the block.",
              "Hold that thought, because it is the best trick of the day, and we will come to it once we have a chain."
            ] },
          { say: ["A quick test of the root first.", "Somebody alters one transaction in a block: what must change in the header?"],
            quiz: {
              q: "One transaction in a block is altered. What must change in the header?",
              options: [
                "Only the time field has to be updated",
                "It grows by 32 bytes to hold a new fingerprint",
                "Its Merkle root, and so the block's hash",
                "Nothing, because the header holds no transactions"
              ],
              answer: 2,
              right: ["Right: the change climbs the tree to the root, and the root is in the header."],
              wrong: [
                ["The time field says nothing about what is on the page.", "It is the Merkle root that no longer matches, and that changes the block hash."],
                ["A header never grows: it is 80 bytes whatever happens.", "The root inside it comes out different, and so the block hash changes."],
                null,
                ["The header holds no transactions, but it does hold their root.", "A changed transaction means a different Merkle root, and so a different block hash."]
              ]
            } }
        ] },

      { id: "the-chain", title: "Each Page Names the Last", topics: ["previous block hash", "chain of blocks", "tamper evidence", "timestamp server", "changing an old block"],
        beats: [
          { slide: { k: "section", title: "Each Page Names the Last", sub: "The 32 bytes that make a chain" },
            at: "lectern", g: "open",
            say: [
              "So one page is sealed: touch any transaction, and the page's name changes.",
              "Now for the other 32-byte field, and it is the simplest idea in the lecture.",
              { s: "Every header contains the hash of the header before it.", g: "pinch" },
              "Page 500 begins, in effect, by writing down the name of page 499."
            ] },
          { slide: { k: "quote", text: "Each timestamp includes the previous timestamp in its hash, forming a chain, with each additional timestamp reinforcing the ones before it.", by: "Satoshi Nakamoto, Bitcoin whitepaper, section 3, 2008" },
            at: "centre", g: "open",
            say: [
              "The whitepaper says it in one sentence, in a section about putting a date stamp on data.",
              { s: "Read timestamp as block, and you have the design.", g: "point" },
              "Each block includes the previous block in its hash, and that forms a chain.",
              "The last phrase is the one to underline: each new block reinforces the ones before it.",
              "Let me draw why."
            ] },
          { board: { clear: true, title: "Three pages, linked by name", ops: [
              { text: "block 499", x: 27, y: 15, a: "c", size: 4.5, at: 1 },
              { box: [6, 20, 42, 30], at: 1 },
              { text: "prev  02d8", x: 27, y: 28, a: "c", size: 4, c: "grey", mono: true, at: 1 },
              { text: "root, time ...", x: 27, y: 40, a: "c", size: 3.5, c: "grey", at: 1 },
              { text: "name  a41f", x: 27, y: 57, a: "c", size: 4.5, c: "blue", mono: true, at: 1 },
              { text: "block 500", x: 80, y: 15, a: "c", size: 4.5, at: 2 },
              { box: [59, 20, 42, 30], at: 2 },
              { text: "prev  a41f", x: 80, y: 28, a: "c", size: 4, c: "blue", mono: true, at: 2 },
              { arrow: [59, 28, 49, 28], c: "blue", at: 2 },
              { text: "root, time ...", x: 80, y: 40, a: "c", size: 3.5, c: "grey", at: 3 },
              { text: "name  9c07", x: 80, y: 57, a: "c", size: 4.5, c: "amber", mono: true, at: 3 },
              { text: "block 501", x: 133, y: 15, a: "c", size: 4.5, at: 4 },
              { box: [112, 20, 42, 30], at: 4 },
              { text: "prev  9c07", x: 133, y: 28, a: "c", size: 4, c: "amber", mono: true, at: 4 },
              { arrow: [112, 28, 102, 28], c: "amber", at: 4 },
              { text: "root, time ...", x: 133, y: 40, a: "c", size: 3.5, c: "grey", at: 4 },
              { text: "every name is built on the name before", x: 80, y: 76, a: "c", size: 5, c: "green", at: 5 }
            ] },
            say: [
              "Here are three pages in a row, and I will give them short made-up names so that they fit on the board.",
              "Block 499 has a header, and that header hashes to a name: say it ends in a41f.",
              "Block 500's header carries that name in its previous-block field.",
              "Then block 500 gets a name of its own, 9c07, which is the fingerprint of a header that already contains a41f.",
              "Block 501 carries 9c07, and so on down the line.",
              { s: "So every name is built on the name before it, all the way back to the beginning.", g: "wide" }
            ] },
          { slide: { k: "figure", title: "Edit an old page, break every later one", ops: [
              { box: [6, 12, 28, 16], t: "499" },
              { line: [34, 20, 46, 20], c: "grey" },
              { box: [46, 12, 28, 16], t: "500" },
              { line: [74, 20, 86, 20], c: "grey" },
              { box: [86, 12, 28, 16], t: "501" },
              { line: [114, 20, 126, 20], c: "grey" },
              { box: [126, 12, 28, 16], t: "502" },
              { box: [4, 10, 32, 20], c: "red", at: 1 },
              { text: "edited", x: 20, y: 35, a: "c", size: 3.5, c: "red", at: 1 },
              { text: "new name", x: 20, y: 40, a: "c", size: 3.5, c: "red", at: 2 },
              { line: [37, 16, 43, 24], c: "red", at: 3 },
              { line: [43, 16, 37, 24], c: "red", at: 3 },
              { text: "old name inside", x: 60, y: 35, a: "c", size: 3.5, c: "red", at: 3 },
              { line: [77, 16, 83, 24], c: "red", at: 4 },
              { line: [83, 16, 77, 24], c: "red", at: 4 },
              { line: [117, 16, 123, 24], c: "red", at: 4 },
              { line: [123, 16, 117, 24], c: "red", at: 4 },
              { text: "to hide one edit, rebuild every page after it", x: 80, y: 54, a: "c", size: 4.5, at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "Now play the cheat again, but against an old page.",
              "Suppose I go back to block 499 and quietly rewrite one transaction.",
              "We know what happens: a new Merkle root, a new header, and so a new name for block 499.",
              "But block 500 still carries the old name, so it now points at a page that no longer exists.",
              "To mend that I must rewrite block 500's header, which changes its name, which leaves block 501 pointing at nothing, and so on to the newest page.",
              { s: "One quiet edit to an old page means rebuilding every page that came after it.", g: "chop" }
            ] },
          { at: "centre", g: "open",
            say: [
              "I want to be careful about what the linking achieves by itself.",
              "It makes tampering evident: anyone who holds the newest block's name can tell if any earlier page has been changed.",
              { s: "It does not make tampering hard, because a computer can work out a fresh chain of fingerprints in moments.", g: "weigh" },
              "What makes it hard is that each page must also cost real work to make, so rebuilding the pages means paying that cost again for every one.",
              "The chain says what must be redone, and proof of work, next time, sets the price of redoing it.",
              { s: "That is the sense in which each new block reinforces the ones before it: the older a page, the more has to be rebuilt on top of it.", g: "up" }
            ] },
          { say: ["Let me test the chain.", "A chain is 800 blocks long, and someone alters a transaction in block 300: which blocks no longer fit?"],
            quiz: {
              q: "A transaction in block 300 of an 800-block chain is altered. Which blocks no longer fit?",
              options: [
                "Every block in the chain",
                "Block 300 and every block after it",
                "Block 300 and every block before it",
                "Only block 300"
              ],
              answer: 1,
              right: ["Exactly: the break runs forward from the edit, never backward."],
              wrong: [
                ["The blocks before 300 are safe, since each header names only what came before it.", "The break runs forward: block 300 and every block after it."],
                null,
                ["The earlier blocks are untouched, because nothing in them depends on what came later.", "It is block 300 and every block after it that no longer fit."],
                ["Block 300 does change, but the damage does not stop there.", "The next block carries block 300's old name, so block 300 and every block after it no longer fit."]
              ]
            } }
        ] },

      { id: "genesis-and-height", title: "Block Zero and Counting Up", topics: ["genesis block", "block height", "block zero", "naming a block", "latest blocks", "number of blocks"],
        beats: [
          { slide: { k: "section", title: "Block Zero and Counting Up", sub: "Where the chain starts, and how we count along it" },
            at: "lectern", g: "open",
            say: [
              "If every page names the page before it, there is an obvious question.",
              { s: "What does the first page name?", g: "shrug" },
              "It names nothing, because there was nothing.",
              "The first block is called the genesis block, and we met it in lecture 1 as the block with a newspaper headline inside.",
              "Today we can read its header."
            ] },
          { slide: { k: "code", title: "The genesis block's header", start: 0, lines: [
              "version      1",
              "previous     0000000000000000...0000000000000000",
              "merkle root  4a5e1e4baab89f3a...b2127b7afdeda33b",
              "time         1231006505  (3 Jan 2009, 18:15:05 UTC)",
              "bits         1d00ffff",
              "nonce        2083236893",
              "",
              "$ block hash 000000000019d668...72b3f1b60a8ce26f"
            ], note: "The 32-byte values are shortened in the middle." },
            at: "screen", g: "point",
            say: [
              { s: "Version 1, as you would expect of the first.", show: 1 },
              { s: "The previous-block field is 32 bytes of zeros, a blank where a name should be.", show: 2 },
              { s: "The Merkle root is the ID of its single transaction, because a page of one has nothing to pair.", show: 3 },
              { s: "The time is a count of seconds that works out to a quarter past six in the evening, London time, on 3 January 2009.", show: 4 },
              { s: "Bits and the nonce I will only point at today.", show: 6 },
              { s: "Put those 80 bytes through SHA-256 twice and you get this name, which begins with a long run of zeros for reasons that belong to next time.", show: 8 },
              "This one block is written into the software itself, so every node in the world starts its copy of the chain from the same first page."
            ] },
          { slide: { k: "number", value: "Height 0", label: "The genesis block: the one page with no page before it", note: "Block 1 carries a time of 9 January 2009, more than five days later" },
            at: "centre", g: "open",
            say: [
              "From here we can count.",
              "A block's height is the number of blocks before it in the chain.",
              "So the genesis block itself has height zero, the next has height 1, and so on up.",
              "That next block, by the way, carries a time more than five days later, and the reason for the gap is not known.",
              { s: "Height is a lovely, simple idea, but notice that it is not one of the six header fields.", g: "lean" },
              "A header does not announce its place; you find a block's height by following the links back and counting.",
              "Since 2013 a block's maker must also write the height into the first transaction on the page, but the chain of names is still what fixes the order."
            ] },
          { slide: { k: "compare", title: "Two ways to point at a block",
              left: { head: "By its hash", points: ["32 bytes that look random", "Names exactly one block", "Depends on every page before it", "What headers use to link"] },
              right: { head: "By its height", points: ["A plain count from zero", "Easy to say and remember", "Names a position in the chain", "What people use in conversation"] } },
            at: "left", g: "weigh",
            say: [
              "So there are two ways to point at a block.",
              "The hash is exact: it names one block and no other, and it would be different if anything in that block's past were different.",
              "The height is friendly: block 170, the one with the first payment to Hal Finney, is easier to say than the 64 digits of its hash.",
              "But a height names a position rather than a particular page, and lecture 8 will show why that difference can matter.",
              { s: "The machines link by hash, and the humans talk by height.", g: "pinch" }
            ] },
          { slide: { k: "live", title: "The top of the chain, right now", panel: "blocks", note: "Live from the Bitcoin network while the hall is open" },
            at: "screen", g: "point",
            say: [
              "Here is the top of the chain as it stands while we speak.",
              "Each of these is a page like the ones I drew, with a height, a time and a batch of transactions.",
              "When I wrote this lecture, in November 2026, the height had passed 976,000.",
              "Every one of those blocks carries the name of the one below it, in an unbroken line down to height zero.",
              { s: "Nearly a million pages, and you can check the binding of every one with nothing but the fingerprint machine.", g: "wide" }
            ] }
        ] },

      { id: "light-clients", title: "Proof That a Payment Is In", topics: ["simplified payment verification", "light client", "merkle proof", "headers only", "what a proof does not show", "full node", "phone wallet"],
        beats: [
          { slide: { k: "section", title: "Proof That a Payment Is In", sub: "Checking with headers and a handful of hashes" },
            at: "lectern", g: "open",
            say: [
              "Now we cash in the tree.",
              "The full ledger is every transaction since 2009, and checking all of it is a job for a proper computer with a large disk.",
              "A program that does that job is called a full node, and we will meet it properly in lecture 9.",
              { s: "But what about a phone, which has neither the disk nor the patience?", g: "shrug" },
              "Section 8 of the whitepaper is half a page long, and it answers exactly that."
            ] },
          { slide: { k: "quote", text: "It is possible to verify payments without running a full network node.", by: "Satoshi Nakamoto, Bitcoin whitepaper, section 8, 2008" },
            at: "centre", g: "open",
            say: [
              "The section is called Simplified Payment Verification, and this is its first sentence.",
              "The recipe has two ingredients.",
              { s: "First, keep the headers, all of them, but none of the transactions.", g: "count" },
              { s: "Second, when you care about one payment, ask for a short proof that links it to one of those headers.", g: "count" },
              "A program that works this way is usually called a light client.",
              "Let us see what each ingredient costs."
            ] },
          { slide: { k: "number", value: "4.2 MB", label: "A year of block headers: 80 bytes, six times an hour", note: "Whitepaper, section 7: 80 bytes * 6 * 24 * 365 = 4.2MB per year" },
            at: "right", g: "open",
            say: [
              "Headers first, and the whitepaper does the sum for us.",
              "Eighty bytes, six times an hour, 24 hours a day, 365 days a year, comes to about 4.2 megabytes a year.",
              "That is roughly one photograph.",
              "The whole chain of headers, from 2009 to the day I wrote this, is more than 976,000 of them and about 78 megabytes.",
              { s: "So a phone can hold the spine of the entire ledger without noticing.", g: "pinch" },
              "And because each header names the one before it, the phone can check for itself that the spine is unbroken."
            ] },
          { board: { clear: true, title: "A Merkle proof: one path to the root", ops: [
              { circle: [17, 66, 4], t: "A", at: 0 },
              { circle: [35, 66, 4], t: "B", at: 0 },
              { circle: [53, 66, 4], t: "C", at: 0 },
              { circle: [71, 66, 4], t: "D", at: 0 },
              { circle: [89, 66, 4], t: "E", at: 0 },
              { circle: [107, 66, 4], t: "F", at: 0 },
              { circle: [125, 66, 4], t: "G", at: 0 },
              { circle: [143, 66, 4], t: "H", at: 0 },
              { path: [17, 62, 26, 51.5, 35, 62], c: "grey", at: 0 },
              { path: [53, 62, 62, 51.5, 71, 62], c: "grey", at: 0 },
              { path: [89, 62, 98, 51.5, 107, 62], c: "grey", at: 0 },
              { path: [125, 62, 134, 51.5, 143, 62], c: "grey", at: 0 },
              { circle: [26, 47, 4.5], c: "grey", at: 0 },
              { circle: [62, 47, 4.5], c: "grey", at: 0 },
              { circle: [98, 47, 4.5], c: "grey", at: 0 },
              { circle: [134, 47, 4.5], c: "grey", at: 0 },
              { path: [26, 42.5, 44, 32.5, 62, 42.5], c: "grey", at: 0 },
              { path: [98, 42.5, 116, 32.5, 134, 42.5], c: "grey", at: 0 },
              { circle: [44, 28, 4.5], c: "grey", at: 0 },
              { circle: [116, 28, 4.5], c: "grey", at: 0 },
              { path: [44, 23.5, 80, 16, 116, 23.5], c: "grey", at: 1 },
              { box: [66, 5, 28, 11], t: "root", c: "amber", at: 1 },
              { circle: [53, 66, 5.5], c: "green", at: 2 },
              { text: "yours", x: 53, y: 76, a: "c", size: 4, c: "green", at: 2 },
              { circle: [71, 66, 5.5], c: "blue", at: 3 },
              { text: "1", x: 71, y: 76, a: "c", size: 4.5, c: "blue", at: 3 },
              { circle: [26, 47, 6], c: "blue", at: 4 },
              { text: "2", x: 15, y: 47, a: "c", size: 4.5, c: "blue", at: 4 },
              { circle: [116, 28, 6], c: "blue", at: 5 },
              { text: "3", x: 127, y: 28, a: "c", size: 4.5, c: "blue", at: 5 },
              { path: [53, 62, 62, 51.5, 62, 42.5, 44, 32.5, 44, 23.5, 80, 16], c: "green", w: 1.2, at: 6 },
              { text: "= the header's root?", x: 98, y: 10.5, size: 4.5, c: "green", at: 7 },
              { text: "3 fingerprints, not 8 transactions", x: 80, y: 85, a: "c", size: 5, at: 8 }
            ] },
            say: [
              "Here is a block of eight transactions, A to H, with its tree drawn above it.",
              "Your phone holds only the root, because the root is in the header and the header is all it kept.",
              "You are owed a payment, and it is transaction C.",
              "To prove that C is on this page, a full node sends you C itself and three fingerprints, and the first is the ID of its partner, D.",
              "You hash C with D, which gives the fingerprint above them, and the second thing you were sent is that one's partner.",
              "Hash those two together, climb a level, and the third is the last partner, the one that covers E to H.",
              "One more hash, and you have arrived at the top with a root you worked out for yourself.",
              { s: "If it equals the root in the header you already hold, C is on that page, and nobody could have faked the path without breaking the fingerprint machine.", g: "pinch" },
              "Three fingerprints did that, and you never saw the other seven transactions."
            ] },
          { slide: { k: "table", title: "A proof grows very slowly", head: ["Transactions", "Hashes needed", "Size of the proof"], rows: [
              ["2", "1", "32 bytes"],
              ["8", "3", "96 bytes"],
              ["1,000", "10", "320 bytes"],
              ["4,000", "12", "384 bytes"]
            ], note: "Each hash is 32 bytes; the count is the number of levels in the tree." },
            at: "left", g: "open",
            say: [
              "A knock-out cup is a fair picture of why this works.",
              "To show that a team reached the final, you need only name the opponents it met on the way, not every match that was played.",
              "And each extra round doubles the number of teams the cup can hold.",
              { s: "So doubling the transactions on the page adds just one fingerprint to the proof.", g: "pinch" },
              "A page of a thousand transactions needs ten, and a page of four thousand needs twelve.",
              "Twelve fingerprints is 384 bytes, to pin one payment to a page that may run to more than a million bytes."
            ] },
          { say: ["Before we look at the catch, a check on the recipe.", "What does a light client need in order to check that a payment is in a block?"],
            quiz: {
              q: "What does a light client need to check that a payment is in a block?",
              options: [
                "The block's header and a short path of hashes to its root",
                "The secret key of whoever sent the payment",
                "A copy of every transaction ever made",
                "A signed letter from the block's maker"
              ],
              answer: 0,
              right: ["That is the recipe: a header you already hold, and a handful of hashes."],
              wrong: [
                null,
                ["Nobody ever hands over a secret key, and it would prove nothing about the page.", "The client needs the block's header and a short path of hashes to its Merkle root."],
                ["That is what a full node keeps, and it is exactly what a light client avoids.", "The header and a short path of hashes up to its Merkle root are enough."],
                ["Nothing here rests on anyone's word, and a block's maker signs no letters.", "The proof is arithmetic: the header, and a short path of hashes that leads to its root."]
              ]
            } },
          { slide: { k: "compare", title: "What the proof says, and does not",
              left: { head: "It does tell you", points: ["This transaction is on this page", "The page is in the chain you hold", "More pages were built on top"] },
              right: { head: "It does not tell you", points: ["That the transaction obeys every rule", "That the coins were not spent before", "That nothing was kept back from you"] } },
            at: "right", g: "weigh",
            say: [
              "Now the catch, and it matters, so I will go slowly.",
              "The proof tells you that a transaction is on a page, and your own headers tell you that the page is part of the chain, with more pages built on top of it.",
              { s: "It does not tell you that the transaction is any good.", g: "chop" },
              "A full node checked every signature, and made sure the coins being spent existed and had not been spent already.",
              "Your phone did none of that, because it never saw the earlier transactions that such a check needs.",
              "It is leaning on the fact that somebody went to the cost of building a block around this transaction, and that others then built on top."
            ] },
          { slide: { k: "quote", text: "He can't check the transaction for himself, but by linking it to a place in the chain, he can see that a network node has accepted it, and blocks added after it further confirm the network has accepted it.", by: "Satoshi Nakamoto, Bitcoin whitepaper, section 8, 2008" },
            at: "centre", g: "open",
            say: [
              "The paper is admirably frank about this.",
              { s: "He cannot check the transaction for himself: those are the author's own words about the light client.", g: "point" },
              "It goes on to say that the method is reliable as long as honest nodes control the network, and more vulnerable if an attacker overpowers it.",
              "How much weight those later blocks deserve is the subject of lectures 7 and 8.",
              "There is a second gap as well: a proof can show that a payment is in, but silence proves nothing.",
              "The node you ask can simply fail to mention a transaction, and your phone cannot tell an absent payment from a withheld one.",
              "And the node you ask learns which payments you care about, which is a matter for lecture 12."
            ] },
          { at: "lectern", g: "open",
            say: [
              "So here is the honest summary.",
              "A full node checks everything, and a light client checks that its payment sits inside work that others have checked.",
              "For a small payment on a phone, many people accept that trade.",
              "For a business taking payments all day, the whitepaper itself expects that it will want a node of its own.",
              { s: "You choose how much to check, and the headers make the cheap end of that choice remarkably strong.", g: "up" }
            ] },
          { say: ["One more, on that catch.", "A Merkle proof checks out against a header: what has the light client not been shown?"],
            quiz: {
              q: "A Merkle proof checks out against a header. What has the light client NOT been shown?",
              options: [
                "That the header is 80 bytes long",
                "That the proof leads to the root in the header",
                "That the transaction itself follows every rule",
                "That the transaction is in that block"
              ],
              answer: 2,
              right: ["Right: it knows the payment is in, and relies on the page's builders having checked it."],
              wrong: [
                ["Every header is 80 bytes, and the client can count them.", "What it has not been shown is that the transaction itself follows every rule."],
                ["Matching the root is the very test the client has just run.", "What is missing is any check that the transaction itself follows the rules."],
                null,
                ["That is the one thing the proof does show.", "What it does not show is that the transaction itself follows every rule, which only a full check can."]
              ]
            } }
        ] },

      { id: "block-weight", title: "How Big May a Page Be?", topics: ["block size limit", "block weight", "segregated witness", "weight units", "witness data", "summary", "next lecture"],
        beats: [
          { slide: { k: "section", title: "How Big May a Page Be?", sub: "From a million bytes to four million units of weight" },
            at: "lectern", g: "open",
            say: [
              "One question is left, and it sounds dull and turns out not to be.",
              "How many transactions may a single page hold?",
              "There has to be some limit, and the reason goes back to the first lecture.",
              "Every full node downloads and checks every page, and most keep them all.",
              { s: "Make the pages enormous and fewer people can afford to check for themselves, and checking for yourself is the whole point.", g: "lean" }
            ] },
          { slide: { k: "number", value: "1,000,000", label: "bytes: the most a block could hold under the old rule", note: "The whole block, header and transactions together" },
            at: "centre", g: "open",
            say: [
              "For years the rule was as plain as a rule can be.",
              "A block, header and transactions together, could be no larger than one million bytes.",
              "Count the bytes, compare with a million, and you are done.",
              "In August 2017 the way of counting changed, with an upgrade called segregated witness.",
              "How such an upgrade is agreed is lecture 13's story, so today I will only show you the new ruler."
            ] },
          { board: { clear: true, title: "Weighing a transaction", ops: [
              { text: "one transaction", x: 76, y: 12, a: "c", size: 4.5, at: 0 },
              { box: [92, 18, 50, 16], t: "witness", c: "blue", at: 1 },
              { box: [10, 18, 80, 16], t: "everything else", at: 2 },
              { text: "150 bytes", x: 50, y: 41, a: "c", size: 4.5, at: 3 },
              { text: "100 bytes", x: 117, y: 41, a: "c", size: 4.5, c: "blue", at: 3 },
              { text: "x 4", x: 50, y: 51, a: "c", size: 5, c: "red", at: 4 },
              { text: "x 1", x: 117, y: 51, a: "c", size: 5, c: "green", at: 4 },
              { text: "600", x: 50, y: 62, a: "c", size: 5.5, at: 5 },
              { text: "+", x: 84, y: 62, a: "c", size: 5.5, at: 5 },
              { text: "100", x: 117, y: 62, a: "c", size: 5.5, c: "blue", at: 5 },
              { line: [30, 69, 138, 69], at: 5 },
              { text: "weight = 700 units", x: 84, y: 78, a: "c", size: 6, c: "amber", at: 5 }
            ] },
            say: [
              "Here is one transaction, and I have split it into two parts.",
              "On the right is the witness: the signatures and other data that open the locks we studied last time.",
              "On the left is everything else: which coins are spent, the new coins, their amounts and their locks.",
              "Say the left part is 150 bytes and the witness is 100 bytes.",
              "Under the new rule every byte on the left counts as four units of weight, and every witness byte counts as one.",
              "So this transaction weighs 600 plus 100, which is 700 weight units.",
              { s: "The witness rides at a quarter of the rate.", g: "pinch" }
            ] },
          { slide: { k: "compare", title: "Two rulers for a block",
              left: { head: "Before August 2017", points: ["Count every byte once", "Limit: 1,000,000 bytes"] },
              right: { head: "Since August 2017", points: ["Witness bytes count 1 unit each", "All other bytes count 4 units each", "Limit: 4,000,000 weight units"] } },
            at: "left", g: "weigh",
            say: [
              "The limit on a block is now four million weight units.",
              "The formal definition, in Bitcoin Improvement Proposal 141, is three times the size without witnesses plus the total size, which comes to the same sum.",
              "Look at what that does to a block with no witness data at all: every byte counts four, so it tops out at one million bytes, just as before.",
              "A block full of modern transactions can be bigger than a million bytes, because part of it is carried at the cheaper rate.",
              "But it can never reach four million bytes, since no block is made of witness data alone.",
              { s: "Think of a lift with a weight limit, where one kind of luggage goes on the scales at a quarter of its true weight.", g: "open" }
            ] },
          { slide: { k: "number", value: "4,000,000", label: "weight units: the most any block may weigh today", note: "BIP 141: block weight = base size * 3 + total size" },
            at: "centre", g: "open",
            say: [
              { s: "Why should the witness get a discount?", g: "shrug" },
              "One reason given at the time is what each part costs a node to keep.",
              "The new coins a transaction creates must be remembered by every full node until they are spent, while a signature is checked once and can then be set aside.",
              "Whatever the ruler, a limited page fills up, and when more people want in than there is room, somebody has to wait.",
              "Who waits, and what they can do about it, is the whole of lecture 10."
            ] },
          { slide: { k: "points", title: "What we built today", start: 0, points: [
              "A block: a batch of transactions under an 80-byte header",
              "The Merkle root pins every transaction to the header",
              "Each header names the one before: edit one, break the rest",
              "Height counts pages up from the genesis block at zero",
              "Headers and a short proof show that a payment is in",
              "A page may weigh at most 4,000,000 units"
            ] },
            at: "lectern", g: "count",
            say: [
              { s: "Let me gather up the day.", g: "open" },
              { s: "A block is a batch of transactions under a header of 80 bytes.", show: 1 },
              { s: "The Merkle root in that header pins down every transaction on the page.", show: 2 },
              { s: "Each header names the one before it, so an edit to an old page breaks every page after it.", show: 3 },
              { s: "Height counts the pages up from the genesis block, and headers with a short proof can show a phone that a payment is in.", show: 5 },
              { s: "And a page has a limit, counted today as weight.", show: 6 }
            ] },
          { slide: { k: "figure", title: "Next time: what a page costs", ops: [
              { box: [6, 12, 46, 14], t: "header + nonce", c: "amber", at: 1 },
              { arrow: [54, 19, 66, 19], at: 1 },
              { box: [68, 12, 26, 14], t: "hash", c: "blue", fill: true, at: 1 },
              { arrow: [96, 19, 108, 19], at: 2 },
              { text: "good enough?", x: 111, y: 19, size: 4.5, c: "green", at: 2 },
              { arrow: [124, 31, 30, 31], c: "red", dash: true, at: 3 },
              { text: "no: change the nonce, try again", x: 77, y: 37, a: "c", size: 4, c: "red", at: 3 },
              { text: "a page must cost work before anyone accepts it", x: 80, y: 53, a: "c", size: 4.5, at: 4 }
            ] },
            at: "lectern", g: "open",
            say: [
              "Two of the six fields are still sealed: bits and the nonce.",
              "Next time we open them, and find that a block's maker must hash the header over and over, changing the nonce each time.",
              "Only a hash that passes a very demanding test is accepted, which is why the genesis block's name began with all those zeros.",
              "Most tries fail, and each failure means another turn of the dial.",
              "That labour is what turns today's tamper-evident chain into one that is truly expensive to rewrite.",
              "Before then, read sections 7 and 8 of the whitepaper again, because you can now follow every line of them.",
              { s: "Thank you, and I will see you in lecture 7, Mining: Proof of Work.", g: "up" }
            ] }
        ] }
    ]
  });
})();
