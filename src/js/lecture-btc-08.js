// Bitcoin from First Principles, lecture 8: the rule every node follows (among valid chains, the one with the most work is the history), two blocks found at once and the stale block that results, reorganisations and why confirmations bury a payment, what a majority of the hashrate can and cannot do, selfish mining, miners ordering and nodes checking, and how that answers lecture 1's generals and its thousand free voters.
(() => {
  "use strict";
  window.BL.lectures.add({
    id: "btc-08", course: "first-principles", n: 8, title: "Agreement Without a Leader",
    reading: [
      { title: "Bitcoin whitepaper, sections 4, 5 and 11", by: "Satoshi Nakamoto, 2008" },
      { title: "The Byzantine Generals Problem", by: "Lamport, Shostak and Pease, 1982" }
    ],
    sources: [
      "Satoshi Nakamoto, Bitcoin: A Peer-to-Peer Electronic Cash System (2008), abstract and sections 4, 5, 6, 11 and 12, https://bitcoin.org/bitcoin.pdf and https://nakamotoinstitute.org/library/bitcoin/",
      "Satoshi Nakamoto, Bitcoin P2P e-cash paper, Cryptography Mailing List, 13 November 2008 (the reply on the Byzantine Generals), https://satoshi.nakamotoinstitute.org/emails/cryptography/11/",
      "Leslie Lamport, Robert Shostak and Marshall Pease, The Byzantine Generals Problem, ACM Transactions on Programming Languages and Systems 4(3), July 1982, https://lamport.azurewebsites.net/pubs/byz.pdf",
      "Ittay Eyal and Emin Gün Sirer, Majority is not Enough: Bitcoin Mining is Vulnerable (1 November 2013), https://arxiv.org/abs/1311.0243",
      "Bitcoin developer guide, Block Chain (proof of work, block height and forking, stale blocks, the 100-block rule for a miner's new coins), https://developer.bitcoin.org/devguide/block_chain.html",
      "Bitcoin Wiki, Confirmation, https://en.bitcoin.it/wiki/Confirmation",
      "Bitcoin Wiki, Majority attack, https://en.bitcoin.it/wiki/Majority_attack"
    ],
    sections: [
      { id: "after-the-lottery", title: "After the Lottery", topics: ["mining recap", "lottery", "no referee", "leaderless agreement", "lecture 1 debts"],
        beats: [
          { slide: { k: "title", kicker: "Lecture 8", title: "Agreement Without a Leader", sub: "The most-work chain, and who enforces the rules" },
            at: "lectern", g: "open",
            say: [
              "Welcome back.",
              "Last time we watched the mining lottery: machines all over the world guessing, until one of them finds a block.",
              "We saw that the winning ticket is costly to find and takes one step to check.",
              { s: "But a lottery only tells you who won, and today's question is what everybody else does next.", g: "lean" },
              "There is no head office to announce the result, and no referee to settle an argument.",
              "Thousands of computers, owned by strangers, must each end up holding the same history.",
              { s: "Today we find out how they manage it, with nobody in charge.", g: "wide" }
            ] },
          { slide: { k: "points", title: "Two debts from Lecture 1", start: 0, points: [
              "The generals: agree, though some may be traitors",
              "The thousand voters: fake identities are free",
              "Today: one rule that every node applies alone",
              "And then: who really enforces the rules"
            ] },
            at: "centre", g: "open",
            say: [
              { s: "We also have two debts to pay, both from the very first lecture.", g: "count" },
              { s: "The first is the Byzantine generals, who had to agree on one plan even though some of them might be traitors.", show: 1 },
              { s: "The second is the cheat with a thousand masks, who wins any vote because identities cost nothing.", show: 2 },
              { s: "The answer to both turns out to be a single rule, short enough to write on your hand.", show: 3, g: "pinch" },
              { s: "And once we have it, we will ask the question that matters most: who actually enforces the rules of this system?", show: 4 },
              "The answer is probably not who you expect."
            ] },
          { slide: { k: "figure", title: "One block found. Now what?", ops: [
              { circle: [80, 28, 9], t: "miner", c: "amber" },
              { box: [69, 4, 22, 9], t: "block", c: "amber", fill: true, at: 1 },
              { circle: [20, 12, 5], at: 2 }, { arrow: [70, 25, 26, 14], c: "grey", at: 2 },
              { circle: [20, 44, 5], at: 2 }, { arrow: [70, 31, 26, 42], c: "grey", at: 2 },
              { circle: [140, 12, 5], at: 2 }, { arrow: [90, 25, 134, 14], c: "grey", at: 2 },
              { circle: [140, 44, 5], at: 2 }, { arrow: [90, 31, 134, 42], c: "grey", at: 2 },
              { text: "accept it?", x: 20, y: 28, a: "c", size: 3.8, c: "blue", at: 3 },
              { text: "build on it?", x: 140, y: 28, a: "c", size: 3.8, c: "blue", at: 3 },
              { text: "nobody announces the winner", x: 80, y: 59, a: "c", size: 4.5, at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "Picture the moment a miner somewhere finds a block.",
              "It holds a winning ticket, a block whose fingerprint is below the target.",
              "It sends that block to the computers it is connected to, and they pass it on.",
              "Now each of those computers has a decision to make, by itself: do I accept this block, and do I build on it?",
              { s: "Nobody phones round with the official result, because there is no official.", g: "shrug" },
              "So the result has to come out of thousands of private decisions, all made by the same rule."
            ] }
        ] },

      { id: "most-work-rule", title: "The Rule: Most Work Wins", topics: ["most-work chain", "longest chain", "chain selection", "valid chains", "total work"],
        beats: [
          { slide: { k: "section", title: "The Rule: Most Work Wins", sub: "Weigh the history, do not count the voters" },
            at: "lectern", g: "open",
            say: [
              "Here is the rule, in one sentence.",
              { s: "Among all the valid chains of blocks I have heard of, the one with the most work behind it is the history.", g: "pinch" },
              "That is all of it.",
              "Every node follows it, and no node needs to ask another node's opinion.",
              "Let me take that sentence apart, because each piece is doing a job."
            ] },
          { slide: { k: "quote", text: "Nodes always consider the longest chain to be the correct one and will keep working on extending it.", by: "Satoshi Nakamoto, Bitcoin whitepaper, section 5, 2008" },
            at: "centre", g: "open",
            say: [
              "This is how the whitepaper puts it, in its section on the network.",
              { s: "Notice the word longest, because it needs one small correction.", g: "point" },
              "You saw last time that the difficulty of the puzzle moves up and down.",
              "So a chain could be made of many blocks that were each easy to find, and it would be long and cheap at the same time.",
              { s: "What the paper means, and what the software does, is add up the work in every block and compare the totals.", g: "weigh" },
              "The paper says as much one section earlier, where the longest chain is the one with the greatest proof-of-work effort invested in it."
            ] },
          { board: { clear: true, title: "Weigh it, do not count it", ops: [
              { text: "chain A", x: 6, y: 22, size: 5, at: 1 },
              { box: [34, 16, 12, 12], t: "1", at: 1 },
              { line: [46, 22, 50, 22], at: 1 },
              { box: [50, 16, 12, 12], t: "1", at: 1 },
              { line: [62, 22, 66, 22], at: 1 },
              { box: [66, 16, 12, 12], t: "1", at: 1 },
              { line: [78, 22, 82, 22], at: 1 },
              { box: [82, 16, 12, 12], t: "1", at: 1 },
              { line: [94, 22, 98, 22], at: 1 },
              { box: [98, 16, 12, 12], t: "1", at: 1 },
              { text: "5 blocks, work 5", x: 116, y: 22, size: 4.5, c: "grey", at: 2 },
              { text: "chain B", x: 6, y: 52, size: 5, at: 3 },
              { box: [34, 43, 20, 18], t: "4", c: "amber", at: 3 },
              { line: [54, 52, 58, 52], at: 3 },
              { box: [58, 43, 20, 18], t: "4", c: "amber", at: 3 },
              { line: [78, 52, 82, 52], at: 3 },
              { box: [82, 43, 20, 18], t: "4", c: "amber", at: 3 },
              { text: "3 blocks, work 12", x: 108, y: 52, size: 4.5, c: "green", at: 4 },
              { text: "most work wins, not most blocks", x: 80, y: 80, a: "c", size: 5.5, c: "green", at: 5 }
            ] },
            say: [
              "Let me draw the difference, because it matters.",
              "Chain A has five blocks, each made when the puzzle was easy, so call that one unit of work apiece.",
              "Five blocks, five units.",
              "Chain B has only three blocks, but each was made when the puzzle was four times as hard.",
              "Three blocks, twelve units.",
              { s: "A node picks chain B, because it weighs the history and does not count its pages.", g: "weigh" },
              "In everyday life the two measures almost always agree, which is why people still say the longest chain."
            ] },
          { slide: { k: "code", title: "What every node does, on its own", start: 0, lines: [
              "for each chain of blocks I have heard of:",
              "    check every block against every rule",
              "    if any block breaks a rule: throw the chain away",
              "",
              "add up the work in each chain that is left",
              "the chain with the most work is the history",
              "",
              "when a new block arrives: do it all again"
            ] },
            at: "lectern", g: "open",
            say: [
              "Written out as a recipe, it looks like this.",
              { s: "First, a node checks every block in a chain against every rule, and we will come back to that step with great interest.", show: 3 },
              { s: "Then it adds up the work in each chain that survived, and takes the heaviest.", show: 6 },
              { s: "When a new block arrives, it simply does the sum again.", show: 8 },
              "Look at what is missing from this recipe: there is no step that says ask the others, and no step that says count the votes.",
              { s: "A node never needs to know how many other nodes exist, let alone who they are.", g: "chop" },
              "The work is in the blocks themselves, where anyone can measure it and nobody can fake it."
            ] },
          { slide: { k: "figure", title: "Same blocks, same sum, same answer", ops: [
              { circle: [24, 16, 8], t: "node", c: "blue" },
              { circle: [24, 44, 8], t: "node", c: "blue" },
              { text: "Lagos", x: 24, y: 29, a: "c", size: 3.5, c: "grey" },
              { text: "Osaka", x: 24, y: 57, a: "c", size: 3.5, c: "grey" },
              { arrow: [34, 16, 52, 16], at: 1 },
              { arrow: [34, 44, 52, 44], at: 1 },
              { box: [54, 9, 40, 14], t: "the same sum", at: 1 },
              { box: [54, 37, 40, 14], t: "the same sum", at: 1 },
              { arrow: [96, 16, 112, 16], c: "green", at: 2 },
              { arrow: [96, 44, 112, 44], c: "green", at: 2 },
              { box: [114, 9, 36, 14], t: "chain B", c: "green", fill: true, at: 2 },
              { box: [114, 37, 36, 14], t: "chain B", c: "green", fill: true, at: 2 },
              { text: "they never spoke to each other", x: 80, y: 31, a: "c", size: 4, c: "amber", at: 2 }
            ] },
            at: "screen", g: "point",
            say: [
              "Why does this get everyone to the same answer?",
              "Because every honest node is doing the same sum on the same blocks.",
              "Give two strangers the same pile of ledgers and the same pair of scales, and they will pick the same one without ever meeting.",
              { s: "And why work, of all things?", g: "lean" },
              "Because work is the one thing in this system that cannot be copied, borrowed or invented.",
              "A chain with a great deal of work behind it is evidence that a great deal of real machinery ran for a long time."
            ] },
          { say: ["Let me check that the rule has landed before we put it under strain.", "Which chain does a node treat as the true history?"],
            quiz: {
              q: "Which chain does a node treat as the true history?",
              options: [
                "The one containing the most payments",
                "The one most other nodes say they follow",
                "The valid chain with the most work behind it",
                "The one it happened to hear about first"
              ],
              answer: 2,
              right: ["Yes: among the valid chains, the one with the most work behind it."],
              wrong: [
                ["A block stuffed with payments is no harder to make than an empty one.", "What counts is work, so the valid chain with the most of it is the history."],
                ["Nodes do not poll one another, because a cheat could invent any number of nodes.", "Each node picks the valid chain with the most work behind it."],
                null,
                ["Hearing of a chain first proves nothing about what it cost to make.", "The rule is the valid chain with the most work behind it."]
              ]
            } }
        ] },

      { id: "two-blocks-at-once", title: "Two Blocks at Once", topics: ["fork", "stale block", "orphan block", "simultaneous blocks", "tie", "new coins wait 100 blocks"],
        beats: [
          { slide: { k: "section", title: "Two Blocks at Once", sub: "A brief fork, a stale block, and how it heals" },
            at: "lectern", g: "open",
            say: [
              "Now let us put the rule under strain.",
              "Mining is a lottery with no timetable, so sooner or later two miners win within a few seconds of each other.",
              "Say one is in Norway and one is in Paraguay.",
              "Each has a perfectly valid block, and each block sits on top of the same parent.",
              { s: "News takes time to cross a planet, so for a moment the world is split.", g: "weigh" },
              "Nodes near Norway hear the Norwegian block first, and nodes near Paraguay hear the other."
            ] },
          { board: { clear: true, title: "A fork, and how it heals", ops: [
              { box: [6, 37, 22, 14], t: "99", at: 0 },
              { line: [28, 44, 38, 44], at: 0 },
              { box: [38, 37, 22, 14], t: "100", at: 0 },
              { line: [60, 41, 76, 27], at: 1 },
              { box: [76, 18, 26, 14], t: "101 N", c: "blue", at: 1 },
              { line: [60, 47, 76, 61], at: 2 },
              { box: [76, 56, 26, 14], t: "101 P", c: "amber", at: 2 },
              { text: "equal work: a tie", x: 100, y: 44, a: "c", size: 4.5, c: "red", at: 3 },
              { text: "each node keeps the one it saw first", x: 80, y: 84, a: "c", size: 4.5, c: "grey", at: 5 }
            ] },
            say: [
              "Here is the chain up to block 100, which everyone agrees on.",
              "The Norwegian miner finds a block 101, and I will mark it N.",
              "Seconds later, before that news arrives, the Paraguayan miner finds a different block 101, marked P.",
              { s: "Both chains are valid, and both have exactly the same amount of work, so the rule gives a tie.", g: "weigh" },
              "We call this a fork: one chain that has, for the moment, two tips.",
              "Each node breaks the tie in the simplest way, by staying with the block it saw first, and it keeps the other one in a drawer.",
              "Nobody panics, and nobody negotiates."
            ] },
          { board: { ops: [
              { line: [102, 25, 116, 25], c: "blue", at: 1 },
              { box: [116, 18, 26, 14], t: "102", c: "blue", at: 1 },
              { text: "more work: wins", x: 122, y: 11, a: "c", size: 4.5, c: "green", at: 2 },
              { line: [74, 54, 104, 72], c: "red", at: 4 },
              { line: [104, 54, 74, 72], c: "red", at: 4 },
              { text: "stale", x: 122, y: 64, a: "c", size: 5.5, c: "red", at: 4 }
            ] },
            say: [
              "Then the lottery is drawn again.",
              "Some miner who was working on top of N finds block 102.",
              { s: "Now the top chain has more work than the bottom one, and the tie is broken.", g: "up" },
              "Every node that was following P takes N out of the drawer, sees the heavier chain, and switches.",
              "Block P is left behind, and we call it a stale block.",
              "It was perfectly valid, it cost real electricity, and it is simply not part of the history.",
              "The whole disagreement lasted about as long as one block, with no meeting, no vote and no appeal."
            ] },
          { slide: { k: "points", title: "What a stale block leaves behind", start: 0, points: [
              "Neither block was wrong; one was unlucky",
              "Its payments: most are in the winning block too",
              "The rest go back to waiting for a later block",
              "Its miner's reward: gone with the block",
              "So a miner's new coins wait 100 blocks to be spent"
            ] },
            at: "right", g: "open",
            say: [
              { s: "Neither block was more correct than the other, and had the next draw landed on P, then N would be the stale one.", show: 1, g: "shrug" },
              { s: "What about the payments inside the stale block?", g: "lean" },
              { s: "Most of them are in the winning block as well, since both miners were choosing from much the same waiting payments.", show: 2 },
              { s: "Any that are not simply go back to waiting, and a later block picks them up.", show: 3 },
              { s: "The real loser is the miner, whose reward existed only inside the block that was dropped.", show: 4 },
              { s: "That is why a miner's freshly made coins cannot be spent until they are 100 blocks deep.", show: 5 },
              "By then, nobody is going to discover that the coins they were paid with have quietly ceased to exist.",
              "You will also hear a stale block called an orphan, loosely, but stale is the careful word."
            ] },
          { say: ["A quick check on what just happened.", "Two valid blocks are found on top of the same parent, so how is the tie settled?"],
            quiz: {
              q: "Two valid blocks are found on top of the same parent. How is the tie settled?",
              options: [
                "The block with the earlier timestamp wins",
                "Both blocks are cancelled and mined again",
                "The nodes vote, and the majority's block wins",
                "The next block lands on one side, giving it more work"
              ],
              answer: 3,
              right: ["Right: the next block lands on one side, and that side now has more work."],
              wrong: [
                ["A timestamp is written by the miner, so it cannot be trusted to settle a race.", "The tie breaks when the next block lands on one side and gives it more work."],
                ["Nothing is cancelled, and nobody has the authority to cancel it.", "One side simply gets the next block and has more work, and the other block goes stale."],
                ["There is no vote, because votes can be faked for free.", "The tie breaks when the next block is found on one side, giving that chain more work."],
                null
              ]
            } }
        ] },

      { id: "confirmations", title: "Burying a Payment", topics: ["reorganisation", "reorg", "confirmations", "six confirmations", "double spend race", "whitepaper calculation", "finality"],
        beats: [
          { slide: { k: "section", title: "Burying a Payment", sub: "Reorganisations, and why waiting buys safety" },
            at: "lectern", g: "open",
            say: [
              "That little episode has a consequence you should take seriously.",
              "For a moment, some nodes believed in a block that later vanished from the history.",
              { s: "So when, exactly, is a payment safe?", g: "lean" }
            ] },
          { slide: { k: "figure", title: "A reorganisation, seen from one node", ops: [
              { text: "before", x: 6, y: 14, size: 4, c: "grey" },
              { box: [30, 8, 20, 12], t: "99" },
              { line: [50, 14, 56, 14] },
              { box: [56, 8, 20, 12], t: "100" },
              { line: [76, 14, 82, 14] },
              { box: [82, 8, 20, 12], t: "101 P", c: "amber" },
              { text: "after", x: 6, y: 42, size: 4, c: "grey", at: 1 },
              { box: [30, 36, 20, 12], t: "99", at: 1 },
              { line: [50, 42, 56, 42], at: 1 },
              { box: [56, 36, 20, 12], t: "100", at: 1 },
              { line: [76, 42, 82, 42], at: 1 },
              { box: [82, 36, 20, 12], t: "101 N", c: "blue", at: 1 },
              { line: [102, 42, 108, 42], at: 1 },
              { box: [108, 36, 20, 12], t: "102", c: "blue", at: 1 },
              { line: [80, 6, 104, 22], c: "red", at: 2 },
              { text: "dropped", x: 132, y: 14, a: "c", size: 4, c: "red", at: 2 },
              { text: "the newest page is written in pencil", x: 80, y: 59, a: "c", size: 4.5, at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "Look at it from the point of view of one node that heard P first.",
              "After block 102 arrives, its chain ends differently from how it ended a minute ago.",
              "When a node drops blocks from the tip of its chain and takes up a heavier branch, we call it a reorganisation, or reorg for short.",
              "A reorg of one block is ordinary housekeeping.",
              { s: "But it tells us something uncomfortable: the newest page of the ledger is written in pencil.", g: "pinch" }
            ] },
          { slide: { k: "figure", title: "Each block on top is a confirmation", ops: [
              { box: [6, 20, 20, 14], t: "pay", c: "amber", fill: true, at: 0 },
              { text: "1", x: 16, y: 13, a: "c", size: 5, c: "grey", at: 1 },
              { line: [26, 27, 32, 27], at: 2 },
              { box: [32, 20, 20, 14], at: 2 },
              { text: "2", x: 42, y: 13, a: "c", size: 5, c: "grey", at: 2 },
              { line: [52, 27, 58, 27], at: 3 },
              { box: [58, 20, 20, 14], at: 3 },
              { text: "3", x: 68, y: 13, a: "c", size: 5, c: "grey", at: 3 },
              { line: [78, 27, 84, 27], at: 3 },
              { box: [84, 20, 20, 14], at: 3 },
              { text: "4", x: 94, y: 13, a: "c", size: 5, c: "grey", at: 3 },
              { line: [104, 27, 110, 27], at: 3 },
              { box: [110, 20, 20, 14], at: 3 },
              { text: "5", x: 120, y: 13, a: "c", size: 5, c: "grey", at: 3 },
              { line: [130, 27, 136, 27], at: 3 },
              { box: [136, 20, 20, 14], at: 3 },
              { text: "6", x: 146, y: 13, a: "c", size: 5, c: "grey", at: 3 },
              { arrow: [156, 42, 6, 42], c: "red", at: 4 },
              { text: "redo all of this, and outrun the network", x: 80, y: 49, a: "c", size: 4.2, c: "red", at: 5 },
              { text: "deeper = safer", x: 80, y: 59, a: "c", size: 4.5, c: "green", at: 6 }
            ] },
            at: "screen", g: "point",
            say: [
              "Suppose a shop has just been paid, and the payment has landed in a block.",
              "We say it has one confirmation.",
              "Ten minutes or so later another block is built on top, and now it has two.",
              "Then three, then four, and so on, one new layer about every ten minutes.",
              { s: "To undo that payment, somebody would have to replace its block and every block stacked on top of it.", g: "chop" },
              "And they would have to do it faster than the whole network is adding new ones.",
              "Think of the payment as a note laid in a wall, and each block as another course of bricks on top."
            ] },
          { board: { clear: true, title: "A slower runner, a head start", ops: [
              { box: [6, 38, 20, 14], t: "100", at: 0 },
              { line: [26, 41, 36, 27], at: 1 },
              { box: [36, 18, 22, 14], t: "shop", c: "green", at: 1 },
              { text: "public", x: 6, y: 14, size: 4.5, c: "green", at: 1 },
              { line: [26, 49, 36, 63], c: "red", at: 2 },
              { box: [36, 58, 22, 14], t: "me", c: "red", dash: true, at: 2 },
              { text: "secret", x: 6, y: 78, size: 4.5, c: "red", at: 2 },
              { line: [58, 25, 64, 25], at: 3 },
              { box: [64, 18, 22, 14], c: "green", at: 3 },
              { line: [86, 25, 92, 25], at: 3 },
              { box: [92, 18, 22, 14], c: "green", at: 3 },
              { line: [114, 25, 120, 25], at: 3 },
              { box: [120, 18, 22, 14], c: "green", at: 3 },
              { line: [58, 65, 64, 65], c: "red", at: 4 },
              { box: [64, 58, 22, 14], c: "red", dash: true, at: 4 },
              { text: "2 behind", x: 112, y: 65, a: "c", size: 5, c: "red", at: 4 },
              { text: "he must overtake to win", x: 80, y: 85, a: "c", size: 5, c: "red", at: 5 }
            ] },
            say: [
              "Let me draw the attack the whitepaper worries about, starting from block 100.",
              "A cheat pays a shop, and the payment goes into a public block, here in green.",
              "In secret, the cheat starts a rival branch from the block before, with a version in which the same coins go back to himself.",
              "The honest network knows nothing of this, and carries on adding blocks to the public chain.",
              "The cheat adds blocks to his secret chain too, but he has less machinery, so he falls behind.",
              { s: "To win, he must overtake: only if his secret chain ends up with more work will nodes switch to it.", g: "point" },
              "If they did switch, the shop's payment would vanish from the history, with the goods already out of the door.",
              "So this is a race between a slower runner and the whole pack, with the pack given a head start."
            ] },
          { slide: { k: "table", title: "The whitepaper's sums: a cheat with 10%", start: 0, head: ["Blocks the shop waits", "Chance the cheat catches up"], rows: [
              ["0", "100%"],
              ["1", "20.5%"],
              ["2", "5.1%"],
              ["3", "1.3%"],
              ["4", "0.35%"],
              ["5", "0.09%"],
              ["6", "0.02%"]
            ], note: "Bitcoin whitepaper, section 11, for an attacker with a tenth of the mining power" },
            at: "lectern", g: "open",
            say: [
              "The last section of the whitepaper works out the odds of that race.",
              "Suppose the cheat controls a tenth of all the mining power, which would be an enormous operation.",
              { s: "If the shop does not wait for any block at all, there is nothing to overtake, so his chance is 100 per cent.", show: 1 },
              { s: "Wait for one block, and his chance of ever catching up falls to about one in five.", show: 2 },
              { s: "Wait for three, and it is a little over one in a hundred.", show: 4 },
              { s: "Wait for six, about an hour, and it is roughly one in four thousand.", show: 7 },
              { s: "Each extra block cuts his chance to about a quarter of what it was, and that steady shrinking is the whole trick.", g: "chop" },
              "The paper compares him to a gambler who starts in debt, playing a game tilted against him, hoping to get back to even."
            ] },
          { slide: { k: "number", value: "340 blocks", label: "the wait for the same safety against 45% of the mining power", note: "Whitepaper, section 11: under 0.1% risk takes 5 blocks at 10%, 24 at 30%, 340 at 45%" },
            at: "centre", g: "open",
            say: [
              "Now the same sum for a stronger cheat.",
              "Against a tenth of the mining power, five blocks bring the risk under one in a thousand.",
              "Against 30 per cent, the paper says you must wait 24 blocks for the same comfort.",
              { s: "Against 45 per cent it is 340 blocks, which is more than two days.", g: "wide" },
              "And notice where this is heading: at one half, no amount of waiting is enough.",
              "We will meet that cheat in a moment."
            ] },
          { slide: { k: "points", title: "What a confirmation really is", start: 0, points: [
              "Not a stamp of approval: a layer of work on top",
              "Never declared final, only ever less likely to change",
              "Six blocks is a habit, not a law of nature",
              "A coffee and a house deserve different waits"
            ] },
            at: "left", g: "open",
            say: [
              { s: "So a confirmation is not a stamp from an authority; it is one more layer of work piled on top of your payment.", show: 1 },
              { s: "Nothing in this system is ever declared final, and instead a reversal just becomes absurdly unlikely.", show: 2, g: "weigh" },
              { s: "You will often hear that six confirmations is the standard, though the paper's own table gives five, and later, more careful versions of the sum give six.", show: 3 },
              "It assumes a cheat with about a tenth of the mining power and a tolerance of one in a thousand, and both of those are simply somebody's choice.",
              { s: "The person being paid decides how long to wait, and a cup of coffee and a house deserve different answers.", show: 4 }
            ] },
          { say: ["Before we meet the stronger cheat, one check.", "Why does a payment grow safer with every block built on top of it?"],
            quiz: {
              q: "Why does a payment grow safer with every block built on top of it?",
              options: [
                "Undoing it means redoing, and outrunning, all that work",
                "Each new block checks its signature again",
                "Miners vote on the payment again in each block",
                "The payment is copied to more computers each time"
              ],
              answer: 0,
              right: ["Exactly: a cheat must redo every block on top, and still outrun the network."],
              wrong: [
                null,
                ["The signature was checked once, and checking it again adds nothing.", "The safety is in the work: to undo the payment, a cheat must redo every block on top and outrun the network."],
                ["There are no votes anywhere in this system.", "Each block is more work that a cheat would have to redo, while outrunning everyone else."],
                ["Copies are free, so more copies add no safety.", "What adds safety is work: every block on top is one more that a cheat must redo while outrunning the network."]
              ]
            } }
        ] },

      { id: "majority-attacker", title: "The Cheat With a Majority", topics: ["51% attack", "majority of hashrate", "censorship", "rewriting history", "selfish mining", "incentives", "what miners cannot do"],
        beats: [
          { slide: { k: "section", title: "The Cheat With a Majority", sub: "What most of the mining power can do, and cannot" },
            at: "lectern", g: "open",
            say: [
              "Now for the cheat I promised you, the one who controls more than half of all the mining power.",
              "People call this a 51 per cent attack.",
              "For him the race is no longer a gamble, because the faster runner always overtakes in the end.",
              { s: "So let us be honest about it: this is a real limit of the design, and the whitepaper admits it in its opening summary.", g: "open" },
              "The system assumes that most of the mining power is not working together to attack it.",
              "What matters is knowing exactly what breaks when that assumption fails, and what does not."
            ] },
          { slide: { k: "compare", title: "With most of the mining power",
              left: { head: "He can", points: ["Rewrite recent blocks", "Take back his own payments", "Leave chosen payments out", "Ignore other miners' blocks"] },
              right: { head: "He cannot", points: ["Spend coins without their keys", "Create coins beyond the schedule", "Change any rule that nodes check", "Rewrite deep history cheaply"] } },
            at: "left", g: "weigh",
            say: [
              "Start with what he can do.",
              "He can rewrite recent history, by building a heavier branch from a few blocks back, and so take back payments he made himself.",
              "That is the double spend from Lecture 1, returned from the dead, and it is the reason large payments wait for confirmations.",
              "He can also censor: he can leave payments he dislikes out of his blocks, and refuse to build on anyone's block that includes them.",
              { s: "That is serious, and I will not pretend otherwise.", g: "chop" },
              "But now look at the right-hand side, because it is the more surprising list."
            ] },
          { slide: { k: "quote", text: "Even if this is accomplished, it does not throw the system open to arbitrary changes, such as creating value out of thin air or taking money that never belonged to the attacker.", by: "Satoshi Nakamoto, Bitcoin whitepaper, section 11, 2008" },
            at: "centre", g: "open",
            say: [
              "Here is the whitepaper, on an attacker who out-mines everyone else.",
              "He cannot spend your coins, because that takes a signature from your key, and no amount of mining produces one.",
              "He cannot pay himself a larger reward, or make coins from nothing.",
              "He cannot change a single rule.",
              { s: "All that power buys him the pen that orders the pages, and it does not buy him the right to write nonsense on them.", g: "pinch" },
              "Why not is the subject of the next section, and it is the heart of today."
            ] },
          { slide: { k: "figure", title: "The same machines, two uses", ops: [
              { box: [50, 4, 60, 12], t: "most of the machines", c: "grey", fill: true },
              { arrow: [66, 17, 40, 28], at: 1 },
              { arrow: [94, 17, 120, 28], at: 4 },
              { box: [10, 30, 60, 12], t: "attack", c: "red", at: 1 },
              { text: "costs more than everyone else", x: 40, y: 47, a: "c", size: 3.6, c: "grey", at: 1 },
              { text: "stops when the spending stops", x: 40, y: 53, a: "c", size: 3.6, c: "grey", at: 2 },
              { box: [90, 30, 60, 12], t: "mine honestly", c: "green", at: 4 },
              { text: "most of the new coins", x: 120, y: 47, a: "c", size: 3.6, c: "grey", at: 4 },
              { text: "in a system still worth using", x: 120, y: 53, a: "c", size: 3.6, c: "grey", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "There are two more things working against him.",
              "First, the attack is not a break-in that happens once; it lasts only as long as he keeps out-mining the entire rest of the network.",
              "The moment he stops, the honest chain simply carries on.",
              "Second, the whitepaper points out that anyone with that much machinery faces a choice.",
              { s: "He can use it to cheat, or he can mine honestly and collect more new coins than everyone else combined.", g: "weigh" },
              "The paper's bet is that playing by the rules pays better than wrecking the thing his own earnings depend on.",
              "That is an argument about incentives, not a guarantee, and you should hold it at arm's length like any other claim."
            ] },
          { slide: { k: "points", title: "A wrinkle: selfish mining", start: 0, points: [
              "Eyal and Sirer, 2013: Majority is not Enough",
              "Find a block, keep it secret, mine ahead in private",
              "Release it late, so honest work is wasted",
              "Pays more than a fair share, well below half",
              "An honest majority is a subtler promise than it looks"
            ] },
            at: "right", g: "open",
            say: [
              { s: "And here is a wrinkle, because the line at one half is not as clean as I have made it sound.", g: "lean" },
              { s: "In 2013 two researchers at Cornell, Ittay Eyal and Emin Gün Sirer, published a paper called Majority is not Enough.", show: 1 },
              { s: "They described a strategy called selfish mining, in which a group of miners finds a block and keeps it secret.", show: 2 },
              { s: "They mine ahead in private, and release their blocks at just the right moment to turn the honest miners' newest block stale.", show: 3 },
              "The honest miners waste effort on a branch that was doomed, so the selfish group collects more than its fair share of the rewards.",
              { s: "By their analysis a group with more than a third of the mining power could always profit this way, and a well-connected group could manage it with less.", show: 4 },
              { s: "It does not let anyone steal coins or break a rule, but it means an honest majority is a subtler promise than it first appears.", show: 5 },
              "Researchers have been refining that analysis, and arguing about it, ever since."
            ] },
          { say: ["So let me test the two lists.", "Which of these could a cheat with most of the mining power actually do?"],
            quiz: {
              q: "Which of these could a cheat with most of the mining power do?",
              options: [
                "Spend coins that belong to a stranger",
                "Take back a payment he made a few blocks ago",
                "Raise the limit on the total number of coins",
                "Award himself a larger reward for each block"
              ],
              answer: 1,
              right: ["Yes: he can rewrite recent blocks, so he can take back his own recent payment."],
              wrong: [
                ["Spending a stranger's coins needs a signature from the stranger's key, and mining power cannot forge one.", "What he can do is rewrite recent blocks, and so take back a payment of his own."],
                null,
                ["The limit is a rule that nodes check, and miners have no power to change it.", "His real power is over recent history, where he can take back a payment he made a few blocks ago."],
                ["A block that pays its miner too much breaks a rule, and every node would ignore it.", "What he can do is rewrite recent blocks, and take back a payment he made himself."]
              ]
            } }
        ] },

      { id: "who-enforces", title: "Miners Propose, Nodes Decide", topics: ["full nodes", "validation", "invalid block", "division of labour", "who enforces the rules", "miners and nodes"],
        beats: [
          { slide: { k: "section", title: "Miners Propose, Nodes Decide", sub: "Why work cannot buy a broken rule" },
            at: "lectern", g: "open",
            say: [
              "Go back to the rule, and listen for the word I have been stepping over all hour.",
              { s: "Among the valid chains, the one with the most work is the history.", g: "pinch" },
              "Valid comes first.",
              "A node does not begin by asking which chain is heaviest; it begins by throwing away every chain that breaks a rule.",
              "Only then does it get out the scales."
            ] },
          { slide: { k: "figure", title: "Every node checks every block", ops: [
              { box: [4, 20, 28, 14], t: "new block", c: "amber", at: 0 },
              { arrow: [33, 27, 43, 27], at: 0 },
              { box: [44, 3, 68, 47], c: "blue", at: 1 },
              { text: "a node's checklist", x: 78, y: 9, a: "c", size: 4, c: "blue", at: 1 },
              { text: "work meets the target?", x: 48, y: 18, size: 3.8, at: 2 },
              { text: "every signature good?", x: 48, y: 25, size: 3.8, at: 3 },
              { text: "no coin spent twice?", x: 48, y: 32, size: 3.8, at: 3 },
              { text: "no coins from nowhere?", x: 48, y: 39, size: 3.8, at: 4 },
              { text: "reward not too large?", x: 48, y: 46, size: 3.8, at: 4 },
              { arrow: [113, 18, 126, 12], c: "green", at: 5 },
              { text: "all yes: keep", x: 128, y: 11, size: 3.8, c: "green", at: 5 },
              { arrow: [113, 36, 126, 42], c: "red", at: 6 },
              { text: "one no: ignore", x: 128, y: 44, size: 3.8, c: "red", at: 6 },
              { text: "it makes no difference who made the block", x: 80, y: 59, a: "c", size: 4.2, at: 7 }
            ] },
            at: "screen", g: "point",
            say: [
              "Here is what happens every time a block reaches a node.",
              "The node runs down a checklist, and you already know most of it from earlier lectures.",
              "Does the block's fingerprint meet the target, so that the work is real?",
              "Is every signature good, and is no coin being spent twice?",
              "Does any payment create coins from nowhere, and is the miner's reward no bigger than the schedule allows?",
              "If every answer is yes, the node keeps the block and passes it on.",
              { s: "If a single answer is no, the node drops the block and behaves as though it never arrived.", g: "chop" },
              "It makes no difference who made the block, or how much electricity went into it."
            ] },
          { board: { clear: true, title: "Heavy, and still wrong", ops: [
              { box: [8, 14, 52, 30], c: "red", at: 1 },
              { text: "block X", x: 34, y: 21, a: "c", size: 5, c: "red", at: 1 },
              { text: "work: enormous", x: 34, y: 30, a: "c", size: 4, at: 1 },
              { text: "pays miner double", x: 34, y: 38, a: "c", size: 4, c: "red", at: 2 },
              { arrow: [62, 29, 98, 29], at: 3 },
              { circle: [112, 29, 12], t: "node", c: "blue", at: 3 },
              { line: [73, 22, 87, 36], c: "red", at: 4 },
              { line: [87, 22, 73, 36], c: "red", at: 4 },
              { text: "ignored", x: 76, y: 43, a: "c", size: 5, c: "red", at: 4 },
              { box: [8, 56, 52, 16], t: "honest block", at: 5 },
              { arrow: [62, 64, 102, 40], c: "green", at: 5 },
              { text: "kept", x: 92, y: 60, a: "c", size: 5, c: "green", at: 5 },
              { text: "work buys a place in line, not a new rule", x: 80, y: 84, a: "c", size: 5, at: 7 }
            ] },
            say: [
              "Let me draw the case that surprises people.",
              "Here is block X, made by a miner with colossal resources, with more work in it than any block the network has ever seen.",
              "It has one flaw: it pays its miner double the reward that the schedule allows.",
              "The miner sends it to a node.",
              { s: "The node checks it, finds the broken rule, and ignores it, and all that work counts for precisely nothing.", g: "chop" },
              "Meanwhile an ordinary honest block arrives, and the node keeps that one.",
              "Think of a forged banknote printed on the most expensive press in the world: the shopkeeper who holds it up to the light still hands it back.",
              "Work buys a miner a place in the line of history, and it never buys a change to the rules."
            ] },
          { slide: { k: "compare", title: "A division of labour",
              left: { head: "Miners", points: ["Choose which payments go in", "Put them in an order", "Pay for it in work", "Earn only if nodes accept"] },
              right: { head: "Nodes", points: ["Check every block, every rule", "Ignore anything invalid", "Follow the most valid work", "Ask nobody's permission"] } },
            at: "centre", g: "weigh",
            say: [
              "So there is a division of labour here, and it is easy to get it backwards.",
              "Miners choose which payments go into a block and in what order, and they pay for the privilege in work.",
              "Nodes check everything the miners produce, and follow the heaviest chain that passes.",
              { s: "Miners propose, and nodes decide.", g: "chop" },
              "And notice who depends on whom: a miner's reward is only worth something if the people he wants to trade with accept his block.",
              "A miner who breaks a rule has paid a fortune in electricity to produce something the rest of the world behaves as if it cannot see.",
              "This is why you will hear it said that the rules are kept by those who run nodes, and a node is something you can run yourself."
            ] },
          { slide: { k: "quote", text: "They vote with their CPU power, expressing their acceptance of valid blocks by working on extending them and rejecting invalid blocks by refusing to work on them.", by: "Satoshi Nakamoto, Bitcoin whitepaper, conclusion, 2008" },
            at: "lectern", g: "open",
            say: [
              "The whitepaper's closing paragraph says it in one line.",
              "Read it for its two halves: accepting valid blocks by building on them, and rejecting invalid ones by refusing to.",
              "The paper imagines every node mining as well, so it speaks of the two jobs as one.",
              "Today most nodes do not mine at all, and the checking half of that sentence is done by anyone who runs the software.",
              { s: "How the rules themselves can ever change, when nobody is in charge of them, is a story I am saving for Lecture 13.", g: "up" }
            ] },
          { say: ["One more, and it is the idea I most want you to keep.", "A block arrives with enormous work behind it, but it creates coins from nothing, so what does a node do?"],
            quiz: {
              q: "A block has enormous work but creates coins from nothing. What does a node do?",
              options: [
                "Accepts it, but marks the extra coins as suspect",
                "Accepts it, because the most work always wins",
                "Ignores it, however much work it cost",
                "Asks other nodes how they intend to treat it"
              ],
              answer: 2,
              right: ["That is it: an invalid block is ignored, whatever it cost to make."],
              wrong: [
                ["There is no halfway house, because a block is either valid or it is not.", "This one breaks a rule, so the node ignores it, however much work it cost."],
                ["Most work wins only among valid chains, and this block is not valid.", "A node ignores a block that breaks a rule, however much work it cost."],
                null,
                ["A node never asks for opinions, since opinions can be faked.", "It checks the block itself, finds the broken rule, and ignores it."]
              ]
            } }
        ] },

      { id: "generals-answered", title: "The Generals, Answered", topics: ["byzantine generals", "fake identities", "one processor one vote", "probable agreement", "honest majority assumption", "next lecture"],
        beats: [
          { slide: { k: "section", title: "The Generals, Answered", sub: "Two debts from Lecture 1, paid" },
            at: "lectern", g: "open",
            say: [
              "Time to pay our debts.",
              "In Lecture 1 we left the Byzantine generals camped round a city, unable to agree because some of them might be lying.",
              "The classic solutions needed a known list of generals and, with plain messages, fewer than a third of them traitors.",
              "Two weeks after publishing the whitepaper, Satoshi was challenged on exactly this point on the mailing list.",
              { s: "The reply began: the proof-of-work chain is a solution to the Byzantine Generals' Problem.", g: "point" }
            ] },
          { slide: { k: "figure", title: "Generals who vote with work", ops: [
              { circle: [16, 14, 6], t: "A", c: "green" },
              { circle: [16, 42, 6], t: "B", c: "green" },
              { circle: [144, 14, 6], t: "C", c: "green" },
              { circle: [144, 42, 6], t: "D", c: "red" },
              { box: [50, 22, 18, 12], t: "plan", c: "amber", fill: true, at: 1 },
              { line: [68, 28, 74, 28], at: 2 },
              { box: [74, 22, 18, 12], t: "work", at: 2 },
              { line: [92, 28, 98, 28], at: 2 },
              { box: [98, 22, 18, 12], t: "work", at: 2 },
              { arrow: [23, 16, 48, 25], c: "grey", at: 3 },
              { arrow: [23, 40, 48, 31], c: "grey", at: 3 },
              { arrow: [137, 16, 118, 25], c: "grey", at: 3 },
              { text: "a lie needs work too", x: 134, y: 54, a: "c", size: 3.8, c: "red", at: 4 },
              { text: "the plan with the most work is the plan", x: 72, y: 47, a: "c", size: 4.2, c: "green", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "Here is the generals' problem again, played Satoshi's way.",
              "Any general may propose a plan, and whichever plan a general hears first, he starts working on.",
              "Working means solving a proof-of-work puzzle that has the plan baked into it, and then another on top, and another.",
              "Every general can look at the chain of solved puzzles and measure how much effort stands behind that plan.",
              "A traitor can still shout a different plan, but to make it count he must out-work all the loyal generals put together.",
              { s: "So the loyal generals settle on one plan, and each can see from the work alone that most of the army is behind it.", g: "up" },
              "No messenger had to be trusted, and no list of generals was ever needed."
            ] },
          { board: { clear: true, title: "A thousand masks, one machine", ops: [
              { circle: [18, 22, 6], c: "green", at: 1 },
              { circle: [18, 40, 6], c: "green", at: 1 },
              { circle: [18, 58, 6], c: "green", at: 1 },
              { box: [30, 16, 30, 12], c: "green", fill: true, at: 1 },
              { box: [30, 34, 30, 12], c: "green", fill: true, at: 1 },
              { box: [30, 52, 30, 12], c: "green", fill: true, at: 1 },
              { text: "3 honest, 3 machines", x: 8, y: 73, size: 4.5, c: "green", at: 1 },
              { circle: [120, 18, 7], c: "red", at: 2 },
              { circle: [98, 34, 4], c: "red", dash: true, at: 2 },
              { circle: [109, 34, 4], c: "red", dash: true, at: 2 },
              { circle: [120, 34, 4], c: "red", dash: true, at: 2 },
              { circle: [131, 34, 4], c: "red", dash: true, at: 2 },
              { circle: [142, 34, 4], c: "red", dash: true, at: 2 },
              { text: "... x 1000", x: 120, y: 44, a: "c", size: 4.5, c: "red", at: 2 },
              { box: [105, 52, 30, 12], c: "red", fill: true, at: 3 },
              { text: "1 cheat, 1 machine", x: 98, y: 73, size: 4.5, c: "red", at: 3 },
              { text: "weigh the work: 3 against 1", x: 80, y: 85, a: "c", size: 5.5, at: 4 }
            ] },
            say: [
              "And the cheat with a thousand masks?",
              "Here are three honest participants again, but this time each one brings a machine, and I will draw its work as a bar.",
              "Here is the cheat, with his thousand free identities.",
              "Behind all those masks there is still only one machine, and so only one bar of work.",
              { s: "The network never counts the masks; it weighs the bars, and three outweigh one.", g: "weigh" },
              "The whitepaper makes the same point: one internet address, one vote could be swamped by anyone able to collect addresses, so it is one processor, one vote instead.",
              "A mask is free, and a bar of work is not."
            ] },
          { slide: { k: "points", title: "The small print", start: 0, points: [
              "Agreement is probable, never signed and sealed",
              "It grows stronger with every block on top",
              "It assumes most mining power is not colluding",
              "Miners order, nodes check, and nobody leads"
            ] },
            at: "centre", g: "open",
            say: [
              { s: "Now the small print, because an honest lecture has some.", g: "glasses" },
              { s: "The generals of the 1982 paper reach certainty, and Bitcoin's nodes reach something different, which is overwhelming probability.", show: 1 },
              { s: "The newest block might still be replaced, the one beneath it almost certainly will not be, and a few blocks down the odds are beyond worrying about.", show: 2 },
              { s: "And all of it rests on an assumption: that most of the mining power is not working together to cheat.", show: 3 },
              { s: "Given that, strangers who have never met, and never will, keep one ledger in one order.", show: 4, g: "wide" },
              "No leader was appointed, and none can be removed, because there is no such office."
            ] },
          { slide: { k: "table", title: "Part two, complete: the ledger", start: 0, head: ["Lecture", "What we now know"], rows: [
              ["4  Coins Are Outputs", "what the ledger records"],
              ["5  Programmable Locks", "the conditions for spending"],
              ["6  Blocks and the Chain", "how the pages are bound in order"],
              ["7  Mining: Proof of Work", "why a page is costly to write"],
              ["8  Agreement Without a Leader", "how everyone picks one history"]
            ] },
            at: "lectern", g: "open",
            say: [
              "That completes the second part of this course, the ledger.",
              { s: "We know what it records and how coins are locked, how its pages are bound, and why each page is costly to write.", show: 4, g: "count" },
              { s: "And as of today we know how thousands of copies of it stay the same, with nobody in charge.", show: 5 },
              { s: "But I have been cheating slightly all hour, with phrases like the block is sent out, and the news arrives.", g: "shrug" },
              "Sent how, and to whom, and along what wires?"
            ] },
          { slide: { k: "live", title: "The tip of the chain, right now", panel: "blocks", note: "Live from the Bitcoin network while the hall is open" },
            at: "screen", g: "point",
            say: [
              "Here is the tip of the real chain as it stands this minute.",
              "The newest block is the one written in pencil, and every block before it is buried a little deeper.",
              "Now and then, somewhere, a node sees two rival tips, waits for one more block, and moves on.",
              "Every one of those blocks was checked by thousands of machines that asked nobody's permission and took nobody's word.",
              { s: "That is what agreement without a leader looks like: quiet, repetitive and rather dull, which is exactly what you want from a ledger.", g: "open" }
            ] },
          { slide: { k: "figure", title: "Next time: the peer-to-peer network", ops: [
              { circle: [20, 16, 4] }, { circle: [52, 30, 4] }, { circle: [24, 46, 4] }, { circle: [86, 12, 4] },
              { circle: [92, 44, 4] }, { circle: [124, 28, 4] }, { circle: [146, 12, 4] }, { circle: [142, 48, 4] },
              { line: [24, 18, 48, 28], c: "grey" }, { line: [28, 44, 48, 32], c: "grey" },
              { line: [56, 28, 82, 14], c: "grey" }, { line: [56, 32, 88, 43], c: "grey" },
              { line: [90, 13, 120, 26], c: "grey" }, { line: [96, 43, 120, 30], c: "grey" },
              { line: [128, 26, 143, 15], c: "grey" }, { line: [127, 31, 139, 45], c: "grey" },
              { line: [20, 20, 23, 42], c: "grey" }, { line: [87, 16, 91, 40], c: "grey" },
              { box: [3, 3, 13, 8], t: "pay", c: "amber", fill: true, at: 2 },
              { arrow: [25, 19, 47, 28], c: "amber", at: 2 },
              { arrow: [57, 28, 81, 15], c: "amber", at: 2 },
              { arrow: [57, 33, 87, 44], c: "amber", at: 2 },
              { text: "no centre, no map, no address book", x: 80, y: 60, a: "c", size: 4.5, at: 3 }
            ] },
            at: "lectern", g: "open",
            say: [
              "Next time we begin the third part of the course, the network and its users.",
              "Lecture 9 is The Peer-to-Peer Network.",
              "We will follow one payment as it hops from computer to computer, and see where it waits before a miner picks it up.",
              "We will ask how a new node finds anyone to talk to, on a network with no centre and no address book.",
              "And we will see what it takes to run a node of your own, which, after today, you know is where the rules are kept.",
              "Before then, read sections 5 and 11 of the whitepaper again; they are short, and you can now follow every line.",
              { s: "Thank you, and I will see you in Lecture 9.", g: "up" }
            ] }
        ] }
    ]
  });
})();
