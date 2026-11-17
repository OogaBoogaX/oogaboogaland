// Bitcoin from First Principles, lecture 5: every output carries a small program and spending means making it finish true; Script as a deliberately small stack language with no loops; the locks in the order they appeared (pay to a public key, to a key's hash, several signatures, pay to a script's hash, locks that wait), what segregated witness moved and the malleability it ended, and taproot's one key standing for many conditions.
(() => {
  "use strict";
  window.BL.lectures.add({
    id: "btc-05", course: "first-principles", n: 5, title: "Programmable Locks",
    reading: [
      { title: "BIP 16: Pay to Script Hash", by: "Gavin Andresen, 2012" },
      { title: "BIP 341: Taproot: SegWit Version 1 Spending Rules", by: "Pieter Wuille, Jonas Nick, Anthony Towns, 2020" },
      { title: "Transactions (Bitcoin Developer Guide)", by: "developer.bitcoin.org" }
    ],
    sources: [
      "Satoshi Nakamoto, Re: Transactions and Scripts: DUP HASH160 ... EQUALVERIFY CHECKSIG, Bitcoin forum, 17 June 2010, https://satoshi.nakamotoinstitute.org/posts/bitcointalk/126/",
      "Bitcoin Developer Guide, Transactions (the Script language, P2PKH, P2SH, multisig, pubkey outputs, malleability), https://developer.bitcoin.org/devguide/transactions.html",
      "Bitcoin Wiki, Script (the instructions, the stack, validity and limits), https://en.bitcoin.it/wiki/Script",
      "Bitcoin Wiki, Genesis block (its pay to public key output), https://en.bitcoin.it/wiki/Genesis_block, with the block 170 payment at https://mempool.space/tx/f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16",
      "Gavin Andresen, BIP 11: M-of-N Standard Transactions (2011), https://github.com/bitcoin/bips/blob/master/bip-0011.mediawiki",
      "Gavin Andresen, BIP 16: Pay to Script Hash (2012), https://github.com/bitcoin/bips/blob/master/bip-0016.mediawiki",
      "Pieter Wuille, BIP 62: Dealing with malleability (2014), https://github.com/bitcoin/bips/blob/master/bip-0062.mediawiki",
      "Peter Todd, BIP 65: OP_CHECKLOCKTIMEVERIFY (2014), https://github.com/bitcoin/bips/blob/master/bip-0065.mediawiki",
      "BtcDrak, Mark Friedenbach and Eric Lombrozo, BIP 112: CHECKSEQUENCEVERIFY (2015), https://github.com/bitcoin/bips/blob/master/bip-0112.mediawiki",
      "Mark Friedenbach, BtcDrak, Nicolas Dorier and kinoshitajona, BIP 68: Relative lock-time using consensus-enforced sequence numbers (2015), https://github.com/bitcoin/bips/blob/master/bip-0068.mediawiki",
      "Eric Lombrozo, Johnson Lau and Pieter Wuille, BIP 141: Segregated Witness (Consensus layer) (2015), https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki",
      "Johnson Lau and Pieter Wuille, BIP 143: Transaction Signature Verification for Version 0 Witness Program (2016), https://github.com/bitcoin/bips/blob/master/bip-0143.mediawiki",
      "Pieter Wuille, Jonas Nick and Tim Ruffing, BIP 340: Schnorr Signatures for secp256k1 (2020), https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki",
      "Pieter Wuille, Jonas Nick and Anthony Towns, BIP 341: Taproot: SegWit version 1 spending rules (2020), https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki",
      "Pieter Wuille, Jonas Nick and Anthony Towns, BIP 342: Validation of Taproot Scripts (2020), https://github.com/bitcoin/bips/blob/master/bip-0342.mediawiki",
      "Bitcoin Core, doc/bips.md (which proposals are implemented, since which release, and when they took effect), https://github.com/bitcoin/bitcoin/blob/master/doc/bips.md"
    ],
    sections: [
      { id: "outputs-are-locked", title: "Every Coin Carries a Lock", topics: ["outputs", "locking script", "unlocking script", "predicate", "spending conditions"],
        beats: [
          { slide: { k: "title", kicker: "Lecture 5", title: "Programmable Locks", sub: "Script, from the first locks to taproot" },
            at: "lectern", g: "open",
            say: [
              "Welcome back.",
              { s: "Last time we opened one transaction and found no accounts and no balances in it, only outputs.", g: "wide" },
              "An output, you will remember, is an amount of bitcoin with a condition attached.",
              "Today is about that condition, which I have been hurrying past.",
              "I told you in lecture 1 that a coin is yours if you hold the right key, and that was a useful simplification.",
              { s: "The truth is stranger and far more interesting: every output carries a small program.", g: "lean" },
              "Whoever can make that program finish with the answer true may spend the coin."
            ] },
          { slide: { k: "figure", title: "An output: an amount, and a lock", ops: [
              { box: [6, 8, 62, 30], c: "amber" },
              { text: "output", x: 37, y: 5, a: "c", size: 4, c: "grey" },
              { box: [10, 12, 54, 10], t: "amount" },
              { box: [10, 25, 54, 10], t: "locking script", c: "blue", at: 1 },
              { text: "public from the day the coin is made", x: 37, y: 44, a: "c", size: 3.5, c: "grey", at: 2 },
              { box: [100, 18, 54, 10], t: "unlocking script", c: "green", at: 3 },
              { text: "from a later transaction", x: 127, y: 14, a: "c", size: 3.5, c: "grey", at: 3 },
              { arrow: [98, 25, 70, 29], c: "green", at: 3 },
              { text: "run both: unlocking first, locking second", x: 80, y: 53, a: "c", size: 4.5, at: 4 },
              { text: "true = valid spend", x: 46, y: 61, a: "c", size: 4.5, c: "green", at: 5 },
              { text: "anything else = rejected", x: 116, y: 61, a: "c", size: 4.5, c: "red", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "Here is an output as we drew it last time: an amount, and beside it a lock.",
              "The lock is a short list of instructions, and the software calls it the locking script.",
              "It sits in the ledger, in public, from the moment the coin is made.",
              "To spend the coin, a later transaction points at this output and supplies an unlocking script.",
              "Every node then runs the two together, the unlocking part first and the locking part second.",
              { s: "If the run finishes with true, the spend is valid, and if it does not, every node rejects the transaction.", g: "pinch" }
            ] },
          { slide: { k: "quote", text: "The script is actually a predicate. It's just an equation that evaluates to true or false.", by: "Satoshi Nakamoto, Bitcoin forum, 17 June 2010" },
            at: "centre", g: "open",
            say: [
              "The designer put it more crisply than I can.",
              "In June 2010, in a forum thread about these odd little scripts, Satoshi wrote this.",
              { s: "A predicate is simply a yes or no question about whatever you hand it.", g: "pinch" },
              "So the ledger never records who owns a coin.",
              "It records a question, and the coin belongs, in practice, to whoever can answer it.",
              "In the same post Satoshi gave the reason: the core design would be very hard to change after release, so it had to be general.",
              "Escrow, arbitration by a third party and payments needing several signatures were all on the list of things it should one day allow."
            ] },
          { slide: { k: "points", title: "What a lock can ask for", start: 0, points: [
              "A signature made by one particular key",
              "Signatures from several keys out of a group",
              "The data that matches a given fingerprint",
              "A date or a block height that has passed",
              "Combinations: this, or else that"
            ] },
            at: "left", g: "count",
            say: [
              { s: "So what kinds of question can a lock ask?", g: "open" },
              { s: "The commonest by far is this: show me a signature made by this particular key.", show: 1 },
              { s: "Or, show me signatures from any two of these three keys.", show: 2 },
              { s: "Or, show me the data whose fingerprint is this, using the hash functions of lecture 2.", show: 3 },
              { s: "Or, wait until a certain date or a certain block before you even try.", show: 4 },
              { s: "And these can be combined: this key today, or else that key after a month.", show: 5, g: "weigh" },
              "We will meet them in the order they appeared, from 2009 to 2021."
            ] },
          { say: ["Before we look at the language, let me check the central idea.", "What does it take to spend an output?"],
            quiz: {
              q: "What does it take to spend an output?",
              options: [
                "Data that makes its locking program finish true",
                "Knowing the amount held in the output",
                "Being registered as the owner of the coin",
                "Permission from the miner of the next block"
              ],
              answer: 0,
              right: ["Exactly: the lock asks a question, and a valid spend is a correct answer."],
              wrong: [
                null,
                ["The amount is public, so knowing it proves nothing.", "You spend an output by supplying data that makes its locking program finish true."],
                ["There is no register of owners anywhere in the ledger.", "An output is spent by supplying data that makes its locking program finish true."],
                ["A miner chooses which valid transactions to include, but cannot make an invalid one valid.", "What spends an output is data that makes its locking program finish true."]
              ]
            } }
        ] },

      { id: "script-language", title: "A Small Language on Purpose", topics: ["script", "stack", "opcodes", "no loops", "turing complete", "limits"],
        beats: [
          { slide: { k: "section", title: "A Small Language on Purpose", sub: "A stack, a short list of instructions, and no loops" },
            at: "lectern", g: "open",
            say: [
              "The language these locks are written in has a wonderfully plain name: Script.",
              "If you have programmed before, please forget most of what you know.",
              "Script has no variables, no functions, no files and no network.",
              "It has one working surface, called the stack, and a list of small instructions.",
              { s: "And if you have never programmed, even better, because you already own the right mental picture.", g: "up" }
            ] },
          { slide: { k: "figure", title: "The stack: last on, first off", ops: [
              { box: [56, 44, 48, 10], t: "first item" },
              { box: [56, 32, 48, 10], t: "second item" },
              { box: [56, 20, 48, 10], t: "top item", c: "amber", fill: true },
              { line: [50, 56, 110, 56], c: "grey" },
              { arrow: [30, 8, 54, 22], c: "green", at: 2 },
              { text: "push: put one on top", x: 30, y: 5, a: "c", size: 4, c: "green", at: 2 },
              { arrow: [106, 22, 130, 8], c: "red", at: 2 },
              { text: "pop: take the top one", x: 130, y: 5, a: "c", size: 4, c: "red", at: 2 },
              { text: "data is pushed; an instruction pops, works, pushes", x: 80, y: 62, a: "c", size: 4, at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "Picture the pile of plates beside a canteen sink.",
              "You can put a plate on the top, and you can take a plate off the top, and that is all.",
              "Putting an item on is called a push, and taking one off is called a pop.",
              "A script is read from left to right, one word at a time.",
              "If the word is a piece of data, such as a key or a signature, it is pushed onto the pile.",
              { s: "If the word is an instruction, it pops what it needs, does its one job and pushes the result.", g: "count" }
            ] },
          { board: { clear: true, title: "A toy script on the stack", ops: [
              { text: "2   3   ADD   5   EQUAL", x: 80, y: 14, a: "c", size: 6, mono: true, at: 0 },
              { box: [6, 58, 24, 11], t: "2", at: 1 },
              { text: "2", x: 18, y: 77, a: "c", size: 4, c: "grey", at: 1 },
              { box: [37, 58, 24, 11], t: "2", at: 2 },
              { box: [37, 46, 24, 11], t: "3", at: 2 },
              { text: "3", x: 49, y: 77, a: "c", size: 4, c: "grey", at: 2 },
              { box: [68, 58, 24, 11], t: "5", c: "amber", at: 3 },
              { text: "ADD", x: 80, y: 77, a: "c", size: 4, c: "grey", at: 3 },
              { box: [99, 58, 24, 11], t: "5", c: "amber", at: 4 },
              { box: [99, 46, 24, 11], t: "5", at: 4 },
              { text: "5", x: 111, y: 77, a: "c", size: 4, c: "grey", at: 4 },
              { box: [130, 58, 24, 11], t: "true", c: "green", at: 5 },
              { text: "EQUAL", x: 142, y: 77, a: "c", size: 4, c: "grey", at: 5 },
              { text: "true on top = success", x: 80, y: 87, a: "c", size: 5, c: "green", at: 6 }
            ] },
            say: [
              "Here is a toy script, five words long: two, three, add, five, equal.",
              "The first word is the number two, so two goes onto the stack.",
              "The next word is three, so three goes on top of it.",
              "The third word is an instruction, add, which pops two numbers and pushes their sum, five.",
              "Then comes the data five, so the stack now holds a five on a five.",
              "The last instruction, equal, pops both, compares them and pushes true.",
              "The script has run out of words with true on top, and that is the definition of success.",
              "Notice that the stack filled and shrank back to a single item, and nothing else was stored anywhere."
            ] },
          { slide: { k: "points", title: "What Script leaves out, on purpose", start: 0, points: [
              "No loops: a script runs once, start to finish",
              "No memory carried from one run to the next",
              "No view of the outside world, only its transaction",
              "Hard limits: 520 bytes for any one item"
            ] },
            at: "centre", g: "open",
            say: [
              "Now for the design choice that surprises programmers.",
              { s: "Script has no loops: there is no way to say, do this again until something changes.", show: 1, g: "chop" },
              { s: "It also keeps no memory from one run to the next.", show: 2 },
              { s: "And it cannot look at the outside world: no clock on the wall, no web page, no weather report.", show: 3 },
              "It can see the transaction it is part of, and nothing else.",
              { s: "On top of that come hard limits, such as 520 bytes for any single item on the stack.", show: 4 }
            ] },
          { at: "right", g: "open",
            say: [
              { s: "Why would anyone cripple a language like this?", g: "shrug" },
              "Because of who has to run it.",
              { s: "Every lock on every coin is run by every node that checks the ledger, for as long as Bitcoin exists.", g: "wide" },
              "If a script could loop, a single malicious lock could keep thousands of computers spinning for ever.",
              "With no loops, the work of checking a script is bounded by its length, so a node knows the worst case before it starts.",
              "And with no outside inputs, the answer is the same on every machine, this year and fifty years from now.",
              { s: "A lock that gave different answers on different computers would split the ledger in two.", g: "pinch" },
              "So Script is small the way a fuse box is small: it does one job, and it must never surprise you."
            ] },
          { say: ["Let me make sure the reason has landed, and not just the fact.", "Why does Script have no loops?"],
            quiz: {
              q: "Why does Script have no loops?",
              options: [
                "Because loops had not been invented in 2009",
                "So every node can check any script in bounded time",
                "Because miners are paid for each instruction",
                "To keep the contents of scripts secret"
              ],
              answer: 1,
              right: ["Yes: a script that every node must run has to be certain to finish, and quickly."],
              wrong: [
                ["Loops are as old as programming, and leaving them out was a choice.", "They were left out so that every node can check any script in a bounded, predictable time."],
                null,
                ["Miners are not paid by the instruction.", "Script has no loops so that every node can be sure each script finishes in bounded time."],
                ["Scripts are public, and a loop would not hide them.", "Loops are missing so that every node can check any script in bounded time."]
              ]
            } }
        ] },

      { id: "first-locks", title: "The First Locks", topics: ["pay to public key", "pay to public key hash", "checksig", "hash160", "stack walk"],
        beats: [
          { slide: { k: "section", title: "The First Locks", sub: "Pay to a public key, then to a key's fingerprint" },
            at: "lectern", g: "open",
            say: [
              "Now let us read real locks, beginning with the oldest.",
              "From lecture 3 you know the pair: a private key that signs, and a public key that lets anyone check the signature.",
              "The simplest lock imaginable names a public key and demands a signature that fits it.",
              "It is called pay to public key, and it is two words long."
            ] },
          { slide: { k: "code", title: "Pay to public key (2009)", start: 2, lines: [
              "# locking script, written into the output",
              "<public key>  CHECKSIG",
              "",
              "# unlocking script, supplied by the spender",
              "<signature>",
              "",
              "# run together",
              "<signature>  <public key>  CHECKSIG     ->  true"
            ] },
            at: "screen", g: "point",
            say: [
              "Here it is: a public key, followed by the instruction check signature.",
              { s: "To spend, you supply exactly one thing, a signature.", show: 5 },
              { s: "Run them together: the signature goes on the stack, the key goes on top, and check signature pops them both.", show: 8 },
              "It asks whether this signature, made over this very transaction, is valid for this key, and it pushes true or false.",
              "The first block's reward was locked this way, and so were the 10 coins Satoshi sent to Hal Finney in block 170.",
              "It works, but it has two small costs.",
              { s: "A public key of that era took 65 bytes, a lot to pass around, and it sits exposed in the ledger from the day the coin is made.", g: "weigh" }
            ] },
          { slide: { k: "code", title: "Pay to a key's hash", start: 2, lines: [
              "# locking script",
              "DUP  HASH160  <key hash>  EQUALVERIFY  CHECKSIG",
              "",
              "# unlocking script",
              "<signature>  <public key>"
            ] },
            at: "centre", g: "open",
            say: [
              "So the first release already carried a second lock, and it was the workhorse for years.",
              "In place of the key itself, the lock holds the key's fingerprint: a hash of it, only 20 bytes long.",
              { s: "The spender must now supply two things, the signature and the public key itself.", show: 5, g: "count" },
              "The lock checks that the key you supplied has the promised fingerprint, and then that the signature fits the key.",
              "It is five words long, and it is worth walking through one word at a time.",
              { s: "If you learn to run one script in your head, let it be this one.", g: "point" }
            ] },
          { board: { clear: true, title: "Pay to key hash, word by word", ops: [
              { box: [3, 62, 22, 10], t: "sig", at: 1 },
              { box: [3, 51, 22, 10], t: "key", c: "blue", at: 1 },
              { text: "unlock", x: 14, y: 80, a: "c", size: 3.6, c: "grey", at: 1 },
              { box: [29, 62, 22, 10], t: "sig", at: 2 },
              { box: [29, 51, 22, 10], t: "key", c: "blue", at: 2 },
              { box: [29, 40, 22, 10], t: "key", c: "blue", at: 2 },
              { text: "DUP", x: 40, y: 80, a: "c", size: 3.6, c: "grey", at: 2 },
              { box: [55, 62, 22, 10], t: "sig", at: 4 },
              { box: [55, 51, 22, 10], t: "key", c: "blue", at: 4 },
              { box: [55, 40, 22, 10], t: "hash", c: "amber", at: 4 },
              { text: "HASH160", x: 66, y: 80, a: "c", size: 3.6, c: "grey", at: 4 }
            ] },
            say: [
              "We begin with an empty stack, and the unlocking script goes first.",
              "It pushes the signature, and then the public key on top of it.",
              "Now the locking script begins, and its first word is dup, short for duplicate, which copies the top item.",
              "So we hold two copies of the key, and you will see why in a moment.",
              "Next comes hash 160, which pops the top copy and pushes its fingerprint.",
              "Inside, that is SHA-256 followed by a second hash function, and the result is 160 bits, which is 20 bytes."
            ] },
          { board: { ops: [
              { box: [81, 62, 22, 10], t: "sig", at: 0 },
              { box: [81, 51, 22, 10], t: "key", c: "blue", at: 0 },
              { box: [81, 40, 22, 10], t: "hash", c: "amber", at: 0 },
              { box: [81, 29, 22, 10], t: "hash", c: "red", at: 0 },
              { text: "<key hash>", x: 92, y: 80, a: "c", size: 3.6, c: "grey", at: 0 },
              { box: [107, 62, 22, 10], t: "sig", at: 2 },
              { box: [107, 51, 22, 10], t: "key", c: "blue", at: 2 },
              { text: "EQUALVERIFY", x: 118, y: 80, a: "c", size: 3.4, c: "grey", at: 2 },
              { box: [133, 62, 22, 10], t: "true", c: "green", at: 5 },
              { text: "CHECKSIG", x: 144, y: 80, a: "c", size: 3.6, c: "grey", at: 5 },
              { text: "valid", x: 144, y: 54, a: "c", size: 5, c: "green", at: 6 }
            ] },
            say: [
              "The fourth word is data: the fingerprint that was written into the lock when the coin was created.",
              "So the top two items are both fingerprints, one computed just now and one promised long ago.",
              "Equal verify pops them both and compares them.",
              "If they differ, the script stops dead and the spend fails, because you have shown the wrong key.",
              "If they match, both vanish, and we are left with the signature and the key, which is why we kept a copy.",
              "Last comes check signature, exactly as before: it pops both and pushes true.",
              { s: "One item is left, and it is true, so this coin may be spent.", g: "up" }
            ] },
          { slide: { k: "compare", title: "Why hide the key behind a hash?",
              left: { head: "Pay to public key", points: ["Key shown when the coin is made", "65 bytes in the lock (in 2009)", "One safeguard: the signature"] },
              right: { head: "Pay to a key's hash", points: ["Key shown only when spent", "20 bytes in the lock", "Two safeguards: hash, then signature"] } },
            at: "left", g: "weigh",
            say: [
              "What did the three extra words buy?",
              "The lock is shorter, because 20 bytes of fingerprint replace 65 bytes of key.",
              "And the public key stays out of sight until the moment the coin is spent.",
              "That is a second layer of protection, since an attacker would have to defeat the hash before even starting on the key.",
              { s: "Notice a pattern that will keep returning today: commit to a fingerprint now, and reveal the thing itself later.", g: "point" }
            ] }
        ] },

      { id: "multisig-and-script-hash", title: "Several Keys, and Hidden Scripts", topics: ["multisig", "m of n", "bip 11", "pay to script hash", "bip 16", "redeem script"],
        beats: [
          { slide: { k: "section", title: "Several Keys, and Hidden Scripts", sub: "Two signatures out of three, and BIP 16's pay to script hash" },
            at: "lectern", g: "open",
            say: [
              "One key is one point of failure.",
              "Lose it and the coin is gone; let someone copy it and the coin is theirs.",
              "So the next lock asks for more than one signature.",
              "Script had an instruction for this from the start, check multisig, and a proposal written in 2011, BIP 11, made it a standard kind of payment the following spring.",
              "BIP stands for Bitcoin improvement proposal, and lecture 13 tells how such proposals are argued over and adopted."
            ] },
          { slide: { k: "code", title: "Two signatures out of three", start: 2, lines: [
              "# locking script",
              "2  <key A>  <key B>  <key C>  3  CHECKMULTISIG",
              "",
              "# unlocking script",
              "0  <signature A>  <signature C>"
            ] },
            at: "screen", g: "point",
            say: [
              "Read the lock as a sentence: two, out of these three keys, check.",
              "Any two of the three key holders can sign, and the third is not needed.",
              "Think of a small firm where any two of three directors must approve a payment.",
              "Or a buyer, a seller and a referee: if the first two agree, the referee never lifts a finger.",
              { s: "The unlocking script supplies the two signatures, and one oddity, a throwaway zero at the front.", show: 5 },
              { s: "The original code pops one item too many, by mistake, and because every node must agree on every old transaction, the mistake is now part of the rules.", g: "shrug" },
              "It is a small monument to how hard it is to change a system like this one."
            ] },
          { at: "centre", g: "open",
            say: [
              "This lock is useful, but it has an awkward shape.",
              "It is long, and the person who must write it into the ledger is the payer, not the owner.",
              "Imagine asking a customer to pay you, and handing them three long keys and a rule to copy out exactly.",
              { s: "The more careful your security, the more you ask of everyone who pays you.", g: "weigh" },
              "In 2012 a proposal called BIP 16 turned this inside out."
            ] },
          { slide: { k: "figure", title: "Pay to script hash (BIP 16, 2012)", ops: [
              { box: [4, 6, 60, 12], t: "2 A B C 3 CHECKMULTISIG", size: 4 },
              { text: "the real lock, kept by the owner", x: 34, y: 23, a: "c", size: 3.5, c: "grey" },
              { arrow: [66, 12, 84, 12], at: 1 },
              { box: [86, 6, 20, 12], t: "hash", c: "blue", fill: true, at: 1 },
              { arrow: [108, 12, 124, 12], at: 1 },
              { box: [126, 6, 30, 12], t: "20 bytes", c: "amber", at: 1 },
              { text: "HASH160 <hash> EQUAL", x: 138, y: 23, a: "c", size: 3.5, mono: true, c: "amber", at: 2 },
              { text: "to spend:", x: 4, y: 37, size: 4, at: 3 },
              { box: [30, 31, 44, 12], t: "signatures", at: 3 },
              { box: [78, 31, 60, 12], t: "the full script", c: "green", at: 3 },
              { text: "1  does the script match the fingerprint?", x: 80, y: 52, a: "c", size: 4, at: 4 },
              { text: "2  does the script itself finish true?", x: 80, y: 60, a: "c", size: 4, c: "green", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "The owner still builds the full lock, two of three or anything else, but keeps it at home.",
              "What goes into the ledger is only the fingerprint of that script: 20 bytes, whatever the script's size.",
              "So the payer writes one short, standard lock that says, show me the script with this fingerprint.",
              "When the owner later spends, they supply the signatures and the full script itself.",
              "Every node first checks that the revealed script has the promised fingerprint.",
              "Then it runs the revealed script, with the signatures, just as if it had been in the output all along.",
              { s: "The proposal described its purpose as moving the responsibility for supplying the conditions from the sender to the one who redeems.", g: "pinch" }
            ] },
          { slide: { k: "points", title: "What pay to script hash changed", start: 0, points: [
              "The payer writes 20 bytes, whatever the lock",
              "The owner carries the cost of a complicated lock",
              "The conditions stay private until the coin is spent",
              "The ceiling: a revealed script of at most 520 bytes"
            ] },
            at: "right", g: "count",
            say: [
              { s: "Paying a firm with three directors is now as short and simple as paying one person.", show: 1 },
              { s: "The long script takes up room only when the coin is spent, and the spender is the one who pays for that room.", show: 2 },
              { s: "Until that day nobody can see what the conditions are, or even how many keys are involved.", show: 3 },
              { s: "There is a ceiling, because the revealed script counts as one item on the stack, and so cannot exceed 520 bytes.", show: 4 },
              { s: "And there is the pattern again: a fingerprint now, the real thing later.", g: "point" }
            ] },
          { say: ["Let me check that inside-out move.", "With pay to script hash, who supplies the full script, and when?"],
            quiz: {
              q: "With pay to script hash, who supplies the full script, and when?",
              options: [
                "The miner, when the block is built",
                "The payer, when the coin is created",
                "The spender, when the coin is spent",
                "Nobody: only its fingerprint is ever seen"
              ],
              answer: 2,
              right: ["Right: the ledger holds the fingerprint, and the spender reveals the script."],
              wrong: [
                ["A miner has no way of knowing a script that only its owner holds.", "The spender reveals the full script, at the moment the coin is spent."],
                ["That was the old arrangement, and it is exactly what this lock removed.", "The payer writes only a fingerprint, and the spender reveals the full script when spending."],
                null,
                ["A fingerprint alone could never be checked against signatures.", "The spender must reveal the full script when the coin is spent, and every node checks it then."]
              ]
            } }
        ] },

      { id: "timelocks", title: "Locks That Wait", topics: ["timelock", "checklocktimeverify", "bip 65", "checksequenceverify", "bip 112", "relative lock"],
        beats: [
          { slide: { k: "section", title: "Locks That Wait", sub: "BIP 65 and BIP 112: not before this date, not until this old" },
            at: "lectern", g: "open",
            say: [
              "So far every lock has asked who.",
              { s: "The next two ask when.", g: "lean" },
              "A transaction has a field called its lock time, which says: not valid before this block height, or this date.",
              "But that field is a promise made by the spender, and what we want is a rule set by the lock.",
              "In 2015, BIP 65 added an instruction that lets a lock insist on it."
            ] },
          { slide: { k: "code", title: "Not before a date (BIP 65)", start: 2, lines: [
              "# locking script",
              "<1 Jan 2030>  CHECKLOCKTIMEVERIFY  DROP",
              "DUP  HASH160  <key hash>  EQUALVERIFY  CHECKSIG",
              "",
              "# unlocking script",
              "<signature>  <public key>"
            ], note: "The date is stored as a number: a block height, or seconds counted from 1970." },
            at: "screen", g: "point",
            say: [
              "The new instruction has a long name, check lock time verify, and one job.",
              "It compares the date in the lock with the lock time of the transaction that is trying to spend.",
              "If the transaction's lock time is earlier than the lock demands, the script fails on the spot.",
              "And no block may include a transaction before its own lock time, so the coin simply cannot move early.",
              "The little word drop only tidies the date off the stack afterwards.",
              { s: "The rest you can already read, because it is our five-word friend, pay to a key's hash.", show: 3 },
              { s: "So this coin needs the right key, and it needs the calendar to have reached the first of January 2030.", show: 6 },
              "The proposal called this freezing funds."
            ] },
          { slide: { k: "figure", title: "Two ways of waiting", ops: [
              { text: "BIP 65: absolute", x: 4, y: 6, size: 4, c: "blue" },
              { line: [10, 18, 150, 18], c: "grey" },
              { circle: [20, 18, 1.5], fill: true },
              { text: "coin created", x: 20, y: 26, a: "c", size: 3.5 },
              { box: [22, 11, 76, 5], t: "locked", c: "red", fill: true, at: 1 },
              { circle: [100, 18, 1.5], c: "amber", fill: true, at: 1 },
              { text: "1 Jan 2030", x: 100, y: 26, a: "c", size: 3.5, at: 1 },
              { text: "spendable", x: 126, y: 13, a: "c", size: 4, c: "green", at: 1 },
              { text: "BIP 112: relative", x: 4, y: 38, size: 4, c: "blue", at: 2 },
              { line: [10, 50, 150, 50], c: "grey", at: 2 },
              { circle: [50, 50, 1.5], fill: true, at: 3 },
              { text: "coin confirmed, whenever", x: 50, y: 58, a: "c", size: 3.5, at: 3 },
              { box: [52, 43, 46, 5], t: "144 blocks", c: "red", fill: true, at: 4 },
              { circle: [100, 50, 1.5], c: "amber", fill: true, at: 4 },
              { text: "about a day later", x: 104, y: 58, a: "c", size: 3.5, at: 4 },
              { text: "spendable", x: 126, y: 45, a: "c", size: 4, c: "green", at: 4 }
            ] },
            at: "left", g: "open",
            say: [
              "That lock names a fixed point on the calendar, so we call it an absolute time lock.",
              "Before the date the coin is frozen, and after it the key works as usual.",
              "A year later, in 2016, BIP 112 added a sibling instruction, check sequence verify.",
              "Its clock starts not at a calendar date, but at the moment the coin being spent entered the chain.",
              "A lock can say: once this coin is recorded in a block, it must rest for 144 more blocks, about a day, before it moves.",
              { s: "That is a relative time lock, counted in blocks or in units of 512 seconds, up to 65,535 of either, which is over a year.", g: "pinch" }
            ] },
          { slide: { k: "code", title: "This key now, or that key later", lines: [
              "IF",
              "    <company key>  CHECKSIG",
              "ELSE",
              "    <90 days>  CHECKSEQUENCEVERIFY  DROP",
              "    <backup key>  CHECKSIG",
              "ENDIF",
              "# unlock: <signature> 1   (company, now)",
              "# or:     <signature> 0   (backup, after 90 days)"
            ] },
            at: "centre", g: "open",
            say: [
              "Time locks become powerful when you combine them with a choice.",
              { s: "Script has an if and an else, which is not a loop: it picks one of two paths, once.", g: "pinch" },
              "This lock says that the company key can spend at any time.",
              "Otherwise, once the coin has sat untouched for 90 days, a backup key can spend it instead.",
              "If the main key is ever lost, the backup opens the door after three months.",
              "And if it is not lost, the company can move the coin first, and the backup never gets its turn.",
              { s: "A cooling-off period, a recovery plan, an inheritance: each is a few words of Script.", g: "count" }
            ] }
        ] },

      { id: "segregated-witness", title: "Segregated Witness", topics: ["segwit", "witness", "malleability", "transaction id", "bip 141", "bip 143", "witness version"],
        beats: [
          { slide: { k: "section", title: "Segregated Witness", sub: "BIP 141 and BIP 143: where the signatures went" },
            at: "lectern", g: "open",
            say: [
              "By 2015 the locks were rich, but the structure around them had a flaw that had been there since the first day.",
              "It concerns a transaction's identifier, the fingerprint by which every later transaction refers to it.",
              "That identifier is a hash of the transaction, and originally of the whole of it, unlocking scripts included.",
              { s: "And there lies the trouble.", g: "lean" }
            ] },
          { board: { clear: true, title: "Same payment, new name", ops: [
              { text: "transaction", x: 54, y: 13, a: "c", size: 4, c: "grey", at: 0 },
              { box: [6, 17, 96, 16], at: 0 },
              { box: [10, 20, 40, 10], t: "what is paid", at: 0 },
              { box: [54, 20, 44, 10], t: "signature", c: "blue", at: 0 },
              { arrow: [104, 25, 122, 25], at: 1 },
              { text: "id a1f3...", x: 126, y: 26, size: 4.5, c: "green", mono: true, at: 1 },
              { box: [6, 49, 96, 16], at: 3 },
              { box: [10, 52, 40, 10], t: "what is paid", at: 3 },
              { box: [54, 52, 44, 10], t: "signature*", c: "red", at: 3 },
              { arrow: [104, 57, 122, 57], c: "red", at: 5 },
              { text: "id 7c20...", x: 126, y: 58, size: 4.5, c: "red", mono: true, at: 5 },
              { text: "same payment, still valid, different id", x: 80, y: 76, a: "c", size: 5, c: "red", at: 5 },
              { text: "malleability", x: 80, y: 86, a: "c", size: 5.5, at: 6 }
            ] },
            say: [
              "Here is a transaction: the part that says what is paid to whom, and the signature that authorises it.",
              "Hash all of it, and you get the transaction's identifier.",
              "Now, a signature cannot sign itself, so it covers the payment details but not its own bytes.",
              "And a valid signature, it turns out, can be rewritten in a slightly different form that is still valid.",
              "One of the two numbers inside it can be replaced by its negative, for instance, and the check still passes.",
              "Anyone relaying the transaction could do that, with no key at all, and the payment would be the same but its identifier would not.",
              "This is called transaction malleability: the content is fixed, but the name is soft, like wet clay."
            ] },
          { slide: { k: "points", title: "Why a soft identifier hurts", start: 0, points: [
              "A sender may fail to recognise their own payment",
              "A follow-on payment points at a name that changed",
              "Agreements signed in advance fall apart"
            ] },
            at: "centre", g: "count",
            say: [
              { s: "No coins are stolen by this, so why does it matter?", g: "shrug" },
              { s: "First, software watching for its own transaction by name could miss it, and conclude that the payment had failed.", show: 1 },
              { s: "Second, and worse, a transaction that spends the first one refers to it by that identifier.", show: 2 },
              "If the identifier changes before the first is confirmed, the second points at nothing and becomes invalid.",
              { s: "So any scheme that signs a chain of transactions in advance was built on sand.", show: 3, g: "weigh" },
              "A proposal in 2014 listed nine separate ways a transaction could be altered like this, and tried to close them one by one.",
              "The proposal that became BIP 141 was blunter: take the signatures out of the identifier altogether."
            ] },
          { board: { clear: true, title: "The witness moves out", ops: [
              { text: "transaction", x: 41, y: 14, a: "c", size: 4, c: "grey", at: 0 },
              { box: [6, 18, 70, 34], at: 0 },
              { box: [10, 22, 62, 11], t: "inputs: which coins", at: 0 },
              { box: [10, 37, 62, 11], t: "outputs: new locks", at: 0 },
              { text: "witness", x: 125, y: 14, a: "c", size: 4, c: "blue", at: 1 },
              { box: [96, 18, 58, 34], c: "blue", dash: true, at: 1 },
              { box: [100, 22, 50, 11], t: "signatures", c: "blue", at: 1 },
              { box: [100, 37, 50, 11], t: "keys, scripts", c: "blue", at: 1 },
              { arrow: [41, 54, 41, 64], c: "green", at: 2 },
              { text: "id = hash of this part only", x: 41, y: 70, a: "c", size: 4.5, c: "green", at: 2 },
              { text: "still checked by every node", x: 125, y: 60, a: "c", size: 4, c: "blue", at: 4 },
              { text: "committed to by each block", x: 125, y: 68, a: "c", size: 4, c: "blue", at: 5 },
              { text: "a signed payment keeps its name", x: 80, y: 84, a: "c", size: 5, at: 6 }
            ] },
            say: [
              "Here is the same transaction, redrawn the new way.",
              "The data that unlocks each input, the signatures, keys and revealed scripts, moves into a separate compartment called the witness.",
              "The identifier is now computed from the left-hand part only: which coins are spent, and which new locks are made.",
              "Witness is the cryptographer's word for evidence, and segregated simply means set apart.",
              "Nothing has been thrown away, for every node still receives the witness and still checks every signature.",
              "And each block still commits to the witnesses inside it, through a second identifier that does include them.",
              { s: "But tweak a signature now, and the transaction's name does not move by a single bit.", g: "pinch" }
            ] },
          { slide: { k: "code", title: "The new shape of a lock", start: 2, lines: [
              "# before: the lock is a script",
              "DUP  HASH160  <key hash>  EQUALVERIFY  CHECKSIG",
              "",
              "# after: a version number and a fingerprint",
              "0  <20-byte key hash>",
              "0  <32-byte script hash>",
              "",
              "# the witness, kept apart",
              "<signature>  <public key>"
            ] },
            at: "screen", g: "point",
            say: [
              "To use the witness, an output needs a new kind of lock, and it is startlingly short.",
              { s: "It is a version number, zero, followed by a fingerprint, and nothing else.", show: 5 },
              "With a 20-byte fingerprint it means pay to a key's hash, and nodes know to demand a signature and a key in the witness.",
              { s: "With a 32-byte fingerprint it means pay to a script's hash, now a full SHA-256 hash, with the script revealed in the witness.", show: 6 },
              { s: "The steps we walked through on the board still happen, but the template implies them and no longer spells them out.", show: 9 },
              "And that leading zero is the quiet masterstroke.",
              { s: "It is a version number for locks, running from 0 to 16, so entirely new kinds of lock can be added later under the next number.", g: "up" }
            ] },
          { slide: { k: "points", title: "Segregated witness, in sum", start: 0, points: [
              "Identifiers no longer depend on signatures",
              "A signature now also covers the amount being spent",
              "Checking many signatures no longer balloons",
              "Every lock carries a version number"
            ] },
            at: "left", g: "open",
            say: [
              { s: "Let me collect what changed when this came into force, in 2017.", show: 1 },
              "For payments that use the new locks, identifiers became firm, and that is the ground lecture 14's payment channels stand on.",
              { s: "A companion proposal, BIP 143, changed what a signature covers, so that it includes the amount of the coin being spent.", show: 2 },
              "A signing device kept offline can therefore check the amount of each coin it signs for, because if it was lied to, its signature will simply be invalid.",
              { s: "The same proposal repaired a quirk in which checking a transaction with many signatures took work that grew as the square of its size.", show: 3 },
              { s: "And every lock now begins with a version number, a door left open on purpose.", show: 4 },
              "There are consequences for block space too, but that is economics, and it belongs to lecture 10."
            ] },
          { say: ["One check on why all this was done.", "What problem did segregated witness put an end to?"],
            quiz: {
              q: "What problem did segregated witness put an end to?",
              options: [
                "Public keys being visible in the ledger",
                "Scripts that loop for ever",
                "Coins being spent without any signature",
                "Outsiders changing a transaction's identifier"
              ],
              answer: 3,
              right: ["Yes: with the signatures set apart, a signed payment keeps its name."],
              wrong: [
                ["Keys are still revealed when a coin is spent.", "The problem it ended was malleability, where an outsider could change a transaction's identifier."],
                ["Script never had loops, so there was nothing to end.", "Segregated witness stopped outsiders changing a transaction's identifier by tweaking its signatures."],
                ["Signatures were always required, before and after.", "What ended was malleability: outsiders could no longer change a transaction's identifier."],
                null
              ]
            } }
        ] },

      { id: "taproot", title: "Taproot", topics: ["taproot", "schnorr", "bip 340", "bip 341", "bip 342", "key path", "script tree", "tapscript"],
        beats: [
          { slide: { k: "section", title: "Taproot", sub: "BIP 340, 341 and 342: one key, many conditions" },
            at: "lectern", g: "open",
            say: [
              "The next version number, one, was claimed in 2021 by an upgrade called taproot.",
              "It arrived as three proposals that fit together: BIP 340, 341 and 342.",
              "To see what it mends, look at what every lock so far gives away when it is opened.",
              { s: "Spend from a two of three lock, and the whole world sees all three keys and learns exactly how you guard your money.", g: "lean" },
              "Spend from our company lock with its 90-day backup, and you publish the backup plan even if you never used it.",
              "A script behind a hash is private only until the first time it is used."
            ] },
          { slide: { k: "points", title: "BIP 340: a new kind of signature", start: 0, points: [
              "Schnorr signatures: 64 bytes, with 32-byte public keys",
              "Several public keys can be combined into one",
              "The group can then produce a single signature",
              "To an observer: one key, one signature, nothing more"
            ] },
            at: "centre", g: "open",
            say: [
              { s: "The first piece is a different signature scheme, named after the cryptographer Claus Schnorr.", show: 1 },
              "Its mathematics belongs with lecture 3, so here is only the property we need.",
              { s: "With these signatures, several people's public keys can be combined into a single public key.", show: 2 },
              { s: "And those people, working together, can produce a single signature that is valid for the combined key.", show: 3 },
              { s: "To everyone else it is indistinguishable from one person signing with one key.", show: 4, g: "pinch" },
              "Three directors who all agree no longer need a lock that names three keys; they need a lock that names one."
            ] },
          { slide: { k: "figure", title: "One lock, two ways to open it", ops: [
              { box: [50, 4, 60, 12], t: "1  <32-byte key>", c: "amber", fill: true, size: 4.5 },
              { text: "the whole lock", x: 80, y: 21, a: "c", size: 3.5, c: "grey" },
              { arrow: [62, 24, 38, 34], c: "green", at: 1 },
              { box: [6, 36, 60, 12], t: "key path", c: "green", at: 1 },
              { text: "one signature", x: 36, y: 53, a: "c", size: 4, at: 1 },
              { text: "looks like any other payment", x: 36, y: 60, a: "c", size: 3.5, c: "grey", at: 2 },
              { arrow: [98, 24, 122, 34], c: "blue", at: 3 },
              { box: [94, 36, 60, 12], t: "script path", c: "blue", at: 3 },
              { text: "reveal one script, satisfy it", x: 124, y: 53, a: "c", size: 4, at: 5 },
              { text: "the unused scripts stay hidden", x: 124, y: 60, a: "c", size: 3.5, c: "grey", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "The second piece, BIP 341, is the lock itself: the version number one, and a single 32-byte public key.",
              "The simplest way to open it is the key path: supply one signature for that key, and you are done.",
              "Whether that key belongs to one person or to twenty who combined theirs, nobody can tell.",
              "But the same lock has a second way in, the script path.",
              "Hidden inside that one key there can be a whole collection of alternative scripts, each a different condition for spending.",
              "To use one, you reveal that script alone, prove it belonged to the collection, and satisfy it.",
              { s: "How do you hide a collection of scripts inside a key?", g: "shrug" },
              "With a tree, and you met the tree in lecture 2."
            ] },
          { board: { clear: true, title: "A tree of scripts inside one key", ops: [
              { box: [6, 70, 28, 12], t: "script A", at: 0 },
              { box: [46, 70, 28, 12], t: "script B", at: 0 },
              { box: [86, 70, 28, 12], t: "script C", at: 0 },
              { box: [126, 70, 28, 12], t: "script D", at: 0 },
              { line: [20, 70, 36, 60], at: 1 },
              { line: [60, 70, 44, 60], at: 1 },
              { box: [28, 50, 24, 10], t: "hash", c: "blue", at: 1 },
              { line: [100, 70, 116, 60], at: 1 },
              { line: [140, 70, 124, 60], at: 1 },
              { box: [108, 50, 24, 10], t: "hash", c: "blue", at: 1 },
              { line: [40, 50, 70, 40], at: 1 },
              { line: [120, 50, 90, 40], at: 1 },
              { box: [66, 30, 28, 10], t: "root", c: "amber", at: 1 },
              { box: [6, 6, 38, 11], t: "internal key", c: "green", at: 3 },
              { text: "+", x: 50, y: 12, a: "c", size: 6, at: 4 },
              { arrow: [80, 30, 80, 19], c: "amber", at: 4 },
              { box: [56, 6, 48, 11], t: "nudge from root", c: "amber", at: 4 },
              { text: "=", x: 110, y: 12, a: "c", size: 6, at: 4 },
              { box: [116, 6, 40, 11], t: "output key", c: "red", at: 4 },
              { text: "in the ledger", x: 136, y: 23, a: "c", size: 4, c: "red", at: 5 }
            ] },
            say: [
              "Write each alternative condition as its own small script, and make each one a leaf.",
              "Hash the leaves in pairs, then hash the results, until a single fingerprint is left: the root.",
              "As in lecture 2, that root commits to every leaf, and any one leaf can be proved with a short path of hashes.",
              "Now take an ordinary public key, which the proposal calls the internal key.",
              "Nudge that key by an amount computed from the key and the root, and you get a new public key, the output key.",
              "That output key is the only thing written in the ledger.",
              "The holders of the internal key can still sign for the output key directly, because they know the nudge.",
              { s: "And anyone can check that a revealed leaf belongs, by rebuilding the root and the nudge from its path.", g: "point" }
            ] },
          { slide: { k: "compare", title: "Opening a taproot lock",
              left: { head: "All agree: the key path", points: ["One 64-byte signature", "No script revealed at all", "What the tree says stays unknown"] },
              right: { head: "Otherwise: the script path", points: ["The one script being used", "The internal key", "A path of hashes to the root", "Every other leaf stays hidden"] } },
            at: "left", g: "weigh",
            say: [
              "So let us open the lock both ways.",
              "If all the parties agree, they sign together down the key path: one 64-byte signature on the chain, and no hint of any script.",
              "If they cannot agree, someone falls back on a leaf, say the backup key after 90 days.",
              "They reveal that one script, the internal key, and the few hashes that join the leaf to the root.",
              "The world learns that one condition, and nothing of what the other leaves say.",
              { s: "One key that can stand for many conditions, of which only the one used is ever shown.", g: "up" },
              "And because people who agree can always use the key path, the elaborate arrangement and the simple one look the same on the chain."
            ] },
          { slide: { k: "points", title: "BIP 342: Script, refreshed", start: 0, points: [
              "Scripts in the leaves use the new signatures",
              "CHECKMULTISIG retired; CHECKSIGADD keeps a tally",
              "Old caps on script size and instruction count lifted",
              "Spare instructions reserved for future upgrades"
            ] },
            at: "right", g: "count",
            say: [
              { s: "The third piece, BIP 342, tidies up the Script that runs inside the leaves.", show: 1 },
              { s: "The old check multisig, with its throwaway zero, is switched off there, replaced by an instruction that checks one signature at a time and keeps a tally.", show: 2 },
              { s: "The old caps of 10,000 bytes a script and 201 instructions are lifted, because other limits already bound the work.", show: 3 },
              { s: "And a batch of unused instructions is set aside, so that new ones can be added later with less ceremony.", show: 4 },
              { s: "It is still the same small language: a stack, no loops, true or false.", g: "open" }
            ] },
          { say: ["This is the idea I most want you to carry out of the room.", "When a taproot coin is spent by one of its scripts, what is revealed?"],
            quiz: {
              q: "When a taproot coin is spent by one of its scripts, what is revealed?",
              options: [
                "The private key behind the output",
                "Every script in the tree",
                "Only the script used, and proof it was in the tree",
                "Nothing at all, not even the script used"
              ],
              answer: 2,
              right: ["That is it: one leaf, a path of hashes, and the rest stays private."],
              wrong: [
                ["A private key is never revealed by any spend, of any kind.", "What is shown is the one script used, and a proof that it was in the tree."],
                ["Showing every script was the weakness of the older locks.", "A taproot script spend reveals only the script used, with a proof that it belongs to the tree."],
                null,
                ["The network cannot check a condition it is never shown.", "The script used is revealed, with proof it was in the tree, and the others stay hidden."]
              ]
            } }
        ] },

      { id: "locks-in-review", title: "Twelve Years of Locks", topics: ["summary", "timeline of locks", "commit and reveal", "next lecture", "blocks"],
        beats: [
          { slide: { k: "section", title: "Twelve Years of Locks", sub: "The pattern, and what comes next" },
            at: "lectern", g: "open",
            say: [
              "Let me step back and put the whole key ring on one page.",
              { s: "Seven rows, twelve years, and one small language underneath all of them.", g: "wide" }
            ] },
          { slide: { k: "table", title: "The locks, in order of appearance", start: 0, head: ["Year", "Lock", "What the ledger shows"], rows: [
              ["2009", "Pay to public key", "the key itself"],
              ["2009", "Pay to a key's hash", "a key's fingerprint"],
              ["2012", "Several signatures", "every key in the group"],
              ["2012", "Pay to script hash", "a script's fingerprint"],
              ["2015-16", "Time locks", "a date or a waiting time"],
              ["2017", "Segregated witness", "version 0 + fingerprint"],
              ["2021", "Taproot", "version 1 + one key"]
            ], note: "Years of first release or of taking effect; BIP 11 was written in 2011 and shipped in 2012." },
            at: "screen", g: "point",
            say: [
              { s: "In 2009, a coin was locked to a key, or to a key's fingerprint.", show: 2 },
              { s: "In 2012, paying to several keys at once became a standard form.", show: 3 },
              { s: "In 2012, any script at all could hide behind a 20-byte fingerprint.", show: 4 },
              { s: "In 2015 and 2016, locks learned to wait, for a date or for a coin to age.", show: 5 },
              { s: "In 2017, the evidence moved into the witness, and locks gained a version number.", show: 6 },
              { s: "And in 2021, a single key learned to stand for a whole tree of conditions.", show: 7 }
            ] },
          { at: "centre", g: "open",
            say: [
              "Run your eye down the right-hand column, and you can watch the ledger learn discretion.",
              "At first the lock shows everything: the key, every key, every condition.",
              "Then it shows a fingerprint, and reveals the rest only at the moment of spending.",
              "Finally it shows one key, and reveals only the single condition that was actually used.",
              { s: "Each step asks the public ledger to hold less and to learn less, while every node still checks all it needs to.", g: "weigh" },
              { s: "And through all of it the first rule never changed: a coin moves when its program finishes true.", g: "pinch" }
            ] },
          { slide: { k: "points", title: "What to take away", start: 0, points: [
              "Every output carries a program; spending makes it true",
              "Script is small and loop-free so every node can run it",
              "Fingerprint now, reveal later: the recurring trick",
              "Segregated witness made identifiers firm",
              "Taproot: one key, many conditions, one revealed"
            ] },
            at: "right", g: "count",
            say: [
              { s: "So, five things to keep.", g: "open" },
              { s: "A coin is not so much owned as locked, and the lock is a program.", show: 1 },
              { s: "The language is small on purpose, because the whole world has to run it and agree.", show: 2 },
              { s: "The recurring trick is to commit with a hash now and reveal later.", show: 3 },
              { s: "Setting the signatures apart gave transactions a name that cannot be changed from outside.", show: 4 },
              { s: "And taproot lets many possible conditions hide behind one ordinary-looking key.", show: 5 }
            ] },
          { slide: { k: "figure", title: "Next time: blocks and the chain", ops: [
              { box: [6, 8, 22, 9], t: "tx" },
              { box: [6, 22, 22, 9], t: "tx" },
              { box: [6, 36, 22, 9], t: "tx" },
              { arrow: [30, 12, 50, 22], at: 1 },
              { arrow: [30, 26, 50, 26], at: 1 },
              { arrow: [30, 40, 50, 30], at: 1 },
              { box: [52, 8, 40, 38], c: "amber", at: 2 },
              { text: "block", x: 72, y: 15, a: "c", size: 4.5, c: "amber", at: 2 },
              { box: [56, 20, 32, 9], t: "header", c: "blue", at: 2 },
              { text: "transactions", x: 72, y: 38, a: "c", size: 3.8, c: "grey", at: 2 },
              { line: [92, 27, 104, 27], at: 3 },
              { box: [104, 18, 20, 18], t: "block", at: 3 },
              { line: [124, 27, 134, 27], at: 3 },
              { box: [134, 18, 20, 18], t: "block", at: 3 },
              { text: "what holds the pages in order?", x: 80, y: 57, a: "c", size: 4.5, c: "red", at: 3 }
            ] },
            at: "lectern", g: "open",
            say: [
              "We now know what a transaction says, and what makes it valid.",
              "What we have not yet asked is where valid transactions go.",
              "They are gathered into blocks, and each block has a small header that summarises everything inside it.",
              "Each header also points back at the block before, and that chain of pointers is what gives the ledger its order.",
              "Next time, in lecture 6, Blocks and the Chain, we open a block the way we opened a transaction.",
              "If you want to go further before then, BIP 16 and the opening of BIP 341 are short, and you can now follow them.",
              { s: "Thank you, and I will see you in lecture 6.", g: "up" }
            ] }
        ] }
    ]
  });
})();
