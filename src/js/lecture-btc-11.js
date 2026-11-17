// Bitcoin from First Principles, lecture 11: a wallet holds keys and the coins stay on the ledger; from a bag of random keys to one seed that grows a tree (BIP 32), the seed written as words (BIP 39), the paths wallets agree on (BIP 44, BIP 84) and the public branch that watches without spending; address formats down to bech32 and bech32m; where keys can live, signing offline (BIP 174) and backups; and how coins are lost: Mt Gox, a thrown-away drive, and being tricked.
(() => {
  "use strict";
  window.BL.lectures.add({
    id: "btc-11", course: "first-principles", n: 11, title: "Wallets and Holding Your Own Keys",
    reading: [
      { title: "BIP 39: Mnemonic code for generating deterministic keys", by: "Palatinus, Rusnak, Voisine and Bowe, 2013" },
      { title: "BIP 32: Hierarchical Deterministic Wallets", by: "Pieter Wuille, 2012" },
      { title: "Bitcoin Developer Guide: Wallets", by: "developer.bitcoin.org" }
    ],
    sources: [
      "Pieter Wuille, BIP 32: Hierarchical Deterministic Wallets (2012), https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki",
      "Marek Palatinus, Pavol Rusnak, Aaron Voisine and Sean Bowe, BIP 39: Mnemonic code for generating deterministic keys (2013), https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki, with the test vectors it links to",
      "Marek Palatinus and Pavol Rusnak, BIP 44: Multi-Account Hierarchy for Deterministic Wallets (2014), https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki",
      "Pavol Rusnak, BIP 84: Derivation scheme for P2WPKH based accounts (2017), https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki",
      "Pieter Wuille and Greg Maxwell, BIP 173: Base32 address format for native v0-16 witness outputs (2017), https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki",
      "Pieter Wuille, BIP 350: Bech32m format for v1+ witness addresses (2020), https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki",
      "BIP 174: Partially Signed Bitcoin Transaction Format (2017), https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki",
      "Gavin Andresen, BIP 13: Address Format for pay-to-script-hash (2011), https://github.com/bitcoin/bips/blob/master/bip-0013.mediawiki, with BIP 16 for its start on 1 April 2012, https://github.com/bitcoin/bips/blob/master/bip-0016.mediawiki, and https://en.bitcoin.it/wiki/Base58Check_encoding",
      "BIP 341: Taproot, Deployment (active from block 709,632, November 2021), https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki",
      "Bitcoin Developer Guide, Wallets, https://developer.bitcoin.org/devguide/wallets.html",
      "Bitcoin Core, Managing the Wallet, https://github.com/bitcoin/bitcoin/blob/master/doc/managing-wallets.md",
      "MtGox Co., Ltd., announcements of the bankruptcy and civil rehabilitation proceedings and of the repayments, https://www.mtgox.com/",
      "Mt. Gox, https://en.wikipedia.org/wiki/Mt._Gox, for the dates and figures of February and March 2014",
      "WizSec, The missing MtGox bitcoins (19 April 2015), https://blog.wizsec.jp/2015/04/the-missing-mtgox-bitcoins.html",
      "Howells v Newport City Council [2025] EWHC 22 (Ch), judgment of 9 January 2025, https://caselaw.nationalarchives.gov.uk/ewhc/ch/2025/22"
    ],
    sections: [
      { id: "keys-not-coins", title: "A Wallet Holds Keys", topics: ["wallet", "private keys", "keys not coins", "balance", "what a wallet does", "becoming your own keeper"],
        beats: [
          { slide: { k: "title", kicker: "Lecture 11", title: "Wallets and Holding Your Own Keys", sub: "Seeds, trees of keys, backups and how coins get lost" },
            at: "lectern", g: "open",
            say: [
              "Welcome back.",
              "Last time we watched transactions bid against one another for room in a block.",
              "We spoke as if a payment simply turned up, already signed and ready to bid.",
              "Today we ask where that signature comes from, which means asking where your keys live.",
              { s: "In the very first lecture I promised you a day when you would become your own keeper.", g: "point" },
              "This is that day, and I want to be honest about it: the job is a real one, with real ways to fail.",
              { s: "So we shall learn how keys are made, how they are kept, and how coins are actually lost.", g: "count" }
            ] },
          { slide: { k: "points", title: "Today, and what is not on offer", start: 0, points: [
              "A wallet holds keys, not coins",
              "One seed grows a whole tree of keys",
              "Where keys can live, and how they are backed up",
              "How coins are really lost",
              "Not on offer: which product to buy"
            ] },
            at: "centre", g: "open",
            say: [
              { s: "First, what a wallet really is, which is not what the word suggests.", show: 1 },
              { s: "Second, how one secret, small enough to write on a card, grows every key you will ever need.", show: 2 },
              { s: "Third, where keys can live, and how they are backed up.", show: 3 },
              { s: "Fourth, the honest record of how people have lost their coins.", show: 4 },
              { s: "What you will not get from me is a product to buy, because products change and principles do not.", show: 5, g: "chop" }
            ] },
          { slide: { k: "figure", title: "Coins on the ledger, keys in your hand", ops: [
              { text: "Everywhere, in public", x: 40, y: 4, a: "c", size: 4, c: "grey" },
              { text: "Only with you", x: 120, y: 4, a: "c", size: 4, c: "grey" },
              { line: [80, 1, 80, 48], c: "grey", dash: true },
              { box: [10, 9, 60, 38], c: "blue", at: 1 },
              { text: "the ledger", x: 40, y: 15, a: "c", size: 4, c: "blue", at: 1 },
              { box: [16, 21, 48, 9], t: "0.5 coin, locked", c: "amber", at: 1 },
              { box: [16, 34, 48, 9], t: "0.2 coin, locked", c: "amber", at: 1 },
              { box: [96, 9, 48, 38], c: "green", at: 2 },
              { text: "your wallet", x: 120, y: 15, a: "c", size: 4, c: "green", at: 2 },
              { circle: [110, 31, 6], t: "key", c: "green", at: 2 },
              { circle: [130, 31, 6], t: "key", c: "green", at: 2 },
              { arrow: [95, 25, 66, 25], c: "green", dash: true, at: 3 },
              { arrow: [95, 38, 66, 38], c: "green", dash: true, at: 3 },
              { text: "the coins never leave the ledger", x: 80, y: 57, a: "c", size: 4.5, at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "Let us begin by taking the word wallet apart, because it misleads almost everyone.",
              "In lecture 4 we saw that coins are outputs: entries on the public ledger, each with a lock on it.",
              "In lecture 3 we met the private key, the secret number that can sign to open such a lock.",
              "A Bitcoin wallet holds those keys, and nothing else that matters.",
              { s: "There are no coins inside it, because the coins never leave the ledger.", g: "pinch" },
              "Think of a keyring rather than a purse.",
              "Lose a purse and the money goes with it; lose a keyring and the house is still standing, but you cannot get in."
            ] },
          { at: "left", g: "open",
            say: [
              "That one fact has two consequences, and the rest of today is those two consequences.",
              { s: "Whoever holds the key can spend the coin, and the network neither knows nor cares who they are.", g: "weigh" },
              "And if nobody holds the key any more, the coin stays on the ledger for ever, visible to all and spendable by none.",
              "There is no help desk, no password reset and no manager to appeal to.",
              { s: "That is not a flaw somebody forgot to fix; it is exactly what having no keeper means.", g: "lean" }
            ] },
          { slide: { k: "points", title: "What wallet software does", start: 0, points: [
              "Makes keys, and keeps the private ones secret",
              "Hands out addresses, so that others can pay you",
              "Watches the ledger for coins your keys can unlock",
              "Builds transactions, signs them, sends them out"
            ] },
            at: "right", g: "open",
            say: [
              { s: "So what does the software we call a wallet actually do?", g: "shrug" },
              { s: "It makes keys, and it guards the private ones.", show: 1 },
              { s: "It turns public keys into addresses, which you hand to people who want to pay you.", show: 2 },
              { s: "It watches the ledger for outputs your keys can unlock, and adds them up into the number it calls your balance.", show: 3 },
              { s: "And when you pay, it builds the transaction, signs it and passes it to the network we met in lecture 9.", show: 4 },
              "Notice that the balance is a sum the wallet works out afresh, not a thing it stores."
            ] },
          { say: ["A first check, because everything after this depends on it.", "What does a Bitcoin wallet actually hold?"],
            quiz: {
              q: "What does a Bitcoin wallet actually hold?",
              options: [
                "A copy of your account at an exchange",
                "The private keys that unlock coins on the ledger",
                "The coins themselves, as files on your device",
                "A list of everyone you have ever paid"
              ],
              answer: 1,
              right: ["Yes: the keys are in the wallet, and the coins are on the ledger."],
              wrong: [
                ["An exchange account is a keeper's promise, which is a different thing altogether.", "A wallet holds private keys, and those keys unlock coins on the ledger."],
                null,
                ["Coins are not files, and nothing in a wallet could be handed over as money.", "A wallet holds the private keys that unlock coins recorded on the ledger."],
                ["A wallet may remember your payments, but that is a convenience and not the point.", "What it holds is the private keys that unlock coins on the ledger."]
              ]
            } }
        ] },

      { id: "one-seed", title: "One Seed, Many Keys", topics: ["seed", "deterministic wallet", "bip 32", "tree of keys", "key pool", "stale backups"],
        beats: [
          { slide: { k: "section", title: "One Seed, Many Keys", sub: "From a bag of keys to a tree grown from one secret" },
            at: "lectern", g: "open",
            say: [
              "How many keys does one person need?",
              "More than you might think, because good practice is a fresh key for every payment you receive.",
              "Lecture 12 will explain why; for today, take it that a busy wallet needs hundreds of keys, and then hundreds more.",
              "Early Bitcoin software handled this in the most direct way imaginable."
            ] },
          { slide: { k: "figure", title: "The first wallets: a bag of keys", ops: [
              { box: [8, 6, 62, 40] },
              { text: "wallet file", x: 39, y: 11, a: "c", size: 4 },
              { circle: [18, 22, 3], c: "grey" }, { circle: [30, 22, 3], c: "grey" }, { circle: [42, 22, 3], c: "grey" }, { circle: [54, 22, 3], c: "grey" },
              { circle: [18, 33, 3], c: "grey", at: 1 }, { circle: [30, 33, 3], c: "grey", at: 1 }, { circle: [42, 33, 3], c: "grey", at: 1 },
              { text: "pool of 100 keys", x: 39, y: 41, a: "c", size: 3.5, c: "grey", at: 1 },
              { arrow: [72, 26, 96, 26], at: 2 },
              { text: "backup", x: 84, y: 21, a: "c", size: 3.5, at: 2 },
              { box: [98, 6, 54, 40], c: "green", dash: true, at: 2 },
              { text: "the copy", x: 125, y: 11, a: "c", size: 4, c: "green", at: 2 },
              { circle: [108, 22, 3], c: "green", at: 2 }, { circle: [120, 22, 3], c: "green", at: 2 }, { circle: [132, 22, 3], c: "green", at: 2 }, { circle: [144, 22, 3], c: "green", at: 2 },
              { circle: [108, 33, 3], c: "green", at: 2 }, { circle: [120, 33, 3], c: "green", at: 2 }, { circle: [132, 33, 3], c: "green", at: 2 },
              { circle: [54, 33, 3.5], c: "red", fill: true, at: 3 },
              { text: "key 101 is not in the copy", x: 80, y: 57, a: "c", size: 4.5, c: "red", at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "It made each key from fresh randomness, with no connection between one key and the next.",
              "It kept a pool of 100 unused keys in a file, and topped the pool up as they were handed out.",
              "You were told to back that file up, and many people did, once.",
              "But the hundred-and-first key was born after that backup was made.",
              { s: "Coins sent to it were protected by a copy that had never heard of it.", g: "shrug" },
              "So an honest, careful backup could quietly go stale, and the day you needed it was the day you found out."
            ] },
          { at: "centre", g: "open",
            say: [
              "In February 2012 the developer Pieter Wuille wrote down a better design, which became Bitcoin Improvement Proposal 32.",
              "We shall meet these proposals properly in lecture 13; for today, a BIP is a numbered public document that every wallet maker can follow.",
              { s: "The idea of BIP 32 is to stop collecting keys and start growing them.", g: "up" }
            ] },
          { board: { clear: true, title: "One seed, a tree of keys", ops: [
              { circle: [80, 12, 7], t: "seed", c: "amber", at: 0 },
              { arrow: [80, 20, 80, 27], at: 1 },
              { box: [62, 28, 36, 11], t: "master key", at: 1 },
              { arrow: [70, 40, 42, 51], at: 2 },
              { box: [24, 52, 32, 10], t: "child 0", c: "blue", at: 2 },
              { arrow: [80, 40, 80, 51], at: 2 },
              { box: [64, 52, 32, 10], t: "child 1", c: "blue", at: 2 },
              { arrow: [90, 40, 118, 51], at: 2 },
              { box: [104, 52, 32, 10], t: "child 2", c: "blue", at: 2 },
              { arrow: [34, 63, 27, 71], at: 3 },
              { circle: [24, 75, 4], c: "green", at: 3 },
              { arrow: [46, 63, 53, 71], at: 3 },
              { circle: [56, 75, 4], c: "green", at: 3 },
              { arrow: [80, 63, 80, 70], at: 3 },
              { circle: [80, 75, 4], c: "green", at: 3 },
              { arrow: [120, 63, 120, 70], at: 3 },
              { circle: [120, 75, 4], c: "green", at: 3 },
              { text: "...", x: 142, y: 74, size: 7, at: 3 },
              { text: "same seed, same tree", x: 80, y: 86, a: "c", size: 5, c: "green", at: 5 }
            ] },
            say: [
              "Let me draw it, starting with one secret number, which we call the seed.",
              "The seed goes through a hash function, the one-way machine of lecture 2, and out comes a master key.",
              "The master key and a counter go through the machine again to make child keys: child 0, child 1, child 2, and so on.",
              "Each child can have children of its own, so what grows is a tree, as deep and as wide as you care to make it.",
              "Every key in it is a perfectly ordinary Bitcoin key, and on the ledger nobody can tell that it came from a tree at all.",
              { s: "And here is the property that changes everything: the same seed always grows exactly the same tree.", g: "pinch" }
            ] },
          { slide: { k: "compare", title: "Two ways to make keys",
              left: { head: "A bag of keys", points: ["Each key a fresh roll of the dice", "No link from one key to the next", "Back up again after new keys", "An old backup misses new coins"] },
              right: { head: "A tree from a seed", points: ["Every key computed from the seed", "Same seed, same keys, every time", "Back up once, at the start", "Covers keys not yet made"] } },
            at: "left", g: "weigh",
            say: [
              "Set the two designs side by side.",
              "In the bag, each key is a separate roll of the dice, and the backup is a list that must be kept up to date.",
              { s: "In the tree, keys are not stored so much as worked out again, the way a recipe gives you the same loaf every time.", g: "open" },
              "So a backup of the seed, made once on the first day, covers every key the wallet will ever use.",
              "It even covers keys that do not exist yet, because the seed already implies them.",
              "The proposal puts it drily: deterministic wallets, it says, do not require such frequent backups."
            ] },
          { slide: { k: "number", value: "One backup", label: "made once, good for every key the tree will ever grow", note: "BIP 32, Hierarchical Deterministic Wallets, 2012" },
            at: "centre", g: "open",
            say: [
              "One backup, for the life of the wallet.",
              { s: "But notice what we have done to the stakes.", g: "lean" },
              "Before, a thief who found one key could take one coin.",
              "Now every key follows from a single secret, so whoever reads the seed holds the whole tree.",
              "We have made the backup easy, and in the same stroke made the seed the most precious thing you own."
            ] },
          { say: ["Let me check the idea that makes all of this work.", "Why can one backup of the seed cover keys the wallet has not made yet?"],
            quiz: {
              q: "Why can one backup of the seed cover keys the wallet has not made yet?",
              options: [
                "The backup updates itself whenever a key is made",
                "New keys are copies of the first key",
                "Each key is computed from the seed, the same way each time",
                "The wallet uploads each new key to the network"
              ],
              answer: 2,
              right: ["Exactly: the keys are computed, not collected, so the seed already implies them all."],
              wrong: [
                ["A seed written on paper cannot update itself, and it has no need to.", "Every key is computed from the seed, so the seed alone brings them all back."],
                ["Each key in the tree is different, which is what lets you use a fresh one for every payment.", "They can all be restored because each is computed from the seed, the same way each time."],
                null,
                ["Private keys are never sent to the network, and they must not be.", "The backup works because every key is computed from the seed, the same way each time."]
              ]
            } }
        ] },

      { id: "twelve-words", title: "Twelve Words", topics: ["seed phrase", "mnemonic", "bip 39", "word list", "checksum", "passphrase", "guessing a seed"],
        beats: [
          { slide: { k: "section", title: "Twelve Words", sub: "BIP 39: a secret a person can write down" },
            at: "lectern", g: "open",
            say: [
              "A seed is a number, and a long one: at least 128 binary digits.",
              "Written the way programmers write such things, that is 32 digits and letters in a row, and one slip of the pen ruins it.",
              "People are bad at copying strings like that, and good at copying words.",
              "So in 2013 four developers proposed a way to write the seed's raw material as ordinary words, and it became BIP 39."
            ] },
          { slide: { k: "figure", title: "From coin flips to words", ops: [
              { box: [4, 8, 34, 12], t: "randomness", at: 0 },
              { text: "128 coin flips", x: 21, y: 25, a: "c", size: 3.5, c: "grey", at: 0 },
              { arrow: [40, 14, 50, 14], at: 1 },
              { box: [52, 8, 34, 12], t: "+ check", c: "blue", at: 1 },
              { text: "4 more bits", x: 69, y: 25, a: "c", size: 3.5, c: "grey", at: 1 },
              { arrow: [88, 14, 98, 14], at: 2 },
              { box: [100, 8, 56, 12], t: "12 groups of 11 bits", c: "amber", at: 2 },
              { text: "128 + 4 = 132 = 12 x 11", x: 128, y: 25, a: "c", size: 3.5, c: "grey", at: 2 },
              { text: "each group picks one word from a list of 2,048", x: 80, y: 36, a: "c", size: 4, at: 3 },
              { text: "legal  winner  thank  year  ...", x: 80, y: 47, a: "c", size: 5, c: "green", mono: true, at: 4 },
              { text: "256 bits + 8 = 24 words", x: 80, y: 58, a: "c", size: 4, c: "grey", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "The wallet begins by gathering randomness: 128 bits, which is the same as 128 flips of a fair coin.",
              "It adds four more bits as a check, taken from a hash of the first 128.",
              "That makes 132 bits, which it cuts into 12 groups of 11.",
              "Eleven bits can count from 0 to 2,047, so each group points at one word in a fixed list of 2,048.",
              "Out come 12 plain words, in an order that matters.",
              { s: "For more margin, the same recipe takes 256 bits and gives 24 words.", g: "count" },
              "The check bits mean that a phrase copied wrongly is usually refused, rather than quietly opening an empty wallet."
            ] },
          { slide: { k: "code", title: "A test phrase from BIP 39's own examples", lines: [
              "legal     winner    thank     year",
              "wave      sausage   worth     useful",
              "legal     winner    thank     yellow"
            ], note: "Published for testing software. Everyone can read it, so it protects nothing." },
            at: "centre", g: "open",
            say: [
              "Here is a real one, from the test examples published with the proposal.",
              "Legal, winner, thank, year, wave, sausage, worth, useful, legal, winner, thank, yellow.",
              "The list was chosen with care: the first four letters are enough to tell any word from every other, so a smudged ending can still be read.",
              { s: "And because this phrase is public, it is worthless as a secret, which is rather the point of showing it.", g: "shrug" },
              "Treat any phrase that has been published, on a website, in a book or in a lecture, as already burnt."
            ] },
          { slide: { k: "number", value: "2^128", label: "possible 12-word secrets: 340 billion billion billion billion", note: "About 3.4 x 10^38. A well-made phrase is not going to be guessed." },
            at: "right", g: "open",
            say: [
              "Could somebody simply guess your 12 words?",
              "The number of possible secrets is 128 twos multiplied together.",
              { s: "That is about 340 billion billion billion billion.", g: "wide" },
              "If a billion computers each tried a billion phrases a second, they would need far longer than the age of the universe to work through them.",
              "So nobody guesses a properly made phrase.",
              { s: "Phrases are not guessed; they are found, photographed, typed into the wrong place or talked out of their owner.", g: "lean" }
            ] },
          { slide: { k: "points", title: "What the words are, and are not", start: 0, points: [
              "The words are the wallet: every key, every coin",
              "Whoever reads them can spend, from anywhere",
              "No device, no password, no permission needed",
              "Optional: a passphrase of your own, mixed in"
            ] },
            at: "left", g: "open",
            say: [
              { s: "Be very clear about what those words are.", g: "point" },
              { s: "They are not a password that guards the wallet; they are the wallet.", show: 1 },
              { s: "Anyone who reads them can rebuild every key on a machine of their own, on the other side of the world.", show: 2 },
              { s: "They need no device of yours, no password of yours and no permission from anyone.", show: 3 },
              "On their way to becoming the seed, the words are stirred through a hash function 2,048 times, which slows down anyone trying guesses in bulk.",
              { s: "BIP 39 also lets an extra passphrase of your own be mixed in at that step.", show: 4 },
              "A different passphrase grows a completely different tree, and a forgotten passphrase is as final as a lost phrase."
            ] },
          { say: ["Here is the question I most want you to get right today.", "A stranger has photographed your 12 words, and you set no passphrase: what can they do?"],
            quiz: {
              q: "A stranger has photographed your 12 words, and you set no passphrase: what can they do?",
              options: [
                "Rebuild every key and spend every coin",
                "Nothing, unless they also steal your phone",
                "Nothing, until they guess your app's password",
                "Look at your balance, but not spend it"
              ],
              answer: 0,
              right: ["Yes: the words are the wallet, so whoever has the words has the coins."],
              wrong: [
                null,
                ["The phone is only one place where the keys happen to be kept.", "With the words, a stranger can rebuild every key on any machine and spend every coin."],
                ["An app's password protects the copy on your device, and the words do not need that copy.", "The words alone rebuild every key, so the stranger can spend every coin."],
                ["Looking without spending is what a public key allows, as we are about to see.", "The words give the private keys, so the stranger can rebuild them all and spend every coin."]
              ]
            } }
        ] },

      { id: "map-of-the-tree", title: "A Map of the Tree", topics: ["derivation path", "bip 44", "bip 84", "gap limit", "restoring a wallet", "extended public key", "watch-only", "hardened keys"],
        beats: [
          { slide: { k: "section", title: "A Map of the Tree", sub: "Agreed paths, and a branch that watches but cannot spend" },
            at: "lectern", g: "open",
            say: [
              "There is a gap in the story so far.",
              "The seed fixes a tree with billions upon billions of possible branches.",
              "If your old wallet used one branch and its replacement looks along another, it will find nothing, and tell you that you are poor.",
              { s: "A seed is only portable if wallets agree on where in the tree to look.", g: "pinch" }
            ] },
          { slide: { k: "code", title: "The path wallets agree on", start: 1, lines: [
              "m / purpose' / coin_type' / account' / change / index",
              "m / 84' / 0' / 0' / 0 / 0      first receiving address",
              "m / 84' / 0' / 0' / 0 / 1      second receiving address",
              "m / 84' / 0' / 0' / 1 / 0      first change address"
            ], note: "BIP 44 (2014) set the levels; BIP 84 (2017) gave purpose 84 to bc1q addresses." },
            at: "screen", g: "point",
            say: [
              "In 2014 that agreement was written down as BIP 44, and here it is.",
              "Read it as directions through the tree, starting from the master key, which is written as a small m.",
              { s: "The first turning says which convention you follow, the second which currency, and the third which account, as in savings or spending.", g: "count" },
              "The fourth separates addresses you hand out from change addresses, where your own change comes back to you, as lecture 4 showed.",
              "The last is a plain counter: address 0, address 1, address 2.",
              { s: "So the first address a modern wallet hands out sits at this spot, with the second right beside it.", show: 3 },
              { s: "Change goes down the neighbouring branch.", show: 4 },
              "The purpose number 84 comes from BIP 84, of 2017, and it tells the wallet which style of address to build from each key.",
              "The little tick marks label a hardened turning, a safety measure I shall come back to in a moment."
            ] },
          { board: { clear: true, title: "Restoring from the words", ops: [
              { box: [6, 14, 34, 12], t: "12 words", c: "amber", at: 0 },
              { arrow: [42, 20, 54, 20], at: 1 },
              { box: [56, 14, 24, 12], t: "seed", at: 1 },
              { arrow: [82, 20, 94, 20], at: 2 },
              { box: [96, 14, 58, 12], t: "m/84'/0'/0'", c: "blue", at: 2 },
              { arrow: [112, 27, 60, 38], at: 3 },
              { box: [10, 40, 14, 10], t: "0", c: "green", fill: true, at: 3 },
              { box: [28, 40, 14, 10], t: "1", c: "green", fill: true, at: 3 },
              { box: [46, 40, 14, 10], t: "2", c: "green", fill: true, at: 3 },
              { text: "used", x: 35, y: 57, a: "c", size: 4.5, c: "green", at: 3 },
              { box: [64, 40, 14, 10], t: "3", c: "grey", at: 4 },
              { box: [82, 40, 14, 10], t: "4", c: "grey", at: 4 },
              { text: "...", x: 100, y: 44, size: 7, c: "grey", at: 4 },
              { box: [116, 40, 14, 10], t: "22", c: "grey", at: 4 },
              { text: "20 unused in a row: stop", x: 104, y: 57, a: "c", size: 4.5, at: 4 },
              { text: "same words, any wallet, same coins", x: 80, y: 78, a: "c", size: 5.5, c: "green", at: 6 }
            ] },
            say: [
              "Let me draw what happens when you type your 12 words into a brand new wallet.",
              "The words become the seed, by the recipe we have just seen.",
              "The wallet walks the agreed path to the account's branch.",
              "Then it makes address 0, address 1, address 2, and asks the ledger whether each has ever been used.",
              "When it has seen 20 unused addresses in a row, it concludes that it has reached the end, and stops looking.",
              "That number, 20, is called the gap limit, and it is part of the same agreement.",
              { s: "The result is that the same words, typed into software from a different maker, find the same coins.", g: "up" }
            ] },
          { at: "centre", g: "open",
            say: [
              "I should be honest that the agreement is good rather than perfect.",
              "Different styles of address live on different branches, and now and then a wallet strays from the common paths.",
              { s: "That is why careful people note down, beside the words, what kind of wallet made them.", g: "count" }
            ] },
          { slide: { k: "figure", title: "A branch that can only watch", ops: [
              { box: [6, 6, 50, 12], t: "private branch", c: "red" },
              { text: "can sign and spend", x: 31, y: 23, a: "c", size: 3.5, c: "grey" },
              { arrow: [31, 27, 31, 35], at: 1 },
              { box: [6, 36, 50, 12], t: "public branch", c: "green", at: 1 },
              { text: "can only look", x: 31, y: 53, a: "c", size: 3.5, c: "grey", at: 1 },
              { arrow: [58, 40, 84, 13], c: "green", at: 2 },
              { box: [86, 6, 40, 10], t: "address 0", at: 2 },
              { arrow: [58, 42, 84, 28], c: "green", at: 2 },
              { box: [86, 22, 40, 10], t: "address 1", at: 2 },
              { arrow: [58, 44, 84, 43], c: "green", at: 2 },
              { box: [86, 38, 40, 10], t: "address 2", at: 2 },
              { text: "no private key", x: 143, y: 24, a: "c", size: 3.5, c: "red", at: 4 },
              { text: "on this side", x: 143, y: 29, a: "c", size: 3.5, c: "red", at: 4 },
              { text: "a shop's server, a phone, an accountant", x: 100, y: 59, a: "c", size: 4, at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "Now for one of the loveliest tricks in the whole design.",
              "Every branch of the tree has a private form, which can sign, and a public form, which cannot.",
              "The surprise is that the public form can grow children too: all the public keys below it, and so all the addresses.",
              "It does this with a property of the curve arithmetic from lecture 3, and without ever touching a private key.",
              { s: "So a machine holding only the public branch, which wallets call an extended public key, can make fresh addresses for ever, and cannot spend a single coin.", g: "pinch" },
              "A shop's web server can hand every customer a new address, while the keys that spend stay somewhere far safer.",
              "The same goes for a phone that only watches your savings, or an accountant who needs to see but must not touch."
            ] },
          { slide: { k: "points", title: "Two cautions about the public branch", start: 0, points: [
              "It shows every address on the branch: a privacy matter",
              "With one leaked child key, it gives away the whole branch",
              "Hardened turnings, the tick marks, wall branches off"
            ] },
            at: "right", g: "open",
            say: [
              { s: "Two cautions, so that you do not think the public branch is harmless.", g: "count" },
              { s: "First, whoever holds it can see every address you have, and will ever have, on that branch, which is a matter for lecture 12.", show: 1 },
              { s: "Second, there is a subtle weakness, which the proposal itself warns about.", show: 2 },
              "The public branch, together with any one private key from below it, is enough to work back to the private branch.",
              { s: "That is why the upper turnings of the path are hardened, a variant that cannot be grown from the public side at all.", show: 3 },
              "A leak below a hardened turning stays inside its own account, like a fire held behind a fire door."
            ] },
          { say: ["A check on that trick, since wallets lean on it every day.", "What can someone do who holds only the public branch of your wallet?"],
            quiz: {
              q: "What can someone do who holds only the public branch of your wallet?",
              options: [
                "Work out your 12 words from it",
                "Nothing at all, because it is public",
                "Spend your coins, but only slowly",
                "See your addresses and make new ones, but not spend"
              ],
              answer: 3,
              right: ["Right: it can watch, and it can make addresses, and it can never sign."],
              wrong: [
                ["The tree only runs one way, from the words down to the keys.", "The public branch lets its holder see addresses and make new ones, without spending."],
                ["Public does not mean powerless, because it shows every address on the branch.", "Its holder can watch those addresses and make new ones, but cannot spend."],
                ["Spending needs a signature, and a signature needs a private key, however long you wait.", "The public branch can see your addresses and make new ones, and that is all."],
                null
              ]
            } }
        ] },

      { id: "addresses", title: "Addresses, Old and New", topics: ["address formats", "base58", "bech32", "bech32m", "checksum", "typing errors", "bip 173", "bip 350"],
        beats: [
          { slide: { k: "section", title: "Addresses, Old and New", sub: "From Base58 to bech32, and a flaw mended in the open" },
            at: "lectern", g: "open",
            say: [
              "At the far end of every branch is something you actually show to other people: an address.",
              "An address is not a key, and it is not an account.",
              "It is a short, checkable way of writing down the lock you would like a payment placed under.",
              "The locks have changed over the years, as lecture 5 showed, and the way of writing them down has changed too."
            ] },
          { slide: { k: "table", title: "Four generations of address", start: 0, head: ["Since", "Begins with", "What it brought"], rows: [
              ["2009", "1", "Base58 and a checksum"],
              ["2012", "3", "a lock set by a script"],
              ["2017", "bc1q", "bech32: one case only"],
              ["2021", "bc1p", "bech32m, for taproot"]
            ], note: "All four kinds are still valid, and a wallet may meet any of them." },
            at: "centre", g: "open",
            say: [
              { s: "The first addresses, from 2009, begin with a 1.", show: 1 },
              "They are written in an alphabet called Base58, which leaves out the characters people confuse: zero and capital O, capital I and small l.",
              "And they end in a checksum, four bytes cut from a hash, so that a mistyped address is refused instead of swallowing your money.",
              { s: "In 2012 came addresses beginning with a 3, which stand for a lock described by a script, such as the several-key locks of lecture 5.", show: 2 },
              { s: "Then in 2017 a wholly new format arrived, beginning bc1.", show: 3 }
            ] },
          { slide: { k: "compare", title: "Why a new alphabet?",
              left: { head: "Base58: 1 and 3", points: ["Capitals and small letters mixed", "Awkward to read out or to type", "Checksum is a slice of a hash", "No promise about which typos"] },
              right: { head: "Bech32: bc1", points: ["One case only", "32 characters; no 1, b, i or o", "Checksum built to catch typos", "Any 4 wrong characters: caught"] } },
            at: "left", g: "weigh",
            say: [
              "The new format is called bech32, and it was set out in BIP 173.",
              "Its authors listed what was wrong with the old one: mixed capitals and small letters are hard to read aloud, to type on a phone and to pack into a QR code.",
              "Bech32 uses one case only, and 32 characters chosen so that the look-alikes are left out.",
              { s: "Its real refinement is the checksum, the last six characters of every address.", g: "pinch" },
              "It is built from an error-detecting code, and it comes with a guarantee: change any four characters or fewer, and the mistake is always caught.",
              "An address is the one piece of Bitcoin that people copy by hand, so it is the piece designed around human error."
            ] },
          { slide: { k: "code", title: "One address, taken apart", start: 1, lines: [
              "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
              "bc             the network: Bitcoin",
              "1              a separator",
              "q              the version of the lock",
              "w508...xw7k    the lock itself, made from your key",
              "v8f3t4         the checksum"
            ], note: "The example address given in BIP 173." },
            at: "screen", g: "point",
            say: [
              "Here is the example address from the proposal, and every part of it has a job.",
              { s: "The letters bc say that this is Bitcoin, and the 1 simply separates that label from the rest.", show: 3 },
              { s: "The q is the version number of the lock, and the long middle is the lock itself, a fingerprint of your public key.", show: 5 },
              { s: "The last six characters are the checksum, standing guard over all of it.", show: 6 }
            ] },
          { slide: { k: "points", title: "A flaw, found and mended in public", start: 0, points: [
              "A weakness turned up in bech32's checksum",
              "Before a final p, extra q's could slip through unnoticed",
              "Existing addresses were safe: their lengths are fixed",
              "2020: BIP 350, bech32m, used by bc1p addresses"
            ] },
            at: "right", g: "open",
            say: [
              "One more story about this format, because it shows the process working.",
              { s: "Some time after bech32 came into use, a weakness was found in that carefully built checksum.", show: 1 },
              { s: "If an address ended in the letter p, then extra q's slipped in just before it went unnoticed.", show: 2 },
              { s: "Existing addresses were not at risk, because their lengths are fixed, and an extra letter makes the length wrong.", show: 3 },
              { s: "But a new kind of lock was on its way, so in 2020 BIP 350 changed one constant in the checksum and called the result bech32m.", show: 4 },
              "Taproot addresses, which begin bc1p and date from 2021, use the corrected form.",
              { s: "The flaw was published, measured and repaired before the addresses it could have harmed were ever in use.", g: "open" }
            ] }
        ] },

      { id: "where-keys-live", title: "Where the Keys Live", topics: ["hot wallet", "cold storage", "signing device", "offline signing", "psbt", "bip 174", "several keys", "backups"],
        beats: [
          { slide: { k: "section", title: "Where the Keys Live", sub: "Online, offline, and spread across several places" },
            at: "lectern", g: "open",
            say: [
              "We know how keys are made, so now the practical question: where do you keep them?",
              "Every answer is a trade between two dangers.",
              { s: "One danger is that somebody else gets at your keys, and the other is that you lose them yourself.", g: "weigh" },
              "Make theft harder and you usually make loss easier, and the other way round.",
              "I am going to draw three arrangements, without naming a single product."
            ] },
          { board: { clear: true, title: "Three homes for a key", ops: [
              { text: "online", x: 28, y: 16, a: "c", size: 5, at: 1 },
              { box: [8, 22, 40, 24], at: 1 },
              { circle: [28, 34, 5], t: "key", c: "red", at: 1 },
              { text: "handy, exposed", x: 28, y: 53, a: "c", size: 4, c: "grey", at: 2 },
              { text: "offline", x: 80, y: 16, a: "c", size: 5, at: 3 },
              { box: [60, 22, 40, 24], dash: true, at: 3 },
              { circle: [80, 34, 5], t: "key", c: "green", at: 3 },
              { text: "safer, slower", x: 80, y: 53, a: "c", size: 4, c: "grey", at: 4 },
              { text: "several keys", x: 132, y: 16, a: "c", size: 5, at: 5 },
              { circle: [118, 29, 5], t: "key", c: "blue", at: 5 },
              { circle: [146, 29, 5], t: "key", c: "blue", at: 5 },
              { circle: [132, 41, 5], t: "key", c: "blue", at: 5 },
              { text: "2 of 3 must sign", x: 132, y: 53, a: "c", size: 4, c: "grey", at: 5 },
              { text: "one key lost or stolen: coins still safe", x: 80, y: 74, a: "c", size: 5, c: "green", at: 7 }
            ] },
            say: [
              "Three homes for a key.",
              "The first is a wallet on a phone or a computer that is connected to the internet.",
              "It is ready whenever you are, and it is exposed to everything else that phone or computer is exposed to.",
              "The second is a device that holds the keys and never touches the network at all.",
              "A thief on the internet cannot reach it, and the price is that every payment takes a deliberate extra step.",
              "The third arrangement stops trusting any single key: the coins sit under a lock that needs, say, two keys out of three.",
              "Lecture 5 showed how such a lock is written; what matters today is that the three keys can live in three different places.",
              { s: "One key can then be stolen, or lost, without the coins going anywhere, so long as the backup also records the lock itself.", g: "pinch" }
            ] },
          { slide: { k: "compare", title: "Kept online, or kept offline",
              left: { head: "Keys on a connected device", points: ["Always ready to pay", "Like the cash in your pocket", "Malware can reach the keys", "A lost phone needs its backup"] },
              right: { head: "Keys kept offline", points: ["Out of the network's reach", "Like savings, harder to get at", "Each payment takes more steps", "Still needs a backup of its own"] } },
            at: "left", g: "weigh",
            say: [
              "People call the first kind hot and the second kind cold, and many holders end up with some of each.",
              "It is the old instinct of carrying a little cash in your pocket and keeping your savings somewhere harder to reach.",
              { s: "Look at the last line on each side, though: neither arrangement excuses you from a backup.", g: "point" },
              "A device is only a container, and containers break, get lost and wear out."
            ] },
          { slide: { k: "figure", title: "Signing without exposing the key", ops: [
              { box: [4, 10, 44, 14], t: "online wallet", c: "blue" },
              { text: "sees the ledger, holds no key", x: 28, y: 29, a: "c", size: 3.2, c: "grey" },
              { box: [112, 10, 44, 14], t: "signing device", c: "green" },
              { text: "holds the key, offline", x: 134, y: 29, a: "c", size: 3.2, c: "grey" },
              { arrow: [50, 13, 110, 13], at: 2 },
              { text: "unsigned transaction + details", x: 80, y: 8, a: "c", size: 3.5, at: 2 },
              { text: "you check amount and address", x: 130, y: 37, a: "c", size: 3.5, c: "amber", at: 4 },
              { arrow: [110, 21, 50, 21], c: "green", at: 5 },
              { text: "signature added", x: 80, y: 26, a: "c", size: 3.5, c: "green", at: 5 },
              { arrow: [26, 33, 26, 45], at: 6 },
              { box: [6, 46, 40, 10], t: "the network", at: 6 },
              { text: "the key never crosses the gap", x: 104, y: 52, a: "c", size: 4.5, c: "red", at: 7 }
            ] },
            at: "screen", g: "point",
            say: [
              "The offline device raises an obvious puzzle: how can a key that never touches the network sign a payment for the network?",
              "The answer is to carry the transaction to the key, instead of the key to the transaction.",
              "A wallet on a connected machine, holding only the public branch, builds the transaction and leaves the signature blank.",
              "It passes that unfinished transaction across, on a memory card, down a cable or as a QR code held up to a camera.",
              "The device shows you, on its own small screen, the amount and the address it is being asked to sign for.",
              "If you agree, it signs, and hands the transaction back with the signature filled in.",
              "The connected wallet then sends it out to the network, as in lecture 9.",
              { s: "The transaction has made a round trip, and the key has never moved.", g: "pinch" }
            ] },
          { at: "centre", g: "open",
            say: [
              "That unfinished transaction has a standard form, set out in BIP 174 and called a partially signed Bitcoin transaction.",
              "It is a package: the transaction, plus everything a signer needs to know about the coins being spent, since an offline device cannot look them up.",
              "Because the format is shared, the wallet that builds and the device that signs can come from different makers.",
              "With a several-key lock, the same package is passed from signer to signer, collecting one signature at each stop.",
              { s: "The whole design rests on one habit: you read the details on the device that holds the key, because the connected machine may be lying.", g: "point" }
            ] },
          { board: { clear: true, title: "A backup can fail two ways", ops: [
              { text: "the seed words", x: 80, y: 14, a: "c", size: 5.5, c: "amber", at: 0 },
              { arrow: [66, 19, 38, 30], at: 1 },
              { arrow: [94, 19, 122, 30], at: 1 },
              { box: [8, 32, 56, 14], t: "too few copies", c: "red", at: 2 },
              { text: "fire, flood, a house move", x: 36, y: 53, a: "c", size: 4, c: "grey", at: 2 },
              { text: "= lost", x: 36, y: 61, a: "c", size: 5, c: "red", at: 2 },
              { box: [96, 32, 56, 14], t: "too many copies", c: "red", at: 3 },
              { text: "a photo, an online folder", x: 124, y: 53, a: "c", size: 4, c: "grey", at: 4 },
              { text: "= stolen", x: 124, y: 61, a: "c", size: 5, c: "red", at: 4 },
              { text: "few, offline, findable by the right person", x: 80, y: 80, a: "c", size: 5, c: "green", at: 6 }
            ] },
            say: [
              "Now the backup itself, which is just those words, written down.",
              "There are two ways to get it wrong, and they pull in opposite directions.",
              "Keep one copy in one place, and a fire, a flood or a house move can take it.",
              "So you make more copies, and now each copy is one more thing to be found.",
              "A photograph of the words, or a note in an online folder, is a copy held by every system that photo or folder passes through.",
              "The words were designed to be written on paper, and there is rarely a good reason to type them into anything but a wallet.",
              { s: "The aim is a small number of copies, kept offline, which the right person could still find if you were not there to explain.", g: "count" },
              "That last part matters, because a backup nobody else can find or understand protects your coins from your own family."
            ] }
        ] },

      { id: "how-coins-are-lost", title: "How Coins Are Lost", topics: ["mt gox", "exchange failure", "lost keys", "landfill", "phishing", "scams", "custody", "next lecture"],
        beats: [
          { slide: { k: "section", title: "How Coins Are Lost", sub: "A failed keeper, a lost key, a convincing lie" },
            at: "lectern", g: "open",
            say: [
              "I promised you the honest ledger, so here it is.",
              { s: "Coins are lost in three ways, and I shall take them in turn.", g: "count" },
              "Somebody else was holding them for you, and failed.",
              "You held them yourself, and lost the key.",
              "Or you held them yourself, and were talked into handing the key over."
            ] },
          { slide: { k: "figure", title: "Mt Gox, from the record", ops: [
              { line: [6, 30, 154, 30], c: "grey" },
              { circle: [14, 30, 1.5], fill: true }, { line: [14, 25, 14, 30] },
              { text: "Jul 2010", x: 14, y: 16, a: "c", size: 3.5, c: "grey" },
              { text: "opens", x: 14, y: 21.5, a: "c", size: 3.8 },
              { circle: [42, 30, 1.5], fill: true, at: 1 }, { line: [42, 30, 42, 35], at: 1 },
              { text: "2013", x: 42, y: 39, a: "c", size: 3.5, c: "grey", at: 1 },
              { text: "70% of trade", x: 42, y: 44.5, a: "c", size: 3.8, at: 1 },
              { circle: [70, 30, 1.5], c: "red", fill: true, at: 2 }, { line: [70, 25, 70, 30], c: "red", at: 2 },
              { text: "7 Feb 2014", x: 70, y: 16, a: "c", size: 3.5, c: "grey", at: 2 },
              { text: "withdrawals stop", x: 70, y: 21.5, a: "c", size: 3.8, c: "red", at: 2 },
              { circle: [96, 30, 1.5], c: "red", fill: true, at: 3 }, { line: [96, 30, 96, 35], c: "red", at: 3 },
              { text: "28 Feb 2014", x: 96, y: 39, a: "c", size: 3.5, c: "grey", at: 3 },
              { text: "files in Tokyo", x: 96, y: 44.5, a: "c", size: 3.8, c: "red", at: 3 },
              { circle: [122, 30, 1.5], fill: true, at: 5 }, { line: [122, 25, 122, 30], at: 5 },
              { text: "Mar 2014", x: 122, y: 16, a: "c", size: 3.5, c: "grey", at: 5 },
              { text: "200,000 found", x: 122, y: 21.5, a: "c", size: 3.8, at: 5 },
              { circle: [146, 30, 1.5], c: "green", fill: true, at: 6 }, { line: [146, 30, 146, 35], c: "green", at: 6 },
              { text: "2024", x: 146, y: 39, a: "c", size: 3.5, c: "grey", at: 6 },
              { text: "repayments", x: 146, y: 44.5, a: "c", size: 3.8, c: "green", at: 6 },
              { text: "the customers held a claim, not a coin", x: 80, y: 57, a: "c", size: 4.5, c: "amber", at: 6 }
            ] },
            at: "screen", g: "point",
            say: [
              "The first is the oldest story in money, and Bitcoin's largest telling of it is an exchange in Tokyo called Mt Gox.",
              "It began trading bitcoin in July 2010, and at its peak, in the spring of 2013, it was handling around 70 per cent of all the bitcoin trade in the world.",
              "On 7 February 2014 it stopped letting its customers withdraw their bitcoin.",
              "On 28 February it filed for protection from its creditors at the Tokyo District Court.",
              "It said that about 750,000 of its customers' bitcoins were gone, along with about 100,000 of its own.",
              "A few weeks later it reported finding some 200,000 in an old wallet, which still left about 650,000 missing.",
              "The case passed from bankruptcy into a court-supervised rehabilitation in 2018, and the first repayments in bitcoin went out in 2024, ten years on."
            ] },
          { slide: { k: "number", value: "850,000", label: "bitcoins reported missing by Mt Gox in February 2014", note: "About 750,000 were customers'. Some 200,000 were later found in an old wallet." },
            at: "centre", g: "open",
            say: [
              "Eight hundred and fifty thousand bitcoins, reported missing in one filing.",
              "Investigators who later traced the ledger concluded that most had been drained from the exchange's online wallet over time, beginning in late 2011.",
              { s: "All that while, the balances on the customers' screens went on looking perfect.", g: "lean" },
              "And that is the lesson, because those balances were never coins.",
              "They were lines in a private ledger kept by a company: the keeper from lecture 1, back again under a new signboard.",
              "The customers held no keys, so what they owned was a claim on the keeper, good for exactly as long as the keeper was.",
              { s: "That is the meaning of a saying you will hear often: not your keys, not your coins.", g: "pinch" }
            ] },
          { say: ["Let me make sure that lesson has landed.", "What did a Mt Gox customer actually hold?"],
            quiz: {
              q: "What did a Mt Gox customer actually hold?",
              options: [
                "Private keys, stored on the exchange's website",
                "A claim on the company, recorded in its own ledger",
                "A backup phrase the exchange kept safe for them",
                "Coins on the public ledger under their own name"
              ],
              answer: 1,
              right: ["Exactly: a promise from a keeper, and no key at all."],
              wrong: [
                ["The customers were never given keys, on the website or anywhere else.", "They held a claim on the company, written in the company's own ledger."],
                null,
                ["No phrase belonged to any customer, because the keys were the exchange's alone.", "What a customer held was a claim on the company, recorded in its own ledger."],
                ["The public ledger showed the exchange's coins, with no customer's name on any of them.", "A customer held only a claim on the company, recorded in its private ledger."]
              ]
            } },
          { slide: { k: "number", value: "8,000", label: "bitcoins on one hard drive, thrown away in Newport in 2013", note: "As set out in Howells v Newport City Council, High Court, 9 January 2025" },
            at: "right", g: "open",
            say: [
              "The second way to lose coins needs no villain at all.",
              "In August 2013 a man in Newport, in Wales, cleared out his home office.",
              "By his own account there were two hard drives, and the wrong one went into the rubbish: the one holding, he says, the key to 8,000 bitcoins.",
              "It ended up in the council's landfill, and in January 2025 the High Court dismissed his claim against the council over it.",
              { s: "The coins are on the ledger today, in plain view, and nobody on earth can move them.", g: "shrug" },
              "Nobody knows how many coins are in that state, because a lost coin and a patiently held coin look exactly alike."
            ] },
          { slide: { k: "points", title: "The third way: being tricked", start: 0, points: [
              "A fake support agent asks for your 12 words",
              "A look-alike website invites you to restore your wallet",
              "An address is swapped between copy and paste",
              "The rule: nobody honest ever needs your words"
            ] },
            at: "left", g: "open",
            say: [
              "The third way is as old as the confidence trick.",
              "Remember that nobody has broken the arithmetic, so the thief works on the person instead.",
              { s: "Someone posing as support staff explains that there is a problem, and that your 12 words are needed to put it right.", show: 1 },
              { s: "Or a website that looks exactly right invites you to restore your wallet by typing the words in.", show: 2 },
              { s: "Or malicious software quietly swaps the address you copied for the thief's own, between copy and paste.", show: 3 },
              "Even the website of the Mt Gox proceedings carries warnings about fake emails sent to creditors in its name.",
              { s: "One rule covers nearly all of it: nobody honest will ever need your words, for any reason at all.", show: 4, g: "chop" },
              "And a payment buried in the chain is not coming back, for all the reasons the last few lectures gave."
            ] },
          { slide: { k: "compare", title: "The honest ledger",
              left: { head: "A keeper holds the keys", points: ["Nothing for you to lose or leak", "Can be hacked, frozen or bankrupt", "You own a claim, not a coin", "Recovery is up to a court"] },
              right: { head: "You hold the keys", points: ["Nobody can freeze or fail you", "Nobody can rescue you either", "Loss and trickery are on you", "The backup is the safety net"] } },
            at: "centre", g: "weigh",
            say: [
              "So here is the ledger, drawn up fairly.",
              "Leave your coins with a keeper and you have nothing to lose or leak, but you are trusting the keeper not to fail, and you hold a claim rather than a coin.",
              "Hold your own keys, and nobody can freeze you, refuse you or go bankrupt with your money.",
              { s: "But nobody can rescue you either, and that is not small print; it is the same fact seen from the other side.", g: "weigh" },
              "I said in lecture 1 that today you would become your own keeper.",
              "Now you know what the job is: one secret, kept from everyone else, and never lost by you.",
              { s: "Whether to take that job, and for how much, is your decision, and I would not dream of making it for you.", g: "open" }
            ] },
          { slide: { k: "figure", title: "Next time: what your addresses reveal", ops: [
              { box: [8, 10, 36, 10], t: "address A", at: 1 },
              { box: [8, 30, 36, 10], t: "address B", at: 1 },
              { arrow: [46, 16, 74, 23], at: 2 },
              { arrow: [46, 34, 74, 27], at: 2 },
              { box: [76, 18, 38, 14], t: "one payment", c: "amber", fill: true, at: 2 },
              { arrow: [116, 25, 128, 25], at: 2 },
              { box: [130, 19, 26, 12], t: "shop", at: 2 },
              { ellipse: [26, 25, 24, 21], c: "red", dash: true, at: 2 },
              { text: "same owner?", x: 26, y: 53, a: "c", size: 4.5, c: "red", at: 2 },
              { text: "on a public ledger, for ever", x: 112, y: 53, a: "c", size: 4.5, at: 3 }
            ] },
            at: "lectern", g: "open",
            say: [
              "Next time we look hard at something I have skated past all day.",
              "Every address your tree produces ends up on a ledger that anyone may read.",
              "When two of your addresses pay into one transaction, an onlooker may fairly guess that they belong to the same person.",
              "No name appears anywhere, and yet a pattern of payments can say a great deal about who is behind it.",
              "Lecture 12 is Privacy and Its Limits, and its motto is that pseudonymous is not anonymous.",
              "Before then, read BIP 39; it is short, and you now know what every paragraph of it is for.",
              { s: "Thank you, and I shall see you in lecture 12.", g: "up" }
            ] }
        ] }
    ]
  });
})();
