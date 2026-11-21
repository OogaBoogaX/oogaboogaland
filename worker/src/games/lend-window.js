// The page's jumbotron snapshot (src/js/jumbotron-data.js) is a page script that writes `window.BL`, rebaked by the
// bot several times a day, so it stays exactly as the bake writes it. island.js imports this module just before it,
// which lends the Worker a `window` (its own global) for that one evaluation, and return-window.js just after, which
// takes it back. The snapshot imports nothing, so no other module evaluates while it is lent.
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
  globalThis.__lentWindow = true;
}
