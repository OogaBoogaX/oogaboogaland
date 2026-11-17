// Bitcoin from First Principles, lecture 2: what a hash function is (any data in, a fixed-size fingerprint out), its three promises (scrambling, one-way, no twins found), SHA-256 with the lid closed and Bitcoin's double hash, commitments, Merkle trees and their short proofs, and a hash puzzle as provable work, picking up hashcash from lecture 1. Every fingerprint shown is real SHA-256 output.
(() => {
  "use strict";
  window.BL.lectures.add({
    id: "btc-02", course: "first-principles", n: 2, title: "Fingerprints: Hash Functions",
    reading: [
      { title: "Bitcoin whitepaper, sections 3, 4, 7 and 8", by: "Satoshi Nakamoto, 2008" },
      { title: "Hashcash: A Denial of Service Counter-Measure", by: "Adam Back, 2002" },
      { title: "Protocols for Public Key Cryptosystems", by: "Ralph Merkle, 1980" }
    ],
    sources: [
      "NIST, FIPS 180-4: Secure Hash Standard (2015), https://csrc.nist.gov/pubs/fips/180-4/upd1/final and https://doi.org/10.6028/NIST.FIPS.180-4",
      "NIST, FIPS 180-2: Secure Hash Standard (August 2002), the first standard to include SHA-256, https://csrc.nist.gov/pubs/fips/180-2/final",
      "Ralph Merkle, Secrecy, Authentication, and Public Key Systems (Stanford thesis, June 1979), https://www.ralphmerkle.com/papers/Thesis1979.pdf",
      "Ralph Merkle, Protocols for Public Key Cryptosystems, 1980 IEEE Symposium on Security and Privacy, https://dblp.org/rec/conf/sp/Merkle80",
      "Ralph Merkle, Method of providing digital signatures, US patent 4,309,569 (granted 5 January 1982), https://patents.google.com/patent/US4309569A/en",
      "Satoshi Nakamoto, Bitcoin: A Peer-to-Peer Electronic Cash System (2008), sections 3, 4, 7 and 8, https://bitcoin.org/bitcoin.pdf and https://nakamotoinstitute.org/library/bitcoin/",
      "Adam Back, Hashcash: A Denial of Service Counter-Measure (2002), http://www.hashcash.org/papers/hashcash.pdf, with https://en.wikipedia.org/wiki/Hashcash for the 1997 proposal and the 20-bit stamp",
      "Bitcoin developer reference, Block Chain (block headers, merkle trees, the target), https://developer.bitcoin.org/reference/block_chain.html",
      "Bitcoin Wiki, Genesis block, https://en.bitcoin.it/wiki/Genesis_block",
      "Wang, Feng, Lai and Yu, Collisions for Hash Functions MD4, MD5, HAVAL-128 and RIPEMD (2004), https://eprint.iacr.org/2004/199",
      "Stevens, Bursztein, Karpman, Albertini and Markov, The first collision for full SHA-1 (2017), https://shattered.io/",
      "Manuel Blum, Coin Flipping by Telephone (CRYPTO 81), https://www.iacr.org/cryptodb/data/paper.php?pubkey=917",
      "The fingerprints, bit counts and puzzle results shown were computed for this lecture with SHA-256 and can be reproduced on any computer"
    ],
    sections: [
      { id: "what-is-a-hash", title: "A Fingerprint for Data", topics: ["hash function", "fingerprint", "digest", "fixed size output", "256 bits", "hexadecimal"],
        beats: [
          { slide: { k: "title", kicker: "Lecture 2", title: "Fingerprints: Hash Functions", sub: "SHA-256, commitments, Merkle trees and provable work" },
            at: "lectern", g: "open",
            say: [
              "Welcome back to Bitcoin from First Principles.",
              "Last time we were left with a problem: a ledger held by strangers, with no keeper to vouch for it.",
              "I ended with a promise, that today we would pick up the first tool, a fingerprint for data.",
              { s: "It is the humblest part of the whole machine, and almost every other part leans on it.", g: "lean" },
              "By the end of today you will have seen it do four quite different jobs.",
              "And as before, nothing I say needs to be taken on trust, because you can run every example yourself."
            ] },
          { slide: { k: "points", title: "Today: one tool, four jobs", start: 0, points: [
              "The tool: a hash function, a fingerprint for data",
              "Job 1: notice when anything has been changed",
              "Job 2: commit to something now, reveal it later",
              "Job 3: prove one item belongs to a huge set",
              "Job 4: prove that work was done"
            ] },
            at: "centre", g: "count",
            say: [
              { s: "The tool is called a hash function, and we will spend the first part of today getting to know it.", show: 1 },
              { s: "Its first job is to notice tampering, so that nobody can quietly alter a record.", show: 2 },
              { s: "Its second is to let you commit to something today and reveal it later.", show: 3 },
              { s: "Its third is to prove that one item belongs to an enormous set, without showing the whole set.", show: 4 },
              { s: "And its fourth is to prove that somebody did a great deal of work, which is where hashcash comes back.", show: 5 }
            ] },
          { slide: { k: "figure", title: "Any data in, one short fingerprint out", ops: [
              { box: [68, 18, 28, 24], t: "hash", c: "blue", fill: true },
              { box: [4, 2, 40, 9], t: "one word", at: 1 },
              { arrow: [46, 7, 66, 24], at: 1 },
              { box: [4, 16, 40, 13], t: "a whole book", at: 2 },
              { arrow: [46, 23, 66, 30], at: 2 },
              { box: [4, 34, 40, 18], t: "a film", at: 2 },
              { arrow: [46, 43, 66, 36], at: 2 },
              { text: "any size at all", x: 24, y: 58, a: "c", size: 4, c: "grey", at: 2 },
              { arrow: [98, 30, 110, 30], at: 3 },
              { box: [112, 23, 44, 14], t: "fingerprint", c: "green", at: 3 },
              { text: "always the same size", x: 134, y: 44, a: "c", size: 4, c: "green", at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "A hash function is a machine with one slot going in and one coming out.",
              "Into the slot you can feed a single word.",
              "You can feed it a whole book, or a film, or every email you have ever written.",
              "Out comes a short string of digits, which I am going to call the fingerprint.",
              { s: "And whatever you fed in, the fingerprint is always exactly the same size.", g: "pinch" },
              "The proper names are a hash, or a digest, and you will hear all three.",
              "I like fingerprint best, because a fingerprint is tiny, it picks out one person, and you cannot rebuild the person from it."
            ] },
          { slide: { k: "code", title: "A real one: SHA-256", start: 0, lines: [
              "$ sha256 \"hello\"",
              "2cf24dba5fb0a30e26e83b2ac5b9e29e",
              "1b161e5c1fa7425e73043362938b9824",
              "",
              "$ sha256 \"\"      # nothing at all",
              "e3b0c44298fc1c149afbf4c8996fb924",
              "27ae41e4649b934ca495991b7852b855"
            ], note: "Real output. Each fingerprint is 64 characters, split over two lines here." },
            at: "left", g: "open",
            say: [
              { s: "Here is a real one, from the machine Bitcoin uses, which is called SHA-256.", show: 3 },
              "I fed in the five letters of hello, and this came out.",
              "It is 64 characters long, using the digits 0 to 9 and the letters a to f.",
              "That is simply one very large number, written in a compact notation called hexadecimal.",
              { s: "Now watch what happens when I feed the machine nothing at all, an empty message.", show: 7 },
              "Still 64 characters, and it looks every bit as busy as the first.",
              "Feed it the complete works of Shakespeare, and you would get 64 characters again."
            ] },
          { slide: { k: "number", value: "256 bits", label: "the size of every SHA-256 fingerprint, whatever went in", note: "256 ones and zeros, usually written as 64 characters" },
            at: "centre", g: "open",
            say: [
              "That is where the 256 in the name comes from.",
              "A bit is a single one or zero, and every SHA-256 fingerprint is exactly 256 of them.",
              "Each of those 64 characters stands for four bits, and 64 times four is 256.",
              { s: "So a fingerprint is small enough to read aloud, print on a receipt or paint on a wall.", g: "pinch" },
              "The interesting question is what such a small thing can tell you about the large thing it came from.",
              "The answer depends on three promises the machine makes."
            ] }
        ] },

      { id: "three-promises", title: "Three Promises", topics: ["avalanche effect", "one-way", "preimage", "collision", "deterministic", "tamper-evident", "properties of a hash"],
        beats: [
          { slide: { k: "section", title: "Three Promises", sub: "Scrambled, one-way, and no twins" },
            at: "lectern", g: "open",
            say: [
              "Before the promises, one thing that is not a promise but a plain fact.",
              "The machine has no dice in it: the same input gives the same fingerprint, on any computer, today or in fifty years.",
              { s: "If you and I hash the same file, we get the same 64 characters, and that is what makes them worth comparing.", g: "weigh" },
              "Everything interesting comes from what happens when the inputs are different."
            ] },
          { slide: { k: "code", title: "Promise one: change one character", start: 1, lines: [
              "$ sha256 \"pay Ada 5 coins\"",
              "f0c38aa52d8c50e8dfdca8b04c70c52e",
              "2292c5bf7dbfadcd88b8f58e2aa2fa7b",
              "",
              "$ sha256 \"pay Ada 6 coins\"",
              "4ab0b468aad3325991794eff5a763f12",
              "c46fbc8306f505bf0e1eb0b69648d4f9"
            ], note: "Real SHA-256 output. Of the 256 bits, 136 differ." },
            at: "screen", g: "point",
            say: [
              "Promise one: change the input a little, and the fingerprint changes completely.",
              { s: "Last time I drew you a payment, pay Ada 5 coins, with a made-up fingerprint, so here is its real one.", show: 3 },
              { s: "Now I change a single character, the 5 to a 6.", show: 5 },
              { s: "And the new fingerprint has nothing visibly in common with the old one.", show: 7 },
              "I counted: of the 256 bits, 136 are different, which is about half.",
              { s: "Half is exactly what you would expect if the second fingerprint had been drawn out of a hat.", g: "shrug" },
              "So a fingerprint gives no hint of nearness: similar inputs do not have similar fingerprints."
            ] },
          { at: "centre", g: "open",
            say: [
              "This is already the first of our four jobs, and it deserves a moment.",
              "Suppose I publish the fingerprint of a long document, say a ledger with a million lines.",
              "If anyone alters one digit on one line, the fingerprint of their version will not match mine.",
              { s: "You do not have to compare a million lines; you compare 64 characters.", g: "pinch" },
              "The fingerprint does not prevent tampering, but it makes tampering impossible to hide, and we call that tamper-evident."
            ] },
          { say: ["Let me check that the first promise has landed.", "If you change one letter of a long document, what happens to its fingerprint?"],
            quiz: {
              q: "Change one letter of a long document: what happens to its fingerprint?",
              options: [
                "Only its last few characters change",
                "It gets one character longer",
                "It changes completely, with no visible pattern",
                "Nothing, if the document is long enough"
              ],
              answer: 2,
              right: ["Yes: about half the bits flip, wherever the change was made."],
              wrong: [
                ["A small change does not stay in one corner of the fingerprint.", "The whole fingerprint changes, with about half of its bits flipping."],
                ["The length never changes, because every SHA-256 fingerprint is 256 bits.", "What changes is the content: the whole fingerprint comes out different."],
                null,
                ["Length gives no shelter, because every bit of the input feeds the fingerprint.", "One changed letter anywhere gives a completely different fingerprint."]
              ]
            } },
          { slide: { k: "figure", title: "Promise two: one way only", ops: [
              { box: [6, 12, 44, 14], t: "pay Ada 5 coins" },
              { arrow: [52, 15, 98, 15], c: "green", at: 1 },
              { text: "an instant", x: 75, y: 10, a: "c", size: 4, c: "green", at: 1 },
              { box: [100, 12, 56, 14], t: "f0c38aa5...2aa2fa7b", size: 4, c: "blue", mono: true, at: 1 },
              { arrow: [98, 23, 52, 23], c: "red", dash: true, at: 2 },
              { text: "no way back", x: 75, y: 28, a: "c", size: 4, c: "red", at: 2 },
              { text: "the only method: guess an input, hash it, compare", x: 80, y: 46, a: "c", size: 4.5, at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "Promise two: the machine only runs forwards.",
              "Going from data to fingerprint takes a computer about a millionth of a second.",
              { s: "Going from a fingerprint back to the data that made it cannot practically be done.", g: "chop" },
              "Stirring milk into coffee takes a moment, and nobody has ever stirred it back out.",
              "The only known method is to guess an input, hash it, and see whether you got lucky."
            ] },
          { slide: { k: "number", value: "78 digits", label: "the length of the number of possible SHA-256 fingerprints", note: "2 to the power 256, which is about 1.16 x 10^77" },
            at: "right", g: "open",
            say: [
              "And how many fingerprints are there to hit?",
              "The count is a number 78 digits long, roughly a one followed by 77 zeros.",
              { s: "Guess a billion billion times a second, and the universe will have grown old long before you can expect a hit.", g: "wide" },
              "So one-way is not a law of nature; it is a wager on a number too large to search."
            ] },
          { board: { clear: true, title: "Promise three: no twins", ops: [
              { ellipse: [34, 46, 26, 30], at: 1 },
              { text: "inputs: endless", x: 34, y: 84, a: "c", size: 4.5, at: 1 },
              { ellipse: [126, 46, 16, 20], c: "blue", at: 2 },
              { text: "fingerprints: fixed", x: 126, y: 84, a: "c", size: 4.5, c: "blue", at: 2 },
              { circle: [30, 34, 1.5], fill: true, at: 3 },
              { circle: [36, 58, 1.5], fill: true, at: 3 },
              { arrow: [33, 34, 122, 45], c: "red", at: 3 },
              { arrow: [39, 58, 122, 47], c: "red", at: 3 },
              { circle: [126, 46, 2], c: "red", fill: true, at: 3 },
              { text: "twins must exist", x: 80, y: 19, a: "c", size: 5, c: "red", at: 3 },
              { text: "nobody has found one", x: 80, y: 74, a: "c", size: 5, c: "green", at: 5 }
            ] },
            say: [
              "Promise three takes a drawing.",
              "On the left is everything you could ever feed the machine, and it has no end.",
              "On the right is the set of possible fingerprints, which is enormous but fixed.",
              "So somewhere there must be two different inputs that share a fingerprint, and such a pair is called a collision.",
              "It is the old pigeonhole argument: more letters than pigeonholes, so some hole holds two.",
              { s: "The promise is not that twins do not exist; it is that nobody can find them.", g: "pinch" },
              "For SHA-256, in more than twenty years of trying, nobody ever has."
            ] },
          { slide: { k: "table", title: "Three promises, in plain words", head: ["Promise", "What it means"], rows: [
              ["Scrambling", "a tiny change alters everything"],
              ["One-way", "no path from fingerprint to data"],
              ["No twins found", "no two inputs, one fingerprint"]
            ] },
            at: "right", g: "count",
            say: [
              "So here are the three promises side by side.",
              "A tiny change scrambles everything, the machine cannot be run backwards, and no two inputs have been found with one fingerprint.",
              "Cryptographers call these the avalanche effect, preimage resistance and collision resistance, should you want to look them up.",
              { s: "Put them together, and a fingerprint can stand in for its data: if two fingerprints match, you may treat the data as identical.", g: "weigh" },
              "One honest caveat before we go on.",
              "One-way only protects an input that is hard to guess, and I will show you that trap when we reach the sealed envelope."
            ] }
        ] },

      { id: "sha-256", title: "SHA-256, Lid Closed", topics: ["sha-256", "sha-2", "nist", "secure hash standard", "double hashing", "sha-1", "md5", "broken hash functions"],
        beats: [
          { slide: { k: "section", title: "SHA-256, Lid Closed", sub: "Where it came from, and why Bitcoin runs it twice" },
            at: "lectern", g: "open",
            say: [
              "So much for hash functions in general; now for the particular one Bitcoin chose.",
              "SHA stands for Secure Hash Algorithm, and SHA-256 belongs to a family called SHA-2.",
              "It was designed at the United States National Security Agency and first published in 2001.",
              "The following year the United States government's standards agency, NIST, adopted it as a federal standard.",
              "The current edition of that standard is called FIPS 180-4, and it is free for anyone to read.",
              { s: "I am going to keep the lid on the machine today, but I want you to know there is no secret under it.", g: "lean" }
            ] },
          { slide: { k: "figure", title: "Inside, in one breath", ops: [
              { box: [4, 20, 28, 14], t: "message" },
              { arrow: [34, 27, 42, 27], at: 1 },
              { box: [44, 20, 34, 14], t: "pad and cut", c: "grey", at: 1 },
              { text: "512-bit chunks", x: 61, y: 40, a: "c", size: 3.8, c: "grey", at: 1 },
              { arrow: [80, 27, 88, 27], at: 2 },
              { box: [90, 20, 40, 14], t: "mix: 64 rounds", c: "blue", fill: true, at: 2 },
              { path: [118, 18, 118, 10, 102, 10, 102, 18], c: "blue", dash: true, at: 2 },
              { text: "once for each chunk", x: 110, y: 40, a: "c", size: 3.8, c: "grey", at: 2 },
              { arrow: [132, 27, 138, 27], at: 3 },
              { box: [140, 20, 16, 14], t: "256", c: "green", at: 3 },
              { text: "bits", x: 148, y: 40, a: "c", size: 3.8, c: "grey", at: 3 },
              { text: "only shifting, combining and adding: no keys, no secrets", x: 80, y: 55, a: "c", size: 4.5, at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "Here is the inside in one breath.",
              "The message is padded to a tidy length and cut into chunks of 512 bits.",
              "Each block in turn is stirred into a running state of 256 bits, through 64 rounds of mixing.",
              "When the last block has gone through, the state that remains is the fingerprint.",
              "Each round is nothing but shifting bits about, combining them and adding numbers together.",
              { s: "There is no key and no secret ingredient, so anyone can build the machine and get the same answers.", g: "open" },
              "A patient person could work one out with pencil and paper, slowly."
            ] },
          { slide: { k: "table", title: "Promises are tested, not proven", start: 0, head: ["Machine", "Published", "Twins found"], rows: [
              ["MD5", "1992", "2004"],
              ["SHA-1", "1995", "2017"],
              ["SHA-256", "2001", "none so far"]
            ] },
            at: "left", g: "open",
            say: [
              { s: "How do we know the three promises hold?", g: "shrug" },
              "The honest answer is that nobody has proved them; they have only survived every attack so far.",
              { s: "An older machine called MD5 was trusted everywhere, until researchers showed two inputs with the same fingerprint in 2004.", show: 1 },
              { s: "Its cousin SHA-1 held out longer, and the first twins for it were published in 2017.", show: 2 },
              { s: "SHA-256 has been attacked in the open by the world's cryptographers for a quarter of a century, and it stands.", show: 3 },
              "That is the only kind of confidence this field offers, and it is worth knowing which kind you have."
            ] },
          { slide: { k: "figure", title: "Bitcoin hashes twice", ops: [
              { box: [4, 16, 30, 14], t: "data" },
              { arrow: [36, 23, 46, 23] },
              { box: [48, 16, 30, 14], t: "SHA-256", c: "blue", fill: true },
              { arrow: [80, 23, 90, 23], at: 1 },
              { box: [92, 16, 30, 14], t: "SHA-256", c: "blue", fill: true, at: 1 },
              { arrow: [124, 23, 132, 23], at: 1 },
              { box: [134, 16, 24, 14], t: "hash", c: "green", at: 1 },
              { text: "first fingerprint", x: 85, y: 36, a: "c", size: 3.6, c: "grey", at: 1 },
              { box: [44, 8, 82, 33], c: "amber", dash: true, at: 4 },
              { text: "treat the pair as one machine", x: 85, y: 49, a: "c", size: 4.5, c: "amber", at: 4 }
            ], note: "Bitcoin developer reference: headers and Merkle trees use SHA256(SHA256())." },
            at: "screen", g: "point",
            say: [
              "Bitcoin adds one quirk of its own.",
              "In most places where it fingerprints something, it feeds the fingerprint straight through the machine a second time.",
              "The identifier of a payment, the identifier of a block and the trees we will draw shortly all use this double hash.",
              "Satoshi never explained the choice, and the usual reading is extra caution against a weakness in designs of this kind.",
              { s: "For our purposes nothing changes: two runs back to back are still one fingerprint machine, with the same three promises.", g: "pinch" },
              "So from here on, when I say hash, I mean whatever the system uses, once or twice."
            ] },
          { say: ["A quick check on what a promise is worth.", "What does it mean to say that the hash function SHA-1 was broken in 2017?"],
            quiz: {
              q: "What does it mean that the hash function SHA-1 was broken in 2017?",
              options: [
                "Its design was kept secret and then leaked",
                "Its fingerprints could be turned back into the data",
                "It began giving different answers on different computers",
                "Two different inputs with one fingerprint were found"
              ],
              answer: 3,
              right: ["Right: a pair of twins was published, so the third promise was gone."],
              wrong: [
                ["The design was public from the start, as the design of SHA-256 is.", "Broken here means that two different inputs with one fingerprint were found."],
                ["Nobody learned to run SHA-1 backwards, so that promise still stood.", "What was found was a collision: two different inputs with the same fingerprint."],
                ["A hash function has no dice in it, and SHA-1 still gives everyone the same answers.", "It was broken because two different inputs with the same fingerprint were found."],
                null
              ]
            } }
        ] },

      { id: "commitments", title: "The Sealed Envelope", topics: ["commitment", "commit and reveal", "coin flip", "random number", "timestamp", "publishing a hash"],
        beats: [
          { slide: { k: "section", title: "The Sealed Envelope", sub: "Commit now, reveal later" },
            at: "lectern", g: "open",
            say: [
              "Now for the second job, and it begins with a puzzle from 1981.",
              "The computer scientist Manuel Blum asked how two people could flip a coin over the telephone.",
              "If I flip and tell you the result, you have to take my word for it.",
              { s: "If you call heads or tails first and I announce the flip afterwards, I can simply lie.", g: "shrug" },
              "What we need is a way for me to fix my choice before you call, without showing it to you.",
              "Face to face I would write it down, seal it in an envelope and put the envelope on the table."
            ] },
          { board: { clear: true, title: "Commit, then reveal", ops: [
              { text: "1 commit", x: 8, y: 19, size: 5.5, c: "blue", at: 1 },
              { box: [8, 26, 44, 14], t: "heads", at: 1 },
              { arrow: [54, 33, 70, 33], at: 2 },
              { box: [72, 26, 26, 14], t: "hash", c: "blue", at: 2 },
              { arrow: [100, 33, 112, 33], at: 2 },
              { box: [114, 26, 40, 14], t: "5c0b...414e", c: "green", at: 2 },
              { text: "sent to you", x: 134, y: 46, a: "c", size: 4, c: "green", at: 2 },
              { text: "2 you call", x: 8, y: 57, size: 5.5, c: "blue", at: 3 },
              { text: "3 reveal", x: 8, y: 72, size: 5.5, c: "blue", at: 4 },
              { text: "I show: heads", x: 60, y: 72, size: 5, at: 4 },
              { text: "you hash it and compare", x: 60, y: 82, size: 5, c: "green", at: 5 }
            ] },
            say: [
              "A hash function is that envelope.",
              "I make my choice in private; say it is heads.",
              "I hash it and send you only the fingerprint, which is my commitment.",
              "Now you make your call, knowing that I can no longer change my mind.",
              "Then I reveal what I chose.",
              "You hash my answer yourself, and if it matches the fingerprint I sent earlier, you know I did not switch.",
              { s: "The no-twins promise is what binds me, because I cannot find a second answer with the same fingerprint.", g: "pinch" }
            ] },
          { slide: { k: "code", title: "The trap: a secret you can guess", start: 2, lines: [
              "$ sha256 \"heads\"",
              "5c0bc2423c1af18c ... 24fe414e",
              "$ sha256 \"tails\"",
              "ae7a4a6cba2f9fb1 ... 9c248d62",
              "",
              "$ sha256 \"heads 8f3a91c2\"   # plus a random number",
              "03328f83af9c028b ... 0dbc35f6"
            ], note: "Real SHA-256 output, shortened in the middle." },
            at: "left", g: "open",
            say: [
              "Here is the trap I promised you.",
              { s: "There are only two things I could have chosen, so you can hash both of them yourself.", show: 4 },
              "One of them matches my commitment, and my sealed envelope turns out to be made of glass.",
              "One-way is no help when the input is easy to guess.",
              { s: "The cure is to add a long random number that only I know, and hash the two together.", show: 7 },
              "Now you would have to guess my random number as well, which is hopeless.",
              "When I reveal, I show you both the choice and the number, and you check them against the fingerprint.",
              { s: "Hold on to that picture of guessing inputs, because the fourth job turns it from a weakness into a tool.", g: "point" }
            ] },
          { slide: { k: "quote", text: "The timestamp proves that the data must have existed at the time, obviously, in order to get into the hash.", by: "Satoshi Nakamoto, Bitcoin whitepaper, section 3, 2008" },
            at: "centre", g: "open",
            say: [
              "A commitment does not have to hide anything to be useful.",
              "Section 3 of the whitepaper describes hashing a batch of documents and publishing the fingerprint widely, in a newspaper, say.",
              { s: "And this is the conclusion it draws.", g: "point" },
              "Nobody can produce the fingerprint of data that does not exist yet.",
              "So a published fingerprint proves that the data existed by that day, in exactly that form.",
              "Lecture 1 showed the mirror image: the headline inside the first block proves the block is no older than the newspaper.",
              "Fingerprints published in the open, each one covering the one before, is the idea that lecture 6 turns into a chain."
            ] },
          { say: ["Let me test the envelope.", "I send you the fingerprint of my choice today and reveal the choice tomorrow, so what stops me changing it overnight?"],
            quiz: {
              q: "I commit with a fingerprint today. What stops me changing my choice?",
              options: [
                "The fingerprint tells you my choice straight away",
                "I cannot find a different choice with the same fingerprint",
                "Hash functions give a new answer every time",
                "The fingerprint is stored in a locked database"
              ],
              answer: 1,
              right: ["Exactly: no twins can be found, so the fingerprint ties me to one choice."],
              wrong: [
                ["If the fingerprint gave my choice away, the envelope would be useless.", "It hides the choice, and it binds me because no second choice has the same fingerprint."],
                null,
                ["A hash function gives the same answer every time, which is why you can check mine.", "I am bound because I cannot find a different choice with the same fingerprint."],
                ["No database is involved, and you hold the fingerprint yourself.", "What binds me is that I cannot find another choice with the same fingerprint."]
              ]
            } }
        ] },

      { id: "merkle-trees", title: "Merkle's Tree", topics: ["merkle tree", "merkle root", "merkle proof", "ralph merkle", "proving membership", "light clients", "hashing in pairs"],
        beats: [
          { slide: { k: "section", title: "Merkle's Tree", sub: "One fingerprint for a whole set, and a short proof for one item" },
            at: "lectern", g: "open",
            say: [
              "Job three starts from an awkward fact about job one.",
              "Suppose I publish one fingerprint for a list of a thousand payments.",
              "You want to check that your payment is on the list.",
              { s: "With a plain fingerprint, I would have to send you all thousand payments so that you could hash the lot.", g: "wide" },
              "That is slow, and it shows you 999 payments that are none of your business.",
              "In 1979 a graduate student at Stanford named Ralph Merkle described a better way.",
              "His idea was to hash each item, then hash those fingerprints in pairs, and to keep going until one fingerprint is left."
            ] },
          { board: { clear: true, title: "Building the tree", ops: [
              { box: [10, 77, 26, 10], t: "A", at: 0 },
              { box: [48, 77, 26, 10], t: "B", at: 0 },
              { box: [86, 77, 26, 10], t: "C", at: 0 },
              { box: [124, 77, 26, 10], t: "D", at: 0 },
              { line: [23, 77, 23, 67], at: 1 },
              { box: [10, 57, 26, 10], t: "h(A)", c: "blue", at: 1 },
              { line: [61, 77, 61, 67], at: 1 },
              { box: [48, 57, 26, 10], t: "h(B)", c: "blue", at: 1 },
              { line: [99, 77, 99, 67], at: 1 },
              { box: [86, 57, 26, 10], t: "h(C)", c: "blue", at: 1 },
              { line: [137, 77, 137, 67], at: 1 },
              { box: [124, 57, 26, 10], t: "h(D)", c: "blue", at: 1 },
              { line: [23, 57, 38, 47], at: 2 },
              { line: [61, 57, 46, 47], at: 2 },
              { box: [29, 37, 26, 10], t: "h(AB)", c: "blue", at: 2 },
              { line: [99, 57, 114, 47], at: 2 },
              { line: [137, 57, 122, 47], at: 2 },
              { box: [105, 37, 26, 10], t: "h(CD)", c: "blue", at: 2 },
              { line: [42, 37, 74, 28], at: 3 },
              { line: [118, 37, 86, 28], at: 3 },
              { box: [64, 16, 32, 12], t: "root", c: "amber", at: 3 },
              { text: "Merkle root", x: 100, y: 22, size: 5, c: "amber", at: 4 },
              { arrow: [155, 84, 155, 22], c: "red", at: 6 },
              { text: "any change reaches the root", x: 4, y: 22, size: 3.8, c: "red", at: 6 }
            ] },
            say: [
              "Let me draw it with four items, and call them A, B, C and D.",
              "First I hash each item on its own, which gives me four fingerprints.",
              "Then I join the first two fingerprints end to end and hash the pair, and do the same with the second two.",
              "Now there are two, so I join those and hash once more.",
              "The single fingerprint at the top is called the Merkle root.",
              { s: "It is a tree the way computer scientists like their trees, with the root in the air and the leaves on the ground.", g: "shrug" },
              "Change any item at the bottom and the change climbs: its fingerprint changes, then its parent, then the root.",
              "So the root is a fingerprint of the whole set, exactly as before."
            ] },
          { board: { clear: true, title: "Proving that C is in the set", ops: [
              { box: [64, 16, 32, 12], t: "root", c: "amber", at: 0 },
              { line: [42, 37, 74, 28], c: "grey", at: 0 },
              { line: [118, 37, 86, 28], c: "grey", at: 0 },
              { box: [29, 37, 26, 10], t: "h(AB)", c: "grey", at: 0 },
              { box: [105, 37, 26, 10], t: "h(CD)", c: "grey", at: 0 },
              { line: [23, 57, 38, 47], c: "grey", at: 1 },
              { line: [61, 57, 46, 47], c: "grey", at: 1 },
              { line: [99, 57, 114, 47], c: "grey", at: 1 },
              { line: [137, 57, 122, 47], c: "grey", at: 1 },
              { box: [10, 57, 26, 10], t: "h(A)", c: "grey", at: 1 },
              { box: [48, 57, 26, 10], t: "h(B)", c: "grey", at: 1 },
              { box: [86, 57, 26, 10], t: "h(C)", c: "grey", at: 1 },
              { box: [124, 57, 26, 10], t: "h(D)", c: "grey", at: 1 },
              { box: [86, 77, 26, 10], t: "C", c: "green", at: 3 },
              { line: [99, 77, 99, 67], c: "green", at: 3 },
              { box: [122, 55, 30, 14], c: "red", at: 4 },
              { text: "sent", x: 137, y: 73, a: "c", size: 4, c: "red", at: 4 },
              { box: [27, 35, 30, 14], c: "red", at: 4 },
              { text: "sent", x: 14, y: 42, size: 4, c: "red", at: 4 },
              { line: [99, 57, 114, 47], c: "green", at: 5 },
              { line: [137, 57, 122, 47], c: "green", at: 5 },
              { line: [118, 37, 86, 28], c: "green", at: 6 },
              { line: [42, 37, 74, 28], c: "green", at: 6 },
              { text: "2 hashes, not 4 items", x: 4, y: 83, size: 5, c: "green", at: 7 }
            ] },
            say: [
              "Now the clever part, so let me draw the same tree again.",
              "The same four fingerprints sit along the bottom, and the same root sits at the top.",
              "You already know the root, because I published it, or because it sits somewhere you trust.",
              "You hold item C, and you want proof that it is under that root.",
              "I send you just two fingerprints: the one for D, and the one for A and B together.",
              "You hash C yourself, join it with the fingerprint for D and hash the pair, which gives you their parent.",
              "You join that with the fingerprint for A and B, hash again, and compare the result with the root.",
              { s: "If it matches, C is in the set, and you never saw A, B or D.", g: "pinch" },
              "And I cannot cheat, because to fake a path I would need twins, and nobody can find twins."
            ] },
          { slide: { k: "table", title: "The proof grows very slowly", start: 0, head: ["Items in the set", "Hashes in the proof"], rows: [
              ["4", "2"],
              ["8", "3"],
              ["1,024", "10"],
              ["1,048,576", "20"]
            ], note: "Each doubling of the set adds one hash. At 32 bytes a hash, 20 hashes are 640 bytes." },
            at: "right", g: "count",
            say: [
              { s: "For four items the proof was two fingerprints, which hardly seems worth the trouble.", show: 1 },
              { s: "But double the set to eight and the tree grows by one level, so the proof grows by one.", show: 2 },
              { s: "For 1,024 items the proof is ten fingerprints.", show: 3 },
              { s: "For more than a million items it is twenty.", show: 4, g: "wide" },
              "A byte is eight bits, so each fingerprint is 32 bytes, and twenty of them come to 640 bytes: less than a short email.",
              "That is the bargain: a set of any size, one root to remember, and a proof you could read out over the telephone."
            ] },
          { slide: { k: "figure", title: "Where Bitcoin uses the tree", ops: [
              { box: [8, 6, 60, 14], t: "block summary", c: "amber" },
              { text: "holds the Merkle root", x: 38, y: 26, a: "c", size: 3.8, c: "grey", at: 1 },
              { path: [38, 31, 12, 52, 64, 52, 38, 31], c: "blue", at: 1 },
              { text: "all its payments", x: 38, y: 58, a: "c", size: 3.8, c: "grey", at: 1 },
              { arrow: [70, 13, 98, 13], at: 2 },
              { box: [100, 6, 52, 14], t: "a phone", at: 2 },
              { text: "keeps the summaries only", x: 126, y: 26, a: "c", size: 3.8, c: "grey", at: 2 },
              { text: "+ one payment", x: 126, y: 37, a: "c", size: 4.5, c: "green", at: 3 },
              { text: "+ its short path of hashes", x: 126, y: 45, a: "c", size: 4.5, c: "green", at: 3 },
              { text: "= proof it is in the block", x: 126, y: 56, a: "c", size: 4.5, at: 3 }
            ] },
            at: "screen", g: "point",
            say: [
              "Bitcoin leans on this in two places that the whitepaper spells out, in its sections 7 and 8.",
              "The payments in a block are hashed into a Merkle tree, and only the root goes into the block's own short summary.",
              "So a phone that cannot store every payment can keep just the summaries.",
              "To check that one payment is in a block, it needs only the handful of fingerprints along that payment's path to the root.",
              { s: "We will open that summary up properly in lecture 6; today I only want you to own the tree.", g: "open" }
            ] },
          { say: ["Time to climb the tree yourself.", "In a Merkle tree of eight items, how many fingerprints must I send you to prove that one item is included?"],
            quiz: {
              q: "A Merkle tree has eight items. How many hashes prove one is included?",
              options: [
                "Three",
                "One",
                "Seven",
                "Eight"
              ],
              answer: 0,
              right: ["Yes: three levels to climb, and one fingerprint for each."],
              wrong: [
                null,
                ["One fingerprint would only take you up a single level.", "Eight items make three levels, so the proof is three fingerprints."],
                ["Seven would be every other item, which is exactly what the tree saves us from sending.", "You need one fingerprint for each level, and eight items make three levels."],
                ["Eight would be the whole set, and then the tree would have bought us nothing.", "The proof is one fingerprint for each level, which for eight items is three."]
              ]
            } }
        ] },

      { id: "provable-work", title: "Work You Can Prove", topics: ["proof of work", "hash puzzle", "target", "hashcash", "leading zeros", "guessing", "genesis block hash"],
        beats: [
          { slide: { k: "section", title: "Work You Can Prove", sub: "A puzzle with no shortcut, and an answer anyone can check" },
            at: "lectern", g: "open",
            say: [
              "The fourth job is the strangest, and it is the one we met last time under the name hashcash.",
              "I told you then about a puzzle that is hard to solve and instant to check, and I never said what the puzzle was.",
              { s: "Now you have everything you need to build it yourself.", g: "open" },
              "Take the two promises that sounded like nuisances: you cannot run the machine backwards, and you cannot steer what comes out.",
              "Together they mean that if I ask for a fingerprint of a particular shape, all you can do is try inputs until one turns up."
            ] },
          { board: { clear: true, title: "The puzzle", ops: [
              { text: "find a number so that", x: 8, y: 18, size: 5, at: 1 },
              { box: [8, 25, 60, 13], t: "message + number", at: 1 },
              { arrow: [70, 31, 84, 31], at: 2 },
              { box: [86, 25, 24, 13], t: "hash", c: "blue", at: 2 },
              { arrow: [112, 31, 124, 31], at: 2 },
              { text: "0000...", x: 127, y: 31, size: 6, c: "green", at: 2 },
              { line: [10, 63, 150, 63], at: 3 },
              { text: "0", x: 10, y: 71, a: "c", size: 4, at: 3 },
              { text: "biggest", x: 150, y: 71, a: "c", size: 4, at: 3 },
              { line: [38, 55, 38, 71], c: "red", at: 4 },
              { text: "target", x: 38, y: 50, a: "c", size: 4.5, c: "red", at: 4 },
              { box: [10, 59, 28, 8], c: "green", fill: true, at: 5 },
              { text: "win", x: 24, y: 78, a: "c", size: 4.5, c: "green", at: 5 },
              { text: "lower target = smaller zone = more tries", x: 150, y: 85, a: "r", size: 4.5, at: 6 }
            ] },
            say: [
              "Here is the puzzle in full.",
              "I give you a message, and you must find a number to attach to it.",
              "The rule is that the fingerprint of the two together has to begin with a run of zeros.",
              "Here is another way to say the same thing: read the fingerprint as a number, somewhere between zero and the biggest one possible.",
              "I mark a line on that range, and call it the target.",
              "You win if your fingerprint lands below the target, and a fingerprint that starts with zeros is simply a small number.",
              { s: "Move the target lower and the winning zone shrinks, so on average it takes more tries to land in it.", g: "pinch" }
            ] },
          { slide: { k: "code", title: "Trying it for real", start: 0, lines: [
              "lecture 2 #0      ->  bdaaaeef252b...   no",
              "lecture 2 #1      ->  a9e8c8e86503...   no",
              "lecture 2 #2      ->  80c628a73988...   no",
              "# ... 51,880 more tries, all no ...",
              "lecture 2 #51883  ->  00005cd344c2...   yes"
            ], note: "Real SHA-256 output, first 12 characters shown. Number 51,883 is the first to start 0000." },
            at: "screen", g: "point",
            say: [
              { s: "I ran this one before class, with the message lecture 2 and a counter for the number.", show: 1 },
              { s: "Number 0 does not start with zeros, and neither does number 1, nor number 2.", show: 3 },
              { s: "My laptop kept counting, and the first fingerprint to begin with four zeros came at number 51,883.", show: 5 },
              "That took a fraction of a second, because a laptop gets through millions of tries a second.",
              "Each character has 16 possible values, so four zeros in a row should turn up about once in 65,536 tries.",
              "I got there a little early, which was luck and nothing else.",
              { s: "There is no skill in it and no cleverness, only the number of tries, and that is why we may call it work.", g: "chop" }
            ] },
          { slide: { k: "table", title: "Each extra zero: 16 times the work", start: 0, head: ["Leading zeros", "Tries expected", "First hit at"], rows: [
              ["1", "16", "17"],
              ["2", "256", "182"],
              ["3", "4,096", "2,605"],
              ["4", "65,536", "51,883"],
              ["5", "1,048,576", "332,554"],
              ["6", "16,777,216", "5,757,058"]
            ], note: "Real results for the message \"lecture 2 #\" and a counter from 0, hashed once with SHA-256." },
            at: "right", g: "count",
            say: [
              { s: "Here is the whole run, one more zero at a time.", show: 2 },
              { s: "Each extra zero makes the winning zone 16 times smaller, so the expected number of tries goes up 16 times.", show: 4 },
              { s: "Five zeros took a third of a million tries, and six took nearly six million.", show: 6 },
              "Look how the real results wander away from the expected ones, here mostly early; on another message they could as easily be late.",
              { s: "So by choosing the target, I can set the price of the puzzle as high or as low as I please.", g: "weigh" },
              "How Bitcoin chooses its target, and keeps choosing it, is the business of lecture 7."
            ] },
          { slide: { k: "figure", title: "Hard to find, one step to check", ops: [
              { box: [6, 6, 60, 12], t: "lecture 2 #51883" },
              { arrow: [68, 12, 80, 12] },
              { box: [82, 6, 22, 12], t: "hash", c: "blue", fill: true },
              { arrow: [106, 12, 116, 12] },
              { text: "00005cd3...", x: 119, y: 12, size: 5, c: "green", mono: true },
              { text: "finding it", x: 6, y: 31, size: 4.5, at: 1 },
              { box: [40, 26, 112, 10], t: "51,884 hashes", c: "red", fill: true, at: 1 },
              { text: "checking it", x: 6, y: 45, size: 4.5, at: 2 },
              { box: [40, 40, 6, 10], c: "green", fill: true, at: 2 },
              { text: "1 hash", x: 50, y: 45, size: 4.5, c: "green", at: 2 },
              { text: "the answer is its own receipt", x: 80, y: 59, a: "c", size: 4.5, at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "And now the other half of the bargain.",
              "Finding that number cost my laptop 51,884 runs of the machine, counting from number 0.",
              { s: "For you to check it costs one: hash the message with my number, and look at the front of the result.", g: "pinch" },
              "You do not need to watch me work, trust my laptop or take my word for anything.",
              "The fingerprint is its own receipt, and it says that somebody burned through tens of thousands of tries to get it.",
              "It is a statistical receipt, I admit: one lucky guess is possible, but nobody stays lucky across thousands of puzzles."
            ] },
          { at: "centre", g: "open",
            say: [
              "This is precisely Adam Back's hashcash stamp from last time.",
              "The message was the recipient's address and the date, and the stamp was a number that made the fingerprint begin with zeros.",
              "Hashcash used the older machine, SHA-1, and counted its zeros in bits rather than in characters.",
              "A typical stamp asked for 20 zero bits, which is five zeros in our notation, and about a million tries.",
              { s: "Notice that the work is welded to the message: change the address or the date, and the fingerprint scrambles and the zeros vanish.", g: "chop" },
              "A stamp made for one email is worthless on any other, and that welding is exactly what Bitcoin will exploit."
            ] },
          { slide: { k: "quote", text: "The average work required is exponential in the number of zero bits required and can be verified by executing a single hash.", by: "Satoshi Nakamoto, Bitcoin whitepaper, section 4, 2008" },
            at: "left", g: "open",
            say: [
              "Here is how the whitepaper puts it, in its section on proof of work.",
              { s: "You can now read that sentence as plain English.", g: "point" },
              "Exponential in the number of zero bits means that each extra zero bit doubles the tries.",
              "Verified by executing a single hash means one run of the machine to check.",
              "In Bitcoin the message is not an email but a block's short summary, which stands for all its payments, and its fingerprint must fall below the network's target."
            ] },
          { slide: { k: "code", title: "The first block's fingerprint", lines: [
              "# block 0, 3 January 2009",
              "000000000019d6689c085ae165831e93",
              "4ff763ae46a2a6c172b3f1b60a8ce26f"
            ], note: "Ten leading zeros, where the rules of the day asked for eight." },
            at: "screen", g: "point",
            say: [
              "And here is the oldest example there is: the fingerprint of the genesis block, the one with the newspaper headline in it.",
              "Count the zeros at the front, and you will find ten of them.",
              "The rules of the day asked for eight, so this block cleared the bar with room to spare.",
              "Nobody can clear even that bar except by trying, on average, billions of inputs.",
              { s: "And all these years later, anyone with a laptop can check it in an instant.", g: "up" }
            ] },
          { say: ["One question on the puzzle, and it is the one that matters most.", "Why is there no shortcut to finding a fingerprint that falls below the target?"],
            quiz: {
              q: "Why is there no shortcut to a fingerprint below the target?",
              options: [
                "Only specially licensed computers are allowed to try",
                "Checking each attempt takes a very long time",
                "The output cannot be steered, so guessing is all there is",
                "The target is kept secret from the solvers"
              ],
              answer: 2,
              right: ["That is it: one-way and scrambled together leave nothing but trying."],
              wrong: [
                ["Anyone with any computer may try, and nobody hands out licences.", "The reason is that a hash cannot be steered or reversed, so guessing is the only method."],
                ["Checking is the fast part, a single run of the machine.", "Finding is slow because the output cannot be steered, so all you can do is guess."],
                null,
                ["The target is public, and it has to be, so that anyone can check a solution.", "There is no shortcut because the output cannot be steered, which leaves only guessing."]
              ]
            } }
        ] },

      { id: "recap-and-next", title: "One Tool, Four Jobs", topics: ["summary", "limits of a hash", "authorship", "ownership", "keys and signatures", "next lecture"],
        beats: [
          { slide: { k: "section", title: "One Tool, Four Jobs", sub: "What a fingerprint gives us, and what it cannot" },
            at: "lectern", g: "open",
            say: [
              "Let me gather up what we have built.",
              "We started with one small machine that turns any data into 256 bits.",
              { s: "We asked three things of it: scramble everything, never run backwards, never show us twins.", g: "count" },
              "From those three promises came four jobs."
            ] },
          { board: { clear: true, title: "Four jobs from one machine", ops: [
              { box: [62, 40, 36, 16], t: "hash", c: "blue", at: 0 },
              { line: [56, 30, 64, 40], at: 1 },
              { box: [6, 16, 50, 14], t: "tamper-evident", c: "green", at: 1 },
              { text: "one changed bit shows", x: 31, y: 35, a: "c", size: 3.8, c: "grey", at: 1 },
              { line: [104, 30, 96, 40], at: 2 },
              { box: [104, 16, 50, 14], t: "commitments", c: "amber", at: 2 },
              { text: "fix now, reveal later", x: 129, y: 35, a: "c", size: 3.8, c: "grey", at: 2 },
              { line: [56, 66, 64, 56], at: 3 },
              { box: [6, 66, 50, 14], t: "Merkle proofs", c: "red", at: 3 },
              { text: "one item, a few hashes", x: 31, y: 85, a: "c", size: 3.8, c: "grey", at: 3 },
              { line: [104, 66, 96, 56], at: 4 },
              { box: [104, 66, 50, 14], t: "provable work", at: 4 },
              { text: "slow to find, fast to check", x: 129, y: 85, a: "c", size: 3.8, c: "grey", at: 4 }
            ] },
            say: [
              "Here is the machine in the middle.",
              "Job one: a published fingerprint makes any record tamper-evident, because one changed bit shows.",
              "Job two: a fingerprint is a sealed envelope, fixing a choice now that is revealed later.",
              "Job three: a Merkle tree gives one root for a whole set, and a short proof for any single item.",
              "Job four: a fingerprint below a target is a receipt for work, slow to find and instant to check.",
              { s: "Four jobs, and not one of them needed a keeper, a company or anybody's permission.", g: "wide" },
              "Anyone can run the machine, and everyone who runs it gets the same answer."
            ] },
          { slide: { k: "compare", title: "What a fingerprint can and cannot say",
              left: { head: "It can tell you", points: ["This data has not changed", "This item is in that set", "This was fixed before then", "Work was spent on this"] },
              right: { head: "It cannot tell you", points: ["Who wrote the data", "Who is allowed to change it", "Whether the data is true", "Whose coin this is"] } },
            at: "left", g: "weigh",
            say: [
              "Now the limits, because you only understand a tool when you know what it cannot do.",
              "A fingerprint tells you that data is unchanged, that an item is in a set, that a choice was fixed in advance, that work was spent.",
              { s: "It tells you nothing at all about who.", g: "chop" },
              "Anyone can hash anything, so a fingerprint carries no author and no owner.",
              "If a message says pay Ada 5 coins, its fingerprint tells me the message has not been altered, but not that the payer agreed to it.",
              "Our ledger needs exactly that: a mark that only the owner of a coin can make, and that everyone else can check."
            ] },
          { slide: { k: "live", title: "Fingerprints at work, right now", panel: "blocks", note: "Live from the Bitcoin network while the hall is open" },
            at: "screen", g: "point",
            say: [
              "Before you go, look at the chain as it stands this minute.",
              "Every one of these blocks has a fingerprint that fell below the network's target, after an astronomical number of tries.",
              "Each one carries the Merkle root of its payments, and each one contains the fingerprint of the block before it.",
              "Tamper-evidence, a Merkle tree and provable work, all in one small summary, roughly every ten minutes.",
              "By lecture 7 you will be able to check each of those claims yourself."
            ] },
          { slide: { k: "figure", title: "Next time: keys and signatures", ops: [
              { box: [4, 8, 46, 12], t: "pay Ada 5 coins" },
              { arrow: [52, 14, 64, 14] },
              { box: [66, 8, 22, 12], t: "hash", c: "blue", fill: true },
              { arrow: [90, 14, 102, 14] },
              { text: "f0c38aa5...", x: 105, y: 14, size: 5, c: "green", mono: true },
              { text: "unchanged? yes", x: 40, y: 29, a: "c", size: 4.5, c: "green", at: 1 },
              { text: "who agreed to it? no idea", x: 112, y: 29, a: "c", size: 4.5, c: "red", at: 2 },
              { box: [30, 38, 44, 12], t: "secret key", c: "amber", at: 3 },
              { text: "+", x: 80, y: 44, a: "c", size: 6, at: 3 },
              { box: [86, 38, 44, 12], t: "public key", c: "green", at: 3 },
              { text: "a mark only the owner can make", x: 80, y: 58, a: "c", size: 4.5, at: 4 }
            ] },
            at: "lectern", g: "open",
            say: [
              "So that is where we go next.",
              "Today's machine can prove that a payment has not been changed.",
              "It cannot prove that the person paying ever agreed to it.",
              "For that we need a second tool: a pair of keys, one kept secret and one shown to the world.",
              "With them you can put a mark on a message that anyone can check and nobody else can forge.",
              "That mark is a digital signature, and it is how a coin comes to have an owner without anyone keeping an account.",
              "Before then, read sections 3, 4, 7 and 8 of the whitepaper again, and see how much more they say to you now.",
              "And if you have a computer to hand, hash your own name, change one letter, and watch the fingerprint scatter.",
              { s: "Thank you, and I will see you in lecture 3, Keys and Signatures.", g: "up" }
            ] }
        ] }
    ]
  });
})();
