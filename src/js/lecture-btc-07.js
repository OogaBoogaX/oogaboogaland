// Bitcoin from First Principles, lecture 7: mining as a lottery (change the nonce, hash the header, hope to land under the target), why nothing beats guessing, the target and the retargeting every 2,016 blocks, the coinbase transaction (subsidy plus fees), the halving every 210,000 blocks and the sum that stops just under 21 million, hardware and pools, and what the energy buys and costs.
(() => {
  "use strict";
  window.BL.lectures.add({
    id: "btc-07", course: "first-principles", n: 7, title: "Mining: Proof of Work",
    reading: [
      { title: "Bitcoin: A Peer-to-Peer Electronic Cash System, sections 4 and 6", by: "Satoshi Nakamoto, 2008" },
      { title: "Hashcash: A Denial of Service Counter-Measure", by: "Adam Back, 2002" },
      { title: "Bitcoin Developer Guide: Mining", by: "developer.bitcoin.org" }
    ],
    sources: [
      "Satoshi Nakamoto, Bitcoin: A Peer-to-Peer Electronic Cash System (2008), sections 4 (Proof-of-Work) and 6 (Incentive), https://bitcoin.org/bitcoin.pdf and https://nakamotoinstitute.org/library/bitcoin/",
      "Adam Back, Hashcash: A Denial of Service Counter-Measure (2002), http://www.hashcash.org/papers/hashcash.pdf, with https://en.wikipedia.org/wiki/Hashcash for the 20-bit stamp",
      "Bitcoin Core, src/pow.cpp (GetNextWorkRequired, CalculateNextWorkRequired: the 2,016-block retarget and its factor-of-four limits), https://github.com/bitcoin/bitcoin/blob/master/src/pow.cpp",
      "Bitcoin Core, src/validation.cpp (GetBlockSubsidy), https://github.com/bitcoin/bitcoin/blob/master/src/validation.cpp",
      "Bitcoin Core, src/kernel/chainparams.cpp (nSubsidyHalvingInterval 210000, nPowTargetTimespan two weeks, nPowTargetSpacing ten minutes, the genesis block), https://github.com/bitcoin/bitcoin/blob/master/src/kernel/chainparams.cpp",
      "Bitcoin developer documentation, Block Chain (proof of work, the target, the coinbase transaction and its 100-block wait), https://developer.bitcoin.org/devguide/block_chain.html",
      "Bitcoin developer documentation, Mining (solo and pooled mining, shares, the extra nonce), https://developer.bitcoin.org/devguide/mining.html",
      "Bitcoin Wiki, Difficulty, https://en.bitcoin.it/wiki/Difficulty",
      "Bitcoin Wiki, Controlled supply (the 20,999,999.9769 total and the subsidy ending at block 6,930,000), https://en.bitcoin.it/wiki/Controlled_supply",
      "Block 32,256, the first after the first change of difficulty (30 December 2009, difficulty 1.18), https://www.blockchain.com/explorer/blocks/btc/32256",
      "Block 97,834, the first known to be mined by a pool (16 December 2010), https://www.blockchain.com/explorer/blocks/btc/97834, with https://en.bitcoin.it/wiki/Slush_Pool",
      "Cambridge Centre for Alternative Finance, Cambridge Digital Mining Industry Report (April 2025): 138 TWh, about 0.5% of world electricity, 39.8 MtCO2e, 52.4% sustainable among surveyed miners, https://www.jbs.cam.ac.uk/2025/cambridge-study-sustainable-energy-rising-in-bitcoin-mining/",
      "Alex de Vries and Christian Stoll, Bitcoin's growing e-waste problem, Resources, Conservation and Recycling 175 (2021) 105901, https://doi.org/10.1016/j.resconrec.2021.105901",
      "Hashrate Index, network hashrate estimates through 2026 (30-day averages between about 920 and 1,066 EH/s), https://hashrateindex.com/blog/global-hashrate-heatmap-update-q3-2026/"
    ],
    sections: [
      { id: "lottery", title: "A Lottery Anyone May Enter", topics: ["mining", "nonce", "guessing", "lottery", "block header", "one cpu one vote"],
        beats: [
          { slide: { k: "title", kicker: "Lecture 7", title: "Mining: Proof of Work", sub: "The lottery, the difficulty, the subsidy and the cap" },
            at: "lectern", g: "open",
            say: [
              "Welcome back to Bitcoin from First Principles.",
              "Last time we bound the ledger's pages together: blocks, each with a small header that points back at the one before.",
              "One field in that header looked like a spare part: a plain number called the nonce.",
              "Today that spare part turns out to drive the whole machine.",
              { s: "In lecture 1 I promised you that mining is hashcash grown up, and today I pay that debt.", g: "point" },
              { s: "So here is today's question: who gets to write the next page of the ledger, and why should anyone believe them?", g: "lean" }
            ] },
          { slide: { k: "points", title: "Four questions for today", start: 0, points: [
              "How is a block made?",
              "How hard is it, and who decides?",
              "What is the miner paid, and for how long?",
              "What does the work buy, and what does it cost?"
            ] },
            at: "centre", g: "count",
            say: [
              { s: "First, how a block actually gets made, which turns out to be a lottery.", show: 1 },
              { s: "Second, how hard that lottery is, and who sets the odds when nobody is in charge.", show: 2 },
              { s: "Third, what the winner is paid, and why the pay is scheduled to shrink to nothing.", show: 3 },
              { s: "And fourth, the question people argue about most: what all that work buys, and what it costs.", show: 4, g: "weigh" }
            ] },
          { slide: { k: "figure", title: "One header, one free number", ops: [
              { box: [3, 6, 24, 11], t: "version", size: 3.6 },
              { box: [29, 6, 24, 11], t: "prev hash", size: 3.6 },
              { box: [55, 6, 24, 11], t: "merkle root", size: 3.6 },
              { box: [81, 6, 24, 11], t: "time", size: 3.6 },
              { box: [107, 6, 24, 11], t: "target", size: 3.6 },
              { box: [133, 6, 24, 11], t: "nonce", size: 3.6, c: "amber", fill: true, at: 2 },
              { line: [3, 21, 157, 21], c: "grey", at: 3 },
              { arrow: [80, 21, 80, 27], at: 3 },
              { box: [58, 28, 44, 11], t: "SHA-256, twice", c: "blue", fill: true, at: 3 },
              { arrow: [80, 39, 80, 44], at: 4 },
              { text: "one very large number", x: 80, y: 49, a: "c", size: 4.5, at: 4 },
              { text: "the block counts only if that number is below the target", x: 80, y: 59, a: "c", size: 4.2, c: "green", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "Here is the header again, six fields and 80 bytes in all.",
              "Five are more or less settled by the block: its version, the previous block's fingerprint, the Merkle root, the time and the target, the field lecture 6 called bits.",
              { s: "The sixth, the nonce, means nothing at all, and the miner may set it to anything.", g: "pinch" },
              "Feed the whole header through SHA-256 twice, the fingerprint machine from lecture 2.",
              "Out comes a fingerprint, and a fingerprint is just a very large number written down.",
              "Bitcoin's rule is one line long: a block only counts if that number is below a threshold called the target."
            ] },
          { board: { clear: true, title: "Guess, hash, compare", ops: [
              { box: [8, 34, 40, 14], t: "header + nonce", at: 1 },
              { arrow: [50, 41, 66, 41], at: 2 },
              { box: [68, 34, 28, 14], t: "hash", c: "blue", at: 2 },
              { arrow: [98, 41, 114, 41], at: 3 },
              { box: [116, 34, 36, 14], t: "< target?", c: "amber", at: 3 },
              { path: [134, 48, 134, 64, 28, 64], c: "red", at: 4 },
              { arrow: [28, 64, 28, 49], c: "red", at: 4 },
              { text: "no: nonce + 1, again", x: 81, y: 70, a: "c", size: 5, c: "red", at: 4 },
              { text: "guess, hash, compare", x: 80, y: 84, a: "c", size: 5.5, at: 5 },
              { arrow: [134, 34, 134, 25], c: "green", at: 6 },
              { text: "yes: a block", x: 134, y: 21, a: "c", size: 5, c: "green", at: 6 }
            ] },
            say: [
              "Let me draw what a miner's machine does all day.",
              "It takes the header, with some number in the nonce.",
              "It hashes it.",
              "It compares the result with the target.",
              "Too big, which is what happens nearly every time, so it adds one to the nonce and goes round again.",
              "That is the entire job: guess, hash, compare, billions upon billions of times a second.",
              "And once in a very long while a result lands under the target, and that header is a valid block.",
              { s: "Finding it took an ocean of guesses, and checking it takes anyone a single look.", g: "pinch" }
            ] },
          { at: "centre", g: "open",
            say: [
              "Now, surely there is a cleverer way than guessing.",
              "There is not, and the reason is the property of hash functions we met in lecture 2.",
              "Change the nonce by one and the fingerprint changes completely, with no pattern linking the old one to the new.",
              { s: "There is no warmer and no colder, so a miner cannot creep towards the target.", g: "chop" },
              "Each guess is a fresh lottery ticket, with the same tiny chance as every ticket before it.",
              "A miner who has been guessing for nine minutes is no closer to winning than one who started a second ago.",
              { s: "The only way to win more often is to buy more tickets, and every ticket costs a little electricity.", g: "pinch" }
            ] },
          { slide: { k: "quote", text: "Proof-of-work is essentially one-CPU-one-vote.", by: "Satoshi Nakamoto, Bitcoin whitepaper, section 4, 2008" },
            at: "left", g: "open",
            say: [
              "The whitepaper puts the consequence in one short line.",
              "Remember the cheat from lecture 1, who printed a thousand fake voters for nothing.",
              "A thousand fake names buy no extra tickets in this lottery, because tickets are paid for in computation.",
              { s: "Anyone may enter, nobody needs permission, and nobody's guess counts for more than the work behind it.", g: "wide" },
              "How those votes settle an argument is next lecture's business; today we only need the lottery itself."
            ] },
          { say: ["Let me check that the lottery has landed.", "Why can a miner do no better than guessing?"],
            quiz: {
              q: "Why can a miner do no better than guessing?",
              options: [
                "Each miner is allowed one guess per block",
                "The rules forbid any cleverer method",
                "A hash cannot be predicted without computing it",
                "The nonce is kept secret from miners"
              ],
              answer: 2,
              right: ["Exactly: the only way to learn a hash is to compute it, so every guess is a blind ticket."],
              wrong: [
                ["Miners may guess as often as their machines allow, billions of times a second.", "They guess because a hash cannot be predicted without computing it."],
                ["No rule is needed, because no cleverer method is known to exist.", "A hash cannot be predicted without computing it, so guessing is all there is."],
                null,
                ["The nonce is no secret, since the miner chooses it freely.", "What cannot be known in advance is the hash, so every nonce is a blind guess."]
              ]
            } }
        ] },

      { id: "the-target", title: "A Line Across the Numbers", topics: ["target", "leading zeros", "odds of a block", "nonce range", "extra nonce", "hashcash"],
        beats: [
          { slide: { k: "section", title: "A Line Across the Numbers", sub: "The target, and the odds it sets" },
            at: "lectern", g: "open",
            say: [
              "So the whole lottery hangs on one threshold, the target.",
              "Let us look at it properly, because it is simpler than its reputation.",
              "A hash is 256 bits long, so it is a number somewhere between zero and two to the power of 256.",
              { s: "Written out in ordinary digits, that upper limit is 78 digits long.", g: "wide" }
            ] },
          { board: { clear: true, title: "The target is a line", ops: [
              { line: [10, 40, 150, 40], at: 0 },
              { text: "0", x: 10, y: 49, a: "c", size: 5, at: 0 },
              { text: "2^256", x: 146, y: 49, a: "c", size: 5, at: 0 },
              { circle: [58, 35, 1.5], c: "grey", fill: true, at: 1 },
              { circle: [97, 35, 1.5], c: "grey", fill: true, at: 1 },
              { circle: [121, 35, 1.5], c: "grey", fill: true, at: 1 },
              { circle: [76, 35, 1.5], c: "grey", fill: true, at: 1 },
              { circle: [140, 35, 1.5], c: "grey", fill: true, at: 1 },
              { line: [36, 26, 36, 54], c: "amber", at: 2 },
              { text: "target", x: 36, y: 22, a: "c", size: 5, c: "amber", at: 2 },
              { circle: [22, 35, 2], c: "green", fill: true, at: 3 },
              { text: "block", x: 22, y: 62, a: "c", size: 5, c: "green", at: 3 },
              { text: "guess again", x: 94, y: 62, a: "c", size: 5, c: "red", at: 3 },
              { text: "odds of one guess = target / 2^256", x: 80, y: 74, a: "c", size: 5, at: 4 },
              { line: [18, 26, 18, 54], c: "red", dash: true, at: 6 },
              { arrow: [34, 30, 20, 30], c: "red", at: 6 },
              { text: "lower target, longer odds", x: 80, y: 85, a: "c", size: 5, c: "red", at: 6 }
            ] },
            say: [
              "Lay every possible hash out along a line, from zero on the left to that enormous number on the right.",
              "Each guess lands somewhere on the line, and every spot is as likely as every other.",
              "The target is a mark on the line.",
              "Land to the left of the mark and you have a block; land to the right, as you nearly always will, and you guess again.",
              "So the odds of any one guess are simply the target divided by the length of the line.",
              "In the real system the mark sits so close to zero that I could not draw it at this scale.",
              "Move the mark further left and the winning stretch shrinks, so on average everyone needs more guesses.",
              { s: "Lowering the target makes mining harder, and that upside-down phrase catches everybody once.", g: "shrug" }
            ] },
          { slide: { k: "code", title: "What winning looks like", start: 0, lines: [
              "target    0000000000000000000234a1...",
              "nonce 1   c91f7e02ab5d3c886f10e4b7...   too big",
              "nonce 2   3a60d85b11f9e7c2409ad3f6...   too big",
              "nonce 3   f7024be9d0c15a38e62b97c0...   too big",
              "  ...     billions more, all too big",
              "nonce n   000000000000000000017c3e...   a block"
            ], note: "The digits are made up for the picture; a real hash runs to 64 of them." },
            at: "screen", g: "point",
            say: [
              { s: "Here is the same thing in the notation a computer prints it in.", show: 1 },
              "The target is written out at full width, so a small target begins with a long run of zeros.",
              { s: "Nearly every guess gives a number that begins with anything but zeros, and is far too big.", show: 5 },
              { s: "The winner is the first hash that slips in under the target.", show: 6 },
              "That is why every real block's fingerprint begins with a row of zeros: it is a small number, written out in full.",
              "People say miners hunt for zeros, but they are really hunting for a number that is small enough."
            ] },
          { slide: { k: "compare", title: "Hashcash, grown up",
              left: { head: "Hashcash, 1997", points: ["A stamp on one email", "Pass mark: 20 zero bits", "About a million guesses", "Used once, thrown away"] },
              right: { head: "Bitcoin mining", points: ["A seal on a block of payments", "Pass mark: a movable target", "As many guesses as it takes", "Each seal builds on the last"] } },
            at: "left", g: "weigh",
            say: [
              "Now I can pay the debt from lecture 1.",
              "Adam Back's hashcash stamp was exactly this game: add a counter to a message, and hash until the result starts with enough zeros.",
              "The usual pass mark was 20 zero bits, which takes about a million guesses.",
              "The whitepaper says where it got the idea, calling for a proof-of-work system similar to Adam Back's Hashcash.",
              { s: "So what did growing up involve?", g: "lean" },
              "First, the pass mark became a target that can sit anywhere on the line, so the odds can be tuned finely rather than only doubled or halved.",
              "Second, the stamps are no longer thrown away, because each one seals a block that the next block is built upon."
            ] },
          { slide: { k: "number", value: "4,294,967,296", label: "values the nonce can hold: 32 bits, about 4.3 billion", note: "Not nearly enough: a modern machine tries them all in a blink" },
            at: "centre", g: "open",
            say: [
              "One practical wrinkle, and it is a nice one.",
              "The nonce is only four bytes long, so it can hold about 4.3 billion different values.",
              "In 2009 that kept an ordinary computer busy for many minutes.",
              "A modern mining machine runs through all of them in well under a thousandth of a second.",
              "So miners change something else as well: the time field, or a few spare bytes in the block's first transaction.",
              "Change those bytes and the Merkle root changes, which gives a brand new header and 4.3 billion fresh tickets.",
              { s: "The supply of tickets never runs out; it is only the electricity to try them that costs anything.", g: "shrug" }
            ] },
          { say: ["A quick check on that upside-down phrase.", "What happens when the target is lowered?"],
            quiz: {
              q: "What happens when the target is lowered?",
              options: [
                "Miners are paid less for each block",
                "The nonce gets longer",
                "More hashes qualify, so blocks come faster",
                "Fewer hashes qualify, so blocks take more guesses"
              ],
              answer: 3,
              right: ["Right: a lower mark leaves a smaller winning stretch, so more guesses are needed."],
              wrong: [
                ["The target has no say over the pay, which follows its own timetable.", "A lower target means fewer hashes qualify, so a block takes more guesses."],
                ["The nonce stays four bytes long whatever the target does.", "A lower target means fewer hashes qualify, so a block takes more guesses."],
                ["That is the trap, because a lower target is a smaller one.", "Fewer hashes fall below it, so finding a block takes more guesses."],
                null
              ]
            } }
        ] },

      { id: "retargeting", title: "The Lottery Tunes Itself", topics: ["difficulty", "retargeting", "2,016 blocks", "ten minutes", "hashrate", "block times"],
        beats: [
          { slide: { k: "section", title: "The Lottery Tunes Itself", sub: "Ten minutes a block, whatever the hashrate does" },
            at: "lectern", g: "open",
            say: [
              "Here is a problem the hashcash stamp never had to face.",
              "If more machines join the lottery, more tickets are bought each second, and blocks are found sooner.",
              "Left alone, a network that grew a thousandfold would be finding a block in under a second.",
              "Bitcoin wants the opposite: a steady beat of one block about every ten minutes, however many miners turn up.",
              "The number of guesses made each second, across all the miners together, is called the hashrate.",
              { s: "So the target must move as the hashrate moves, and the question is who moves it.", g: "lean" }
            ] },
          { board: { clear: true, title: "Every 2,016 blocks", ops: [
              { line: [10, 30, 150, 30], at: 1 },
              { line: [10, 26, 10, 34], at: 1 },
              { line: [150, 26, 150, 34], at: 1 },
              { text: "2,016 blocks", x: 80, y: 24, a: "c", size: 5, at: 1 },
              { text: "planned: 14 days", x: 80, y: 40, a: "c", size: 5, c: "blue", at: 2 },
              { text: "took 7 days", x: 14, y: 54, size: 5, c: "red", at: 3 },
              { arrow: [60, 53, 82, 53], c: "red", at: 3 },
              { text: "target halved", x: 88, y: 54, size: 5, c: "red", at: 3 },
              { text: "took 28 days", x: 14, y: 66, size: 5, c: "green", at: 4 },
              { arrow: [60, 65, 82, 65], c: "green", at: 4 },
              { text: "target doubled", x: 88, y: 66, size: 5, c: "green", at: 4 },
              { text: "new target = old x time taken / 14 days", x: 80, y: 80, a: "c", size: 5, at: 5 }
            ] },
            say: [
              "The answer is that everybody moves it, by doing the same sum.",
              "Every 2,016 blocks, each node looks back at how long those blocks took to arrive.",
              "At ten minutes each they should take exactly 14 days, because 2,016 times ten minutes is two weeks.",
              "If they took only seven days, the lottery was twice too easy, so the target is cut in half.",
              "If they took 28 days, it was twice too hard, so the target is doubled.",
              "In general the new target is the old one, scaled by the time taken over the time planned.",
              "And a single adjustment is never allowed to move the target by more than a factor of four either way."
            ] },
          { slide: { k: "points", title: "Nobody turns the dial", start: 0, points: [
              "The inputs are public: the times in the headers",
              "The sum is fixed: every node gets the same answer",
              "A block made to the wrong target is ignored",
              "The price: up to 2,016 blocks before a correction"
            ] },
            at: "centre", g: "open",
            say: [
              { s: "Notice what is missing from that picture: a committee.", g: "chop" },
              { s: "The only inputs are the times written in the block headers, which everyone already has.", show: 1 },
              { s: "The sum is the same on every machine, so every node arrives at the same new target without asking anyone.", show: 2 },
              { s: "A miner who uses an easier target simply produces blocks that every node ignores.", show: 3 },
              { s: "The price of this simplicity is a lag, because nothing is corrected until the 2,016 blocks are up.", show: 4 },
              "If the hashrate leaps, blocks come a little fast for a while, and if it collapses, they come slow.",
              "The whitepaper spends a sentence or two on all of this, speaking of a moving average that aims at a number of blocks per hour."
            ] },
          { slide: { k: "figure", title: "A thermostat for block times", ops: [
              { box: [8, 6, 50, 12], t: "more miners join", at: 1 },
              { arrow: [60, 12, 100, 12], at: 1 },
              { box: [102, 6, 50, 12], t: "blocks come faster", c: "red", at: 1 },
              { arrow: [127, 19, 127, 33], at: 2 },
              { box: [102, 34, 50, 12], t: "target is lowered", c: "amber", at: 2 },
              { arrow: [100, 40, 60, 40], at: 3 },
              { box: [8, 34, 50, 12], t: "ten minutes again", c: "green", at: 3 },
              { text: "the same loop runs backwards when miners leave", x: 80, y: 57, a: "c", size: 4.2, at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "It behaves like a thermostat, so let us walk once round the loop.",
              "More miners join, more tickets are bought, and blocks start arriving faster than every ten minutes.",
              "At the next adjustment the nodes see that, and lower the target in proportion.",
              "With longer odds for everyone, blocks drift back to ten minutes apart.",
              "When miners leave, the same loop runs the other way, and the target rises to meet them.",
              "For most of 2009 the target sat at its easiest allowed setting, and the first tightening came on 30 December that year.",
              "Notice, too, that ten minutes is only an average: some blocks arrive seconds apart, and now and then one takes an hour."
            ] },
          { slide: { k: "live", title: "The difficulty, right now", panel: "difficulty", note: "Live from the Bitcoin network while the hall is open" },
            at: "screen", g: "point",
            say: [
              "Here is that loop running as we speak.",
              "Difficulty is just the target turned upside down: it says how many times harder the lottery is than at its easiest setting.",
              "At that easiest setting, where the network began, a block took about four billion guesses on average.",
              "When I wrote this lecture the difficulty stood above a hundred trillion.",
              "The panel shows how far we are through the current run of 2,016 blocks, and which way the next adjustment is leaning.",
              { s: "No one will announce that adjustment; every node will simply compute it, and agree.", g: "pinch" }
            ] },
          { say: ["Let me test the thermostat.", "If the hashrate doubles overnight, what happens next?"],
            quiz: {
              q: "If the hashrate doubles overnight, what happens next?",
              options: [
                "Blocks speed up until the target is lowered",
                "Nothing changes, not even for a day",
                "Blocks come every five minutes from then on",
                "Twice as many bitcoins are issued, for good"
              ],
              answer: 0,
              right: ["Yes: a short run of fast blocks, and then the next adjustment restores ten minutes."],
              wrong: [
                null,
                ["The correction is not instant, because the target only moves every 2,016 blocks.", "Until then blocks come faster, and after it they return to ten minutes."],
                ["They would, but only until the next adjustment.", "Blocks come faster for a while, and then the target is lowered to restore ten minutes."],
                ["Faster blocks do bring coins a little sooner, but only for a while.", "The target is lowered at the next adjustment, and blocks return to ten minutes."]
              ]
            } }
        ] },

      { id: "block-reward", title: "What the Winner Is Paid", topics: ["coinbase transaction", "subsidy", "fees", "block reward", "new coins", "why it is called mining"],
        beats: [
          { slide: { k: "section", title: "What the Winner Is Paid", sub: "The coinbase transaction: subsidy plus fees" },
            at: "lectern", g: "open",
            say: [
              "So miners burn electricity buying lottery tickets, and we had better ask why.",
              "The answer is on the first line of every block.",
              "In lecture 4 we saw that every transaction spends coins that an earlier transaction created.",
              { s: "That leaves an awkward question: where did the very first coins come from?", g: "shrug" }
            ] },
          { slide: { k: "figure", title: "The first transaction in every block", ops: [
              { box: [6, 3, 70, 56], c: "grey" },
              { text: "block", x: 41, y: 8, a: "c", size: 3.8, c: "grey" },
              { box: [12, 26, 58, 8], t: "payment" },
              { box: [12, 37, 58, 8], t: "payment" },
              { box: [12, 48, 58, 8], t: "payment" },
              { box: [12, 12, 58, 10], t: "coinbase transaction", c: "amber", fill: true, at: 1 },
              { text: "nothing goes in", x: 119, y: 8, a: "c", size: 4, c: "grey", at: 1 },
              { arrow: [78, 20, 94, 20], c: "amber", at: 2 },
              { box: [96, 13, 46, 14], t: "to the miner", c: "green", at: 2 },
              { text: "new coins: the subsidy", x: 119, y: 37, a: "c", size: 4.2, c: "amber", at: 3 },
              { text: "+ fees from the payments", x: 119, y: 45, a: "c", size: 4.2, c: "blue", at: 4 },
              { text: "the only source of new bitcoin", x: 119, y: 57, a: "c", size: 4.2, at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "A block is a list of transactions, and the first one on the list is special.",
              "It is called the coinbase transaction, and unlike every other it spends nothing: no earlier coin goes in.",
              "It simply pays out, and the miner who builds the block writes it to pay themselves.",
              "Part of what it pays is brand new coins, created on the spot, and that part is called the subsidy.",
              "The rest is fees: the small amounts that the block's other transactions leave unclaimed for whoever mines them.",
              { s: "This is the only way a bitcoin ever comes into existence: as the prize in the lottery.", g: "pinch" },
              "The whitepaper introduces it in a phrase: a special transaction that starts a new coin owned by the creator of the block."
            ] },
          { slide: { k: "compare", title: "Two parts of one prize",
              left: { head: "The subsidy", points: ["New coins, made in the block", "Size fixed by a timetable", "Shrinks over time, to nothing", "The same for every miner"] },
              right: { head: "The fees", points: ["Existing coins, changing hands", "Offered by the block's payers", "More when space is short", "Different in every block"] } },
            at: "right", g: "weigh",
            say: [
              "So the prize has two parts with very different characters.",
              "The subsidy is new money on a fixed timetable, and no miner can vote themselves a bigger one.",
              "The fees are old money, offered by people who want their payments in a block, and lecture 10 is all about them.",
              "A miner may claim less than the two together, but never a fraction more.",
              { s: "Claim too much and the block breaks the rules, so every node throws it away, work and all.", g: "chop" },
              "There is one more safeguard: the miner must wait until 100 further blocks have been added before spending the prize.",
              "The reason for that wait belongs to next lecture, when we see that a block can occasionally be set aside."
            ] },
          { slide: { k: "quote", text: "In our case, it is CPU time and electricity that is expended.", by: "Satoshi Nakamoto, Bitcoin whitepaper, section 6, 2008" },
            at: "centre", g: "open",
            say: [
              "Why is this called mining at all?",
              "The whitepaper compares the steady arrival of new coins to gold miners spending resources to bring gold into circulation.",
              { s: "And then it says what the resource is.", g: "point" },
              "A gold miner pays in diesel and labour; a Bitcoin miner pays in computation, and computation is electricity.",
              "The prize does two jobs at once.",
              "It hands out the coins without a central mint, and it gives strangers a reason to spend real resources guarding the ledger.",
              { s: "Nobody is asked to be virtuous; they are paid to be useful.", g: "open" }
            ] }
        ] },

      { id: "halving-and-cap", title: "The Halving and the Cap", topics: ["halving", "210,000 blocks", "21 million", "supply schedule", "satoshi", "last coin"],
        beats: [
          { slide: { k: "section", title: "The Halving and the Cap", sub: "50, 25, 12.5 ... and a sum that stops" },
            at: "lectern", g: "open",
            say: [
              "Now for the timetable, which is the most famous arithmetic in Bitcoin.",
              "The first block paid a subsidy of 50 bitcoins.",
              "The rule says that every 210,000 blocks, the subsidy is cut in half.",
              "At ten minutes a block, 210,000 blocks take almost exactly four years.",
              { s: "That is the whole policy, and it fits in three lines.", g: "pinch" }
            ] },
          { slide: { k: "code", title: "The subsidy rule, in three lines", start: 0, lines: [
              "halvings = block height / 210,000   (whole part only)",
              "subsidy  = 50 coins, counted in satoshis",
              "halve it once per halving, dropping any remainder"
            ], note: "Paraphrased from GetBlockSubsidy in Bitcoin Core's validation.cpp" },
            at: "screen", g: "point",
            say: [
              { s: "Take the block's height, its position in the chain, and divide by 210,000, keeping the whole part.", show: 1 },
              { s: "Start from 50 coins, counted in the smallest unit the system has.", show: 2 },
              "That unit is a hundred-millionth of a bitcoin, and it is called a satoshi.",
              { s: "Then halve it once for every halving so far, throwing away any fraction of a satoshi.", show: 3 },
              "I have paraphrased, but the real function in the reference software is barely longer.",
              { s: "There is no clause about the economy, no meeting and no discretion: only the block's height goes in.", g: "chop" }
            ] },
          { slide: { k: "table", title: "The halvings so far", start: 0, head: ["From block", "Date", "Subsidy per block"], rows: [
              ["0", "3 January 2009", "50"],
              ["210,000", "28 November 2012", "25"],
              ["420,000", "9 July 2016", "12.5"],
              ["630,000", "11 May 2020", "6.25"],
              ["840,000", "20 April 2024", "3.125"],
              ["1,050,000", "expected 2028", "1.5625"]
            ], note: "Dates in UTC; the 2028 date depends on how fast blocks actually arrive." },
            at: "right", g: "count",
            say: [
              "Here it is, played out in history.",
              { s: "For nearly four years every block paid 50 new coins.", show: 1 },
              { s: "In November 2012 that fell to 25, and in July 2016 to twelve and a half.", show: 3 },
              { s: "May 2020 brought six and a quarter, and April 2024 brought 3.125, which is where it stands as I give this lecture.", show: 5 },
              { s: "The next cut, to just over one and a half, is due at block 1,050,000, some time in 2028.", show: 6 },
              "Notice that the timetable is counted in blocks, not in dates, so the calendar is only ever an estimate."
            ] },
          { board: { clear: true, title: "The halving staircase", ops: [
              { line: [14, 18, 14, 70], at: 0 },
              { line: [14, 70, 150, 70], at: 0 },
              { path: [14, 22, 40, 22, 40, 46], c: "amber", at: 1 },
              { text: "50", x: 27, y: 18, a: "c", size: 5, at: 1 },
              { path: [40, 46, 66, 46, 66, 58], c: "amber", at: 2 },
              { text: "25", x: 53, y: 42, a: "c", size: 5, at: 2 },
              { path: [66, 58, 92, 58, 92, 64], c: "amber", at: 3 },
              { text: "12.5", x: 79, y: 54, a: "c", size: 4.5, at: 3 },
              { path: [92, 64, 118, 64, 118, 67, 144, 67], c: "amber", at: 3 },
              { text: "6.25 ...", x: 108, y: 60, a: "c", size: 4, at: 3 },
              { text: "210,000 blocks each, about 4 years", x: 80, y: 77, a: "c", size: 4.5, c: "grey", at: 4 },
              { text: "each step: same width, half the height", x: 80, y: 86, a: "c", size: 4.5, at: 5 }
            ] },
            say: [
              "Let me draw it, because the shape explains the cap.",
              "The first step is 50 coins high and 210,000 blocks wide.",
              "The second is the same width and half the height.",
              "Then half again, and half again, each step shorter than the last.",
              "Every step is the same 210,000 blocks, about four years.",
              "The coins issued in each era are the area under its step, and each area is half the one before.",
              { s: "So the first era issued half of everything, the second a quarter, the third an eighth.", g: "count" }
            ] },
          { board: { clear: true, title: "Why the sum stops", ops: [
              { text: "210,000 x 50 = 10,500,000", x: 12, y: 22, size: 5, at: 0 },
              { text: "+ 5,250,000", x: 12, y: 31, size: 5, at: 1 },
              { text: "+ 2,625,000 + ...", x: 12, y: 40, size: 5, at: 2 },
              { box: [12, 48, 136, 12], at: 3 },
              { box: [12, 48, 68, 12], t: "1/2", c: "amber", fill: true, at: 3 },
              { box: [80, 48, 34, 12], t: "1/4", c: "blue", fill: true, at: 4 },
              { box: [114, 48, 17, 12], t: "1/8", c: "green", fill: true, at: 4 },
              { text: "...", x: 139, y: 56, a: "c", size: 5, at: 4 },
              { text: "closer every step, never past the end", x: 80, y: 70, a: "c", size: 4.5, c: "red", at: 5 },
              { text: "210,000 x 100 = 21,000,000", x: 80, y: 83, a: "c", size: 5.5, c: "green", at: 6 }
            ] },
            say: [
              "Now add up the areas: the first era issued 210,000 blocks times 50 coins, which is ten and a half million.",
              "The second era added half as much, five and a quarter million.",
              "The third added half of that, and so on down the staircase.",
              "Picture a bar, and fill half of it.",
              "Then fill half of what is left, and half of what is left after that.",
              "You get closer to the end with every step, and you never go past it.",
              "Fifty plus 25 plus twelve and a half, and so on for ever, closes in on 100, and 210,000 times 100 is 21 million.",
              { s: "Nobody declared a limit of 21 million; it falls out of two numbers and the word half.", g: "pinch" }
            ] },
          { slide: { k: "number", value: "20,999,999.9769", label: "the most bitcoins that can ever exist", note: "Rounding down to whole satoshis at each halving leaves it just short of 21 million" },
            at: "centre", g: "open",
            say: [
              "In fact the true total is a shade under 21 million.",
              "Each halving throws away any fraction of a satoshi, and those crumbs are never issued.",
              "After 32 halvings the subsidy is a single satoshi, and the 33rd takes it to zero.",
              "That happens at block 6,930,000, which at ten minutes a block falls around the year 2140.",
              { s: "But look how front-loaded the staircase is: by the 2024 halving, almost 94 per cent of all the coins had already been issued.", g: "wide" },
              "After the last one, miners are paid in fees alone, and whether fees will be enough is an open question that I will not pretend to settle."
            ] },
          { say: ["Let me check that the arithmetic has sunk in.", "Why can there never be more than 21 million bitcoins?"],
            quiz: {
              q: "Why can there never be more than 21 million bitcoins?",
              options: [
                "A committee stops issuing them at 21 million",
                "The subsidy keeps halving, so the sum has a limit",
                "There are only 21 million possible nonces",
                "Miners have agreed to switch off in 2140"
              ],
              answer: 1,
              right: ["Right: halve the prize every 210,000 blocks, and the total can never pass 21 million."],
              wrong: [
                ["There is no committee, and nobody counts up to a limit.", "The subsidy halves every 210,000 blocks, so the total closes in on 21 million and stops."],
                null,
                ["The nonce has about 4.3 billion values, and has nothing to do with the supply.", "The cap comes from the subsidy halving every 210,000 blocks."],
                ["No agreement is needed, and miners can carry on for the fees.", "The subsidy halves every 210,000 blocks, so the sum can never pass 21 million."]
              ]
            } }
        ] },

      { id: "hardware-and-pools", title: "From Laptops to Warehouses", topics: ["mining hardware", "asic", "graphics cards", "hashrate estimate", "mining pools", "shares", "solo mining"],
        beats: [
          { slide: { k: "section", title: "From Laptops to Warehouses", sub: "Faster machines, and why miners team up" },
            at: "lectern", g: "open",
            say: [
              "A prize worth winning attracts competition, and in mining the competition is an arms race in hardware.",
              "Remember the whitepaper's line: one CPU, one vote.",
              "In 2009 that was literally true, because the software mined on the ordinary processor of an ordinary computer.",
              { s: "It did not stay true for long.", g: "rest" }
            ] },
          { slide: { k: "table", title: "Four generations of mining machines", start: 0, head: ["From about", "Hardware", "What changed"], rows: [
              ["2009", "ordinary processors", "any computer could mine"],
              ["2010", "graphics cards", "many guesses in parallel"],
              ["2011", "reprogrammable chips", "less power per guess"],
              ["2013", "purpose-built chips", "SHA-256 and nothing else"]
            ] },
            at: "screen", g: "point",
            say: [
              { s: "A processor is a generalist, built to do a little of everything, and it hashes slowly.", show: 1 },
              { s: "In 2010 miners moved to graphics cards, which can run a great many simple sums side by side.", show: 2 },
              { s: "In 2011 came chips that can be rewired for a single task, called FPGAs, which used far less power for each guess.", show: 3 },
              { s: "And in 2013 the first purpose-built chips arrived, known as ASICs: application-specific integrated circuits.", show: 4 },
              "An ASIC miner cannot browse the web or even add two numbers for you; it computes SHA-256 twice, and nothing else.",
              "Each generation was so much more efficient that the one before could no longer pay for its own electricity."
            ] },
          { at: "centre", g: "open",
            say: [
              { s: "Now here is the part that surprises people.", g: "lean" },
              "All that engineering did not produce a single extra bitcoin.",
              "The thermostat saw blocks arriving faster and lowered the target, every time.",
              "Faster machines change who wins the lottery, and never how many prizes there are.",
              { s: "It is a race in which everyone runs faster and the finishing line moves away at the same speed.", g: "shrug" }
            ] },
          { slide: { k: "number", value: "1 zettahash", label: "a second: the network's estimated hashrate, 2025 to 2026", note: "A 1 with 21 zeros; inferred from the difficulty and block times, never measured directly" },
            at: "right", g: "open",
            say: [
              "How fast is the race today?",
              { s: "Estimates through 2025 and 2026 put the whole network at around a thousand billion billion guesses every second.", g: "wide" },
              "That is a one with 21 zeros after it, and the unit has a splendid name: a zettahash.",
              "I say estimates, because nobody can count the machines.",
              "The figure is worked backwards from the difficulty and from how quickly blocks are actually arriving.",
              "A single modern machine makes over a hundred trillion guesses a second, and it would still expect to wait many decades for a block of its own."
            ] },
          { slide: { k: "figure", title: "Why miners pool", ops: [
              { text: "alone", x: 40, y: 6, a: "c", size: 4, c: "grey" },
              { text: "in a pool", x: 120, y: 6, a: "c", size: 4, c: "grey" },
              { line: [80, 2, 80, 50], c: "grey", dash: true },
              { line: [8, 30, 72, 30], c: "grey", at: 1 },
              { box: [60, 12, 6, 18], c: "amber", fill: true, at: 2 },
              { text: "one big prize, decades apart", x: 40, y: 38, a: "c", size: 3.6, at: 2 },
              { text: "or never", x: 40, y: 45, a: "c", size: 3.6, c: "red", at: 2 },
              { line: [88, 30, 152, 30], c: "grey", at: 3 },
              { box: [91, 26, 4, 4], c: "amber", fill: true, at: 4 },
              { box: [99, 26, 4, 4], c: "amber", fill: true, at: 4 },
              { box: [107, 26, 4, 4], c: "amber", fill: true, at: 4 },
              { box: [115, 26, 4, 4], c: "amber", fill: true, at: 4 },
              { box: [123, 26, 4, 4], c: "amber", fill: true, at: 4 },
              { box: [131, 26, 4, 4], c: "amber", fill: true, at: 4 },
              { box: [139, 26, 4, 4], c: "amber", fill: true, at: 4 },
              { box: [147, 26, 4, 4], c: "amber", fill: true, at: 4 },
              { text: "small payouts, week after week", x: 120, y: 38, a: "c", size: 3.6, at: 4 },
              { text: "about the same income, far less luck", x: 80, y: 58, a: "c", size: 4.2, c: "green", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "That waiting time is why miners pool, so let us look at a small miner's choices.",
              "Suppose your machines make up one millionth of the network's hashrate.",
              "Alone, you expect to win one block in every million, which is about one block every 19 years, and luck could make it 40, or never.",
              "So thousands of miners combine their guessing, and agree to share whatever any of them wins.",
              "Each gets a small, steady payment in proportion to the work they contributed.",
              "Over the long run the income is about the same, less the pool's cut, but the luck has been ironed out."
            ] },
          { at: "left", g: "open",
            say: [
              "How does a pool know you are really guessing, and not just claiming to?",
              "It asks you to hand in your near misses: hashes that beat a much easier target than the real one.",
              { s: "These are called shares, and each is a small proof of work in its own right, hashcash once again.", g: "pinch" },
              "The first pool was announced in November 2010 and found its first block that December, and today nearly all mining is pooled.",
              "There is a cost, and I will not hide it: a pool's operator usually decides which transactions go into the pool's blocks.",
              { s: "A handful of large pools therefore find most blocks, and how much that matters is a live argument.", g: "weigh" },
              "The saving grace is that a miner can point their machines at a different pool in minutes."
            ] }
        ] },

      { id: "energy", title: "The Electricity Question", topics: ["energy use", "electricity", "security", "cost to rewrite", "emissions", "estimates"],
        beats: [
          { slide: { k: "section", title: "The Electricity Question", sub: "What the work buys, and what it costs" },
            at: "lectern", g: "open",
            say: [
              "We have arrived at the question people argue about most.",
              "All those machines draw real power, and a great deal of it.",
              { s: "I am going to give you both columns of the ledger as fairly as I can, and leave the verdict to you.", g: "weigh" },
              "Start with what the work buys, because without that the cost makes no sense."
            ] },
          { board: { clear: true, title: "What the work buys", ops: [
              { box: [8, 28, 30, 14], t: "block 1", at: 0 },
              { line: [38, 35, 46, 35], at: 0 },
              { box: [46, 28, 30, 14], t: "block 2", at: 0 },
              { line: [76, 35, 84, 35], at: 0 },
              { box: [84, 28, 30, 14], t: "block 3", at: 0 },
              { line: [114, 35, 122, 35], at: 0 },
              { box: [122, 28, 30, 14], t: "block 4", at: 0 },
              { text: "work", x: 23, y: 48, a: "c", size: 4, c: "amber", at: 1 },
              { text: "work", x: 61, y: 48, a: "c", size: 4, c: "amber", at: 1 },
              { text: "work", x: 99, y: 48, a: "c", size: 4, c: "amber", at: 1 },
              { text: "work", x: 137, y: 48, a: "c", size: 4, c: "amber", at: 1 },
              { box: [44, 26, 34, 18], c: "red", at: 2 },
              { text: "change one byte", x: 61, y: 22, a: "c", size: 4, c: "red", at: 3 },
              { text: "redo", x: 61, y: 56, a: "c", size: 4.5, c: "red", at: 4 },
              { text: "redo", x: 99, y: 56, a: "c", size: 4.5, c: "red", at: 5 },
              { text: "redo", x: 137, y: 56, a: "c", size: 4.5, c: "red", at: 5 },
              { text: "to rewrite history, pay for it again", x: 80, y: 71, a: "c", size: 5, at: 6 },
              { text: "to check it: one hash a block", x: 80, y: 82, a: "c", size: 5, c: "green", at: 7 }
            ] },
            say: [
              "Here is a stretch of the chain, each block pointing back at the one before, as we saw last time.",
              "Every block carries its proof of work: a hash under the target, which took an ocean of guesses to find.",
              "Now suppose someone wants to alter a payment buried in block 2.",
              "Change one byte and the block's fingerprint changes, and the new one will not be under the target.",
              "So the forger has to mine block 2 again, at full price.",
              "But block 3 points at the old fingerprint, so it must be mined again too, and so must every block after it.",
              "To rewrite history you must pay for it again, in electricity, while the rest of the network keeps adding to the original.",
              { s: "And anyone at all can check the whole chain's work, at the cost of one hash a block.", g: "pinch" }
            ] },
          { at: "centre", g: "open",
            say: [
              "That is the purchase: a record that is cheap to verify and ruinously dear to forge, guarded by no one in particular.",
              "It is the shape of the hashcash stamp, hard to make and easy to check, stretched over an entire history.",
              "Exactly what happens when a forger races the honest miners is the subject of lecture 8."
            ] },
          { slide: { k: "number", value: "~138 TWh", label: "a year: one estimate of the electricity Bitcoin mining uses", note: "Cambridge Centre for Alternative Finance, 2025 report: about 0.5% of world electricity" },
            at: "right", g: "open",
            say: [
              "Now the other column.",
              "Nobody meters the network, so every figure here is an estimate, built from the hashrate and a guess at which machines are running.",
              "A widely cited one comes from the University of Cambridge, whose 2025 report, on data from 2024, put mining's use at about 138 terawatt-hours a year.",
              { s: "That is roughly half of one per cent of all the electricity the world consumes.", g: "wide" },
              "The same group's later, preliminary figures run higher still.",
              "Their report also estimated emissions of about 40 million tonnes of carbon dioxide equivalent a year."
            ] },
          { slide: { k: "compare", title: "Both columns of the ledger",
              left: { head: "What it costs", points: ["Electricity on a national scale", "Emissions where the power is fossil", "Machines that are scrap in a few years", "Noise and grid strain near big sites"] },
              right: { head: "What it buys", points: ["A history that is costly to rewrite", "Security with no gatekeeper", "A lottery open to anyone", "A buyer for surplus power, some argue"] } },
            at: "left", g: "weigh",
            say: [
              "So let me set the columns side by side.",
              "On the cost side: a great deal of electricity, real emissions wherever that electricity comes from fossil fuel, and specialised machines that become scrap within a few years.",
              "People who live beside large mining sites also report noise and pressure on the local grid.",
              "On the other side: a ledger that no one can quietly rewrite, kept honest without a gatekeeper, by a lottery anyone may enter.",
              "Supporters add that miners can set up wherever power is cheapest, which often means surplus that would otherwise go unused, and can switch off when the grid is short.",
              "In Cambridge's survey, miners reported that just over half their energy came from sustainable sources, nuclear included, with natural gas the largest single fuel at the time.",
              "Bear in mind that those are miners describing themselves, and that the survey covered about half the network."
            ] },
          { at: "centre", g: "open",
            say: [
              { s: "Two facts are worth carrying out of the room, whichever column weighs more with you.", g: "count" },
              "First, the energy does not rise with the number of payments: a full block and a nearly empty one cost the same to mine.",
              "What sets the spending is the prize, because miners will pay for electricity up to about what the prize is worth to them.",
              "Second, the cost is not a flaw that better engineering will remove.",
              "More efficient machines just raise the hashrate, and the thermostat raises the difficulty to match.",
              { s: "If the proof were cheap to make, the history would be cheap to forge.", g: "pinch" },
              "Whether that security is worth that electricity is a judgement about values, and it is yours to make, not mine."
            ] },
          { say: ["One last question, on the heart of the matter.", "What does the energy spent on mining buy?"],
            quiz: {
              q: "What does the energy spent on mining buy?",
              options: [
                "Secrecy about who paid whom",
                "More bitcoins than the timetable allows",
                "Faster payments for everyone",
                "A history that costs real work to rewrite"
              ],
              answer: 3,
              right: ["That is it: the work makes the record cheap to check and dear to forge."],
              wrong: [
                ["Mining hides nothing, since the ledger is public.", "The work buys a history that costs real work to rewrite."],
                ["The timetable is fixed, and no amount of energy mints an extra coin.", "The work buys a history that costs real work to rewrite."],
                ["Blocks keep to about ten minutes however much energy is spent.", "What the work buys is a history that costs real work to rewrite."],
                null
              ]
            } },
          { slide: { k: "points", title: "Today in five lines", start: 0, points: [
              "Mining is a lottery: guess a nonce, hash, compare",
              "The target sets the odds; nodes retune it every 2,016 blocks",
              "The winner's coinbase pays the subsidy plus the fees",
              "Halving every 210,000 blocks caps supply just under 21 million",
              "The work makes history cheap to check and dear to forge"
            ] },
            at: "lectern", g: "count",
            say: [
              "Let me gather today into five lines.",
              { s: "Mining is a lottery, and a ticket is one guess at a nonce.", show: 1 },
              { s: "The target sets the odds, and every node retunes it every 2,016 blocks to hold the ten-minute beat.", show: 2 },
              { s: "The winner writes the coinbase transaction, and collects the subsidy and the fees.", show: 3 },
              { s: "The subsidy halves every 210,000 blocks, and that arithmetic caps the supply just under 21 million.", show: 4 },
              { s: "And the work is what makes the past expensive to change.", show: 5 }
            ] },
          { slide: { k: "figure", title: "Next time: two winners at once", ops: [
              { box: [8, 22, 26, 12], t: "block" },
              { line: [34, 28, 44, 28] },
              { box: [44, 22, 26, 12], t: "block" },
              { line: [70, 28, 82, 16], at: 1 },
              { box: [82, 8, 32, 14], t: "A's block", c: "blue", at: 1 },
              { line: [70, 28, 82, 40], at: 2 },
              { box: [82, 34, 32, 14], t: "B's block", c: "red", at: 2 },
              { text: "?", x: 130, y: 29, a: "c", size: 10, at: 3 },
              { text: "two valid blocks, one place in the chain", x: 80, y: 58, a: "c", size: 4.5, at: 3 }
            ] },
            at: "centre", g: "open",
            say: [
              "I have been quietly assuming something all lecture: that each round of the lottery has one winner.",
              "But this lottery runs across a whole planet, so now and then a miner in one country finds a block.",
              "And seconds later, before the news has arrived, a miner somewhere else finds a different one.",
              "Both are valid, both took real work, and only one can be the next page.",
              { s: "Who decides, when there is nobody to decide?", g: "shrug" },
              "That is lecture 8, Agreement Without a Leader, where the generals from lecture 1 finally get their answer.",
              "Before then, read sections 4 and 6 of the whitepaper again; they are barely a page between them, and you can now follow every word.",
              { s: "Thank you, and I will see you in lecture 8.", g: "up" }
            ] }
        ] }
    ]
  });
})();
