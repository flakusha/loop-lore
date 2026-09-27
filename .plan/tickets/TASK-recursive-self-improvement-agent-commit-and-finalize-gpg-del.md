<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Agent Commit + Finalize (GPG-delegated)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** High
**Effort:** (set per-ticket)
**Type:** Feature Task / Infrastructure
**Tags:** agent, commit, finalize, gpg, pty, giwt
**Epic:** epic-recursive-self-improvement

`POST /api/v1/agent/commit` invokes `giwt commit-wt` on the worktree. `POST /api/v1/agent/finalize` invokes `giwt finalize` (PTY-required). GPG signing delegated to agent-side `giwt gpg-unlock` — server NEVER stores the passphrase.

## Core Features

- `POST /api/v1/agent/commit` body `{ worktreeId, message, messageFile?: string }` returns `{ commitHash, worktreeId }`
  - Subprocess: `giwt commit-wt <branch> --message-file <file>` (or `--message`)
  - Requires `agent:commit` scope
- `POST /api/v1/agent/finalize` body `{ worktreeId, confirm: true }` returns `{ merged, hash }`
  - Subprocess: `giwt finalize <branch>` with PTY (uses `node-pty` or Bun equivalent)
  - Requires `agent:finalize` scope + `confirm: true` (matches `TASK-chat-feature-ownership-transfer` pattern)
- Both reject with 503 + clear message if GPG pinentry fails (agent must run `giwt gpg-unlock` first)

## Acceptance Criteria

- [ ] Agent can commit + finalize a clean worktree end-to-end (verified with throwaway branch)
- [ ] GPG signing works WITHOUT server storing passphrase
- [ ] Missing `confirm: true` on finalize returns 400
- [ ] GPG pinentry failure surfaces clear error pointing at `giwt gpg-unlock`
- [ ] No `commit.gpgsign=false` / `-S none` ever set (per `AGENTS.md`)

## Files

- `src/agent/api/commit.ts` — new
- `src/agent/api/finalize.ts` — new
- `src/agent/api/commit.test.ts` — new
- `src/agent/api/finalize.test.ts` — new

## Notes / Verification

- `giwt commit-wt` is documented in `AGENTS.md` as TTY-bound for GPG. PTY is required.
- Per `AGENTS.md`: "If `giwt commit-wt`, `giwt finalize`, or any signed operation fails with a GPG / pinentry error, agents MUST stop and report the failure. NEVER set `commit.gpgsign=false`, pass `-S none`, or otherwise strip the signature requirement." This endpoint preserves that — passphrase never crosses the wire.

