<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Retire the scripts/worktree fork of giwt (migration, not deletion)

**Summary:** `scripts/worktree/` is a forked duplicate of `giwt`, not the "thin shims" the docs claim. It is compiled by the `typecheck - scripts` gate, has 123 passing tests, and a documented external consumer in the release process. Retiring it is a migration with a blocking dependency, not a deletion.
**Context:** `giwt` is the canonical worktree CLI in `package.json`, but the in-repo fork was never removed and its `rebase.ts` shares the missing already-contained guard filed upstream as giwt issue `8dc674e`.
**Acceptance Criteria:** `credentials.mjs` ported or its documented invocation replaced; `tsconfig.scripts.json`, `knip.json`, `oxlint.config.ts`, and `eslint.config.mjs` entries updated; the three docs claiming "thin shims" corrected; `bun run check` green.

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Tags:** worktree, migration

## Context

`giwt` is now the canonical worktree CLI for loop-lore (`package.json` routes every
worktree command to it, and it is a `github:flakusha/giwt` dependency), but the
in-repo `scripts/worktree/` fork was never removed. Repo docs describe it as "thin
shims over giwt"; measurement shows it is a live, compiled, tested fork. The guard
gap filed upstream as giwt issue `8dc674e` exists in both copies.

## Summary

`scripts/worktree/` is a **forked duplicate** of `giwt`, not a set of thin shims as
the documentation claims. It is live, compiled, and tested code. This ticket records
what retiring it actually requires, because the current docs understate the work and
a naive "it's dead, delete it" would be wrong.

## Correction to the existing docs

`AGENTS.md` L331-333, `docs/meta/workflow.md` L70-73, and `CONTRIBUTING.md` L88 all
describe `scripts/worktree/` as "thin shims over `giwt`". Measured reality:

- **It is compiled.** `tsconfig.scripts.json:10` includes `scripts/worktree/**/*.ts`,
  so the `typecheck - scripts` gate type-checks all 56 files. Deleting it changes
  gate scope, it does not just remove unused code.
- **It is tested and green.** `bun test scripts/worktree/` = **123 pass / 0 fail**
  across 13 test files.
- **It has a documented external consumer.** `docs/meta/release-process.md` L71-79
  documents `eval "$(bun run scripts/worktree/utils/credentials.mjs)"` as the
  canonical way to load signing credentials for release tagging, and states giwt
  does not expose a credentials loader.
- **It has a spawned fixture.** `finalize-lock-fixture.ts` is spawned by path from
  `finalize-lock-cleanup.test.ts` (knip exemption at `knip.json:124-128`), so it is
  not statically traceable.
- **No `package.json` script invokes it.** That part is true: no `"scripts/worktree"`
  entry exists, and every worktree command in `package.json` delegates to `giwt`.

## Divergence surface

Files in the fork with no `giwt` counterpart:

| file | note |
| --- | --- |
| `index.mjs` | 15 lines, the documented legacy entrypoint |
| `index.ts` | 306 lines, the real dispatcher (the `.mjs` is a stub) |
| `commands/commit-branch.ts` | superseded upstream by `commands/commit-wt.ts` (renamed) |
| `finalize-lock-fixture.ts` | has no giwt equivalent at this path |

Capabilities `giwt` has that the fork lacks: `clean`, `commit-wt`, `doctor`, `plan`,
`runs`, `worktree-registry`, and utils `credentials`, `errors`, `runlog`, `scratch`,
`settings`.

## Behavioral differences that already bit

`scripts/worktree/commands/rebase.ts:73-76` shells out to bare
`git -C <wt> rebase <target>`. `giwt` routes through
`rebaseWithPlanReconciliation` (`src/plan/reconcile-conflicts.ts:208`), which
auto-resolves generated-file conflicts. That difference is why rebasing a stale
branch in loop-lore wedged on add/add conflicts in `.plan/tickets/index.json`,
which only `giwt` can resolve.

