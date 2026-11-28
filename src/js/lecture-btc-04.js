// Bitcoin from First Principles, lecture 4: a ledger with no accounts and no balances, only unspent outputs; a transaction that spends whole outputs and makes new ones (change, and the fee as what is left over); the satoshi; a wallet's balance as a sum; the payment in block 170 read field by field; the transaction ID; the coinbase transaction; and the set of unspent outputs every node keeps.
(() => {
  "use strict";
  window.BL.lectures.add({
    id: "btc-04", course: "first-principles", n: 4, title: "Coins Are Outputs",
    reading: [
      { title: "Bitcoin: A Peer-to-Peer Electronic Cash System, sections 2 and 9", by: "Satoshi Nakamoto, 2008" },
      { title: "Developer Guide: Transactions", by: "Bitcoin developer documentation" },
      { title: "The payment in block 170, on any block explorer", by: "transaction f4184fc5...9e16" }
    ],
    sources: [
      "Satoshi Nakamoto, Bitcoin: A Peer-to-Peer Electronic Cash System (2008), section 2 (Transactions) and section 9 (Combining and Splitting Value), https://bitcoin.org/bitcoin.pdf",
      "Bitcoin developer documentation, Developer Guide: Transactions (unspent outputs, change, fees, locktime), https://developer.bitcoin.org/devguide/transactions.html",
      "Bitcoin developer documentation, Reference: Transactions (raw transaction format, TxIn, outpoint, TxOut, coinbase input), https://developer.bitcoin.org/reference/transactions.html",
      "Bitcoin developer documentation, Developer Guide: Block Chain (the coinbase transaction, fees, the 100-block wait), https://developer.bitcoin.org/devguide/block_chain.html",
      "The payment in block 170, transaction f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16: its raw bytes, fields, block time and the later spends of both outputs, https://mempool.space/tx/f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16 and https://mempool.space/api/tx/f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16/hex",
      "Block 9's coinbase transaction, 0437cd7f8525ceed2324359c2d0ba26006d92d856a9c20fa0241106ee5a597c9, https://mempool.space/tx/0437cd7f8525ceed2324359c2d0ba26006d92d856a9c20fa0241106ee5a597c9",
      "Eric Lombrozo, Johnson Lau and Pieter Wuille, BIP 141: Segregated Witness (Consensus layer), https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki",
      "Eric Lombrozo and Pieter Wuille, BIP 144: Segregated Witness (Peer Services), https://github.com/bitcoin/bips/blob/master/bip-0144.mediawiki",
      "Bitcoin Wiki, Satoshi (unit), https://en.bitcoin.it/wiki/Satoshi_(unit), and Segregated Witness, https://en.bitcoin.it/wiki/Segregated_Witness",
      "mempool.space research, UTXO Set Report, https://research.mempool.space/utxo-set-report/"
    ],
    sections: [
      { id: "no-accounts", title: "No Accounts, No Balances", topics: ["accounts", "balances", "coins", "signatures recap", "chain of signatures", "what is signed"],
        beats: [
          { slide: { k: "title", kicker: "Lecture 4", title: "Coins Are Outputs", sub: "No accounts, no balances: one transaction, byte by byte" },
            at: "lectern", g: "open",
            say: [
              "Welcome back to Bitcoin from First Principles.",
              "Last time we built the tool that says who may spend: a secret key signs, and anyone holding the public key can check the signature.",
              "A signature proves that the keyholder approved one exact message, and not a letter more.",
              { s: "But I left a question hanging: what, exactly, is the message?", g: "lean" },
              "Today we open the ledger itself and read what is written there.",
              "The first surprise is what is missing, because there are no accounts in it, and no balances.",
              { s: "There are only coins, and by the end of the hour you will have read one, byte by byte.", g: "point" }
            ] },
          { slide: { k: "compare", title: "Two ways to keep a ledger",
              left: { head: "A book of accounts", points: ["One row for each customer", "Each row ends in a balance", "A payment edits two rows", "The keeper knows whose row it is"] },
              right: { head: "Bitcoin's ledger", points: ["No rows for people at all", "Only separate coins", "A payment uses coins up", "Each coin carries its own lock"] } },
            at: "left", g: "weigh",
            say: [
              "Think of how the keeper from lecture 1 does the job.",
              "The keeper has a book with a row for every customer, and each row ends in a number, the balance.",
              "A payment takes a little off one row and adds it to another.",
              { s: "Bitcoin's ledger has no rows for people at all.", g: "chop" },
              "It records coins: separate lumps of value, each with its own amount and its own lock.",
              "A payment does not edit a number; it uses whole coins up and makes new ones."
            ] },
          { slide: { k: "figure", title: "What is in your pocket?", ops: [
              { text: "In your pocket", x: 46, y: 5, a: "c", size: 4, c: "grey" },
              { text: "In your head", x: 128, y: 5, a: "c", size: 4, c: "grey" },
              { line: [96, 2, 96, 60], c: "grey", dash: true },
              { box: [6, 14, 26, 12], t: "20", c: "green", at: 1 },
              { box: [36, 14, 26, 12], t: "10", c: "green", at: 1 },
              { box: [66, 14, 22, 12], t: "5", c: "green", at: 1 },
              { circle: [20, 42, 6], t: "2", c: "amber", at: 1 },
              { circle: [40, 42, 6], t: "1", c: "amber", at: 1 },
              { text: "20 + 10 + 5 + 2 + 1", x: 128, y: 22, a: "c", size: 4.5, at: 3 },
              { text: "= 38", x: 128, y: 35, a: "c", size: 7, c: "blue", at: 3 },
              { text: "the pocket holds no total", x: 128, y: 50, a: "c", size: 4, c: "red", at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "You already use a ledger like this, and it is in your pocket.",
              "Suppose you are carrying a twenty, a ten, a five and two coins.",
              "Nowhere in your pocket is the number 38 written down.",
              { s: "Thirty-eight is a sum you work out, by looking at the separate pieces and adding.", g: "count" },
              "The pieces are the reality, and the total is only a convenient way of talking about them.",
              "Hold on to that picture, because Bitcoin works the same way, with one twist we will come to."
            ] },
          { slide: { k: "quote", text: "We define an electronic coin as a chain of digital signatures.", by: "Satoshi Nakamoto, Bitcoin whitepaper, section 2, 2008" },
            at: "centre", g: "open",
            say: [
              "Here is how the whitepaper puts it, in section 2.",
              { s: "A coin is defined as a chain of digital signatures.", g: "point" },
              "Each owner hands the coin on by signing a message that says who gets it next.",
              "So a coin is not an object at all; it is a history of handovers, each one signed by the owner before.",
              "That answers my hanging question, because the message being signed is a transaction.",
              "A transaction is the one and only kind of entry in Bitcoin's ledger, so let us look at its shape."
            ] }
        ] },

      { id: "inputs-outputs", title: "Whole Coins In, New Coins Out", topics: ["inputs", "outputs", "change", "fee", "combining", "splitting", "transaction rules"],
        beats: [
          { slide: { k: "section", title: "Whole Coins In, New Coins Out", sub: "Inputs, outputs, change and the fee" },
            at: "lectern", g: "open",
            say: [
              "Go back to that twenty in your pocket.",
              "If you owe a stallholder seven, you cannot tear the note in two.",
              "You hand over the whole twenty, and thirteen comes back as change.",
              { s: "A Bitcoin coin is just as untearable: it can only ever be spent whole.", g: "pinch" },
              "The twist is that nobody hands you change; you write your own change into the payment."
            ] },
          { board: { clear: true, title: "One transaction", ops: [
              { text: "mine", x: 23, y: 25, a: "c", size: 4, c: "grey", at: 1 },
              { box: [6, 30, 34, 16], t: "coin: 8", c: "amber", at: 1 },
              { arrow: [42, 38, 62, 38], at: 2 },
              { box: [64, 22, 30, 32], t: "tx", c: "blue", at: 2 },
              { arrow: [96, 30, 116, 22], at: 3 },
              { box: [118, 14, 36, 14], t: "3 to shop", c: "green", at: 3 },
              { arrow: [96, 46, 116, 54], at: 4 },
              { box: [118, 48, 36, 14], t: "4.9 to me", c: "green", at: 4 },
              { text: "change", x: 136, y: 68, a: "c", size: 4, c: "grey", at: 4 },
              { text: "8 - 3 - 4.9 = 0.1", x: 8, y: 70, size: 5, at: 5 },
              { text: "left over = the fee", x: 8, y: 80, size: 5, c: "red", at: 5 },
              { line: [6, 30, 40, 46], c: "red", at: 6 },
              { text: "spent", x: 23, y: 53, a: "c", size: 4, c: "red", at: 6 }
            ] },
            say: [
              "Let me draw one.",
              "Suppose I hold a coin worth 8, in whatever unit you like for now.",
              "I want to pay a shop 3, so I write a transaction, and my coin goes in on the left.",
              "On the right I create a brand new coin worth 3, locked so that only the shop can spend it.",
              "Then I create a second new coin, worth 4.9, locked back to myself, and that is my change.",
              { s: "In went 8 and out came 7.9, so a tenth is left over, and that leftover is the fee.", g: "pinch" },
              "My old coin of 8 is now spent, used up for ever, and two new coins exist in its place."
            ] },
          { slide: { k: "points", title: "Four words to keep", start: 0, points: [
              "Input: an earlier output, being used up",
              "Output: a new coin, with an amount and a lock",
              "Change: an output you send back to yourself",
              "Fee: whatever the outputs leave unclaimed"
            ] },
            at: "centre", g: "open",
            say: [
              "Now the proper names.",
              { s: "The coins going in are called inputs, and the new coins coming out are called outputs.", show: 2 },
              { s: "And here is the title of today's lecture: a coin simply is an output that nobody has spent yet.", g: "up" },
              "Every input is some earlier transaction's output, being used up.",
              { s: "Change is not a special thing, just an ordinary output that happens to be locked to your own key.", show: 3 },
              { s: "The fee is never written down anywhere; it is whatever the outputs fail to claim.", show: 4 },
              "Whoever adds the transaction to a block collects it, and lectures 7 and 10 explain who and why."
            ] },
          { slide: { k: "quote", text: "To allow value to be split and combined, transactions contain multiple inputs and outputs.", by: "Satoshi Nakamoto, Bitcoin whitepaper, section 9, 2008" },
            at: "right", g: "open",
            say: [
              "The whitepaper gives this a short section of its own, section 9.",
              "Splitting we have just seen: one coin in, two coins out.",
              { s: "Combining is the other direction, for when no single coin of yours is big enough.", g: "weigh" }
            ] },
          { slide: { k: "figure", title: "Combining: several coins in", ops: [
              { box: [6, 6, 30, 10], t: "2", c: "amber" },
              { box: [6, 22, 30, 10], t: "3", c: "amber" },
              { box: [6, 38, 30, 10], t: "1.5", c: "amber" },
              { arrow: [38, 11, 62, 23], at: 1 },
              { arrow: [38, 27, 62, 27], at: 1 },
              { arrow: [38, 43, 62, 31], at: 1 },
              { box: [64, 16, 28, 22], t: "tx", c: "blue", at: 1 },
              { arrow: [94, 22, 116, 14], at: 2 },
              { box: [118, 7, 36, 12], t: "6 to shop", c: "green", at: 2 },
              { arrow: [94, 32, 116, 40], at: 3 },
              { box: [118, 34, 36, 12], t: "0.4 to me", c: "green", at: 3 },
              { text: "in: 6.5     out: 6.4     fee: 0.1", x: 80, y: 58, a: "c", size: 4.5, at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "Say I hold three small coins, of 2, 3 and 1.5, and I owe a shop 6.",
              "All three go in as inputs, each one unlocked with its own signature.",
              "Out comes one coin of 6 for the shop.",
              "The total going in was 6.5, so I send 0.4 back to myself as change.",
              { s: "And the last tenth, as before, is the fee.", g: "pinch" },
              "A transaction may have many inputs and many outputs, so one transaction can pay a hundred people at once."
            ] },
          { slide: { k: "points", title: "The rules of every transaction", start: 0, points: [
              "Every input is an output that nobody has spent",
              "Each input is spent whole, never in part",
              "Each input needs a valid unlock, such as a signature",
              "Outputs may not add up to more than inputs",
              "Whatever is left over is the fee"
            ] },
            at: "centre", g: "count",
            say: [
              { s: "Rule one: every input must point at a real output that nobody has spent before.", show: 1 },
              { s: "Rule two: an input is spent whole, never in part.", show: 2 },
              { s: "Rule three: each input must be unlocked, which so far means signed by the right key.", show: 3 },
              { s: "Rule four: the outputs may not add up to more than the inputs, or you would be printing money.", show: 4, g: "chop" },
              { s: "And rule five is less a rule than a consequence: whatever is left over is the fee.", show: 5 },
              { s: "That last one has a sting in it.", g: "lean" },
              "If you forget to write your change output, the network does not stop to ask whether you meant it."
            ] },
          { say: ["Let me see whether the sting has landed.", "You spend a coin of 8 to pay a shop 3, and you write no other output: what happens to the remaining 5?"],
            quiz: {
              q: "You spend a coin of 8 to pay 3, with no other output. What happens to the remaining 5?",
              options: [
                "The transaction is rejected as invalid",
                "It stays in your old coin, ready to spend later",
                "It is returned to you automatically",
                "It becomes the fee"
              ],
              answer: 3,
              right: ["Exactly: whatever the outputs do not claim is the fee, all 5 of it."],
              wrong: [
                ["It breaks no rule, since the outputs add up to less than the inputs.", "The transaction is valid, and the unclaimed 5 becomes the fee."],
                ["The old coin cannot keep anything, because a coin is always spent whole.", "With no change output, the remaining 5 becomes the fee."],
                ["Nothing comes back by itself, because change is an output you must write yourself.", "Unclaimed value is the fee, so all 5 goes to whoever puts the transaction in a block."],
                null
              ]
            } }
        ] },

      { id: "satoshis-and-balances", title: "Satoshis, and a Sum Called Balance", topics: ["satoshi", "units", "whole numbers", "balance", "wallet", "many small coins"],
        beats: [
          { slide: { k: "section", title: "Satoshis, and a Sum Called Balance", sub: "The unit of the ledger, and what a wallet adds up" },
            at: "lectern", g: "open",
            say: [
              "I have been saying 8, and 3, and 4.9, in units I refused to name.",
              "It is time to name them, because the ledger has no decimal point in it anywhere.",
              "Amounts are whole numbers, counted in the smallest unit there is."
            ] },
          { slide: { k: "number", value: "100,000,000", label: "satoshis in one bitcoin", note: "Every amount on the ledger is a whole number of satoshis" },
            at: "centre", g: "open",
            say: [
              "That smallest unit is called the satoshi, a name its users chose in honour of the inventor.",
              { s: "One bitcoin is one hundred million satoshis.", g: "wide" },
              "So a bitcoin is not really a thing on the ledger; it is a handy name for a hundred million of the real unit.",
              "Ten bitcoins, the amount in the famous first payment, is written as one billion satoshis.",
              "Whole numbers matter here, because every computer adds whole numbers and gets exactly the same answer.",
              "Nothing is ever rounded, so no dispute can begin over the last decimal place."
            ] },
          { slide: { k: "figure", title: "Your balance is a sum", ops: [
              { text: "every unspent output there is", x: 52, y: 5, a: "c", size: 4, c: "grey" },
              { box: [6, 10, 20, 9], t: "70", c: "grey" },
              { box: [30, 10, 20, 9], t: "5", c: "grey" },
              { box: [54, 10, 20, 9], t: "120", c: "grey" },
              { box: [78, 10, 20, 9], t: "9", c: "grey" },
              { box: [6, 23, 20, 9], t: "33", c: "grey" },
              { box: [30, 23, 20, 9], t: "400", c: "grey" },
              { box: [54, 23, 20, 9], t: "18", c: "grey" },
              { box: [78, 23, 20, 9], t: "47", c: "grey" },
              { box: [6, 36, 20, 9], t: "250", c: "grey" },
              { box: [30, 36, 20, 9], t: "12", c: "grey" },
              { box: [54, 36, 20, 9], t: "8", c: "grey" },
              { box: [78, 36, 20, 9], t: "61", c: "grey" },
              { box: [54, 10, 20, 9], t: "120", c: "green", fill: true, at: 2 },
              { box: [6, 23, 20, 9], t: "33", c: "green", fill: true, at: 2 },
              { box: [78, 23, 20, 9], t: "47", c: "green", fill: true, at: 2 },
              { arrow: [101, 27, 110, 27], at: 3 },
              { text: "120 + 33 + 47", x: 135, y: 21, a: "c", size: 4.5, at: 3 },
              { text: "= 200", x: 135, y: 33, a: "c", size: 7, c: "green", at: 4 },
              { text: "your wallet's sum", x: 135, y: 42, a: "c", size: 3.6, c: "grey", at: 4 },
              { text: "stored on the ledger: nowhere", x: 80, y: 58, a: "c", size: 4.5, c: "red", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "Now we can say what a balance is.",
              "Picture every unspent output in existence, laid out on one enormous table.",
              "A few of them are locked to keys that you hold.",
              { s: "Your wallet software searches the table for those, and adds their amounts together.", g: "count" },
              "That sum is the number it shows you, and it calls it your balance.",
              { s: "But the ledger itself has never stored that number, and has no idea that those three coins share an owner.", g: "shrug" }
            ] },
          { at: "left", g: "open",
            say: [
              "This has consequences you can feel.",
              { s: "Two people can both be shown 200, where one holds a single coin and the other holds a thousand crumbs.", g: "weigh" },
              "The second will need a far bigger transaction to spend it all, since every crumb is an input of its own.",
              "And because coins are separate, nothing written on the ledger ties your coins to one another, or to your name.",
              "Lecture 12 looks hard at how much that really protects you."
            ] },
          { say: ["A quick check on that idea.", "Where does Bitcoin's ledger store your balance?"],
            quiz: {
              q: "Where does Bitcoin's ledger store your balance?",
              options: [
                "In the last transaction you sent",
                "Nowhere: your wallet adds up your unspent outputs",
                "In the newest block, updated every ten minutes",
                "In an account row under your public key"
              ],
              answer: 1,
              right: ["Right: the ledger holds only coins, and the balance is your wallet's arithmetic."],
              wrong: [
                ["A transaction records only the coins it spends and the coins it makes.", "Your balance is stored nowhere; your wallet works it out by adding up your unspent outputs."],
                null,
                ["A block holds transactions, not a table of balances.", "No balance is stored anywhere; your wallet adds up the unspent outputs your keys can unlock."],
                ["There are no account rows on the ledger, under a key or under anything else.", "The balance is stored nowhere; your wallet adds up the unspent outputs your keys can unlock."]
              ]
            } }
        ] },

      { id: "byte-by-byte", title: "One Transaction, Byte by Byte", topics: ["block 170", "raw transaction", "version", "input", "output", "locktime", "sequence", "hal finney", "hexadecimal"],
        beats: [
          { slide: { k: "section", title: "One Transaction, Byte by Byte", sub: "The payment in block 170, 12 January 2009" },
            at: "lectern", g: "open",
            say: [
              "Enough of my invented numbers; let us read a real one.",
              "In lecture 1 I told you about the first payment between two people: Satoshi sending Hal Finney 10 bitcoins.",
              "It sits in block 170, and it has been public since 12 January 2009.",
              { s: "It is 275 bytes long, and we are going to read every part of it.", g: "glasses" }
            ] },
          { board: { clear: true, title: "Block 170: Satoshi pays Hal", ops: [
              { text: "made in block 9", x: 24, y: 27, a: "c", size: 4, c: "grey", at: 1 },
              { box: [4, 32, 40, 18], t: "50 bitcoins", c: "amber", at: 1 },
              { arrow: [46, 41, 62, 41], at: 2 },
              { box: [64, 26, 30, 30], t: "tx", c: "blue", at: 2 },
              { arrow: [96, 34, 114, 24], at: 3 },
              { box: [116, 14, 40, 16], t: "10 to Hal", c: "green", at: 3 },
              { arrow: [96, 48, 114, 58], at: 4 },
              { box: [116, 52, 40, 16], t: "40 change", c: "green", at: 4 },
              { text: "back to Satoshi", x: 136, y: 74, a: "c", size: 4, c: "grey", at: 4 },
              { text: "50 - 10 - 40 = 0", x: 6, y: 70, size: 5, at: 5 },
              { text: "fee: none", x: 6, y: 80, size: 5, c: "red", at: 5 }
            ] },
            say: [
              "First the shape, on the board.",
              "Satoshi held one coin of 50 bitcoins, which had been created three days earlier, in block 9.",
              "That whole coin went in as the single input.",
              "The first output is 10 bitcoins, locked to Hal Finney's public key.",
              "The second output is 40 bitcoins of change, locked straight back to Satoshi's own key.",
              { s: "Fifty in and fifty out, so the fee was nothing at all, which was normal when blocks were nearly empty.", g: "shrug" }
            ] },
          { slide: { k: "code", title: "All 275 bytes, in order", lines: [
              "01000000                              # version",
              "01                                    # number of inputs",
              "c997a5e5 ... 7fcd3704  00000000       # the coin being spent",
              "48  47304402204e45 ... 8d1d0901       # the unlock",
              "ffffffff                              # sequence",
              "02                                    # number of outputs",
              "00ca9a3b00000000  43  4104ae1a ... ac # 10 bitcoins, a lock",
              "00286bee00000000  43  410411db ... ac # 40 bitcoins, a lock",
              "00000000                              # locktime"
            ], note: "Bytes in hexadecimal; the three longest fields are cut short in the middle" },
            at: "screen", g: "glasses",
            say: [
              "Here it is, as it crossed the network and as it sits today on the disk of every node that keeps the full history.",
              "Each pair of characters is one byte, written in hexadecimal, the base-16 shorthand in which hashes are usually printed.",
              "I have cut the three longest fields short, so that it fits on the screen.",
              { s: "It looks like noise, but it is really a form with boxes, filled in from left to right.", g: "point" },
              "And the form has only four parts: a version, a list of inputs, a list of outputs and a locktime."
            ] },
          { slide: { k: "table", title: "The four parts", start: 0, head: ["Part", "Size", "In this transaction"], rows: [
              ["version", "4 bytes", "1"],
              ["inputs", "a count, then each one", "1 input"],
              ["outputs", "a count, then each one", "2 outputs"],
              ["locktime", "4 bytes", "0: valid straight away"]
            ] },
            at: "lectern", g: "count",
            say: [
              { s: "A transaction opens with four bytes of version number, which says which set of rules to read it by.", show: 1 },
              "This one says version 1, and most transactions made today say 2.",
              "You may have noticed the 1 comes first and the zeros after it: these numbers are stored smallest byte first.",
              { s: "Next comes a count of inputs, here just one, followed by the inputs themselves.", show: 2 },
              { s: "Then a count of outputs, here two, followed by the outputs.", show: 3 },
              { s: "And it closes with four bytes called the locktime.", show: 4 },
              "A locktime of zero means valid straight away; any other value is the earliest block, or the earliest time, at which it may join the chain."
            ] },
          { slide: { k: "table", title: "Inside the input", start: 0, head: ["Field", "What it holds"], rows: [
              ["transaction ID, 32 bytes", "the transaction that made the coin"],
              ["output number, 4 bytes", "which of its outputs: number 0"],
              ["unlock, 72 bytes here", "one signature by Satoshi's key"],
              ["sequence, 4 bytes", "ffffffff: nothing special"]
            ] },
            at: "screen", g: "point",
            say: [
              "Now the input, and this is the part people find strangest.",
              { s: "An input does not say 50 bitcoins, and it does not say Satoshi.", g: "chop" },
              { s: "It holds a pointer, which starts with the ID of an earlier transaction, 32 bytes long.", show: 1 },
              { s: "Four more bytes say which of that transaction's outputs is meant, counting from zero, and here it is output number 0.", show: 2 },
              { s: "After the pointer comes the unlock, which here is a single signature made with Satoshi's secret key.", show: 3 },
              "It is the proof, from last lecture, that the owner of that coin approved this exact spending of it.",
              { s: "Last come four bytes called the sequence, set here to their default, all ones, and they matter only for uses we meet later in the course.", show: 4 }
            ] },
          { slide: { k: "figure", title: "An input points backwards", ops: [
              { box: [6, 6, 60, 36], c: "grey" },
              { text: "transaction 0437cd7f...", x: 36, y: 13, a: "c", size: 3.6, c: "grey", mono: true },
              { box: [14, 22, 44, 12], t: "output 0: 50", c: "amber", fill: true },
              { text: "block 9", x: 36, y: 48, a: "c", size: 3.8, c: "grey" },
              { box: [96, 6, 58, 36], c: "blue" },
              { text: "transaction f4184fc5...", x: 125, y: 13, a: "c", size: 3.6, c: "blue", mono: true },
              { box: [104, 22, 42, 12], t: "input", c: "blue", at: 1 },
              { text: "block 170", x: 125, y: 48, a: "c", size: 3.8, c: "grey" },
              { arrow: [102, 28, 60, 28], c: "red", at: 1 },
              { text: "the amount lives in the old output, not in the input", x: 80, y: 59, a: "c", size: 4.2, c: "red", at: 3 }
            ] },
            at: "right", g: "point",
            say: [
              "Here is that pointer as a picture.",
              "The input in block 170 reaches back to output 0 of a transaction in block 9.",
              "To learn how much is being spent, you must go and look at that old output, where it says 50 bitcoins.",
              { s: "So the amount lives in the old output, and the new transaction only points at it.", g: "pinch" },
              "That is why a transaction cannot be checked on its own: you need to know which outputs exist.",
              "Keep that thought, because it is where today's lecture ends."
            ] },
          { say: ["Let me check that the strangest part has stuck.", "What does a transaction input contain?"],
            quiz: {
              q: "What does a transaction input contain?",
              options: [
                "A pointer to an earlier output, and the unlock for it",
                "The sender's balance before the payment",
                "The public key of the person being paid",
                "The amount being spent and the sender's name"
              ],
              answer: 0,
              right: ["Yes: a pointer back to one earlier output, and the proof that you may spend it."],
              wrong: [
                null,
                ["There are no balances anywhere on the ledger, so there is none to write down.", "An input is a pointer to an earlier output, together with the unlock for it."],
                ["The key of the person being paid sits in the new output's lock, not in the input.", "An input holds a pointer to an earlier output, and the unlock for it."],
                ["An input names no amount and no person.", "It holds a pointer to an earlier output, and the unlock that permits spending it."]
              ]
            } },
          { slide: { k: "table", title: "Inside the two outputs", start: 0, head: ["Field", "Output 0", "Output 1"], rows: [
              ["amount, 8 bytes", "1,000,000,000 satoshis", "4,000,000,000 satoshis"],
              ["in bitcoins", "10", "40"],
              ["lock, 67 bytes", "Hal Finney's public key", "Satoshi's public key"]
            ] },
            at: "lectern", g: "open",
            say: [
              "An output is simpler, with only two fields.",
              { s: "First the amount, as a whole number of satoshis in eight bytes: one billion for Hal, and four billion for the change.", show: 2 },
              { s: "Then the lock, which states the condition for spending this coin next.", show: 3 },
              "In these two the lock is as plain as a lock can be: a public key, and an instruction to check a signature against it.",
              "Whoever can sign with the matching secret key can spend the coin, and nobody else can.",
              "Locks can say far more interesting things than that, and they are the whole of the next lecture.",
              { s: "Notice what the output does not contain: no name, no account number, no running balance.", g: "chop" }
            ] },
          { board: { clear: true, title: "Reading an amount", ops: [
              { text: "00 ca 9a 3b 00 00 00 00", x: 80, y: 20, a: "c", size: 6, mono: true, at: 1 },
              { text: "as stored: smallest byte first", x: 80, y: 29, a: "c", size: 4, c: "grey", at: 1 },
              { arrow: [80, 33, 80, 41], at: 2 },
              { text: "00 00 00 00 3b 9a ca 00", x: 80, y: 49, a: "c", size: 6, c: "blue", mono: true, at: 2 },
              { text: "turned round: biggest byte first", x: 80, y: 58, a: "c", size: 4, c: "grey", at: 2 },
              { arrow: [80, 62, 80, 69], at: 3 },
              { text: "1,000,000,000 satoshis", x: 80, y: 76, a: "c", size: 6, c: "green", at: 3 },
              { text: "= 10 bitcoins", x: 80, y: 86, a: "c", size: 5.5, c: "amber", at: 4 }
            ] },
            say: [
              "Let me read one of those amounts by hand, so that you need not take my word for it.",
              "These are the eight bytes of Hal's amount exactly as they sit in the transaction, smallest byte first.",
              "Turn them round, biggest first, and you have the number as a person would write it in hexadecimal.",
              "Work that out in ordinary decimal, and it is exactly one billion satoshis.",
              "Divide by a hundred million, and there are Hal's 10 bitcoins.",
              { s: "There is no magic in the file, only whole numbers written down in an agreed order.", g: "open" }
            ] },
          { at: "centre", g: "open",
            say: [
              "Now I can finally answer the question I opened with.",
              { s: "The message that Satoshi's signature approves is this transaction: this coin in, these two outputs out.", g: "point" },
              "Change one amount, or swap Hal's key for your own, and the signature no longer fits.",
              { s: "So anyone may copy a transaction and pass it along, but nobody can redirect a single satoshi of it.", g: "pinch" }
            ] }
        ] },

      { id: "transaction-ids", title: "A Fingerprint for a Name", topics: ["transaction ID", "txid", "double sha-256", "byte order", "witness", "segregated witness", "wtxid"],
        beats: [
          { slide: { k: "section", title: "A Fingerprint for a Name", sub: "The transaction ID, then and now" },
            at: "lectern", g: "open",
            say: [
              "I slipped a phrase past you a minute ago: the ID of an earlier transaction.",
              "Nobody hands out those IDs, because there is nobody whose job it could be.",
              { s: "So where does a transaction get its name?", g: "lean" }
            ] },
          { slide: { k: "figure", title: "The ID is the hash of the bytes", ops: [
              { box: [4, 10, 44, 14], t: "275 bytes" },
              { arrow: [50, 17, 60, 17], at: 1 },
              { box: [62, 10, 28, 14], t: "SHA-256", c: "blue", fill: true, at: 1 },
              { arrow: [92, 17, 102, 17], at: 1 },
              { box: [104, 10, 28, 14], t: "SHA-256", c: "blue", fill: true, at: 1 },
              { arrow: [118, 26, 118, 32], at: 2 },
              { text: "f4184fc5...9e16", x: 118, y: 38, a: "c", size: 5.5, c: "green", mono: true, at: 2 },
              { text: "change one byte, get a different ID", x: 80, y: 50, a: "c", size: 4.2, c: "red", at: 3 },
              { text: "ID + output number = the name of one coin", x: 80, y: 60, a: "c", size: 4.2, at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "It names itself, using the tool from lecture 2.",
              "Take all the bytes of the transaction and put them through SHA-256, and then put the result through SHA-256 once more.",
              "The 32 bytes that come out are the transaction ID, and for the payment to Hal it begins with the characters f, 4, 1, 8.",
              { s: "Change a single byte of the transaction, even one satoshi in one amount, and the ID comes out completely different.", g: "pinch" },
              "So when an input points at an ID, it pins down the earlier transaction exactly, amounts and locks and all.",
              "And an ID plus an output number is the full name of one coin: this transaction, that output."
            ] },
          { at: "centre", g: "open",
            say: [
              "One small trap, if you ever look this up yourself.",
              "Block explorers, the websites that let anyone look up a block or a transaction, print an ID with its bytes in the opposite order from the way they sit inside a transaction.",
              "So the pointer in our input ends in 04, while the same ID on a web page begins with 04.",
              { s: "It is the same number read from the other end, a historical accident that everyone has learned to live with.", g: "shrug" }
            ] },
          { slide: { k: "code", title: "The layout since 2017", start: 6, lines: [
              "version",
              "marker 00, flag 01     # new: a witness follows",
              "inputs",
              "outputs",
              "witness                # new: the signatures live here",
              "locktime",
              "",
              "# ID         = hash of version, inputs, outputs, locktime",
              "# witness ID = hash of all six parts"
            ], note: "BIP 141 and BIP 144; in use on the network since August 2017" },
            at: "right", g: "open",
            say: [
              "The transaction we just read is in the original layout, and you should know that the layout has grown since.",
              "Since 2017, a transaction may carry its signatures in a separate compartment called the witness.",
              "Two extra bytes after the version, a zero and a one, announce that a witness is on board.",
              "The witness itself sits after the outputs and just before the locktime, with one bundle for each input.",
              { s: "And here is the important part: the transaction ID is still computed from the original four parts only.", show: 8, g: "point" },
              "So the ID covers what the transaction does, which coins go in and which come out, and not the signatures that authorise it.",
              { s: "A second fingerprint, the witness ID, covers the whole thing, signatures included.", show: 9 },
              "Why anyone would want the signatures kept apart is a good story for later in the course."
            ] },
          { say: ["One question on names, before we ask where coins come from.", "How does a transaction get its ID?"],
            quiz: {
              q: "How does a transaction get its ID?",
              options: [
                "The first node to see it picks one at random",
                "The network numbers the transactions in order",
                "It is the transaction's bytes hashed twice with SHA-256",
                "It is the public key of whoever sent it"
              ],
              answer: 2,
              right: ["Exactly: the transaction names itself, by the fingerprint of its own bytes."],
              wrong: [
                ["A random choice could not be checked by anybody else.", "The ID is worked out from the transaction itself: its bytes, hashed twice with SHA-256."],
                ["Nobody numbers transactions, because there is no central counter to do it.", "The ID is the transaction's own bytes, hashed twice with SHA-256."],
                null,
                ["A key would be the same for every payment its owner made, so it could not name just one.", "The ID is the transaction's own bytes, hashed twice with SHA-256."]
              ]
            } }
        ] },

      { id: "coinbase", title: "Where Coins Are Born", topics: ["coinbase transaction", "new coins", "block reward", "100 block wait", "coin history", "block 9"],
        beats: [
          { slide: { k: "section", title: "Where Coins Are Born", sub: "The coinbase transaction" },
            at: "lectern", g: "open",
            say: [
              "Every input points back to an earlier output, made by a transaction whose own inputs point further back still.",
              { s: "A sharp student should now be asking where that chain of pointers stops.", g: "lean" },
              "Let us follow Satoshi's 50 bitcoins back one step, into block 9, and see."
            ] },
          { slide: { k: "code", title: "Block 9's first transaction", lines: [
              "version     1",
              "inputs      1",
              "   points at    000000000000 ... 0000 : ffffffff",
              "   unlock       none: 7 bytes of free data",
              "outputs     1",
              "   amount       5,000,000,000 satoshis",
              "   lock         a public key of Satoshi's",
              "locktime    0"
            ], note: "Transaction 0437cd7f...a597c9, 134 bytes, 9 January 2009" },
            at: "screen", g: "point",
            say: [
              "Here is the transaction that made the coin.",
              "It has one input, like the payment to Hal, but look at where the input points.",
              { s: "The ID is 32 bytes of zeros, and the output number is the largest value that four bytes can hold.", g: "pinch" },
              "That is the agreed way of writing: this input points at nothing.",
              "Where an unlock would go there is only a little free data, since there is nothing to unlock.",
              "In the genesis block, that is the very spot that carries the newspaper headline from lecture 1.",
              { s: "And yet out comes an output of 50 bitcoins, five billion satoshis that did not exist a moment before.", g: "up" }
            ] },
          { at: "centre", g: "open",
            say: [
              "This is called a coinbase transaction, and every block has exactly one, in first place.",
              { s: "It is the only kind of transaction allowed to create value from nothing.", g: "pinch" },
              "Whoever builds the block writes it, and pays themselves the newly made coins plus the fees left over by the block's other transactions.",
              "How many new coins the rules allow, and how that number shrinks over the years, is lecture 7's business.",
              "One extra rule applies: a coinbase output must wait 100 blocks before it can be spent.",
              "Satoshi's coin from block 9 was spent in block 170, comfortably past the wait."
            ] },
          { slide: { k: "live", title: "Every block begins with one", panel: "blocks", note: "Live from the Bitcoin network while the hall is open" },
            at: "screen", g: "point",
            say: [
              "These are the latest blocks on the chain, as they stand right now.",
              "Each one typically holds a few thousand transactions, and the first in every one of them is a coinbase.",
              "That is the only door through which new bitcoins enter the world.",
              { s: "Every other transaction can only move what already exists.", g: "chop" }
            ] },
          { board: { clear: true, title: "A coin's family tree", ops: [
              { box: [4, 10, 36, 14], t: "coinbase", c: "amber", at: 1 },
              { text: "block 9", x: 22, y: 30, a: "c", size: 4, c: "grey", at: 1 },
              { arrow: [42, 17, 58, 17], at: 1 },
              { text: "50", x: 50, y: 12, a: "c", size: 4, at: 1 },
              { box: [60, 10, 28, 14], t: "tx", c: "blue", at: 1 },
              { text: "block 170", x: 74, y: 30, a: "c", size: 4, c: "grey", at: 1 },
              { arrow: [74, 34, 74, 50], at: 2 },
              { text: "40", x: 80, y: 43, size: 4, at: 2 },
              { box: [60, 52, 28, 14], t: "tx", c: "blue", at: 2 },
              { text: "block 181", x: 74, y: 72, a: "c", size: 4, c: "grey", at: 2 },
              { arrow: [90, 17, 108, 17], at: 3 },
              { text: "10", x: 99, y: 12, a: "c", size: 4, at: 3 },
              { box: [110, 10, 44, 14], t: "Hal's coin", c: "green", at: 3 },
              { arrow: [132, 26, 132, 50], at: 3 },
              { box: [118, 52, 28, 14], t: "tx", c: "blue", at: 3 },
              { text: "block 92,240", x: 132, y: 72, a: "c", size: 4, c: "grey", at: 3 },
              { arrow: [90, 59, 100, 59], dash: true, at: 4 },
              { arrow: [148, 59, 157, 59], dash: true, at: 4 },
              { text: "every coin leads back to a coinbase", x: 80, y: 84, a: "c", size: 5, c: "red", at: 5 }
            ] },
            say: [
              "Now run the film forwards instead of backwards.",
              "A coinbase in block 9 makes 50 bitcoins, and the transaction in block 170 spends them.",
              "The 40 of change was spent again within hours, in block 181, into new outputs of its own.",
              "Hal's 10 sat untouched for nearly two years, and was spent in block 92,240, in November 2010.",
              "Those outputs were spent in their turn, and so on, down to the coins that exist today.",
              { s: "Pick any coin at all, follow its inputs back, and you will always arrive at a coinbase.", g: "point" },
              "That is the chain of signatures the whitepaper promised: every coin has a pedigree, and anyone can read it."
            ] }
        ] },

      { id: "utxo-set", title: "The Set Every Node Keeps", topics: ["utxo", "utxo set", "unspent outputs", "double spend check", "validation", "auditing the supply", "next lecture"],
        beats: [
          { slide: { k: "section", title: "The Set Every Node Keeps", sub: "All the unspent outputs, and nothing more" },
            at: "lectern", g: "open",
            say: [
              "We can now put a name to the heap of coins on that enormous table.",
              "An output that has not been spent is called an unspent transaction output, or UTXO for short.",
              "The collection of all of them, as things stand at this moment, is the UTXO set.",
              { s: "It is the nearest thing Bitcoin has to a list of who owns what, and it contains no names and no balances.", g: "pinch" }
            ] },
          { board: { clear: true, title: "What a node does with a transaction", ops: [
              { text: "the UTXO set", x: 30, y: 9, a: "c", size: 4.5 },
              { box: [4, 13, 52, 64], c: "grey" },
              { text: "coin A   70", x: 10, y: 23, size: 4.5, mono: true },
              { text: "coin B   50", x: 10, y: 32, size: 4.5, mono: true },
              { text: "coin C   12", x: 10, y: 41, size: 4.5, mono: true },
              { text: "coin D   33", x: 10, y: 50, size: 4.5, mono: true },
              { box: [100, 10, 40, 14], t: "new tx", c: "blue", at: 1 },
              { text: "spends coin B", x: 120, y: 30, a: "c", size: 4, c: "grey", at: 1 },
              { text: "1  is coin B in the set?", x: 66, y: 43, size: 4.5, at: 2 },
              { text: "2  does the unlock fit?", x: 66, y: 52, size: 4.5, at: 3 },
              { text: "3  outputs <= inputs?", x: 66, y: 61, size: 4.5, at: 4 },
              { line: [8, 32, 50, 32], c: "red", at: 5 },
              { text: "coin E   10", x: 10, y: 61, size: 4.5, c: "green", mono: true, at: 5 },
              { text: "coin F   40", x: 10, y: 70, size: 4.5, c: "green", mono: true, at: 5 },
              { text: "B again? not in the set", x: 66, y: 76, size: 5, c: "red", at: 6 }
            ] },
            say: [
              "Here is the set, as one node holds it: a plain list of coins, each with its amount and its lock.",
              "A new transaction arrives over the network, claiming to spend coin B.",
              "The node asks first whether coin B is in the set, and if it is not, the transaction is thrown away.",
              "Second, it checks that the unlock really opens coin B's lock, which here means checking a signature.",
              "Third, it adds up the amounts and makes sure the outputs do not exceed the inputs.",
              "If all three pass and the transaction makes it into a block, coin B is struck from the set and the new outputs are added.",
              { s: "Now suppose a second transaction turns up trying to spend coin B again: it fails at the very first check.", g: "chop" }
            ] },
          { slide: { k: "compare", title: "The history and the heap",
              left: { head: "The chain of blocks", points: ["Every transaction ever made", "Only ever grows", "Read through once, from the start", "Says how we got here"] },
              right: { head: "The UTXO set", points: ["Only what is unspent right now", "Grows and shrinks", "Consulted for every new payment", "Says where we are"] } },
            at: "centre", g: "weigh",
            say: [
              "Remember the villain of lecture 1, the double spend, and the one question every digital money must answer.",
              { s: "The question, has this coin already been spent, now has a precise form: is this output still in the set?", g: "point" },
              "Every node builds its own copy of the set by reading the whole history once, and then updates it block by block.",
              "The chain of blocks is the history, and the set is where that history has brought us.",
              "So a node need not retrace a coin's pedigree for every payment, because the set already holds the result.",
              "Which of two competing spends gets into a block first is a matter of ordering, and that is what blocks and mining are for.",
              "But the bookkeeping itself is nothing more than this list."
            ] },
          { slide: { k: "points", title: "What separate coins buy us", start: 0, points: [
              "A yes or no check: the coin is in the set, or it is not",
              "No replays: a spent coin cannot be spent by the same message again",
              "No tangles: payments that use different coins cannot clash"
            ] },
            at: "left", g: "count",
            say: [
              "What does a ledger of separate coins buy us, compared with a book of accounts?",
              { s: "First, the check becomes a plain yes or no: the coin is in the set, or it is not.", show: 1 },
              { s: "Second, a signed payment cannot be played back a second time, because the coins it names are gone after the first.", show: 2 },
              { s: "Third, two payments that use different coins have nothing to do with each other, so they can be checked in any order.", show: 3 },
              "Simple rules are easy for thousands of strangers to enforce identically, and here that matters more than convenience."
            ] },
          { slide: { k: "number", value: "100 million+", label: "unspent outputs in the set that every full node keeps", note: "Recent counts range from about 160 to 190 million; the figure moves with every block" },
            at: "right", g: "open",
            say: [
              "How big is the list?",
              { s: "In recent years it has held well over a hundred million coins.", g: "wide" },
              "That is far smaller than the full history, because once an output is spent the set forgets it.",
              "And here is a lovely consequence: add up every amount in the set, and you have the total number of bitcoins in existence.",
              "Nobody publishes that figure for you to trust, because any node can count it for itself.",
              { s: "It is a ledger with no keeper, audited by everyone who cares to run it.", g: "up" }
            ] },
          { say: ["Last question, and it ties today back to lecture 1.", "How does a node know that a coin has not already been spent?"],
            quiz: {
              q: "How does a node know that a coin has not already been spent?",
              options: [
                "The signature on the transaction proves it",
                "The sender's balance is high enough",
                "It asks the other nodes to vote",
                "The output is still in its set of unspent outputs"
              ],
              answer: 3,
              right: ["That is it: an unspent coin is in the set, and a spent one is gone from it."],
              wrong: [
                ["A signature proves the owner approved, and an owner can approve the same coin twice.", "The node checks that the output is still in its set of unspent outputs."],
                ["There are no balances to consult, only separate coins.", "The node checks that the exact output being spent is still in its set of unspent outputs."],
                ["Nodes do not vote, since lecture 1 showed that votes are free to fake.", "Each node checks its own set of unspent outputs, and a spent coin is no longer in it."],
                null
              ]
            } },
          { slide: { k: "points", title: "Today, in five lines", start: 0, points: [
              "A coin is an output that nobody has spent yet",
              "A transaction spends whole outputs and makes new ones",
              "Change is an output you write; the leftover is the fee",
              "Every coin traces back to a coinbase transaction",
              "Nodes keep the set of unspent outputs, not balances"
            ] },
            at: "centre", g: "count",
            say: [
              { s: "So, the whole lecture in five lines: a coin is an output that nobody has spent yet.", show: 1 },
              { s: "A transaction uses up whole outputs and creates new ones, and its ID is the fingerprint of its own bytes.", show: 2 },
              { s: "You write your own change, and whatever you leave unclaimed is the fee.", show: 3 },
              { s: "Every coin traces back to a coinbase transaction, the first entry in some block.", show: 4 },
              { s: "And what every node guards is the set of unspent outputs, in which there is not one account and not one balance.", show: 5, g: "wide" }
            ] },
          { slide: { k: "figure", title: "Next time: Programmable Locks", ops: [
              { box: [8, 8, 48, 38], c: "amber" },
              { text: "an output", x: 32, y: 15, a: "c", size: 4, c: "grey" },
              { text: "10 bitcoins", x: 32, y: 24, a: "c", size: 4.5 },
              { box: [14, 30, 36, 12], t: "lock", c: "blue", fill: true },
              { arrow: [58, 36, 82, 14], at: 1 },
              { text: "one key must sign", x: 86, y: 14, size: 4.5, at: 1 },
              { arrow: [58, 36, 82, 25], c: "blue", at: 3 },
              { text: "two keys out of three", x: 86, y: 25, size: 4.5, c: "blue", at: 3 },
              { arrow: [58, 36, 82, 36], c: "blue", at: 3 },
              { text: "not before a set date", x: 86, y: 36, size: 4.5, c: "blue", at: 3 },
              { arrow: [58, 36, 82, 47], c: "blue", at: 3 },
              { text: "whoever knows a secret", x: 86, y: 47, size: 4.5, c: "blue", at: 3 },
              { text: "the lock is a tiny program", x: 80, y: 60, a: "c", size: 4.5, c: "green", at: 2 }
            ] },
            at: "lectern", g: "open",
            say: [
              "Today I waved my hands at one thing: the lock on each output.",
              "All I said was that it names a public key, and asks for a signature.",
              "But a lock in Bitcoin is not a fixed form; it is a tiny program, and the unlock is whatever makes that program say yes.",
              "A lock can demand two signatures out of three, or refuse to open before a certain date, or ask for a secret.",
              { s: "That is lecture 5, Programmable Locks.", g: "point" },
              "Before then, read sections 2 and 9 of the whitepaper again, and look up the payment in block 170 on any block explorer.",
              "You will find that you can now read every field of it.",
              { s: "Thank you, and I will see you next time.", g: "up" }
            ] }
        ] }
    ]
  });
})();
