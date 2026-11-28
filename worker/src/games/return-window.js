// Takes back the `window` lend-window.js lent for the jumbotron snapshot, so no Worker code ever finds one.
if (globalThis.__lentWindow) {
  delete globalThis.window;
  delete globalThis.__lentWindow;
}
