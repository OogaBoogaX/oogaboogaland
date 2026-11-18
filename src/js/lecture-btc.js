// The course the Lecture Hall gives, Bitcoin from First Principles: fourteen lectures in four parts, ordered by what
// has to be understood before the next idea makes sense (the tools, the ledger, the network and its users, change
// and scale). Each lecture stands on its own, written for this hall from primary sources (the whitepaper, the
// improvement proposals, the reference implementation's documentation), and names what to read before class. The
// course is given by Professor Pumponopoulos (`by`; his profile in lecturer.js is `lecturer`). Each
// lecture's content is a file of its own (`lecture-btc-<nn>.js`, deferred group `group`), fetched when it is chosen.
(() => {
  "use strict";
  const PARTS = ["The problem and the tools", "The ledger", "The network and its users", "Change and scale"];
  const lectures = [
    [0, "The Problem of Digital Cash", "Why money on the internet was hard, and what was tried"],
    [0, "Fingerprints: Hash Functions", "SHA-256, commitments, Merkle trees and provable work"],
    [0, "Keys and Signatures", "What a signature proves, and what it does not"],
    [1, "Coins Are Outputs", "No accounts, no balances: one transaction, byte by byte"],
    [1, "Programmable Locks", "Script, from the first locks to taproot"],
    [1, "Blocks and the Chain", "Headers, Merkle roots and proof that a payment is in"],
    [1, "Mining: Proof of Work", "The lottery, the difficulty, the subsidy and the cap"],
    [1, "Agreement Without a Leader", "The most-work chain, and who enforces the rules"],
    [2, "The Peer-to-Peer Network", "Peers, relay, the mempool and a node of your own"],
    [2, "Fees and Block Space", "Block space as an auction, and bidding in it"],
    [2, "Wallets and Holding Your Own Keys", "Seeds, trees of keys, backups and how coins get lost"],
    [2, "Privacy and Its Limits", "Pseudonymous is not anonymous"],
    [3, "How Bitcoin Changes", "Proposals, soft forks and the history behind the process"],
    [3, "Scaling in Layers: Lightning", "Payment channels, and paying across strangers"]
  ];
  window.BL.lectures.course({
    id: "first-principles", short: "btc", title: "Bitcoin from First Principles", subtitle: "Fourteen lectures on how Bitcoin works, and why",
    lecturer: "pumponopoulos", by: "Professor Pumponopoulos", parts: PARTS,
    lectures: lectures.map(([part, title, blurb], i) => {
      const nn = String(i + 1).padStart(2, "0");
      return { n: i + 1, id: `btc-${nn}`, part, title, blurb, available: i === 0, group: `lecture-btc-${"abcdefghijklmn"[i]}` };
    })
  });
})();
