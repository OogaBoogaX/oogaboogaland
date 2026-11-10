# Cave connection submission template

Copy this into the independent land's repository and replace every placeholder.
Follow the proposed [connection contract](../cave-connections.md). This is a
review document, not a manifest that OBL currently discovers or executes.

## Project

- Name and one-sentence description:
- Public repository and responsible GitHub account:
- License and source revision (full commit SHA):
- Production origin, entry URL and one representative deep link:
- Run/build instructions and deployment owner:
- Mode: independent land (separate origin) or integrated OBL scene:
- Requested parent/placement; leave physical slot unassigned until agreed:
- Proposed existing OBL return route:

## Minimal independent repository

```text
README.md                  Run/build, ownership, release and support instructions
LICENSE                    Applicable source and asset licenses
cave-connection.json        Proposed public metadata, reviewed manually
public/index.html          Standalone entry; works without an OBL visit
public/style.css           Local styling
src/                       The land's own optional source and assets
```

No runtime or dependencies are required for the link boundary. A minimal
`public/index.html` starts with a reachable return link and no scripts:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'">
  <title>Example land</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <main>
    <h1>Example land</h1>
    <p>This is an independent site. Your OBL account and game state are not imported.</p>
    <a href="https://oogabooga.land/" rel="noopener noreferrer"
       referrerpolicy="no-referrer">Return to Ooga Booga Land</a>
  </main>
</body>
</html>
```

A minimal `public/style.css`:

```css
body { margin: 0; font: 1rem/1.5 system-ui, sans-serif; background: #fff; color: #17251c; }
main { max-width: 42rem; margin: 0 auto; padding: 1.5rem; }
a { display: inline-block; padding: .75rem; color: #164e9a; }
a:focus-visible { outline: 3px solid currentColor; outline-offset: 3px; }
```

Add the land's own runtime deliberately, with local assets and a narrowly scoped
content policy. Document new network destinations and permissions. This entry
page is only a navigation starter; it supplies no renderer, Ooga, SSO or voice.
Use a separate origin with its own credentials and storage. Do not share OBL's
cookie scope, Worker bindings or service-worker control.

## Proposed metadata

```json
{
  "schema": 1,
  "id": "example-land",
  "name": "Example land",
  "description": "A short public description.",
  "repository": "OWNER/REPOSITORY",
  "maintainer": "GITHUB-LOGIN",
  "kind": "external",
  "entryUrl": "https://example.invalid/",
  "returnUrl": "https://oogabooga.land/",
  "placement": { "parent": "bifrost", "slot": null },
  "status": "proposed",
  "reviewedRevision": null
}
```

The example stays unlaunchable: `example.invalid` is not a real destination,
`reviewedRevision` must become a verified full commit SHA, and `slot: null`
reserves nothing. Proposed field limits for the eventual validator: ID 1–48
lowercase letters/digits/hyphens, name 1–64 characters, description 1–240,
repository in GitHub `owner/repo` form, maintainer a public GitHub login, and URLs
at most 2048 characters. Accept HTTPS only, with no credentials or arbitrary
query/fragment payload; host and path changes require review. External entries
have `kind: "external"`; integrated scenes continue through the existing scene
registration process rather than this external record. Unknown fields/versions
must be reviewed before enabling. Do not include personal contact details,
visitor identifiers, API keys, deployment secrets or mutable remote scripts.

## Data and operation review

- List every network origin, purpose, data sent and activation condition:
- List local/server storage, retention and deletion behavior:
- Confirm no OBL identity, cookies, credentials, pose, inventory, chat or voice is imported:
- Explain sign-in, microphone or payment flows if the independent land has them:
- Describe page-hide disposal, back/forward-cache restoration and interrupted startup:
- Explain unavailable/retired behavior and how destination/ownership changes are reviewed:

## Submission evidence

- [ ] Mainland maintainers agreed the mode, directory/physical placement and return route.
- [ ] Repository, operator, release revision and destination match this record.
- [ ] Direct entry, deep link and reload work independently of OBL.
- [ ] The return link works without an opener, passed token or dynamic return URL.
- [ ] Navigation does not add OBL state to the destination URL or send a referrer.
- [ ] No remote code or live preview is fetched by OBL before an explicit visit.
- [ ] Keyboard, phone/touch, cancel, repeated activation, Back/Forward and failed loads are covered.
- [ ] Leaving stops the previous client's active work, voice and connections; cached restoration is checked.
- [ ] Measured boot/runtime cost and repeated-visit results are attached with revisions and conditions.
- [ ] Tests run are named; unrun, blocked or physical-device checks are listed separately.
- [ ] An OBL integration PR implements and validates the listing before it is enabled.

Unresolved decisions and missing evidence:

Approval of this template does not publish a site, enable a listing, accept a new
service agreement or authorize OBL account/state sharing.
