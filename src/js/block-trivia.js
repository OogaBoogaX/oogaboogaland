// Block Frenzy's quiz traps ask these: Bitcoin questions, four answers each, the right one first (`scene-block.js`
// shuffles them on the card), and a one-line fact shown once it is answered. Written for players from about ten up:
// plain words, one idea a question, answers that are wrong for a reason rather than silly.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const Q = (q, answers, fact) => ({ q, answers, fact });
  BL.blockTrivia = [
    Q("Who wrote the Bitcoin white paper?", ["Satoshi Nakamoto", "Hal Finney", "Nick Szabo", "Adam Back"], "Satoshi Nakamoto is a pen name; nobody knows for sure who it is."),
    Q("In what year was the Bitcoin white paper published?", ["2008", "2009", "2010", "2007"], "It went out to a cryptography mailing list on 31 October 2008."),
    Q("When was the very first Bitcoin block mined?", ["January 2009", "October 2008", "May 2010", "December 2012"], "The genesis block is dated 3 January 2009."),
    Q("What is the first block in the chain called?", ["The genesis block", "The origin block", "The zero block", "The mother block"], "Every later block links back to it, one hash at a time."),
    Q("How many bitcoin will there ever be?", ["21 million", "100 million", "1 billion", "No limit"], "The rules cap the supply just under 21 million coins."),
    Q("What is the smallest unit of a bitcoin called?", ["A satoshi", "A bit", "A finney", "A cent"], "A sat is one hundred-millionth of a bitcoin."),
    Q("How many satoshis make one bitcoin?", ["100,000,000", "1,000,000", "1,000", "21,000,000"], "That's why people often count in sats."),
    Q("About how often is a new Bitcoin block found?", ["Every 10 minutes", "Every second", "Every hour", "Once a day"], "The difficulty moves to keep it near ten minutes on average."),
    Q("How often does the mining difficulty adjust?", ["Every 2,016 blocks", "Every block", "Every 210,000 blocks", "Every January"], "2,016 blocks is roughly two weeks."),
    Q("How often does the block reward halve?", ["Every 210,000 blocks", "Every 2,016 blocks", "Every year", "Every 10 years exactly"], "That works out to about every four years."),
    Q("What was the reward for mining a block in 2009?", ["50 BTC", "21 BTC", "6.25 BTC", "100 BTC"], "It has halved several times since."),
    Q("What is the block reward after the 2024 halving?", ["3.125 BTC", "6.25 BTC", "12.5 BTC", "1 BTC"], "The next halving cuts it to about 1.5625 BTC."),
    Q("Roughly when will the last bitcoin be mined?", ["Around 2140", "Around 2030", "Around 2050", "It already happened"], "After that, miners earn transaction fees only."),
    Q("What did Laszlo Hanyecz famously buy with 10,000 BTC in 2010?", ["Two pizzas", "A car", "A laptop", "A house"], "22 May is Bitcoin Pizza Day."),
    Q("Which hash function does Bitcoin mining use?", ["SHA-256", "MD5", "Scrypt", "Ethash"], "Miners run SHA-256 twice over a block header."),
    Q("What do miners race to find?", ["A block hash below the target", "The biggest prime number", "A lost private key", "The fastest internet"], "Finding that hash is the proof of work."),
    Q("Where do unconfirmed transactions wait?", ["The mempool", "The genesis block", "A bank vault", "The Lightning Network"], "Miners pick from the mempool, usually the best fees first."),
    Q("Who gets the fees paid in a transaction?", ["The miner of the block", "Satoshi", "The receiver", "Nobody, they're burned"], "Fees plus the new coins are the miner's reward."),
    Q("What does a fee rate of 'sats per vbyte' measure?", ["Fee for the space a transaction takes", "Bitcoin's price", "Mining speed", "Wallet size"], "Bigger transactions use more block space, so pay more."),
    Q("What links each block to the one before it?", ["The previous block's hash", "A timestamp only", "The miner's name", "A password"], "Change an old block and every hash after it breaks."),
    Q("What is a Bitcoin node?", ["A computer that checks and shares the rules", "A type of coin", "A mining reward", "A paper wallet"], "Anyone can run a node and verify everything themselves."),
    Q("What is the Lightning Network?", ["A layer for fast, cheap Bitcoin payments", "A new coin", "A mining pool", "A weather app"], "Payments move through channels and settle on Bitcoin."),
    Q("'Not your keys, not your coins' means:", ["Whoever holds the keys controls the coins", "Keys unlock mining", "Coins need a door key", "Banks own all bitcoin"], "Holding your own keys is called self-custody."),
    Q("Which should you share to get paid?", ["Your address", "Your private key", "Your seed phrase", "Your password"], "Never share your private key or seed phrase."),
    Q("A seed phrase usually has how many words?", ["12 or 24", "4", "100", "1"], "Write it down and keep it somewhere safe and offline."),
    Q("What does 'cold storage' mean?", ["Keeping keys offline", "Mining in winter", "A frozen exchange", "Selling slowly"], "Offline keys can't be stolen over the internet."),
    Q("Which country first made bitcoin legal tender?", ["El Salvador", "Japan", "Switzerland", "Canada"], "It passed the law in 2021."),
    Q("Who received the first Bitcoin transaction from Satoshi?", ["Hal Finney", "Elon Musk", "Vitalik Buterin", "Laszlo Hanyecz"], "Hal Finney also ran one of the first nodes."),
    Q("Where did the word 'HODL' come from?", ["A misspelled forum post", "A Bitcoin rule", "A bank's slogan", "Satoshi's code"], "A 2013 post said 'I AM HODLING' and it stuck."),
    Q("What does a block's height tell you?", ["How many blocks came before it", "How big the block is", "The miner's age", "The price that day"], "The genesis block is height 0."),
    Q("What happens to the block subsidy at a halving?", ["It is cut in half", "It doubles", "It stays the same", "It goes to zero"], "Halvings make new bitcoin scarcer over time."),
    Q("Which upgrade activated on Bitcoin in 2021?", ["Taproot", "SegWit", "The genesis block", "Lightning"], "Taproot made some transactions smaller and more private."),
    Q("Which upgrade activated on Bitcoin in 2017?", ["SegWit", "Taproot", "Halving", "Proof of stake"], "SegWit fixed transaction malleability and freed block space."),
    Q("What is Bitcoin's common ticker symbol?", ["BTC", "BIT", "BCN", "SAT"], "You'll also see XBT on some exchanges."),
    Q("The genesis block's hidden message is a headline about:", ["Banks being bailed out", "A moon landing", "A sports final", "A new phone"], "It quotes The Times of 3 January 2009.")
  ];
})();
