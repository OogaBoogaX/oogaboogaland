// Bitcoin from First Principles, lecture 9: a network with no centre (peers, seeds, the handshake and the address book), how a transaction spreads by gossip (announce, ask, send), each node's own mempool, how a block spreads and compact blocks (BIP 152), a new node's first sync and pruning, light clients and compact block filters (BIP 157 and 158), why a node of your own matters, and the eclipse attack.
(() => {
  "use strict";
  window.BL.lectures.add({
    id: "btc-09", course: "first-principles", n: 9, title: "The Peer-to-Peer Network",
    reading: [
      { title: "Bitcoin: A Peer-to-Peer Electronic Cash System (sections 5, 8)", by: "Satoshi Nakamoto, 2008" },
      { title: "BIP 152: Compact Block Relay", by: "Matt Corallo, 2016" },
      { title: "Eclipse Attacks on Bitcoin's Peer-to-Peer Network", by: "Heilman, Kendler, Zohar and Goldberg, 2015" }
    ],
    sources: [
      "Satoshi Nakamoto, Bitcoin: A Peer-to-Peer Electronic Cash System (2008), sections 5, 7 and 8, https://bitcoin.org/bitcoin.pdf",
      "Bitcoin developer guide, P2P Network (peer discovery, the handshake, initial block download, block and transaction broadcasting, the memory pool), https://developer.bitcoin.org/devguide/p2p_network.html",
      "Bitcoin developer reference, P2P Network (version, verack, getaddr, addr, inv, getdata, tx, headers), https://developer.bitcoin.org/reference/p2p_networking.html",
      "Matt Corallo, BIP 152: Compact Block Relay (2016), https://github.com/bitcoin/bips/blob/master/bip-0152.mediawiki",
      "Olaoluwa Osuntokun, Alex Akselrod and Jim Posen, BIP 157: Client Side Block Filtering (2017), https://github.com/bitcoin/bips/blob/master/bip-0157.mediawiki",
      "Olaoluwa Osuntokun and Alex Akselrod, BIP 158: Compact Block Filters for Light Clients (2017), https://github.com/bitcoin/bips/blob/master/bip-0158.mediawiki",
      "Bitcoin Core, doc/reduce-traffic.md (8 full-relay and 2 block-relay-only outbound connections, feelers), https://github.com/bitcoin/bitcoin/blob/master/doc/reduce-traffic.md",
      "Bitcoin Core, doc/reduce-memory.md and src/kernel/mempool_options.h (maxmempool 300 MB, mempool expiry 336 hours), https://github.com/bitcoin/bitcoin/blob/master/doc/reduce-memory.md",
      "Bitcoin Core, src/kernel/chainparams.cpp (the DNS seeds and who runs them) and src/validation.h (pruning: 550 MiB, 288 blocks kept), https://github.com/bitcoin/bitcoin/blob/master/src/kernel/chainparams.cpp",
      "Bitcoin Core release notes: 0.13.0 (compact blocks), 0.14.0 (assumed-valid blocks), 0.19.0.1 (two block-relay-only connections), 0.21.0 (anchors, serving BIP 157 filters), https://github.com/bitcoin/bitcoin/tree/master/doc/release-notes",
      "Bitcoin.org, Running a Full Node (requirements, chain size, pruning), https://bitcoin.org/en/full-node",
      "Ethan Heilman, Alison Kendler, Aviv Zohar and Sharon Goldberg, Eclipse Attacks on Bitcoin's Peer-to-Peer Network, 24th USENIX Security Symposium (2015), https://www.usenix.org/conference/usenixsecurity15/technical-sessions/presentation/heilman",
      "Bitnodes, snapshots of reachable nodes (2026), https://bitnodes.io/"
    ],
    sections: [
      { id: "no-centre", title: "A Network With No Centre", topics: ["peer-to-peer", "nodes", "peers", "connections", "how many nodes", "broadcast"],
        beats: [
          { slide: { k: "title", kicker: "Lecture 9", title: "The Peer-to-Peer Network", sub: "Peers, relay, the mempool and a node of your own" },
            at: "lectern", g: "open",
            say: [
              "Welcome back, and welcome to the third part of this course.",
              "Last time we finished the ledger's story: coins, locks, blocks, mining, and how strangers agree on one history.",
              "All through those lectures I kept saying that a payment is broadcast, or that the network hears of a block.",
              { s: "Today I pay that debt, because the network is not a figure of speech.", g: "lean" },
              "It is real machines, in homes and offices and data centres, talking to each other over the ordinary internet.",
              "And it has no head office, no main server and no list of members.",
              { s: "So here is today's puzzle: how does a payment reach the whole world when there is nobody in particular to send it to?", g: "wide" }
            ] },
          { slide: { k: "points", title: "The whitepaper's network, in six steps", start: 0, points: [
              "1  New transactions are broadcast to all nodes",
              "2  Each node collects them into a block",
              "3  Each node works on a proof of work for its block",
              "4  The finder broadcasts its block to all nodes",
              "5  Nodes accept it only if every transaction is valid",
              "6  Nodes show acceptance by building on top of it"
            ], note: "Paraphrased from section 5 of the Bitcoin paper" },
            at: "centre", g: "count",
            say: [
              "Section 5 of the Bitcoin paper describes the whole network in six short steps, and here they are in my words.",
              { s: "New transactions are broadcast to all nodes, and each node collects them into a block.", show: 2 },
              { s: "Each node works on a proof of work, and whoever finds one broadcasts the block to everyone.", show: 4 },
              { s: "The others accept it only if everything in it is valid, and show that by building on top of it.", show: 6 },
              "Steps two, three, five and six were lectures 6, 7 and 8.",
              { s: "That leaves one small word, used twice and carrying an enormous load: broadcast.", g: "pinch" },
              "There is no broadcast button on the internet, so somebody has to build one out of ordinary connections."
            ] },
          { slide: { k: "figure", title: "Two shapes of network", ops: [
              { text: "A star", x: 40, y: 5, a: "c", size: 4, c: "grey" },
              { line: [80, 2, 80, 60], c: "grey", dash: true },
              { line: [14, 18, 33.8, 28.7], c: "grey" }, { line: [66, 18, 46.2, 28.7], c: "grey" },
              { line: [14, 46, 33.8, 35.3], c: "grey" }, { line: [66, 46, 46.2, 35.3], c: "grey" },
              { circle: [14, 18, 3], fill: true }, { circle: [66, 18, 3], fill: true },
              { circle: [14, 46, 3], fill: true }, { circle: [66, 46, 3], fill: true },
              { circle: [40, 32, 7], t: "server", size: 4, c: "blue" },
              { text: "one centre to switch off", x: 40, y: 58, a: "c", size: 4, c: "red", at: 2 },
              { text: "A mesh", x: 120, y: 5, a: "c", size: 4, c: "grey", at: 3 },
              { line: [98, 16, 122, 12], c: "grey", at: 3 }, { line: [122, 12, 146, 20], c: "grey", at: 3 },
              { line: [98, 16, 104, 36], c: "grey", at: 3 }, { line: [122, 12, 128, 32], c: "grey", at: 3 },
              { line: [104, 36, 128, 32], c: "grey", at: 3 }, { line: [146, 20, 128, 32], c: "grey", at: 3 },
              { line: [128, 32, 150, 42], c: "grey", at: 3 }, { line: [104, 36, 116, 48], c: "grey", at: 3 },
              { line: [128, 32, 116, 48], c: "grey", at: 3 }, { line: [146, 20, 150, 42], c: "grey", at: 3 },
              { circle: [98, 16, 3], c: "green", fill: true, at: 3 }, { circle: [122, 12, 3], c: "green", fill: true, at: 3 },
              { circle: [146, 20, 3], c: "green", fill: true, at: 3 }, { circle: [104, 36, 3], c: "green", fill: true, at: 3 },
              { circle: [128, 32, 3], c: "green", fill: true, at: 3 }, { circle: [150, 42, 3], c: "green", fill: true, at: 3 },
              { circle: [116, 48, 3], c: "green", fill: true, at: 3 },
              { text: "no centre at all", x: 120, y: 58, a: "c", size: 4, c: "green", at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "Most of the internet you use every day has the shape on the left, a star.",
              "Your phone talks to a company's server, and so does everybody else's.",
              { s: "It is efficient, and it has one place where it can be switched off, leaned on or bought.", g: "chop" },
              "Bitcoin's network has the shape on the right, a mesh.",
              "Every node runs the same kind of software, follows the same rules and keeps its own copy of the ledger.",
              { s: "That is what peer means: an equal, with no rank above it and none below.", g: "pinch" },
              "Each node is connected to just a handful of others, and nobody at all is connected to everyone."
            ] },
          { board: { clear: true, title: "A handful of neighbours", ops: [
              { circle: [80, 52, 8], t: "you", at: 0 },
              { circle: [64.3, 23.8, 4], c: "blue", at: 2 }, { arrow: [75.4, 43.7, 66.7, 28.2], c: "blue", at: 2 },
              { circle: [50.4, 29, 4], c: "blue", at: 2 }, { arrow: [72.5, 46.2, 54.3, 32.1], c: "blue", at: 2 },
              { circle: [40.2, 37, 4], c: "blue", at: 2 }, { arrow: [71.1, 48.6, 44.9, 38.8], c: "blue", at: 2 },
              { circle: [34.7, 46.8, 4], c: "blue", at: 2 }, { arrow: [70.6, 50.9, 39.7, 47.4], c: "blue", at: 2 },
              { circle: [34.7, 57.2, 4], c: "blue", at: 2 }, { arrow: [70.6, 53.1, 39.7, 56.6], c: "blue", at: 2 },
              { circle: [40.2, 67, 4], c: "blue", at: 2 }, { arrow: [71.1, 55.4, 44.9, 65.2], c: "blue", at: 2 },
              { circle: [50.4, 75, 4], c: "blue", at: 2 }, { arrow: [72.5, 57.8, 54.3, 71.9], c: "blue", at: 2 },
              { circle: [64.3, 80.2, 4], c: "blue", at: 2 }, { arrow: [75.4, 60.3, 66.7, 75.8], c: "blue", at: 2 },
              { text: "8 carry everything", x: 3, y: 21, size: 4.5, c: "blue", at: 2 },
              { circle: [103, 26, 4], c: "amber", at: 3 }, { arrow: [86.3, 44.9, 99.7, 29.7], c: "amber", dash: true, at: 3 },
              { circle: [121.7, 39.3, 4], c: "amber", at: 3 }, { arrow: [89.1, 49.2, 116.9, 40.8], c: "amber", dash: true, at: 3 },
              { text: "2 carry blocks only", x: 158, y: 21, a: "r", size: 4.5, c: "amber", at: 3 },
              { circle: [124.4, 59.8, 4], c: "grey", at: 4 }, { arrow: [119.5, 58.9, 89.4, 53.6], c: "grey", at: 4 },
              { circle: [109.6, 75, 4], c: "grey", at: 4 }, { arrow: [105.7, 71.9, 87.5, 57.8], c: "grey", at: 4 },
              { text: "incoming: many more", x: 158, y: 86, a: "r", size: 4.5, c: "grey", at: 4 }
            ] },
            say: [
              "Let me draw one node's view of the world, and let us say it is yours.",
              "The most widely used software, Bitcoin Core, reaches out and opens ten connections to other nodes.",
              "Eight of them carry everything: transactions, blocks and the addresses of other nodes.",
              "Two more carry blocks only, a quiet back-up line whose purpose we will meet near the end.",
              "If your router allows it, strangers may also connect in to you, and a node will accept many more of those.",
              { s: "That is your whole view: about ten neighbours you chose, and some who chose you.", g: "open" },
              "Nobody holds a map of the whole web, and nobody needs one."
            ] },
          { slide: { k: "number", value: "20,000+", label: "nodes you can connect to, by one public survey", note: "Bitnodes snapshots in 2026: about 23,000 to 25,000, and many more accept no incoming calls" },
            at: "right", g: "open",
            say: [
              "How big is this web?",
              { s: "The honest answer is that nobody knows, because there is no register to count.", g: "shrug" },
              "One public survey, which crawls the network by asking each node for the addresses it knows, finds a little over 20,000 that accept connections.",
              "Many more sit behind home routers and only connect outward, so no crawler can see them."
            ] }
        ] },

      { id: "first-peers", title: "Finding Your First Peers", topics: ["dns seeds", "bootstrapping", "handshake", "version message", "address book", "joining the network"],
        beats: [
          { slide: { k: "section", title: "Finding Your First Peers", sub: "Seeds, a handshake and an address book" },
            at: "lectern", g: "open",
            say: [
              "Now put yourself in the place of a brand new node.",
              "You have just been installed, so you know every rule of the system by heart.",
              { s: "And you do not know a single other node.", g: "shrug" },
              "You are a traveller stepping off a train in a strange city, with no phone book and no friends.",
              "With no head office to ring, whom do you ask?"
            ] },
          { slide: { k: "figure", title: "Day one: who do I talk to?", ops: [
              { box: [62, 26, 34, 12], t: "new node" },
              { box: [4, 6, 34, 12], t: "DNS seeds", c: "amber", at: 1 },
              { arrow: [62, 28, 40, 16], at: 2 },
              { text: "who is out there?", x: 42, y: 8, size: 3.5, at: 2 },
              { arrow: [30, 19, 61, 35], c: "green", dash: true, at: 2 },
              { text: "addresses", x: 20, y: 34, size: 3.5, c: "green", at: 2 },
              { text: "no answer? a list built into the software", x: 4, y: 46, size: 3.5, c: "grey", at: 3 },
              { text: "or name a node you already trust", x: 4, y: 53, size: 3.5, c: "grey", at: 4 },
              { arrow: [97, 30, 125, 14], c: "blue", at: 5 }, { arrow: [97, 32, 141, 32], c: "blue", at: 5 }, { arrow: [97, 34, 125, 50], c: "blue", at: 5 },
              { circle: [130, 12, 4], c: "blue", fill: true, at: 5 }, { circle: [146, 32, 4], c: "blue", fill: true, at: 5 }, { circle: [130, 52, 4], c: "blue", fill: true, at: 5 },
              { line: [133, 15, 143, 29], c: "grey", at: 6 }, { line: [143, 35, 133, 49], c: "grey", at: 6 },
              { text: "then peers pass on more addresses", x: 158, y: 62, a: "r", size: 3.5, c: "blue", at: 6 }
            ] },
            at: "screen", g: "point",
            say: [
              "Here you are on day one, knowing the rules and nobody else.",
              "Built into the software is a short list of internet names called DNS seeds, each run by a volunteer known to the developers.",
              "Your node asks a seed who is out there, and gets back a list of addresses of nodes that were recently reachable.",
              "If no seed answers, the software falls back on a list of node addresses that shipped inside it.",
              "Or you can skip all that and type in the address of a node you already trust, such as a friend's.",
              "Then your node simply dials some of those addresses and connects.",
              "And once it is connected, the peers themselves pass on more addresses, so the seeds are hardly needed again.",
              { s: "Notice that a seed is trusted only to make introductions, never to tell you what is true.", g: "pinch" }
            ] },
          { slide: { k: "code", title: "The handshake", start: 0, lines: [
              "you  -> peer :  version   (software, time, block height)",
              "peer -> you  :  version",
              "peer -> you  :  verack    (heard you)",
              "you  -> peer :  verack",
              "# connected",
              "you  -> peer :  getaddr   (whom else do you know?)",
              "peer -> you  :  addr      (a list of node addresses)",
              "# written into your own address book, kept on disk"
            ] },
            at: "left", g: "open",
            say: [
              { s: "When two nodes connect, the first thing yours sends is a message called version.", show: 1 },
              "It states which software it runs, what time it thinks it is, and how many blocks it holds.",
              { s: "The peer answers with a version of its own, and each side replies verack, short for version acknowledgement.", show: 4 },
              { s: "That is the whole ceremony: no account, no password, and no name beyond an internet address.", show: 5, g: "chop" },
              { s: "Next your node sends getaddr, meaning whom else do you know, and the peer answers with a list.", show: 7 },
              { s: "Your node writes those into an address book on its own disk, and tries them out over time.", show: 8 },
              "Remember that address book, because later today somebody is going to scribble in it."
            ] },
          { at: "centre", g: "open",
            say: [
              "Look at what did not happen in that story.",
              { s: "Nobody approved your node, nobody issued it a licence, and nobody can strike it off.", g: "count" },
              "A node may leave tonight and come back next month, and simply catch up on what it missed.",
              "Lecture 1 listed permission as the first cost of a keeper, and here is a network with no door to knock on."
            ] }
        ] },

      { id: "gossip", title: "Gossip: How a Payment Spreads", topics: ["transaction relay", "inv", "getdata", "gossip", "propagation", "how fast"],
        beats: [
          { slide: { k: "section", title: "Gossip: How a Payment Spreads", sub: "Announce, ask, send" },
            at: "lectern", g: "open",
            say: [
              "You are connected, so let us send some money.",
              "Your wallet builds a transaction and signs it, exactly as in lectures 3 and 4.",
              "It hands that transaction to one node, perhaps your own.",
              { s: "Now it has to reach every other node on the planet, and above all the miners.", g: "wide" },
              "The method is as old as village life: you tell your neighbours, and they tell theirs.",
              "Engineers call it gossip, and they mean it as a compliment."
            ] },
          { board: { clear: true, title: "Announce, ask, send", ops: [
              { box: [10, 20, 30, 14], t: "node A", at: 0 },
              { box: [120, 20, 30, 14], t: "node B", at: 0 },
              { line: [25, 34, 25, 76], c: "grey", dash: true, at: 0 },
              { line: [135, 34, 135, 76], c: "grey", dash: true, at: 0 },
              { arrow: [27, 46, 133, 46], c: "blue", at: 2 },
              { text: "1  inv: I have 7f3a...", x: 80, y: 42, a: "c", size: 4.5, c: "blue", at: 2 },
              { arrow: [133, 58, 27, 58], c: "amber", at: 4 },
              { text: "2  getdata: send it", x: 80, y: 54, a: "c", size: 4.5, c: "amber", at: 4 },
              { arrow: [27, 70, 133, 70], c: "green", at: 5 },
              { text: "3  tx: here it is", x: 80, y: 66, a: "c", size: 4.5, c: "green", at: 5 }
            ] },
            say: [
              "Here are two neighbours, A and B, and A has just heard of a new transaction.",
              "A does not push the whole thing at B, because B may well have it already from somebody else.",
              "Instead A sends a tiny announcement called inv, short for inventory, which carries only the transaction's fingerprint.",
              "The fingerprint is the hash from lecture 2, so those few bytes name the transaction exactly.",
              "If B has never seen that fingerprint, it replies with getdata, which means send it to me.",
              "Only then does A send the transaction itself, in a message called tx.",
              "So the full data crosses each connection once at most, and only when it is wanted."
            ] },
          { board: { ops: [
              { text: "B checks every rule...", x: 80, y: 82, a: "c", size: 4.5, c: "red", at: 1 },
              { text: "...then announces to its own peers", x: 80, y: 89, a: "c", size: 4.5, at: 4 }
            ] },
            say: [
              "Now comes the step that makes this more than a rumour mill.",
              "Before B breathes a word to anyone, it checks the transaction against every rule.",
              "Are the signatures good, do the coins being spent exist, and are they still unspent?",
              "If anything fails, B drops it on the spot, and the bad transaction travels no further.",
              "If everything passes, B announces it to its own peers, with an inv of its own.",
              { s: "So every node is a filter as well as a messenger, and rubbish dies at the first honest node it meets.", g: "chop" }
            ] },
          { board: { clear: true, title: "How far in five hops?", ops: [
              { text: "hop 1", x: 14, y: 26, size: 5, c: "grey", at: 1 }, { text: "8", x: 88, y: 26, a: "r", size: 6, at: 1 },
              { box: [100, 21, 2, 6], c: "amber", fill: true, at: 1 },
              { text: "hop 2", x: 14, y: 38, size: 5, c: "grey", at: 2 }, { text: "64", x: 88, y: 38, a: "r", size: 6, at: 2 },
              { box: [100, 33, 4, 6], c: "amber", fill: true, at: 2 },
              { text: "hop 3", x: 14, y: 50, size: 5, c: "grey", at: 2 }, { text: "512", x: 88, y: 50, a: "r", size: 6, at: 2 },
              { box: [100, 45, 9, 6], c: "amber", fill: true, at: 2 },
              { text: "hop 4", x: 14, y: 62, size: 5, c: "grey", at: 3 }, { text: "4,096", x: 88, y: 62, a: "r", size: 6, at: 3 },
              { box: [100, 57, 22, 6], c: "amber", fill: true, at: 3 },
              { text: "hop 5", x: 14, y: 74, size: 5, c: "grey", at: 3 }, { text: "32,768", x: 88, y: 74, a: "r", size: 6, c: "green", at: 3 },
              { box: [100, 69, 56, 6], c: "green", fill: true, at: 3 },
              { text: "x 8 at every hop", x: 14, y: 86, size: 4.5, c: "amber", at: 4 }
            ] },
            say: [
              "How long can that take, to cross the whole world?",
              "Suppose every node passes the news to eight neighbours who have not heard it yet, so after one hop eight nodes know.",
              "After two hops it is 64, and after three it is 512.",
              "After four hops it is 4,096, and after five it is 32,768.",
              "That is already more than the 20,000 or so nodes in our survey.",
              "Real life is untidier, because many of those neighbours have heard already, so allow a few hops more.",
              "Each hop takes moments, which is why a payment made anywhere is known almost everywhere within seconds."
            ] },
          { slide: { k: "quote", text: "New transaction broadcasts do not necessarily need to reach all nodes. As long as they reach many nodes, they will get into a block before long.", by: "Satoshi Nakamoto, Bitcoin whitepaper, section 5, 2008" },
            at: "centre", g: "open",
            say: [
              "Nodes even add a short random pause before each announcement, for a privacy reason that belongs to lecture 12.",
              { s: "And notice how relaxed the paper itself is about all this.", g: "point" },
              "Gossip makes no promise that any one message arrives, and it does not need to.",
              "If one neighbour is asleep, the news comes round by another road.",
              { s: "There is no single wire that you could cut to stop a payment spreading.", g: "chop" },
              "That is what all those spare connections buy: not speed so much as stubbornness."
            ] },
          { say: ["Let me check that the three-step dance made sense.", "Why does a node announce a transaction before sending it?"],
            quiz: {
              q: "Why does a node announce a transaction before sending it?",
              options: [
                "To ask the peer's permission to join the network",
                "So a peer fetches only what it does not already have",
                "So that miners can vote on it first",
                "To keep the transaction secret from other nodes"
              ],
              answer: 1,
              right: ["Yes: a few bytes of announcement save sending the same data again and again."],
              wrong: [
                ["Joining needs no permission, and the handshake settled that already.", "The announcement lets a peer fetch only the transactions it does not already have."],
                null,
                ["Nobody votes on a transaction, since each node simply checks it against the rules.", "A node announces first so that a peer fetches only what it lacks."],
                ["Nothing here is secret, because every transaction is meant to reach every node.", "The announcement is there so that a peer asks only for what it has not seen."]
              ]
            } }
        ] },

      { id: "mempool", title: "The Mempool: A Waiting Room", topics: ["mempool", "unconfirmed transactions", "relay policy", "eviction", "no global mempool"],
        beats: [
          { slide: { k: "section", title: "The Mempool: A Waiting Room", sub: "Each node's own, and no two quite alike" },
            at: "lectern", g: "open",
            say: [
              "So your transaction has reached thousands of nodes, and it is valid, but it is not yet in a block.",
              "Where does it live in the meantime?",
              "Each node keeps the valid, unconfirmed transactions it has heard of in its own memory.",
              "That store is called the memory pool, or mempool for short.",
              { s: "Think of it as a waiting room: everyone in it has shown a valid ticket, and nobody in it has boarded yet.", g: "open" }
            ] },
          { slide: { k: "figure", title: "There is no such thing as the mempool", ops: [
              { box: [6, 6, 44, 36], c: "blue" }, { text: "node 1's mempool", x: 28, y: 12, a: "c", size: 3.5, c: "blue" },
              { box: [58, 6, 44, 36], c: "blue" }, { text: "node 2's mempool", x: 80, y: 12, a: "c", size: 3.5, c: "blue" },
              { box: [110, 6, 44, 36], c: "blue" }, { text: "node 3's mempool", x: 132, y: 12, a: "c", size: 3.5, c: "blue" },
              { text: "tx a", x: 28, y: 21, a: "c", size: 4, mono: true, at: 2 }, { text: "tx b", x: 28, y: 28, a: "c", size: 4, mono: true, at: 2 }, { text: "tx c", x: 28, y: 35, a: "c", size: 4, mono: true, at: 2 },
              { text: "tx a", x: 80, y: 21, a: "c", size: 4, mono: true, at: 2 }, { text: "tx b", x: 80, y: 28, a: "c", size: 4, mono: true, at: 2 },
              { text: "tx d", x: 80, y: 35, a: "c", size: 4, mono: true, c: "amber", at: 3 },
              { text: "tx b", x: 132, y: 21, a: "c", size: 4, mono: true, at: 2 }, { text: "tx c", x: 132, y: 28, a: "c", size: 4, mono: true, at: 2 },
              { text: "missed a", x: 132, y: 35, a: "c", size: 3.5, c: "grey", at: 3 },
              { text: "mostly the same, never guaranteed identical", x: 80, y: 54, a: "c", size: 4.5, at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "People say the mempool, as if there were one list kept somewhere on a server.",
              { s: "There is not.", g: "chop" },
              "Each node has its own, built from whatever gossip happened to reach it.",
              "One node heard of a payment a second sooner, and another was switched off overnight and missed a few.",
              "At any moment they hold mostly the same things, and nothing in the system needs them to match.",
              "So when a website shows you the mempool, it is showing you one node's waiting room, and its own view."
            ] },
          { slide: { k: "points", title: "House rules of one waiting room", start: 0, points: [
              "Only transactions that pass every check get in",
              "A size limit: 300 megabytes by default",
              "When it is full, the lowest bidders leave first",
              "Unconfirmed after two weeks: dropped",
              "All of it is local policy, not a rule of the chain"
            ], note: "Bitcoin Core defaults: maxmempool 300 MB, mempoolexpiry 336 hours" },
            at: "left", g: "count",
            say: [
              { s: "A waiting room has house rules, and each node sets its own.", g: "open" },
              { s: "Only transactions that pass every check are let in at all.", show: 1 },
              { s: "The room has a size, which in Bitcoin Core is 300 megabytes unless you change it.", show: 2 },
              { s: "When it fills up, the transactions paying least for the room they take are shown the door first, and why is next lecture's subject.", show: 3 },
              { s: "And a transaction that has waited two weeks without being confirmed is quietly dropped.", show: 4 },
              { s: "Here is the point to hold on to: all of this is one node's housekeeping, not a rule of the chain.", show: 5, g: "pinch" }
            ] },
          { at: "right", g: "weigh",
            say: [
              "Lecture 8 was about rules that every node enforces on every block, and those cannot differ.",
              "Mempool rules are a different thing, a matter of what my node bothers to remember and pass on.",
              "A block may contain a transaction my node never heard of, and it is perfectly valid all the same.",
              "And being dropped from a mempool cancels nothing, because the wallet can simply announce the transaction again.",
              { s: "Nothing in a waiting room is final; only a block, buried under work, is that.", g: "chop" }
            ] },
          { slide: { k: "live", title: "One node's waiting room, right now", panel: "mempool", note: "Live from one node's view of the network while the hall is open" },
            at: "screen", g: "point",
            say: [
              "Here is a real one, as it stands this minute.",
              "These are transactions waiting for a block, as seen from one node on the network.",
              "Ask a different node and the picture would differ a little at the edges.",
              "When the next block is found, the transactions in it leave every waiting room at once.",
              "How miners choose who boards, and what it costs, I am saving for lecture 10."
            ] },
          { say: ["A quick check on the waiting room.", "What is the mempool?"],
            quiz: {
              q: "What is the mempool?",
              options: [
                "Each node's own store of valid, unconfirmed transactions",
                "The part of the chain that holds the newest blocks",
                "A miner's private record of the fees it has earned",
                "One shared list kept on a central server"
              ],
              answer: 0,
              right: ["Right: one waiting room per node, and no two quite alike."],
              wrong: [
                null,
                ["Anything in a block is confirmed, and has left the mempool.", "The mempool is each node's own store of transactions still waiting to be confirmed."],
                ["Every node keeps a mempool, whether or not it mines.", "It is each node's own store of valid transactions that are not yet in a block."],
                ["There is no central server, and no single list.", "The mempool is each node's own store of valid transactions still waiting for a block."]
              ]
            } }
        ] },

      { id: "block-relay", title: "Blocks at Speed", topics: ["block propagation", "compact blocks", "bip 152", "short ids", "stale blocks", "relay speed"],
        beats: [
          { slide: { k: "section", title: "Blocks at Speed", sub: "Why a block must travel fast, and the trick that lets it" },
            at: "lectern", g: "open",
            say: [
              "Now for the other half of that word broadcast.",
              "A miner finds a block, and step four of the paper says it is sent to all nodes.",
              "The road is the same gossip: announce, ask, send, and check before passing it on.",
              { s: "But for a block, speed matters far more than it does for a payment.", g: "lean" }
            ] },
          { slide: { k: "figure", title: "Why a slow block is an unfair block", ops: [
              { box: [4, 10, 30, 12], t: "miner X" },
              { box: [126, 10, 30, 12], t: "miner Y" },
              { arrow: [35, 16, 125, 16], c: "amber" },
              { text: "new block, still travelling", x: 80, y: 11, a: "c", size: 3.5, c: "amber" },
              { text: "still mining on the old block", x: 158, y: 29, a: "r", size: 3.5, c: "red", at: 1 },
              { box: [126, 33, 30, 10], t: "rival?", c: "red", dash: true, at: 2 },
              { text: "two blocks, one place: one will go stale", x: 80, y: 51, a: "c", size: 4, c: "red", at: 3 },
              { text: "slow relay favours the biggest miner", x: 80, y: 59, a: "c", size: 4.5, at: 5 }
            ] },
            at: "screen", g: "point",
            say: [
              "Suppose miner X finds a block, and it takes ten seconds to reach miner Y on the far side of the world.",
              "For those ten seconds, Y is still labouring on top of the old block, and that work is wasted.",
              "Worse, Y might find a rival block in that window, and then we have the fork from lecture 8.",
              "One of those two blocks will go stale, along with the energy spent on it.",
              "A very large miner suffers least, because it hears of its own blocks instantly.",
              { s: "So slow relay quietly favours the big over the small, and fast relay keeps the contest fair.", g: "weigh" }
            ] },
          { slide: { k: "figure", title: "The same data, sent twice", ops: [
              { text: "over the last ten minutes", x: 40, y: 5, a: "c", size: 3.5, c: "grey" },
              { box: [4, 10, 12, 8], t: "tx" }, { box: [4, 22, 12, 8], t: "tx" }, { box: [4, 34, 12, 8], t: "tx" },
              { arrow: [17, 14, 37, 22] }, { arrow: [17, 26, 37, 26] }, { arrow: [17, 38, 37, 30] },
              { box: [38, 14, 40, 24], c: "blue" }, { text: "my mempool", x: 58, y: 27, a: "c", size: 4, c: "blue" },
              { text: "then, all at once", x: 128, y: 5, a: "c", size: 3.5, c: "grey", at: 2 },
              { box: [104, 10, 48, 32], c: "amber", at: 2 }, { text: "full block", x: 128, y: 17, a: "c", size: 4, c: "amber", at: 2 },
              { box: [108, 24, 12, 8], t: "tx", at: 2 }, { box: [122, 24, 12, 8], t: "tx", at: 2 }, { box: [136, 24, 12, 8], t: "tx", at: 2 },
              { arrow: [103, 26, 79, 26], c: "amber", at: 2 },
              { text: "the same transactions, a second time", x: 80, y: 51, a: "c", size: 4.5, c: "red", at: 3 },
              { text: "a megabyte or more, mostly repeats", x: 80, y: 59, a: "c", size: 4, c: "grey", at: 4 }
            ] },
            at: "left", g: "open",
            say: [
              "Now look at what a block is actually made of.",
              "Nearly every transaction in it has been gossiped round the network during the minutes before.",
              "So when the block arrives, my node already holds almost all of its contents in its mempool.",
              { s: "Sending the whole block means sending me the same transactions a second time.", g: "shrug" },
              "A full block runs to a megabyte or more, and that is a heavy parcel to push across the world in a hurry.",
              "In 2016 a developer named Matt Corallo wrote up a better way, as Bitcoin Improvement Proposal 152.",
              "Those proposals are public, numbered design documents, which we meet properly in lecture 13, and this one is called compact block relay."
            ] },
          { board: { clear: true, title: "A block as a packing list", ops: [
              { text: "compact block", x: 34, y: 17, a: "c", size: 4.5, c: "amber", at: 0 },
              { box: [6, 20, 56, 10], t: "header: 80 bytes", c: "amber", at: 1 },
              { box: [6, 32, 56, 7], t: "3f9a02c771d0", at: 2 },
              { box: [6, 41, 56, 7], t: "b81e5506a2c4", at: 2 },
              { box: [6, 50, 56, 7], t: "0d47f93be816", at: 2 },
              { box: [6, 59, 56, 7], t: "9c2a6d10f7e5", at: 2 },
              { text: "6 bytes each", x: 34, y: 72, a: "c", size: 4, c: "grey", at: 2 },
              { text: "my mempool", x: 122, y: 17, a: "c", size: 4.5, c: "blue", at: 3 },
              { arrow: [64, 35.5, 98, 35.5], c: "grey", at: 3 }, { text: "have it", x: 102, y: 37, size: 4.5, c: "green", at: 3 },
              { arrow: [64, 44.5, 98, 44.5], c: "grey", at: 3 }, { text: "have it", x: 102, y: 46, size: 4.5, c: "green", at: 3 },
              { arrow: [64, 53.5, 98, 53.5], c: "grey", at: 3 }, { text: "missing", x: 102, y: 55, size: 4.5, c: "red", at: 4 },
              { arrow: [64, 62.5, 98, 62.5], c: "grey", at: 3 }, { text: "have it", x: 102, y: 64, size: 4.5, c: "green", at: 3 },
              { text: "ask for the third one only", x: 158, y: 74, a: "r", size: 4.5, c: "red", at: 4 },
              { text: "rebuilt block must match the Merkle root", x: 80, y: 86, a: "c", size: 4.5, c: "green", at: 6 }
            ] },
            say: [
              "Instead of the block, the sender ships something more like a packing list.",
              "First comes the block's header, the same 80 bytes we took apart in lecture 6.",
              "Then, for each transaction, a short identifier only 6 bytes long, made from that transaction's fingerprint.",
              "My node walks down the list, finds each of those transactions in its own mempool, and rebuilds the block itself.",
              "If one or two are missing, it asks for exactly those, and the sender supplies exactly those.",
              "Then the rebuilt block is checked as strictly as any other.",
              "Its transactions must hash up to the Merkle root in the header, so a wrong match on a short identifier cannot slip through."
            ] },
          { slide: { k: "number", value: "6 bytes", label: "for each transaction in a compact block, instead of hundreds", note: "BIP 152: a block of 3,000 transactions becomes an 18 kilobyte list, plus its header" },
            at: "centre", g: "open",
            say: [
              "Do the arithmetic with me.",
              "A block of 3,000 transactions, sent this way, needs 3,000 identifiers of 6 bytes each.",
              { s: "That is 18,000 bytes, about 18 kilobytes, standing in for a megabyte or more.", g: "pinch" },
              "A node may also pick up to three peers and tell them not to bother announcing: just send the compact block the moment you have it.",
              "Notice the pleasing loop: gossiping payments ahead of time is exactly what makes blocks quick to deliver."
            ] },
          { say: ["Before we leave blocks, one question about that packing list.", "Why can a compact block be so much smaller than the block it stands for?"],
            quiz: {
              q: "Why can a compact block be so much smaller than the block it stands for?",
              options: [
                "It carries only the highest-paying transactions",
                "It leaves out the proof of work",
                "The receiver already holds most of the transactions",
                "It squeezes each transaction with file compression"
              ],
              answer: 2,
              right: ["Exactly: the mempool has the contents already, so only a short list need travel."],
              wrong: [
                ["A compact block stands for every transaction in the block, not a selection.", "It is small because the receiver already holds most of those transactions in its mempool."],
                ["The header, with its proof of work, is sent in full.", "The saving comes from the receiver already holding most of the transactions in its mempool."],
                null,
                ["Nothing is compressed in that sense, and signatures hardly compress at all.", "A compact block is small because the receiver already has most of the transactions."]
              ]
            } }
        ] },

      { id: "first-sync", title: "Starting From Nothing", topics: ["initial block download", "full node", "headers first", "verification", "assumevalid", "pruning", "chain size"],
        beats: [
          { slide: { k: "section", title: "Starting From Nothing", sub: "Every block since 2009, checked on your own machine" },
            at: "lectern", g: "open",
            say: [
              "Let us go back to our brand new node, which we left shaking hands with its first peers.",
              "It knows the rules, and it holds exactly one block: the genesis block, which is written into the software.",
              "Everything since 3 January 2009 it has to fetch.",
              { s: "And here is the part that matters: it is going to believe none of it until it has checked it.", g: "lean" },
              "This first catching-up has a plain name, the initial block download."
            ] },
          { board: { clear: true, title: "Headers first, then blocks", ops: [
              { text: "headers: 80 bytes each", x: 8, y: 19, size: 4.5, c: "amber", at: 1 },
              { box: [8, 22, 12, 8], t: "0", c: "amber", at: 1 }, { line: [20, 26, 28, 26], at: 1 },
              { box: [28, 22, 12, 8], t: "1", c: "amber", at: 1 }, { line: [40, 26, 48, 26], at: 1 },
              { box: [48, 22, 12, 8], t: "2", c: "amber", at: 1 }, { line: [60, 26, 68, 26], at: 1 },
              { box: [68, 22, 12, 8], t: "3", c: "amber", at: 1 },
              { text: "...", x: 90, y: 27, a: "c", size: 6, at: 1 },
              { box: [102, 22, 22, 8], t: "today", c: "amber", at: 3 },
              { text: "work checked, links checked", x: 8, y: 38, size: 4.5, c: "green", at: 2 },
              { box: [8, 46, 24, 14], t: "block 1", at: 4 }, { box: [36, 46, 24, 14], t: "block 2", at: 4 }, { box: [64, 46, 24, 14], t: "block 3", at: 4 },
              { circle: [124, 44, 4], c: "blue", at: 4 }, { circle: [140, 54, 4], c: "blue", at: 4 }, { circle: [124, 64, 4], c: "blue", at: 4 },
              { arrow: [119, 46, 90, 51], c: "blue", at: 4 }, { arrow: [135, 54, 90, 54], c: "blue", at: 4 }, { arrow: [119, 62, 90, 57], c: "blue", at: 4 },
              { text: "from several peers at once", x: 158, y: 74, a: "r", size: 4, c: "blue", at: 4 },
              { text: "replay every payment since 2009", x: 8, y: 72, size: 4.5, at: 5 },
              { text: "every signature, every coin", x: 8, y: 82, size: 4.5, c: "green", at: 5 }
            ] },
            say: [
              "The node does this in two passes.",
              "First it asks its peers for headers only, those 80-byte summaries, 2,000 to a message.",
              "It checks the proof of work on every one, and that each header points back to the one before.",
              "Within minutes it holds the skeleton of the whole chain, and knows which chain carries the most work.",
              "Then it fetches the full blocks, from several peers at once, in whatever order they arrive.",
              "And it replays the entire history, block by block: every payment, every signature, every coin created and spent.",
              { s: "It is like an auditor who will not sign the accounts without adding up every receipt since the business opened.", g: "glasses" }
            ] },
          { slide: { k: "number", value: "700 GB+", label: "of blocks to download and check, and growing every ten minutes", note: "Bitcoin Core and bitcoin.org figures, 2026; the first sync takes hours to days" },
            at: "right", g: "open",
            say: [
              "How much is everything?",
              { s: "At the time I am recording this, the full chain is more than 700 gigabytes.", g: "wide" },
              "Depending on the machine and the connection, the first sync takes from many hours to several days.",
              "After that, keeping up is easy: one new block about every ten minutes.",
              "The price is paid once, at the door, and what it buys is that you never have to take anyone's word for the history."
            ] },
          { slide: { k: "points", title: "Whose word does a new node take?", start: 0, points: [
              "From its peers: nothing, without checking",
              "A lying peer can waste its time, never fool it",
              "A block that breaks a rule: refused, sender dropped",
              "One honest peer is enough to find the real chain",
              "Fine print: old signatures and assumevalid"
            ] },
            at: "centre", g: "count",
            say: [
              { s: "So whose word does the new node take, while it does all this?", g: "open" },
              { s: "From its peers, nothing at all, because every block they send is checked before it is believed.", show: 1 },
              { s: "A dishonest peer can stall, or send rubbish and waste a little time, but it cannot make a false history pass.", show: 2 },
              { s: "Send a block that breaks a rule and the node refuses it, and hangs up on whoever sent it.", show: 3 },
              { s: "And it takes only one honest peer to show you the real chain, since work cannot be faked.", show: 4, g: "pinch" },
              { s: "Now the fine print, because I promised you no selling.", show: 5 },
              "By default, Bitcoin Core skips re-checking the signatures in old blocks that lie beneath one particular block named in its own code.",
              "Everything else is still checked, the shortcut is public and reviewed, and one setting, assumevalid, turns it off."
            ] },
          { say: ["One question on that, and it is the heart of today.", "A peer sends your node a block that breaks the rules: what does your node do?"],
            quiz: {
              q: "A peer sends your node a block that breaks the rules: what does your node do?",
              options: [
                "Accepts it if most of its peers have accepted it",
                "Keeps it until a miner confirms it",
                "Asks a DNS seed to make the decision",
                "Rejects it, whoever sent it and however much work it has"
              ],
              answer: 3,
              right: ["Yes: a full node checks for itself, and no crowd or authority can overrule the rules."],
              wrong: [
                ["A node does not count heads, because as lecture 1 showed, heads are free to fake.", "It checks the block itself, and rejects one that breaks the rules whoever sent it."],
                ["Miners make blocks, but they cannot make a broken one valid.", "Your node checks every block itself, and rejects one that breaks the rules."],
                ["A seed only makes introductions, and has no say over what is valid.", "Your node checks the block itself and rejects it."],
                null
              ]
            } },
          { slide: { k: "figure", title: "Pruning: check it, then let it go", ops: [
              { box: [4, 10, 40, 12], t: "download block" },
              { arrow: [45, 16, 57, 16] },
              { box: [58, 10, 44, 12], t: "check every rule", c: "green" },
              { arrow: [103, 16, 113, 16], at: 2 },
              { box: [114, 10, 42, 12], t: "update coin set", c: "blue", at: 2 },
              { arrow: [80, 23, 80, 33], c: "red", at: 3 },
              { box: [52, 34, 56, 12], t: "old block deleted", c: "red", dash: true, at: 3 },
              { text: "kept: the unspent coins, and the last two days of blocks", x: 80, y: 57, a: "c", size: 4, c: "green", at: 4 }
            ] },
            at: "screen", g: "point",
            say: [
              "Must you then keep all 700 gigabytes for ever?",
              "No, and the reason goes back to lecture 4.",
              "To check a new payment, a node needs only the coins that are currently unspent, the UTXO set of lecture 4, not the story of how they came to be.",
              "So a node can be told to prune: once a block is checked and the coin set updated, the old block is deleted.",
              "It keeps the unspent coins and at least the last two days of blocks, in as little as 550 megabytes of block storage.",
              { s: "A pruned node has still checked everything, so it is every bit as sure of the ledger as one that kept the lot.", g: "pinch" },
              "What it gives up is only the ability to hand old blocks to the next newcomer."
            ] }
        ] },

      { id: "light-clients", title: "Light Clients, and a Node of Your Own", topics: ["light client", "spv", "block headers", "compact block filters", "bip 157", "bip 158", "why run a node"],
        beats: [
          { slide: { k: "section", title: "Light Clients, and a Node of Your Own", sub: "Headers, filters, and what you give up without a node" },
            at: "lectern", g: "open",
            say: [
              "A pruned node still has to do the whole first sync, and a phone in your pocket is not going to do that.",
              "So section 8 of the paper sketches something lighter, which it calls simplified payment verification.",
              "We call such software a light client, and a wallet on a phone is usually one, or something lighter still.",
              { s: "It is a real trade, though, and I want you to see exactly what is being traded.", g: "weigh" }
            ] },
          { slide: { k: "compare", title: "Two ways to travel light",
              left: { head: "Pruned full node", points: ["Checks every block and rule", "Then deletes old blocks", "Keeps the unspent coins", "Trusts nobody"] },
              right: { head: "Light client", points: ["Keeps block headers only", "Checks the work, not the payments", "Asks full nodes for its own", "Trusts miners to keep the rules"] } },
            at: "left", g: "weigh",
            say: [
              "On the left is the pruned node we have just met: it checks everything and then travels light.",
              "On the right is the light client, which never downloads the whole chain at all.",
              "It keeps only the chain of headers, and checks the proof of work on those.",
              "When you are paid, it asks a full node for a Merkle proof, the kind from lecture 6, tying that payment to a header.",
              "So it can see that your payment sits in a block with real work piled on top.",
              { s: "What it cannot do is check that the block obeyed the rules; as the paper itself admits, the user cannot check the transaction for himself.", g: "pinch" },
              "It is betting that miners would not spend all that work on a block the full nodes are going to refuse."
            ] },
          { slide: { k: "number", value: "80 bytes", label: "one block header: all of them since 2009 fit in under 100 megabytes", note: "Whitepaper, section 7: about 4.2 megabytes of headers a year" },
            at: "centre", g: "open",
            say: [
              "Why headers?",
              "Because they are tiny: 80 bytes each, however full the block.",
              "The paper works it out as about 4.2 megabytes a year, so every header since 2009 comes to under 100 megabytes.",
              { s: "That fits on any phone, and it is enough to follow the chain with the most work.", g: "open" },
              "But it leaves one awkward question: out of all those blocks, which ones contain my payments?"
            ] },
          { slide: { k: "figure", title: "Filters: let the client do the looking", ops: [
              { box: [4, 8, 34, 12], t: "full node", c: "blue" },
              { box: [122, 8, 34, 12], t: "light client" },
              { arrow: [39, 12, 121, 12], c: "amber", at: 3 },
              { text: "a small filter for every block", x: 80, y: 8, a: "c", size: 3.5, c: "amber", at: 3 },
              { text: "mine in here?", x: 139, y: 27, a: "c", size: 3.5, at: 4 },
              { text: "no ... no ... maybe!", x: 139, y: 33, a: "c", size: 3.5, c: "green", at: 5 },
              { arrow: [121, 42, 39, 42], at: 6 },
              { text: "then send me that whole block", x: 80, y: 38, a: "c", size: 3.5, at: 6 },
              { text: "the client looks inside for itself", x: 80, y: 52, a: "c", size: 4, c: "green", at: 6 },
              { text: "same block, same filter: a liar stands out", x: 80, y: 60, a: "c", size: 4, c: "green", at: 7 }
            ] },
            at: "screen", g: "point",
            say: [
              "The old answer was for the client to describe what it was looking for and let a full node do the searching.",
              "That told a stranger rather a lot about you, and trusted that stranger not to leave anything out.",
              "In 2017, Olaoluwa Osuntokun, Alex Akselrod and Jim Posen proposed turning it round, in Bitcoin Improvement Proposals 157 and 158.",
              "The full node makes a small filter for every block, a compressed summary of every lock that block pays to or spends from.",
              "The client fetches the filters and tests each one on its own device: could anything of mine be in this block?",
              "A filter never misses, though once in a long while it gives a false alarm.",
              "When it says maybe, the client downloads that whole block, from any peer it likes, and looks inside for itself.",
              "And since every honest node computes the identical filter for a block, a client can compare several peers and catch a liar."
            ] },
          { slide: { k: "points", title: "What a node of your own gives you", start: 0, points: [
              "Your payments checked against the rules, by you",
              "Nobody to ask whether you have been paid",
              "Your questions stay on your own machine",
              "A copy of the history for the next newcomer",
              "Not included: income, or any say over miners"
            ] },
            at: "right", g: "count",
            say: [
              { s: "So why would anyone run a full node, when it earns nothing?", g: "shrug" },
              { s: "Because when someone pays you, it is your own machine that says whether the payment is real, by the rules you agreed to.", show: 1 },
              { s: "Without one, you are asking somebody else's node whether you have been paid, and trusting the answer.", show: 2 },
              "That is a keeper again, come back in through the side door: a keeper of information rather than of money.",
              { s: "Your own node also answers your wallet's questions at home, instead of sending them to a stranger's server.", show: 3 },
              { s: "And it holds the door open for the next new node, serving blocks the way others once served yours.", show: 4 },
              { s: "What it does not do is earn anything, or choose what goes into blocks; it only refuses what breaks the rules.", show: 5, g: "chop" }
            ] },
          { slide: { k: "quote", text: "Businesses that receive frequent payments will probably still want to run their own nodes for more independent security and quicker verification.", by: "Satoshi Nakamoto, Bitcoin whitepaper, section 8, 2008" },
            at: "centre", g: "open",
            say: [
              { s: "The paper says as much, right after describing the light client.", g: "point" },
              "A light client is a reasonable convenience, as long as you know what it is taking on trust.",
              "But the system as a whole stays honest only because enough people, all over the world, check everything for themselves.",
              "The cost today is a modest computer left switched on, some disk and an internet connection."
            ] }
        ] },

      { id: "weak-points", title: "Where the Network Is Weak", topics: ["eclipse attack", "heilman", "address book poisoning", "anchors", "block-relay-only", "network attacks", "next lecture"],
        beats: [
          { slide: { k: "section", title: "Where the Network Is Weak", sub: "The eclipse attack, told plainly" },
            at: "lectern", g: "open",
            say: [
              "I have spent this lecture admiring the network, so let me now tell you where it is weak.",
              "Everything today has rested on one quiet assumption.",
              { s: "I said that one honest peer is enough.", g: "pinch" },
              "So ask the uncomfortable question: what if you have none?"
            ] },
          { board: { clear: true, title: "An eclipsed node", ops: [
              { circle: [56, 54, 8], t: "you", at: 0 },
              { circle: [80, 63.2, 4], at: 0 }, { line: [63.9, 57, 75.8, 61.6], at: 0 },
              { circle: [65.9, 76.2, 4], at: 0 }, { line: [59.5, 61.8, 64.1, 72.1], at: 0 },
              { circle: [46.1, 76.2, 4], at: 0 }, { line: [52.5, 61.8, 47.9, 72.1], at: 0 },
              { circle: [32, 63.2, 4], at: 0 }, { line: [48.1, 57, 36.2, 61.6], at: 0 },
              { circle: [32, 44.8, 4], at: 0 }, { line: [48.1, 51, 36.2, 46.4], at: 0 },
              { circle: [46.1, 31.8, 4], at: 0 }, { line: [52.5, 46.2, 47.9, 35.9], at: 0 },
              { circle: [65.9, 31.8, 4], at: 0 }, { line: [59.5, 46.2, 64.1, 35.9], at: 0 },
              { circle: [80, 44.8, 4], at: 0 }, { line: [63.9, 51, 75.8, 46.4], at: 0 },
              { circle: [80, 63.2, 3], c: "red", fill: true, at: 1 }, { circle: [65.9, 76.2, 3], c: "red", fill: true, at: 1 },
              { circle: [46.1, 76.2, 3], c: "red", fill: true, at: 1 }, { circle: [32, 63.2, 3], c: "red", fill: true, at: 1 },
              { circle: [32, 44.8, 3], c: "red", fill: true, at: 1 }, { circle: [46.1, 31.8, 3], c: "red", fill: true, at: 1 },
              { circle: [65.9, 31.8, 3], c: "red", fill: true, at: 1 }, { circle: [80, 44.8, 3], c: "red", fill: true, at: 1 },
              { text: "all 8: one attacker", x: 56, y: 88, a: "c", size: 4.5, c: "red", at: 1 },
              { line: [98, 24, 98, 84], c: "red", dash: true, at: 3 },
              { text: "honest network", x: 132, y: 24, a: "c", size: 4.5, c: "green", at: 4 },
              { line: [122, 36, 142, 46], c: "grey", at: 4 }, { line: [142, 46, 124, 60], c: "grey", at: 4 }, { line: [124, 60, 142, 72], c: "grey", at: 4 }, { line: [122, 36, 124, 60], c: "grey", at: 4 },
              { circle: [122, 36, 4], c: "green", at: 4 }, { circle: [142, 46, 4], c: "green", at: 4 }, { circle: [124, 60, 4], c: "green", at: 4 }, { circle: [142, 72, 4], c: "green", at: 4 },
              { arrow: [118, 50, 102, 52], c: "green", at: 4 },
              { text: "new block", x: 109, y: 45, a: "c", size: 4, c: "green", at: 4 },
              { text: "x", x: 95, y: 54, a: "c", size: 7, c: "red", at: 4 }
            ] },
            say: [
              "Here is your node as it was in 2015, with eight chosen neighbours.",
              "Now suppose every one of those eight is secretly the same attacker.",
              "Your node is still running, still checking, still obeying every rule.",
              "But everything it hears has passed through one pair of hands, and so has everything it says.",
              "Out there the honest network carries on, finding blocks your node is never shown.",
              { s: "This is called an eclipse attack, because the attacker stands between you and the sun.", g: "up" }
            ] },
          { slide: { k: "points", title: "What an eclipser can and cannot do", start: 0, points: [
              "Cannot forge a signature, so cannot spend your coins",
              "Cannot make an invalid block pass your checks",
              "Can hide new blocks and payments from you",
              "Can show you a stale chain, and pay you on it",
              "Can make an eclipsed miner waste its work"
            ] },
            at: "left", g: "count",
            say: [
              { s: "Start with what the attacker cannot do, because the list is reassuring.", g: "open" },
              { s: "It cannot forge a signature, so your coins stay yours.", show: 1 },
              { s: "It cannot slip an invalid block past you, because your node still checks every one.", show: 2 },
              { s: "What it can do is control what you see: it can hide new blocks and payments from you.", show: 3 },
              { s: "It can keep you on a stale version of the chain, pay you there, and spend the same coins elsewhere on the real one.", show: 4, g: "lean" },
              { s: "And if you are a miner, it can keep you digging on a chain the rest of the world has left behind.", show: 5 },
              "So the damage is not theft by magic; it is the old double spend, made possible by blindfolding the victim."
            ] },
          { slide: { k: "table", title: "Eclipse Attacks, 2015: the recipe", start: 0, head: ["Step", "What happens"], rows: [
              ["1  Flood", "fill the victim's address book"],
              ["2  Wait", "until the node restarts"],
              ["3  Restart", "all 8 outgoing peers: attacker"],
              ["4  Crowd in", "take every incoming slot too"],
              ["Estimated cost", "4,600 bots: 85% or better"],
              ["In live tests", "400 bots were enough"]
            ], note: "Heilman, Kendler, Zohar and Goldberg, USENIX Security Symposium, August 2015" },
            at: "screen", g: "point",
            say: [
              "In 2015 four researchers showed how to do this to the Bitcoin software of the day.",
              "They were Ethan Heilman, Alison Kendler, Aviv Zohar and Sharon Goldberg, and their target was the address book from earlier.",
              { s: "The attacker's machines connect to the victim over and over, feeding it addresses that all lead back to the attacker.", show: 1 },
              { s: "Then they wait for the node to restart, as every node does sooner or later, for an update or a power cut.", show: 2 },
              { s: "On waking, the node picks eight peers from a poisoned address book, and with luck for the attacker, all eight are false friends.", show: 3 },
              { s: "Meanwhile the attacker fills every incoming slot as well.", show: 4 },
              { s: "They estimated that 4,600 hijacked machines would succeed at least 85 times in 100, and in tests on their own live nodes 400 were enough.", show: 6 }
            ] },
          { slide: { k: "points", title: "Raising the bar, in public", start: 0, points: [
              "2015: an address book that is harder to flood",
              "Feeler connections: test addresses before trusting them",
              "2019: two extra connections for blocks only",
              "2021: anchors, two peers remembered across a restart",
              "Still true: this raises the cost; it is not a cure"
            ] },
            at: "centre", g: "open",
            say: [
              "The researchers told the developers first and proposed fixes, and three of those fixes shipped in the software that same year.",
              { s: "The address book was rebuilt so that one attacker cannot easily fill it.", show: 1 },
              { s: "Nodes now make brief feeler connections, testing addresses in the book before they are ever relied on.", show: 2 },
              { s: "In 2019 came those two extra connections that carry only blocks, which make it harder to cut a node off from new blocks.", show: 3 },
              { s: "And since 2021 a node remembers two of its peers across a restart, the very moment the attack depended on.", show: 4 },
              { s: "None of this makes an eclipse impossible; it makes one expensive, which in security is usually the honest best.", show: 5, g: "weigh" }
            ] },
          { say: ["Last question of the day.", "An attacker controls every connection your node has: what can it do?"],
            quiz: {
              q: "An attacker controls every connection your node has: what can it do?",
              options: [
                "Rewrite the rules that your node enforces",
                "Spend the coins that your keys control",
                "Hide new blocks and payments from your node",
                "Make your node accept a block that breaks the rules"
              ],
              answer: 2,
              right: ["Right: it controls what you see and what you can say, and nothing more than that."],
              wrong: [
                ["The rules live in the software on your own machine, out of the attacker's reach.", "It can only control what your node hears, hiding new blocks and payments."],
                ["Spending needs your signature, and the attacker does not have your keys.", "What it can do is hide new blocks and payments, so that you act on a stale picture."],
                null,
                ["Your node still checks every block itself, so an invalid one is refused.", "The attacker's power is to hide new blocks and payments from you."]
              ]
            } },
          { slide: { k: "points", title: "Today, in six lines", start: 0, points: [
              "A mesh of equals: no centre, no member list",
              "Seeds for introductions, then an address book",
              "Gossip: announce, ask, send, and check first",
              "A mempool per node, and compact blocks from it",
              "A full node checks everything; a light one, the work",
              "Weak point: a node that hears only one voice"
            ] },
            at: "lectern", g: "count",
            say: [
              { s: "Let me gather today into a few lines.", g: "open" },
              { s: "The network is a mesh of equals, joined by introductions and an address book.", show: 2 },
              { s: "News travels by gossip: announce, ask, send, and always check before passing it on.", show: 3 },
              { s: "Every node keeps its own waiting room, and that is what lets a block travel as a short packing list.", show: 4 },
              { s: "A full node believes nothing it has not checked, and a light client checks only the work.", show: 5 },
              { s: "And the weak point is a node that hears only one voice, so the defence is to hear many.", show: 6 }
            ] },
          { slide: { k: "figure", title: "Next time: Fees and Block Space", ops: [
              { text: "the waiting room", x: 41, y: 5, a: "c", size: 3.5, c: "blue" },
              { box: [6, 8, 70, 38], c: "blue" },
              { box: [12, 14, 10, 7], fill: true }, { box: [28, 14, 10, 7], fill: true }, { box: [44, 14, 10, 7], fill: true }, { box: [60, 14, 10, 7], fill: true },
              { box: [12, 24, 10, 7], fill: true }, { box: [28, 24, 10, 7], fill: true }, { box: [44, 24, 10, 7], fill: true }, { box: [60, 24, 10, 7], fill: true },
              { box: [12, 34, 10, 7], fill: true }, { box: [28, 34, 10, 7], fill: true }, { box: [44, 34, 10, 7], fill: true }, { box: [60, 34, 10, 7], fill: true },
              { text: "the next block", x: 133, y: 11, a: "c", size: 3.5, c: "amber", at: 1 },
              { box: [112, 14, 42, 24], c: "amber", at: 1 },
              { arrow: [78, 27, 110, 27], at: 2 },
              { box: [116, 22, 10, 7], c: "amber", fill: true, at: 2 }, { box: [128, 22, 10, 7], c: "amber", fill: true, at: 2 }, { box: [140, 22, 10, 7], c: "amber", fill: true, at: 2 },
              { text: "more waiting than seats: who boards first?", x: 80, y: 57, a: "c", size: 4.5, c: "red", at: 2 }
            ] },
            at: "lectern", g: "open",
            say: [
              "Next time we stay in that waiting room, because I have left a question hanging in it.",
              "A block has only so much room, and at busy times there are far more transactions waiting than seats.",
              "So somebody has to choose who boards the next block and who waits for a later one.",
              "How that choice is made, and how you bid for a seat, is lecture 10: Fees and Block Space.",
              "Before then, look at Bitcoin Improvement Proposal 152, at least its opening sections, and section 5 of the paper, which is short.",
              { s: "Thank you, and I will see you in lecture 10.", g: "up" }
            ] }
        ] }
    ]
  });
})();
