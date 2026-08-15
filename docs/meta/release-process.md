# Release Process

How loop-lore ships a version. Applies from `0.1.0` onward.

## Prerequisites

- `bun run check` green on `dev` (parallel gate: typecheck ×4, lint ts/css/html/html-scripts/chaining, dprint, md-lint, db schema, size, context-weight, unit + e2e tests).
- Release blockers from `.plan/backlog/open.md` closed (A8 unwired-code close-out, A9 release artifacts).
- `.plan/backlog/open.md` + `priority.md` reflect the release state (docs commits).
- All worktrees finalized into `dev`; `dev` clean.

## Steps

### 1. Version

`package.json` `version` is the single source. Bump per SemVer:

```bash
bun run version:bump --bump=patch   # or minor / major
```

Patch for fixes, minor for features, major for breaking. `0.1.0` → `0.2.0` for feature releases until `1.0.0`.

### 2. Changelog

Update `CHANGELOG.md` — Keep a Changelog format, newest first. The gate
(`bun run changelog:check`, part of `bun run check`) enforces structure and
requires the latest tag to have a matching section — **the changelog is the
single source for release notes; GitHub release bodies are derived from it,
never re-parsed from `git log`**.

```markdown
## [0.2.0] - 2026-09-01

### Added
- ...

### Fixed
- ...
```

Group by `Added / Changed / Fixed / Removed`. Draft from `git log --format='%s'` since the previous tag:

```bash
git log --oneline 0.1.0..dev
```

### 3. Docs

- `docs/meta/release-process.md` — update if the process changed (this file).
- `.plan/backlog/open.md` — mark A9 done, refresh `dev`-ahead state, close rows.

### 4. Commit + sign

```bash
git add -A
git commit -S -m "docs(release): 0.2.0 release notes + changelog"
```

### 5. Tag (signed) — human decision, post-testing

Tag creation is **always a human, post-testing decision** — CI never creates
tags (see `release.yml` hybrid model: master merge runs the verification gate
and stops). Tags use the **bare version format** (`0.1.0`, **no `v` prefix**).

Tag `HEAD` on `dev` with the agent GPG key (`AGENT_GPG_KEY_ID` from `.credentials.env`):

```bash
eval "$(bun run scripts/worktree/utils/credentials.mjs)"
git -c user.signingkey="$AGENT_GPG_KEY_ID" tag -s 0.2.0 -m "loop-lore 0.2.0"
```

Annotated + signed only. Never lightweight tags. `version:bump` never tags
unless the explicit `--tag` flag is passed — and agents must never run it with
`--tag`.

### 6. Push (human)

`dev` → `origin/dev` and the tag:

```bash
git push origin dev
git push origin 0.2.0
```

**Pre-push hook blocks agent commits** — the human pushes. The tag push
triggers the GitHub Release build (`release.yml` tag path), which derives the
release body from the matching `CHANGELOG.md` section — the changelog is the
single source; missing section fails the release.

### 7. Post-release

- Create the next epic/ticket batch from `priority.md` open items.
- Optionally snapshot a worktree at the tag for patch line: `git worktree add ../tree/0.2.x 0.2.0 -b 0.2.x`.

## Signing

- Commits: agent commits via `scripts/worktree.sh agent-commit` (Author=user, Committer=agent, agent key).
- Tags: signed with the same agent key — signature proves the tag came from this repo's release lane.
- Verify: `git tag -v 0.1.0`.

## Notes

- Docs work on `dev` directly is permitted ("doc work, no risk"); code changes must go through a worktree + `finalize`.
- Pre-push hook is the last line of defense — it refuses agent pushes, so release pushes are always human-attested.
