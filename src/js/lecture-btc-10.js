// Bitcoin from First Principles, lecture 10: why room in a block is scarce and so rationed by price, the fee as inputs minus outputs and the fee rate as the bid, how a miner fills a block (highest bid first, a parent judged with its child), the mempool on busy and quiet days, how a wallet estimates a fee, the two rescues for a stuck payment (replace by fee, child pays for parent), and the open question of whether fees will pay for the chain's security as the subsidy halves away.
(() => {
  "use strict";
  window.BL.lectures.add({
    id: "btc-10", course: "first-principles", n: 10, title: "Fees and Block Space",
    reading: [
      { title: "Bitcoin: A Peer-to-Peer Electronic Cash System, section 6", by: "Satoshi Nakamoto, 2008" },
      { title: "BIP 125: Opt-in Full Replace-by-Fee Signaling", by: "Bitcoin Improvement Proposal, 2015" },
      { title: "Bitcoin Core: Mempool Replacements (doc/policy)", by: "The Bitcoin Core developers" }
    ],
    sources: [
      "Satoshi Nakamoto, Bitcoin: A Peer-to-Peer Electronic Cash System (2008), section 6, Incentive, https://bitcoin.org/bitcoin.pdf",
      "Eric Lombrozo, Johnson Lau and Pieter Wuille, BIP 141: Segregated Witness (Consensus layer), for block weight and virtual size, https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki",
      "BIP 125: Opt-in Full Replace-by-Fee Signaling (2015), https://github.com/bitcoin/bips/blob/master/bip-0125.mediawiki",
      "Bitcoin Core, doc/policy/mempool-replacements.md (the replacement rules and their history), https://github.com/bitcoin/bitcoin/blob/master/doc/policy/mempool-replacements.md",
      "Bitcoin Core, src/policy/fees/block_policy_estimator.h (how the fee estimator works), https://github.com/bitcoin/bitcoin/blob/master/src/policy/fees/block_policy_estimator.h",
      "Bitcoin Core, src/kernel/mempool_options.h and doc/reduce-memory.md (mempool size and expiry defaults), https://github.com/bitcoin/bitcoin/blob/master/src/kernel/mempool_options.h",
      "Bitcoin Core 0.13.0 release notes (mining transaction selection, child pays for parent), https://bitcoincore.org/en/releases/0.13.0/",
      "Bitcoin Core 30.0 release notes (minimum relay feerate defaults), https://bitcoincore.org/en/releases/30.0/",
      "Bitcoin Core 31.0 release notes (cluster mempool, block template ordering, fee estimation), https://bitcoincore.org/en/releases/31.0/",
      "Bitcoin developer guide, Transactions (fees and change), https://developer.bitcoin.org/devguide/transactions.html",
      "Bitcoin Optech topics: replace-by-fee, child pays for parent, fee estimation and fee sniping, https://bitcoinops.org/en/topics/replace-by-fee/, https://bitcoinops.org/en/topics/cpfp/, https://bitcoinops.org/en/topics/fee-estimation/, https://bitcoinops.org/en/topics/fee-sniping/",
      "Bitcoin Optech, transaction size calculator (the size of a simple payment), https://bitcoinops.org/en/tools/calc-size/",
      "Block 840,000 (fees of about 37.6 BTC against a subsidy of 3.125 BTC), https://www.blockchain.com/explorer/blocks/btc/840000",
      "Galaxy Research, Where Did All the Fees Go? (20 August 2025), for the share of blocks that were not full in 2025, https://www.galaxy.com/insights/research/bitcoin-onchain-fees-utxo"
    ],
    sections: [
      { id: "scarce-room", title: "A Small Room, by Design", topics: ["block space", "weight limit", "virtual bytes", "scarcity", "why fees exist"],
        beats: [
          { slide: { k: "title", kicker: "Lecture 10", title: "Fees and Block Space", sub: "Block space as an auction, and bidding in it" },
            at: "lectern", g: "open",
            say: [
              "Welcome back.",
              "Last time we followed a payment out across the network, from peer to peer, until every node had heard of it.",
              "And we left it in a waiting room called the mempool, where each node keeps the transactions that are valid but not yet in a block.",
              "Today's question is what happens in that waiting room.",
              { s: "Who gets out first, who waits, and who decides?", g: "lean" },
              "The short answer is that nobody decides, because the room is run as an auction."
            ] },
          { slide: { k: "points", title: "Today's plan", start: 0, points: [
              "Why room in a block is scarce, on purpose",
              "What a fee is, and what it is the price of",
              "How a miner chooses what goes in",
              "How a wallet guesses, and how to rescue a low guess",
              "The long view: can fees pay for security?"
            ] },
            at: "centre", g: "count",
            say: [
              { s: "First, why room in a block is scarce, and why that is deliberate.", show: 1 },
              { s: "Second, what a fee actually is, and what exactly it is the price of.", show: 2 },
              { s: "Third, how a miner chooses which transactions go into a block.", show: 3 },
              { s: "Fourth, how your wallet guesses a fee, and how you rescue a payment when the guess was too low.", show: 4 },
              { s: "And last, the long view, where I will hand you an open question rather than an answer.", show: 5, g: "open" }
            ] },
          { slide: { k: "number", value: "4,000,000", label: "weight units: the most that one block may hold", note: "BIP 141; a new block about every ten minutes" },
            at: "left", g: "open",
            say: [
              "Start with the size of the room.",
              "A block may hold at most four million weight units, and you met weight in lecture 5.",
              "Today I will use a friendlier unit, the virtual byte, which is simply four weight units.",
              { s: "So a block has room for one million virtual bytes, and not one more.", g: "chop" },
              "And a new block arrives about every ten minutes, as you know from lecture 7.",
              { s: "A million virtual bytes, every ten minutes, for the whole world: that is all the room there is.", g: "wide" }
            ] },
          { slide: { k: "figure", title: "A ferry with a fixed deck", ops: [
              { text: "the quay", x: 40, y: 5, a: "c", size: 4, c: "grey" },
              { text: "the ferry: room for 1,000,000 vB", x: 119, y: 5, a: "c", size: 4, c: "grey", at: 1 },
              { box: [84, 12, 70, 20], c: "blue", at: 1 },
              { box: [8, 17, 10, 10], at: 1 },
              { box: [22, 17, 10, 10], at: 1 },
              { box: [36, 17, 10, 10], at: 1 },
              { box: [50, 17, 10, 10], at: 1 },
              { box: [64, 17, 10, 10], at: 1 },
              { arrow: [76, 22, 83, 22], c: "green", at: 2 },
              { box: [88, 17, 10, 10], c: "amber", fill: true, at: 2 },
              { box: [101, 17, 10, 10], c: "amber", fill: true, at: 2 },
              { box: [114, 17, 10, 10], c: "amber", fill: true, at: 2 },
              { box: [127, 17, 10, 10], c: "amber", fill: true, at: 2 },
              { box: [140, 17, 10, 10], c: "amber", fill: true, at: 2 },
              { box: [8, 38, 10, 10], c: "red", at: 3 },
              { box: [22, 38, 10, 10], c: "red", at: 3 },
              { box: [36, 38, 10, 10], c: "red", at: 3 },
              { box: [50, 38, 10, 10], c: "red", at: 3 },
              { box: [64, 38, 10, 10], c: "red", at: 3 },
              { text: "queue longer than the deck: wait", x: 119, y: 44, a: "c", size: 4, c: "red", at: 3 },
              { text: "a simple payment: about 140 vB", x: 80, y: 59, a: "c", size: 4.5, at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "Here is the picture I want you to keep for the whole lecture.",
              "Think of a ferry that leaves about every ten minutes, with a car deck of fixed length.",
              "On a quiet morning every vehicle on the quay drives straight on, and there is deck to spare.",
              "On a busy evening the queue is longer than the deck, and somebody has to wait for the next sailing.",
              "A simple payment takes about 140 virtual bytes, so one block could carry at most about seven thousand of them.",
              "In practice transactions come in all sizes, and a full block usually carries a few thousand."
            ] },
          { slide: { k: "points", title: "Why not build a bigger ferry?", start: 0, points: [
              "Every node downloads and checks every block",
              "Bigger blocks need bigger machines to check them",
              "Fewer people checking means more trust in the few",
              "So the room stays small, and is rationed by price"
            ] },
            at: "centre", g: "open",
            say: [
              { s: "Why not simply build a bigger ferry?", g: "shrug" },
              { s: "Because every block has to be downloaded and checked by every node on the network.", show: 1 },
              { s: "Lecture 8 showed that the rules are enforced by ordinary people running ordinary machines.", show: 2 },
              { s: "Make the blocks huge and only large organisations could keep up, and then we are back to trusting a few keepers.", show: 3, g: "weigh" },
              "So the limit is a choice: keep checking cheap, and accept that room will sometimes run short.",
              "How that limit came to be argued over is a story for lecture 13.",
              "Now, whenever something is scarce and people want it, it gets rationed somehow: by queue, by favour or by price.",
              { s: "Bitcoin has no manager to grant favours, so it rations by price.", show: 4, g: "pinch" }
            ] },
          { say: ["Let me check the foundation before we build on it.", "Why is the room in a block kept small?"],
            quiz: {
              q: "Why is the room in a block kept small?",
              options: [
                "Because the network cannot carry larger files",
                "So that fees stay high for the miners",
                "So that ordinary computers can check every block",
                "Miners are not able to build bigger blocks"
              ],
              answer: 2,
              right: ["Yes: a small block keeps the checking within reach of an ordinary machine."],
              wrong: [
                ["The internet moves far larger files than a block every second.", "The limit keeps the job of checking every block within reach of an ordinary computer."],
                ["Fees are a consequence of the limit, and not the reason for it.", "The limit is kept so that ordinary computers can go on checking every block."],
                null,
                ["A miner could assemble a far bigger block without any trouble.", "The limit is kept so that ordinary computers can go on checking every block."]
              ]
            } }
        ] },

      { id: "what-a-fee-is", title: "The Fee Is What Is Left Over", topics: ["fee", "inputs minus outputs", "fee rate", "satoshis per virtual byte", "change", "amount sent"],
        beats: [
          { slide: { k: "section", title: "The Fee Is What Is Left Over", sub: "Inputs minus outputs, and a price per unit of space" },
            at: "lectern", g: "open",
            say: [
              "So what is a fee, exactly?",
              "You might expect a transaction to have a line in it that says fee, with a number beside it.",
              { s: "It does not.", g: "chop" },
              "Remember from lecture 4 that a transaction spends some coins, its inputs, and creates new ones, its outputs.",
              { s: "The fee is simply whatever the outputs leave unclaimed.", g: "pinch" }
            ] },
          { slide: { k: "figure", title: "The fee is the difference", ops: [
              { box: [4, 20, 44, 14], t: "in: 50,000", c: "blue", at: 1 },
              { arrow: [50, 27, 64, 27], at: 2 },
              { box: [66, 6, 52, 12], t: "shop: 30,000", at: 2 },
              { box: [66, 22, 52, 12], t: "change: 19,300", at: 2 },
              { text: "50,000", x: 152, y: 12, a: "r", size: 4.5, mono: true, at: 3 },
              { text: "- 49,300", x: 152, y: 20, a: "r", size: 4.5, mono: true, at: 3 },
              { line: [126, 24, 153, 24], at: 3 },
              { text: "700", x: 152, y: 31, a: "r", size: 5, mono: true, c: "amber", at: 3 },
              { box: [66, 38, 52, 12], t: "fee: 700", c: "amber", fill: true, at: 4 },
              { text: "nobody's output: the miner may claim it", x: 80, y: 59, a: "c", size: 4.5, at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "Here is a payment, counted in satoshis, the smallest unit, a hundred millionth of a bitcoin.",
              "I spend one coin worth 50,000 satoshis.",
              "I create two outputs: 30,000 to the shop, and 19,300 back to myself as change.",
              "The outputs add up to 49,300, which is 700 less than went in.",
              "Those 700 satoshis are the fee, and whoever mines the block may claim them.",
              "The whitepaper says it in one line: if the outputs are worth less than the inputs, the difference is a transaction fee.",
              { s: "And that is why a wallet which forgot the change output would hand the whole remainder to a miner.", g: "lean" }
            ] },
          { slide: { k: "figure", title: "Where the fee goes", ops: [
              { box: [10, 4, 140, 46], c: "grey" },
              { text: "a block", x: 14, y: 9, size: 3.5, c: "grey" },
              { box: [16, 14, 128, 10], t: "first transaction: pays the miner", c: "amber", fill: true, at: 1 },
              { box: [16, 36, 26, 10], t: "tx", at: 2 },
              { box: [50, 36, 26, 10], t: "tx", at: 2 },
              { box: [84, 36, 26, 10], t: "tx", at: 2 },
              { box: [118, 36, 26, 10], t: "tx", at: 2 },
              { arrow: [29, 35, 29, 26], c: "amber", at: 2 },
              { arrow: [63, 35, 63, 26], c: "amber", at: 2 },
              { arrow: [97, 35, 97, 26], c: "amber", at: 2 },
              { arrow: [131, 35, 131, 26], c: "amber", at: 2 },
              { text: "the miner's pay = subsidy + every fee in the block", x: 80, y: 59, a: "c", size: 4.5, at: 2 }
            ] },
            at: "centre", g: "open",
            say: [
              "Where does the fee go?",
              "You saw in lecture 7 that each block begins with a special transaction that pays its miner.",
              "That payment is the subsidy of new coins, plus every fee in the block.",
              "So a fee is not paid to the network, or to the nodes that relayed you, or to any company.",
              { s: "It is a bid, and it is collected by whichever miner accepts it.", g: "pinch" }
            ] },
          { board: { clear: true, title: "A price per unit of space", ops: [
              { box: [14, 18, 16, 14], t: "A", c: "blue", at: 1 },
              { text: "sends 5 BTC", x: 36, y: 22, size: 4.5, at: 1 },
              { text: "140 vB", x: 36, y: 30, size: 4.5, at: 1 },
              { box: [14, 50, 100, 14], t: "B", c: "red", at: 2 },
              { text: "sends 0.001 BTC, 1,400 vB", x: 14, y: 71, size: 4.5, at: 2 },
              { text: "fee 1,400", x: 84, y: 22, size: 4.5, c: "amber", at: 3 },
              { text: "fee 2,800", x: 120, y: 58, size: 4.5, c: "amber", at: 3 },
              { text: "= 10 sat/vB", x: 84, y: 31, size: 5.5, c: "green", at: 5 },
              { text: "= 2 sat/vB", x: 120, y: 68, size: 5.5, c: "red", at: 5 },
              { text: "ten of A fit in B's room: 14,000", x: 80, y: 84, a: "c", size: 5, c: "green", at: 6 }
            ] },
            say: [
              "Now the idea that matters most today, so I will draw it.",
              "Transaction A moves five whole bitcoins, with one input and two outputs, and takes 140 virtual bytes.",
              "Transaction B moves a thousandth of a bitcoin, but it gathers up twenty small coins to do it, and takes about 1,400 virtual bytes.",
              "A offers a fee of 1,400 satoshis, and B offers twice that, 2,800.",
              { s: "Which one would you rather carry, if you were the miner?", g: "lean" },
              "Divide each fee by the space it uses: A pays ten satoshis per virtual byte, and B pays two.",
              "In the room that B takes up you could fit ten transactions like A, and earn 14,000 instead of 2,800."
            ] },
          { slide: { k: "compare", title: "What the price depends on",
              left: { head: "What counts", points: ["The size, in virtual bytes", "The fee divided by the size", "How long the queue is right now"] },
              right: { head: "What does not", points: ["The amount being sent", "Who is sending it", "Where it is going", "What it is for"] } },
            at: "left", g: "weigh",
            say: [
              "So the number a miner looks at is the fee rate: satoshis per virtual byte.",
              "The ferry charges for the deck you occupy, and not for what is in your boot.",
              "A small car full of gold bars pays less than a long lorry full of feathers.",
              { s: "The amount you send does not appear in the sum at all.", g: "chop" },
              "Neither does who you are, where the money is going, or what it is for.",
              { s: "A fortune and a pittance pay the same, if they take up the same room.", g: "weigh" },
              "What makes a transaction big is mostly the number of coins it spends, because each input carries a signature of its own."
            ] },
          { say: ["Time to test that.", "Two payments are waiting: which one will a miner prefer?"],
            quiz: {
              q: "Two payments are waiting: which one will a miner prefer?",
              options: [
                "The one sending the larger amount",
                "The one paying the larger total fee",
                "The one that has been waiting longest",
                "The one paying more per virtual byte"
              ],
              answer: 3,
              right: ["Exactly: the fee rate, satoshis per virtual byte, is the bid."],
              wrong: [
                ["The amount being sent never enters the sum.", "A miner prefers the payment that pays more per virtual byte."],
                ["A large total fee can still be a poor bid, if the transaction is huge.", "What a miner compares is the fee per virtual byte."],
                ["Waiting earns you nothing, I am afraid, because nobody is served in order of arrival.", "A miner prefers whichever payment pays more per virtual byte."],
                null
              ]
            } }
        ] },

      { id: "filling-a-block", title: "How a Miner Fills a Block", topics: ["block template", "highest fee rate first", "miner's choice", "parent and child", "packages"],
        beats: [
          { slide: { k: "section", title: "How a Miner Fills a Block", sub: "Highest bid first, and families travel together" },
            at: "lectern", g: "open",
            say: [
              "Put yourself in the miner's chair.",
              "You have a mempool holding many thousands of waiting transactions, and one block to fill.",
              "You are free to choose any valid transactions you like, or none at all.",
              "No rule of the system tells a miner which payments to include.",
              { s: "But you are paid the fees, so the profitable thing is to pack the most fee into the room you have.", g: "pinch" }
            ] },
          { board: { clear: true, title: "Filling the block", ops: [
              { text: "waiting, sorted by sat/vB", x: 8, y: 8, size: 4, c: "grey", at: 0 },
              { box: [14, 14, 34, 7], t: "52", at: 1 },
              { box: [14, 23, 34, 7], t: "40", at: 1 },
              { box: [14, 32, 34, 7], t: "31", at: 1 },
              { box: [14, 41, 34, 7], t: "18", at: 1 },
              { box: [14, 50, 34, 7], t: "10", at: 1 },
              { box: [14, 59, 34, 7], t: "6", at: 1 },
              { box: [14, 68, 34, 7], t: "2", at: 1 },
              { text: "the block", x: 124, y: 8, a: "c", size: 4, c: "blue", at: 2 },
              { box: [102, 12, 44, 49], c: "blue", at: 2 },
              { arrow: [52, 30, 98, 30], at: 2 },
              { box: [105, 15, 38, 7], t: "52", c: "amber", at: 2 },
              { box: [105, 24, 38, 7], t: "40", c: "amber", at: 2 },
              { box: [105, 33, 38, 7], t: "31", c: "amber", at: 3 },
              { box: [105, 42, 38, 7], t: "18", c: "amber", at: 3 },
              { box: [105, 51, 38, 7], t: "10", c: "amber", at: 3 },
              { text: "full", x: 124, y: 67, a: "c", size: 4.5, c: "red", at: 3 },
              { line: [8, 58, 56, 58], c: "red", at: 4 },
              { text: "waits", x: 54, y: 63, size: 4, c: "red", at: 5 },
              { text: "waits", x: 54, y: 72, size: 4, c: "red", at: 5 },
              { text: "price of space, for now: 10 sat/vB", x: 80, y: 84, a: "c", size: 4.5, c: "green", at: 6 }
            ] },
            say: [
              "Here is the recipe, and it is as simple as it sounds.",
              "Sort the waiting transactions by fee rate, with the highest at the top.",
              "Then take them from the top, one after another, and place them in the block.",
              "Keep going until the block is full.",
              "Wherever the block fills up, a line falls across the queue.",
              "Everything above the line is in, and everything below it waits for the next block.",
              { s: "The fee rate at that line is, for these ten minutes, the price of block space.", g: "point" }
            ] },
          { slide: { k: "code", title: "A block template, top to bottom", start: 1, lines: [
              "sat/vB     size (vB)     room used (vB)",
              "  52          141               141",
              "  48        2,310             2,451",
              "  47          226             2,677",
              "  ..           ..                ..",
              "  11          310           999,720",
              "  10          141           999,861",
              "------- block full: 1,000,000 -------",
              "   9          154             waits",
              "   4          141             waits"
            ], note: "Invented figures; a real template also keeps room for the miner's own payment" },
            at: "screen", g: "point",
            say: [
              "Here is what such a list might look like, with figures I have made up.",
              { s: "At the top, a small payment bidding 52 satoshis per virtual byte goes in first.", show: 4 },
              { s: "Down and down the list we go, and the room used creeps towards a million.", show: 7 },
              { s: "Then the block is full, and the line falls between ten and nine.", show: 8 },
              { s: "The two at the bottom are perfectly valid, and they simply bid too little for this block.", show: 10 },
              { s: "Notice that nobody announced a price.", g: "open" },
              "It fell out of the bids that happened to be waiting when the list was made.",
              "If fewer people are bidding ten minutes from now, the line falls lower, and if the queue cannot fill a block, almost any bid will do.",
              "A list like this is called a block template, and mining software rebuilds it as new bids arrive."
            ] },
          { board: { clear: true, title: "A parent and its child", ops: [
              { box: [10, 18, 56, 16], t: "parent", at: 2 },
              { text: "200 vB, fee 200", x: 10, y: 41, size: 4, at: 2 },
              { arrow: [68, 26, 88, 26], at: 3 },
              { box: [90, 18, 44, 16], t: "child", c: "green", at: 2 },
              { text: "100 vB, fee 4,300", x: 90, y: 41, size: 4, c: "green", at: 2 },
              { box: [6, 13, 132, 32], c: "amber", dash: true, at: 4 },
              { text: "fees: 200 + 4,300 = 4,500", x: 10, y: 56, size: 5, at: 4 },
              { text: "size: 200 + 100 = 300 vB", x: 10, y: 65, size: 5, at: 4 },
              { text: "4,500 / 300 = 15 sat/vB", x: 10, y: 79, size: 6, c: "green", at: 5 }
            ] },
            say: [
              "There is one wrinkle, and it will matter later, when we rescue a stuck payment.",
              "A transaction can spend a coin created by another transaction that is itself still waiting.",
              "We call the first one the parent, and the one that spends its coin the child.",
              "A child cannot go into a block without its parent, because it spends a coin that would not yet exist.",
              "So the miner's software judges them as a family: add up the fees, add up the sizes, and divide.",
              "Here a parent paying one satoshi per virtual byte and a generous child come to fifteen for the pair.",
              "If fifteen is above the line, both go in, parent first.",
              "Bitcoin Core has chosen transactions this way since 2016, and its newest versions sort whole groups of connected transactions, which it calls clusters."
            ] },
          { say: ["A question on that wrinkle, because we will lean on it soon.", "A low-fee parent has a high-fee child: what does a miner's software do?"],
            quiz: {
              q: "A low-fee parent has a high-fee child: what does a miner's software do?",
              options: [
                "Takes both, judged by their combined fee rate",
                "Ignores both until the parent pays more",
                "Takes the child and leaves the parent waiting",
                "Takes the parent first, because it arrived first"
              ],
              answer: 0,
              right: ["Right: fees added up, sizes added up, and the family judged as one."],
              wrong: [
                null,
                ["Ignoring them would leave the child's generous fee on the table.", "The software takes parent and child together, judged by their combined fee rate."],
                ["The child cannot go in alone, because the coin it spends would not exist yet.", "The software takes both together, judged by their combined fee rate."],
                ["Arriving first earns no place in a block.", "The pair goes in together, if their combined fee rate is high enough."]
              ]
            } }
        ] },

      { id: "busy-and-quiet", title: "Busy Days and Quiet Days", topics: ["mempool", "backlog", "minimum relay fee", "eviction", "expiry", "fee spikes"],
        beats: [
          { slide: { k: "section", title: "Busy Days and Quiet Days", sub: "What the waiting room looks like" },
            at: "lectern", g: "open",
            say: [
              "Let us go and look at the waiting room itself.",
              "Remember from last time that there is no single mempool.",
              "Each node keeps its own, and they overlap heavily without being identical.",
              "So when I say the mempool, I mean roughly what most nodes are holding at this moment."
            ] },
          { slide: { k: "live", title: "The waiting room, right now", panel: "mempool", note: "Live from one node's view of the network, while the hall is open" },
            at: "screen", g: "point",
            say: [
              "This is the real thing, as it stands while I am talking.",
              "The big number is the backlog, measured in millions of virtual bytes.",
              "One million virtual bytes is one block's worth, so that number is also roughly how many blocks it would take to clear the queue.",
              "Beside it are the count of waiting transactions, and the total of all the fees they are offering.",
              "And there is the fee rate at the middle of the next block, in satoshis per virtual byte.",
              { s: "I cannot tell you what you are looking at, because it changes by the minute, and that is rather the point.", g: "shrug" },
              "If the backlog is under one block it is a quiet day, and if it is many blocks deep, people are queueing."
            ] },
          { slide: { k: "compare", title: "Two kinds of day",
              left: { head: "A quiet day", points: ["Queue shorter than one block", "Almost any bid gets in next", "Blocks leave with room to spare", "The price sits near the floor"] },
              right: { head: "A busy day", points: ["Queue many blocks deep", "Bids climb to reach the next block", "Low bids wait hours or days", "The lowest bids get dropped"] } },
            at: "left", g: "weigh",
            say: [
              "The two kinds of day feel completely different.",
              "On a quiet day the queue is shorter than a block, so everything waiting gets carried, and the price sinks to the floor.",
              "In the middle of 2025 there were long stretches like that, with many blocks leaving part empty.",
              "On a busy day the queue runs many blocks deep, and people who are in a hurry start to outbid one another.",
              "The room does not get any bigger when demand rises, so all of the pressure goes into the price.",
              { s: "That is the mark of an auction for a fixed supply: the quantity cannot move, so the price does.", g: "chop" }
            ] },
          { slide: { k: "number", value: "37.6 BTC", label: "the fees in one block: number 840,000, April 2024", note: "Twelve times that block's subsidy of 3.125 BTC" },
            at: "right", g: "open",
            say: [
              "And how busy can a busy day get?",
              "Here is the most dramatic block I know of.",
              "Block 840,000, in April 2024, happened to be the block where the subsidy halved, and a new scheme for issuing tokens launched in that very block.",
              { s: "People bid furiously to be in it, and the fees in that single block came to about 37.6 bitcoins.", g: "wide" },
              "That was twelve times the subsidy the block paid.",
              "Not many months later, blocks were once again leaving with room to spare.",
              { s: "Fees do not drift gently, they lurch.", g: "shrug" }
            ] },
          { slide: { k: "points", title: "The waiting room has house rules", start: 0, points: [
              "A floor: bids below it are not passed along at all",
              "A size limit: 300 MB by default in Bitcoin Core",
              "When it is full, the lowest bids are dropped first",
              "A time limit: after two weeks, a node forgets you"
            ] },
            at: "centre", g: "count",
            say: [
              { s: "A node's waiting room is not bottomless, so it has house rules of its own.", g: "open" },
              { s: "First there is a floor: a bid below the node's minimum is not passed along at all, or junk could flood the network for nothing.", show: 1 },
              "In Bitcoin Core that floor was one satoshi per virtual byte for years, and since late 2025 the default has been a tenth of that.",
              { s: "Second, there is a size limit, which is 300 megabytes of memory by default.", show: 2 },
              { s: "When that fills, the node drops the lowest bids first, and raises its floor until the pressure eases.", show: 3 },
              { s: "And third, there is a time limit: after two weeks unconfirmed, a node simply forgets the transaction.", show: 4 },
              "Being dropped costs you nothing, because a payment that never enters a block never spent your coins.",
              "These are each node's own settings, which you can change on your own machine, and they are not rules of the chain."
            ] }
        ] },

      { id: "guessing-a-fee", title: "How a Wallet Guesses", topics: ["fee estimation", "confirmation target", "history of confirmations", "overpaying", "patience"],
        beats: [
          { slide: { k: "section", title: "How a Wallet Guesses", sub: "A bid for a block that does not exist yet" },
            at: "lectern", g: "open",
            say: [
              "Now sit in the other chair, the one where you are paying.",
              "You want your payment in a block soon, and you would rather not pay more than you need to.",
              "The trouble is that you are bidding for a place in a block that has not been made.",
              "New bids will arrive after yours, and the next block might come in one minute or in forty.",
              { s: "So a wallet does not calculate a fee, it estimates one.", g: "pinch" }
            ] },
          { slide: { k: "table", title: "Learning from the recent past", start: 0, head: ["Fee rate paid", "Usually confirmed within"], rows: [
              ["20 sat/vB and above", "1 block"],
              ["8 to 20 sat/vB", "2 blocks"],
              ["3 to 8 sat/vB", "6 blocks, about an hour"],
              ["1 to 3 sat/vB", "144 blocks, about a day"]
            ], note: "An invented record of the kind a node builds from what it has watched" },
            at: "screen", g: "point",
            say: [
              "The estimator inside Bitcoin Core works like a patient observer on the quay.",
              "It watches each transaction arrive in its own mempool, notes the fee rate, and then counts how many blocks pass before it is confirmed.",
              { s: "It sorts those observations into bands of fee rate, and builds up a record like this one, which I have invented for the picture.", show: 4 },
              "Then you tell it your target: say, within six blocks, which is about an hour.",
              { s: "It answers with the lowest band in which the great majority of recent transactions made it within six blocks.", g: "pinch" },
              "It weighs recent blocks more heavily than old ones, because last week's queue says little about today's.",
              "Other wallets look instead at the queue as it stands right now, and ask how far down the line a given bid would sit."
            ] },
          { slide: { k: "points", title: "Why any estimate can miss", start: 0, points: [
              "It looks backwards, and the next hour may differ",
              "Blocks are irregular: one minute, or forty",
              "A rush of new bids can arrive just after yours"
            ] },
            at: "right", g: "open",
            say: [
              { s: "Either way it is a forecast, and forecasts miss.", g: "shrug" },
              { s: "The record looks backwards, and the next hour need not resemble the last.", show: 1 },
              { s: "Blocks arrive irregularly, as lecture 7 showed, so even a good bid can wait through a slow patch.", show: 2 },
              { s: "And a rush of new bids can arrive a minute after yours, and push you down the queue.", show: 3 },
              "An estimate that is too high wastes a little money, and one that is too low wastes time."
            ] },
          { slide: { k: "figure", title: "Patience is the lever", ops: [
              { text: "sat/vB", x: 4, y: 8, size: 3.5, c: "grey" },
              { line: [14, 46, 150, 46], c: "grey" },
              { box: [22, 12, 26, 34], c: "red", fill: true, at: 1 },
              { text: "20", x: 35, y: 8, a: "c", size: 5, c: "red", at: 1 },
              { text: "the next block", x: 35, y: 52, a: "c", size: 4, at: 1 },
              { box: [69, 32.4, 26, 13.6], c: "amber", fill: true, at: 2 },
              { text: "8", x: 82, y: 28, a: "c", size: 5, c: "amber", at: 2 },
              { text: "within an hour", x: 82, y: 52, a: "c", size: 4, at: 2 },
              { box: [116, 42.6, 26, 3.4], c: "green", fill: true, at: 3 },
              { text: "2", x: 129, y: 38, a: "c", size: 5, c: "green", at: 3 },
              { text: "within a day", x: 129, y: 52, a: "c", size: 4, at: 3 }
            ], note: "Invented figures: the shape is what matters, and it changes hour by hour" },
            at: "centre", g: "open",
            say: [
              { s: "There is one lever you always hold, and it is patience.", g: "up" },
              "If you must be in the very next block, you have to outbid nearly everyone who is waiting.",
              "If an hour will do, you can bid lower and let the urgent go ahead of you.",
              "And if tomorrow will do, you may slip in during a quiet spell for a fraction of the price.",
              { s: "I am not telling you what to bid, only what the bid buys: a place in the queue, and nothing else.", g: "chop" }
            ] },
          { say: ["A quick check on the guessing game.", "What does a wallet base its fee estimate on?"],
            quiz: {
              q: "What does a wallet base its fee estimate on?",
              options: [
                "A price list published by the miners",
                "How quickly recent bids at each fee rate confirmed",
                "A fixed fee written into Bitcoin's rules",
                "The amount of money being sent"
              ],
              answer: 1,
              right: ["Yes: it watches what recent bids achieved, and forecasts from that."],
              wrong: [
                ["There is no price list, because nobody sets the price.", "The wallet estimates from how quickly recent bids at each fee rate were confirmed."],
                null,
                ["The rules fix no fee at all, only the size of the block.", "A wallet estimates from how quickly recent bids at each fee rate were confirmed."],
                ["The amount sent has no bearing on the fee, as we saw earlier.", "The estimate comes from how quickly recent bids at each fee rate were confirmed."]
              ]
            } }
        ] },

      { id: "stuck-payments", title: "When a Payment Is Stuck", topics: ["stuck transaction", "replace by fee", "BIP 125", "child pays for parent", "unconfirmed payments"],
        beats: [
          { slide: { k: "section", title: "When a Payment Is Stuck", sub: "Two rescues: bid again, or send help" },
            at: "lectern", g: "open",
            say: [
              "So one day your wallet guesses low.",
              "The queue grows, the line rises above your bid, and block after block leaves without you.",
              "Your payment is not lost and your coins are not gone, because it is simply sitting below the line.",
              "You could wait for a quiet spell, and often that is all it takes.",
              { s: "But if you are in a hurry, there are two ways to rescue it.", g: "count" }
            ] },
          { board: { clear: true, title: "Rescue 1: bid again", ops: [
              { line: [8, 44, 152, 44], c: "red", dash: true, at: 0 },
              { text: "the line: 10 sat/vB", x: 152, y: 40, a: "r", size: 4, c: "red", at: 0 },
              { box: [16, 58, 46, 14], t: "pay shop", at: 0 },
              { text: "2 sat/vB", x: 39, y: 79, a: "c", size: 4.5, at: 0 },
              { box: [16, 16, 46, 14], t: "pay shop", c: "green", at: 2 },
              { text: "12 sat/vB", x: 39, y: 11, a: "c", size: 4.5, c: "green", at: 2 },
              { text: "same coin, bigger fee", x: 70, y: 24, size: 4.5, at: 2 },
              { line: [14, 56, 64, 74], c: "red", at: 3 },
              { line: [64, 56, 14, 74], c: "red", at: 3 },
              { text: "only one can ever confirm", x: 70, y: 66, size: 4.5, at: 4 },
              { text: "replace by fee: BIP 125, 2015", x: 152, y: 85, a: "r", size: 5, c: "blue", at: 5 }
            ] },
            say: [
              "Here is the line, at about ten satoshis per virtual byte, and here is my payment, stuck below it at two.",
              "The first rescue is to bid again.",
              "I sign a new version of the payment that spends the very same coin, but leaves a larger fee.",
              "Nodes that see it throw away the old version and keep the new one, which now sits above the line.",
              "Only one of the two can ever be confirmed, because the chain allows a coin to be spent once.",
              "This is called replace by fee, and it was written down in 2015 as BIP 125.",
              "A BIP is a Bitcoin Improvement Proposal, and lecture 13 is about how those work."
            ] },
          { slide: { k: "points", title: "The rules of replacement", start: 0, points: [
              "Same coins: it spends at least one of the same inputs",
              "A higher bid: a better fee rate than the old version",
              "More in total: enough extra to pay for its own relay",
              "Only the sender can do it: it needs a new signature"
            ] },
            at: "centre", g: "open",
            say: [
              "Nodes do not accept just any replacement, or the network could be flooded with endless tiny revisions.",
              { s: "The new version must conflict with the old one, meaning that it spends at least one of the same coins.", show: 1 },
              { s: "It must be a better bid, with a higher fee rate.", show: 2 },
              { s: "And it must pay more in total, enough extra to cover the cost of passing it around the network a second time.", show: 3 },
              { s: "Only the sender can do this, because a new version needs a new signature from the keys that own the coin.", show: 4, g: "pinch" },
              "Under BIP 125 a transaction had to carry a flag announcing that it might be replaced.",
              "Since version 28, in 2024, Bitcoin Core has accepted a better-paying replacement whether or not the flag was set, and newer versions no longer let you switch that off."
            ] },
          { slide: { k: "compare", title: "A promise, and then a fact",
              left: { head: "In the waiting room", points: ["Can be replaced by its sender", "Can be dropped or forgotten", "A promise"] },
              right: { head: "In a block", points: ["Costs real work to undo", "Safer with every block on top", "A fact"] } },
            at: "left", g: "weigh",
            say: [
              "There is a lesson hiding here for anyone receiving money.",
              "A payment that is still in the waiting room can be replaced, and the replacement need not pay you.",
              { s: "So an unconfirmed payment is a promise, and not yet a fact.", g: "pinch" },
              "That was always true, because a miner has always been free to include a conflicting version instead.",
              { s: "As lecture 8 taught, it is the block, and the blocks piled on top of it, that make a payment final.", g: "point" }
            ] },
          { board: { clear: true, title: "Rescue 2: send help", ops: [
              { line: [8, 40, 152, 40], c: "red", dash: true, at: 0 },
              { text: "the line: 10 sat/vB", x: 152, y: 36, a: "r", size: 4, c: "red", at: 0 },
              { box: [12, 56, 46, 14], t: "my payment", at: 1 },
              { text: "200 vB, 2 sat/vB", x: 35, y: 76, a: "c", size: 4.5, at: 1 },
              { circle: [58, 63, 2.5], c: "amber", fill: true, at: 2 },
              { text: "your output", x: 59, y: 52, a: "c", size: 3.5, c: "amber", at: 2 },
              { arrow: [62, 63, 84, 63], at: 3 },
              { box: [86, 56, 46, 14], t: "your child", c: "green", at: 3 },
              { text: "100 vB, 41 sat/vB", x: 109, y: 76, a: "c", size: 4.5, c: "green", at: 3 },
              { box: [8, 46, 128, 35], c: "amber", dash: true, at: 5 },
              { arrow: [72, 44, 72, 28], c: "green", at: 5 },
              { text: "together: 15 sat/vB", x: 78, y: 22, size: 5, c: "green", at: 5 },
              { text: "child pays for parent", x: 152, y: 88, a: "r", size: 5, c: "blue", at: 6 }
            ] },
            say: [
              "The second rescue works even when you cannot bid again.",
              "Suppose you are the shop, waiting for my stuck payment, and you cannot sign a new version of my transaction.",
              "But one output of that stuck payment is yours.",
              "So you spend it, straight away, in a new transaction of your own, and you attach a generous fee.",
              "Your transaction is the child, mine is the parent, and you already know what a miner does with a family.",
              "The pair is judged together: mine is twice the size of yours, so the combined rate is fifteen, which clears the line, and both go in, mine first.",
              "This is called child pays for parent, and it needs no special rule of the chain, only a miner's ordinary self-interest."
            ] },
          { slide: { k: "table", title: "Two rescues, side by side", start: 0, head: ["Rescue", "Replace by fee", "Child pays for parent"], rows: [
              ["Who can do it", "the sender only", "anyone it pays"],
              ["How", "a new version", "a second transaction"],
              ["Extra block space", "none", "the child's own size"],
              ["The original", "discarded", "confirmed as signed"]
            ] },
            at: "lectern", g: "open",
            say: [
              "Let me set the two side by side.",
              { s: "Replacing is for the sender, while a child can be made by anyone the stuck payment pays, and that includes the sender's own change.", show: 1 },
              { s: "A replacement is a new version of the same payment, and a child is a second transaction leaning on the first.", show: 2 },
              { s: "So a replacement takes no extra room, while a child has to pay for its own space as well as lifting its parent.", show: 3, g: "weigh" },
              { s: "And after a replacement the old version is gone, while after a child the original is confirmed exactly as it was signed.", show: 4 },
              "Good wallets offer one or both of these as a button, often labelled bump fee or speed up."
            ] },
          { say: ["One more, and this time you are the shopkeeper.", "A payment to you is stuck: which rescue can you perform yourself?"],
            quiz: {
              q: "A payment to you is stuck: which rescue can you perform yourself?",
              options: [
                "Spend your output in a child that pays a high fee",
                "Replace it with a version that pays more",
                "Ask a node to move it up the queue",
                "Nothing at all: only the sender can help"
              ],
              answer: 0,
              right: ["Exactly: your child makes the pair worth a miner's while."],
              wrong: [
                null,
                ["Replacing needs a new signature from the sender's keys, which you do not hold.", "As the receiver, you can spend your output in a child that pays a high fee."],
                ["No node keeps a queue you can jump, because miners simply sort by fee rate.", "What you can do is spend your output in a child that pays a high fee."],
                ["The sender is not the only one with a move to make.", "You can spend your own output in a child that pays a high fee, and lift the parent with it."]
              ]
            } }
        ] },

      { id: "long-view", title: "Who Pays for Security?", topics: ["subsidy", "halving", "security budget", "whitepaper section 6", "fee sniping", "open question"],
        beats: [
          { slide: { k: "section", title: "Who Pays for Security?", sub: "The subsidy fades, and the fees must carry on" },
            at: "lectern", g: "open",
            say: [
              "For the last part of today I want to step back, a long way back.",
              "So far I have treated fees as a nuisance to be kept small.",
              "From the miner's side, and from the chain's side, they are something else entirely.",
              "Remember from lecture 7 what protects the history: it is costly to rewrite, because miners spend real energy building it.",
              { s: "And miners spend that energy because a block pays them.", g: "point" }
            ] },
          { slide: { k: "figure", title: "A block's pay: subsidy plus fees", ops: [
              { line: [6, 48, 154, 48], c: "grey" },
              { box: [10, 8, 14, 40], c: "blue", fill: true, at: 1 },
              { text: "50", x: 17, y: 4, a: "c", size: 4, at: 1 },
              { text: "2009", x: 17, y: 53, a: "c", size: 3.5, c: "grey", at: 1 },
              { box: [34, 28, 14, 20], c: "blue", fill: true, at: 1 },
              { text: "25", x: 41, y: 24, a: "c", size: 4, at: 1 },
              { text: "2012", x: 41, y: 53, a: "c", size: 3.5, c: "grey", at: 1 },
              { box: [58, 38, 14, 10], c: "blue", fill: true, at: 1 },
              { text: "12.5", x: 65, y: 34, a: "c", size: 4, at: 1 },
              { text: "2016", x: 65, y: 53, a: "c", size: 3.5, c: "grey", at: 1 },
              { box: [82, 43, 14, 5], c: "blue", fill: true, at: 1 },
              { text: "6.25", x: 89, y: 39, a: "c", size: 4, at: 1 },
              { text: "2020", x: 89, y: 53, a: "c", size: 3.5, c: "grey", at: 1 },
              { box: [106, 45.5, 14, 2.5], c: "blue", fill: true, at: 2 },
              { text: "3.125", x: 113, y: 41.5, a: "c", size: 4, at: 2 },
              { text: "2024", x: 113, y: 53, a: "c", size: 3.5, c: "grey", at: 2 },
              { box: [130, 46.75, 14, 1.25], c: "blue", dash: true, at: 2 },
              { text: "2028", x: 137, y: 53, a: "c", size: 3.5, c: "grey", at: 2 },
              { path: [10, 30, 30, 34, 50, 26, 70, 33, 90, 22, 110, 34, 130, 27, 150, 32], c: "amber", dash: true, at: 4 },
              { text: "fees: no schedule at all", x: 152, y: 14, a: "r", size: 4.5, c: "amber", at: 4 },
              { text: "the subsidy per block, in bitcoins", x: 80, y: 61, a: "c", size: 4, c: "grey" }
            ] },
            at: "screen", g: "point",
            say: [
              "A block's pay has two parts, the subsidy of new coins and the fees.",
              "You know the subsidy's shape from lecture 7: it started at 50 bitcoins, and it halves every 210,000 blocks, roughly every four years.",
              "Today it stands at 3.125, and the next halving, expected in 2028, will cut it again.",
              "Some time around the year 2140 it reaches zero, and no new coins are made ever again.",
              "That leaves the fees, which have no schedule at all.",
              { s: "As one part fades by design, the other is supposed to take its place.", g: "weigh" }
            ] },
          { slide: { k: "quote", text: "Once a predetermined number of coins have entered circulation, the incentive can transition entirely to transaction fees and be completely inflation free.", by: "Satoshi Nakamoto, Bitcoin whitepaper, section 6, 2008" },
            at: "centre", g: "open",
            say: [
              "This was the plan from the first day, and here it is in the whitepaper.",
              { s: "Look closely at the verb: the incentive can transition entirely to transaction fees.", g: "glasses" },
              { s: "It says can, and it does not say will.", g: "pinch" },
              "The paper gives the matter one sentence, and no argument that the fees will be large enough.",
              "All these years later, that sentence is still a hope, and not yet a result."
            ] },
          { slide: { k: "compare", title: "Will fees be enough? An open question",
              left: { head: "Reasons for confidence", points: ["Block space is scarce for good", "Final settlement is worth paying for", "One chain payment can settle many", "There are decades left to find out"] },
              right: { head: "Reasons for doubt", points: ["Fees lurch; the subsidy was steady", "Quiet spells pay almost nothing", "No rule obliges anyone to bid", "Thin pay may tempt miners to cheat"] } },
            at: "left", g: "weigh",
            say: [
              "So will the fees be enough?",
              { s: "I do not know, and neither does anyone else, whatever they may tell you.", g: "shrug" },
              "Here is the case for confidence: block space is scarce for good, and a place in so well-defended a ledger ought to be worth paying for.",
              "Systems built above the chain, which we reach in lecture 14, can settle a great many small payments with one transaction that pays one fee.",
              "And here is the case for doubt: the subsidy was steady, and fees, as you have seen, lurch between a flood and a trickle.",
              "In a quiet spell a block may collect almost nothing, and no rule obliges anyone to bid more.",
              "Researchers also worry that when a block's pay is mostly the fees it happens to hold, a miner might rather mine a rich old block again than build on top of it."
            ] },
          { at: "centre", g: "open",
            say: [
              "Bitcoin Core's wallet already takes one small precaution against that, by marking each new payment as valid only in a block after the current one.",
              "Whether such measures, and the incentives around them, will be enough is again not known.",
              { s: "The honest position is that this is an experiment still running, and its result is due long after this course ends.", g: "lean" },
              "What I can give you is what to watch: the fees in each block, set against the subsidy.",
              { s: "Both numbers are public, in every block, for anyone who cares to add them up.", g: "wide" }
            ] },
          { slide: { k: "points", title: "What to take away", start: 0, points: [
              "Block space is fixed, so it is rationed by price",
              "The fee is inputs minus outputs; the bid is fee per virtual byte",
              "Miners take the highest bids first, families together",
              "Stuck? Replace it with a higher bid, or let a child pay",
              "Fees must one day replace the subsidy: an open question"
            ] },
            at: "right", g: "count",
            say: [
              "Now let me gather today into five lines.",
              { s: "Room in a block is fixed, so when it runs short it is rationed by price.", show: 1 },
              { s: "The fee is what the outputs leave behind, and the bid is that fee divided by the space you take.", show: 2 },
              { s: "A miner takes the highest bids first, and judges a parent and its child together.", show: 3 },
              { s: "A stuck payment can be replaced by its sender with a higher bid, or lifted by a child.", show: 4 },
              { s: "And in the long run those fees are meant to pay for the chain's security, which remains an open question.", show: 5 }
            ] },
          { slide: { k: "figure", title: "Next time: holding your own keys", ops: [
              { box: [8, 22, 48, 16], t: "one seed", c: "amber", fill: true, at: 3 },
              { text: "a list of words", x: 32, y: 44, a: "c", size: 3.8, c: "grey", at: 3 },
              { arrow: [58, 26, 96, 12], at: 3 },
              { arrow: [58, 30, 96, 30], at: 3 },
              { arrow: [58, 34, 96, 48], at: 3 },
              { box: [98, 5, 40, 12], t: "key", c: "green", at: 3 },
              { box: [98, 24, 40, 12], t: "key", c: "green", at: 3 },
              { box: [98, 43, 40, 12], t: "key", c: "green", at: 3 },
              { text: "one backup, every key", x: 80, y: 61, a: "c", size: 4.5, at: 3 }
            ] },
            at: "lectern", g: "open",
            say: [
              "Everything today assumed that you have a wallet: something that picks your coins, signs for them, guesses a fee and offers you a button to raise it.",
              "Next time we open that box.",
              "Lecture 11 is Wallets and Holding Your Own Keys.",
              "We will see how a single list of words can stand behind every key you will ever use, how to back it up, and the many ways coins get lost.",
              "Before then, read section 6 of the whitepaper, which is three short paragraphs, and BIP 125, which is a page or two.",
              "And if you have a spare hour, watch a mempool, and see the line move.",
              { s: "Thank you, and I will see you in lecture 11.", g: "up" }
            ] }
        ] }
    ]
  });
})();
