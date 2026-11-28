// Bitcoin from First Principles, lecture 3: who may spend on a ledger with no keeper. The key pair (Diffie and Hellman, 1976) and its one-way street, the curve secp256k1 in pictures, what a digital signature proves and the three things it does not, ECDSA beside Schnorr (BIP 340), why a signature's random number must never repeat (the PlayStation 3 in 2010, Android in 2013), and an address as a fingerprint of a key.
(() => {
  "use strict";
  window.BL.lectures.add({
    id: "btc-03", course: "first-principles", n: 3, title: "Keys and Signatures",
    reading: [
      { title: "New Directions in Cryptography (the introduction)", by: "Whitfield Diffie and Martin Hellman, 1976" },
      { title: "BIP 340: Schnorr Signatures for secp256k1 (Motivation)", by: "Wuille, Nick and Ruffing, 2020" },
      { title: "Bitcoin whitepaper, section 2: Transactions", by: "Satoshi Nakamoto, 2008" }
    ],
    sources: [
      "Whitfield Diffie and Martin Hellman, New Directions in Cryptography, IEEE Transactions on Information Theory IT-22(6), November 1976, https://ee.stanford.edu/~hellman/publications/24.pdf",
      "Certicom Research, SEC 2: Recommended Elliptic Curve Domain Parameters (version 1.0, 2000; version 2.0, 2010), section 2.4.1, https://www.secg.org/sec2-v2.pdf, with https://en.bitcoin.it/wiki/Secp256k1",
      "Pieter Wuille, Jonas Nick and Tim Ruffing, BIP 340: Schnorr Signatures for secp256k1, https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki",
      "Satoshi Nakamoto, Bitcoin: A Peer-to-Peer Electronic Cash System (2008), sections 2 and 10, https://bitcoin.org/bitcoin.pdf",
      "bushing, marcan and sven (fail0verflow), Console Hacking 2010: PS3 Epic Fail, 27th Chaos Communication Congress, 29 December 2010, https://fahrplan.events.ccc.de/congress/2010/Fahrplan/events/4087.en.html",
      "bitcoin.org, Android Security Vulnerability, 11 August 2013, https://bitcoin.org/en/alert/2013-08-11-android",
      "Alex Klyubin, Some SecureRandom Thoughts, Android Developers Blog, 14 August 2013, https://android-developers.googleblog.com/2013/08/some-securerandom-thoughts.html",
      "Reports of the August 2013 thefts (about 55 bitcoins), https://thehackernews.com/2013/08/hacking-bitcoin-android-vulnerability-digital-wallets.html and https://it.slashdot.org/story/13/08/15/1726233/google-admits-bitcoin-thieves-exploited-android-crypto-prng-flaw",
      "Thomas Pornin, RFC 6979: Deterministic Usage of DSA and ECDSA, August 2013, https://www.rfc-editor.org/rfc/rfc6979",
      "Claus Schnorr, Efficient Identification and Signatures for Smart Cards (Crypto 89), and US patent 4,995,082, https://patents.google.com/patent/US4995082, with https://en.wikipedia.org/wiki/Schnorr_signature",
      "GCHQ's earlier, classified work: https://en.wikipedia.org/wiki/James_H._Ellis; Ralph Merkle's: https://en.wikipedia.org/wiki/Merkle%27s_Puzzles; Koblitz and Miller, 1985: https://en.wikipedia.org/wiki/Elliptic-curve_cryptography",
      "The secret key 1 and its address: BIP 173's test vectors, https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki, and https://mempool.space/address/bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
    ],
    sections: [
      { id: "who-may-spend", title: "Who May Spend?", topics: ["recap of fingerprints", "ownership", "passwords", "handwritten signatures", "what a signature must do"],
        beats: [
          { slide: { k: "title", kicker: "Lecture 3", title: "Keys and Signatures", sub: "What a signature proves, and what it does not" },
            at: "lectern", g: "open",
            say: [
              "Welcome back to Bitcoin from First Principles.",
              "Last time we met the fingerprint machine, the hash function.",
              "It takes any data at all and gives back a short fingerprint, and it cannot be run backwards.",
              "Change one letter of the data, and the fingerprint changes beyond recognition.",
              "So a fingerprint can tell you whether data has been altered.",
              { s: "What it cannot tell you is who is allowed to alter it.", g: "lean" },
              "That is today's question: on a ledger with no keeper, who may spend a coin?"
            ] },
          { slide: { k: "points", title: "Today, in four questions", start: 0, points: [
              "What is a key pair, and where did it come from?",
              "What does a signature prove, exactly?",
              "What does it not prove?",
              "What happens when one small number goes wrong?"
            ] },
            at: "centre", g: "open",
            say: [
              "Here is the plan.",
              { s: "First, a strange invention from 1976: a secret that comes in two halves.", show: 1 },
              { s: "Second, what a digital signature proves, and I mean exactly, down to the byte.", show: 2, g: "pinch" },
              { s: "Third, what it does not prove, which is where most of the misunderstandings live.", show: 3 },
              { s: "And fourth, two true stories about what happens when one small number goes wrong.", show: 4, g: "count" }
            ] },
          { slide: { k: "compare", title: "Two ways to guard a coin",
              left: { head: "The keeper's way", points: ["You prove who you are", "A password, a card, a face", "The keeper checks its private records", "The keeper can say no"] },
              right: { head: "The keyholder's way", points: ["You prove what you know", "A secret number, never shown", "Anyone can check the proof", "Nobody is asked for permission"] } },
            at: "left", g: "weigh",
            say: [
              "Think about how a bank guards your money.",
              "It asks who you are, and checks your answer against its records: a password, a card, a face.",
              "That works because the keeper is there to do the checking, and to keep the passwords out of sight.",
              "Our ledger is public, and everybody holds a copy of it.",
              { s: "A password written into a public ledger is no longer a password.", g: "shrug" },
              "So we need a different kind of proof: not who you are, but what you know.",
              { s: "And here is the hard part: you must prove that you know a secret without ever showing it.", g: "pinch" }
            ] },
          { slide: { k: "points", title: "The shopping list for a signature", start: 0, points: [
              "Only the owner can make it",
              "Anyone can check it",
              "It fits one message and no other",
              "Checking it gives nothing away"
            ] },
            at: "right", g: "count",
            say: [
              "Ink on paper will not do, because a scanned signature can be pasted under anything.",
              { s: "So let me write a shopping list, and first on it: only the owner can produce the thing.", show: 1 },
              { s: "Second, anyone at all can check it, with no keeper and no private records.", show: 2 },
              { s: "Third, it is welded to one message, so it cannot be lifted off and stuck onto another.", show: 3 },
              { s: "And fourth, checking it must give away nothing that would help a forger.", show: 4 },
              "For most of history that list looked like a contradiction.",
              { s: "If everyone can check it, how can only one person make it?", g: "lean" }
            ] }
        ] },

      { id: "key-pairs", title: "A Secret in Two Halves", topics: ["key pair", "secret key", "private key", "public key", "one-way function", "diffie and hellman", "history of public keys"],
        beats: [
          { slide: { k: "section", title: "A Secret in Two Halves", sub: "1976: Diffie, Hellman and the one-way street" },
            at: "lectern", g: "open",
            say: [
              "For thousands of years, every secret code needed a shared secret.",
              "If you and I wanted to write privately, we first had to meet, or trust a courier, to agree on a key.",
              "The same key locked the message and unlocked it.",
              "In November 1976 two researchers at Stanford, Whitfield Diffie and Martin Hellman, published a paper that broke that rule.",
              "It was called New Directions in Cryptography, and it has one of the boldest opening lines in the field."
            ] },
          { slide: { k: "quote", text: "We stand today on the brink of a revolution in cryptography.", by: "Diffie and Hellman, New Directions in Cryptography, 1976" },
            at: "centre", g: "open",
            say: [
              "They were right.",
              { s: "Their idea was to split the key in two.", g: "chop" },
              "One half you keep secret, and it never leaves your hands.",
              "The other half you publish to the whole world, like a name on a door.",
              "The two halves are bound together by mathematics, and yet the public half does not give the secret half away.",
              "The paper also asked for a digital signature: something anyone could recognise as genuine, and nobody but the signer could produce.",
              "They had no working recipe for one yet, only the shopping list and the conviction that it could be filled."
            ] },
          { slide: { k: "compare", title: "Before and after 1976",
              left: { head: "One shared key", points: ["Locks and unlocks alike", "Both sides must hold it", "Must be agreed in private first", "Leak it once and all is lost"] },
              right: { head: "A pair of keys", points: ["One half secret, one half public", "The public half can be shouted", "No private meeting needed first", "Only one half needs guarding"] } },
            at: "left", g: "weigh",
            say: [
              "Look at what changes.",
              "With one shared key, both of us must guard it, and we must meet in private before we can begin.",
              "With a pair, I guard my secret half alone, and I can shout the public half across a crowded room.",
              { s: "Strangers who have never met can now check each other's work.", g: "wide" },
              "And a ledger held by strangers is exactly what we are trying to build."
            ] },
          { slide: { k: "table", title: "Who found the two-halved key?", start: 0, head: ["When", "Who", "What"], rows: [
              ["early 1970s", "Ellis, Cocks, Williamson", "found it in secret"],
              ["1974", "Ralph Merkle", "puzzles for a shared key"],
              ["1976", "Diffie and Hellman", "the idea, in the open"],
              ["1977", "Rivest, Shamir, Adleman", "first working signatures"],
              ["1985", "Koblitz and Miller", "keys from curves"]
            ], note: "The work at GCHQ stayed classified until 1997." },
            at: "right", g: "open",
            say: [
              "History owes a footnote here.",
              { s: "Three men at GCHQ, Britain's signals intelligence agency, had found the same idea a few years earlier: James Ellis, Clifford Cocks and Malcolm Williamson.", show: 1 },
              "Their work was classified, and it stayed secret until 1997.",
              { s: "Ralph Merkle, whose name you met last time on a tree of fingerprints, was attacking the same problem as a student.", show: 2 },
              { s: "Diffie and Hellman put the idea in the open in 1976.", show: 3 },
              { s: "A year later Rivest, Shamir and Adleman, at MIT, found the first recipe that could actually sign.", show: 4 },
              { s: "And in 1985 two mathematicians, Neal Koblitz and Victor Miller, each proposed making keys from a family of curves, which is where we are heading.", show: 5, g: "point" }
            ] },
          { board: { clear: true, title: "A one-way street", ops: [
              { box: [10, 24, 46, 16], t: "secret key", c: "red", at: 1 },
              { text: "a huge random number", x: 33, y: 46, a: "c", size: 4, c: "grey", at: 1 },
              { arrow: [58, 29, 102, 29], at: 2 },
              { box: [104, 24, 46, 16], t: "public key", c: "green", at: 2 },
              { text: "made from the secret", x: 127, y: 46, a: "c", size: 4, c: "grey", at: 2 },
              { text: "easy: a moment", x: 80, y: 23, a: "c", size: 4, c: "green", at: 3 },
              { arrow: [102, 36, 58, 36], c: "red", dash: true, at: 4 },
              { text: "no known way back", x: 80, y: 41, a: "c", size: 4, c: "red", at: 4 },
              { text: "keep it", x: 33, y: 60, a: "c", size: 6, c: "red", at: 6 },
              { text: "publish it", x: 127, y: 60, a: "c", size: 6, c: "green", at: 6 },
              { text: "linked, but only one way", x: 80, y: 76, a: "c", size: 5, at: 7 }
            ] },
            say: [
              "Let me draw the shape of it, because the whole lecture hangs on this picture.",
              "On the left is your secret key, which is nothing more than a very large number chosen at random.",
              "From it, a fixed and public recipe computes your public key.",
              "Going forwards takes a computer a fraction of a second.",
              "Going backwards, from the public key to the secret one, has no known practical shortcut at all.",
              "It is like stirring milk into tea: a moment to do, and no spoon will ever stir it back out.",
              "So you can paint your public key on the side of a building, and your secret stays secret.",
              "Last time's fingerprint machine was one-way too, but this street has a second talent: its two ends stay linked, and that link is what lets us sign."
            ] },
          { say: ["Let me check that the two halves have landed.", "How are the two halves of a key pair related?"],
            quiz: {
              q: "How are the two halves of a key pair related?",
              options: [
                "Each half can be worked out from the other",
                "The secret half is made from the public half",
                "The public half is made from the secret, one way only",
                "They are two unrelated random numbers"
              ],
              answer: 2,
              right: ["Yes: from secret to public is easy, and from public to secret there is no known practical road."],
              wrong: [
                ["If each half gave the other, publishing one would give away both.", "The public half is computed from the secret half, and there is no known way back."],
                ["That is the wrong way round, and it would let anyone compute your secret.", "The secret comes first, and the public half is made from it, one way only."],
                null,
                ["Two unrelated numbers could not check each other's work.", "The public half is computed from the secret half, in one direction only."]
              ]
            } }
        ] },

      { id: "the-curve", title: "The Curve Bitcoin Chose", topics: ["elliptic curve", "secp256k1", "adding points", "size of a secret key", "public key as a point", "guessing a key", "quantum computers"],
        beats: [
          { slide: { k: "section", title: "The Curve Bitcoin Chose", sub: "secp256k1, in pictures rather than algebra" },
            at: "lectern", g: "open",
            say: [
              "A one-way street needs some mathematics underneath it, and Bitcoin's is a curve.",
              "It belongs to a family called elliptic curves, which have very little to do with ellipses, I am sorry to say.",
              "The particular one has a name only an engineer could love: secp256k1.",
              "It comes from a public catalogue of recommended curves, issued in the year 2000 by an industry standards group.",
              { s: "I promise you pictures today, and no algebra beyond a single line.", g: "up" }
            ] },
          { board: { clear: true, title: "Adding two points", ops: [
              { line: [8, 52, 128, 52], c: "grey", at: 0 },
              { path: [19.9, 52, 20.6, 48.1, 22.4, 45, 26.8, 40.9, 33.4, 37.8, 42.2, 35.7, 53.2, 34.9, 66.4, 34.8, 77.4, 34.4, 86.2, 33.2, 95, 31.1, 103.8, 27.8, 110.4, 24.7, 114.8, 22.3], c: "blue", at: 0 },
              { path: [19.9, 52, 20.6, 55.9, 22.4, 59, 26.8, 63.1, 33.4, 66.2, 42.2, 68.3, 53.2, 69.1, 66.4, 69.2, 77.4, 69.6, 86.2, 70.8, 95, 72.9, 103.8, 76.2, 110.4, 79.3, 114.8, 81.7], c: "blue", at: 0 },
              { circle: [20.2, 54.4, 1.6], fill: true, at: 1 },
              { text: "P", x: 12, y: 61, size: 5, at: 1 },
              { circle: [84, 33.6, 1.6], fill: true, at: 1 },
              { text: "Q", x: 81, y: 27, size: 5, at: 1 },
              { line: [12, 57.1, 118, 22.6], at: 2 },
              { circle: [108.7, 25.6, 1.6], c: "grey", at: 2 },
              { line: [108.7, 28, 108.7, 76], c: "grey", dash: true, at: 3 },
              { circle: [108.7, 78.4, 2], c: "red", fill: true, at: 3 },
              { text: "P + Q", x: 114, y: 79, size: 5.5, c: "red", at: 3 },
              { text: "add: draw the line, flip the third", x: 8, y: 84, size: 4.5, at: 4 }
            ] },
            say: [
              "Over ordinary numbers the curve looks like this: a smooth line with a bulge, the same above and below.",
              "Pick any two points on it, and call them P and Q.",
              "Draw the straight line through them, and it cuts the curve in one more place.",
              "Flip that third point over to the other side, and call the result P plus Q.",
              "That is all the word adding means here: a rule that takes two points on the curve and lands on a third.",
              "A point can even be added to itself, and that gives us a way to hop along the curve."
            ] },
          { slide: { k: "figure", title: "On a clock, the curve becomes dots", ops: [
              { text: "y² = x³ + 7", x: 4, y: 14, size: 5.5 },
              { text: "the same equation,", x: 4, y: 26, size: 4, c: "grey", at: 2 },
              { text: "on a clock of 17 hours", x: 4, y: 32, size: 4, c: "grey", at: 2 },
              { box: [51, 3, 57, 58], c: "grey" },
              { circle: [56.3, 41.5, 1.1], c: "blue", fill: true, at: 2 }, { circle: [56.3, 18.4, 1.1], c: "blue", fill: true, at: 2 },
              { circle: [59.6, 34.9, 1.1], c: "blue", fill: true, at: 2 }, { circle: [59.6, 25, 1.1], c: "blue", fill: true, at: 2 },
              { circle: [62.9, 58, 1.1], c: "blue", fill: true, at: 2 },
              { circle: [69.5, 31.6, 1.1], c: "blue", fill: true, at: 2 }, { circle: [69.5, 28.3, 1.1], c: "blue", fill: true, at: 2 },
              { circle: [72.8, 38.2, 1.1], c: "blue", fill: true, at: 2 }, { circle: [72.8, 21.7, 1.1], c: "blue", fill: true, at: 2 },
              { circle: [79.4, 48.1, 1.1], c: "blue", fill: true, at: 2 }, { circle: [79.4, 11.8, 1.1], c: "blue", fill: true, at: 2 },
              { circle: [86, 51.4, 1.1], c: "blue", fill: true, at: 2 }, { circle: [86, 8.5, 1.1], c: "blue", fill: true, at: 2 },
              { circle: [92.6, 54.7, 1.1], c: "blue", fill: true, at: 2 }, { circle: [92.6, 5.2, 1.1], c: "blue", fill: true, at: 2 },
              { circle: [102.5, 44.8, 1.1], c: "blue", fill: true, at: 2 }, { circle: [102.5, 15.1, 1.1], c: "blue", fill: true, at: 2 },
              { text: "17 scattered dots", x: 113, y: 14, size: 4, c: "blue", at: 2 },
              { line: [51, 30, 108, 30], c: "amber", dash: true, at: 3 },
              { text: "still a mirror line", x: 113, y: 30, size: 4, c: "amber", at: 3 },
              { text: "the adding rule", x: 113, y: 44, size: 4, c: "green", at: 3 },
              { text: "still works", x: 113, y: 50, size: 4, c: "green", at: 3 }
            ] },
            at: "screen", g: "point",
            say: [
              "Now the twist that turns a pretty curve into cryptography.",
              "Bitcoin does not use ordinary numbers; it uses whole numbers that wrap around, like the hours on a clock.",
              "Here is the same equation on a toy clock of only 17 hours, and the smooth line has shattered into 17 scattered dots.",
              "There is still a mirror line, and the rule for adding two dots still works, though it no longer looks like anything at all.",
              { s: "Bitcoin's real clock is a little larger than 17.", g: "lean" }
            ] },
          { slide: { k: "code", title: "secp256k1, on a postcard", start: 0, lines: [
              "# the whole curve, in one line",
              "y² = x³ + 7",
              "",
              "# on a clock with p hours, where p is the prime",
              "p = 2^256 - 2^32 - 977",
              "",
              "# one agreed starting point, the same for everybody",
              "G = (79BE667E...16F81798, 483ADA77...FB10D4B8)",
              "",
              "# how many points the hopping can reach from G",
              "n = FFFFFFFF...D0364141    (about 1.16 x 10^77)"
            ] },
            at: "screen", g: "point",
            say: [
              "Here is the entire specification, and it would fit on a postcard.",
              { s: "The curve is every point where y squared equals x cubed plus seven.", show: 2 },
              { s: "The clock has p hours, and p is a prime number 78 digits long, just under two to the power of 256.", show: 5 },
              { s: "Then there is one agreed starting point on the curve, called G, the same for everybody.", show: 8 },
              { s: "And n is the number of points you can reach by hopping from G, another number of 78 digits.", show: 11 },
              { s: "Nothing on this slide is secret, and none of it was chosen by Bitcoin: it was all in print years before.", g: "open" }
            ] },
          { board: { clear: true, title: "Hop k times from G", ops: [
              { circle: [16, 74, 2.5], c: "green", fill: true, at: 0 },
              { text: "G", x: 16, y: 82, a: "c", size: 5, c: "green", at: 0 },
              { arrow: [18, 72, 48, 29], at: 1 },
              { circle: [50, 26, 2], at: 1 },
              { text: "2G", x: 54, y: 22, size: 4, at: 1 },
              { arrow: [49, 29, 33, 48], at: 1 },
              { circle: [32, 51, 2], at: 1 },
              { text: "3G", x: 22, y: 51, size: 4, at: 1 },
              { arrow: [34, 53, 81, 69], at: 1 },
              { circle: [84, 70, 2], at: 1 },
              { text: "4G", x: 88, y: 74, size: 4, at: 1 },
              { arrow: [84, 67, 72, 37], at: 1 },
              { circle: [71, 34, 2], at: 1 },
              { text: "5G", x: 62, y: 31, size: 4, at: 1 },
              { text: ". . .", x: 82, y: 36, size: 6, at: 2 },
              { arrow: [98, 36, 133, 26], dash: true, at: 2 },
              { circle: [138, 24, 3], c: "red", fill: true, at: 2 },
              { text: "K", x: 144, y: 24, size: 7, c: "red", at: 3 },
              { text: "K = k x G", x: 108, y: 48, size: 7, at: 3 },
              { text: "k = secret key", x: 108, y: 60, size: 4.5, c: "red", at: 4 },
              { text: "K = public key", x: 108, y: 68, size: 4.5, c: "green", at: 4 },
              { text: "how many hops? nobody can tell", x: 80, y: 86, a: "c", size: 5, c: "red", at: 6 }
            ] },
            say: [
              "Start at the agreed point, G.",
              "Count G itself as hop one: add G and you land on a new point, add G again and you land on another, with no visible pattern.",
              "Now choose a secret number, little k, and make k hops.",
              "Wherever you land is a point we call capital K, and in symbols, capital K is little k times G.",
              { s: "The number of hops is your secret key, and the landing point is your public key.", g: "pinch" },
              "A doubling trick lets your computer make those hops in a few hundred steps, even when k has 78 digits.",
              "But someone who holds only G and capital K has no such trick for counting the hops, and the best known methods are still hopelessly slow."
            ] },
          { slide: { k: "number", value: "1.16 x 10^77", label: "possible secret keys: a number 78 digits long", note: "For scale: the observable universe holds roughly 10^80 atoms." },
            at: "centre", g: "open",
            say: [
              "How many numbers are there to try?",
              { s: "About ten to the power of 77, which is a one followed by 77 zeros.", g: "wide" },
              "For scale, the usual estimate for all the atoms in the observable universe is around ten to the power of 80.",
              "So guessing a secret key is like naming one particular atom, out of a thousandth of everything there is, on your first try.",
              "No computer ever built can search a haystack of that size.",
              { s: "The honest caveat is that a large enough quantum computer could run this street backwards, and no such machine exists today.", g: "weigh" },
              "That is the whole security of a key: not a vault with thick walls, just a haystack too big to search."
            ] },
          { say: ["A quick check on the curve before we put it to work.", "Why can nobody work out your secret key from your public key?"],
            quiz: {
              q: "Why can nobody work out your secret key from your public key?",
              options: [
                "Counting hops backwards has no known practical shortcut",
                "The curve's details are a trade secret",
                "There is a law against trying",
                "The public key is kept hidden from everyone"
              ],
              answer: 0,
              right: ["Right: forwards takes a few hundred steps, and backwards is a search too big for any machine."],
              wrong: [
                null,
                ["Every detail of the curve has been in print since the year 2000.", "What protects the key is that counting the hops backwards has no known practical shortcut."],
                ["Thieves are not known for reading the statute book.", "The protection is arithmetic: counting the hops backwards has no known practical shortcut."],
                ["The public key is public, and that is the whole point of it.", "The secret is safe because counting the hops backwards has no known practical shortcut."]
              ]
            } }
        ] },

      { id: "what-a-signature-proves", title: "What a Signature Proves", topics: ["digital signature", "signing", "verifying", "exact bytes", "identity", "timestamps", "coercion", "stolen keys", "chain of signatures"],
        beats: [
          { slide: { k: "section", title: "What a Signature Proves", sub: "And the three things it does not" },
            at: "lectern", g: "open",
            say: [
              "Now we can fill the shopping list from the start of the lecture.",
              "A digital signature is a short piece of data made from two ingredients: your secret key and one particular message.",
              "Anyone can test it using three things that are all public: the message, the signature and your public key.",
              { s: "The test answers yes or no, and it never needs the secret.", g: "pinch" }
            ] },
          { slide: { k: "figure", title: "Sign with one half, check with the other", ops: [
              { box: [4, 4, 34, 11], t: "message" },
              { box: [4, 21, 34, 11], t: "secret key", c: "red" },
              { arrow: [39, 10, 58, 16], at: 1 },
              { arrow: [39, 26, 58, 20], at: 1 },
              { box: [60, 11, 28, 14], t: "sign", c: "blue", fill: true, at: 1 },
              { arrow: [89, 18, 104, 18], at: 1 },
              { box: [106, 11, 40, 14], t: "signature", c: "amber", fill: true, at: 1 },
              { box: [2, 42, 28, 11], t: "message", at: 2 },
              { box: [33, 42, 32, 11], t: "signature", c: "amber", at: 2 },
              { box: [68, 42, 32, 11], t: "public key", c: "green", at: 2 },
              { arrow: [101, 47.5, 110, 47.5], at: 2 },
              { box: [112, 41, 24, 13], t: "verify", c: "blue", fill: true, at: 2 },
              { arrow: [137, 47.5, 144, 47.5], at: 2 },
              { text: "yes", x: 147, y: 44, size: 4.5, c: "green", at: 2 },
              { text: "no", x: 147, y: 51, size: 4.5, c: "red", at: 2 },
              { text: "change one letter of the message, and the answer is no", x: 80, y: 61, a: "c", size: 4, c: "red", at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "Here is the machinery in one picture.",
              "Signing takes the message and the secret key, and produces the signature.",
              "Verifying takes the message, the signature and the public key, and says yes or no.",
              "Strictly, what gets signed is the message's fingerprint, the hash from last time, which is why a signature stays small however long the message is.",
              { s: "It is also why changing a single letter makes the check fail: a different message has a different fingerprint.", g: "pinch" },
              "So the signature is welded to those exact bytes, and it is worthless on any others."
            ] },
          { at: "centre", g: "open",
            say: [
              "The old picture for this is a signet ring pressed into wax.",
              "Only the ring's owner can make the impression, and anyone who knows the crest can recognise it.",
              "But a wax seal looks the same on every letter, so a forger can lift it and fix it to a different one.",
              "A digital signature is a seal that comes out in a different shape for every document.",
              { s: "Lift it off one message and press it onto another, and it simply does not fit.", g: "chop" }
            ] },
          { slide: { k: "quote", text: "We define an electronic coin as a chain of digital signatures.", by: "Satoshi Nakamoto, Bitcoin whitepaper, section 2, 2008" },
            at: "left", g: "open",
            say: [
              "This is where the whitepaper puts signatures to work, in the first line of its second section.",
              { s: "A coin is not a file and it is not an object; it is a chain of signatures.", g: "point" },
              "Each owner passes a coin on by signing a message that says, in effect, this now belongs to that public key.",
              "The next owner does the same in turn, and anyone can check every link back to the beginning.",
              "Exactly what goes into that message is next lecture's business.",
              "For today, hold on to one thing: on this ledger, owning a coin means being able to produce the signature that moves it."
            ] },
          { slide: { k: "compare", title: "Read a signature precisely",
              left: { head: "It proves", points: ["A holder of the secret key signed", "These exact bytes, and no others", "Nothing was changed afterwards"] },
              right: { head: "It does not prove", points: ["Who the holder is", "When the signing happened", "That they agreed, or understood", "That the key was never copied"] } },
            at: "right", g: "glasses",
            say: [
              "Now let me be a pedant, because this is the heart of today.",
              "A valid signature proves precisely this: someone holding the secret key approved these exact bytes.",
              "Every word in that sentence is doing a job, and nothing may be added to it.",
              { s: "Now the other column, the things people assume and the mathematics never said.", g: "weigh" },
              { s: "It does not prove who they are, because a key has no name, no face and no passport.", g: "count" },
              "It does not prove when, because a signature carries no clock, and one made today looks just like one made a year ago.",
              "And it does not prove that they meant it."
            ] },
          { at: "centre", g: "open",
            say: [
              "A key cannot tell a willing hand from a forced one.",
              "It cannot tell its owner from a thief who copied it, or from a virus that quietly changed the payment on the screen.",
              { s: "The mathematics sees one thing only: the secret key was used.", g: "pinch" },
              { s: "So in this system whoever holds the key holds the coins, and there is no desk to appeal to.", g: "rest" },
              "That is a great deal of freedom and a great deal of responsibility, and lecture 11 is about carrying it.",
              "The missing clock matters too: putting events in order is a separate job, and it belongs to the chain."
            ] },
          { say: ["Here is the question I most want you to get right today.", "What does a valid digital signature prove?"],
            quiz: {
              q: "What does a valid digital signature prove?",
              options: [
                "That the signer was willing and understood it",
                "That a holder of the secret key approved these bytes",
                "The signer's real name and identity",
                "The date and time the message was signed"
              ],
              answer: 1,
              right: ["Exactly that and nothing more: the key was used, on these exact bytes."],
              wrong: [
                ["The mathematics cannot see willingness, or tell an owner from a thief.", "It proves only that someone holding the secret key approved these exact bytes."],
                null,
                ["A key carries no name, and anyone may make as many keys as they like.", "A signature proves only that someone holding the secret key approved these exact bytes."],
                ["A signature has no clock in it, so it says nothing about when.", "It proves only that someone holding the secret key approved these exact bytes."]
              ]
            } }
        ] },

      { id: "ecdsa-and-schnorr", title: "Two Recipes: ECDSA and Schnorr", topics: ["ecdsa", "schnorr signatures", "bip 340", "signature size", "schnorr patent", "combining keys", "nonce"],
        beats: [
          { slide: { k: "section", title: "Two Recipes: ECDSA and Schnorr", sub: "The same curve, signed two ways" },
            at: "lectern", g: "open",
            say: [
              "There is more than one recipe for making a signature on a curve, and Bitcoin has used two.",
              "The first is called ECDSA, the Elliptic Curve Digital Signature Algorithm.",
              "It is the recipe Bitcoin launched with in 2009, and most of the signatures ever written to the chain are ECDSA.",
              "The second is named after the German mathematician Claus Schnorr, who published it in 1989.",
              { s: "The curious thing is that Schnorr's recipe is the older of the two, and the simpler.", g: "shrug" }
            ] },
          { slide: { k: "figure", title: "Inside a signature, in Schnorr's form", ops: [
              { text: "1  a fresh random number, used once", x: 4, y: 5, size: 4, c: "grey", at: 1 },
              { box: [4, 9, 30, 11], t: "nonce r", c: "red", at: 1 },
              { arrow: [35, 14.5, 52, 14.5], at: 2 },
              { box: [54, 9, 46, 11], t: "point R = r x G", c: "green", at: 2 },
              { text: "safe to publish", x: 104, y: 14.5, size: 3.8, c: "grey", at: 2 },
              { text: "2  blend three things into one number", x: 4, y: 27, size: 4, c: "grey", at: 4 },
              { box: [4, 31, 30, 11], t: "nonce r", c: "red", at: 4 },
              { text: "+", x: 38, y: 36.5, a: "c", size: 6, at: 4 },
              { box: [42, 31, 50, 11], t: "key x fingerprint", at: 4 },
              { arrow: [93, 36.5, 108, 36.5], at: 4 },
              { box: [110, 31, 30, 11], t: "number s", c: "amber", fill: true, at: 4 },
              { text: "signature = ( R , s )", x: 4, y: 50, size: 5, c: "amber", at: 5 },
              { text: "3  anyone can check that it balances on the curve", x: 4, y: 59, size: 4, c: "green", at: 6 }
            ] },
            at: "screen", g: "point",
            say: [
              "Both recipes move in the same three steps, so let me show you the shape and leave the algebra in the readings.",
              "First, the signer picks a brand new random number, for this one signature and never again.",
              "It is hopped along the curve exactly as a key is, which gives a point, R, that is safe to publish.",
              "Cryptographers call that one-time number a nonce, which you can remember as a number used once.",
              "Second, the signer blends three things into a single number, s: the nonce, the secret key and the message's fingerprint.",
              "The signature is the pair, R and s.",
              "Third, anyone can check on the curve that R, s, the message and the public key all balance.",
              { s: "The nonce is the disguise: it hides the secret key inside s, the way one unknown hides another in a sum.", g: "pinch" }
            ] },
          { slide: { k: "table", title: "ECDSA and Schnorr, side by side", start: 0, head: ["Question", "ECDSA", "Schnorr (BIP 340)"], rows: [
              ["In Bitcoin since", "2009, the first release", "November 2021"],
              ["Signature size", "up to 72 bytes", "exactly 64 bytes"],
              ["Public key beside it", "33 bytes", "32 bytes"],
              ["Proof of security", "needs more assumptions", "needs fewer"],
              ["Outsiders can flip it", "yes, to a second form", "no"],
              ["Combining signers", "awkward", "plain addition"]
            ], note: "Sizes and security claims as given in BIP 340's Motivation." },
            at: "lectern", g: "open",
            say: [
              "Here are the two, side by side.",
              { s: "ECDSA has been in Bitcoin since the first release, and Schnorr signatures arrived in November 2021, in an upgrade called taproot that lecture 5 will open up.", show: 1 },
              { s: "A Schnorr signature is smaller: exactly 64 bytes against as many as 72, and the key that travels beside it is a byte shorter too.", show: 3 },
              { s: "Schnorr's recipe comes with a cleaner argument that forging a signature is as hard as running the curve backwards.", show: 4 },
              { s: "An outsider can flip an ECDSA signature into a second valid form, approving the very same bytes, and that quirk caused years of nuisance.", show: 5 },
              { s: "And Schnorr's sums are plain additions, so several signers can combine their keys and signatures into one, which lecture 5 will put to use.", show: 6, g: "count" }
            ] },
          { slide: { k: "points", title: "Why Bitcoin began with ECDSA", start: 0, points: [
              "1989: Schnorr publishes his recipe, and patents it",
              "1990s: the patent keeps it out of the standards",
              "2009: Bitcoin launches with ECDSA, the tool on the shelf",
              "2020: BIP 340 specifies Schnorr signatures for Bitcoin's curve",
              "2021: Schnorr signatures go live, alongside ECDSA"
            ] },
            at: "centre", g: "open",
            say: [
              "So why did Bitcoin not begin with the tidier recipe?",
              { s: "Schnorr patented his method, and the patent stood for about twenty years, into the time Bitcoin was being written.", show: 2 },
              "Through those years the standards, and the free software toolkits built on them, offered ECDSA and not Schnorr.",
              { s: "So in 2009, ECDSA was the tool on the shelf: widely used, well tested and ready.", show: 3 },
              { s: "The specification for Bitcoin's Schnorr signatures is BIP 340, a Bitcoin Improvement Proposal, by Pieter Wuille, Jonas Nick and Tim Ruffing.", show: 4 },
              "Its opening section is one of your readings, and it is a model of careful engineering.",
              { s: "Both recipes are valid today, on the same curve and with the same kind of key.", show: 5, g: "weigh" }
            ] }
        ] },

      { id: "nonce-reuse", title: "The Number You Must Never Repeat", topics: ["nonce", "random numbers", "nonce reuse", "playstation 3", "android securerandom", "rfc 6979", "deterministic nonces"],
        beats: [
          { slide: { k: "section", title: "The Number You Must Never Repeat", sub: "One small random number, two expensive lessons" },
            at: "lectern", g: "open",
            say: [
              "I said the nonce is used once and never again, and I owe you the reason.",
              { s: "It is the most dangerous detail in this whole lecture.", g: "lean" },
              "The curve can be sound and the recipe can be sound, and you can still lose everything through this one small number.",
              "Let me show you why on the board, with nothing harder than school algebra."
            ] },
          { board: { clear: true, title: "Two unknowns, then one", ops: [
              { text: "s = nonce + key x fingerprint", x: 80, y: 22, a: "c", size: 6, at: 1 },
              { text: "seen: s, fingerprint", x: 20, y: 33, size: 4.5, c: "green", at: 2 },
              { text: "hidden: nonce, key", x: 92, y: 33, size: 4.5, c: "red", at: 2 },
              { text: "1 equation, 2 unknowns: safe", x: 80, y: 42, a: "c", size: 5, c: "green", at: 3 },
              { text: "s1 = nonce + key x f1", x: 24, y: 54, size: 5.5, at: 4 },
              { text: "s2 = nonce + key x f2", x: 24, y: 63, size: 5.5, at: 4 },
              { text: "same nonce!", x: 112, y: 58.5, size: 5, c: "red", at: 4 },
              { line: [22, 68, 100, 68], at: 5 },
              { text: "s1 - s2 = key x (f1 - f2)", x: 24, y: 74, size: 5.5, at: 5 },
              { text: "key = (s1 - s2) / (f1 - f2)", x: 24, y: 84, size: 6, c: "red", at: 6 }
            ] },
            say: [
              "Here is a signature's second number, in the simplified shape of Schnorr's recipe.",
              "The number s is the nonce, plus the secret key multiplied by the message's fingerprint.",
              "An eavesdropper sees s and can work out the fingerprint, but the nonce and the key are both hidden.",
              "One equation with two unknowns cannot be solved, and that is the whole of the disguise.",
              "Now suppose the signer uses the same nonce again, on a second message.",
              "Subtract one line from the other, and the nonce drops out.",
              "What is left has a single unknown, the secret key, and any computer can solve it before you have finished blinking.",
              "ECDSA arranges its sum a little differently, and it falls in exactly the same way."
            ] },
          { slide: { k: "points", title: "The rule of the nonce", start: 0, points: [
              "Fresh for every signature, with no exceptions",
              "Unpredictable: a guessable nonce is a leaked key",
              "Secret for ever, exactly as secret as the key",
              "Two signatures with one nonce: the key is public"
            ] },
            at: "centre", g: "count",
            say: [
              { s: "So the rule has three parts, and the first is that the nonce must be fresh for every single signature.", show: 1 },
              { s: "It must be unpredictable, because anyone who can guess it can undo the disguise just as easily.", show: 2 },
              { s: "And it must stay secret afterwards, exactly as secret as the key itself.", show: 3 },
              { s: "Break the rule once, and two signatures that share a nonce announce your secret key to the world.", show: 4, g: "chop" },
              { s: "Nothing warns you, either, because both signatures are perfectly valid and check out fine.", g: "lean" },
              "Now for the people who found this out the hard way."
            ] },
          { slide: { k: "figure", title: "PlayStation 3: one nonce for everything", ops: [
              { box: [4, 5, 36, 11], t: "program A" },
              { arrow: [41, 10.5, 52, 10.5] },
              { box: [54, 5, 22, 11], t: "R", c: "red", fill: true },
              { box: [78, 5, 22, 11], t: "s1" },
              { box: [4, 22, 36, 11], t: "program B" },
              { arrow: [41, 27.5, 52, 27.5] },
              { box: [54, 22, 22, 11], t: "R", c: "red", fill: true },
              { box: [78, 22, 22, 11], t: "s2" },
              { text: "the same R, every time", x: 106, y: 19, size: 4.5, c: "red", at: 3 },
              { arrow: [65, 34, 65, 41], c: "red", at: 4 },
              { box: [26, 42, 78, 12], t: "Sony's secret signing key", c: "amber", fill: true, at: 4 }
            ], note: "fail0verflow, Console Hacking 2010, 27th Chaos Communication Congress, 29 December 2010" },
            at: "screen", g: "point",
            say: [
              "The PlayStation 3 would only run programs that carried a valid ECDSA signature from Sony.",
              "Sony's secret key never left the company, so on paper the console was locked for good.",
              "In December 2010, at a hackers' congress in Berlin, a group called fail0verflow showed what Sony had actually done.",
              "Every signature used the same nonce: the random number was not random at all, it was a constant.",
              "Two signed programs were enough to do the subtraction I just drew, and out came Sony's secret signing key.",
              { s: "No break-in, no stolen laptop and no flaw in the curve: just one number, used twice.", g: "pinch" },
              "And a key that has been published cannot be called back."
            ] },
          { slide: { k: "points", title: "Android, August 2013", start: 0, points: [
              "The phone's source of random numbers was flawed",
              "Some wallets signed twice with the same nonce",
              "The ledger is public, so the repeats were on display",
              "About 55 bitcoins were taken before the fixes arrived"
            ], note: "bitcoin.org alert, 11 August 2013; Android Developers Blog, 14 August 2013" },
            at: "right", g: "open",
            say: [
              "The second story is Bitcoin's own.",
              { s: "In August 2013 it emerged that the part of Android which supplies random numbers to apps was not being set up properly.", show: 1 },
              { s: "Bitcoin wallet apps on those phones, the programs that hold keys and sign, asked for a fresh nonce each time, and now and then were handed a repeat.", show: 2 },
              { s: "Remember that the ledger is public, so every signature ever made is on display, and a repeated R is easy to spot.", show: 3 },
              "Somebody wrote a program to look for exactly that.",
              { s: "By the reports of the time, about 55 bitcoins were swept out of ordinary people's wallets.", show: 4 },
              "The wallet makers shipped fixes within days, and Google confirmed the flaw and issued patches for Android.",
              { s: "Notice that the victims did nothing wrong, and neither did the mathematics: the randomness underneath them failed.", g: "shrug" }
            ] },
          { slide: { k: "compare", title: "Two ways to choose a nonce",
              left: { head: "Roll dice each time", points: ["Needs a good source of randomness", "A weak source fails silently", "The PS3 and Android failures"] },
              right: { head: "Derive it by hashing", points: ["Hash the secret key with the message", "Same message, same nonce", "New message, unrelated nonce", "Nothing to roll, nothing to repeat"] } },
            at: "left", g: "weigh",
            say: [
              "The lasting fix is rather beautiful, and it uses last lecture's tool.",
              "Instead of rolling dice for each nonce, the wallet makes it from a fingerprint of the secret key and the message together.",
              "The same message always gives the same nonce, and so the same signature, which is harmless.",
              "A different message gives a completely different nonce, and nobody without the key can predict it.",
              "A published recipe for doing this with ECDSA, known as RFC 6979, was published in August 2013, the very month of the Android thefts.",
              "BIP 340 builds the idea in from the start, and stirs in fresh randomness as well wherever it is available.",
              { s: "The lesson travels far beyond Bitcoin: a system is only as strong as its dullest ingredient.", g: "up" }
            ] },
          { say: ["Let me see whether the danger is clear.", "What happens if one key signs two messages with the same nonce?"],
            quiz: {
              q: "What happens if one key signs two messages with the same nonce?",
              options: [
                "The second signature merely comes out longer",
                "Both signatures fail to verify",
                "Nothing: the nonce is only a formality",
                "Anyone can work out the secret key"
              ],
              answer: 3,
              right: ["Yes: the nonce cancels out, and the secret key is left in plain view."],
              wrong: [
                ["A repeated nonce does not make a signature longer, and nothing looks wrong at all.", "The shared nonce cancels out, and anyone can then work out the secret key."],
                ["Both signatures verify perfectly, which is what makes the mistake so quiet.", "The shared nonce cancels out, and anyone can then work out the secret key."],
                ["The nonce is the disguise that hides the key inside the signature.", "Use it twice and it cancels out, so anyone can work out the secret key."],
                null
              ]
            } }
        ] },

      { id: "addresses", title: "An Address Is a Fingerprint", topics: ["address", "public key hash", "ripemd-160", "checksum", "address reuse", "summary", "next lecture"],
        beats: [
          { slide: { k: "section", title: "An Address Is a Fingerprint", sub: "Where lecture 2 and lecture 3 meet" },
            at: "lectern", g: "open",
            say: [
              "One piece is left, and it joins today to last time.",
              "When someone pays you in Bitcoin, you do not usually hand them your public key.",
              "You hand them an address, a shorter string of letters and digits.",
              { s: "And in its most common forms, an address is simply a fingerprint of your public key.", g: "pinch" }
            ] },
          { board: { clear: true, title: "From a secret to an address", ops: [
              { box: [8, 20, 46, 14], t: "secret key", c: "red", at: 1 },
              { text: "256 bits, random", x: 31, y: 39, a: "c", size: 4, c: "grey", at: 1 },
              { arrow: [56, 27, 92, 27], at: 2 },
              { text: "the curve", x: 74, y: 22, a: "c", size: 4, at: 2 },
              { box: [94, 20, 48, 14], t: "public key", c: "green", at: 2 },
              { text: "33 bytes", x: 118, y: 39, a: "c", size: 4, c: "grey", at: 2 },
              { arrow: [118, 44, 118, 56], at: 3 },
              { text: "SHA-256, RIPEMD-160", x: 122, y: 50, size: 3.5, at: 3 },
              { box: [84, 58, 62, 14], t: "20-byte fingerprint", c: "blue", at: 4 },
              { arrow: [82, 65, 56, 65], at: 5 },
              { box: [8, 58, 46, 14], t: "address", c: "amber", at: 5 },
              { text: "easy to copy, self-checking", x: 31, y: 77, a: "c", size: 3.5, c: "grey", at: 5 },
              { text: "every arrow: one way only", x: 104, y: 84, a: "c", size: 5, c: "red", at: 6 }
            ] },
            say: [
              "Let me draw the whole chain, from the secret to the address.",
              "You begin with the secret key, a random number of 256 bits.",
              "The curve turns it into the public key, which takes 33 bytes to write down in its compact form.",
              "The public key goes through SHA-256, the machine from last time, and then through a second hash function called RIPEMD-160.",
              "Out comes a fingerprint of 20 bytes, which is 160 bits.",
              "Spell that fingerprint in a form that is easy to copy and can catch a typing slip, and you have an address.",
              "Every arrow on this board runs one way only, so an address gives away neither the key behind it nor the secret behind that."
            ] },
          { slide: { k: "code", title: "A real example: the secret key 1", start: 0, lines: [
              "# the worst secret key in the world",
              "secret key   1",
              "",
              "# one hop from G: the public key is G itself",
              "public key   02 79BE667E F9DCBBAC ... 16F81798",
              "",
              "# SHA-256, then RIPEMD-160",
              "fingerprint  751e76e8 199196d4 ... f1433bd6",
              "",
              "# spelled out as an address",
              "address      bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
            ], note: "A published test vector (BIP 173). Never send anything to this address." },
            at: "screen", g: "point",
            say: [
              "Here is a real one, and you can check every line of it yourself.",
              { s: "Take the worst secret key imaginable: the number one.", show: 2 },
              { s: "With the secret key 1 you never leave the start, so the public key is G itself.", show: 5 },
              { s: "Put it through the two hash functions, and you get this fingerprint.", show: 8 },
              { s: "Spell the fingerprint out, and you get this address.", show: 11 },
              "It is a real address, and over the years people have sent coins to it more than a hundred times.",
              { s: "Every one of those coins has been taken, because the whole world knows the secret.", g: "shrug" },
              "A key is only as good as the randomness it was chosen with, which is today's lesson a second time."
            ] },
          { slide: { k: "points", title: "Why a fingerprint, and not the key?", start: 0, points: [
              "Shorter to write, to share and to store",
              "A built-in check catches typing mistakes",
              "The key stays unseen until the coin is spent",
              "A new key pair for each payment keeps payments apart"
            ] },
            at: "left", g: "count",
            say: [
              "Why bother with the extra step?",
              { s: "A fingerprint is shorter than a key, which matters when every byte on the ledger is stored by everyone.", show: 1 },
              { s: "The spelled-out form carries a few check characters, so a mistyped address is refused instead of swallowing your money.", show: 2 },
              { s: "And the public key itself stays out of sight until the day you spend, when you must show it so that your signature can be checked.", show: 3 },
              { s: "Since keys cost nothing to make, the whitepaper advises a new key pair for every payment, so that your payments are not all tied to one owner.", show: 4 },
              "The newest kind of address carries a public key directly, with no fingerprint in between, and lecture 5 will explain why."
            ] },
          { say: ["One last check, and it joins the two lectures.", "What is a classic Bitcoin address?"],
            quiz: {
              q: "What is a classic Bitcoin address?",
              options: [
                "A fingerprint of a public key",
                "The secret key, written in a shorter form",
                "The owner's name, put into code",
                "An account number issued by the network"
              ],
              answer: 0,
              right: ["Right: the public key, hashed, and spelled so that it is easy to copy."],
              wrong: [
                null,
                ["If an address were the secret key, anyone you asked to pay you could rob you instead.", "An address is a fingerprint of the public key, and the secret key never appears."],
                ["There are no names anywhere in the system.", "An address is a fingerprint of a public key, and a key has no name attached."],
                ["Nobody issues anything here, and there are no accounts to number.", "You make an address yourself: it is a fingerprint of your own public key."]
              ]
            } },
          { slide: { k: "points", title: "Today, in five lines", start: 0, points: [
              "A key pair: a secret number, and a public point made from it",
              "secp256k1: quick to hop forwards, hopeless to count back",
              "A signature: the secret key approved these exact bytes",
              "Not proved: who, when, or whether they meant it",
              "A nonce is used once; an address is a key's fingerprint"
            ] },
            at: "lectern", g: "count",
            say: [
              "Let me gather today into five lines.",
              { s: "A key pair is a secret number and a public point made from it, with no road back.", show: 1 },
              { s: "The road is a curve, where hopping forwards is quick and counting the hops is hopeless.", show: 2 },
              { s: "A signature proves that someone holding the secret key approved these exact bytes.", show: 3 },
              { s: "It does not prove who they are, when they signed or whether they meant it.", show: 4 },
              { s: "The nonce inside a signature must never repeat, and an address is a fingerprint of a public key.", show: 5 }
            ] },
          { slide: { k: "figure", title: "Next time: coins are outputs", ops: [
              { box: [4, 10, 58, 16], t: "5 coins, locked to A", at: 2 },
              { arrow: [64, 18, 96, 18], t: "A signs", at: 3 },
              { box: [98, 10, 58, 16], t: "5 coins, locked to B", c: "green", at: 3 },
              { text: "no accounts, no balances", x: 80, y: 40, a: "c", size: 5, at: 2 },
              { text: "what exactly does the signature approve?", x: 80, y: 52, a: "c", size: 4.5, c: "amber", at: 3 }
            ] },
            at: "centre", g: "open",
            say: [
              "We now have both tools on the bench: fingerprints from lecture 2, and keys and signatures from today.",
              "Next time we finally open the ledger itself, and it may surprise you.",
              "It holds no accounts and no balances, only coins locked to keys, waiting for signatures.",
              "We will take one real transaction apart, byte by byte, and see exactly what a signature approves.",
              "Before then, read section 2 of the whitepaper again, and the opening of BIP 340.",
              "That is lecture 4, Coins Are Outputs.",
              { s: "Thank you, and I will see you there.", g: "up" }
            ] }
        ] }
    ]
  });
})();
