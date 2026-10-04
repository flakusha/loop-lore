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
`bun.lock`). `AGENTS.md` takes precedence where the two differ.

## Availability & Pinning

| Invocation                                | Notes                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun node_modules/giwt/src/cli.ts <args>` | Pinned copy — matches `bun.lock`. Repo code that shells out to giwt MUST spawn this path (see `giwtArgv` in `scripts/worktree/commands/sync.ts`). |
| `bun run <script>`                        | `plan:*` scripts resolve the pinned copy (`node_modules/.bin` ahead of `~/.local/bin` on PATH).                                                   |
| `giwt <args>`                             | `~/.local/bin/giwt` symlink points at a mutable local checkout; may drift from the locked ref.                                                    |

## Safety-gated git passthrough

The harness reroutes raw `git` invocations to `giwt git` (also callable
directly). Every invocation is classified before git runs:

- Pass: read-only commands and recoverable mutations.
- Refused: destructive shapes (`reset --hard`, `clean`, force push,
  checkout/restore path discard, `branch -D`, `stash drop/clear`, reflog
  expire, `filter-branch`, `tag -d`, `gc`), GPG bypass (`--no-gpg-sign`,
  `commit.gpgsign=false`, credential or `core.hooksPath` overrides), config
  writes, editor-requiring commits, unknown subcommands.

Full output is captured to the run record; exit code is git's. Tune via
the `git` section of `giwt.toml` (`rtk`, `safe`, `allow`, `deny`).

## Worktree Lifecycle

```text
giwt new <branch> [base] [--scope <text>] [--tickets <csv>]
  # branch + worktree under tree/; run from repo root (layout commands
  # reject a tree/* cwd); --scope persists a Scope header; --tickets
  # copies tickets in as In Progress and closes them at finalize
giwt commit-wt <branch> [message] [-F <file>] [--on-protected]
  # GPG-signed worktree commit; -F/--message-file for multi-line
giwt rebase <branch> [onto]        # default onto: root branch (dev)
giwt merge <target-branch> <source-branch>
giwt finalize <branch> [--merge-strategy rebase|squash|direct]
     [--gates <csv> | --skip-gates <csv>] [--plan-gates <csv>] [--jobs <n>] [--force]
  # validate -> signed merge -> remove worktree; agent-merge is an alias
```

Recovery and pruning:

- `giwt abort [--dry-run]` — recover a finalize that left dev mid-merge
  (transactional rollback; never deletes user stashes, never resets hard).
- `giwt remove <branch> [--branch-only] [--force]` — drop a worktree or branch.
- `giwt cleanup` — remove stale worktrees for deleted branches.
- `giwt create <branch>` — check out an existing branch as a worktree.
- `giwt prs` — create worktrees for open PRs.

On any giwt failure: STOP and surface the error. Never bypass GPG signing;
never retry with raw git or force flags without explicit user direction.

## Command Map

| Group         | Commands                                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status/read   | `list`, `branches`, `status [branch]`, `diff <branch>`, `docs list/show/search/dump/sync-agents`                                                          |
| Tickets       | `ticket`, `issues`, `search`, `show`, `comment`, `attach`, `attach-dir`, `edit`, `state`, `gi` (ticket takes `--label`/`--priority`, not `-l`/`-p`)       |
| Plan/backlog  | `sync` (ticket index), `backlog sync [--fix]`, `plan` (code map, validate, status)                                                                        |
| Observability | `report` (check-report aggregate), `runs` with `triage <run>` or `diff <a> <b>`, `ledger [--last N] [--json]`, `gripe --at <branch> <message>`            |
| Hygiene       | `clean` (dot-tmp prune; dry-run default), `tmp` (machine temp fixtures; allowlisted roots only), `doctor [--apply / check / scratchpad]`                  |
| GPG           | `gpg-unlock` (warm the agent cache before signing runs), `sign <branch>`                                                                                  |
| Prompting     | `task <directive> [-w] [--base <ref>] [--tickets <csv>] [-g <gates>] [-j <n>] [-a <n>]` — renders an agent task prompt (worktree, gates, subagent budget) |

## Shared Ledger

giwt appends agent activity (commits, finalizes, syncs, failures) to the
shared ledger (inspect with `giwt ledger`), surfaced in the session
receipt. `gripe --at <branch> <message>` records a complaint or failure
against another agent's branch — use it to flag finalize failures or
coordination problems instead of silent retries.
