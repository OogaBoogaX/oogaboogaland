// Ooga Chat's text contract, shared unchanged by the classic page and Worker. Donation notes and display names
// retain their own policies. Text is data, never HTML, a URL action, a database expression or AI instructions.
(() => {
  "use strict";
  const scope = typeof window === "undefined" ? globalThis : window;
  const BL = scope.BL = scope.BL || {};
  const MAX = 160, FEATURE = "chat-unicode-v1";
  const blocked = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
  const legacy = text => !/[^\w .,!?'@#:-]/.test(text);
  const text = value => typeof value === "string" ? value.trim() : "";
  const error = value => {
    if (typeof value !== "string") return "type";
    // Reject, do not strip: controls, line separators and bidi overrides/isolates could disguise a line or name.
    // Natural RTL letters, combining accents, emoji ZWJ/ZWNJ and variation selectors remain unchanged.
    if (blocked.test(value)) return "controls";
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const low = value.charCodeAt(++i);
        if (!(low >= 0xdc00 && low <= 0xdfff)) return "unicode";
      } else if (c >= 0xdc00 && c <= 0xdfff) return "unicode";
    }
    const line = text(value);
    return !line ? "empty" : line.length > MAX ? "length" : null;
  };
  BL.chatPolicy = Object.freeze({ MAX, FEATURE, text, error, legacy });
})();
