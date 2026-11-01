<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: boot readiness summary: off-capabilities log line at ready=true

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-first-run-auto-setup
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## What

Exactly one log line emitted at the ready=true transition in src/server/start.ts listing off-capabilities (no provider configured, native module fallback active, TLS not provisioned, encryption skipped, etc.), computed from the SAME checks module the setup-state endpoint ticket (GET /api/v1/setup/state) uses. The checks module is extracted once and consumed by both surfaces; the log line is the human-readable projection of it.

## Why

Research round 3 candidate C1 follow-up (effort S): boot never blocks on user input (P2), but the operator must be able to see what is off after first boot. Keeps one source of truth for setup checks instead of a second hand-rolled list.

## Scope

- shared checks module (env/PII gate, provider health, native status, TLS cert presence, SMK, model roles) extracted alongside the setup-state endpoint implementation
- one summary line emitted from src/server/start.ts at the ready=true transition

## Do NOT touch

- Do NOT extend /api/health (pinned, deliberately unauthenticated contract)
- Do NOT log secret values or hints that embed env var values

## Acceptance Criteria

- [ ] exactly one readiness summary line is logged at ready=true on every boot
- [ ] off-capabilities present on a fresh solo boot appear (at minimum: no provider, native fallback state)
- [ ] the summary is computed from the same checks module as GET /api/v1/setup/state (single source, no duplicated logic)
- [ ] no secret values appear in the log line

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
