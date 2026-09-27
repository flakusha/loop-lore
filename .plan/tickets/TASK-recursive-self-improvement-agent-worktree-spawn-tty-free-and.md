<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Agent Worktree Spawn (TTY-free) + Sandbox

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** High
**Effort:** (set per-ticket)
**Type:** Feature Task / Infrastructure
**Tags:** agent, worktree, sandbox, giwt, tty-free
**Epic:** epic-recursive-self-improvement

Spawn a worktree on behalf of an authorized agent. TTY-free path: invoke `scripts/worktree/index.mjs` (or `giwt new`) via subprocess with stdin closed. Sandbox: max concurrent worktrees, max disk per worktree, worktree path under `tree/agent-<uuid>/`.

## Core Features

- `POST /api/v1/agent/worktrees` body `{ branch: string, base?: string }` returns `{ worktreeId, path, branch }`
- Subprocess invocation: `bun scripts/worktree/index.mjs new <branch> --base <base>` (TTY-free — verify the script supports non-interactive mode)
- Worktree cleanup job: runs every 1h, removes worktrees idle >24h (state tracked in #9)
- Sandbox limits: max 5 concurrent worktrees per token; max 500MB per worktree; max 10 worktrees global

## Acceptance Criteria

- [ ] Agent can POST and receive `{ worktreeId }` within 30s
- [ ] Worktree created under `tree/agent-<uuid>/` matching `giwt new` shape
- [ ] Sandbox limits enforced: 6th concurrent request returns 429
- [ ] Cleanup job removes idle worktrees (test by creating a fake 25h-old worktree entry)
- [ ] GPG signing stays agent-side; this ticket NEVER touches `giwt gpg-unlock`

## Files

- `src/agent/api/worktree.ts` — new
- `src/agent/api/sandbox.ts` — new
- `src/agent/api/worktree.test.ts` — new
- `src/agent/cleanup.ts` — new (cron-style cleanup)
- `scripts/worktree/index.mjs` — extend with non-interactive flags if missing

## Notes / Verification

- Existing `scripts/worktree/` is the TTY-free `giwt` shim; verify it supports `--base` and stdin-closed invocation.
- Per `AGENTS.md`: NEVER strip GPG signing; if `giwt` requires TTY for pinentry, this endpoint must reject and surface a clear error pointing the agent at `giwt gpg-unlock`.

