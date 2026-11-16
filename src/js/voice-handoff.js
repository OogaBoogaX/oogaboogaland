// The voice switch prompt, the island's and Ooga Chat's alike: an account speaks from one device at a time, so a page
// that opens while its account's voice is on another device asks before taking it. "Voice is on another device. Switch it
// here?" with Switch here and Not now; Not now changes nothing, and the visitor goes on moving and hearing.
// `build({ onSwitch, onDismiss })` returns the card (a labelled dialog that never takes the focus or the keys by
// itself: it floats under the banner, pressed with the pointer, Tab or a pad) and `{ node, open(), close(), shown }`.
// Switch here calls `onSwitch()` inside its click, which is the gesture a microphone needs; Not now, or Escape inside
// the card, calls `onDismiss()`. It reads nothing at load but window.BL, so Ooga Chat shares it.
// The island wires it in voice-switch.js, Ooga Chat in ooga-chat-app.js.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  const WORDS = { title: "Voice is on another device", body: "You're already speaking from another device. Switch your voice to this one? The other device stops speaking and keeps listening.",
    take: "Switch here", later: "Not now", moved: "Voice moved to your other device." };
  let cards = 0;
  const build = ({ onSwitch = () => {}, onDismiss = () => {} } = {}) => {
    const make = (tag, className, text) => {
      const el = document.createElement(tag);
      if (className) el.className = className;
      if (text) el.textContent = text;
      return el;
    };
    const id = `voice-handoff-${++cards}`;
    const title = make("h2", "voice-handoff-title", WORDS.title), body = make("p", "voice-handoff-body", WORDS.body);
    const later = make("button", "foot-button", WORDS.later), take = make("button", "foot-button foot-primary", WORDS.take);
    title.id = `${id}-title`; body.id = `${id}-body`;
    later.type = take.type = "button";
    const node = make("section", "voice-handoff");
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-labelledby", title.id);
    node.setAttribute("aria-describedby", body.id);
    node.hidden = true;
    const actions = make("div", "voice-handoff-actions");
    actions.append(later, take);
    node.append(title, body, actions);
    const close = () => { node.hidden = true; };
    const dismiss = () => { close(); onDismiss(); };
    later.addEventListener("click", dismiss);
    take.addEventListener("click", () => { close(); onSwitch(); });
    node.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      dismiss();
    });
    return { node, close, open() { node.hidden = false; }, get shown() { return !node.hidden; } };
  };
  BL.voiceHandoff = { build, WORDS };
})();
