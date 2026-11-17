// Bitcoin from First Principles, lecture 14: why not every payment can go on the chain, the idea of a layer, a payment channel (coins under two keys, a balance updated by signed transactions that need not be sent, and the penalty for using an old one), paying through people in between with a hash and a deadline, routes, onions and invoices, the layer's limits told plainly, and the close of the course.
(() => {
  "use strict";
  window.BL.lectures.add({
    id: "btc-14", course: "first-principles", n: 14, title: "Scaling in Layers: Lightning",
    reading: [
      { title: "The Bitcoin Lightning Network", by: "Joseph Poon and Thaddeus Dryja, 2016" },
      { title: "BOLT #0: Introduction and Index", by: "The Lightning specifications" },
      { title: "BOLT #11: Invoice Protocol for Lightning Payments", by: "The Lightning specifications" }
    ],
    sources: [
      "Joseph Poon and Thaddeus Dryja, The Bitcoin Lightning Network: Scalable Off-Chain Instant Payments, draft version 0.5.9.2, 14 January 2016, https://lightning.network/lightning-network-paper.pdf",
      "BOLT #0: Introduction and Index, https://github.com/lightning/bolts/blob/master/00-introduction.md",
      "BOLT 2: Peer Protocol for Channel Management (the channel reserve, to_self_delay, update_add_htlc, update_fulfill_htlc, revoke_and_ack), https://github.com/lightning/bolts/blob/master/02-peer-protocol.md",
      "BOLT 3: Bitcoin Transaction and Script Formats (the funding output, the delayed and revocable to_local output, HTLC outputs), https://github.com/lightning/bolts/blob/master/03-transactions.md",
      "BOLT 4: Onion Routing Protocol (what a hop can learn, the 1,366-byte packet), https://github.com/lightning/bolts/blob/master/04-onion-routing.md",
      "BOLT 7: P2P Node and Channel Discovery (channel announcements, fees, the deadlines along a route), https://github.com/lightning/bolts/blob/master/07-routing-gossip.md",
      "BOLT 11: Invoice Protocol for Lightning Payments (the prefix, the amount, the payment hash, the one-hour default expiry, the signature), https://github.com/lightning/bolts/blob/master/11-payment-encoding.md",
      "BIP 65, OP_CHECKLOCKTIMEVERIFY (Peter Todd), https://github.com/bitcoin/bips/blob/master/bip-0065.mediawiki",
      "BIP 112, CHECKSEQUENCEVERIFY (BtcDrak, Mark Friedenbach, Eric Lombrozo), https://github.com/bitcoin/bips/blob/master/bip-0112.mediawiki, with https://bitcoincore.org/en/2016/06/21/csv-softfork-instructions/",
      "BIP 141, Segregated Witness, https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki, and BIP 90, Buried Deployments, for the activation heights, https://github.com/bitcoin/bips/blob/master/bip-0090.mediawiki",
      "Lightning Protocol 1.0: Compatibility Achieved, 6 December 2017 (the first test payments between three implementations), https://medium.com/@lightning_network/lightning-protocol-1-0-compatibility-achieved-f9d22b7b19c4",
      "Bitcoin Wiki, Payment channels, https://en.bitcoin.it/wiki/Payment_channels",
      "Bitcoin Optech, Watchtowers, https://bitcoinops.org/en/topics/watchtowers/"
    ],
    sections: [
      { id: "why-not-the-chain", title: "Back at the Market Stall", topics: ["scaling", "small payments", "block space", "bigger blocks", "why not everything on the chain"],
        beats: [
          { slide: { k: "title", kicker: "Lecture 14", title: "Scaling in Layers: Lightning", sub: "Payment channels, and paying across strangers" },
            at: "lectern", g: "open",
            say: [
              "Welcome to the fourteenth and last lecture of Bitcoin from First Principles.",
              "In the very first one I asked you to picture paying with a coin at a market stall.",
              "You hand it over, it is done in a second, and it costs you nothing to do.",
              { s: "Since then we have built, piece by piece, a machine that moves money with no keeper in the middle.", g: "wide" },
              "It is a remarkable machine, and today I have to admit something about it.",
              "Used directly, it is nothing like that coin: a payment waits about ten minutes for a block, and pays a fee to get in.",
              { s: "So today's question is how to get the coin back, without giving up one thing we have built.", g: "lean" }
            ] },
          { slide: { k: "figure", title: "One coffee, checked by everyone", ops: [
              { box: [4, 20, 26, 12], t: "coffee", c: "amber", at: 0 },
              { arrow: [31, 26, 45, 26], at: 1 },
              { box: [46, 18, 24, 16], t: "block", c: "blue", fill: true, at: 1 },
              { line: [70, 24, 99, 10], c: "grey", at: 2 }, { circle: [104, 10, 5], at: 2 },
              { line: [70, 26, 99, 28], c: "grey", at: 2 }, { circle: [104, 28, 5], at: 2 },
              { line: [70, 28, 99, 46], c: "grey", at: 2 }, { circle: [104, 46, 5], at: 2 },
              { line: [109, 10, 135, 10], c: "grey", at: 2 }, { circle: [140, 10, 5], at: 2 },
              { line: [109, 28, 135, 28], c: "grey", at: 2 }, { circle: [140, 28, 5], at: 2 },
              { line: [109, 46, 135, 46], c: "grey", at: 2 }, { circle: [140, 46, 5], at: 2 },
              { text: "every node checks it", x: 122, y: 59, a: "c", size: 4, c: "green", at: 2 },
              { text: "kept in the chain's history for ever", x: 42, y: 50, a: "c", size: 4, c: "red", at: 3 }
            ] },
            at: "screen", g: "point",
            say: [
              "Let us follow one small payment onto the chain, say for a cup of coffee.",
              "It is broadcast to the network, as we saw in lecture 9, and a miner puts it into a block.",
              "Then every node in the world downloads that block and checks your coffee against the rules.",
              { s: "And the block joins the history that every new node will download and check, for as long as Bitcoin exists.", g: "wide" },
              "That is not waste, because it is exactly what lets anyone verify the ledger for themselves.",
              "But it does make room in a block the scarcest thing in the system, as lecture 10 showed."
            ] },
          { slide: { k: "number", value: "24 GB", label: "per block, if 7 billion people each paid twice a day on the chain", note: "Poon and Dryja's estimate (2015, revised 2016), at 250 bytes a payment and 144 blocks a day" },
            at: "centre", g: "open",
            say: [
              "How scarce is that room, if we imagine the whole world using it?",
              "In 2015 two engineers, Joseph Poon and Thaddeus Dryja, did the sum in a paper we will come back to.",
              "Suppose 7 billion people each made two payments a day, all of them on the chain.",
              { s: "Every block, every ten minutes, would have to be about 24 gigabytes.", g: "wide" },
              "The blocks we actually have are a few megabytes at the most, thousands of times smaller.",
              "Blocks of 24 gigabytes would pile up at more than 3,000 gigabytes a day, which no ordinary home computer could fetch, check and store."
            ] },
          { slide: { k: "compare", title: "Two ways to carry more",
              left: { head: "Bigger blocks: the worry", points: ["More payments in each block", "Fewer people can run a node", "Checking moves to a few big machines", "The keeper returns by the back door"] },
              right: { head: "Build a layer above", points: ["Blocks stay small enough to check", "Most payments never touch the chain", "The chain settles and judges", "Must work without trusting anyone"] } },
            at: "left", g: "weigh",
            say: [
              "So there are two ways to carry more payments.",
              "The first is the obvious one: make the blocks bigger, and bigger again.",
              "The worry, which you heard argued both ways last time, starts from who enforces the rules: ordinary people running ordinary nodes.",
              { s: "If only data centres can keep up, then only data centres can check, and the rest of us are back to trusting a keeper.", g: "shrug" },
              { s: "The second way is to leave the blocks alone and build something on top of them.", g: "up" },
              "That is the meaning of the word layer in today's title."
            ] },
          { say: ["Before we build that layer, let me check that the reason for it is clear.", "Why can the chain not carry every small payment in the world?"],
            quiz: {
              q: "Why can the chain not carry every small payment in the world?",
              options: [
                "The supply of coins would run out",
                "Miners refuse to include small payments",
                "A small payment cannot be signed",
                "Every node must check and keep every payment"
              ],
              answer: 3,
              right: ["Yes: what everyone must check and keep has to stay small enough for everyone."],
              wrong: [
                ["Paying moves coins about and does not use them up.", "The limit is room: every node must check and keep every payment that goes on the chain."],
                ["Miners will include any valid payment that pays its way.", "The limit is that every node must check and keep every payment, so the blocks must stay small."],
                ["A payment of any size is signed in exactly the same way.", "The real limit is that every node must check and keep every payment on the chain."],
                null
              ]
            } }
        ] },

      { id: "layers", title: "Settle Below, Pay Above", topics: ["layers", "settlement", "off-chain payments", "the lightning paper", "time locks", "history of lightning"],
        beats: [
          { slide: { k: "section", title: "Settle Below, Pay Above", sub: "What a layer is, and what this one must not give up" },
            at: "lectern", g: "open",
            say: [
              "Here is an idea you already know from ordinary life.",
              "At a café where they know you, you might run a tab.",
              "Each coffee is a line on a slip of paper behind the counter, and at the end of the month you settle the lot with one payment.",
              { s: "Thirty coffees, one payment: the slip did the small work, and the money moved once.", g: "pinch" },
              "The trouble is that a tab runs on trust, because one of you could tear up the slip, or simply never come back."
            ] },
          { slide: { k: "figure", title: "Many payments above, one result below", ops: [
              { text: "above: pay", x: 6, y: 6, size: 4, c: "grey" },
              { text: "below: settle", x: 6, y: 46, size: 4, c: "grey" },
              { line: [4, 38, 156, 38], c: "grey", dash: true },
              { box: [34, 10, 22, 12], t: "Ada", at: 1 },
              { box: [104, 10, 22, 12], t: "Ben", at: 1 },
              { box: [20, 48, 30, 10], t: "open", c: "blue", at: 1 },
              { arrow: [58, 12, 102, 12], c: "green", at: 2 },
              { arrow: [58, 16, 102, 16], c: "green", at: 2 },
              { arrow: [58, 20, 102, 20], c: "green", at: 2 },
              { text: "coffee, coffee, coffee ...", x: 80, y: 30, a: "c", size: 3.8, c: "green", at: 2 },
              { line: [50, 53, 110, 53], c: "grey", at: 3 },
              { box: [110, 48, 30, 10], t: "close", c: "blue", at: 3 },
              { text: "two entries on the chain", x: 80, y: 62, a: "c", size: 3.8, at: 3 }
            ] },
            at: "screen", g: "point",
            say: [
              "A layer for Bitcoin borrows the shape of the tab and removes the trust.",
              "Two people make one transaction on the chain to begin, which sets some money aside.",
              "After that they pay each other as often as they like, directly, and none of it is broadcast.",
              "At the end, one more transaction on the chain settles the final result.",
              { s: "The chain is no longer the till where every coffee is rung up; it is the court that stands behind the tab.", g: "weigh" },
              "And the whole art is to arrange things so that nobody ever has to trust anybody, the court included."
            ] },
          { slide: { k: "quote", text: "… if only two participants care about an everyday recurring transaction, it's not necessary for all other nodes in the bitcoin network to know about that transaction.", by: "Joseph Poon and Thaddeus Dryja, 2016" },
            at: "centre", g: "open",
            say: [
              "The design we are studying today comes from that paper by Poon and Dryja.",
              "Its title is The Bitcoin Lightning Network: Scalable Off-Chain Instant Payments, and the version we read is dated January 2016.",
              { s: "Here is the heart of it, in the authors' own words.", g: "point" },
              "If a payment matters only to the two of us, the rest of the world does not need to hear about it.",
              "The rest of the world only needs to be able to step in if one of us cheats."
            ] },
          { slide: { k: "figure", title: "The locks had to come first", ops: [
              { line: [8, 30, 152, 30], c: "grey" },
              { circle: [24, 30, 1.5], fill: true, at: 1 }, { line: [24, 25, 24, 30], at: 1 },
              { text: "Dec 2015", x: 24, y: 16, a: "c", size: 3.5, c: "grey", at: 1 },
              { text: "locked until a time", x: 24, y: 21.5, a: "c", size: 3.8, at: 1 },
              { circle: [62, 30, 1.5], fill: true, at: 2 }, { line: [62, 30, 62, 35], at: 2 },
              { text: "Jul 2016", x: 62, y: 39, a: "c", size: 3.5, c: "grey", at: 2 },
              { text: "locked for a delay", x: 62, y: 44.5, a: "c", size: 3.8, at: 2 },
              { circle: [100, 30, 1.5], fill: true, at: 3 }, { line: [100, 25, 100, 30], at: 3 },
              { text: "Aug 2017", x: 100, y: 16, a: "c", size: 3.5, c: "grey", at: 3 },
              { text: "segregated witness", x: 100, y: 21.5, a: "c", size: 3.8, at: 3 },
              { circle: [136, 30, 1.5], c: "green", fill: true, at: 5 }, { line: [136, 30, 136, 35], c: "green", at: 5 },
              { text: "Dec 2017", x: 136, y: 39, a: "c", size: 3.5, c: "grey", at: 5 },
              { text: "first test payments", x: 136, y: 44.5, a: "c", size: 3.8, c: "green", at: 5 },
              { text: "new tools on the chain first, then the network", x: 80, y: 58, a: "c", size: 4.5, c: "amber", at: 6 }
            ] },
            at: "right", g: "open",
            say: [
              "A design on paper is not a running system, and this one needed tools the chain did not yet have.",
              "It needed a lock that holds until a set time, which arrived at the end of 2015.",
              "It needed a lock that holds for a set delay after a transaction confirms, which arrived in the summer of 2016.",
              "And it needed a repair to the way transactions are identified, which came with segregated witness in August 2017.",
              "You met locks of this kind in lecture 5, and in lecture 13 the careful way such changes are made.",
              "In December 2017, three teams who had written three separate programs sent test payments to one another across the real network.",
              { s: "They could do that because they had agreed on one open rulebook, a set of public documents known as the BOLTs, which still defines Lightning today.", g: "count" }
            ] }
        ] },

      { id: "payment-channel", title: "A Channel Between Two", topics: ["payment channel", "funding transaction", "two-key lock", "updating a balance", "signed but unsent transactions", "closing a channel"],
        beats: [
          { slide: { k: "section", title: "A Channel Between Two", sub: "Coins under two keys, and a balance that slides" },
            at: "lectern", g: "open",
            say: [
              "Let us build the simplest piece first: a channel between two people.",
              "Meet Ada, who drinks a great deal of coffee, and Ben, who owns the café.",
              "Ada would like to pay Ben many times a week, in a moment, without paying a miner each time.",
              "And neither wants to trust the other with a single satoshi, the smallest unit of bitcoin there is."
            ] },
          { slide: { k: "figure", title: "Opening a channel", ops: [
              { box: [6, 8, 26, 12], t: "Ada", at: 0 },
              { box: [128, 8, 26, 12], t: "Ben", at: 0 },
              { arrow: [33, 14, 53, 14], at: 0 },
              { box: [54, 7, 52, 14], t: "20,000 sats", c: "amber", fill: true, at: 0 },
              { text: "key A", x: 19, y: 26, a: "c", size: 3.5, c: "grey", at: 1 },
              { text: "key B", x: 141, y: 26, a: "c", size: 3.5, c: "grey", at: 1 },
              { text: "opens only with both signatures", x: 80, y: 28, a: "c", size: 3.8, at: 1 },
              { arrow: [80, 31, 80, 39], at: 3 },
              { box: [40, 40, 80, 10], t: "one transaction on the chain", c: "blue", at: 3 },
              { text: "the funding transaction", x: 80, y: 57, a: "c", size: 4, c: "blue", at: 3 },
              { arrow: [127, 18, 107, 18], c: "green", dash: true, at: 5 },
              { text: "signed refund", x: 132, y: 36, a: "c", size: 3.5, c: "green", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "To open the channel, Ada takes 20,000 satoshis of her own and makes an ordinary transaction on the chain.",
              "It pays them to a lock that needs two signatures to open: hers and Ben's.",
              "You know this lock from lecture 5, and on the chain it looks like one more output among millions.",
              "This is called the funding transaction, and once it is confirmed, the channel is open.",
              { s: "But wait, because Ada is about to put her money where she cannot move it without Ben.", g: "lean" },
              "So before she broadcasts it, Ben signs a second transaction that pays all 20,000 straight back to her.",
              "Ada keeps that one in her pocket, unsent, as her way out."
            ] },
          { board: { clear: true, title: "A balance that slides", ops: [
              { text: "Ada", x: 10, y: 20, size: 5, at: 0 },
              { text: "Ben", x: 150, y: 20, a: "r", size: 5, at: 0 },
              { box: [10, 25, 140, 10], at: 0 },
              { text: "v1   Ada 20,000   Ben 0", x: 22, y: 47, size: 4.5, mono: true, at: 1 },
              { line: [136, 23, 136, 37], c: "blue", at: 2 },
              { text: "v2   Ada 18,000   Ben 2,000", x: 22, y: 56, size: 4.5, mono: true, c: "blue", at: 2 },
              { line: [122, 23, 122, 37], c: "green", at: 4 },
              { text: "v3   Ada 16,000   Ben 4,000", x: 22, y: 65, size: 4.5, mono: true, c: "green", at: 4 },
              { line: [143, 23, 143, 37], c: "amber", at: 5 },
              { text: "v4   Ada 19,000   Ben 1,000", x: 22, y: 74, size: 4.5, mono: true, c: "amber", at: 5 },
              { text: "none of it sent to the chain", x: 80, y: 86, a: "c", size: 4.5, c: "red", at: 6 }
            ] },
            say: [
              "Now watch what the two of them can do, and I will draw the channel as a bar.",
              "At the start all 20,000 are on Ada's side, and the refund in her pocket says exactly that.",
              "Ada orders a coffee for 2,000, and instead of paying on the chain, the two of them sign a new version: Ada 18,000, Ben 2,000.",
              "It is a real, valid Bitcoin transaction that spends the locked coins, and either of them could broadcast it this minute.",
              "Next day, another coffee, another version: Ada 16,000, Ben 4,000.",
              "Money can come back the other way too, so when Ben buys 3,000 of lemons from Ada's garden, they sign Ada 19,000, Ben 1,000.",
              { s: "Four balances so far, and not one of them has gone anywhere near a miner.", g: "pinch" }
            ] },
          { slide: { k: "points", title: "What an update really is", start: 0, points: [
              "A new transaction spending the locked coins, signed by both",
              "Each of them holds a copy they could broadcast alone",
              "Neither needs to, so neither does",
              "Closing: one last version goes to the chain, once"
            ] },
            at: "centre", g: "open",
            say: [
              { s: "Let me say carefully what an update is, because everything else rests on it.", g: "lean" },
              { s: "It is a newly signed transaction that divides the locked coins according to the latest balance.", show: 1 },
              { s: "Each of them holds a version carrying the other's signature, so each can go to the chain alone, without asking.", show: 2 },
              { s: "And because each of them knows they could, neither of them has to.", show: 3, g: "shrug" },
              "That is the difference from the café tab: this slip of paper can be enforced by whoever holds it, at any hour.",
              { s: "When they are done, perhaps years later, they sign one final version together and broadcast it, and the channel is closed.", show: 4 }
            ] },
          { slide: { k: "number", value: "2", label: "transactions on the chain, for a channel's whole life", note: "One to open and one to close, however many payments pass in between" },
            at: "right", g: "open",
            say: [
              "So count what the rest of the world has had to check and keep.",
              "One transaction to open the channel, and one to close it.",
              { s: "In between there might have been ten payments or ten thousand, and the chain carries the same two entries either way.", g: "wide" },
              "An update is two computers exchanging signatures, so it takes about as long as sending a message, and no miner is paid."
            ] },
          { say: ["Let me check that the central trick has landed.", "What is an update to a channel's balance?"],
            quiz: {
              q: "What is an update to a channel's balance?",
              options: [
                "A new transaction confirmed in the next block",
                "A newly signed transaction that both hold and do not send",
                "A line in a ledger that a company keeps",
                "A promise with no signature behind it"
              ],
              answer: 1,
              right: ["Exactly: signed, valid and ready for the chain, yet kept in the pocket."],
              wrong: [
                ["If every update went into a block we would have saved nothing.", "An update is a newly signed transaction that both of them hold and do not send."],
                null,
                ["There is no company and no ledger between Ada and Ben.", "An update is a newly signed transaction that each of them holds and does not send."],
                ["A bare promise is the café tab, which runs on trust.", "An update is a real signed transaction that either could send to the chain, and need not."]
              ]
            } }
        ] },

      { id: "penalty", title: "Keeping Old Balances Dead", topics: ["old balances", "cheating", "revocation", "penalty", "delay", "channel reserve"],
        beats: [
          { slide: { k: "section", title: "Keeping Old Balances Dead", sub: "The cheat, the delay and the penalty" },
            at: "lectern", g: "open",
            say: [
              "I hope something has been bothering you for the last few minutes.",
              "Every one of those old versions is still a valid, signed transaction.",
              "Take the day when the true balance was Ada 16,000 and Ben 4,000.",
              { s: "What stops Ada broadcasting her very first version, the refund, and taking her coffee money back?", g: "lean" },
              "This is the double spend from lecture 1 in new clothes: the same coins, spent according to two different stories."
            ] },
          { slide: { k: "figure", title: "A tempting old version", ops: [
              { box: [8, 8, 62, 22], c: "red", dash: true, at: 0 },
              { text: "version 1 (old)", x: 39, y: 14, a: "c", size: 4, c: "red", at: 0 },
              { text: "Ada 20,000   Ben 0", x: 39, y: 24, a: "c", size: 4, mono: true, at: 0 },
              { box: [90, 8, 62, 22], c: "green", at: 1 },
              { text: "version 3 (latest)", x: 121, y: 14, a: "c", size: 4, c: "green", at: 1 },
              { text: "Ada 16,000   Ben 4,000", x: 121, y: 24, a: "c", size: 4, mono: true, at: 1 },
              { text: "both carry two valid signatures", x: 80, y: 42, a: "c", size: 4.5, at: 2 },
              { text: "the chain has seen neither of them", x: 80, y: 53, a: "c", size: 4.5, c: "red", at: 3 }
            ] },
            at: "screen", g: "point",
            say: [
              "Here is the old version, which favours Ada.",
              "And here is the latest one, which is the truth.",
              "Both carry two valid signatures, and the two-key lock will open for either.",
              "The miners and the nodes have never seen any of the versions, so they have no idea which came last.",
              { s: "So the old versions cannot be made invalid, and instead we must make them dangerous to use.", g: "pinch" }
            ] },
          { board: { clear: true, title: "The penalty", ops: [
              { text: "each update:", x: 8, y: 19, size: 5, at: 1 },
              { box: [8, 24, 44, 14], t: "new version", c: "green", at: 1 },
              { text: "+", x: 58, y: 32, a: "c", size: 6, at: 1 },
              { box: [64, 24, 66, 14], t: "secret for the old one", c: "amber", at: 1 },
              { text: "Ada sends old version 1", x: 8, y: 52, size: 5, c: "red", at: 3 },
              { arrow: [8, 62, 72, 62], at: 4 },
              { text: "delay: Ada must wait", x: 40, y: 69, a: "c", size: 4, at: 4 },
              { box: [84, 54, 68, 16], t: "Ben takes all 20,000", c: "red", at: 5 },
              { text: "cheating loses everything", x: 80, y: 84, a: "c", size: 5.5, c: "green", at: 6 }
            ] },
            say: [
              "The answer has two parts, and I will draw them both.",
              "Part one: every time they sign a new version, each of them hands the other a secret that belongs to their own previous version.",
              "Think of it as a self-destruct code for the version you are promising never to use.",
              "Part two: suppose Ada breaks that promise and broadcasts version 1 anyway.",
              "Her own share in that transaction is held behind a delay, a number of blocks the two agreed when the channel opened.",
              "During the delay Ben, who holds the secret for version 1, can take her share for himself, on top of his own.",
              { s: "So the cheat does not win back two coffees; she loses every satoshi in the channel.", g: "chop" }
            ] },
          { slide: { k: "points", title: "Why the honest move is the only good one", start: 0, points: [
              "An old version can be punished; the latest one cannot",
              "The delay gives the other side time to notice",
              "Each side keeps a small reserve, so each has something to lose",
              "The judge is the chain, and it needs to know nobody"
            ] },
            at: "left", g: "count",
            say: [
              { s: "Only old versions can be punished, because you never hand over the secret for the version that is current.", show: 1 },
              { s: "The delay is there to give the honest side time to see an old version appear on the chain, and to respond.", show: 2 },
              { s: "The rulebook also asks each side to keep a small reserve in the channel, about one part in a hundred, so that nobody ever has nothing to lose.", show: 3 },
              { s: "And the judge is the chain itself, applying the locks of lecture 5 with no idea who Ada and Ben are.", show: 4 },
              { s: "The paper calls this a penalty, and it is in the spirit of proof of work: we do not ask people to be good, we make cheating cost more than it pays.", g: "weigh" }
            ] },
          { say: ["One question on that, because the whole layer leans on it.", "What stops someone closing a channel with an old balance?"],
            quiz: {
              q: "What stops someone closing a channel with an old balance?",
              options: [
                "The other side can take the whole channel as a penalty",
                "Old balances are wiped from both computers",
                "A company reverses the payment afterwards",
                "Miners recognise old balances and refuse them"
              ],
              answer: 0,
              right: ["Right: the old version still works, but using it costs the cheat everything."],
              wrong: [
                null,
                ["Nothing can force a person to delete a file from their own computer.", "The old version stays usable, but the other side can punish it by taking the whole channel."],
                ["There is no company here, and nothing on the chain is ever reversed.", "The other side holds a secret that lets them take the whole channel as a penalty."],
                ["Miners have never seen any version, so they cannot tell old from new.", "What stops it is the penalty: the other side can take everything in the channel."]
              ]
            } }
        ] },

      { id: "across-strangers", title: "Paying Across Strangers", topics: ["paying through others", "hashed timelock contract", "htlc", "hash lock", "deadlines", "all or nothing", "proof of payment"],
        beats: [
          { slide: { k: "section", title: "Paying Across Strangers", sub: "A hash, a deadline, and people in between" },
            at: "lectern", g: "open",
            say: [
              "A channel with your café is pleasant, but you cannot open a channel with every person you will ever pay.",
              "Each one costs two transactions on the chain, and that is the very thing we are trying to save.",
              "So here is the second big idea, the one that turns separate channels into a network.",
              { s: "If I have a channel with you, and you have a channel with her, then perhaps I can pay her through you.", g: "count" }
            ] },
          { slide: { k: "figure", title: "No channel, but a path", ops: [
              { box: [4, 24, 24, 12], t: "Ada", at: 0 },
              { box: [134, 24, 22, 12], t: "Dan", at: 0 },
              { text: "the stall", x: 145, y: 42, a: "c", size: 3.5, c: "grey", at: 0 },
              { path: [16, 22, 16, 12, 145, 12, 145, 22], c: "red", dash: true, at: 1 },
              { text: "no channel", x: 80, y: 8, a: "c", size: 3.8, c: "red", at: 1 },
              { box: [48, 24, 24, 12], t: "Ben", at: 2 },
              { box: [92, 24, 24, 12], t: "Cleo", at: 2 },
              { line: [28, 30, 48, 30], c: "blue", at: 2 },
              { line: [72, 30, 92, 30], c: "blue", at: 2 },
              { line: [116, 30, 134, 30], c: "blue", at: 2 },
              { text: "three channels, one path", x: 80, y: 54, a: "c", size: 4.5, c: "blue", at: 3 }
            ] },
            at: "screen", g: "point",
            say: [
              "Ada is at the market, and she wants a jar of honey from Dan, who keeps a stall there.",
              "She has no channel with Dan, and opening one for a single jar would be absurd.",
              "But she has her channel with Ben, Ben has one with Cleo, who supplies his milk, and Cleo has one with Dan.",
              "So there is a path: Ada to Ben, Ben to Cleo, Cleo to Dan.",
              "The honey costs 3,000 satoshis, and we want those 3,000 to travel along the path."
            ] },
          { slide: { k: "compare", title: "A favour, or a lock",
              left: { head: "Passing it along on trust", points: ["Ada pays Ben, hoping he pays on", "Ben could simply keep it", "Cleo could simply keep it", "Each one becomes a little keeper"] },
              right: { head: "Locking it to a secret", points: ["Each payment waits for one secret", "Whoever shows the secret is paid", "No secret by the deadline: refund", "Nobody has to be trusted"] } },
            at: "left", g: "weigh",
            say: [
              "The naive way is to pass the money along like a note in class.",
              "Ada pays Ben 3,000 and asks him nicely to pay Cleo, who is asked nicely to pay Dan.",
              { s: "And somewhere along the line, somebody keeps it.", g: "shrug" },
              "Every person in between would be a small keeper of the kind we met in lecture 1, and we did not come this far to bring them back.",
              "The fix uses two tools you already own: the fingerprint from lecture 2 and the time lock from lecture 5.",
              { s: "Together they make what the paper calls a hashed timelock contract.", g: "point" }
            ] },
          { board: { clear: true, title: "One secret, three locks", ops: [
              { box: [4, 34, 24, 12], t: "Ada", at: 0 },
              { box: [48, 34, 24, 12], t: "Ben", at: 0 },
              { box: [92, 34, 24, 12], t: "Cleo", at: 0 },
              { box: [134, 34, 22, 12], t: "Dan", at: 0 },
              { text: "secret S", x: 145, y: 27, a: "c", size: 4, c: "amber", at: 1 },
              { text: "H = hash of S", x: 80, y: 14, a: "c", size: 5, c: "amber", at: 2 },
              { arrow: [132, 20, 18, 20], c: "amber", dash: true, at: 2 },
              { arrow: [29, 40, 47, 40], c: "blue", at: 3 },
              { text: "60 blocks", x: 38, y: 53, a: "c", size: 3.6, c: "blue", at: 3 },
              { arrow: [73, 40, 91, 40], c: "blue", at: 4 },
              { text: "40 blocks", x: 82, y: 53, a: "c", size: 3.6, c: "blue", at: 4 },
              { arrow: [117, 40, 133, 40], c: "blue", at: 5 },
              { text: "20 blocks", x: 125, y: 53, a: "c", size: 3.6, c: "blue", at: 5 },
              { text: "each locked to H", x: 80, y: 62, a: "c", size: 4.5, c: "blue", at: 6 }
            ] },
            say: [
              "Here are our four again, and I will draw the payment in two passes.",
              "It starts with Dan, the one being paid, who makes up a large random number and keeps it secret.",
              "He takes its fingerprint with a hash function and gives the fingerprint, not the secret, to Ada.",
              "Ada now makes Ben a conditional offer inside their channel: this money is yours if you show me the secret behind this fingerprint within 60 blocks, about ten hours.",
              "Ben cannot produce the secret, but he can make the same offer to Cleo, with a shorter deadline of 40 blocks.",
              "And Cleo makes it to Dan, with 20 blocks to run.",
              { s: "Nobody has been paid yet, but three locks are now set in a row, all waiting for the same secret.", g: "pinch" }
            ] },
          { board: { ops: [
              { arrow: [133, 72, 117, 72], c: "green", at: 1 },
              { text: "S", x: 125, y: 69, a: "c", size: 4.5, c: "green", at: 1 },
              { arrow: [91, 72, 73, 72], c: "green", at: 2 },
              { text: "S", x: 82, y: 69, a: "c", size: 4.5, c: "green", at: 2 },
              { arrow: [47, 72, 29, 72], c: "green", at: 3 },
              { text: "S", x: 38, y: 69, a: "c", size: 4.5, c: "green", at: 3 },
              { text: "the secret runs back, and every lock opens", x: 80, y: 84, a: "c", size: 4.5, c: "green", at: 4 }
            ] },
            say: [
              "Now the second pass, which runs backwards.",
              "Dan knows the secret, of course, so he shows it to Cleo and collects from her.",
              "But in collecting he has told Cleo the secret, so she turns round and collects from Ben.",
              "And Ben, who has now learned it too, collects from Ada.",
              "Ada has paid, Dan has been paid, and Ben and Cleo each took in with one hand what they paid out with the other.",
              { s: "And Ada is left holding the secret, which only Dan could have released, so it serves as her receipt.", g: "up" }
            ] },
          { slide: { k: "points", title: "Everyone is paid, or nobody is", start: 0, points: [
              "Secret revealed: every lock on the path opens",
              "Secret never revealed: every lock expires, every coin returns",
              "Deadlines shrink along the path, so nobody is caught short",
              "Any lock can be enforced on the chain if someone goes silent"
            ] },
            at: "centre", g: "open",
            say: [
              "Look at what the secret does: it ties three separate payments into one event.",
              { s: "If Dan reveals it, the locks open one after another, all the way back to Ada.", show: 1 },
              { s: "If he never does, or if Cleo's computer is switched off, nobody learns it, the deadlines pass, and every coin slides back to where it started.", show: 2 },
              { s: "The deadlines shrink towards Dan for a reason: when Ben has had to pay Cleo, he still has 20 blocks in hand to collect from Ada.", show: 3, g: "count" },
              { s: "And if anyone stops answering in the middle of all this, each offer is written as a real Bitcoin lock, so it can be taken to the chain and settled there.", show: 4 },
              "Ben and Cleo never held Ada's money at their own discretion, not even for a second.",
              "For their trouble, and for the use of their channels, each of them keeps a small fee."
            ] },
          { say: ["This is the cleverest idea of the day, so let me test it.", "In a payment through people in between, what lets each of them collect?"],
            quiz: {
              q: "In a payment through people in between, what lets each of them collect?",
              options: [
                "The sender's private key",
                "A vote among the people on the path",
                "The secret whose fingerprint locked the payment",
                "A signature from a bank"
              ],
              answer: 2,
              right: ["Yes: one secret opens every lock on the path, from the far end back to the sender."],
              wrong: [
                ["Ada never shares her private key with anyone, and nobody needs it.", "What opens each lock is the secret behind the fingerprint, passed back along the path."],
                ["Nobody votes, and nobody's agreement is needed.", "Whoever can show the secret behind the fingerprint collects, and that is all."],
                null,
                ["There is no bank anywhere on the path.", "Each one collects by showing the secret whose fingerprint locked the payment."]
              ]
            } }
        ] },

      { id: "routes-onions-invoices", title: "Routes, Onions and Invoices", topics: ["finding a route", "channel gossip", "onion routing", "invoices", "routing fees", "millisatoshi"],
        beats: [
          { slide: { k: "section", title: "Routes, Onions and Invoices", sub: "Finding a path, hiding it, and asking to be paid" },
            at: "lectern", g: "open",
            say: [
              "Three practical questions are left over.",
              { s: "How did Ada know the path existed, how much do Ben and Cleo learn of her business, and how did Dan ask for the money in the first place?", g: "count" }
            ] },
          { slide: { k: "figure", title: "A map made of gossip", ops: [
              { circle: [16, 28, 4], c: "blue", at: 0 }, { text: "Ada", x: 16, y: 38, a: "c", size: 3.5, at: 0 },
              { circle: [50, 28, 4], at: 0 }, { text: "Ben", x: 50, y: 38, a: "c", size: 3.5, at: 0 },
              { circle: [86, 10, 4], at: 0 },
              { circle: [86, 44, 4], at: 0 }, { text: "Cleo", x: 86, y: 54, a: "c", size: 3.5, at: 0 },
              { circle: [120, 10, 4], at: 0 },
              { circle: [146, 28, 4], c: "amber", at: 0 }, { text: "Dan", x: 146, y: 38, a: "c", size: 3.5, at: 0 },
              { line: [20, 28, 46, 28], c: "grey", at: 1 },
              { line: [54, 26, 82, 12], c: "grey", at: 1 },
              { line: [54, 30, 82, 42], c: "grey", at: 1 },
              { line: [86, 14, 86, 40], c: "grey", at: 1 },
              { line: [90, 10, 116, 10], c: "grey", at: 1 },
              { line: [124, 12, 143, 25], c: "grey", at: 1 },
              { line: [90, 43, 142, 30], c: "grey", at: 1 },
              { arrow: [21, 31, 45, 31], c: "green", at: 3 },
              { arrow: [55, 33, 81, 45], c: "green", at: 3 },
              { arrow: [91, 46, 142, 33], c: "green", at: 3 }
            ], note: "Announced channels and their sizes are public; how each balance is split is not." },
            at: "screen", g: "point",
            say: [
              "Lightning nodes, separate programs that hold channel keys and run beside a Bitcoin node, tell one another about their channels, much as Bitcoin nodes pass transactions around.",
              "Each announcement points at a funding transaction on the chain, so nobody can advertise a channel that does not exist.",
              "From that gossip, Ada's software draws itself a map: who is connected to whom, how big each channel is, and what fee each asks.",
              "Then it looks for a path across the map, here by way of Ben and Cleo.",
              "The fee each of them asks is a small fixed part plus a small share of the amount, counted in thousandths of a satoshi, a unit finer than the chain itself can record.",
              { s: "What the map does not show is how each channel's balance is split at this moment, so now and then a path fails and the software quietly tries another.", g: "shrug" }
            ] },
          { slide: { k: "figure", title: "An onion, peeled a layer at a time", ops: [
              { box: [6, 6, 60, 46], c: "blue", at: 1 },
              { text: "Ben's layer", x: 36, y: 12, a: "c", size: 3.5, c: "blue", at: 1 },
              { box: [14, 16, 44, 30], c: "green", at: 1 },
              { text: "Cleo's layer", x: 36, y: 22, a: "c", size: 3.5, c: "green", at: 1 },
              { box: [22, 27, 28, 13], t: "Dan's", c: "amber", fill: true, at: 1 },
              { text: "Ben learns: from Ada, on to Cleo", x: 74, y: 14, size: 4, c: "blue", at: 2 },
              { text: "Cleo learns: from Ben, on to Dan", x: 74, y: 27, size: 4, c: "green", at: 3 },
              { text: "Dan learns: it is for him", x: 74, y: 40, size: 4, c: "amber", at: 4 },
              { text: "the same size at every step: 1,366 bytes", x: 80, y: 60, a: "c", size: 4.2, at: 5 }
            ] },
            at: "right", g: "point",
            say: [
              "Ada chose the whole path herself, and she would rather the people along it did not all read her shopping list.",
              "So her instructions are wrapped in layers, like an onion, one layer for each person on the path.",
              "Ben can open only the outer layer, and all it tells him is where this came from, where to send the rest, and how much by what deadline.",
              "Cleo opens the next layer and learns that it came from Ben and goes on to Dan.",
              "Dan opens the last and learns that the payment is for him.",
              { s: "The packet is the same size at every step, 1,366 bytes, so nobody can tell from it how long the path is or where on it they stand.", g: "pinch" },
              "Ben cannot even be sure that Ada is the one paying, since she might be passing it along for somebody else.",
              "Lecture 12 looked at privacy as a whole, so I will only say that this is a real improvement on a public ledger, and not an invisibility cloak."
            ] },
          { slide: { k: "code", title: "What an invoice says", start: 1, lines: [
              "lnbc30u1p...       one long string, or a square code to scan",
              "  lnbc             Lightning, on Bitcoin's main network",
              "  30u              30 millionths of a bitcoin: 3,000 sats",
              "  payment hash     the fingerprint of Dan's secret",
              "  description      \"one jar of honey\"",
              "  expiry           one hour, unless it says otherwise",
              "  signature        made with the key of Dan's node"
            ] },
            at: "centre", g: "open",
            say: [
              "Last of the three: how did Dan ask to be paid?",
              { s: "He showed Ada an invoice, which is one long string of letters and digits, usually drawn as a square code for a phone to scan.", show: 1 },
              { s: "It begins with the letters l, n, b, c, which say Lightning, on Bitcoin's main network.", show: 2 },
              { s: "Then the amount, here 30 millionths of a bitcoin, which is our 3,000 satoshis.", show: 3 },
              { s: "Then the most important part, the fingerprint of the secret that Dan has just made up.", show: 4 },
              { s: "There is room for a short description, and an expiry time, which is one hour unless the invoice says otherwise.", show: 6 },
              { s: "And the whole thing is signed by Dan's node, so Ada knows whom she is paying and that nobody has altered the request on the way.", show: 7 },
              "Notice that a Lightning payment starts with the receiver, who must first make a secret and hand over its fingerprint."
            ] }
        ] },

      { id: "limits", title: "The Honest Limits", topics: ["liquidity", "receiving payments", "being online", "watching for cheats", "watchtowers", "custody", "what lightning achieves"],
        beats: [
          { slide: { k: "section", title: "The Honest Limits", sub: "What this layer asks of you in return" },
            at: "lectern", g: "open",
            say: [
              "I promised at the start of this course that I would not sell you anything, and I will not start now.",
              "Lightning is a real achievement, and it comes with real costs.",
              "They are worth knowing exactly, because each one follows from something you have seen today."
            ] },
          { board: { clear: true, title: "Which way can it flow?", ops: [
              { text: "Ada", x: 10, y: 20, size: 5, at: 0 },
              { text: "Ben", x: 150, y: 20, a: "r", size: 5, at: 0 },
              { box: [10, 25, 140, 10], at: 0 },
              { box: [10, 25, 133, 10], c: "blue", fill: true, at: 1 },
              { text: "19,000", x: 76, y: 42, a: "c", size: 4.5, c: "blue", at: 1 },
              { text: "1,000", x: 147, y: 42, a: "c", size: 4, c: "amber", at: 1 },
              { arrow: [50, 52, 110, 52], c: "green", at: 2 },
              { text: "can send: up to her own side", x: 80, y: 59, a: "c", size: 4.5, c: "green", at: 2 },
              { arrow: [152, 68, 136, 68], c: "red", at: 3 },
              { text: "can receive: only Ben's sliver", x: 80, y: 73, a: "c", size: 4.5, c: "red", at: 3 },
              { text: "money in a channel has a direction", x: 80, y: 86, a: "c", size: 5, at: 4 }
            ] },
            say: [
              "The first limit is the one that surprises people, so let me draw the bar again.",
              "Ada's channel stands at 19,000 on her side and 1,000 on Ben's.",
              "She can send up to what is on her side, less the small reserve, because a payment slides the divider away from her.",
              "But she can receive only what is on Ben's side, because receiving slides it towards her, and it cannot go past the end.",
              "So money in a channel is not just an amount; it has a direction.",
              { s: "A shopkeeper who opens a fresh channel with their own coins can pay out all day, and cannot yet be paid a thing.", g: "shrug" }
            ] },
          { slide: { k: "points", title: "What Lightning asks of you", start: 0, points: [
              "Money on the right side: yours to send, theirs to receive",
              "Being online: both ends must be awake to sign",
              "Watching: an old version must be caught within the delay",
              "Keys on a connected machine, and backups kept current",
              "The chain's fees and waits, when opening and closing"
            ] },
            at: "right", g: "count",
            say: [
              { s: "So the first cost is minding which side the money is on, and along a path every channel needs enough on its sending side.", show: 1 },
              "That is why small payments find a path easily, and large ones sometimes do not.",
              { s: "Second, both ends must be online, because paying and being paid both mean signing a new version on the spot.", show: 2 },
              { s: "Third, somebody must look at the chain at least once within the delay, in case an old version of your channel appears there.", show: 3 },
              "You can do that yourself, or hand the watching to a service called a watchtower, which can answer a cheat for you but cannot spend your coins.",
              { s: "Fourth, your node signs things all day long, so its keys live on a connected machine, which is a different bargain from the offline keys of lecture 11.", show: 4 },
              "Even backups need care, because an out-of-date copy of a channel, restored and broadcast, looks exactly like a cheat.",
              { s: "And fifth, opening and closing are ordinary transactions, with the fees and the waiting that lecture 10 described.", show: 5 }
            ] },
          { at: "centre", g: "open",
            say: [
              "There is one more thing to say plainly.",
              "Because all of this is work, many people let a company run it for them, and simply see a balance in an app.",
              { s: "That can be convenient, but look at what it is: an account, with a keeper, exactly as in lecture 1.", g: "weigh" },
              "The layer itself needs no keeper, and whether you accept one is a choice to make with your eyes open."
            ] },
          { slide: { k: "compare", title: "The chain and the layer",
              left: { head: "On the chain", points: ["About ten minutes to a block", "A fee to a miner each time", "Checked and kept by every node", "Settled, with no one online"] },
              right: { head: "Over Lightning", points: ["About as fast as a message", "A tiny fee to those in between", "Seen only by those on the path", "Needs channels, and attention"] } },
            at: "left", g: "weigh",
            say: [
              "So here are the two, side by side: on the chain a payment waits for a block, pays a miner, and is checked and kept by everyone.",
              "Over Lightning a payment settles about as fast as a message travels, for a fee that is usually a very small fraction of the amount.",
              "It is seen only by the people on its path, and by itself it leaves nothing on the chain.",
              { s: "The price is the list we have just been through: channels to mind, a machine to keep awake, a chain to watch.", g: "count" },
              "Neither replaces the other: the chain is where things are settled for good, and the layer is where the everyday paying gets done.",
              "And the layer is only safe because the chain underneath it is slow, careful and checked by everyone."
            ] },
          { say: ["One last question for the course, and it is a practical one.", "With a new channel funded only by her own coins, what can Ada not yet do?"],
            quiz: {
              q: "With a new channel funded only by her own coins, what can Ada not yet do?",
              options: [
                "Receive a payment through it",
                "Close it without Ben's help",
                "Send a payment through it",
                "See what her balance is"
              ],
              answer: 0,
              right: ["Exactly: with nothing on the far side yet, there is nothing that can slide towards her."],
              wrong: [
                null,
                ["She can always close alone, with the latest version in her pocket.", "The thing she cannot yet do is receive, since Ben's side of the channel is still empty."],
                ["Sending is the one thing she can do, since all the money is on her side.", "What she cannot yet do is receive, because nothing is on the far side to slide towards her."],
                ["She holds every signed version, so she always knows her balance.", "What is missing is money on Ben's side, and until some is there she cannot receive."]
              ]
            } }
        ] },

      { id: "course-close", title: "The Coin, Once More", topics: ["course summary", "four ideas", "market stall", "do not trust, verify"],
        beats: [
          { slide: { k: "section", title: "The Coin, Once More", sub: "Fourteen lectures, four ideas, one habit" },
            at: "lectern", g: "open",
            say: [
              "So let us go back to where we began, at the market stall.",
              "Ada holds her phone over Dan's invoice, and a moment later the honey is hers.",
              "Nobody phoned anyone, no keeper approved it, and nobody opened an account for either of them.",
              { s: "In lecture 1, physics did the bookkeeping, because a coin cannot be in two pockets at once.", g: "pinch" },
              "Here arithmetic does it: a secret, a fingerprint, a few signatures, and a chain standing behind them."
            ] },
          { slide: { k: "figure", title: "A coin, and a payment like a coin", ops: [
              { text: "Lecture 1", x: 40, y: 5, a: "c", size: 4, c: "grey" },
              { text: "Lecture 14", x: 120, y: 5, a: "c", size: 4, c: "grey" },
              { line: [80, 2, 80, 52], c: "grey", dash: true },
              { box: [6, 14, 24, 12], t: "you", at: 0 },
              { box: [50, 14, 24, 12], t: "stall", at: 0 },
              { arrow: [31, 20, 49, 20], at: 0 },
              { circle: [40, 33, 5], c: "amber", fill: true, at: 0 },
              { text: "a coin in the hand", x: 40, y: 46, a: "c", size: 4, at: 0 },
              { box: [86, 14, 24, 12], t: "Ada", at: 1 },
              { box: [130, 14, 24, 12], t: "Dan", at: 1 },
              { arrow: [111, 20, 129, 20], c: "green", at: 1 },
              { circle: [113, 33, 2.5], c: "grey", at: 1 }, { circle: [127, 33, 2.5], c: "grey", at: 1 },
              { path: [98, 27, 98, 33, 110, 33], c: "grey", dash: true, at: 1 },
              { line: [116, 33, 124, 33], c: "grey", dash: true, at: 1 },
              { path: [130, 33, 142, 33, 142, 27], c: "grey", dash: true, at: 1 },
              { text: "a secret for a jar of honey", x: 120, y: 46, a: "c", size: 4, at: 1 },
              { text: "done in a moment, with no keeper", x: 80, y: 60, a: "c", size: 4.5, c: "green", at: 3 }
            ] },
            at: "screen", g: "point",
            say: [
              "On the left is the coin we started with.",
              "On the right is the payment we have just built.",
              "It is not a coin, and I will not pretend it is, for it needs a phone, a channel and people willing to pass it along.",
              { s: "But it has what we went looking for: it arrives in a moment, it costs next to nothing, and no single party stands in the middle with the power to stop it.", g: "up" }
            ] },
          { board: { clear: true, title: "Four ideas, one system", ops: [
              { box: [8, 40, 64, 16], t: "1 public ledger", c: "blue", at: 0 },
              { box: [88, 40, 64, 16], t: "2 signatures", c: "green", at: 1 },
              { box: [8, 62, 64, 16], t: "3 proof of work", c: "amber", at: 2 },
              { box: [88, 62, 64, 16], t: "4 nodes", c: "red", at: 3 },
              { box: [30, 10, 100, 16], t: "Lightning: payments above", at: 4 },
              { arrow: [80, 27, 80, 38], at: 4 },
              { text: "settles on", x: 84, y: 34, size: 3.8, c: "grey", at: 4 },
              { text: "no keeper", x: 80, y: 86, a: "c", size: 5.5, at: 5 }
            ] },
            say: [
              "Let me draw the map from lecture 1 one last time: a public ledger that anyone can hold and check.",
              "Ownership by signature, so that a coin is yours because you hold a key, and for no other reason.",
              "Ordering by proof of work, so that history costs real energy to write, and more to rewrite.",
              "And rules enforced by everyone who runs a node, so that nobody's say-so outranks the rules.",
              "Today we stood a second storey on that foundation, and every beam in it is made of the same four ideas.",
              { s: "Ledger, signatures, work, nodes: four ideas, and still no keeper.", g: "count" }
            ] },
          { slide: { k: "table", title: "One payment, the whole course", start: 0, head: ["A step of Ada's payment", "Where we learned it"], rows: [
              ["Dan's secret and its fingerprint", "2  Hash functions"],
              ["Signing each new version", "3  Keys and signatures"],
              ["The funding output", "4  Coins are outputs"],
              ["The two-key lock, the time locks", "5  Programmable locks"],
              ["Opening and closing in blocks", "6 and 7  Blocks and mining"],
              ["The chain as the judge", "8  Agreement without a leader"],
              ["Gossip, fees, keys and privacy", "9 to 13  Network, users, change"]
            ] },
            at: "lectern", g: "open",
            say: [
              "If you want proof that the course hangs together, follow Ada's one payment back through it.",
              { s: "Dan's secret and its fingerprint are lecture 2, and every signature on every version is lecture 3.", show: 2 },
              { s: "The funding transaction makes an output like any other, from lecture 4, under the locks of lecture 5.", show: 4 },
              { s: "It was confirmed in a block made by proof of work, and it is judged by the most-work chain, which are lectures 6, 7 and 8.", show: 6 },
              { s: "And the network, the fees, the keys, the privacy and the way the rules changed to allow all this are lectures 9 to 13.", show: 7 },
              { s: "Nothing today was new machinery; it was the old machinery, used with imagination.", g: "open" }
            ] },
          { slide: { k: "live", title: "Still running: the latest blocks", panel: "blocks", note: "Live from the Bitcoin network while the hall is open" },
            at: "screen", g: "point",
            say: [
              "And underneath it all, the chain keeps its slow and steady time.",
              "These are the latest blocks, just as I showed you in lecture 1, only further along.",
              "Among their transactions there may be channels opening and closing, each one standing for payments the chain never saw.",
              "Every one of those blocks points back to the one before, all the way to a newspaper headline from January 2009.",
              "You now know what is inside them, how they are made, who checks them, and why nobody can quietly change them."
            ] },
          { slide: { k: "title", kicker: "Bitcoin from First Principles", title: "Do not trust, verify", sub: "The habit to take with you" },
            at: "centre", g: "open",
            say: [
              "I said at the start that all I asked of you was curiosity, and a healthy refusal to take my word for anything.",
              "I hope that over 14 lectures you have seen why that refusal is not rudeness, but the whole design.",
              { s: "This system works because nobody in it has to be believed: not a bank, not a miner, not a founder, and certainly not a lecturer.", g: "shrug" },
              "You need not take anyone's word for what the rules are, or for whether they are being kept, because you can run a node and check.",
              "That goes for everything I have told you, too: the paper, the proposals and the code are all public, and they are the authority, not me.",
              { s: "So keep the habit I named in lecture 1: do not trust, verify.", g: "pinch" },
              "It has been a pleasure to take this machine apart with you.",
              { s: "Thank you, and goodbye.", g: "up" }
            ] }
        ] }
    ]
  });
})();
