# Sleeping Ooga handoff diagnostics

Issue #481 remains open for deployed two-client handoff, reconnect and long-vacancy checks. The browser-host fix rebuilds a sleeping Ooga's local bed reservation and settled pose when a follower takes ownership or a retained hub resumes; #552's awake recovery is retained.

On a page opened with `?debug=1`, enable evidence before reproducing:

```js
__ooga.crew.sleepDiagnostics(true)
```

If an Ooga becomes stranded, capture this **before reloading**:

```js
JSON.stringify(__ooga.crew.sleepDiagnostics(), null, 2)
```

The snapshot includes the local/host identity, current crew state, position, rotation, bed owner and travel state, plus the most recent 64 before/after handoff records. Reasons distinguish a host change from a retained hub. Records contain copied values, no conversation or voice data. The history is opt-in and held only in memory, with no timer, network request or persistent storage. `sleepDiagnostics(false)` disables tracing and clears its history; crew disposal also clears it. Taking a snapshot allocates only when explicitly requested.

Repeat with two signed-in staging browsers: host departure, reconnect, takeover while a sleeper is travelling, a sleeping visitor's retained-hub return, and a long idle session. Confirm a valid bed, lying pose and later normal wake-up on both clients. This instrumentation does not establish that every possible long-session stranding cause is fixed.
