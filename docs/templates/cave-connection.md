# Cave connection submission template

Copy this into the independent land's repository and replace every placeholder.
Follow the [connection contract](../cave-connections.md). OBL does not discover
or execute this file remotely: submit its reviewed entry to the registry in
`src/js/cave-directory.js`. The build validates it and the directory renders it.

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
cave-connection.json        Public connection entry to submit in an OBL PR
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

## Registry entry

```json
{
  "id": "example-land",
  "name": "Example land",
  "description": "A short public description.",
  "repository": "OWNER/REPOSITORY",
  "url": "https://example.invalid/",
  "status": "open"
}
```

Replace the placeholder hostname before submitting. Add the approved object to
`registry.entries` in `src/js/cave-directory.js`; the enclosing registry already
has `schema: 1`. This puts the land in the ₿IFRÖST directory at the stable ID
without allocating a physical cave or changing NPC work. The field names must
match exactly. No remote manifest fetch or runtime registration call is needed.

The build accepts at most 64 entries. IDs have 1–48 lowercase letters/digits
separated by single hyphens; names 1–64 characters; descriptions 1–240; GitHub
`owner/repo` strings 1–140; and canonical HTTPS URLs at most 2048 characters.
No blank, padded or control-character text, duplicate IDs, extra fields,
credentials, custom ports or URL query/fragment payloads. Use the final canonical
URL, including its trailing slash when it is an origin root. Paths may deep-link
to the independent site's own places. Status is `open`, `unavailable` or
`retired`; the last two have no travel link. Unapproved proposals stay outside
the runtime registry. A live URL is not a code-release approval; record the
reviewed source revision, operator and evidence in the PR, not a fake revision
in the directory. Do not add visitor data, API keys or deployment secrets.

## Data and operation review

- List every network origin, purpose, data sent and activation condition:
- List local/server storage, retention and deletion behavior:
- Confirm no OBL identity, cookies, credentials, pose, inventory, chat or voice is imported:
- Explain sign-in, microphone or payment flows if the independent land has them:
- Describe page-hide disposal, back/forward-cache restoration and interrupted startup:
- Explain unavailable/retired behavior and how destination/ownership changes are reviewed:

## Submission evidence

- [ ] The OBL PR identifies the external boundary, directory placement and fixed return link.
- [ ] Repository, operator, release revision and destination match this record.
- [ ] Direct entry, deep link and reload work independently of OBL.
- [ ] The return link works without an opener, passed token or dynamic return URL.
- [ ] Navigation does not add OBL state to the destination URL or send a referrer.
- [ ] No remote code or live preview is fetched by OBL before an explicit visit.
- [ ] Keyboard, phone/touch, cancel, repeated activation, Back/Forward and failed loads are covered.
- [ ] Leaving stops the previous client's active work, voice and connections; cached restoration is checked.
- [ ] Measured boot/runtime cost and repeated-visit results are attached with revisions and conditions.
- [ ] Tests run are named; unrun, blocked or physical-device checks are listed separately.
- [ ] The registry build/unit checks and focused directory browser checks pass.

Unresolved decisions and missing evidence:

Approval of this template does not publish a site, enable a listing, accept a new
service agreement or authorize OBL account/state sharing.
