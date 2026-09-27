<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Health/Liveness/Readiness Probes

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** Low
**Effort:** (set per-ticket)
**Type:** Feature Task / Infrastructure
**Tags:** health, liveness, readiness, probe, http
**Epic:** epic-recursive-self-improvement

Add `/health` (liveness) and `/ready` (readiness) HTTP handlers. Unauthenticated. Liveness = process is alive; readiness = DB connected + providers initialized + plugins loaded. Powers watchdog probe (#1) and external monitoring.

## Core Features

- `GET /health` — returns `{ status: 'ok' }` if process responding; 200 always
- `GET /ready` — returns `{ status: 'ok', db: true, providers: [...], plugins: [...] }`; 200 if all green, 503 if degraded
- Both unauthenticated; rate-limited at 10 req/s per IP (reuse `src/middleware/rate-limit.ts`)
- Mount in `src/elysia-app.ts` before `/api/v1/*` so they're cheap

## Acceptance Criteria

- [ ] `/health` returns 200 in <5ms after warmup
- [ ] `/ready` correctly reports degraded state when DB is unreachable (test with mocked DB)
- [ ] Both endpoints bypass auth and CSRF (health probes shouldn't need tokens)
- [ ] Unit tests for both happy + degraded paths
- [ ] E2E test: kill DB -> `/ready` returns 503 within 1s

## Files

- `src/server/health.ts` — new
- `src/elysia-app.ts` — mount routes
- `src/server/health.test.ts` — new

## Notes / Verification

- Existing `src/admin/provider-health.ts` already does provider health; reuse the scan for `/ready`.
- Kubernetes-style probes: liveness = restart if dead; readiness = take out of load balancer if degraded.

