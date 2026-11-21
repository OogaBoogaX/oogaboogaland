// The island's wiring of the voice switch prompt (voice-handoff.js), attached once by the director. It asks once a
// page, and only as the page arrives: when its first welcome says the account speaks from Ooga Chat on another device
// (net.js `state.voiceElsewhere`; voice.js holds its own return meanwhile), or when a later welcome finds it there and
// this page's own voice gives way to it (voice.js `yielded`). A voice that goes elsewhere later, while
// this page is open, is the visitor's own doing and asks nothing. Switch here joins the island's voice, whose source
// the Audience puts first, so the other device's lease ends there; Not now changes nothing, and the visitor goes on
// moving and overhearing. The card goes when that voice is no longer elsewhere, when this page is in voice, or with the
// room. When Ooga Chat takes this page's voice instead (`state.voiceMoved`), a toast says where it went.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  let page = null;
  const attach = () => {
    if (page) return page;
    const net = BL.net, voice = BL.voice;
    let asked = false, arrived = false, found = false, moved = net.state.voiceMoved, yielded = voice.stats.yielded;
    const card = BL.voiceHandoff.build({ onSwitch: () => voice.toggle() });
    document.body.append(card.node);
    const sync = () => {
      const s = net.state, v = voice.stats;
      if (s.voiceMoved !== moved) { moved = s.voiceMoved; BL.hud.toast(BL.voiceHandoff.WORDS.moved); }
      // What the first welcome found, read once.
      if (!arrived && s.room === "live") { arrived = true; found = s.voiceElsewhere; }
      // A later welcome found the voice elsewhere and this page's own voice gave way to it (voice.js `yielded`): the
      // visitor did not choose that here, so it is asked again, as on arrival.
      if (v.yielded !== yielded) { yielded = v.yielded; found = true; asked = false; }
      const elsewhere = s.room === "live" && s.voiceElsewhere && !v.enabled && !v.joining && !v.reconnecting;
      if (!elsewhere) card.close();
      else if (found && !asked) { asked = true; card.open(); }
    };
    const offNet = net.subscribe(sync), offVoice = voice.subscribe(sync);
    sync();
    page = { card, dispose() { offNet(); offVoice(); card.node.remove(); page = null; } };
    return page;
  };
  BL.voiceSwitch = { attach, get page() { return page; } };
})();