Both implementations share a **missing already-contained guard** — no
`merge-base --is-ancestor` precondition — which is how a stale rebase compounds
into duplicate empty-diff commits. Filed upstream as giwt issue `8dc674e`. The fork
needs the same guard until it is retired.

Other divergences worth noting before deleting: the fork's `isProtected` hardcodes
`["master","main","stg","dev"]` while `giwt` reads
`config.settings.branches.protected` from the layered TOML schema.


## Backport landed while this ticket stayed open (2026-09-29)

The fork fell three fixes behind upstream and was brought current in place,
rather than left to rot until retirement:

- `utils/git.ts` gained `isolatedGitEnv()` (closes the isolated-env BUG), wired
  into `gitSync`/`gitSyncQuiet` and the git-child spawns in `finalize.ts` and
  `rebase.ts`. Test: `scripts/worktree/utils/git.test.ts` seeds
  `GIT_INDEX_FILE` and asserts the child resolves against `repoRoot`.
- `commands/finalize.ts` replaced the fixed 20ms lock retry with full jitter
  (closes the lock-jitter FIX). Test: two contender schedules in
  `finalize-lock-cleanup.test.ts`.
- `commands/rebase.ts` no longer falls back to the literal `master` when the
  main checkout is detached, and refuses a self-rebase up front. Test:
  `commands/rebase.test.ts`.
- `commands/finalize.ts` carried the same detached-HEAD fallback for its merge
  target, via the shared `getRootBranch`. Found while reviewing the rebase fix,
  not named in the original report — but the outcome is worse, since finalize
  *merges into* the fallback branch rather than rebasing onto it. The guard now
  resolves the target directly and refuses when detached. Test:
  `commands/finalize-target.test.ts` (mutation-checked: with the fallback
  restored, finalize exits 0 and merges the feature into `master`).
  `getRootBranch` keeps its `|| "master"` fallback for its display-only
  callers (`diff.ts`, `getStatus`); only the mutating caller was changed.
- Docs claiming "thin shims" corrected: `AGENTS.md`, `docs/meta/workflow.md`,
  and the `docs/giwt-scripts-map.md` keep-vs-wrap table.

Upstream deliberately **not** mirrored: `giwt rebase` refuses a protected
*target*, which with `branches.root = dev` and `dev` in
`branches.protected` breaks the documented `giwt rebase <branch>` (no `onto`)
on a default config. The fork refuses protected sources only.

These are divergences closed, not widened — but they are also new code the
retirement has to reconcile, so they do not reduce this ticket's scope.

## Acceptance Criteria

- [ ] `scripts/worktree/utils/credentials.mjs` is either ported to `giwt` (the
      documented release-process blocker) or `docs/meta/release-process.md` is
      updated to the replacement invocation
- [ ] `finalize-lock-fixture.ts` is relocated or confirmed unnecessary against
      `giwt`'s finalize tests
- [ ] `tsconfig.scripts.json:10` include narrowed, and the `typecheck - scripts`
      gate re-run to confirm scope
- [ ] `knip.json` exemptions for `scripts/worktree/index.mjs` (L9) and
      `finalize-lock-fixture.ts` (L128) removed
- [ ] `oxlint.config.ts:31` ignore entry removed
- [ ] `eslint.config.mjs:384` `scripts/worktree/**/*.mjs` rule block removed
- [x] `AGENTS.md`, `docs/meta/workflow.md`, and the `docs/giwt-scripts-map.md`
      keep-vs-wrap table updated to drop the "thin shims" claim
      (`CONTRIBUTING.md` L88 only linked the map; no claim of its own)
- [ ] `scripts/check-parallel.mjs:245` comment updated (it documents the
      `tsconfig.scripts.json` scope rationale that changes here)
- [ ] `bun run check` green

## Notes

Do **not** delete this directory as cleanup. It is compiled, tested, documented, and
has an external consumer. The retirement is a migration, and the credentials loader
is the blocking dependency — `giwt` has no equivalent, so that gap must close first.

Independently: `bun run test:unit` scopes to `src/` only, so these 13 test files
never run in CI despite being green. That is a real coverage gap and a separate
concern from retirement.
