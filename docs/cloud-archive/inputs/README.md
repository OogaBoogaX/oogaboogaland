# Cloud Archive · generation inputs

The snapshot `src/js/cloud-archive-data.js` is generated from the official `rock` at
`37d9f3947bbff844f792595471e3eb99ab13e7f9` and these saved inputs, so it can be regenerated exactly.

| File | What | How it was saved |
|---|---|---|
| `pull-refs-37d9f39.txt` | The PR heads GitHub published (324 refs, read 2026-11-01 02:29 UTC). PR-head matches depend on this snapshot as well as on the revision | `git ls-remote https://github.com/OogaBoogaX/oogaboogaland 'refs/pull/*/head' > pull-refs-37d9f39.txt` |
| `github-authors-37d9f39.ndjson` | GitHub's own author record for each commit: `{sha, login, id, type}`, with `login` null where GitHub links the commit to no account. Only those four fields are kept; no names or addresses | See below |

Save the author records where the GitHub CLI is signed in. Run this from the repository root, as one command:

```sh
gh api --paginate "repos/OogaBoogaX/oogaboogaland/commits?sha=37d9f3947bbff844f792595471e3eb99ab13e7f9&per_page=100" --jq '.[] | {sha: .sha, login: .author.login, id: .author.id, type: .author.type}' > docs/cloud-archive/inputs/github-authors-37d9f39.ndjson
```

Then regenerate:

```sh
npm run archive -- --rev 37d9f3947bbff844f792595471e3eb99ab13e7f9 --pull-refs docs/cloud-archive/inputs/pull-refs-37d9f39.txt --github-authors docs/cloud-archive/inputs/github-authors-37d9f39.ndjson
```

The script refuses a records file that misses any commit at that revision. The records were saved 2026-11-01 03:52 UTC
(digest `17e2ac95…8067e0`): 2,029 commits, 2,022 linked to a GitHub account and 7 not. The committed snapshot is
generated from them (`provenance.authorRecords.mode` is `github`); regenerating with the command above reproduces it,
apart from the read times taken from the files.
