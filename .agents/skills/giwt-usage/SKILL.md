---
name: giwt-usage
description: >
  Canonical giwt CLI usage for loop-lore: worktree lifecycle, safety-gated
  git passthrough, tickets, observability, and hygiene commands. Trigger:
  any giwt invocation, worktree operation, or raw git rerouting.
version: 1.0.0
author: project-maintainers
license: Apache-2.0
metadata:
  agents:
    tags: [giwt, worktree, git, tickets, finalize, ledger]
    related_skills: [worktree-merge, native-issue, sync-tickets, commit-message]
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# giwt Usage

`giwt` is the canonical worktree / commit / GPG / git-issue CLI for
loop-lore (git dependency `github:flakusha/giwt`, resolved and pinned by
`bun.lock`). `AGENTS.md` takes precedence where the two differ: worktrees
are the default for mutating git, and a direct commit on the dev checkout
needs explicit operator authorization.

## Availability & Pinning

| Invocation                                | Notes                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun node_modules/giwt/src/cli.ts <args>` | Pinned copy — matches `bun.lock`. Repo code that shells out to giwt MUST spawn this path; `scripts/check/parallel/gpg.mjs` shows the deep-path import idiom. |
| `bun run <script>`                        | `plan:*` scripts resolve the pinned copy (`node_modules/.bin` ahead of `~/.local/bin` on PATH).                                                              |
| `giwt <args>`                             | `~/.local/bin/giwt` symlink points at a mutable local checkout; may drift from the locked ref.                                                               |

## Safety-gated git passthrough

The harness reroutes raw `git` invocations to `giwt git` (also callable
directly). Every invocation is classified before git runs:

- Pass: read-only commands and recoverable mutations (for example `git add`).
- Refused: destructive shapes (`reset --hard`, `clean`, force push,
  checkout/restore path discard, `branch -D`, `stash drop/clear`, reflog
  expire, `filter-branch`, `tag -d`, `gc`), GPG bypass (`--no-gpg-sign`,
  `commit.gpgsign=false`, credential or `core.hooksPath` overrides),
  config writes, editor-requiring commits, rebase `--exec` payloads that
  override the pinned identity (`GIT_AUTHOR_*`, `GIT_COMMITTER_*`,
  `user.name=`, `user.email=`, `--author=`), and unknown subcommands.

Full output is captured to the run record (`git-output.txt`); exit code is
git's. Tune via the `git` section of `giwt.toml` (`rtk=auto|on|off`, `safe`,
`allow`, `deny`, `classify=builtin`).

## Worktree Lifecycle

```text
giwt new <branch> [base] [--scope <text>] [--tickets <csv>]
  # branch + worktree under tree/; run from repo root (layout commands
  # reject a tree/* cwd); --scope persists a Scope header; --tickets
  # copies tickets in as In Progress and closes them at finalize
giwt commit [-m <msg>|-F <file>] "type(scope): message" [--on-protected]
giwt commit-wt <branch> [-m <msg>|-F <file>] "message" [--on-protected]
  # GPG-signed commits; --on-protected is required on protected branches
  # (dev included) and is the supported path for an authorized direct-dev
  # doc commit; -F/--message-file for multi-line
giwt rebase <branch> [onto] [--autostash]
  # default onto: root branch (dev); --autostash keeps the stash on pop conflict
giwt merge <target-branch> <source-branch>
giwt finalize <branch> [--merge-strategy rebase|squash|direct]
     [--gates <csv> | --skip-gates <csv>] [--plan-gates <csv>] [--jobs <n>]
     [--force] [--show-ledger] [--prune-dry-run] [--allow-author-override]
  # validate -> signed merge -> remove worktree; agent-merge is an alias
```

`--force` skips gates AND tests and allows a direct merge — never use it
without explicit user direction. `--prune-dry-run` previews only the Step 6a
scratchpad prune; finalize still merges, removes the worktree and deletes
the branch. `--no-verify` and `--allow-author-override` are opt-in escapes
on the commit commands, not defaults.

Recovery and pruning:

- `giwt abort [--dry-run]` — recover a finalize that left dev mid-merge
  (transactional rollback; never deletes user stashes, never resets hard).
- `giwt remove <branch> [--branch-only] [--force]` — drop a worktree or branch.
- `giwt cleanup` — remove stale worktrees for deleted branches.
- `giwt create <branch>` — check out an existing branch as a worktree.
- `giwt prs` — create worktrees for open PRs.

On any giwt failure: STOP and surface the error. Never bypass GPG signing;
never retry with raw git or force flags without explicit user direction.

## Agent Docs Sync

`giwt docs sync-agents [--dir <path>]` mirrors the markdown corpus into a
directory (default `.agents`) as one flat file per doc (`a/b` -> `a->b.md`).
There is no dry-run: every managed file is written. `--dir` must resolve
inside the worktree. Use a scratch `--dir` to inspect output; `AGENTS.md` and
checked-in skills are authoritative — never let a sync overwrite them.

## Command Map

| Group           | Commands                                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status/read     | `list`, `branches`, `status [branch]`, `diff <branch>`, `docs list/show/search/dump/sync-agents`, `history audit/skips/weave`, `lock`                          |
| Tickets         | `ticket`, `issues`, `search`, `show`, `comment`, `attach`, `attach-dir`, `edit`, `state`, `gi` (ticket takes `--label`/`--priority`, not `-l`/`-p`)            |
| Plan/backlog    | `sync [--fix]`, `backlog sync [--fix]`, `plan` (code-map, links, validate, metadata, report, gen-docs, check-links)                                            |
| Observability   | `report [--profile]`, `runs [triage/diff/stats]`, `ledger [--last N] [--json] [--state/--cmd/--branch]`, `gripe --at <branch> <message>`, `verify`, `selftest` |
| Hygiene         | `clean`, `tmp`, `doctor [--apply/check/scratchpad]`, `spdx-check`, `spdx-fix`, `backup`, `intercom`                                                            |
| GPG             | `gpg-unlock` (warm the agent cache before signing runs), `sign <branch>`                                                                                       |
| VCS passthrough | `git`, `jj`, `pijul` — safety-gated; see each command's `--help` for the refusal list                                                                          |
| Prompting       | `task <directive> [-w] [--base <ref>] [--tickets <csv>] [-j <n>] [-a <n>] [-g <gates>] [--strict] [--shallow/--deep] [-s <mode>]`                              |

## Shared Ledger

giwt appends agent activity (commits, finalizes, syncs, failures) to the
shared ledger (`giwt ledger`, with `--last`, `--state`, `--cmd`, `--branch`
and `--json` filters), surfaced in the session receipt; `finalize
--show-ledger` prints the last 10 records before its steps.
`gripe --at <branch> <message>` records a complaint or failure against
another agent's branch — use it to flag finalize failures or coordination
problems instead of silent retries.
