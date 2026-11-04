<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness surfacing: exec-log SSE to chat, usage-ledger credit guard, terminal-WS hardening

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-harness-integration
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Ranked functions from .tmp/research/external-brains/07-harness.md. (1) Exec-log/ledger surfacing: append-only job status via SSE into chat render — mostly wired (job-status.ts, job-status-bridge.ts), needs the last mile. (2) Usage-ledger + credit guard: per-session log, OpenRouter credit-split warn; usage-ledger.ts exists, needs surfacing. (3) Terminal-WS hardening: scope PTY to worktree cwd, kill on session end (Cloudflare Sandbox SDK pattern). Sibling-lane collisions (do NOT build here): `feat-harness-*` lanes own `src/harness/*`; TASK-acp-profile-harness-adapters owns adapter work; omp/profile-registry/breaker owned by external-harness lane. Coordinate, don't duplicate.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
