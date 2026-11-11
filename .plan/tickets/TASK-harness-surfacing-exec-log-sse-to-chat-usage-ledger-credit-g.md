<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness surfacing: exec-log SSE to chat, usage-ledger credit guard, terminal-WS hardening

**Status:** In Progress
**Progress:** Slice (1) is partially landed (2026-11-11, branch `harness-telemetry`): `GET /api/v1/harness/stream` (admin-gated, `routes/harness/stream.ts` on the `routes/sse-stream.ts` scaffold) surfaces the exec-log as `run` SSE frames (runs-summary shape plus the dispatching profile; anchors at connect, never replays history) and the permission queue as `jobs` frames. The chat-timeline last mile for exec-log runs, the usage-ledger credit guard (2), and the terminal-WS hardening (3) remain open.
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
