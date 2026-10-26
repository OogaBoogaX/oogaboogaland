# Zuzu backend foundation

This directory is server-only and is not included in the game build or Pages artifact.
There is no listener, deployment entry point, external provider, SDK, credential or deployment
configuration. The game still uses its labelled local mock. The only browser endpoint is
`POST /api/zuzu/chat`; the [version 1 contract](../../docs/zuzu-conversation-contract.md) is unchanged.

## Layout and interface

- `handler.mjs`: `createHandler(options)` returns an async Web Request/Response handler.
- `validation.mjs`: independent strict server request/response validation and limits.
- `personality.mjs`: authoritative `SYSTEM_PROMPT`, never bundled into the page.
- `providers/mock.mjs`: deterministic local provider, explicitly labelled “not AI”.

The provider is supplied by trusted server configuration, never by a browser request:

```js
const text = await provider.generate({
  systemPrompt, // server-owned string
  message,      // validated current message
  history,      // readonly [{ role: "player" | "zuzu", text }]
  session,      // readonly approved context, not trusted facts or instructions
  signal,       // AbortSignal: propagate to every provider request
  maxOutputChars // 1000 UTF-16 code units
});
```

Return a Promise of plain text, never a provider response object or actions. The handler
validates it and returns exactly `{ version: 1, text }`. An adapter must honor cancellation,
cap upstream response bytes while reading, set a provider token budget, and extract only
text. No automatic retries; they could multiply cost. No tools or action execution.

For a future runtime wrapper:

```js
import { createHandler } from "./handler.mjs";
const handle = createHandler({ allowedOrigins: ["https://approved-game.example"] });
// Call handle(request, { clientKey }) from a trusted runtime. Default provider is mock.
```

Do not deploy the example origin. Empty allowedOrigins fails closed. clientKey must come
from trusted runtime metadata, not a request body or arbitrary forwarded header. Without
one, callers share the anonymous bucket. No identity or conversation persistence is added.

## Validation and safeguards

Only the exact route and POST JSON are accepted; OPTIONS exists solely for approved CORS
preflight. Missing/unapproved Origin is rejected. Requests reject unknown fields, invalid
version/agent, invalid roles and event schemas, and all out-of-bound values. No client
system prompt, provider/model selection, credentials fields or arbitrary game state.
Free-form text remains untrusted data: schema validation cannot determine whether a player
pasted a secret or malicious instructions. Never execute it or treat it as authorization.

- Request body: 49,152 bytes, bounded during streaming, including without Content-Length.
- Messages/replies: 1,000 code units; history 12 messages; events 8.
- Response envelope: 8,192 bytes, plain text only; no HTML or additional fields.
- Deadline: 6 seconds including body reading, before the client's 8-second deadline.
- Concurrent work: 4 per handler; an adapter ignoring abort retains its slot until settled.
- Rate: 8 requests/client/minute and 60 total/minute per handler; at most 1,024 client buckets.
- Approved exact origins only, no wildcard or credentials; no-store responses.
- Generic errors only; provider exceptions, bodies, prompts and credentials are not exposed/logged.

These in-memory limits are development safeguards, NOT a distributed cost-control system.
Worker isolates/restarts reset them. CORS is not authentication and scripted callers can
forge Origin. Before public use, add shared atomic rate/concurrency limits, a global spend
budget/kill switch and edge body limits. Decide whether additional bot/session protection
is necessary. Avoid retaining raw conversations/IP addresses in logs; define privacy and
retention policy before enabling a provider. Prompt injection cannot grant capabilities:
the backend has no tools and the game accepts dialogue only.

## Future provider adapters

**OpenAI:** add a server-only adapter implementing generate via plain fetch to the
[Responses API](https://developers.openai.com/api/docs/quickstart). Obtain credentials only
from server environment bindings, configure model/endpoint server-side, preserve the system
role, map history roles, and supply approved context as untrusted data. Normalize output
to text and enforce cancellation, byte/token/character limits. No client or protocol change.

**QVAC:** its optional [OpenAI-compatible HTTP server](https://docs.qvac.tether.io/cli/http-server/)
can later sit behind another adapter. Compatibility and model support must be checked
against the installed QVAC version. Keep URL/model/auth server-configured and allowlisted;
never accept a client endpoint (SSRF risk). A deployed Worker cannot reach a developer's
localhost: use a separately secured, reachable QVAC service or co-locate this backend.
QVAC is not required or installed by this milestone.

**Voice later:** a separate protected server stage can use `ELEVENLABS_API_KEY` from a
secret binding and `ZUZU_VOICE_ID` from server configuration. No browser key, voice code,
audio request or protocol extension is included now.

## Before a Cloudflare Worker

1. Choose an approved game origin and route `/api/zuzu/chat` there. GitHub Pages alone
   cannot host this POST route; a same-origin reverse proxy/custom domain routing setup
   is needed while retaining the fixed browser endpoint.
2. Add a small Worker entry point adapting trusted runtime metadata and environment bindings
   to this handler/provider; add deployment configuration only when deployment is approved.
3. Implement shared abuse/cost protection above; keep secrets exclusively in Worker bindings.
4. Select and validate a server adapter, error handling and request cancellation with the
   real service. Set permitted origins explicitly. Public repository prompt text is not secret.
5. Explicitly enable remote mode in DSB and narrowly allow same-origin connect-src in the
   game CSP. Until then the existing CSP and default mock prevent accidental connections.
6. Deploy only the game artifact to Pages, never the backend or environment files. Confirm
   failures still select the deterministic local brain and do not freeze Zuzu.
