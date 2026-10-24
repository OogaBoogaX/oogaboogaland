# 4.1 — Cache fingerprinted scene chunks

`worker/_headers` now gives `/js/*` the policy `public, max-age=31536000, immutable`. The distribution builder emits only `<group>-<16 hexadecimal SHA-256 digits>.js` files there, so changed code gets a new address. The measurement script verifies every staged filename against its contents before opening Chrome. This also covers the additional fingerprinted groups in open PR #265 without duplicating that PR's deferred-module work.

Cloudflare's `_headers` format supports a wildcard rather than the regular expression shown in the brief. The directory rule fits the current build contract. Existing global security headers remain on every response; HTML and `robots.txt` retain normal revalidation. See [Cloudflare's static asset headers documentation](https://developers.cloudflare.com/workers/static-assets/headers/).

## Before and after

Measured on 23 October 2026 with the repository's locked Wrangler 4.141.0 local assets runtime and native Chrome 155. Five unchanged staged chunks were fetched from a small same-origin document, without evaluating game code. Each run used a fresh temporary Chrome profile, fetched all chunks twice, closed Chrome, then fetched them again from a new browser process using the same profile. No service worker, cache disabling, forced reload, or request interception was used.

| Five chunks combined | Before | After |
|---|---:|---:|
| Cold ResourceTiming transfer size | 1,214,704 bytes | 1,214,704 bytes |
| Repeat ResourceTiming transfer size | 1,500 bytes | 0 bytes |
| Repeat CDP encoded network bytes | 1,680 bytes | 0 bytes |
| Repeat after browser restart, ResourceTiming | 1,500 bytes | 0 bytes |
| Repeat after browser restart, CDP encoded network bytes | 1,680 bytes | 0 bytes |
| Revalidation requests on either repeat | 5 × HTTP 304 | 0 |
| Chunks reported `fromDiskCache` after restart | 0/5 | 5/5 |

The original policy already cached response bodies, but required a network validation on every use. The change removes those validations. ResourceTiming estimates header bytes, while CDP reports the protocol's encoded byte count; both are included so a 304 is never mistaken for a zero-transfer cache hit. Cold CDP bytes are 1,218,364 → 1,218,369 because the changed response header is one byte longer per chunk. The encoded bodies and chunk hashes are identical.

All ten repeat responses after the change have `fromDiskCache: true`, `fromServiceWorker: false`, zero transferred bytes, and no network response status. Both `/` and `/robots.txt` still return `public, max-age=0, must-revalidate`. All five chunks retain `nosniff`, `X-Frame-Options: DENY`, and the original Permissions Policy. There is no visual change.

These results validate the local Cloudflare assets runtime and Chrome's persisted HTTP cache. Production has not been deployed or measured. The complete response headers, content hashes and per-chunk metrics are in [`untracked/performance/evidence/performance-loading-4-1-evidence.json`](`untracked/performance/evidence/performance-loading-4-1-evidence.json`).

## Reproduce

Use the existing locked Worker development tools (`npm --prefix worker ci --ignore-scripts`). Stage the site once with `npm run build:site`, then copy `_site` into a temporary directory so another task's build cannot change it during measurement. Create a temporary Wrangler configuration outside that asset directory:

```json
{
  "name": "ooga-cache-probe",
  "compatibility_date": "2026-10-02",
  "assets": {
    "directory": "./site",
    "html_handling": "drop-trailing-slash",
    "not_found_handling": "404-page"
  }
}
```

With that temporary directory as `--cwd`, run the installed `worker/node_modules/.bin/wrangler dev --config wrangler.json --local --ip 127.0.0.1 --port 8797 --inspector-port 9297 --show-interactive-dev-session=false`. Run the measurement from the repository:

```sh
node scripts/profile-chunk-cache.mjs http://127.0.0.1:8797 <temporary-site-directory> <output.json>
```

For a baseline, remove only the `/js/*` block and its comment from the isolated copy of `_headers`; run the script, restore `worker/_headers` into that copy, wait for Wrangler to reload, and run it again. Each invocation creates its own fresh profile. The script launches only one browser at a time and never opens the game. It removes the profile after collecting the restarted-browser result.

Validation: the measurement script passes `node --check`; both completed cache measurements pass the recorded zero-transfer, persisted-cache and unchanged-content assertions. This host-header change needs no new gameplay test or screenshot.
