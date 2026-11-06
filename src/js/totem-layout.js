// Authored repository metadata and mainland placements, without feed startup.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const repos = [
    { name: "Bitcoin Core", word: "CORE", repo: "bitcoin/bitcoin", importance: 1 },
    { name: "BTCPay Server", word: "BTCPAY", repo: "btcpayserver/btcpayserver", importance: 0.52 },
    { name: "LND", word: "LND", repo: "lightningnetwork/lnd", importance: 0.7 },
    { name: "CLN", word: "CLN", repo: "ElementsProject/lightning", importance: 0.62 }
  ];
  BL.totemLayout = { repos, spots: [[7.8, 18.5], [-8.1, 18.6], [-4.7, 19.5], [4.1, 19.9]], room: 2.4 };
})();
