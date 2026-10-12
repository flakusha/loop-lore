<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: SSE live model status and in-flight tracking

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** llama-swap
**Tags:** models, sse, observability

**Summary:**

Live model status surface: /running-style endpoint listing loaded models plus SSE event streams split proxy/upstream/http with an in-flight request tracker and per-request cancel; wire into the existing admin harness read models.

Reference: llama-swap server.go endpoints /running, POST /api/models/unload[/{model}], /api/events + /api/events/logs (stream=proxy|upstream|http, no-history), /api/metrics/activity, inflightTracker + swaputil.InFlightRequestsEvent; llama-swap ui/src/lib/modelLoad.ts + activitySource.ts; loop-lore src/harness/read-models.ts + src/routes/sse-stream.ts.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
