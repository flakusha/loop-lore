<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Remote Harness / Federation (Future Work)

**Overview:** Off-machine harness access and multi-worktree, multi-user project futures.

**Status:** Not Started
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** harness, remote, federation, tls, auth, worktree, git, jj, pijul
**Related:** `epic-harness-integration.md`, `epic-external-harness-acp.md`

## Summary

The loopback listener (landing separately) plus the Design-B stdio shim proxy
(`.tmp/research/harness-stdio-while-running.md`) cover same-machine access.
This epic tracks the REMOTE side only: TLS + token auth for off-machine
connections with bind-address config defaulting to loopback, shared
multi-worktree projects over git, isolated single-user private projects
(git stable; jj and pijul experimental), multi-user collaboration via pijul
(experimental), and the ownership rule that the project owner holds permission
on the project root in addition to worktree(s).

## Offline-first P2P path (Radicle)

Radicle is adopted as the offline-first P2P path for this epic's federation story: `FEAT-radicle-integration` (ticket file `.plan/tickets/FEAT-radicle-integration.md`) wraps the `rad` CLI / `radicle-node` HTTP API so world and character definitions sync as content-addressed, server-less Git repos — peers push and pull directly with no central server, and offline edits merge on the next sync. It complements rather than replaces the federation axes tracked in `epic-federation-swarm-sync.md`: ActivityPub handles cross-instance federation, swarm CRDT handles live multi-writer reconciliation, and Radicle covers the no-server, offline-first lane. Radicle's scope and acceptance criteria stay in that epic (Phase C) and in the ticket file.

## Minimal slices

1. Remote TLS + token auth on top of the loopback listener (bind config,
   default loopback; refuse remote bind without TLS + token).
2. Shared multi-worktree git projects (one project, many worktrees, shared
   history, plain git semantics).
3. Isolated single-user private projects (git default; jj/pijul experimental
   behind a flag, fenced off multi-user paths).
4. Multi-user collaboration via pijul (experimental; identity + per-patch
   permission checks).
5. Owner permission on the project root alongside the worktree scope guard.

## Explicitly NOT building

- The loopback listener itself (separate lane; this epic builds on it).
- Multiplexed MCP+ACP on one fd (rejected in the research; Design B chosen).
- LSP stdio (absent from the tree; see `epic-editor-lsp-integration.md`).
- Peer-cred/peer-pid auth; sharing in-memory ACP sessions across processes.
- mTLS/client certs in v1 (bearer token only).
- A second model router, second scheduler, or second history store.
- Real-time co-editing/CRDT sync (distinct axis: `epic-federation-swarm-sync.md`).
- Full RBAC matrix or per-file ACLs.

## Acceptance Criteria

- [ ] Off-machine connections require TLS + token; loopback stays default
- [ ] One git project spans many worktrees with shared history
- [ ] Private single-user projects work on git; jj/pijul behind experimental flag
- [ ] Pijul multi-user collab gated experimental with identity + permission checks
- [ ] Owner root grant enforced alongside worktree scope guard
- [ ] Tests passing, docs updated

## Tickets

- `TASK-remote-harness-tls-token-auth`
- `TASK-shared-multi-worktree-git-projects`
- `TASK-isolated-private-projects-git-jj-pijul-experimental`
- `TASK-multi-user-collaboration-pijul-experimental`
- `TASK-project-owner-root-permissions`


git issue: 287aa65
