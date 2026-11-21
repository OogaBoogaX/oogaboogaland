# Chat Unicode candidate — issue 364

Addresses w-s-bitcoin's conditional guidance on
https://github.com/OogaBoogaX/oogaboogaland/issues/364 . This is not security clearance.

## Result

The controller, network sender and Worker import the same text policy. Smart punctuation,
accents, ordinary URLs and emoji are retained as text. ZWJ, ZWNJ, variation selectors,
combining marks, CJK and natural RTL text remain intact. Only outer whitespace is trimmed.
Malformed UTF-16, C0/C1 controls, line separators and bidi overrides/isolates are refused,
not deleted. The counter and limit remain 160 UTF-16 code units (80 banana emoji fit).
No normalization, silent truncation, donation change or display-name expansion.

The room advertises `chat-unicode-v1`. New clients retain their draft and explain the
compatibility restriction when an older server cannot preserve extended text. The sender
also enforces this restriction; the UI is not the security boundary. A welcome without
the capability clears an earlier advertised capability. Old clients may restrict their
outgoing drafts, but their existing textContent renderer safely displays extended text.

## Requested boundary checks

- **Rendering:** chat.js uses createElement and textContent for names, text, announcements
  and status. No innerHTML, linkification, previews, remote content or URL navigation.
- **URL handling:** https:, javascript: and HTML-looking text are plain characters only.
- **Database:** room.js's say() scopes the retry key to the authenticated account, hashes
  the text, then stores/broadcasts it in the existing bounded in-memory ring. It does not
  put chat in D1 or concatenate it into a SQL query. Account/Tess SQL uses prepare/bind.
- **AI:** chat is not forwarded to Tess or any model. Tess has a separate request path.
  No chat-to-AI integration was added. Such an integration would need a fresh review of
  prompt boundaries, data disclosure and tool permissions; character validation would
  not make arbitrary instructions trusted.
- **Transport:** frame bounds, account rate bucket, identity, retry/ack correlation,
  duplicate suppression and logout protections are preserved. Invalid chat remains a
  nonfatal refusal. The client never slices incoming text into a partial surrogate pair.

## Executed checks

- Build and syntax checks on changed JavaScript: passed.
- Chat-focused client checks: 54/54 passed, including retry/logout/account checks,
  Unicode acceptance, invalid-control refusal, legacy-server gate and rollback welcome.
- Global unit tier: 347/347 passed (before adding the extra rollback-welcome assertion;
  the focused tier was rerun afterward and passed).
- Chat/protocol Worker tests: 43/43 passed.
- Full Worker test suite after generating its local fixtures and installing lockfile
  dependencies: 171/171 passed. The initial run lacked characters.gen.json and the SDK;
  those prerequisites were supplied locally, with no production/source workaround.
- Actual Room handler checks broadcast Unicode/markup-looking strings unchanged and
  advertise the capability. Policy tests cover controls, surrogate pairs, exact length,
  combined emoji, non-Latin scripts and URL/SQL-looking strings.
- Existing browser DOM checks were updated to cover capability gating, but were NOT run.

No Chrome binary is available here. Live authenticated two-client behaviour, physical
touch/IME entry, screen-reader behaviour and deployment remain unverified. No live chat
message, hosted database write, deployment or official-branch push was performed.

### Re-checked after integrating current rock (9b326b41)

Conflicts were documentation and state-shape only (AGENTS.md module table, net.js
state initializer); the policy, capability gate and Worker are unchanged.

- Build and node --check on every changed JavaScript file: passed.
- Global unit tier: 353/353 passed, including the chat wire, retry/rollback-welcome,
  client and account checks.
- Chat/protocol Worker tests: 43/43. Full Worker suite with generated fixtures and
  lockfile dependencies: 171/171. A local wrangler --dry-run bundle includes the policy.
- The hub's "ooga chat" browser check could not run here: headless Chromium first
  refused to start as root, then the hub page missed its readiness deadline under
  software WebGL. The runner printed STOP; it needs a maintainer machine.

## Rollout

Deploy/review the Worker and matching page together. New page + old Worker fails closed
for extended outgoing text; it does not send text that an old Worker could strip. A
rollback requires normal reconnect, which re-establishes the capability from welcome.
Do not remove the gate based only on frontend rollout. No migration is required.

Developed with AI assistance (OpenAI Codex); integration with current rock prepared with
AI assistance (Claude Code).
