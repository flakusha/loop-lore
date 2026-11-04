<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Publish travel-tick arrival events to world stream

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

TravelTickEngine.tick (src/locations/travel-engine.ts:55, 2-min cron src/cron/jobs.ts:251) only mutates locations.travel_progress; arrivals are silent — world/stream is conditions-only, activity/stream is unseen-counts-only, travel/status is poll-only GET. Epic: epic-display-transitions (task 1). Research: .tmp/research/2d-canvas-3d-world/transitions.md section T2.1. Acceptance: arrivals (wrap on loop=1, pin on loop=0) published to the decided feed (extend world/stream vs new events/stream — task decides); game-canvas and travel/status reflect arrivals without new poll loops. Related: TASK-2d-world-review-world-scoped-snapshot-and-event-sse-feed (feed infra), FEAT-2d-world-view-only-canvas-map (consumer). Caveats: tick stays cheap (O(active transports)); no periodic DB writes beyond arrival events; SSE backpressure bounded; arrival payload carries actor/location/route only, no PII.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
