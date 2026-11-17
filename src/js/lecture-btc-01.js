// Bitcoin from First Principles, lecture 1: why money on a network was hard (copying and the double spend), what the trusted keeper of the ledger costs, the attempts from Chaum's ecash to Finney's RPOW, the whitepaper and the genesis block, and the four ideas the rest of the course opens up.
(() => {
  "use strict";
  window.BL.lectures.add({
    id: "btc-01", course: "first-principles", n: 1, title: "The Problem of Digital Cash",
    reading: [
      { title: "Bitcoin: A Peer-to-Peer Electronic Cash System", by: "Satoshi Nakamoto, 2008" }
    ],
    sources: [
      "Satoshi Nakamoto, Bitcoin: A Peer-to-Peer Electronic Cash System (2008), https://bitcoin.org/bitcoin.pdf",
      "Satoshi Nakamoto, Bitcoin P2P e-cash paper, Cryptography Mailing List, 31 October 2008, and the thread's replies to 13 November 2008, https://satoshi.nakamotoinstitute.org/emails/cryptography/threads/1/",
      "Wei Dai, b-money (1998), https://nakamotoinstitute.org/library/b-money/",
      "Nick Szabo, Bit Gold (published 2005), https://nakamotoinstitute.org/library/bit-gold/",
      "Hal Finney, RPOW: Reusable Proofs of Work (2004), https://nakamotoinstitute.org/finney/rpow/ and https://www.metzdowd.com/pipermail/cryptography/2004-August/007362.html",
      "Adam Back, Hashcash: A Denial of Service Counter-Measure (2002), http://www.hashcash.org/papers/hashcash.pdf, with https://en.wikipedia.org/wiki/Hashcash for the 1997 proposal",
      "David Chaum, Blind Signatures for Untraceable Payments (Crypto 82), with https://en.wikipedia.org/wiki/DigiCash and https://en.wikipedia.org/wiki/Blind_signature",
      "E-gold, https://en.wikipedia.org/wiki/E-gold",
      "Bitcoin Wiki, Genesis block, https://en.bitcoin.it/wiki/Genesis_block",
      "Lamport, Shostak and Pease, The Byzantine Generals Problem (1982), with https://en.wikipedia.org/wiki/Byzantine_fault",
      "World Bank, The Global Findex Database 2025, https://www.worldbank.org/en/publication/globalfindex"
    ],
    sections: [
      { id: "copy-problem", title: "A Coin You Cannot Copy", topics: ["digital cash", "copying data", "double spending", "course overview", "physical cash"],
        beats: [
          { slide: { k: "title", kicker: "Lecture 1", title: "The Problem of Digital Cash", sub: "Why money on the internet was hard, and what was tried" },
            at: "lectern", g: "open",
            say: [
              "Welcome to Bitcoin from First Principles.",
              { s: "Over 14 lectures we are going to take one machine apart, piece by piece, and put it back together.", g: "wide" },
              "No background is required: no finance, no cryptography, no code.",
              "All I ask for is curiosity, and a healthy refusal to take my word for anything.",
              "Today there is no machine yet, only a problem.",
              "It is a problem that defeated very clever people for more than 25 years.",
              { s: "Here it is: how do you hand someone money over a network, the way you hand them a coin?", g: "lean" }
            ] },
          { slide: { k: "points", title: "How this course works", start: 0, points: [
              "14 lectures, each built on the one before",
              "Every claim is something you can check yourself",
              "Today: the problem, the failures, the breakthrough",
              "Not on offer: prices, predictions, what to buy"
            ] },
            at: "centre", g: "open",
            say: [
              { s: "Each lecture stands on the one before, so the order matters.", show: 1 },
              { s: "Everything I tell you is something you can check for yourself, and by the end you will know how.", show: 2 },
              { s: "Today has three parts: the problem, the long line of failures, and the breakthrough.", show: 3, g: "count" },
              { s: "And one thing you will not get from me is a price, a prediction or advice on what to buy.", show: 4, g: "chop" }
            ] },
          { slide: { k: "figure", title: "A coin moves. A file copies.", ops: [
              { text: "In your hand", x: 40, y: 5, a: "c", size: 4, c: "grey" },
              { text: "On a network", x: 120, y: 5, a: "c", size: 4, c: "grey" },
              { line: [80, 2, 80, 60], c: "grey", dash: true },
              { box: [6, 14, 24, 12], t: "you" },
              { box: [50, 14, 24, 12], t: "stall" },
              { circle: [18, 40, 6], c: "grey", dash: true, at: 1 },
              { arrow: [27, 40, 53, 40], at: 1 },
              { circle: [62, 40, 6], c: "amber", fill: true, at: 1 },
              { text: "one coin, one owner", x: 40, y: 55, a: "c", size: 4.5, c: "green", at: 3 },
              { box: [86, 14, 24, 12], t: "you", at: 4 },
              { box: [130, 14, 24, 12], t: "friend", at: 4 },
              { box: [91, 34, 14, 12], t: "file", c: "blue", fill: true, at: 4 },
              { arrow: [107, 40, 133, 40], at: 5 },
              { box: [135, 34, 14, 12], t: "file", c: "blue", fill: true, at: 5 },
              { text: "two files, two owners", x: 120, y: 55, a: "c", size: 4.5, c: "red", at: 6 }
            ] },
            at: "screen", g: "point",
            say: [
              "Start with something you have done a thousand times: paying with a coin at a market stall.",
              "You hand the coin over, and now the stallholder has it and you do not.",
              "Nobody had to phone anyone, nobody checked a list, and nobody asked your name.",
              { s: "Physics did the bookkeeping, because a coin cannot be in two pockets at once.", g: "pinch" },
              "Now try the same thing with a file.",
              "When you send a photo to a friend, you still have the photo.",
              { s: "Sending, on a network, is just a polite word for copying.", g: "shrug" }
            ] },
          { board: { clear: true, title: "The double spend", ops: [
              { text: "me", x: 23, y: 34, a: "c", size: 5, at: 1 },
              { box: [8, 40, 30, 14], t: "coin #7", c: "amber", at: 1 },
              { arrow: [40, 44, 100, 26], at: 2 },
              { box: [102, 18, 40, 14], t: "bakery", at: 2 },
              { arrow: [40, 50, 100, 68], at: 3 },
              { box: [102, 62, 40, 14], t: "bookshop", at: 3 },
              { text: "coin #7", x: 122, y: 38, a: "c", size: 4, c: "amber", at: 4 },
              { text: "coin #7", x: 122, y: 82, a: "c", size: 4, c: "amber", at: 4 },
              { text: "double spend", x: 14, y: 74, size: 6, c: "red", at: 5 },
              { text: "?", x: 151, y: 47, a: "c", size: 9, c: "red", at: 6 }
            ] },
            say: [
              "So let me draw the disaster.",
              "Suppose money were a file, a string of numbers that says this is one coin.",
              "I send that file to a bakery, and I walk out with bread.",
              "Then I send the very same file to a bookshop, and I walk out with a book.",
              "Both shops hold a perfect copy, and neither can tell theirs from the other.",
              "This has a name, the double-spending problem, and it is the villain of today's story.",
              "Any money that lives on a network has to answer one question: has this coin already been spent?"
            ] },
          { at: "centre", g: "open",
            say: [
              { s: "This problem is not about secrecy, and it is not about speed.", g: "chop" },
              "It is about scarcity: making a digital thing that cannot be in two places at once.",
              { s: "Computers are copying machines, so we are asking a copying machine not to copy.", g: "shrug" },
              "For decades there was exactly one known way to do that."
            ] },
          { say: ["Before we go on, let me check that the villain of the story has landed.", "What is the double-spending problem?"],
            quiz: {
              q: "What is the double-spending problem?",
              options: [
                "Someone steals your password and spends your money",
                "The same digital coin is spent in two places",
                "A payment takes too long to arrive",
                "A coin loses its value over time"
              ],
              answer: 1,
              right: ["Exactly: one coin, two shops, and neither can tell."],
              wrong: [
                ["Theft is a real danger, but it is a different one.", "Double spending is the owner copying a coin and spending it in two places."],
                null,
                ["Speed is not the trouble here, because a copy arrives instantly.", "The trouble is that the same coin can be spent in two places at once."],
                ["Losing value is inflation, which is another story.", "Double spending means one digital coin being spent in two places."]
              ] } }
        ] },

      { id: "trusted-middleman", title: "The Keeper of the Ledger", topics: ["trusted third party", "ledger", "banks", "censorship", "surveillance", "unbanked", "single point of failure"],
        beats: [
          { slide: { k: "section", title: "The Keeper of the Ledger", sub: "One list, one pen, one gatekeeper" },
            at: "lectern", g: "open",
            say: [
              "The one known way was this: stop sending coins, and keep a list instead.",
              "Put one trusted party in the middle, and let it write down who owns what.",
              "You know this party well, because it is your bank, your card network, your payment app.",
              "I will call it the keeper, and I mean that as a job title, not an insult."
            ] },
          { slide: { k: "figure", title: "One ledger, one keeper", ops: [
              { box: [4, 22, 26, 12], t: "you" },
              { box: [130, 22, 26, 12], t: "shop" },
              { box: [58, 6, 44, 40], c: "blue" },
              { text: "keeper's ledger", x: 80, y: 12, a: "c", size: 4, c: "blue" },
              { line: [62, 17, 98, 17], c: "blue" },
              { arrow: [31, 28, 57, 28], at: 1 },
              { text: "pay shop 5", x: 44, y: 23, a: "c", size: 3.5, at: 1 },
              { text: "you    10 - 5", x: 80, y: 25, a: "c", size: 4, mono: true, at: 2 },
              { text: "shop    0 + 5", x: 80, y: 34, a: "c", size: 4, mono: true, at: 2 },
              { arrow: [103, 28, 129, 28], c: "green", at: 2 },
              { text: "paid", x: 116, y: 23, a: "c", size: 3.5, c: "green", at: 2 },
              { arrow: [31, 42, 57, 42], c: "red", dash: true, at: 3 },
              { text: "same 5 again?", x: 30, y: 48, a: "c", size: 3.5, c: "red", at: 3 },
              { text: "refused", x: 80, y: 42, a: "c", size: 4, c: "red", at: 3 },
              { text: "one ledger, one keeper, one order of events", x: 80, y: 58, a: "c", size: 4.5, at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "Here is how the keeper kills the double spend.",
              "You do not send money to the shop at all; you send an instruction to the keeper.",
              "The keeper looks at its ledger, sees that you have ten, and moves five across.",
              "If you try to spend the same five again a second later, the keeper simply says no.",
              { s: "One ledger and one keeper mean one order of events, so nothing can be spent twice.", g: "pinch" },
              "It works at any distance, and almost all the money you have ever used works this way."
            ] },
          { slide: { k: "points", title: "What the keeper costs", start: 0, points: [
              "Permission: someone must approve you first",
              "Censorship: payments can be blocked or reversed",
              "Fragility: one keeper, one point of failure",
              "Surveillance: every payment leaves a record",
              "Exclusion: no account, no access"
            ] },
            at: "left", g: "count",
            say: [
              { s: "But look at what we quietly gave up to get there.", g: "lean" },
              { s: "First, permission: before you can pay anyone, the keeper has to accept you as a customer.", show: 1 },
              { s: "Second, censorship: whoever holds the pen can refuse a payment, freeze a balance or undo what was done.", show: 2 },
              { s: "Sometimes that power is used well, and sometimes it is used against journalists, protesters and the politically inconvenient.", g: "weigh" },
              { s: "Third, fragility: when the keeper goes offline, gets hacked or goes bankrupt, your money goes with it.", show: 3 }
            ] },
          { at: "right", g: "open",
            say: [
              { s: "Fourth, surveillance: the ledger is a diary of your life, and you are not the one keeping it.", show: 4, g: "count" },
              "Where you eat, what you read, who you support: it is all in there.",
              { s: "And fifth, the one I find hardest to forgive, exclusion.", show: 5, g: "count" },
              "If no keeper will have you, you are simply outside the system.",
              "Not because you did anything wrong, but because you were not profitable, or not documented, or born in the wrong place."
            ] },
          { slide: { k: "number", value: "1 billion+", label: "adults in the world with no account of any kind", note: "World Bank, Global Findex 2025: about 1.3 billion" },
            at: "centre", g: "open",
            say: [
              "How many people is that?",
              { s: "By the World Bank's surveys, well over a billion adults have no account anywhere.", g: "wide" },
              "Most of them own a mobile phone.",
              "So they can send a message across the planet in a second, and they cannot send a payment.",
              "That gap, between what the network can do and what money is allowed to do, is why this problem matters."
            ] },
          { slide: { k: "compare", title: "Two kinds of money",
              left: { head: "Cash in your hand", points: ["No permission needed", "No record kept", "Final the moment it moves", "Only works face to face"] },
              right: { head: "Money in an account", points: ["Works at any distance", "Needs a keeper's approval", "Every payment is recorded", "Can be frozen or reversed"] } },
            at: "left", g: "weigh",
            say: [
              "So here is the trade we have been living with.",
              "Cash asks no permission, keeps no record and is final the moment it leaves your hand.",
              "But cash only works when two people are standing in the same place.",
              "Account money works at any distance, and pays for that with every one of the five costs.",
              { s: "The dream, then, is simple to state: cash, but for the internet.", g: "up" },
              "Money you can send like a message and hold like a coin, with no keeper in the middle.",
              "People started chasing that dream in the early 1980s."
            ] },
          { say: ["A quick check before we meet the people who chased that dream.", "How does a trusted keeper stop a coin being spent twice?"],
            quiz: {
              q: "How does a trusted keeper stop a coin being spent twice?",
              options: [
                "It keeps the one ledger and refuses the second spend",
                "It makes every coin impossible to copy",
                "It hides every payment from everyone else",
                "It charges a fee on every payment"
              ],
              answer: 0,
              right: ["Right: one ledger, one order of events, and the second spend is refused."],
              wrong: [
                null,
                ["The keeper does not make data impossible to copy, and nothing can.", "It keeps the one ledger, so it sees the second spend and says no."],
                ["Secrecy would not help, since a hidden coin can still be copied.", "The keeper holds the one ledger, and refuses the second spend."],
                ["A fee makes cheating dearer, not impossible.", "What stops it is the single ledger: the keeper sees the second spend and refuses."]
              ] } }
        ] },

      { id: "chaum-and-issuers", title: "Digital Coins, Central Mints", topics: ["david chaum", "blind signatures", "ecash", "digicash", "e-gold", "centralised issuers"],
        beats: [
          { slide: { k: "section", title: "Digital Coins, Central Mints", sub: "Chaum's ecash, DigiCash and e-gold" },
            at: "lectern", g: "open",
            say: [
              "Our first hero is a cryptographer named David Chaum.",
              "In 1982 he presented a paper called Blind Signatures for Untraceable Payments.",
              "Chaum's worry was the fourth cost on our list, surveillance.",
              "He saw, very early, that electronic payments would let someone build a file on everybody.",
              { s: "So he asked whether a bank could approve your money without being able to follow it.", g: "lean" }
            ] },
          { slide: { k: "figure", title: "A signature made blind", ops: [
              { box: [2, 14, 32, 16], t: "sealed slip", at: 1 },
              { text: "you", x: 18, y: 36, a: "c", size: 3.5, c: "grey", at: 1 },
              { arrow: [36, 22, 44, 22], at: 2 },
              { box: [46, 14, 32, 16], t: "bank stamps", c: "blue", at: 2 },
              { text: "sees only envelope", x: 62, y: 36, a: "c", size: 3.5, c: "grey", at: 2 },
              { arrow: [80, 22, 88, 22], at: 3 },
              { box: [90, 14, 32, 16], t: "signed slip", c: "amber", fill: true, at: 3 },
              { text: "you unwrap it", x: 106, y: 36, a: "c", size: 3.5, c: "grey", at: 3 },
              { arrow: [124, 22, 134, 22], at: 5 },
              { box: [136, 14, 22, 16], t: "shop", at: 5 },
              { text: "spends it", x: 147, y: 36, a: "c", size: 3.5, c: "grey", at: 5 },
              { text: "is the signature valid? yes", x: 80, y: 48, a: "c", size: 4.5, c: "green", at: 5 },
              { text: "whose coin was it? unknowable", x: 80, y: 57, a: "c", size: 4.5, c: "red", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "The classic picture for the trick is an envelope lined with carbon paper.",
              "You write a serial number on a slip, seal it in the envelope, and hand the envelope to the bank.",
              "The bank takes one unit from your account and stamps the outside, and the stamp presses through onto the slip.",
              "Back home you open the envelope, and you now hold a slip with a genuine bank signature on it.",
              { s: "The bank has signed a number it has never seen.", g: "pinch" },
              "When a shop later deposits that slip, the bank can check its own signature, but cannot tell whose coin it was."
            ] },
          { at: "centre", g: "open",
            say: [
              "For the first time, money on a computer could be private the way a banknote is private.",
              "Chaum called it ecash, and around 1990 he founded a company in Amsterdam, DigiCash, to sell it.",
              "In 1995 a bank in St. Louis began issuing ecash backed by real dollars.",
              { s: "And in 1998, DigiCash filed for bankruptcy.", g: "rest" }
            ] },
          { slide: { k: "points", title: "DigiCash: what worked, what did not", start: 0, points: [
              "Worked: private payments, real cryptography",
              "Hard: banks and shops both had to sign up",
              "Deeper: the mint still checked every coin",
              "Fatal: when the company died, so did the money"
            ] },
            at: "right", g: "open",
            say: [
              { s: "So what went wrong?", g: "shrug" },
              { s: "The cryptography was sound, and the privacy was real.", show: 1 },
              { s: "The business was the hard part, because ecash needed banks to issue it and shops to accept it, and too few did.", show: 2 },
              "Card payments were already everywhere, and most customers did not yet see why privacy mattered.",
              { s: "But look underneath, because there is a deeper flaw: how did ecash stop a double spend?", show: 3, g: "lean" },
              "The bank kept a list of every serial number already spent, and checked each coin against it.",
              { s: "So the keeper was still there, and when the company went, the money went with it.", show: 4 }
            ] },
          { slide: { k: "figure", title: "Every issuer has a front door", ops: [
              { circle: [80, 30, 10], t: "issuer", c: "blue" },
              { circle: [36, 14, 4], at: 1 }, { line: [40, 15, 71, 27], c: "grey", at: 1 },
              { circle: [36, 46, 4], at: 1 }, { line: [40, 45, 71, 33], c: "grey", at: 1 },
              { circle: [124, 14, 4], at: 1 }, { line: [120, 15, 89, 27], c: "grey", at: 1 },
              { circle: [124, 46, 4], at: 1 }, { line: [120, 45, 89, 33], c: "grey", at: 1 },
              { circle: [14, 30, 4], at: 2 }, { line: [18, 30, 70, 30], c: "grey", at: 2 },
              { circle: [146, 30, 4], at: 2 }, { line: [142, 30, 90, 30], c: "grey", at: 2 },
              { circle: [56, 7, 4], at: 2 }, { line: [59, 10, 73, 23], c: "grey", at: 2 },
              { circle: [104, 7, 4], at: 2 }, { line: [101, 10, 87, 23], c: "grey", at: 2 },
              { line: [68, 18, 92, 42], c: "red", at: 4 },
              { line: [92, 18, 68, 42], c: "red", at: 4 },
              { text: "one office, one server, one off switch", x: 80, y: 58, a: "c", size: 4.5, c: "red", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "The next attempt skipped the clever cryptography and went for reach.",
              "E-gold, founded in 1996, let you hold an account measured in grams of gold stored in a vault.",
              { s: "It was simple and borderless, and it grew to millions of accounts moving billions of dollars a year.", g: "wide" },
              "Criminals liked it too, and regulators noticed.",
              "In 2007 the company and its directors were indicted in the United States, and in 2008 they pleaded guilty.",
              "Transfers were suspended, and millions of accounts froze where they stood."
            ] },
          { at: "centre", g: "open",
            say: [
              "You can argue about whether e-gold deserved its fate, but look at the structure.",
              { s: "DigiCash died of bankruptcy and e-gold died in a courtroom, but they died of the same disease.", g: "weigh" },
              { s: "Each had a centre: one company, one server, one list.", g: "count" },
              "Whatever has a centre can be closed, captured or corrupted at that centre.",
              { s: "So some people started asking a wilder question: could digital money have no issuer at all?", g: "up" }
            ] }
        ] },

      { id: "proof-of-work-roots", title: "Making Bits Expensive", topics: ["hashcash", "adam back", "proof of work", "b-money", "wei dai", "bit gold", "nick szabo", "rpow"],
        beats: [
          { slide: { k: "section", title: "Making Bits Expensive", sub: "Hashcash, b-money, bit gold and RPOW" },
            at: "lectern", g: "open",
            say: [
              "To get rid of the issuer, you first need a new source of scarcity.",
              "Gold is scarce because digging it up takes real effort.",
              { s: "Could a piece of data be made scarce the same way, by making it costly to produce?", g: "lean" },
              "The first working answer came from an unexpected direction: the fight against junk email."
            ] },
          { slide: { k: "figure", title: "Hard to make, easy to check", ops: [
              { text: "making it", x: 6, y: 14, size: 4.5 },
              { box: [40, 9, 112, 10], t: "a great many guesses", c: "red", fill: true, at: 3 },
              { text: "checking it", x: 6, y: 32, size: 4.5 },
              { box: [40, 27, 8, 10], c: "green", fill: true, at: 4 },
              { text: "one step", x: 52, y: 32, size: 4.5, c: "green", at: 4 },
              { text: "a solved puzzle = proof that effort was spent", x: 80, y: 51, a: "c", size: 4.5, at: 6 }
            ] },
            at: "screen", g: "point",
            say: [
              "In 1997 the cryptographer Adam Back proposed a scheme he called hashcash.",
              "The seed was a 1992 paper by Cynthia Dwork and Moni Naor on pricing junk mail.",
              "The idea is a puzzle with a strange and useful shape.",
              "Finding a solution takes a computer a great many blind guesses.",
              { s: "Checking a solution that someone hands you takes a single step.", g: "pinch" },
              "Think of a combination lock: slow to crack, instant to confirm once you have the number.",
              "A solved puzzle is therefore proof that somebody, somewhere, spent real computing effort.",
              "We call that a proof of work, and lecture 7 is devoted to it."
            ] },
          { board: { clear: true, title: "A stamp paid in work", ops: [
              { box: [8, 24, 34, 16], t: "email", at: 1 },
              { box: [44, 24, 18, 16], t: "stamp", c: "amber", at: 1 },
              { text: "1 mail = 1 second", x: 8, y: 54, size: 5, at: 2 },
              { arrow: [64, 32, 108, 32], at: 3 },
              { box: [110, 24, 40, 16], t: "inbox: ok", c: "green", at: 3 },
              { text: "10,000,000 mails =", x: 8, y: 68, size: 5, c: "red", at: 4 },
              { text: "about 4 months", x: 64, y: 68, size: 6, c: "red", at: 5 },
              { text: "no issuer needed", x: 100, y: 82, size: 5, c: "green", at: 6 }
            ] },
            say: [
              "Here is how Back used it.",
              "Before your computer sends me an email, it must solve a small puzzle tied to my address and the date.",
              "Suppose that costs you a second of computing, which you will never notice.",
              "My computer checks the stamp in an instant, and lets the message in.",
              "But a spammer sending ten million messages now needs ten million seconds of computing.",
              "That is about four months of machine time, for one morning's spam.",
              "No company sells the stamps and no office approves them; the cost is enforced by arithmetic."
            ] },
          { slide: { k: "table", title: "Six attempts, one gap", start: 2, head: ["Attempt", "What it gave us", "What it left open"], rows: [
              ["1982  Chaum: ecash", "private digital coins", "a mint checks each coin"],
              ["1996  e-gold", "borderless accounts", "one company to close"],
              ["1997  Back: hashcash", "data that costs work", "each stamp works once"],
              ["1998  Dai: b-money", "a ledger everyone keeps", "how the copies agree"],
              ["1998  Szabo: bit gold", "proofs chained together", "who keeps the registry"],
              ["2004  Finney: RPOW", "tokens you can pass on", "one trusted server"]
            ], note: "Years of first proposal or launch; bit gold was designed in 1998 and published in 2005." },
            at: "lectern", g: "open",
            say: [
              "Let me start keeping score, because a pattern is about to appear.",
              { s: "Chaum gave us private coins but kept a mint, and e-gold gave us reach but kept a company.", g: "weigh" },
              { s: "Hashcash gives us something neither had: digital scarcity with nobody in charge of it.", show: 3 },
              "But a hashcash stamp is not money.",
              "It is made for one message, used once and thrown away, and you cannot pass it on to anyone.",
              "Still, the door was open, and within a year two people walked through it."
            ] },
          { board: { clear: true, title: "b-money: everyone keeps the book", ops: [
              { box: [10, 20, 36, 22], at: 2 },
              { text: "copy A", x: 28, y: 26, a: "c", size: 4, at: 2 },
              { box: [62, 20, 36, 22], at: 2 },
              { text: "copy B", x: 80, y: 26, a: "c", size: 4, at: 2 },
              { box: [114, 20, 36, 22], at: 2 },
              { text: "copy C", x: 132, y: 26, a: "c", size: 4, at: 2 },
              { text: "signed payment", x: 80, y: 60, a: "c", size: 5, at: 3 },
              { arrow: [66, 56, 34, 44], at: 3 },
              { arrow: [80, 55, 80, 44], at: 3 },
              { arrow: [94, 56, 126, 44], at: 3 },
              { text: "X first", x: 28, y: 35, a: "c", size: 4.5, c: "blue", at: 6 },
              { text: "?", x: 80, y: 35, a: "c", size: 7, at: 6 },
              { text: "Y first", x: 132, y: 35, a: "c", size: 4.5, c: "red", at: 6 },
              { text: "which order is the true one?", x: 80, y: 78, a: "c", size: 6, c: "red", at: 6 }
            ] },
            say: [
              "In 1998 a computer scientist named Wei Dai circulated a short proposal called b-money.",
              "His radical move was to delete the keeper and hand the ledger to everybody.",
              "Every participant keeps a full copy of who owns what.",
              "To pay, you broadcast a signed message, and everyone updates their copy.",
              "New money is created by solving costly puzzles, the hashcash idea turned into a mint.",
              { s: "Read it today and it sounds astonishingly familiar, but it has a hole in the middle.", show: 4 },
              "If two conflicting payments are racing across the network, whose copy of the ledger is right?",
              "The design leaned on a broadcast channel that reaches everyone at once and cannot be jammed, and no such channel exists.",
              "It was never built."
            ] },
          { at: "centre", g: "open",
            say: [
              "The same year, Nick Szabo designed a scheme he called bit gold, though he published it only in 2005.",
              "His insight was to chain the puzzles together.",
              "Each solved puzzle becomes the starting point of the next, so the solutions form a line with a built-in order.",
              "Each one is timestamped, and its owner is recorded in a public registry of titles.",
              { s: "Chained proofs of work: remember that phrase, because you will meet it again before this lecture is over.", show: 5, g: "point" },
              "But the registry was still a club of servers that had to agree, and the pieces of bit gold were not all worth the same.",
              "Bit gold, too, stayed on paper."
            ] },
          { at: "right", g: "open",
            say: [
              "Then, in 2004, Hal Finney actually built something.",
              "His system was called RPOW, for reusable proofs of work.",
              "You handed its server a hashcash stamp, and it gave you back a signed token of equal value.",
              "That token could be passed on, person to person, each time swapped for a fresh one so it could not be spent twice.",
              { s: "To earn trust, the server ran inside tamper-resistant hardware that could prove which program it was running.", show: 6 },
              { s: "Clever as that was, it was still one server in one place.", g: "shrug" }
            ] },
          { at: "lectern", g: "count",
            say: [
              "Now look at the right-hand column, top to bottom.",
              "A mint, a company, a single-use stamp, an unanswered question, a registry, a server.",
              "By 2004 nearly every part had been invented: signatures, costly puzzles, chains of proofs, even a ledger held by everyone.",
              { s: "What nobody had was a way for strangers to agree on one history without appointing someone to decide.", g: "lean" },
              "That missing piece has a famous story of its own."
            ] },
          { say: ["Let me see whether the shape of that puzzle stuck.", "What makes a proof of work useful?"],
            quiz: {
              q: "What makes a proof of work useful?",
              options: [
                "It is easy to produce and hard to check",
                "Only a licensed company can issue one",
                "It is hard to produce and easy to check",
                "It keeps the solver's name secret"
              ],
              answer: 2,
              right: ["Yes: slow to make and instant to check, like the combination lock."],
              wrong: [
                ["That is the wrong way round.", "A proof of work is costly to produce, and anyone can check it in a single step."],
                ["The whole point was that no company issues the stamps.", "A proof of work is hard to produce and easy for anyone to check."],
                null,
                ["Secrecy was Chaum's contribution, not hashcash's.", "A proof of work is about cost: hard to produce, and easy to check."]
              ] } }
        ] },

      { id: "byzantine-generals", title: "Agreement Among Strangers", topics: ["byzantine generals", "agreement", "consensus", "fake identities", "voting"],
        beats: [
          { slide: { k: "section", title: "Agreement Among Strangers", sub: "The Byzantine Generals, and the trouble with voting" },
            at: "lectern", g: "open",
            say: [
              "In 1982, the same year as Chaum's paper, three computer scientists published a puzzle about an army.",
              "Their names were Lamport, Shostak and Pease, and they called it the Byzantine Generals Problem.",
              "It has nothing to do with money, and everything to do with our missing piece."
            ] },
          { slide: { k: "figure", title: "The Byzantine Generals", ops: [
              { box: [66, 22, 28, 16], t: "city", c: "grey", fill: true },
              { circle: [30, 12, 6], t: "A", c: "green" },
              { circle: [130, 12, 6], t: "B", c: "green" },
              { circle: [30, 50, 6], t: "C", c: "green" },
              { circle: [130, 50, 6], t: "D", c: "green" },
              { line: [37, 12, 123, 12], c: "grey", dash: true, at: 1 },
              { line: [30, 19, 30, 43], c: "grey", dash: true, at: 1 },
              { line: [130, 19, 130, 43], c: "grey", dash: true, at: 1 },
              { line: [37, 50, 123, 50], c: "grey", dash: true, at: 1 },
              { circle: [130, 50, 8], c: "red", at: 3 },
              { text: "traitor", x: 142, y: 58, a: "c", size: 3.5, c: "red", at: 3 },
              { arrow: [130, 41, 130, 19], c: "red", at: 4 },
              { text: "attack!", x: 134, y: 30, size: 3.5, c: "red", at: 4 },
              { arrow: [121, 50, 37, 50], c: "red", at: 4 },
              { text: "retreat!", x: 80, y: 46, a: "c", size: 3.5, c: "red", at: 4 },
              { text: "the loyal generals must still agree", x: 76, y: 60, a: "c", size: 4, at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "Several generals have a city surrounded, each with their own camp.",
              "They can only talk by messenger, and they must all do the same thing: attack together or retreat together.",
              "A half-hearted attack is the worst outcome of all.",
              { s: "Here is the catch: some of the generals may be traitors.", g: "lean" },
              "A traitor can tell one neighbour to attack and another to retreat.",
              "So the loyal generals need a procedure that gets them to the same decision, whatever the traitors say."
            ] },
          { at: "centre", g: "open",
            say: [
              "The classic solutions work, with two conditions.",
              { s: "You must know exactly who the generals are, and the traitors must be a small minority.", g: "count" },
              "In the original setting, with plain unsigned messages, fewer than a third of them may be traitors.",
              { s: "But notice the word known.", g: "pinch" }
            ] },
          { slide: { k: "compare", title: "Two very different rooms",
              left: { head: "A known committee", points: ["A fixed list of members", "One member, one vote", "Traitors can be counted", "Majority rule works"] },
              right: { head: "The open internet", points: ["Nobody knows who is there", "New identities cost nothing", "One liar, a thousand voices", "Counting heads fails"] } },
            at: "left", g: "weigh",
            say: [
              "A committee has a membership list, so one member, one vote makes sense.",
              "The internet has no membership list.",
              "Anyone can join, anyone can leave, and anyone can show up wearing a thousand different names.",
              "And here is the cruel symmetry: fake identities are just data, and data, as we said, is free to copy.",
              { s: "So if strangers vote on which payment came first, the cheat simply prints more voters.", g: "shrug" }
            ] },
          { board: { clear: true, title: "One liar, a thousand masks", ops: [
              { circle: [20, 30, 7], c: "green", at: 1 },
              { circle: [20, 50, 7], c: "green", at: 1 },
              { circle: [20, 70, 7], c: "green", at: 1 },
              { text: "3 honest", x: 32, y: 50, size: 5, c: "green", at: 1 },
              { text: "1 cheat", x: 120, y: 20, a: "c", size: 5, c: "red", at: 2 },
              { circle: [120, 34, 8], c: "red", at: 2 },
              { arrow: [120, 43, 120, 52], c: "red", at: 2 },
              { circle: [96, 58, 4], c: "red", dash: true, at: 2 },
              { circle: [108, 58, 4], c: "red", dash: true, at: 2 },
              { circle: [120, 58, 4], c: "red", dash: true, at: 2 },
              { circle: [132, 58, 4], c: "red", dash: true, at: 2 },
              { circle: [144, 58, 4], c: "red", dash: true, at: 2 },
              { circle: [96, 70, 4], c: "red", dash: true, at: 2 },
              { circle: [108, 70, 4], c: "red", dash: true, at: 2 },
              { circle: [120, 70, 4], c: "red", dash: true, at: 2 },
              { circle: [132, 70, 4], c: "red", dash: true, at: 2 },
              { circle: [144, 70, 4], c: "red", dash: true, at: 2 },
              { text: "... x 1000", x: 120, y: 82, a: "c", size: 5, c: "red", at: 2 },
              { text: "outvoted", x: 72, y: 64, a: "c", size: 5, c: "red", at: 3 },
              { text: "count heads", x: 72, y: 30, a: "c", size: 4.5, at: 4 },
              { line: [57, 30, 87, 30], c: "red", at: 4 },
              { text: "count work", x: 72, y: 41, a: "c", size: 5.5, c: "green", at: 6 }
            ] },
            say: [
              "Let me draw why b-money and bit gold were stuck.",
              "Here are three honest participants, each with one vote.",
              "And here is one cheat, who creates a thousand fake participants at no cost at all.",
              "A thousand votes beat three, every time.",
              "Counting heads cannot work when heads are free.",
              { s: "So what could you count instead, that cannot be faked for free?", g: "lean" },
              "Hold on to the answer hashcash gave us: work."
            ] },
          { at: "centre", g: "count",
            say: [
              "We want a ledger that everyone holds, so that nobody owns it.",
              "We need all those copies to agree on one order of payments.",
              "And we cannot settle disagreements by vote, because votes are free.",
              { s: "That is exactly where things stood in the autumn of 2008.", g: "open" }
            ] },
          { say: ["One question before the story reaches 2008.", "Why can strangers on the internet not settle a dispute by voting?"],
            quiz: {
              q: "Why can strangers on the internet not settle a dispute by voting?",
              options: [
                "Counting the votes would take too long",
                "Fake identities are free, so a cheat can outvote everyone",
                "Votes cannot be sent over a network",
                "Most people online are dishonest"
              ],
              answer: 1,
              right: ["Exactly: heads are free to make, so counting heads proves nothing."],
              wrong: [
                ["Counting is quick, so that is not the obstacle.", "The obstacle is that identities cost nothing, so one cheat can cast a thousand votes."],
                null,
                ["Votes travel over a network perfectly well.", "The trouble is that fake voters are free, so a cheat simply prints more of them."],
                ["We do not need to assume that most people are dishonest.", "One cheat is enough, because fake identities are free and can outvote everyone."]
              ] } }
        ] },

      { id: "bitcoin-arrives", title: "2008: Nine Pages", topics: ["financial crisis", "whitepaper", "satoshi nakamoto", "genesis block", "first transaction", "hal finney", "absent founder"],
        beats: [
          { slide: { k: "section", title: "2008: Nine Pages", sub: "A crisis, a paper, a block" },
            at: "lectern", g: "open",
            say: [
              "And what an autumn it was.",
              "On 15 September 2008, Lehman Brothers filed the largest bankruptcy in American history.",
              { s: "Within weeks, governments around the world were rescuing banks with public money.", g: "wide" },
              "The keepers of the ledger had turned out to be fragile, and when they failed, everyone else paid."
            ] },
          { slide: { k: "quote", text: "A purely peer-to-peer version of electronic cash would allow online payments to be sent directly from one party to another without going through a financial institution.", by: "Satoshi Nakamoto, Bitcoin whitepaper, abstract, 2008" },
            at: "centre", g: "open",
            say: [
              "On 31 October 2008, a message arrived on a mailing list read by cryptographers.",
              "The author signed as Satoshi Nakamoto, and to this day we do not know who that is.",
              "It linked to a nine-page paper titled Bitcoin: A Peer-to-Peer Electronic Cash System.",
              { s: "And this is how the paper opens.", g: "point" },
              "Read it slowly, because every phrase aims at something from today.",
              { s: "Electronic cash is Chaum's dream, directly from one party to another means no keeper, and no financial institution means no mint, no company, no server.", g: "count" },
              "In the email itself, Satoshi put it even more plainly: fully peer-to-peer, with no trusted third party."
            ] },
          { at: "left", g: "open",
            say: [
              "The reception was polite and sceptical.",
              "The first reply said, in effect, that it would never scale.",
              "After two decades of failed digital cash, you can hardly blame them.",
              "But Hal Finney, the man who built RPOW, wrote back that it seemed a very promising idea.",
              "When the software was released, he was among the very first to run it."
            ] },
          { slide: { k: "figure", title: "Old parts, a new machine", ops: [
              { box: [4, 6, 54, 11], t: "signatures", c: "green", at: 1 },
              { box: [4, 24, 54, 11], t: "ledger held by all", c: "blue", at: 2 },
              { box: [4, 42, 54, 11], t: "proof of work", c: "amber", at: 3 },
              { arrow: [59, 12, 96, 25], at: 4 },
              { arrow: [59, 30, 96, 30], at: 4 },
              { arrow: [59, 47, 96, 35], at: 4 },
              { box: [98, 16, 56, 26], t: "one ordered chain", c: "amber", fill: true, at: 4 },
              { box: [98, 47, 14, 9], t: "1", at: 5 },
              { line: [112, 51.5, 119, 51.5], at: 5 },
              { box: [119, 47, 14, 9], t: "2", at: 5 },
              { line: [133, 51.5, 140, 51.5], at: 5 },
              { box: [140, 47, 14, 9], t: "3", at: 5 },
              { text: "most work = the history", x: 126, y: 61, a: "c", size: 3.8, at: 6 }
            ] },
            at: "screen", g: "point",
            say: [
              "What I love about the paper is how little in it is new.",
              "Ownership is handled by digital signatures, which were decades old.",
              "The ledger is held by everyone, which was Wei Dai's idea, and b-money is the paper's first citation.",
              "Scarcity comes from proof of work, and the paper cites Adam Back's hashcash.",
              { s: "The new part is the way they are joined: proof of work is used to decide the order of payments.", g: "pinch" },
              "Payments are gathered into blocks, each block costs work to produce, and each one is chained to the block before.",
              "Whichever chain has the most work behind it is the history, and to rewrite it you must redo the work.",
              "Nobody votes with names; they vote with computation, and computation cannot be faked for free."
            ] },
          { slide: { k: "quote", text: "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks", by: "Text embedded in Bitcoin's first block, 3 January 2009" },
            at: "centre", g: "open",
            say: [
              "Two months later, the paper became a running system.",
              "On 3 January 2009, Satoshi created the first block of the chain, which we call the genesis block.",
              { s: "Inside it, where a block has room for a little free text, is this line.", g: "point" },
              "It is a headline from that day's Times of London, about Britain's finance minister and another bank rescue.",
              "It does two jobs at once.",
              "It proves the block was not made before that date, because nobody can quote tomorrow's newspaper.",
              "And it tells you, without a word of commentary, what this system was built in answer to."
            ] },
          { slide: { k: "number", value: "Block 170", label: "12 January 2009: Satoshi sends Hal Finney 10 bitcoins", note: "The first payment from one person to another on the network" },
            at: "right", g: "open",
            say: [
              "Nine days after that, the first payment between two people took place.",
              "Satoshi sent 10 bitcoins to Hal Finney, as a test, and it was recorded in block 170.",
              "No bank opened that morning to process it, and no server stood in the middle.",
              "Two computers, running the same open rules, agreed that coins had moved.",
              { s: "After 27 years of trying, digital cash had changed hands with no keeper.", g: "up" }
            ] },
          { slide: { k: "figure", title: "From a crisis to an absent founder", ops: [
              { line: [6, 30, 154, 30], c: "grey" },
              { circle: [14, 30, 1.5], fill: true }, { line: [14, 25, 14, 30] },
              { text: "15 Sep 2008", x: 14, y: 16, a: "c", size: 3.5, c: "grey" },
              { text: "Lehman fails", x: 14, y: 21.5, a: "c", size: 3.8 },
              { circle: [44, 30, 1.5], fill: true }, { line: [44, 30, 44, 35] },
              { text: "31 Oct 2008", x: 44, y: 39, a: "c", size: 3.5, c: "grey" },
              { text: "whitepaper", x: 44, y: 44.5, a: "c", size: 3.8 },
              { circle: [74, 30, 1.5], fill: true }, { line: [74, 25, 74, 30] },
              { text: "3 Jan 2009", x: 74, y: 16, a: "c", size: 3.5, c: "grey" },
              { text: "genesis block", x: 74, y: 21.5, a: "c", size: 3.8 },
              { circle: [98, 30, 1.5], fill: true }, { line: [98, 30, 98, 35] },
              { text: "12 Jan 2009", x: 98, y: 39, a: "c", size: 3.5, c: "grey" },
              { text: "first payment", x: 98, y: 44.5, a: "c", size: 3.8 },
              { circle: [124, 30, 1.5], c: "red", fill: true, at: 3 }, { line: [124, 25, 124, 30], c: "red", at: 3 },
              { text: "Dec 2010", x: 124, y: 16, a: "c", size: 3.5, c: "grey", at: 3 },
              { text: "last public post", x: 124, y: 21.5, a: "c", size: 3.8, c: "red", at: 3 },
              { circle: [146, 30, 1.5], c: "red", fill: true, at: 4 }, { line: [146, 30, 146, 35], c: "red", at: 4 },
              { text: "Apr 2011", x: 146, y: 39, a: "c", size: 3.5, c: "grey", at: 4 },
              { text: "moves on", x: 146, y: 44.5, a: "c", size: 3.8, c: "red", at: 4 },
              { text: "the rules stayed; the author left", x: 80, y: 57, a: "c", size: 4.5, c: "amber", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "Here is the whole arc on one line.",
              "For about two years Satoshi wrote code, answered questions and argued about design in public.",
              "Then the messages thinned out.",
              "The last public forum post is dated December 2010.",
              "In April 2011 came a short email to another developer, saying that Satoshi had moved on to other things.",
              { s: "Since then, silence.", g: "rest" }
            ] },
          { slide: { k: "points", title: "Why an absent founder matters", start: 0, points: [
              "No one to pressure, bribe or arrest",
              "No one whose opinion outranks the rules",
              "No company to go bankrupt",
              "What remains: open code, and everyone who runs it"
            ] },
            at: "centre", g: "open",
            say: [
              "I think this may be the most underrated event in the whole story.",
              { s: "Think back to DigiCash and e-gold: each had someone you could pressure, sue or shut down.", show: 1, g: "count" },
              { s: "A present founder is also a kind of keeper, because people would simply ask what the rules are supposed to mean.", show: 2 },
              { s: "Here there is no head office, no chief executive and no one with a casting vote.", show: 3 },
              { s: "What remains is open code, and thousands of people who choose to run it.", show: 4, g: "wide" },
              "The invention was given away so completely that it no longer needs its inventor."
            ] },
          { say: ["Last question, and it is the heart of today.", "What was the new idea in the Bitcoin paper?"],
            quiz: {
              q: "What was the new idea in the Bitcoin paper?",
              options: [
                "Digital signatures to prove who owns a coin",
                "A ledger that everyone keeps a copy of",
                "Puzzles that make data costly to produce",
                "Using proof of work to put payments in order"
              ],
              answer: 3,
              right: ["That is it: the parts were old, and the way they were joined was new."],
              wrong: [
                ["Signatures were decades old by 2008.", "The new idea was using proof of work to decide the order of payments."],
                ["The shared ledger was Wei Dai's idea, from 1998.", "What was new was using proof of work to decide the order of payments."],
                ["Costly puzzles came from hashcash, in 1997.", "The new step was using that work to decide the order of payments."],
                null
              ] } }
        ] },

      { id: "shape-of-solution", title: "The Shape of the Answer", topics: ["public ledger", "signatures", "proof of work", "nodes", "course map", "hash functions", "verify"],
        beats: [
          { slide: { k: "section", title: "The Shape of the Answer", sub: "Four ideas, and the 13 lectures that open them" },
            at: "lectern", g: "open",
            say: [
              "So that is the history, and now I owe you a map.",
              { s: "From 10,000 metres up, Bitcoin is four ideas working together.", g: "wide" },
              "I am going to draw them once, quickly, and then spend 13 lectures earning the drawing."
            ] },
          { board: { clear: true, title: "Four ideas, one system", ops: [
              { box: [8, 18, 64, 20], t: "1 public ledger", c: "blue", at: 0 },
              { text: "anyone can check", x: 40, y: 43, a: "c", size: 4, c: "grey", at: 1 },
              { box: [88, 18, 64, 20], t: "2 signatures", c: "green", at: 3 },
              { text: "keys, not accounts", x: 120, y: 43, a: "c", size: 4, c: "grey", at: 4 }
            ] },
            say: [
              "Idea one: a public ledger.",
              "Every payment ever made is on it, and anyone may hold a copy and check every line.",
              "There is no single copy to lose, and no single keeper to ask.",
              "Idea two: ownership by signature.",
              "A coin is yours if you hold the secret key that can sign for it, and for no other reason.",
              "Nobody opens an account for you, so nobody can refuse to."
            ] },
          { board: { ops: [
              { box: [8, 56, 64, 20], t: "3 proof of work", c: "amber", at: 0 },
              { text: "sets the order", x: 40, y: 81, a: "c", size: 4, c: "grey", at: 2 },
              { box: [88, 56, 64, 20], t: "4 nodes", c: "red", at: 3 },
              { text: "everyone enforces", x: 120, y: 81, a: "c", size: 4, c: "grey", at: 4 },
              { text: "no keeper", x: 80, y: 49, a: "c", size: 5, at: 6 }
            ] },
            say: [
              "Idea three: ordering by proof of work.",
              "Blocks of payments cost real energy to make, and each is chained to the one before.",
              "The chain with the most work behind it is the one true order, and that is what stops the double spend.",
              "Idea four: rules enforced by everyone.",
              "Every computer that runs the software, which we call a node, checks every block against the same rules.",
              "A block that breaks the rules is simply ignored, no matter who made it or how much work it cost.",
              { s: "Ledger, signatures, work, nodes: four ideas, no keeper.", g: "count" }
            ] },
          { slide: { k: "table", title: "The road ahead: lectures 2 to 8", start: 0, head: ["Lecture", "What it opens up"], rows: [
              ["2  Fingerprints: Hash Functions", "tamper-evident data"],
              ["3  Keys and Signatures", "who is allowed to spend"],
              ["4  Coins Are Outputs", "what the ledger really records"],
              ["5  Programmable Locks", "conditions for spending a coin"],
              ["6  Blocks and the Chain", "pages linked in a fixed order"],
              ["7  Mining: Proof of Work", "why history is costly to rewrite"],
              ["8  Agreement Without a Leader", "how strangers share one history"]
            ] },
            at: "lectern", g: "open",
            say: [
              "Here is where each idea gets opened up.",
              { s: "The tools come first: lecture 2 is Fingerprints: Hash Functions, and lecture 3 is Keys and Signatures.", show: 2 },
              { s: "Then the ledger itself: lecture 4, Coins Are Outputs, and lecture 5, Programmable Locks.", show: 4 },
              { s: "Lecture 6, Blocks and the Chain, shows how the pages are bound together.", show: 5 },
              { s: "Lecture 7, Mining: Proof of Work, is hashcash grown up.", show: 6 },
              { s: "And lecture 8, Agreement Without a Leader, finally answers the generals.", show: 7 }
            ] },
          { slide: { k: "table", title: "The road ahead: lectures 9 to 14", start: 0, head: ["Lecture", "What it opens up"], rows: [
              ["9  The Peer-to-Peer Network", "how payments and blocks travel"],
              ["10  Fees and Block Space", "who gets into a block, and when"],
              ["11  Wallets and Your Own Keys", "holding coins without a keeper"],
              ["12  Privacy and Its Limits", "what a public ledger reveals"],
              ["13  How Bitcoin Changes", "changing rules with no ruler"],
              ["14  Scaling in Layers: Lightning", "fast payments above the chain"]
            ] },
            at: "centre", g: "open",
            say: [
              { s: "After that we go out into the world: lecture 9 is The Peer-to-Peer Network.", show: 1 },
              { s: "Lecture 10, Fees and Block Space, is about what happens when room on the ledger runs short.", show: 2 },
              { s: "Lecture 11 is Wallets and Holding Your Own Keys, where you become your own keeper.", show: 3 },
              { s: "Lecture 12, Privacy and Its Limits, is an honest look at what a public ledger gives away.", show: 4 },
              { s: "Lecture 13, How Bitcoin Changes, asks how rules evolve when nobody is in charge.", show: 5 },
              { s: "And lecture 14, Scaling in Layers: Lightning, brings us back to small, instant payments, like that coin at the market stall.", show: 6 }
            ] },
          { slide: { k: "live", title: "Still running: the latest blocks", panel: "blocks", note: "Live from the Bitcoin network while the hall is open" },
            at: "screen", g: "point",
            say: [
              "One last thing, because none of this is a museum piece.",
              "These are the most recent blocks on the chain, as they stand right now.",
              "A new one arrives about every ten minutes, and each one points back to the block before it.",
              "Follow those links back far enough and you arrive at 3 January 2009 and a newspaper headline.",
              "By the end of this course you will be able to check all of that yourself, on your own machine.",
              { s: "That is the habit I most want you to leave with: do not trust, verify.", g: "pinch" }
            ] },
          { slide: { k: "figure", title: "Next time: a fingerprint for data", ops: [
              { box: [4, 10, 46, 12], t: "pay Ada 5 coins", at: 1 },
              { arrow: [52, 16, 66, 16], at: 1 },
              { box: [68, 10, 24, 12], t: "hash", c: "blue", fill: true, at: 1 },
              { arrow: [94, 16, 108, 16], at: 1 },
              { text: "9f2c...e1a7", x: 112, y: 16, size: 5, c: "green", mono: true, at: 1 },
              { box: [4, 30, 46, 12], t: "pay Ada 6 coins", at: 2 },
              { arrow: [52, 36, 66, 36], at: 2 },
              { box: [68, 30, 24, 12], t: "hash", c: "blue", fill: true, at: 2 },
              { arrow: [94, 36, 108, 36], at: 2 },
              { text: "41b8...07d3", x: 112, y: 36, size: 5, c: "red", mono: true, at: 2 },
              { arrow: [108, 50, 52, 50], c: "red", dash: true, at: 3 },
              { text: "no way back", x: 80, y: 55, a: "c", size: 4, c: "red", at: 3 }
            ], note: "The fingerprints shown are made up for the picture; real ones come next time." },
            at: "lectern", g: "open",
            say: [
              "Next time we pick up the first tool, and it is a strange one.",
              "Imagine a machine that takes any data at all, a word or a whole library, and gives back a short fingerprint of fixed size.",
              "Change one letter of the input and the fingerprint changes completely.",
              "And there is no practical way to run the machine backwards, from fingerprint to data.",
              "That machine is called a hash function.",
              "It is how blocks are chained, how work is proven and how a ledger held by strangers becomes tamper-evident.",
              "Read the whitepaper before then; it is only nine pages, and you now know where its ideas come from.",
              { s: "Thank you, and I will see you in lecture 2.", g: "up" }
            ] }
        ] }
    ]
  });
})();
