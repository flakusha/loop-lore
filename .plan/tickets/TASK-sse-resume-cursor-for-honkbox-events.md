<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: SSE resume cursor for honkbox events

**Status:** Blocked
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-realtime-transports
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Scope: readHonkboxFrames sends Last-Event-ID or since; snapshot fallback stays for cursor-less servers. AC: reconnect replays only missed events. Depends: honkbox T4 SSE resume cursor.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Engine research addendum (2026-11-25)

- Server bounded replay exists; re-evaluate the blocker around client cursor, reconnect and snapshot fallback for older servers.
- SSE stays telemetry only; durable publication proof is the manifest and artifact bytes.
