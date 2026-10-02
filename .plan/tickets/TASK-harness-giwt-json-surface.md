<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness giwt JSON surface (reads + conflicts)

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** One command usable identically by human (pretty) and agent (`--output json`): thread the flag through read-only issue commands, add `giwt conflicts`, `giwt prs diff/checkout`, `#extid` shorthand. giwt/gh/git do the work; repo adds only formatting.
**Context:** `index.ts extractOutputFlags` parses `--output simple|pretty|json|jsonl|toml` and `output.ts log()` honors it, but sampled read payloads (`show.ts`, `prs.ts`) go via `console.log` bypassing the envelope. merge/rebase/finalize fail with bare resolve-in-path messages; marker listings exist only ad-hoc (`finalize.ts checkDevMergeable` ls-files --unmerged, `abort.ts` diff-filter=U).
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] `giwt conflicts [branch|path] [--output json]`: wrap `git diff --name-only --diff-filter=U` + marker scan emitting `#N path Lx-Ly` + ours/theirs/base side-presence (omp shape minus session-history); wired into merge/rebase/finalize failure paths. Reuses isolatedGitEnv, findWorktreeForBranchSync, output.ts helpers.
- [ ] show, search, issues, diff, status, branches, report emit structured payloads when the global flag is set; default stays human.
- [ ] `giwt prs diff N [--output json]` + `giwt prs checkout N` (wrap `gh pr diff`, single-PR worktree add reusing prs.ts loop body). OUT: pr_create/pr_push (human merge governance), run_watch (passthrough doc).
- [ ] `#extid`/`#hash-prefix` accepted by `resolver.ts resolveExtid`, rendered as links in show, added to plan-validate links-gate; `@` stays actor-scoped, documented once in workflow.md. NOT adopted: @path macros, semantic find, checkpoint/rewind, fullscreen git TUI.

## Related Files

- `scripts/worktree/` (`index.ts:234-268`, `output.ts`, `commands/show.ts`, `search.ts`, `prs.ts`, `diff.ts`, `merge.ts`, `rebase.ts`, `finalize.ts`, `abort.ts`, `resolver.ts`)
- `src/group-chat/mention-parser.ts` (@ collision doc), `docs/meta/workflow.md`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*
