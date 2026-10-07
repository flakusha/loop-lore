<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Federation fan-out queues outbox retries only for push failures

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Evidence (approved finding 4, P2; .tmp/concern-dev-2026-10-07.md, .tmp/concern-federation.md): src/federation/fan-out.ts:194-203 — only pushEnvelope sits inside the try/catch that calls queueOutboxRetry; requestReservation (fan-out.ts:177) and sealContent (fan-out.ts:185) inside the per-target body fan-out.ts:177-206 throw outside it. Executed evidence (.tmp/review/repro-fanout.ts): reserve POST throws -> failed=1, mesh_outbox rows=0; reserve returns 409 -> rows=0; control deliver-500 -> rows=1. Peer unreachable, 5s transport timeout, 409 capacity-exhausted, or TLS failure therefore lands in result.failed with NO mesh_outbox row and is never retried — permanent delivery loss, the exact failure mode commit 3d5489eaf exists to fix (outbox.ts header contract: fanOutContent drops nothing silently; review ask: no lost deliveries). Reserve-time failure is the dominant transient failure mode (peer down), and runMeshOutboxPass already re-reserves on every attempt, so a queued row would recover exactly this case. Note: fanOutContent currently has no production caller (tests only), but the shipped machinery misses the case it was built for. Fix: move requestReservation/sealContent inside the try (or wrap the whole per-target body) and queue the retry from the same catch, reusing the probe envelope for the reserve-only failure case.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
