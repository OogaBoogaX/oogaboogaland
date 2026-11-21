// Ooga Chat's Bananas tab, in the `bananas` chunk (ooga-chat-chunks.js) with the island's panel and Feed the Oogas, which
// a staged build loads only once the page is idle or the tab is chosen. It registers `bananas` on BL.oogaChatViews,
// whose `deferred` stands in for it until then, and builds with the views' kit.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const { letter } = BL.signGlyphs, { make } = BL.oogaChatViews.kit;
  // The Bananas tab (#656): the island's own panel (banana-panel.js, native.css), filled from donations.js over this
  // origin's /donations relay while the service's feed is live (the app subscribes, ooga-chat-app.js), or on the
  // fixture entry alone from its labelled demo (`ctx.demo`). With no feed (off, loading or unreachable) it says
  // donations aren't open here, never zeros or a demo, and Feed the Oogas, the island's own popup (`ctx.feed`), shows
  // only while they are. The panel's price is the tally's, so it is shown afresh whenever the tab is opened.
  const bananas = (ctx) => {
    const node = make("section", "panel oc-panel oc-bananas");
    node.dataset.panel = "bananas";
    BL.bananaPanel.build(node);
    for (const el of node.querySelectorAll("[data-sign]")) letter(el);
    const chip = node.querySelector(".panel-title .panel-chip"), slab = node.querySelector(".banana-slab");
    const feedButton = node.querySelector('[data-action="feed"]');
    feedButton.addEventListener("click", () => ctx.feed());
    const closed = make("div", "slab oc-slab oc-pending", make("p", "", "Donations aren't open on Ooga Chat right now."));
    node.append(closed);
    const visible = () => !node.closest("[hidden]");
    let panel = null, feed = null, watching = null;
    // The fixture's demo tells the panel of each simulated payment, so its receipt shows in the tally and lists.
    const offDemo = ctx.demo?.subscribe ? ctx.demo.subscribe(() => { if (feed === "demo") panel?.refresh(true); }) : () => {};
    const update = (state) => {
      if (!watching && node.parentElement) {
        watching = new MutationObserver(() => panel?.showRate());
        watching.observe(node.parentElement, { attributes: true, attributeFilter: ["hidden"] });
      }
      const next = state.mode !== "live" ? "off" : state.boot.features.feed === "demo" && ctx.demo ? "demo" : state.boot.features.feed;
      if (next === feed) return;
      feed = next;
      panel?.dispose();
      panel = null;
      const open = feed === "live" || feed === "demo";
      slab.hidden = chip.hidden = feedButton.hidden = !open;
      closed.hidden = open;
      if (!open) return;
      const storageKey = ctx.storageKey("recent-bar");
      panel = BL.bananaPanel.create(node, feed === "demo" ? { ...ctx.demo, storageKey, visible } : { storageKey, visible });
    };
    const dispose = () => {
      watching?.disconnect();
      offDemo();
      panel?.dispose();
      node.remove();
    };
    return { node, update, dispose };
  };  BL.oogaChatViews.bananas = bananas;
})();
