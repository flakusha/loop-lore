<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: giwt issues gains --state open|closed|all filter

**Status:** Done
**Priority:** low
**Effort:** Small
**Epic:** epic-worktree-plan-tooling.md
**Tags:** worktree-plan-tooling
**Summary:** Forward `git issue ls --state open|closed|all` through `giwt issues` and validate the value.
**Context:** Current switch in `giwt/src/commands/issues.ts:9-25` has no `--state` branch and silently swallows unknown flags (verified: `giwt issues --state=closed` returns 50 open issues).
**Acceptance Criteria:** `giwt issues --state=closed` returns only closed; `--state=open`/`--state=all` honored; default unchanged; invalid values rejected; --all and --format still work.

## Summary

<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# giwt issues gains --state open|closed|all filter

**Status:** Done
**Priority:** low
**Effort:** Small
**Type:** Task

## Summary

`giwt issues` currently accepts only `--all/-a` and `--format/-f`. It does
NOT forward `--state` to `git issue ls`, and worse: it silently swallows
unknown flags. `git issue ls --help` exposes `--state <open|closed|all>`
already, so the fix is a one-line passthrough plus a manual consumer migration (`find-work`).

## Summary

`giwt issues` currently accepts only `--all/-a` and `--format/-f`. It does
NOT forward `--state` to `git issue ls`, and worse: it silently swallows
unknown flags. `git issue ls --help` exposes `--state <open|closed|all>`
already, so the fix is a one-line passthrough plus a manual consumer migration (`find-work`).

## Repro / Current state

- `giwt/issues.ts` (2026-09-26) handles only `--all|-a` and `--format|-f`
  (`giwt/src/commands/issues.ts:9-25`). The `for (let i = 0; i < args.length; i++)`
  switch has no `default` branch, so unrecognized flags (including
  `--state=open`) are dropped without error and consume zero args.
- The slice for the non-`--all` path is hard-coded
  `Math.min(lines.length, 50)` (`giwt/src/commands/issues.ts:36-37`), and
  the non-filtered call is `git issue ls --format <format>`
  (`giwt/src/commands/issues.ts:28`).
- `git issue ls --help` (verified 2026-09-26) supports
  `-s, --state <state>` accepting `open|closed|all` (default `open`).

### Confirmed silent-ignore behavior

```
$ giwt issues --state=closed | wc -l
# shows "issues (50):" followed by 50 open issues
$ giwt issues --state=closed | grep -c '^[^ ]* closed'
# 0 - all lines are "open", not "closed"
```

The user thinks they filtered to closed; they got the default `open`
listing because the flag was silently dropped by the switch. This is a
real correctness bug, not just a UX gap.


## Acceptance Criteria

1. `giwt issues --state=closed` returns **only** closed issues (verified by
   `grep -c closed` count > 0 AND no `open` lines).
2. `giwt issues --state=open` returns only open issues; this is the new
   default (already `git issue ls`'s default).
3. `giwt issues --state=all` returns every issue regardless of state.
4. Default behaviour (no `--state`) is unchanged: first 50 of the default
   `git issue ls` listing (open by default server-side).
5. Unknown values (`--state=banana`) exit non-zero with a clear error
   message: `error: invalid state 'banana' (expected: open|closed|all)`.
6. `--all/-a` still works (bypasses the 50-row slice; compatible with
   the server-side `--state all` semantics).
7. `--format/-f` still works for the oneline/short/full forms.
8. Manual smoke test: `giwt issues` runs cleanly with no args, with
   `--state=open`, with `--state=closed`, with `--state=all`, with
   `--all`, with `--format=short`, and with combined
   `--state=closed --all`.


## Fix shape

In `giwt/src/commands/issues.ts`:

- Add `--state <open|closed|all>` (accept both `--state=X` and
  `--state X` forms, since the existing `--format` parser uses the
  space form).
- When set, pass `--state=<value>` (or `-s <value>`) to the
  `git issue ls` invocation:
  `gitSync(repoRoot, "issue", "ls", "--state", state, "--format", format)`.
  Or, if the user also passed `--all`, drop `--state` and let
  `--all`/`-a` (server-side `same as --state all`) handle it.
- Validate the value against the closed set `{open, closed, all}`;
  reject anything else with an error and exit 1.
- Default `state` is `undefined` (no flag passed), preserving current
  behaviour.

There is no need to change the `Math.min(lines.length, 50)` slice - that
remains the non-`--all` paging cap. State filtering happens server-side.


## Consumer migration

`/home/flak/git-ai/omp-plugins/plugins/oh-my-pi-integration/extensions/commands/find-work.ts`
(per cross-reference O-6 in the scratchpad) currently uses an in-parser
bracket-regex filter as a workaround. Once G-1 lands, change that
consumer to pass `--state=open` to `giwt issues` and drop the regex.
This is tracked separately as ticket O-6 (filed by another subagent).


## Cross-references

- `.tmp/scratchpad-pattern-analysis-2026-09-26.md` 4.1 G-1
- `giwt/src/commands/issues.ts:1-39` (current shape, full file)
- `giwt/src/commands/show.ts` (same worktree, sibling pattern to follow)
- `git issue ls --help` output (2026-09-26): flag is supported natively
- O-6 (separate ticket): consumer-side `find-work` migration


## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

git issue: 4ab6fbe
