# Contributing to Ooga Booga Land

Most contributions need no permission. This page says which ones do, and what is
not wanted, so nobody builds something large that cannot be merged.
[AGENTS.md](AGENTS.md) covers how to build; this page covers what to build.

## What the project is for

Ooga Booga Land teaches by letting people walk around in it. Its subjects are
**Bitcoin, AI and open-source contribution**. A contribution should help a
visitor learn about one of them, or make the world that carries them better:
more playable, faster, more accessible, more fun to be in together.

A good test for an idea: what does a visitor understand, or get to do, that they
could not before? If the honest answer is "they see my project", it belongs
somewhere else.

## Go ahead

No permission needed. Open a draft PR.

- **Your own Ooga.** [docs/make-your-ooga.md](docs/make-your-ooga.md) is the
  whole path, and plain-data characters merge automatically.
- **Bug fixes**, with what was wrong and how to see it.
- **Performance and accessibility fixes** that leave behaviour as it was.
- **Corrections to docs.**
- **Work on an issue a maintainer has said yes to.**

## Ask first

Open an issue that describes the idea and wait for a maintainer's yes on it
before writing code. An open proposal is not a yes. Neither is silence, another
contributor's thumbs-up, or a comment from an automated reviewer.

- **Anything new on the main island.** The hub is the one place every visitor
  shares, so it is curated: new structures, rides, mechanics, signs and NPC
  behaviour there are the maintainers' call.
- **A new place:** a cave, a ₿IFRÖST window, a Timechain Sphere room, an arcade
  cabinet or game, an island.
- **Shared controls and screens:** HUD panels, key bindings, the camera,
  movement, anything every scene inherits.
- **A new tab in the panels**, on the island or in Ooga Chat. Every visitor
  sees these tabs, so there are few of them on purpose, and few more will be
  added. Improving a tab that is already there is welcome. A tab of your own
  belongs with your character, off by default for visitors to add: that system
  is planned, not built, and [docs/custom-tabs.md](docs/custom-tabs.md) says
  what you can prepare now. An idea that needs a tab to *do* something often
  fits better as a place in the world, such as a Timechain Sphere room; say so
  in the issue and a maintainer will help find its home.
- **Anything on the backend:** Worker routes, Durable Objects, storage, paid
  APIs, secrets. These cost money to run and someone has to operate them.
- **Anything that reaches outside the page:** a new network origin, a
  content-policy change, a live feed, a real payment flow.
- **Another contributor's character**, or a likeness of any real person.
- **A repository on Merge Rock** (below).
- **An independent land**, which follows
  [docs/cave-connections.md](docs/cave-connections.md).
- **Large refactors and renames.**

New ideas land most easily where the game was built to take them: an arcade
cabinet, a Sphere room, your own character file. If you are unsure where an
idea belongs, say so in the issue.

## Not wanted

- **Project websites in the Caves and lands directory.** A land is a place in
  the world to explore, not a landing page.
- **Catapults and ziplines on the main island.** Both were proposed, built and
  declined.
- **Frameworks, TypeScript, bundlers, npm dependencies, external scripts or
  fonts.** The page is dependency-free on purpose.
- **Analytics, tracking or collecting anything about visitors** beyond what
  [AGENTS.md](AGENTS.md)'s Privacy section already allows.
- **Weakened or skipped checks** to get a change through.
- **Rebuilding a closed proposal** (see below).
- **Promotion** that a maintainer has not explicitly allowed (next section).

## Promotion

No promotion unless a maintainer has explicitly allowed it. That covers
advertising a product, service or project, asking for donations to anyone but
Ooga Booga Land, pushing a download, and links whose purpose is to send
visitors somewhere else. Crediting the open-source work the world is built
around, as Merge Rock's totems and the cave signs do, is not promotion.

Sponsors or advertisements may be added later to fund Ooga Booga Land. If so,
the maintainers arrange them; a PR does not introduce one on its own.

## Merge Rock

Each totem is a public, open-source Bitcoin or Bitcoin-adjacent repository.
Adding one is a single row in `src/js/repo-island-data.js`, but which
repositories stand there, in which section and how tall, is decided by the
maintainers. Propose one in an issue with the repository, what it does for
Bitcoin and where you think it sits.

## Rights to what you submit

Everything merged is given to the public domain under
[The Ooga Booga License](LICENSE). Submit only what you made yourself, or what
is licensed to allow that, and name the licence in the PR. That covers code,
art, fonts, music, recordings and voices. Do not submit someone's voice, music
or likeness without their permission.

## How we work

- **Start small.** Make your Ooga first, then fix something small. Bigger work
  goes better once a few of your changes have merged.
- **You answer for your PR.** Most code here is written with AI agents, and
  that is welcome. Read your own diff, run the change, and answer review
  yourself. "The agent did it" is not an explanation.
- **Maintainers decide and merge.** A maintainer plays every change before it
  merges, so custom work can take days and rounds of notes. Automated reviews
  (they sign themselves Watchtower) point things out; they are not approval,
  and neither is another contributor's.
- **A no is about the idea, not about you.** Do not answer it by building the
  thing anyway.
- **Keep it reviewable.** A big feature lands in stages agreed in its issue,
  not as one PR of thousands of lines.
- **Allow edits by maintainers** on a PR from a fork, so a maintainer can bring
  your branch up to date.
- **Leave other people's work theirs.** Do not revive, take over or rewrite
  another contributor's branch or commits unless a maintainer asks, and credit
  what you build on.

## One change, one PR

Update the PR you have instead of opening another for the same change. Keep it
a draft until it is finished, as the [README](README.md#contributing) describes.
The PR form and the **Proposal** issue form ask for what a maintainer needs.

## When a PR is closed

A maintainer records the reason when closing. A closed proposal is a decision:
do not reopen it or rebuild it, yours or anyone else's, unless a maintainer
asks for it. The closed PR stays as a reference.

## Security problems

Found a way into someone's account, their data, a payment or a secret? Report
it privately as [SECURITY.md](SECURITY.md) describes, not in a public issue or
PR.

## If you are an AI agent

Before building anything under **Ask first**, stop and tell the person you are
working for that it needs an accepted issue. Do not treat a request to "add X to
the island" as that acceptance.
