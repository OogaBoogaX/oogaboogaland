// Bitcoin from First Principles, lecture 12: the trade the whitepaper made (every payment public, under keys rather than names), the three guesses that see through it (inputs spent together, the change, an address used twice), how one real name labels a whole history and what the network leaks, the 2013 study that showed it works at scale, what helps and what each habit costs (fresh addresses, chosen coins, a node of your own, coinjoin and payjoin), what taproot and Lightning change, and why privacy here is a practice and not a property.
(() => {
  "use strict";
  window.BL.lectures.add({
    id: "btc-12", course: "first-principles", n: 12, title: "Privacy and Its Limits",
    reading: [
      { title: "Bitcoin: A Peer-to-Peer Electronic Cash System, section 10", by: "Satoshi Nakamoto, 2008" },
      { title: "A Fistful of Bitcoins", by: "Sarah Meiklejohn and others, 2013" },
      { title: "CoinJoin: Bitcoin privacy for the real world", by: "Gregory Maxwell, 2013" }
    ],
    sources: [
      "Satoshi Nakamoto, Bitcoin: A Peer-to-Peer Electronic Cash System (2008), section 10, Privacy, https://bitcoin.org/bitcoin.pdf",
      "Sarah Meiklejohn, Marjori Pomarole, Grant Jordan, Kirill Levchenko, Damon McCoy, Geoffrey M. Voelker and Stefan Savage, A Fistful of Bitcoins: Characterizing Payments Among Men with No Names, IMC 2013, https://smeiklej.com/files/imc13.pdf",
      "Fergal Reid and Martin Harrigan, An Analysis of Anonymity in the Bitcoin System (2011), https://arxiv.org/abs/1107.4524",
      "Gregory Maxwell, CoinJoin: Bitcoin privacy for the real world, Bitcoin Forum, 22 August 2013, https://bitcointalk.org/index.php?topic=279249.0",
      "Nicolas Dorier, BIP 78: A Simple Payjoin Proposal (2019), https://github.com/bitcoin/bips/blob/master/bip-0078.mediawiki, with Ryan Havar, BIP 79: Bustapay (2018), https://github.com/bitcoin/bips/blob/master/bip-0079.mediawiki",
      "Pieter Wuille, Jonas Nick and Anthony Towns, BIP 341: Taproot: SegWit version 1 spending rules, Motivation and Design, https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki",
      "Bitcoin Optech, Taproot (activation at block 709,632, November 2021), https://bitcoinops.org/en/topics/taproot/",
      "Bitcoin developer guide, Transactions: Avoiding key reuse, https://developer.bitcoin.org/devguide/transactions.html#avoiding-key-reuse",
      "Alex Biryukov, Dmitry Khovratovich and Ivan Pustogarov, Deanonymisation of Clients in Bitcoin P2P Network (2014), https://arxiv.org/abs/1405.7418",
      "Lightning Network specifications, BOLT 4: Onion Routing Protocol, https://github.com/lightning/bolts/blob/master/04-onion-routing.md, and BOLT 7: P2P Node and Channel Discovery, https://github.com/lightning/bolts/blob/master/07-routing-gossip.md",
      "United States Department of Justice, Two Arrested for Alleged Conspiracy to Launder $4.5 Billion in Stolen Cryptocurrency, 8 February 2022, https://www.justice.gov/archives/opa/pr/two-arrested-alleged-conspiracy-launder-45-billion-stolen-cryptocurrency"
    ],
    sections: [
      { id: "public-payments", title: "Public Payments, Hidden Names", topics: ["whitepaper section 10", "pseudonymity", "public ledger", "anonymity", "why privacy matters"],
        beats: [
          { slide: { k: "title", kicker: "Lecture 12", title: "Privacy and Its Limits", sub: "Pseudonymous is not anonymous" },
            at: "lectern", g: "open",
            say: [
              "Welcome back to Bitcoin from First Principles.",
              "Last time you became your own keeper: a seed, a tree of keys grown from it, and a backup that only you hold.",
              "So nobody can freeze your coins, and nobody had to approve you.",
              { s: "Today's question is a quieter one: now that you hold your own keys, who can see what you do with them?", g: "lean" },
              "In lecture 1 we said that a keeper's ledger is a diary of your life, kept by somebody else.",
              "Bitcoin dismissed the keeper, but it kept the diary, and then it did something startling with it.",
              { s: "It published the diary to the whole world.", g: "wide" }
            ] },
          { slide: { k: "points", title: "Today: an honest look", start: 0, points: [
              "The trade: public payments, hidden names",
              "Three guesses that undo the hiding",
              "How one real name unravels a history",
              "What helps, and what each habit costs",
              "What taproot and Lightning change"
            ] },
            at: "centre", g: "open",
            say: [
              { s: "First, the trade the design made: every payment in public, but under keys instead of names.", show: 1 },
              { s: "Second, the three guesses an observer uses to see through that, and how one real name unravels the rest.", show: 3, g: "count" },
              { s: "Then what actually helps, with the price of each habit stated plainly.", show: 4 },
              { s: "And last, what two newer pieces of the system, taproot and Lightning, change.", show: 5 },
              { s: "This is neither a guide to hiding from the law nor a ghost story to frighten you.", g: "chop" },
              "It is a map of what a public ledger shows, so that you are never surprised by it."
            ] },
          { slide: { k: "compare", title: "Two ways to keep a payment private",
              left: { head: "A bank's ledger", points: ["Your name on every line", "Closed to the public", "Open to the bank, and whoever asks it", "Privacy by locked doors"] },
              right: { head: "Bitcoin's ledger", points: ["No names anywhere", "Open to everyone, for ever", "Every amount and time on show", "Privacy by missing names"] } },
            at: "left", g: "weigh",
            say: [
              "There are two places where you can break the link between a person and a payment.",
              "A bank keeps full records, with your name on every line, and then locks the door on the public.",
              "Bitcoin cannot lock the door, because strangers can only check the ledger if they can read all of it.",
              { s: "So it breaks the link in the other place: the ledger is wide open, and the names are simply not there.", g: "pinch" },
              "The whitepaper compares this to the tape of a stock exchange, which shows the time and size of every trade and never who traded.",
              "It sets the whole idea out in section 10, which is barely half a page, and that is your reading for today."
            ] },
          { slide: { k: "live", title: "Public, as it happens", panel: "blocks", note: "Every transaction in these blocks can be read by anyone, for ever" },
            at: "screen", g: "point",
            say: [
              "Here are the latest blocks, live.",
              "Every transaction inside them can be read by anyone on Earth: which coins were spent, which were made, and every amount to the last unit.",
              "What you will not find in there is a name, a street or a bank account number.",
              "You find addresses, which are made from keys and look like strings of random letters.",
              { s: "A name that is not your real name has a word of its own: a pseudonym.", g: "pinch" }
            ] },
          { at: "centre", g: "open",
            say: [
              "Think of a novelist who writes under a pen name.",
              "Her readers do not know who she is, but they know that every book under that name came from the same hand.",
              "And if one day her identity slips out, it does not slip out for one book.",
              { s: "Every book she ever published under that name is hers, all at once, and so is every book still to come.", g: "wide" },
              "That is the difference between pseudonymous and anonymous, and it is the whole of today's lecture in one picture."
            ] },
          { slide: { k: "quote", text: "Some linking is still unavoidable with multi-input transactions...", by: "Satoshi Nakamoto, Bitcoin whitepaper, section 10, 2008" },
            at: "lectern", g: "open",
            say: [
              "The paper was candid about this from the first day.",
              "Its advice is to use a new pair of keys for every payment, so that your payments cannot be tied to a common owner.",
              { s: "And then, in the very next breath, it admits this.", g: "point" },
              "When one transaction spends several coins at once, it says, that necessarily shows those coins had the same owner.",
              "And it names the risk: if the owner of one key is revealed, the links could reveal that owner's other transactions too.",
              "So the limits of this privacy were not dug up later by critics; they are written into the design document."
            ] },
          { say: ["Let me check that the trade has landed before we put it under strain.", "What does Bitcoin's public ledger leave out?"],
            quiz: {
              q: "What does Bitcoin's public ledger leave out?",
              options: [
                "The names of the people behind the keys",
                "The time each payment was confirmed",
                "Which coins each payment spent",
                "The amount of each payment"
              ],
              answer: 0,
              right: ["Exactly: everything is on show except who the keys belong to."],
              wrong: [
                null,
                ["Every block carries a time, so that is public too.", "The one thing missing is the names of the people behind the keys."],
                ["Which coins were spent is exactly what every node has to check, so it must be public.", "What is left out is the names of the people behind the keys."],
                ["Amounts are public, down to the smallest unit.", "What the ledger leaves out is the names of the people behind the keys."]
              ]
            } }
        ] },

      { id: "three-guesses", title: "Three Educated Guesses", topics: ["common input ownership", "change output", "address reuse", "heuristics", "clustering"],
        beats: [
          { slide: { k: "section", title: "Three Educated Guesses", sub: "Shared inputs, change, and addresses used twice" },
            at: "lectern", g: "open",
            say: [
              "So let us play the observer.",
              "The observer might be a researcher, a business, a government, a thief choosing a target, or just a curious neighbour.",
              "They have the whole ledger, a computer and patience, and they have no names at all.",
              { s: "Their craft is the educated guess, and three guesses do most of the work.", g: "count" }
            ] },
          { slide: { k: "figure", title: "What one payment shows", ops: [
              { box: [6, 8, 34, 11], t: "coin 0.03" },
              { box: [6, 26, 34, 11], t: "coin 0.04" },
              { text: "inputs: coins you spend", x: 26, y: 46, a: "c", size: 3.5, c: "grey", at: 1 },
              { arrow: [41, 14, 61, 21], at: 1 },
              { arrow: [41, 31, 61, 27], at: 1 },
              { box: [62, 12, 36, 24], t: "transaction", c: "blue" },
              { arrow: [99, 21, 117, 14], c: "green", at: 2 },
              { box: [118, 8, 38, 11], t: "shop 0.05", c: "green", at: 2 },
              { arrow: [99, 27, 117, 31], c: "amber", at: 3 },
              { box: [118, 26, 38, 11], t: "change 0.0199", c: "amber", at: 3 },
              { text: "outputs: new coins", x: 137, y: 46, a: "c", size: 3.5, c: "grey", at: 3 },
              { text: "fee 0.0001", x: 80, y: 43, a: "c", size: 3.5, c: "grey", at: 4 },
              { text: "all of it public, none of it named", x: 80, y: 58, a: "c", size: 4.5, at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "First, a reminder from lecture 4 of what a payment looks like on the ledger.",
              "You do not hold a balance; you hold coins, and a transaction spends whole coins as its inputs.",
              "It makes new coins as its outputs, and one of them goes to the person you are paying.",
              "Whatever is left over comes back to you as a new coin of your own, which we called the change.",
              "A sliver is left for the miner as the fee.",
              { s: "The observer sees every one of these numbers, and the address on every coin, and their job is to work out the story behind them.", g: "lean" }
            ] },
          { board: { clear: true, title: "Guess 1: spent together, owned together", ops: [
              { box: [8, 16, 26, 12], t: "A", at: 1 },
              { box: [8, 34, 26, 12], t: "B", at: 1 },
              { arrow: [36, 22, 62, 29], at: 1 },
              { arrow: [36, 40, 62, 35], at: 1 },
              { box: [64, 24, 30, 16], t: "tx 1", c: "blue", at: 1 },
              { ellipse: [21, 31, 19, 21], c: "red", dash: true, at: 3 },
              { text: "one wallet?", x: 62, y: 12, a: "c", size: 4.5, c: "red", at: 3 },
              { box: [8, 70, 26, 12], t: "C", at: 4 },
              { arrow: [36, 46, 62, 62], at: 4 },
              { arrow: [36, 76, 62, 70], at: 4 },
              { box: [64, 58, 30, 16], t: "tx 2", c: "blue", at: 4 },
              { ellipse: [21, 49, 21, 40], c: "red", at: 5 },
              { text: "A + B + C", x: 128, y: 36, a: "c", size: 6, c: "red", at: 5 },
              { text: "one cluster", x: 128, y: 46, a: "c", size: 5, at: 5 },
              { text: "a strong guess, not a proof", x: 126, y: 72, a: "c", size: 4, c: "grey", at: 7 }
            ] },
            say: [
              "Guess one comes straight from that admission in the paper.",
              "Here is a transaction that spends two coins, one from address A and one from address B.",
              "To spend a coin you must sign for it, so whoever built this transaction very probably held the keys to both.",
              "So the observer draws a ring round A and B, and treats them as one wallet.",
              "Now suppose B turns up again, in another transaction, alongside a third address, C.",
              "The ring grows: A, B and C are one cluster, even though A and C never appeared together.",
              { s: "It is like watching someone pay from two purses at once: you assume both purses are theirs.", g: "shrug" },
              "It is a strong guess and not a proof, and later today we will see when it is simply wrong."
            ] },
          { say: ["A quick check on guess one.", "Two coins are spent as inputs to one transaction, so what will an observer most likely conclude?"],
            quiz: {
              q: "Two coins are inputs to one transaction. What will an observer most likely conclude?",
              options: [
                "The payment was made at a bank",
                "One of the coins must be stolen",
                "Both coins belong to the same owner",
                "The two owners have never met"
              ],
              answer: 2,
              right: ["Yes: spent together, so probably owned together."],
              wrong: [
                ["No bank appears anywhere in a transaction.", "The observer's guess is that one owner held both coins and spent them together."],
                ["Spending two coins at once is perfectly ordinary, and says nothing about theft.", "The observer concludes that both coins probably belong to the same owner."],
                null,
                ["Nothing on the ledger speaks about who has met whom.", "The usual conclusion is that both coins belong to one owner, who signed for both."]
              ]
            } },
          { slide: { k: "figure", title: "Guess 2: which output is the change?", ops: [
              { box: [6, 18, 30, 12], t: "0.07" },
              { arrow: [38, 24, 58, 24] },
              { box: [60, 14, 30, 20], t: "tx", c: "blue" },
              { arrow: [92, 20, 110, 15] },
              { box: [112, 8, 42, 12], t: "0.05000000" },
              { arrow: [92, 28, 110, 34] },
              { box: [112, 30, 42, 12], t: "0.01987340" },
              { text: "round number: a price", x: 133, y: 4, a: "c", size: 3.5, c: "green", at: 2 },
              { text: "odd leftover: the change", x: 133, y: 46, a: "c", size: 3.5, c: "amber", at: 3 },
              { text: "same style of address as the input", x: 48, y: 42, a: "c", size: 3.5, c: "grey", at: 4 },
              { path: [9, 31, 9, 54, 104, 54, 104, 38, 111, 38], c: "red", dash: true, at: 5 },
              { text: "same wallet, one step later", x: 77, y: 60, a: "c", size: 4, c: "red", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "Guess two is about the leftover.",
              "Most payments have two outputs, the payment itself and the change, and the ledger does not say which is which.",
              "But people price things in round numbers, so an output of exactly five hundredths of a coin looks like a price.",
              "And an output with digits all the way down looks like what was left after the price and the fee.",
              "There are other tells: the change often goes to the same style of address as the inputs, and to an address never seen before.",
              { s: "Pick out the change, and you have followed the same wallet one step forward in time.", g: "pinch" },
              "Repeat that at every step, and you can walk behind a wallet for years."
            ] },
          { slide: { k: "figure", title: "Guess 3: one address, used twice", ops: [
              { box: [56, 22, 48, 14], t: "one address", c: "amber", fill: true },
              { text: "salary, March", x: 22, y: 8, a: "c", size: 3.5, at: 1 },
              { arrow: [22, 12, 54, 25], at: 1 },
              { text: "salary, April", x: 22, y: 52, a: "c", size: 3.5, at: 1 },
              { arrow: [22, 47, 54, 33], at: 1 },
              { arrow: [106, 25, 138, 12], at: 2 },
              { text: "rent", x: 138, y: 8, a: "c", size: 3.5, at: 2 },
              { arrow: [106, 33, 138, 47], at: 2 },
              { text: "a donation", x: 138, y: 52, a: "c", size: 3.5, at: 2 },
              { text: "no guessing needed: it is one pen name", x: 80, y: 60, a: "c", size: 4.5, c: "red", at: 3 }
            ] },
            at: "left", g: "open",
            say: [
              "Guess three is hardly a guess at all.",
              "If you give the same address to everyone who pays you, every payment in sits side by side on the ledger.",
              "And everything you spend from it is tied to the same string of letters.",
              { s: "That is the pen name again: one address used twice is one hand seen twice.", g: "pinch" },
              "This is why the wallets of lecture 11 grow a fresh address for every payment from a single seed.",
              "The paper's advice, a new key every time, costs you almost nothing now, because the wallet does it for you."
            ] },
          { at: "centre", g: "open",
            say: [
              "Notice that none of these three is certain.",
              "A round number can be the change, and two people can build one transaction together.",
              { s: "But the observer does not need certainty, any more than a weather forecaster does.", g: "weigh" },
              "They stack the guesses, check each against the others, and throw away the rings that look wrong.",
              "What comes out is a map of wallets: millions of addresses gathered into far fewer clusters.",
              { s: "It is a map with no names on it, and that is where the second half of the trouble begins.", g: "lean" }
            ] }
        ] },

      { id: "one-name", title: "One Name Unravels the Rest", topics: ["identity", "exchanges", "address labels", "permanence", "network leaks", "internet address"],
        beats: [
          { slide: { k: "section", title: "One Name Unravels the Rest", sub: "Where names leak in, and how far they travel" },
            at: "lectern", g: "open",
            say: [
              "A map with no names is a puzzle, and a single name can be the piece that solves it.",
              "So where do real names come from?",
              { s: "Mostly, I am sorry to say, from us.", g: "shrug" }
            ] },
          { slide: { k: "points", title: "Where names leak in", start: 0, points: [
              "Buying coins from a business that checks identity",
              "Paying a shop that knows your delivery address",
              "Posting an address in public, for tips or donations",
              "Paying someone who simply knows who you are"
            ] },
            at: "right", g: "count",
            say: [
              { s: "Many people get their first coins from a business that is required by law to check who its customers are.", show: 1 },
              "That business knows your name, and it knows exactly which coins it sent you.",
              { s: "A shop that posts you a parcel knows your home address and the coin you paid with.", show: 2 },
              { s: "A charity or a writer who publishes an address for donations has labelled it for the whole world.", show: 3 },
              { s: "And anyone you pay in person, your landlord, a friend, your employer, knows whose coin that was.", show: 4 },
              "None of these people is spying on you; each simply holds one small, true label."
            ] },
          { board: { clear: true, title: "One label, the whole cluster", ops: [
              { circle: [28, 30, 5] },
              { circle: [48, 22, 5] },
              { circle: [66, 34, 5] },
              { circle: [46, 44, 5] },
              { circle: [26, 54, 5] },
              { circle: [64, 58, 5] },
              { line: [33, 28, 43, 24], c: "grey" },
              { line: [53, 24, 62, 31], c: "grey" },
              { line: [61, 36, 51, 42], c: "grey" },
              { line: [41, 46, 31, 52], c: "grey" },
              { line: [50, 47, 60, 55], c: "grey" },
              { ellipse: [46, 40, 34, 29], c: "grey", dash: true, at: 1 },
              { text: "whose?", x: 46, y: 78, a: "c", size: 5, c: "grey", at: 1 },
              { circle: [66, 34, 7], c: "red", at: 2 },
              { arrow: [112, 34, 75, 34], c: "red", at: 2 },
              { box: [114, 26, 42, 16], t: "parcel: Mira", c: "red", at: 2 },
              { text: "all Mira's", x: 46, y: 6, a: "c", size: 6, c: "red", at: 3 },
              { text: "every past payment", x: 122, y: 58, a: "c", size: 4.5, at: 4 },
              { text: "every future one", x: 122, y: 67, a: "c", size: 4.5, at: 5 },
              { text: "one label, a whole history", x: 116, y: 82, a: "c", size: 4.5, c: "red", at: 6 }
            ] },
            say: [
              "Here is one of the observer's clusters: a ring of addresses that the three guesses have tied together.",
              "For now it is just wallet number four million and something, belonging to nobody in particular.",
              "Then one address in the ring pays a shop, and the shop's records say that the parcel went to Mira.",
              "At that moment the whole ring is Mira's, and not just the one address.",
              "Every payment the cluster ever made is now hers, back to the very first.",
              "And every payment it makes from now on is hers too, for as long as the guesses can follow it.",
              { s: "One label does not expose one payment; it exposes a history.", g: "pinch" }
            ] },
          { at: "centre", g: "open",
            say: [
              "And remember what kind of ledger this is.",
              "Lecture 7 showed that rewriting it means redoing the work, so nothing on it is ever deleted or edited.",
              "A careless payment today can still be read in 20 years, by tools not yet written, against lists of names not yet leaked.",
              { s: "Privacy lost on this ledger is lost for good.", g: "rest" },
              "It cuts close to home as well: pay a friend, and the friend can see the coin you paid with and the change you kept.",
              "Settle a lunch bill with a coin from your savings, and your friend has a fair idea of what you are worth."
            ] },
          { slide: { k: "figure", title: "The network's side door", ops: [
              { circle: [22, 28, 7], t: "you", c: "blue" },
              { circle: [58, 10, 4] },
              { circle: [58, 28, 4] },
              { circle: [58, 46, 4] },
              { circle: [90, 18, 4] },
              { circle: [90, 38, 4] },
              { arrow: [29, 25, 53, 12], at: 1 },
              { arrow: [30, 28, 53, 28], at: 1 },
              { arrow: [29, 31, 53, 44], at: 1 },
              { line: [62, 11, 86, 17], c: "grey", at: 1 },
              { line: [62, 29, 86, 37], c: "grey", at: 1 },
              { box: [116, 18, 38, 20], t: "listener", c: "red", at: 3 },
              { line: [62, 9, 116, 22], c: "red", dash: true, at: 3 },
              { line: [94, 18, 116, 25], c: "red", dash: true, at: 3 },
              { line: [94, 38, 116, 32], c: "red", dash: true, at: 3 },
              { line: [62, 47, 116, 36], c: "red", dash: true, at: 3 },
              { text: "who said it first?", x: 135, y: 44, a: "c", size: 3.5, c: "red", at: 3 },
              { text: "an internet address leads to a household", x: 80, y: 59, a: "c", size: 4, c: "red", at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "There is one more door, and it is not on the ledger at all.",
              "In lecture 9 we saw that a new transaction is handed to a few peers, who pass it on until the whole network has it.",
              "The transaction itself carries no return address, which is good.",
              "But a listener connected to a great many nodes at once can notice which node tended to announce it first.",
              "A node has an internet address, and an internet address usually leads to a household.",
              "Researchers in Luxembourg demonstrated attacks of this kind in 2014, and node software has been changed since to make them harder, though not impossible.",
              "And a wallet with no node of its own must ask somebody else's, which tells that somebody exactly which addresses are yours."
            ] },
          { say: ["Before we see how well all this works in practice, one question.", "Why does a single link between an address and a real name matter so much?"],
            quiz: {
              q: "Why does a single link between an address and a real name matter so much?",
              options: [
                "It removes the payment from the ledger",
                "It lets the observer spend that person's coins",
                "It reveals the secret key behind the address",
                "It names the whole cluster, past and future"
              ],
              answer: 3,
              right: ["Right: the guesses carry one name across a whole history."],
              wrong: [
                ["Nothing is ever removed from the ledger, and that is part of the trouble.", "One link matters because it names the whole cluster, past and future."],
                ["Spending needs the secret key, and a name gives nobody that.", "The damage is that one name spreads to the whole cluster, past and future."],
                ["A name tells you nothing about a secret key, so the coins themselves stay safe.", "What is lost is privacy: the one name attaches to the whole cluster, past and future."],
                null
              ]
            } }
        ] },

      { id: "tested-at-scale", title: "Tested at Scale", topics: ["meiklejohn", "fistful of bitcoins", "chain analysis", "research", "tracing", "analysis industry"],
        beats: [
          { slide: { k: "section", title: "Tested at Scale", sub: "A 2013 experiment, and the industry that followed" },
            at: "lectern", g: "open",
            say: [
              "Is any of this more than a clever theory?",
              "From 2011 onwards, research groups had begun trying the first guess on the real ledger.",
              "Then, in 2013, a team from the University of California, San Diego and George Mason University ran the experiment that settled it.",
              "The lead author was Sarah Meiklejohn, and the paper has a title worthy of a western: A Fistful of Bitcoins.",
              { s: "Its subtitle is better still: Characterizing Payments Among Men with No Names.", g: "glasses" }
            ] },
          { slide: { k: "number", value: "344", label: "transactions the researchers made, as ordinary customers", note: "Meiklejohn and others, A Fistful of Bitcoins, 2013" },
            at: "centre", g: "open",
            say: [
              "What I admire is how ordinary their method was.",
              "They did not break any cryptography, and they did not break into anything.",
              { s: "They went shopping.", g: "shrug" },
              "They made 344 transactions with exchanges, wallet services, shops, gambling sites and mining pools.",
              "Each time, they learned an address that certainly belonged to that business, because they had just dealt with it.",
              "That gave them 1,070 addresses labelled by hand."
            ] },
          { slide: { k: "table", title: "From a few labels to a map", start: 0, head: ["Step", "What they had"], rows: [
              ["The ledger, April 2013", "about 12 million addresses"],
              ["Labelled by hand", "1,070 addresses"],
              ["After guess 1", "about 5.6 million clusters"],
              ["After guesses 1 and 2", "about 3.4 million clusters"],
              ["Clusters they could name", "2,197"],
              ["Addresses inside those", "more than 1.8 million"]
            ], note: "Figures from the paper, which counts public keys; here we call them addresses." },
            at: "left", g: "open",
            say: [
              { s: "At the time, the ledger held about 12 million addresses and 16 million transactions.", show: 1 },
              { s: "Against that, 1,070 labels is a drop in the ocean.", show: 2, g: "pinch" },
              { s: "Then they ran the first guess, inputs spent together, and the addresses collapsed into about 5.6 million clusters.", show: 3 },
              { s: "A careful version of the second guess, the change, brought that down to about 3.4 million.", show: 4 },
              { s: "Those labels, with some five thousand more that people had published themselves, now named 2,197 of those clusters, the biggest services among them.", show: 5 },
              { s: "Together the named clusters held more than 1.8 million addresses.", show: 6, g: "wide" },
              "A few thousand labels in, and nearly two million addresses out: that is what the guesses are worth."
            ] },
          { at: "centre", g: "open",
            say: [
              "With the big services named, they followed coins from well-known thefts and watched them arrive at exchanges.",
              "Their conclusion was sober: an agency with the legal power to demand an exchange's records would be well placed to learn who was paying whom.",
              { s: "They argued that this made the system a poor place to hide large flows of money, since large sums sooner or later pass through those named businesses.", g: "weigh" },
              "And they were careful about what they had not done: unmasking every ordinary user was never their aim."
            ] },
          { slide: { k: "points", title: "From a paper to an industry", start: 0, points: [
              "Firms now cluster the whole ledger, continuously",
              "Customers: exchanges, banks, police, tax offices",
              "Labels come from records, leaks and court orders",
              "The ledger is permanent, so old trails stay warm"
            ] },
            at: "right", g: "open",
            say: [
              { s: "What a university team did by hand in 2013, companies now do continuously and sell as a service.", show: 1 },
              { s: "Their customers are exchanges that must screen deposits, and banks, police forces and tax authorities.", show: 2 },
              { s: "Their labels come from business records, court orders, leaked files and shopping trips of their own.", show: 3 },
              { s: "And because nothing is ever erased, an old trail never goes cold.", show: 4 },
              "In February 2022, American investigators seized about 94,000 bitcoin that had been stolen from an exchange back in 2016.",
              "More than five years had passed, and every movement of those coins was still sitting on the ledger to be read."
            ] },
          { slide: { k: "compare", title: "One lens, two views",
              left: { head: "What it catches", points: ["Thieves cashing out stolen coins", "Ransoms on their way out", "Fraud that hoped to vanish"] },
              right: { head: "What it also shows", points: ["Your salary, to anyone you pay", "Your savings, to a would-be thief", "Your donations, to those who object", "Guesses that land on the wrong person"] } },
            at: "centre", g: "weigh",
            say: [
              "I promised an honest look, so here are both sides of the lens.",
              "The same openness that lets you check the money supply lets an investigator follow a thief, and many thefts have been traced this way.",
              "But the lens does not know good from bad.",
              "It shows your salary to the person you pay, your savings to a burglar choosing a house, and your donations to anyone who resents them.",
              { s: "And remember that these are guesses: a ring drawn round the wrong addresses can point at an innocent person.", g: "lean" },
              "Wanting curtains on your windows does not mean that anything wrong is going on behind them.",
              "So the useful question is not whether privacy is good or bad, but what an ordinary user can actually do."
            ] }
        ] },

      { id: "habits-that-help", title: "Habits That Help", topics: ["fresh addresses", "coin selection", "coin control", "own node", "coin labels"],
        beats: [
          { slide: { k: "section", title: "Habits That Help", sub: "Fresh addresses, chosen coins, a node of your own" },
            at: "lectern", g: "open",
            say: [
              "There are three habits, and each one answers one of the leaks we have met.",
              "None of them is magic, and each has a price, which I will name as we go."
            ] },
          { slide: { k: "points", title: "Three habits", start: 0, points: [
              "A fresh address for every payment you receive",
              "Choose which coins you spend together",
              "Ask your own node, not somebody else's"
            ] },
            at: "left", g: "count",
            say: [
              { s: "Habit one: never hand out the same address twice.", show: 1 },
              "That starves guess three, and your wallet does it for you from the seed, as we saw last time.",
              "Its price is small: the people who pay you must ask for a new address each time, instead of saving the old one.",
              { s: "Habit two is the one people overlook: choose which of your coins you spend together.", show: 2 },
              { s: "And habit three: get your view of the ledger from a node of your own.", show: 3 },
              "Let me draw the second one, because it is where guess one bites."
            ] },
          { board: { clear: true, title: "Choosing which coins to spend", ops: [
              { text: "your wallet", x: 30, y: 10, a: "c", size: 4.5, c: "grey", at: 0 },
              { box: [8, 16, 44, 12], t: "salary 0.04", c: "blue", at: 1 },
              { box: [8, 34, 44, 12], t: "savings 0.5", c: "green", at: 1 },
              { box: [8, 52, 44, 12], t: "gift 0.01", c: "amber", at: 1 },
              { text: "to pay: 0.045", x: 111, y: 14, a: "c", size: 5, at: 2 },
              { arrow: [54, 22, 92, 34], at: 3 },
              { arrow: [54, 58, 92, 42], at: 3 },
              { box: [94, 30, 34, 16], t: "tx", c: "blue", at: 3 },
              { text: "salary + gift:", x: 111, y: 54, a: "c", size: 4.5, at: 4 },
              { text: "linked for good", x: 111, y: 62, a: "c", size: 4.5, c: "red", at: 4 },
              { text: "savings: never shown", x: 111, y: 76, a: "c", size: 4.5, c: "green", at: 5 },
              { text: "label each coin with where it came from", x: 80, y: 86, a: "c", size: 4, c: "grey", at: 6 }
            ] },
            say: [
              "Your wallet is not one balance; it is a handful of separate coins, each with its own past.",
              "Say you hold one coin from your salary, one from your savings and one that was a gift.",
              "You need to pay a little more than the salary coin holds.",
              "So the wallet must spend two coins together, and whichever two it picks, guess one will tie them to each other for good.",
              "Spend the salary and the gift, and anyone who knows your employer can now find the gift.",
              "But your savings coin has stayed out of the picture, and the person you paid cannot see it.",
              "Careful wallets let you label each coin with where it came from, and let you choose which ones to combine.",
              { s: "The price is attention, and sometimes a higher fee, because the tidiest choice for privacy is not always the cheapest.", g: "weigh" }
            ] },
          { slide: { k: "figure", title: "Who do you ask about your coins?", ops: [
              { text: "Someone else's server", x: 40, y: 5, a: "c", size: 4, c: "grey" },
              { text: "A node of your own", x: 120, y: 5, a: "c", size: 4, c: "grey" },
              { line: [80, 2, 80, 60], c: "grey", dash: true },
              { box: [6, 14, 26, 12], t: "wallet" },
              { box: [50, 14, 26, 12], t: "server", c: "red" },
              { arrow: [33, 20, 49, 20], at: 1 },
              { text: "what do A, B and C hold?", x: 40, y: 34, a: "c", size: 3.5, at: 1 },
              { text: "it learns: A, B, C are one person", x: 40, y: 44, a: "c", size: 3.5, c: "red", at: 2 },
              { text: "at this internet address", x: 40, y: 51, a: "c", size: 3.5, c: "red", at: 2 },
              { box: [86, 14, 26, 12], t: "wallet", at: 4 },
              { arrow: [113, 20, 129, 20], at: 4 },
              { box: [130, 14, 26, 12], t: "node", c: "green", at: 4 },
              { text: "the whole ledger, kept at home", x: 120, y: 34, a: "c", size: 3.5, at: 4 },
              { text: "the question never leaves the house", x: 120, y: 44, a: "c", size: 3.5, c: "green", at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "Habit three is about who you ask.",
              "A wallet with no node of its own has to ask a server which coins belong to its addresses.",
              "In asking, it hands that server the full list: these addresses, together, from this internet address.",
              { s: "No guessing is needed, because you drew the ring yourself and posted it.", g: "shrug" },
              "A node of your own keeps the whole ledger at home, so the question is answered without leaving the house.",
              "Lecture 9 gave you reasons to run a node, and here is one of them again, seen from the side of privacy.",
              "The price is a computer left running, some disk space and a little care."
            ] },
          { say: ["One check on that last habit.", "How does running your own node help your privacy?"],
            quiz: {
              q: "How does running your own node help your privacy?",
              options: [
                "It gives every payment a fresh secret key",
                "No outside server learns which addresses are yours",
                "It removes your old transactions from other nodes",
                "It hides your payments from the public ledger"
              ],
              answer: 1,
              right: ["Yes: the question of which coins are yours stays at home."],
              wrong: [
                ["Fresh keys come from your wallet's seed, not from a node.", "The node's gift is that no outside server learns which addresses are yours."],
                null,
                ["Nobody can remove anything from other people's copies of the ledger.", "Your own node helps because you no longer tell an outside server which addresses are yours."],
                ["Nothing hides a payment from the ledger, because every node must be able to check it.", "A node of your own helps because no outside server learns which addresses are yours."]
              ]
            } }
        ] },

      { id: "built-together", title: "Transactions Built Together", topics: ["coinjoin", "gregory maxwell", "payjoin", "bip 78", "joint transactions", "equal outputs"],
        beats: [
          { slide: { k: "section", title: "Transactions Built Together", sub: "Coinjoin and payjoin: making guess one wrong" },
            at: "lectern", g: "open",
            say: [
              "Those habits limit what you give away, but guess one still stands, and it is the strongest of the three.",
              "In August 2013, the same year as the Fistful paper, the developer Gregory Maxwell posted an idea to a Bitcoin forum.",
              "He called it coinjoin, and it needed no change to Bitcoin's rules at all.",
              { s: "His observation was simple: nothing in the rules says that the inputs of a transaction must share an owner.", g: "pinch" },
              "As lectures 3 and 4 showed, every input carries its own signature, so different people can each sign for their own part."
            ] },
          { board: { clear: true, title: "Coinjoin: three in, three out", ops: [
              { box: [6, 14, 34, 11], t: "Ana 0.1", at: 1 },
              { box: [6, 34, 34, 11], t: "Ben 0.1", at: 1 },
              { box: [6, 54, 34, 11], t: "Chi 0.1", at: 1 },
              { box: [62, 22, 36, 36], t: "one tx", c: "blue", at: 2 },
              { arrow: [41, 20, 61, 30], at: 2 },
              { arrow: [41, 40, 61, 40], at: 2 },
              { arrow: [41, 59, 61, 50], at: 2 },
              { arrow: [99, 30, 117, 20], at: 3 },
              { box: [118, 14, 30, 11], t: "0.1", at: 3 },
              { arrow: [99, 40, 117, 40], at: 3 },
              { box: [118, 34, 30, 11], t: "0.1", at: 3 },
              { arrow: [99, 50, 117, 59], at: 3 },
              { box: [118, 54, 30, 11], t: "0.1", at: 3 },
              { text: "?", x: 154, y: 20, a: "c", size: 6, c: "red", at: 4 },
              { text: "?", x: 154, y: 40, a: "c", size: 6, c: "red", at: 4 },
              { text: "?", x: 154, y: 60, a: "c", size: 6, c: "red", at: 4 },
              { text: "6 ways to match them", x: 80, y: 74, a: "c", size: 5, c: "red", at: 5 },
              { text: "each signs only if their output is there", x: 80, y: 84, a: "c", size: 4, c: "green", at: 6 }
            ] },
            say: [
              "Here is the simplest version.",
              "Three strangers, Ana, Ben and Chi, each bring one coin worth a tenth of a bitcoin.",
              "They put all three into a single transaction.",
              "It pays out three new coins of exactly the same size, one to a fresh address belonging to each of them.",
              "Now look at it as the observer does, leaving the fee aside: three coins in, three identical coins out, and no way to tell whose is whose.",
              "There are six ways to match three owners to three outputs, and the ledger does not say which one is true.",
              "Nobody can cheat, because each person signs only after checking that their own output is there, and nothing is valid until all have signed.",
              { s: "Guess one says that these inputs share an owner, and here guess one is simply wrong.", g: "up" }
            ] },
          { slide: { k: "points", title: "What a coinjoin costs", start: 0, points: [
              "You need a crowd, and someone to gather it",
              "Equal outputs stand out: the join itself is visible",
              "Leftover change can still be traced",
              "Merge the outputs later and you undo it",
              "Fees, waiting, and sometimes suspicion"
            ] },
            at: "right", g: "open",
            say: [
              "Now the honest part.",
              { s: "You need other people who want the same amount at the same time, and usually a coordinator to bring you together.", show: 1 },
              { s: "A transaction with many equal outputs looks like nothing else, so the observer knows a coinjoin happened, just not who got what.", show: 2 },
              { s: "Any odd leftover that comes back to you as change is as traceable as before.", show: 3 },
              { s: "If you later spend two of your mixed coins together, or with an old one, guess one ties them straight back.", show: 4 },
              { s: "And it costs fees and time, and some businesses treat coins from a coinjoin with suspicion, deserved or not.", show: 5, g: "weigh" },
              "You are hiding in a crowd, but everyone can see that there is a crowd."
            ] },
          { say: ["Let me test that last point.", "In a coinjoin with equal outputs, what can an observer still tell?"],
            quiz: {
              q: "In a coinjoin with equal outputs, what can an observer still tell?",
              options: [
                "That a coinjoin took place, but not whose output is whose",
                "The real names of everyone who took part",
                "Exactly which output belongs to which person",
                "Nothing at all, because the transaction is hidden"
              ],
              answer: 0,
              right: ["Exactly: the crowd is visible, and the faces in it are not."],
              wrong: [
                null,
                ["Names are never on the ledger, in a coinjoin or anywhere else.", "What shows is that a coinjoin took place, though not whose output is whose."],
                ["That matching is the one thing the equal outputs take away.", "The observer can tell that a coinjoin took place, but not whose output is whose."],
                ["A coinjoin is an ordinary public transaction, and its unusual shape is easy to spot.", "So the observer knows that a coinjoin took place, but not whose output is whose."]
              ]
            } },
          { slide: { k: "points", title: "Payjoin: a joint payment in plain clothes", start: 0, points: [
              "The receiver adds a coin of their own as an input",
              "Specified as BIP 78, in 2019",
              "It looks like any ordinary payment",
              "The amount paid appears nowhere on the ledger"
            ] },
            at: "centre", g: "open",
            say: [
              "There is a quieter cousin of coinjoin, called payjoin.",
              { s: "When you pay a shop, the shop slips one of its own coins into your transaction as an extra input.", show: 1 },
              "Two people have built the transaction together, but they did it during a payment that was going to happen anyway.",
              { s: "The idea was worked on from 2018, and the first version wallets adopted was written up by Nicolas Dorier in 2019 as BIP 78.", show: 2 },
              "Let me draw one, because the arithmetic is the delightful part."
            ] },
          { board: { clear: true, title: "Payjoin: what the ledger sees", ops: [
              { text: "you owe the shop 3", x: 80, y: 10, a: "c", size: 5, at: 0 },
              { box: [8, 20, 36, 12], t: "you: 5", c: "blue", at: 1 },
              { arrow: [46, 26, 66, 34], at: 1 },
              { box: [68, 28, 24, 18], t: "tx", c: "blue", at: 1 },
              { box: [8, 42, 36, 12], t: "shop: 4", c: "amber", at: 2 },
              { arrow: [46, 48, 66, 41], at: 2 },
              { arrow: [94, 34, 114, 26], at: 3 },
              { box: [116, 20, 36, 12], t: "you: 2", c: "blue", at: 3 },
              { arrow: [94, 41, 114, 48], at: 3 },
              { box: [116, 42, 36, 12], t: "shop: 7", c: "amber", at: 3 },
              { text: "observer: one owner had 9,", x: 80, y: 65, a: "c", size: 4.5, c: "grey", at: 4 },
              { text: "and paid 7 or paid 2", x: 80, y: 73, a: "c", size: 4.5, c: "grey", at: 4 },
              { text: "the real payment, 3, is nowhere", x: 80, y: 84, a: "c", size: 4.5, c: "red", at: 5 }
            ] },
            say: [
              "You owe the shop three coins, and I will ignore the fee to keep the sums clean.",
              "You put in a coin worth five.",
              "The shop adds a coin of its own, worth four.",
              "Out come two coins: two back to you as change, and seven to the shop, which is its own four plus your three.",
              { s: "The observer sees two inputs and two outputs, the most ordinary shape there is, and reasons that one owner had nine and paid seven or two.", show: 3 },
              { s: "Every part of that is wrong, and the true payment, three, appears nowhere on the ledger.", show: 4, g: "pinch" },
              "Better still, if payjoins become common, guess one grows less trustworthy for every transaction, including those that are not payjoins.",
              "The price, in that version, is that the shop must be online and running software that speaks the protocol, and so far that is far from common."
            ] }
        ] },

      { id: "taproot-and-lightning", title: "What Taproot and Lightning Change", topics: ["taproot", "key path", "lightning", "off-chain payments", "onion routing", "channels"],
        beats: [
          { slide: { k: "section", title: "What Taproot and Lightning Change", sub: "Coins that look alike, and payments off the ledger" },
            at: "lectern", g: "open",
            say: [
              "Two larger changes to the system also bear on privacy, though neither was built for privacy alone.",
              "I will only say what each changes for the observer, because lecture 5 covered how taproot works and lecture 14 will cover Lightning."
            ] },
          { slide: { k: "compare", title: "Taproot, active since November 2021",
              left: { head: "What now looks alike", points: ["One person's key", "Several people signing together", "A coin with unused fallback rules"] },
              right: { head: "What stays in view", points: ["Every amount", "Which coins fed which", "Any fallback rule actually used", "That the coin is a taproot coin"] } },
            at: "left", g: "weigh",
            say: [
              "Before taproot, the kind of lock on a coin was itself a clue.",
              "A coin shared between three business partners looked different on the ledger from a coin held by one person.",
              "With taproot, owners who agree, and whose wallets combine their keys, can spend a coin with one key and one signature, however many people or fallback conditions stood behind it.",
              { s: "A single saver, a group signing together and a contract that never needed its small print all look alike.", g: "pinch" },
              "The proposal's own design notes give that as an aim: outputs that cannot be told apart from each other.",
              "What it does not touch is everything else we have discussed today: amounts, and which coins fed which, are as public as ever.",
              "And for now, using a different kind of address from the people around you is a small clue of its own."
            ] },
          { slide: { k: "figure", title: "Lightning: payments off the ledger", ops: [
              { line: [6, 49, 10, 49], c: "grey" }, { line: [34, 49, 126, 49], c: "grey" }, { line: [150, 49, 154, 49], c: "grey" },
              { text: "the public ledger", x: 80, y: 54, a: "c", size: 3.5, c: "grey" },
              { box: [10, 43, 24, 11], t: "open", c: "blue", at: 1 },
              { box: [126, 43, 24, 11], t: "close", c: "blue", at: 1 },
              { circle: [22, 20, 6], t: "you", at: 2 },
              { circle: [62, 20, 6], t: "A", at: 2 },
              { circle: [102, 20, 6], t: "B", at: 2 },
              { circle: [142, 20, 6], t: "shop", at: 2 },
              { arrow: [29, 20, 55, 20], c: "green", at: 2 },
              { arrow: [69, 20, 95, 20], c: "green", at: 2 },
              { arrow: [109, 20, 135, 20], c: "green", at: 2 },
              { text: "no entry on the ledger for each payment", x: 80, y: 34, a: "c", size: 4, c: "green", at: 3 },
              { text: "A knows only its two neighbours", x: 62, y: 7, a: "c", size: 3.5, at: 4 },
              { text: "opening and closing stay public", x: 80, y: 61, a: "c", size: 3.5, c: "red", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "Lightning changes the picture more.",
              "Two people lock a coin into a shared channel with one transaction on the ledger, and settle up with another when they close it.",
              "In between, they can pay each other, and pay strangers through a chain of such channels, as often as they like.",
              "None of those payments is written to the ledger, so there is nothing there for the three guesses to work on.",
              "Each hop along the way is told only who handed it the payment and who to hand it to next, not where it began or where it ends.",
              "But the opening and closing transactions are ordinary public ones, and they can be clustered like any others.",
              "The hops see the amount and the timing of what passes through them, and a payment request names the node that is to be paid.",
              { s: "So Lightning does not remove the observers; it swaps the whole world for a few neighbours.", g: "weigh" }
            ] }
        ] },

      { id: "a-practice", title: "A Practice, Not a Property", topics: ["limits", "costs", "trade-offs", "fungibility", "summary", "next lecture"],
        beats: [
          { slide: { k: "section", title: "A Practice, Not a Property", sub: "What it costs, and where it stops" },
            at: "lectern", g: "open",
            say: [
              "Let me gather this up, because I do not want you to leave either frightened or falsely comforted.",
              { s: "Privacy in Bitcoin is not a property you are handed; it is a practice you keep up.", g: "chop" }
            ] },
          { slide: { k: "table", title: "Who can see your payments?", start: 0, head: ["Money", "Who sees", "With names?"], rows: [
              ["Cash in hand", "those standing nearby", "faces only"],
              ["Bank account", "bank, and who it tells", "yes, on every line"],
              ["Bitcoin, careless", "everyone, for ever", "soon enough"],
              ["Bitcoin, careful", "everyone, for ever", "far harder to attach"],
              ["Lightning", "a few neighbours", "partly"]
            ] },
            at: "centre", g: "open",
            say: [
              { s: "Cash is seen only by whoever is standing there.", show: 1 },
              { s: "A bank account is seen by the bank, and by whoever the bank is obliged or persuaded to tell, with your name on every line.", show: 2 },
              { s: "Bitcoin used carelessly is seen by everyone, for ever, and the names follow soon enough.", show: 3 },
              { s: "Bitcoin used with care is still seen by everyone, for ever, but the names are far harder to attach.", show: 4 },
              { s: "And Lightning moves your everyday payments in front of a few neighbours instead.", show: 5 },
              { s: "Notice what care does not change on the ledger: the middle column.", g: "point" },
              "You can make the observer's guesses worse, but you cannot make the ledger private."
            ] },
          { slide: { k: "points", title: "What the practice costs", start: 0, points: [
              "Attention: one slip can link years of care",
              "Money: more transactions, more fees",
              "Convenience: the careful path is the less trodden one",
              "Company: your privacy leans on other people's habits",
              "Limits: amounts and timing are always public"
            ] },
            at: "right", g: "count",
            say: [
              { s: "It costs attention, because the ledger never forgets, and one careless spend can tie together years of careful ones.", show: 1 },
              { s: "It costs money, since keeping coins apart and joining with others means more transactions and more fees.", show: 2 },
              { s: "It costs convenience, because the careful path is not the one most software and most businesses expect.", show: 3 },
              { s: "It depends on company: the person you pay may reuse an address, or keep records, or simply talk.", show: 4 },
              { s: "And some things no habit hides, because amounts and timing are public by design.", show: 5 }
            ] },
          { at: "centre", g: "open",
            say: [
              "There is a real tension here, and I would rather name it than hide it.",
              "The openness of the ledger is what lets you check that no coins were conjured from nothing, which no bank lets you do.",
              "The price of that openness is that everyone's payments are checked in public.",
              { s: "Researchers have designed ways to check amounts without revealing them, but Bitcoin as it stands today does not use them.", g: "weigh" },
              "And there is one more reason to care, even if you feel you have nothing to hide: money works best when every coin is as good as any other.",
              "If coins come to be judged by their histories, that quality is weakened for all of us, so each person's privacy is partly everyone's concern."
            ] },
          { slide: { k: "points", title: "What to take away", start: 0, points: [
              "Pseudonymous is not anonymous",
              "Three guesses turn addresses into wallets",
              "One real name labels a whole history",
              "Habits help; transactions built together help more",
              "A practice with costs, never a guarantee"
            ] },
            at: "lectern", g: "count",
            say: [
              { s: "So: every payment is public and no name is attached, which is pseudonymous, and not anonymous.", show: 1 },
              { s: "Three guesses, shared inputs, change and reuse, gather addresses into wallets.", show: 2 },
              { s: "One real name, from an exchange or a parcel or a friend, labels the whole history.", show: 3 },
              { s: "Fresh addresses, chosen coins and your own node limit the damage, and transactions built together attack the guesses themselves.", show: 4 },
              { s: "And all of it is a practice with costs, never a guarantee.", show: 5, g: "chop" }
            ] },
          { slide: { k: "figure", title: "Next time: who changes the rules?", ops: [
              { box: [10, 14, 40, 14], t: "old rules" },
              { arrow: [52, 21, 70, 21], at: 2 },
              { text: "?", x: 80, y: 21, a: "c", size: 9, c: "red", at: 2 },
              { arrow: [90, 21, 108, 21], at: 2 },
              { box: [110, 14, 40, 14], t: "new rules", c: "green", at: 2 },
              { text: "no company, no committee, no founder", x: 80, y: 41, a: "c", size: 4.5, at: 3 },
              { text: "Part four: change and scale", x: 80, y: 54, a: "c", size: 4, c: "grey", at: 4 }
            ] },
            at: "lectern", g: "open",
            say: [
              "That closes the third part of the course, the network and its users.",
              "Twice today I mentioned taproot, a change to Bitcoin's rules that took effect in November 2021.",
              { s: "Which raises a question we have dodged for 12 lectures: who gets to change the rules?", g: "lean" },
              "There is no company, there is no committee with a casting vote, and the founder left in 2011.",
              "Next time, in lecture 13, How Bitcoin Changes, we begin the last part of the course with exactly that.",
              "Before then, read section 10 of the whitepaper again, because you can now see everything that is packed into that half page.",
              { s: "Thank you, and I will see you in lecture 13.", g: "up" }
            ] }
        ] }
    ]
  });
})();
