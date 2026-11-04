<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Per-session cost meter from telemetry

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Telemetry + benchmark-CI epics exist; surface per-chat cost (tokens, est. spend) as a visible meter. Scope: aggregate existing telemetry per chat/session, render in chat header; no new measurement infra. Research: metaapps gap 5; aligns with companion-market unit-economics signal.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
