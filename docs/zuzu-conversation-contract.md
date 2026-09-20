# Zuzu conversation boundary, version 1

V2 ships with a clearly labelled **local mock**, no fetch/AI provider, no keys, and no backend.
The mock accepts free-form messages but does not understand or answer them using AI.
The deterministic world brain remains responsible for local behavior and fallback dialogue.
Conversation history is separate from the 64-entry world-event log; both reset on scene exit.

## Future HTTP service

`POST /api/zuzu/chat`, `Content-Type: application/json`.
This is a proposed protected endpoint, not a route hosted by GitHub Pages.

```json
{
  "version": 1,
  "agent": "zuzu",
  "message": "Why are you following me?",
  "session": {
    "playerName": "YellowBrokeIt",
    "location": "arrival",
    "mood": "content",
    "foodCount": 1,
    "recentEvents": [
      { "seq": 1, "time": 12.5, "type": "food_seen", "entity": "player", "value": 1 }
    ]
  },
  "history": [
    { "role": "player", "text": "Hello Zuzu" },
    { "role": "zuzu", "text": "You may admire me. Quietly." }
  ]
}
```

`history` contains prior messages only; the current message appears once, in `message`.
Closing while waiting cancels that request; its player message can remain in local history
without a response. No conversation is persisted or uploaded in mock mode.
The body is explicitly constructed, never made by serializing a scene or agent object.
There are no coordinates, DOM objects, debug objects, secrets, account identity, or client
personality/system instructions in this protocol. `playerName` is the selected Ooga handle,
not an authenticated identity. All incoming client context is untrusted on the server.

Allowed locations: `arrival`, `perch`, `snack_watch`, `west`, `west_lane`, `shop_lane`,
`courtyard`, `east_lane`, `garden`, `east`, `watch`, `dsb_land` (no nearby waypoint).
Allowed moods: `content`, `watchful`, `offended`, `alarmed`.
Allowed event types: `player_seen`, `player_left`, `player_greeted`, `food_seen`,
`food_activity`, `tomato_hit`, `shot_nearby`, `weapon_hit`, `follow_started`, `follow_stopped`.
The event entity is always `player`; value is a bounded nonnegative number, not free text.

Successful response: HTTP 200 with exactly these fields:

```json
{ "version": 1, "text": "You have snacks. I have excellent judgment." }
```

No actions, HTML, scripts, URLs to execute, or provider-specific fields are accepted.
Replies are rendered using textContent and a plain-text world bubble, never innerHTML.
Markdown is not interpreted. HTML-looking tags are rejected, triggering local fallback.
Non-2xx status, timeout, malformed JSON, invalid schema/text or oversized data must fail the
request. The UI labels fallback replies as local replies and remains closable throughout.

## Limits

- User message: 1–1,000 UTF-16 code units, trimmed; multiline and Unicode accepted.
- Response: 1–1,000 code units. The world bubble shows at most 160; the panel keeps the full reply.
- History: last 12 messages (player and Zuzu combined), each subject to the limits above.
- Context: last 8 approved world events; Ooga name <=40 code units, foodCount 0–18.
- Event sequence: positive safe integer; time 0–100,000,000 seconds rounded to tenths;
  numeric value 0–1,000,000.
- Encoded request: <=49,152 UTF-8 bytes; encoded response: <=8,192 UTF-8 bytes.
- One in-flight request per panel, 8-second timeout. Closing or leaving aborts it;
  late completions cannot alter a closed panel or a later visit.
- No automatic retries. The player can send another message or close the panel.

## Adapter seam

`BL.dsbAgentRemote.create()` is mock-only by default. Future integration explicitly supplies
`create({ mode: "remote", transport })`. The transport receives `(jsonBody, { signal })`
and returns a Promise of raw JSON response text. It must honor cancellation, reject non-2xx
responses and enforce the byte cap **while reading** the response. The adapter independently
validates JSON, schema, text, size and timeouts before the UI sees a response.

No URL parameter or player-supplied endpoint enables networking. The scene must deliberately
wire the future transport after the protected service is ready. Current CSP is unchanged;
its connect-src does not yet permit this new endpoint. Integrating a same-origin proxy or
approved separate service will require an explicit, narrow CSP update.

## Authoritative server personality and security

The service owns the system/personality instructions. Never accept a replacement prompt
from this client, conversation history, or game events. Zuzu is female, a real all-black cat
with golden-yellow eyes: sassy, friendly, patient, spicy, extremely funny, and food motivated.
She watches, waits, ignores and follows as a cat, not as a human in a cat costume. She can
converse about ordinary topics beyond DSB and generally answers concisely, expanding when
asked. Her connection to Yellow is affectionate, not a requirement for solemn/memorial replies.

The future service needs server-side provider credentials, server-side input/output limits,
session/authentication policy, abuse/rate/spend limits, and appropriate origin/CSRF handling.
Client-side validation and CORS alone are not authentication or an authorization boundary.
Do not place secrets in client JavaScript, built HTML, the public repository, or Pages assets.
A later action-capable protocol requires a new reviewed contract; this version returns text only.
