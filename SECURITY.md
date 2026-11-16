# Reporting a security problem

Report it privately. Do not open a public issue or pull request for it, and do
not describe it in chat or voice.

## How

Use GitHub's private report form:
[Report a vulnerability](https://github.com/OogaBoogaX/oogaboogaland/security/advisories/new)
(the repository's **Security** tab, **Report a vulnerability**). Only the
maintainers can read what you send there, and they answer in the same place.

## What belongs there

Anything that lets someone do what they should not be able to:

- sign in as, drive or speak as another player, or read their session;
- read or change data in the Worker's database, rooms or stored replays;
- get, forge or redirect a donation or payment;
- run script in another visitor's page, or get past the content policy;
- reach a secret, a token or a credential;
- run up the project's costs or take the site down for everyone.

A bug that only breaks the game for the person who triggers it is an ordinary
issue.

## What to send

What you found, the steps to reproduce it, and what it lets someone do. A small
proof is enough.

## While you look

Test against your own copy (`npm run serve`, or `npm run dev` in `worker/`),
not against the live site or other players. Do not read, change or delete
anyone else's data, and do not run a denial-of-service test against production.

There is no bounty. If you want credit for a fix, say so in the report.
