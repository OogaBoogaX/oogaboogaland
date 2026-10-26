# Totem feed through the Worker (task 4.7)

On the Cloudflare site the four repository totems now read `/api/totems/0` to `3` from the page's own Worker instead of 100-PR pages from api.github.com. The Worker (`worker/src/totems.js`) scans the same closed-and-updated pages for the newest main/master merge in the last day, keeps a six-minute summary in the Cache API, reuses GitHub's page ETags, shares a spent limit across the four repositories until its reset, refuses after 20 pages with a cached small 503, and answers `{ repo, number, mergedAt }` with an ETag and `max-age=90`. Only the four fixed repositories and GET are accepted, and no secret or binding is added. The page keeps its poll order, its 90 s rotation, its visibility rule and its first reading that never celebrates.

Compared with the saved handoff patch: a 304 now matches weak and listed ETags, as HTTP requires and as Cloudflare's compression produces; any non-JSON reply other than 304 (an HTML 404, 403 or 5xx from a static host) sends the page to GitHub directly for good, as before this change. A Worker answering 403, 429 or 503 sends only that poll to GitHub directly, and its limit is not taken as the page's own: behind the Worker every visitor shares GitHub's 60 unauthenticated requests an hour on Cloudflare's addresses, so a spent shared budget must not darken the totems for everyone.

| Per poll | Direct GitHub | Through the Worker |
|---|---:|---:|
| Body, bitcoin/bitcoin page 1 | 2,097,380 B (244,834 B gzip) | 66 B |
| Revalidated poll | full page again | 304, 0 B body |

In ARM64 Chrome against local Wrangler (`--local`, nothing deployed), the hub fetched the four summaries (66–75 B bodies, 380–395 B transferred), lit all four totems, got a 304 on its next poll and kept a clean console; a `file:` page read GitHub directly with the same result. A new global-tier check runs the real `totem-feed.js` against a fake fetch: the first reading is quiet, a 304 keeps its value, a newer merge is fresh, an HTML 404 and a `file:` page read GitHub, and a limited Worker sends one poll to GitHub without setting the page's limit. Worker tests 107/107, unit 270/270.

For the maintainer: the Cache API is per data centre, so a scan is shared within one location, not worldwide, and on `*.workers.dev` (staging) it may not cache at all; the public route has no rate limiter of its own; a new merge can now take up to the six-minute cache plus the rotation to light. An optional read-only `GITHUB_TOKEN` secret would lift the shared budget to 5,000 an hour. Not measured: the real edge, real 403/429 replies and the 20-page cap (mocked in the Worker tests). Raw rows: `untracked/performance/evidence/performance-loading-4-7-evidence.json`.
