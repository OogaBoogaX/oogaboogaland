// Bitcoin from First Principles, lecture 13: how rules change when nobody is in charge. A rule change as software people choose to run, the proposal process (BIPs 1, 2 and 3) as writing down and not approving, soft forks against hard forks, the record from 2010 to taproot (the quiet early fixes, pay to script hash, the March 2013 split, the block size years, segregated witness, BIP 148, SegWit2x, Bitcoin Cash), what it showed about who decides, and the open argument over whether the base rules should change at all.
(() => {
  "use strict";
  window.BL.lectures.add({
    id: "btc-13", course: "first-principles", n: 13, title: "How Bitcoin Changes",
    reading: [
      { title: "BIP 3: Updated BIP Process", by: "Murch, 2025" },
      { title: "BIP 50: March 2013 Chain Fork Post-Mortem", by: "Gavin Andresen, 2013" }
    ],
    sources: [
      "Amir Taaki, BIP 1: BIP Purpose and Guidelines (2011), https://github.com/bitcoin/bips/blob/master/bip-0001.mediawiki",
      "Luke Dashjr, BIP 2: BIP process, revised (2016), https://github.com/bitcoin/bips/blob/master/bip-0002.mediawiki",
      "Murch, BIP 3: Updated BIP Process (2025), https://github.com/bitcoin/bips/blob/master/bip-0003.md",
      "Shaolin Fry and Luke Dashjr, BIP 8: Version bits with lock-in by height (2017), https://github.com/bitcoin/bips/blob/master/bip-0008.mediawiki",
      "Pieter Wuille, Peter Todd, Greg Maxwell and Rusty Russell, BIP 9: Version bits with timeout and delay (2015), https://github.com/bitcoin/bips/blob/master/bip-0009.mediawiki",
      "Gavin Andresen, BIP 16: Pay to Script Hash (2012), https://github.com/bitcoin/bips/blob/master/bip-0016.mediawiki, with Luke Dashjr, BIP 17, https://github.com/bitcoin/bips/blob/master/bip-0017.mediawiki",
      "Gavin Andresen, BIP 50: March 2013 Chain Fork Post-Mortem (2013), https://github.com/bitcoin/bips/blob/master/bip-0050.mediawiki, with the alert of the day, https://bitcoin.org/en/alert/2013-03-11-chain-fork",
      "James Hilliard, BIP 91: Reduced threshold Segwit MASF (2017), https://github.com/bitcoin/bips/blob/master/bip-0091.mediawiki",
      "Eric Lombrozo, Johnson Lau and Pieter Wuille, BIP 141: Segregated Witness (Consensus layer) (2015), https://github.com/bitcoin/bips/blob/master/bip-0141.mediawiki",
      "Shaolin Fry, BIP 148: Mandatory activation of segwit deployment (2017), https://github.com/bitcoin/bips/blob/master/bip-0148.mediawiki",
      "Pieter Wuille, Jonas Nick and Anthony Towns, BIP 341: Taproot: SegWit version 1 spending rules (2020), https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki",
      "Shinobius and Michael Folkson, BIP 343: Mandatory activation of taproot deployment (2021), https://github.com/bitcoin/bips/blob/master/bip-0343.mediawiki",
      "Bitcoin Core 0.13.1 release notes, 27 October 2016, https://bitcoincore.org/en/2016/10/27/release-0.13.1/",
      "Bitcoin Core 0.21.1 release notes, 1 May 2021, https://bitcoincore.org/en/releases/0.21.1/",
      "Bitcoin Wiki, Value overflow incident, https://en.bitcoin.it/wiki/Value_overflow_incident",
      "Bitcoin Wiki, Block size limit controversy, https://en.bitcoin.it/wiki/Block_size_limit_controversy",
      "Bitcoin Wiki, New York Agreement, https://en.bitcoin.it/wiki/New_York_Agreement",
      "Mike Belshe, Segwit2x Final Steps, bitcoin-segwit2x mailing list, 8 November 2017, https://lists.linuxfoundation.org/pipermail/bitcoin-segwit2x/2017-November/000685.html",
      "Bitcoin Cash, https://en.wikipedia.org/wiki/Bitcoin_Cash"
    ],
    sections: [
      { id: "rules-no-ruler", title: "Rules With No Ruler", topics: ["who is in charge", "governance", "rule changes", "consensus rules", "upgrading software"],
        beats: [
          { slide: { k: "title", kicker: "Lecture 13", title: "How Bitcoin Changes", sub: "Proposals, soft forks and the history behind the process" },
            at: "lectern", g: "open",
            say: [
              "Welcome back, and welcome to the last part of this course.",
              "We have taken the machine apart: the tools, the ledger, and the network with the people who use it.",
              { s: "The final part is called change and scale, and it has two lectures.", g: "count" },
              "Today is about change, and next time is about scale.",
              "In lecture 1 we met a founder who walked away, leaving open code and nobody with a casting vote.",
              "I called that the most underrated event in the story, and today we find out what it costs.",
              { s: "Because here is the puzzle: if nobody is in charge, how does anything ever get changed?", g: "lean" }
            ] },
          { slide: { k: "points", title: "A puzzle in four lines", start: 0, points: [
              "Every node checks the same rules",
              "Software has bugs, and needs improving",
              "Nobody can order anyone to upgrade",
              "So who decides, and how?"
            ] },
            at: "centre", g: "open",
            say: [
              { s: "Remember what holds this system together: every node checks every block against the same rules.", show: 1 },
              "That sameness is the whole point, because a ledger whose copies disagree is no ledger at all.",
              { s: "But the rules live in software, and software is written by people, so it has mistakes and missing features.", show: 2 },
              { s: "And there is no head office that can push an update to your machine, or order you to install one.", show: 3, g: "chop" },
              { s: "So we have rules that must stay identical everywhere, that sometimes need to change, with no one able to change them.", show: 4, g: "shrug" },
              "It sounds like a recipe for a system frozen for ever, and yet the rules have changed, several times."
            ] },
          { slide: { k: "figure", title: "What a rule change really is", ops: [
              { box: [4, 20, 30, 12], t: "an idea" },
              { arrow: [36, 26, 50, 26], at: 1 },
              { box: [52, 20, 38, 12], t: "new software", c: "blue", at: 1 },
              { arrow: [92, 26, 104, 26], at: 2 },
              { circle: [112, 12, 4], c: "green", fill: true, at: 2 },
              { circle: [126, 12, 4], c: "green", fill: true, at: 2 },
              { circle: [140, 12, 4], c: "grey", at: 3 },
              { circle: [112, 26, 4], c: "green", fill: true, at: 2 },
              { circle: [126, 26, 4], c: "grey", at: 3 },
              { circle: [140, 26, 4], c: "green", fill: true, at: 2 },
              { circle: [112, 40, 4], c: "grey", at: 3 },
              { circle: [126, 40, 4], c: "green", fill: true, at: 2 },
              { circle: [140, 40, 4], c: "green", fill: true, at: 2 },
              { text: "each owner chooses", x: 126, y: 49, a: "c", size: 4, c: "grey", at: 3 },
              { text: "a rule changes when enough people run the change", x: 80, y: 59, a: "c", size: 4.5, c: "green", at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "So let us be precise about what a change to Bitcoin's rules actually is.",
              "Somebody has an idea, and somebody writes it into a new version of the software.",
              "That new version is offered to the world, and each person who runs a node decides whether to install it.",
              "Some do, some wait, and some never will, and nobody can make the choice for them.",
              { s: "A rule changes when enough of the people who run the software choose to run the change.", g: "pinch" },
              "Everything else today, the proposals, the arguments and the ways of switching a rule on, is about how that choice gets coordinated."
            ] },
          { at: "left", g: "open",
            say: [
              "Think of a language rather than a company.",
              "Nobody owns English, and nobody can announce that from Monday a word means something else.",
              "A new word enters the language when enough people start using it, and it dies when they stop.",
              { s: "Dictionaries matter, but they record what speakers do, and they do not command it.", g: "weigh" },
              "Keep that picture, because Bitcoin has a dictionary of its own, and we come to it in a moment."
            ] },
          { say: ["First, a check on the idea everything else rests on.", "In practice, what is a change to Bitcoin's rules?"],
            quiz: {
              q: "In practice, what is a change to Bitcoin's rules?",
              options: [
                "A vote won by the largest miners",
                "An order sent out by the lead developers",
                "A decision by the companies that hold the most coins",
                "New software that people choose to run"
              ],
              answer: 3,
              right: ["Yes: a change is software, and it becomes a rule only when people choose to run it."],
              wrong: [
                ["Miners build blocks, but a block that breaks the rules your node checks is simply ignored.", "A change becomes real only as new software that people choose to run."],
                ["Developers can write and publish code, but they cannot install it on anyone's machine.", "A rule change is new software that people choose to run."],
                ["Holding coins gives nobody a lever over other people's computers.", "A rule change is new software, and it takes hold when people choose to run it."],
                null
              ]
            } }
        ] },

      { id: "proposals", title: "Writing Ideas Down", topics: ["bip", "improvement proposals", "bip 1", "bip 2", "bip 3", "mailing list", "editors"],
        beats: [
          { slide: { k: "section", title: "Writing Ideas Down", sub: "The improvement proposal, and what it is not" },
            at: "lectern", g: "open",
            say: [
              "If change needs coordinating, the first job is simply to say clearly what is being proposed.",
              "In Bitcoin's first years, that happened in forum threads, in emails and in the code itself.",
              "In 2011 a developer named Amir Taaki suggested something tidier, borrowed from the Python programming language.",
              "He called it a Bitcoin Improvement Proposal, or BIP, and the document that describes the scheme is BIP 1.",
              "A BIP, it says, is a design document: a precise description of an idea, and the reasons for it."
            ] },
          { slide: { k: "figure", title: "The life of a proposal", ops: [
              { box: [2, 14, 20, 12], t: "idea" },
              { arrow: [23, 20, 29, 20], at: 1 },
              { box: [30, 14, 30, 12], t: "discussion", at: 1 },
              { arrow: [61, 20, 67, 20], at: 2 },
              { box: [68, 14, 26, 12], t: "draft BIP", at: 2 },
              { arrow: [95, 20, 101, 20], at: 3 },
              { box: [102, 14, 24, 12], t: "number", c: "blue", at: 3 },
              { text: "an editor checks the form, not the merit", x: 82, y: 33, a: "c", size: 3.8, c: "grey", at: 3 },
              { arrow: [127, 20, 133, 20], at: 4 },
              { box: [134, 14, 24, 12], t: "code", at: 4 },
              { arrow: [146, 27, 146, 41], c: "amber", at: 5 },
              { box: [118, 42, 40, 12], t: "who runs it?", c: "amber", fill: true, at: 5 },
              { text: "published is not adopted", x: 58, y: 48, a: "c", size: 4.5, c: "red", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "Here is the path an idea usually takes.",
              "It starts as a discussion, these days on a public mailing list for Bitcoin development, where other people try to break it.",
              "If it survives, the author writes a draft in a fixed format: what it does, why, and how older software is affected.",
              "An editor then gives it a number, and the editor's job is clerical: is it on topic, is it complete, is it clearly written.",
              "Someone writes the code, others review it, and it may be offered in a release of the software.",
              { s: "And only then comes the step that counts, which no document can perform: people run it, or they do not.", g: "lean" }
            ] },
          { slide: { k: "quote", text: "The BIP process does not aim to be a kind of forceful \"governance\" of Bitcoin, merely to provide a collaborative repository for proposing and providing information on standards, which people may voluntarily adopt or not.", by: "BIP 2, by Luke Dashjr, 2016" },
            at: "centre", g: "open",
            say: [
              "The process was revised in 2016 in BIP 2, written by Luke Dashjr, and its own words are worth reading.",
              { s: "Not governance, then, but a repository: a shared filing cabinet.", g: "pinch" },
              "The current version of the process, BIP 3, written by a developer known as Murch, is blunter still.",
              "It says that no formal or informal decision body governs Bitcoin development or decides adoption of BIPs.",
              "So a BIP number is not a stamp of approval, any more than a library catalogue number says that a book is true."
            ] },
          { slide: { k: "points", title: "What a BIP is, and is not", start: 0, points: [
              "Is: a clear, public description of one idea",
              "Is: a record of the objections raised",
              "Is not: approval by any authority",
              "Is not: a promise that anyone will run it"
            ] },
            at: "right", g: "count",
            say: [
              { s: "So a proposal is a clear, public description of one idea, which anyone may read and criticise.", show: 1 },
              { s: "From the very first version, the author has been responsible for documenting the dissenting opinions too.", show: 2 },
              { s: "It is not approval, because there is no authority in the building to approve it.", show: 3, g: "chop" },
              { s: "And it is not a promise, since plenty of numbered proposals have never been run by anybody.", show: 4 },
              { s: "The process is a way of writing ideas down, and the deciding happens somewhere else.", g: "open" }
            ] },
          { say: ["Let me check that distinction before we use it.", "What does it mean when a proposal is given a BIP number?"],
            quiz: {
              q: "What does it mean when a proposal is given a BIP number?",
              options: [
                "Every node must now follow it",
                "It has been written up clearly and published",
                "The developers have approved it",
                "Miners have voted to accept it"
              ],
              answer: 1,
              right: ["Right: a number means it is on the shelf to be read, and nothing more."],
              wrong: [
                ["No document can make a node do anything, since each owner chooses what to run.", "A number means only that the idea is written up clearly and published."],
                null,
                ["There is no body of developers with the power to approve a rule.", "A number only means the idea has been written up clearly and published."],
                ["Numbers are given by editors doing clerical work, and no vote is involved.", "A number means the proposal has been written up clearly and published."]
              ]
            } }
        ] },

      { id: "soft-and-hard-forks", title: "Tighten or Loosen", topics: ["soft fork", "hard fork", "backward compatibility", "chain split", "old nodes"],
        beats: [
          { slide: { k: "section", title: "Tighten or Loosen", sub: "Soft forks, hard forks and the nodes left behind" },
            at: "lectern", g: "open",
            say: [
              "Now for the most useful distinction in this whole subject.",
              "Not every node upgrades on the same day, and some never upgrade at all.",
              { s: "So the question to ask of any change is this: what happens to the nodes still running the old rules?", g: "lean" },
              "The answer depends on whether the change tightens the rules or loosens them."
            ] },
          { board: { clear: true, title: "Tightening: a soft fork", ops: [
              { ellipse: [80, 46, 62, 30], at: 0 },
              { text: "blocks the old rules allow", x: 80, y: 25, a: "c", size: 4.5, at: 1 },
              { ellipse: [80, 52, 34, 14], c: "green", at: 2 },
              { text: "new rules allow", x: 80, y: 49, a: "c", size: 4.5, c: "green", at: 2 },
              { circle: [80, 58, 2.5], c: "green", fill: true, at: 3 },
              { text: "old nodes: still valid", x: 80, y: 84, a: "c", size: 5, c: "green", at: 4 }
            ] },
            say: [
              "Let me draw every block that could ever exist, and circle the ones the current rules allow.",
              "Everything inside this big shape is a valid block, as far as today's nodes are concerned.",
              "Now suppose a new rule forbids something that used to be allowed, so the new shape sits inside the old one.",
              "A block made under the new rules lands in the small shape, which is also inside the big one.",
              "So a node that never upgraded looks at that block and sees nothing wrong with it.",
              { s: "That is a soft fork: the rules get tighter, and old nodes follow along without knowing anything has changed.", g: "pinch" }
            ] },
          { at: "centre", g: "open",
            say: [
              "Here is an everyday version.",
              "A road has a speed limit of 60, and one town decides that its drivers will keep to 50.",
              "An officer who only knows the old limit watches them go by and has no complaint, because 50 is under 60.",
              "The careful drivers are obeying both rules at once.",
              { s: "There is a catch, though: the old officer is no longer checking everything that matters.", g: "weigh" },
              "An old node follows a soft fork but cannot enforce the new rule, so it leans on the upgraded nodes and miners to do that."
            ] },
          { board: { clear: true, title: "Loosening: a hard fork", ops: [
              { ellipse: [80, 48, 36, 15], at: 0 },
              { text: "old rules allow", x: 80, y: 46, a: "c", size: 4.5, at: 0 },
              { ellipse: [80, 46, 66, 30], c: "red", dash: true, at: 1 },
              { text: "new rules allow more", x: 80, y: 23, a: "c", size: 4.5, c: "red", at: 1 },
              { circle: [128, 48, 2.5], c: "red", fill: true, at: 2 },
              { text: "new block", x: 128, y: 55, a: "c", size: 3.8, c: "red", at: 2 },
              { text: "old nodes: invalid", x: 80, y: 84, a: "c", size: 5, c: "red", at: 3 }
            ] },
            say: [
              "Now the other direction, starting again from what the old rules allow.",
              "This time the change permits something that used to be forbidden, so the new shape is bigger than the old.",
              "Sooner or later a block lands out here, fine under the new rules and outside the old ones.",
              "A node that has not upgraded checks that block, finds that it breaks the rules, and ignores it.",
              "It ignores every block built on top of it as well, and waits for one it can accept.",
              { s: "That is a hard fork: the rules get looser, and anyone who does not upgrade is left on a different path.", g: "chop" }
            ] },
          { slide: { k: "compare", title: "Two directions of change",
              left: { head: "Soft fork: tighter", points: ["Forbids something once allowed", "Old nodes still accept new blocks", "Old nodes cannot enforce it", "Upgrade when you are ready"] },
              right: { head: "Hard fork: looser", points: ["Allows something once forbidden", "Old nodes reject the new blocks", "Everyone must move together", "Or the chain splits in two"] } },
            at: "left", g: "weigh",
            say: [
              "Side by side, the difference is about who has to move.",
              "A soft fork forbids something, old nodes still accept the new blocks, and people can upgrade in their own time.",
              "A hard fork allows something new, old nodes reject those blocks, and so everybody has to move together.",
              { s: "If they do not all move, the result is the thing everyone in this story is afraid of.", g: "lean" }
            ] },
          { board: { clear: true, title: "One chain becomes two", ops: [
              { box: [6, 38, 18, 12], at: 0 },
              { line: [24, 44, 30, 44], at: 0 },
              { box: [30, 38, 18, 12], at: 0 },
              { line: [48, 44, 54, 44], at: 0 },
              { box: [54, 38, 18, 12], at: 0 },
              { arrow: [72, 41, 86, 24], c: "blue", at: 1 },
              { box: [88, 14, 18, 12], c: "blue", at: 1 },
              { line: [106, 20, 112, 20], c: "blue", at: 1 },
              { box: [112, 14, 18, 12], c: "blue", at: 1 },
              { text: "old rules", x: 146, y: 20, a: "c", size: 4.5, c: "blue", at: 1 },
              { arrow: [72, 47, 86, 64], c: "red", at: 2 },
              { box: [88, 60, 18, 12], c: "red", at: 2 },
              { line: [106, 66, 112, 66], c: "red", at: 2 },
              { box: [112, 60, 18, 12], c: "red", at: 2 },
              { text: "new rules", x: 146, y: 66, a: "c", size: 4.5, c: "red", at: 2 },
              { text: "shared history", x: 39, y: 31, a: "c", size: 4.5, c: "grey", at: 3 },
              { text: "two ledgers, two coins", x: 80, y: 84, a: "c", size: 5.5, at: 4 }
            ] },
            say: [
              "Here is a chain of blocks that every node agrees on.",
              "After a hard fork that not everyone adopts, the nodes on the old rules carry on building up here.",
              "The nodes on the new rules build down here, on blocks the others will never accept.",
              "Both sides share every block up to the fork, so every coin that existed before it now exists on both.",
              { s: "From that point there are two ledgers and, in effect, two different currencies with a common past.", g: "wide" },
              "Whether that is a disaster or an amicable parting depends a great deal on whether people saw it coming.",
              "A soft fork can split a chain too, if miners keep producing blocks that the tighter rule forbids, and we will meet that risk in 2017."
            ] },
          { say: ["A question on those two shapes.", "Which kind of change can a node that never upgrades still follow?"],
            quiz: {
              q: "Which kind of change can a node that never upgrades still follow?",
              options: [
                "A soft fork, because it only tightens the rules",
                "Any change, as long as miners agree to it",
                "Neither kind: every change needs an upgrade",
                "A hard fork, because it allows more"
              ],
              answer: 0,
              right: ["Exactly: tighter rules still fit inside the old ones, so old nodes keep following."],
              wrong: [
                null,
                ["Miners agreeing does not help an old node, which rejects any block outside its own rules.", "Only a soft fork, which tightens the rules, can be followed without upgrading."],
                ["That is too gloomy, because blocks made under tighter rules still pass the old checks.", "A soft fork only tightens the rules, so a node can follow it without upgrading."],
                ["Allowing more is exactly what an old node cannot accept, so a hard fork leaves it behind.", "It is the soft fork, which only tightens the rules, that old nodes can follow."]
              ]
            } }
        ] },

      { id: "early-changes", title: "Quiet Fixes, First Arguments", topics: ["satoshi's changes", "value overflow", "one megabyte limit", "pay to script hash", "bip 16", "miner signalling", "bip 9"],
        beats: [
          { slide: { k: "section", title: "Quiet Fixes, First Arguments", sub: "2010 to 2012: from one author to many voices" },
            at: "lectern", g: "open",
            say: [
              "With those tools in hand, let us walk through the record.",
              "I will tell it as evenly as I can, because people who lived through these years still disagree about them.",
              "In the beginning, change was easy, for the simple reason that almost nobody was there.",
              "Satoshi wrote the code, a small band of enthusiasts ran it, and rule changes arrived inside ordinary new versions."
            ] },
          { slide: { k: "number", value: "184 billion", label: "bitcoins created by a bug in block 74,638, on 15 August 2010", note: "A fix was out within five hours; the repaired chain took the lead at block 74,691" },
            at: "centre", g: "open",
            say: [
              "The most dramatic early change was an emergency.",
              "On 15 August 2010, somebody used an arithmetic bug to create more than 184 billion bitcoins in a single transaction.",
              "You know from lecture 7 that there are only ever meant to be 21 million.",
              "Within about five hours a corrected version was published, with a new rule that rejects such transactions.",
              "People installed it, the repaired chain overtook the bad one the next day, and the bogus coins vanished from history.",
              { s: "Notice the shape of the fix: it forbade something, so in today's language it was a soft fork.", g: "point" }
            ] },
          { slide: { k: "points", title: "Changes nobody voted on", start: 0, points: [
              "Summer 2010: several rules tightened",
              "Among them: one megabyte at most per block",
              "No proposal, no number, no signalling",
              "It worked because the network was tiny"
            ] },
            at: "left", g: "open",
            say: [
              { s: "That same summer, other rules were tightened with even less ceremony.", show: 1 },
              { s: "One was a cap of one megabyte on the size of a block, added by Satoshi in a change whose description did not mention it.", show: 2 },
              "It is generally understood as a guard against someone flooding the young network, and blocks then were nowhere near that size.",
              { s: "There was no proposal, no number and no waiting period, just a new version and a request to upgrade.", show: 3 },
              { s: "That worked because the network was tiny and its author was trusted, and both of those things were about to change.", show: 4, g: "weigh" },
              "Remember the megabyte, because it returns in 2015 as the villain or the hero, depending on whom you ask."
            ] },
          { slide: { k: "figure", title: "2012: a change argued in public", ops: [
              { box: [6, 6, 40, 10], t: "BIP 12", c: "grey", at: 1 },
              { text: "dropped: a flaw was found", x: 50, y: 11, size: 3.8, c: "grey", at: 1 },
              { box: [6, 22, 40, 10], t: "BIP 16", c: "green", at: 2 },
              { text: "pay to script hash", x: 50, y: 27, size: 3.8, c: "green", at: 2 },
              { box: [6, 38, 40, 10], t: "BIP 17", c: "blue", at: 2 },
              { text: "a rival design", x: 50, y: 43, size: 3.8, c: "blue", at: 2 },
              { arrow: [100, 27, 112, 27], at: 3 },
              { box: [114, 18, 42, 18], t: "miners signal", c: "amber", at: 3 },
              { text: "in force for blocks from 1 April 2012", x: 80, y: 58, a: "c", size: 4.5, at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "The first change argued out in the modern way came in 2012, a year after Satoshi left.",
              "Developers wanted a neater way to lock coins to a script, and the first attempt, BIP 12, was dropped when a flaw was found in it.",
              "Two replacements then competed, BIP 16 from Gavin Andresen and BIP 17 from Luke Dashjr, and the debate between them grew heated.",
              "To judge whether enough mining power supported it, miners were asked to write a short tag into the blocks they made.",
              "BIP 16 gathered the support, and its rule, pay to script hash, has applied to blocks since 1 April 2012.",
              "Lecture 5 covered what that lock does, and what matters today is the method."
            ] },
          { slide: { k: "points", title: "The pattern that emerged", start: 0, points: [
              "Write the change as a tightening, if possible",
              "Publish it, and argue in the open",
              "Let miners signal that they are ready",
              "Switch on only once nearly all blocks comply"
            ] },
            at: "right", g: "count",
            say: [
              "Over the next few years a pattern settled in.",
              { s: "Design the change as a tightening where you can, so that old nodes are not thrown off.", show: 1 },
              { s: "Publish it as a proposal, and let it be attacked in public.", show: 2 },
              { s: "Then ask miners to flag, in the blocks they make, that they are ready to enforce it.", show: 3 },
              { s: "Switch the rule on only when nearly all recent blocks carry the flag, so that the chain old nodes follow keeps the new rule.", show: 4 },
              "In 2015 this was tidied into a standard method, BIP 9, with a threshold of 95 per cent of the blocks in a two-week window.",
              { s: "Hold on to one question: is that flag a signal that miners are ready, or a vote on whether the change should happen?", g: "pinch" }
            ] }
        ] },

      { id: "march-2013", title: "March 2013: An Accident", topics: ["march 2013 fork", "bip 50", "accidental hard fork", "database bug", "version 0.8"],
        beats: [
          { slide: { k: "section", title: "March 2013: An Accident", sub: "A split that nobody proposed" },
            at: "lectern", g: "open",
            say: [
              "Not every rule change is proposed by somebody.",
              "In March 2013 the network changed its own rules by accident, and split in two for several hours.",
              "The project's own post-mortem is published as BIP 50, and I recommend it as a model of honest engineering."
            ] },
          { board: { clear: true, title: "11 March 2013", ops: [
              { box: [6, 38, 26, 12], t: "225,429", at: 0 },
              { arrow: [32, 41, 50, 24], c: "blue", at: 1 },
              { box: [52, 14, 26, 12], t: "225,430", c: "blue", at: 1 },
              { text: "big block", x: 65, y: 9, a: "c", size: 4, c: "blue", at: 1 },
              { line: [78, 20, 86, 20], c: "blue", at: 2 },
              { box: [86, 14, 14, 12], c: "blue", at: 2 },
              { line: [100, 20, 108, 20], c: "blue", at: 2 },
              { box: [108, 14, 14, 12], c: "blue", at: 2 },
              { text: "0.8: about 60%", x: 141, y: 20, a: "c", size: 4.5, c: "blue", at: 2 },
              { arrow: [32, 47, 50, 64], c: "green", at: 3 },
              { box: [52, 60, 14, 12], c: "green", at: 3 },
              { line: [66, 66, 74, 66], c: "green", at: 3 },
              { box: [74, 60, 14, 12], c: "green", at: 3 },
              { text: "0.7 and older", x: 110, y: 66, a: "c", size: 4.5, c: "green", at: 3 },
              { arrow: [141, 26, 141, 60], c: "amber", at: 5 },
              { text: "pools switch back", x: 136, y: 72, a: "c", size: 4.5, c: "amber", at: 5 },
              { text: "abandoned", x: 87, y: 33, a: "c", size: 4.5, c: "red", at: 6 }
            ] },
            say: [
              "Here is the chain on 11 March 2013.",
              "At block 225,430 a miner produced a block that was unusually large and busy, though perfectly within the written rules.",
              "Nodes running the new version 0.8 accepted it and carried on, and they had about 60 per cent of the mining power.",
              "Many nodes running version 0.7 and older choked on it, rejected it, and built their own chain from the block before.",
              "The cause was a database: the older software used one with a hidden limit, and version 0.8 had swapped it for another.",
              "Within hours, developers and the operators of two large mining pools, BTC Guild and Slush, agreed to go back to the old version, at real cost to themselves.",
              "The older chain pulled ahead, the newer nodes switched over to it, and about two dozen blocks were abandoned."
            ] },
          { slide: { k: "points", title: "What the accident taught", start: 0, points: [
              "The real rules are what the software does",
              "A hidden quirk can be a rule nobody wrote",
              "Loosening by mistake is still a hard fork",
              "In a crisis, people coordinate, and fast"
            ] },
            at: "centre", g: "open",
            say: [
              { s: "The first lesson is uncomfortable: the real rules are not a document, they are whatever the running software actually does.", show: 1 },
              { s: "A limit buried in a database had become, in the post-mortem's words, a network consensus rule, and nobody knew it was there.", show: 2 },
              { s: "Removing that limit loosened the rules, so version 0.8 was a hard fork that nobody had intended.", show: 3 },
              "At least one large double spend got through in the confusion, made by someone who, the report says, was experimenting rather than stealing.",
              { s: "And the last lesson is about people: the fix was not automatic, it was a decision, made quickly and in the open.", show: 4, g: "lean" },
              "The side that was abandoned had the newer software and the larger share of the mining power.",
              { s: "It lost because the older rules were the ones that every node on the network could still follow.", g: "pinch" },
              "The hidden limit was later removed on purpose, with a date announced in advance, which is how a hard fork is supposed to go."
            ] },
          { say: ["Before we leave 2013, a quick check.", "Why did the chain split in March 2013?"],
            quiz: {
              q: "Why did the chain split in March 2013?",
              options: [
                "An attacker took over most of the mining power",
                "A proposal was switched on before it was ready",
                "Old and new software disagreed about one block",
                "Miners voted to raise the block size"
              ],
              answer: 2,
              right: ["Yes: a hidden difference between versions meant that one accepted a block the other refused."],
              wrong: [
                ["There was no attacker, only honest miners running two versions of the software.", "The versions disagreed about one block, and each group built on its own view."],
                ["No proposal was involved, because nobody had meant to change the rules at all.", "Old and new software simply disagreed about one block, and the chain split there."],
                null,
                ["Nobody voted for anything that day, and the block size argument came later.", "The split came from old and new software disagreeing about whether one block was valid."]
              ]
            } }
        ] },

      { id: "block-size-years", title: "The Block Size Years", topics: ["block size debate", "bitcoin xt", "segregated witness", "bip 141", "bip 148", "user-activated soft fork", "new york agreement", "segwit2x", "bitcoin cash"],
        beats: [
          { slide: { k: "section", title: "The Block Size Years", sub: "2015 to 2017: one megabyte, two visions" },
            at: "lectern", g: "open",
            say: [
              "Now to the longest and bitterest argument in Bitcoin's history.",
              "Remember the one megabyte cap from 2010.",
              "By 2015 blocks were filling up, and as lecture 10 showed, when space runs short, fees rise and payments wait.",
              { s: "Everybody agreed a choice had to be made, and almost nobody agreed on what to choose.", g: "shrug" }
            ] },
          { slide: { k: "compare", title: "Two honest positions",
              left: { head: "Raise the limit", points: ["Cheap payments for everyone", "Growth needs room on the chain", "A simple change to one number", "Waiting drives users away"] },
              right: { head: "Keep blocks small", points: ["Anyone can afford to run a node", "More nodes, fewer gatekeepers", "A hard fork risks a split", "Scale in layers above the chain"] } },
            at: "left", g: "weigh",
            say: [
              "Let me put each side in words its own supporters would recognise.",
              "One side said Bitcoin was meant to be cash for everyone, that full blocks would price ordinary people out, and that raising one number was the obvious fix.",
              "The other side said bigger blocks make a node costlier to run, and that a system only a few data centres can check has rebuilt the keeper from lecture 1.",
              "They added that raising the limit loosens the rules, which means a hard fork, with everything that implies.",
              { s: "Both sides wanted Bitcoin to succeed, and each believed the other was endangering it.", g: "open" },
              "I am not going to tell you who was right, and you should be wary of anyone who finds it easy."
            ] },
          { slide: { k: "table", title: "Rival software, 2015 to 2017", start: 0, head: ["Software", "Its answer", "What happened"], rows: [
              ["Bitcoin XT, 2015", "8 MB, then doubling", "too few miners joined"],
              ["Bitcoin Classic, 2016", "2 MB", "support faded"],
              ["Bitcoin Unlimited", "everyone sets their own", "never took over"],
              ["Core 0.13.1, late 2016", "segregated witness", "stalled below 95%"]
            ] },
            at: "screen", g: "point",
            say: [
              "Because nobody could decide for everyone, the argument was fought the only way it could be, with competing software.",
              { s: "In August 2015, Gavin Andresen and Mike Hearn offered Bitcoin XT, which would raise the limit to eight megabytes and keep doubling it.", show: 1 },
              "It would switch on only if three quarters of new blocks signalled for it, and they never came close.",
              { s: "Bitcoin Classic followed in 2016 with a more modest two megabytes, and Bitcoin Unlimited proposed letting miners and node operators set their own limits.", show: 3 },
              "Each drew real support for a while, and none reached the level it needed.",
              { s: "Meanwhile the developers of the most widely used software, Bitcoin Core, backed a different idea, called segregated witness.", show: 4 }
            ] },
          { slide: { k: "points", title: "Segregated witness: the proposal", start: 0, points: [
              "December 2015: presented, then written as BIP 141",
              "More room in each block, with no hard fork",
              "October 2016: released in Bitcoin Core 0.13.1",
              "Needed: 95% of blocks signalling, within a year"
            ] },
            at: "right", g: "open",
            say: [
              { s: "Pieter Wuille presented it at a conference in Hong Kong in December 2015, and it was written up as BIP 141.", show: 1 },
              { s: "Its mechanics are not our subject today, so here I need only its shape: it made more room in each block, and it was built as a tightening.", show: 2 },
              "To its supporters that was elegant, because old nodes could keep following.",
              "To its critics it was a complicated detour around a simple fix, and too small an increase.",
              { s: "The code shipped in October 2016, with signalling to open that November and a deadline a year later.", show: 3 },
              { s: "It needed 95 per cent of the blocks in a two-week window, and month after month the flags stayed far short of that.", show: 4 },
              { s: "Some called that miners rightly withholding consent, and others called it a readiness signal being used as a veto.", g: "weigh" }
            ] },
          { slide: { k: "points", title: "Spring 2017: two ways out", start: 0, points: [
              "BIP 148: nodes refuse blocks without the flag",
              "From 1 August 2017, with or without the miners",
              "New York, 23 May: 58 companies sign a deal",
              "Segwit now, a 2 MB hard fork within six months"
            ] },
            at: "centre", g: "open",
            say: [
              "By early 2017 the stalemate had lasted long enough that people began looking for ways round it.",
              { s: "The first came in March from a pseudonymous developer called Shaolin Fry, as BIP 148.", show: 1 },
              { s: "Nodes running it would, from 1 August 2017, refuse any block that did not carry the segregated witness flag.", show: 2 },
              "Its supporters called it a user-activated soft fork: ordinary node operators, rather than miners, setting a date.",
              "Its critics, including some who wanted segregated witness, warned that if most miners ignored it the chain could split.",
              { s: "The second came in May, at a conference in New York, where 58 companies and mining firms signed an agreement.", show: 3 },
              { s: "Their deal was a package: activate segregated witness, then double the old one megabyte limit to two with a hard fork within six months.", show: 4 },
              "Supporters saw a sensible compromise, and opponents saw a rule change agreed behind closed doors by executives."
            ] },
          { slide: { k: "figure", title: "2017, month by month", ops: [
              { line: [6, 30, 154, 30], c: "grey" },
              { circle: [16, 30, 1.5], fill: true }, { line: [16, 25, 16, 30] },
              { text: "March", x: 16, y: 16, a: "c", size: 3.5, c: "grey" },
              { text: "BIP 148", x: 16, y: 21.5, a: "c", size: 3.8 },
              { circle: [42, 30, 1.5], fill: true }, { line: [42, 30, 42, 35] },
              { text: "23 May", x: 42, y: 39, a: "c", size: 3.5, c: "grey" },
              { text: "New York deal", x: 42, y: 44.5, a: "c", size: 3.8 },
              { circle: [68, 30, 1.5], c: "amber", fill: true, at: 1 }, { line: [68, 25, 68, 30], c: "amber", at: 1 },
              { text: "late July", x: 68, y: 16, a: "c", size: 3.5, c: "grey", at: 1 },
              { text: "miners signal", x: 68, y: 21.5, a: "c", size: 3.8, c: "amber", at: 1 },
              { circle: [94, 30, 1.5], c: "red", fill: true, at: 3 }, { line: [94, 30, 94, 35], c: "red", at: 3 },
              { text: "1 August", x: 94, y: 39, a: "c", size: 3.5, c: "grey", at: 3 },
              { text: "Bitcoin Cash", x: 94, y: 44.5, a: "c", size: 3.8, c: "red", at: 3 },
              { circle: [118, 30, 1.5], c: "green", fill: true, at: 5 }, { line: [118, 25, 118, 30], c: "green", at: 5 },
              { text: "24 August", x: 118, y: 16, a: "c", size: 3.5, c: "grey", at: 5 },
              { text: "segwit active", x: 118, y: 21.5, a: "c", size: 3.8, c: "green", at: 5 },
              { circle: [144, 30, 1.5], fill: true, at: 6 }, { line: [144, 30, 144, 35], at: 6 },
              { text: "November", x: 144, y: 39, a: "c", size: 3.5, c: "grey", at: 6 },
              { text: "2 MB fork due", x: 144, y: 44.5, a: "c", size: 3.8, at: 6 },
              { text: "block 478,558: the last block both chains share", x: 80, y: 57, a: "c", size: 4, c: "red", at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "Here is how the summer unfolded.",
              "In late July, with the August date approaching, miners began signalling for segregated witness almost unanimously.",
              "So the deadline in BIP 148 passed without a fight, and people still argue about which pressure moved the miners.",
              "On 1 August, a group that wanted bigger blocks and no segregated witness went its own way, with a hard fork to blocks of eight megabytes.",
              "Block 478,558 is the last block the two chains share, and the new chain, called Bitcoin Cash, has been a separate currency ever since.",
              "On 24 August, at block 481,824, segregated witness came into force on Bitcoin.",
              "One piece of the New York package remained, the two megabyte hard fork, due in the middle of November."
            ] },
          { slide: { k: "quote", text: "Unfortunately, it is clear that we have not built sufficient consensus for a clean blocksize upgrade at this time.", by: "Mike Belshe, SegWit2x mailing list, 8 November 2017" },
            at: "centre", g: "open",
            say: [
              "It never happened.",
              "Through the autumn, companies withdrew from the agreement, and it became clear that many node operators would simply not run the new software.",
              { s: "On 8 November, about a week before the planned date, the organisers called it off, and this is from their announcement.", g: "point" },
              "The hard fork planned for block 494,784 was suspended, and the one megabyte base limit stayed.",
              { s: "Think about who had signed that agreement: a large majority of the mining power, and many of the biggest companies in the industry.", g: "weigh" },
              "They had the machines, the customers and the money, and they chose not to go ahead once it was clear many people would not follow."
            ] }
        ] },

      { id: "taproot-who-decides", title: "Taproot, and Who Decides", topics: ["taproot activation", "speedy trial", "bip 341", "bip 343", "activation methods", "who decides", "node operators"],
        beats: [
          { slide: { k: "section", title: "Taproot, and Who Decides", sub: "2021: a calm upgrade, and the lesson of them all" },
            at: "lectern", g: "open",
            say: [
              "After 2017 nobody was in a hurry to change anything, and four years passed before the next upgrade.",
              "It was called taproot, and as a piece of history it is almost dull, which is the kindest thing I can say about it.",
              "The design, first published in 2019 and numbered BIPs 340 to 342 in January 2020, was reviewed in public for about two years and drew remarkably little opposition.",
              { s: "The argument that remained was about how to switch it on, because 2017 had left that question wide open.", g: "lean" }
            ] },
          { slide: { k: "compare", title: "How to switch it on: two camps",
              left: { head: "Wait for miners' flags", points: ["The method used since 2012", "Switches on only when safe", "Risk: miners can stall it"] },
              right: { head: "Set a deadline", points: ["Nodes enforce the flag by a date", "No one group can stall it", "Risk: a split if support is thin"] } },
            at: "left", g: "weigh",
            say: [
              "One camp wanted the familiar method: wait for the miners' flags, and switch on only when nearly all blocks carry them.",
              "The other wanted a deadline built in, after which nodes would insist on the flag, as BIP 148 had.",
              "The first camp feared a split caused by haste, and the second feared a veto caused by delay.",
              { s: "The compromise was a short trial of the first method, with the second argument postponed unless it was needed.", g: "open" }
            ] },
          { slide: { k: "number", value: "Block 709,632", label: "14 November 2021: taproot's rules come into force", note: "Locked in on 12 June 2021, once 90% of the blocks in a two-week window had signalled" },
            at: "centre", g: "open",
            say: [
              "It was nicknamed Speedy Trial, and it shipped in Bitcoin Core 0.21.1 on 1 May 2021.",
              "Miners had about three months, and the threshold was lowered from 95 to 90 per cent of the blocks in a two-week window.",
              "They reached it in six weeks, on 12 June.",
              "Then came a deliberate pause, so that everybody else had time to upgrade their nodes.",
              { s: "Taproot's rules came into force at block 709,632, on 14 November 2021.", g: "up" },
              "An alternative with a mandatory deadline, described in BIP 343, was offered at the same time, and since the trial succeeded its deadline never came into play."
            ] },
          { board: { clear: true, title: "Who decides?", ops: [
              { box: [6, 14, 42, 14], t: "developers", at: 1 },
              { text: "write code", x: 27, y: 33, a: "c", size: 4, c: "grey", at: 1 },
              { box: [59, 14, 42, 14], t: "miners", at: 2 },
              { text: "build blocks", x: 80, y: 33, a: "c", size: 4, c: "grey", at: 2 },
              { box: [112, 14, 42, 14], t: "companies", at: 3 },
              { text: "serve customers", x: 133, y: 33, a: "c", size: 4, c: "grey", at: 3 },
              { arrow: [27, 38, 60, 55], at: 4 },
              { arrow: [80, 38, 80, 54], at: 4 },
              { arrow: [133, 38, 100, 55], at: 4 },
              { box: [44, 56, 72, 16], t: "nodes that check", c: "green", at: 4 },
              { text: "anyone can propose; running it decides", x: 80, y: 82, a: "c", size: 4.5, c: "green", at: 5 }
            ] },
            say: [
              "So let me draw what these episodes add up to.",
              "Developers write the code, and in 2015 and 2016 several teams wrote rival code that the network declined to run.",
              "Miners build the blocks, and in 2017 a large majority of them signed a plan whose second half, the hard fork, never happened.",
              "Companies serve the customers, and dozens of the biggest signed that same plan.",
              "Each of those groups has real influence, but every one of them needs its blocks and payments accepted by the nodes that check the rules.",
              { s: "Anyone can propose, and the proposal becomes a rule only on the machines whose owners choose to run it.", g: "pinch" },
              "The nodes that weigh most are the ones people really use to accept payments, because a rule nobody trades under is only a private opinion."
            ] },
          { slide: { k: "points", title: "What the record shows", start: 0, points: [
              "Tightenings with wide support went through",
              "Contested loosenings: nowhere, or a new coin",
              "No signature, title or hash power forced a rule",
              "The price of all this: change is slow"
            ] },
            at: "centre", g: "count",
            say: [
              { s: "Put the cases side by side: the deliberate changes that went through were almost all tightenings, and each only once support was very broad.", show: 1 },
              { s: "The contested loosenings ended either nowhere, or in a separate chain with a separate coin.", show: 2 },
              { s: "No signature, job title or share of mining power was able to impose a rule on people who would not run it.", show: 3 },
              "This is the cost of the absent founder that I promised you at the start.",
              { s: "With no one to decide, change needs something close to everybody, and so it is slow, tiring and sometimes ugly.", show: 4, g: "weigh" },
              "Whether that is a weakness or the whole point is, I think, the most interesting question in this lecture."
            ] },
          { say: ["One last question, and it is the centre of today.", "What did the events of 2017 show about who decides Bitcoin's rules?"],
            quiz: {
              q: "What did the events of 2017 show about who decides Bitcoin's rules?",
              options: [
                "The largest companies decide, because they have the users",
                "Miners decide, because they build the blocks",
                "Developers decide, because they write the software",
                "People running nodes decide, by what they choose to run"
              ],
              answer: 3,
              right: ["That is it: a rule holds only where people choose to run and enforce it."],
              wrong: [
                ["Dozens of large companies backed a hard fork that never happened.", "It is the people running nodes who decide, by the software they choose to run."],
                ["Most miners signed the New York plan, and its hard fork was still called off.", "The rules are decided by people running nodes, through what they choose to run."],
                ["Developers wrote several rival versions, and the network declined to run them.", "The people running nodes decide, through the software they choose to run."],
                null
              ]
            } }
        ] },

      { id: "should-it-change", title: "Should It Change at All?", topics: ["ossification", "future upgrades", "open debate", "judging a proposal", "next lecture", "lightning"],
        beats: [
          { slide: { k: "section", title: "Should It Change at All?", sub: "The argument that is still going on" },
            at: "lectern", g: "open",
            say: [
              "Which brings us to the present, and to an argument that is not finished.",
              "When this lecture was written, taproot was still the most recent change to the rules that the network as a whole had adopted.",
              "Proposals have not stopped: new kinds of spending conditions, repairs to old quirks, limits on data stored in transactions, and signatures meant to resist future quantum computers.",
              { s: "But underneath each of them lies a bigger question: should the base rules of Bitcoin keep changing at all?", g: "lean" }
            ] },
          { slide: { k: "compare", title: "Leave it alone, or keep improving?",
              left: { head: "Leave the base alone", points: ["Stable rules are the product", "Every change is a new risk", "Easy to change is easy to capture", "Build new things in layers"] },
              right: { head: "Keep improving, carefully", points: ["Known flaws should be fixed", "Some threats need early work", "Layers need help from below", "Never changing is also a choice"] } },
            at: "left", g: "weigh",
            say: [
              "Here, as fairly as I can put them, are the two poles.",
              "One side says that for money, rules that do not change are the product itself, and that people can only plan around a system they know will hold still.",
              "They add that every change is a chance to introduce a bug, and that a system which is easy to change is easy for the powerful to change.",
              "The other side says that a protocol with known shortcomings should fix them while it still can, and that some threats take many years to prepare for.",
              "They add that refusing all change is also a decision with consequences, and that nobody voted for that one either.",
              { s: "Most people sit somewhere in between, and argue instead about which changes, how well tested, and switched on by what method.", g: "open" }
            ] },
          { at: "centre", g: "open",
            say: [
              "You will hear the first position called ossification, a word borrowed from bone, for a protocol that hardens as more comes to depend on it.",
              "Some people use the word as a goal, and others use it as a warning.",
              { s: "I will not tell you which camp to join, and the history we have just walked through gives ammunition to both.", g: "shrug" },
              "It shows that careful changes can be made without a centre, and it shows how much strain each one put on the system.",
              "What I can give you is a way to follow the debate for yourself."
            ] },
          { slide: { k: "points", title: "Four questions for any proposal", start: 0, points: [
              "Does it tighten the rules, or loosen them?",
              "What happens to nodes that do not upgrade?",
              "Who objects, and is the objection answered?",
              "How would it be switched on, and when?"
            ] },
            at: "right", g: "count",
            say: [
              { s: "When the next proposal comes along, and one will, you now have four questions to ask of it.", g: "open" },
              { s: "Does it tighten the rules, or loosen them?", show: 1 },
              { s: "What happens to a node that never upgrades?", show: 2 },
              { s: "Who objects, and has the objection been answered or merely outvoted?", show: 3 },
              { s: "And how would it be switched on: by whose signal, by what date, and with what happening if support falls short?", show: 4 },
              "Those four questions would have guided you through every episode in today's lecture."
            ] },
          { slide: { k: "figure", title: "Next time: scaling in layers", ops: [
              { box: [10, 40, 140, 12], t: "the chain: slow, scarce, final", c: "blue", at: 1 },
              { box: [30, 10, 100, 12], t: "a layer above: fast, small payments", c: "amber", at: 2 },
              { arrow: [50, 38, 50, 24], at: 3 },
              { text: "open", x: 40, y: 31, a: "c", size: 3.8, c: "grey", at: 3 },
              { arrow: [110, 24, 110, 38], at: 3 },
              { text: "settle", x: 122, y: 31, a: "c", size: 3.8, c: "grey", at: 3 },
              { text: "the rules below stay as they are", x: 80, y: 59, a: "c", size: 4.5, c: "green", at: 4 }
            ] },
            at: "lectern", g: "open",
            say: [
              "Let me end by connecting today to next time.",
              "The block size years left Bitcoin with a base layer that is deliberately small, slow and hard to change.",
              "One side of that argument had said: keep the base modest, and build faster payments in a layer above it.",
              "Such a layer opens with a transaction on the chain and settles with one, and in between, payments move without touching it.",
              "That is the idea behind the Lightning Network, and segregated witness was one of the changes that made it practical.",
              "Next time, in our final lecture, Scaling in Layers: Lightning, we open it up, and return at last to the small, instant payment at the market stall.",
              "Before then, read BIP 3 and the March 2013 post-mortem, which are short and will teach you more about how Bitcoin changes than any summary.",
              { s: "Thank you, and I will see you in lecture 14.", g: "up" }
            ] }
        ] }
    ]
  });
})();
