<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Adapter health monitoring and per-protocol rate limiting

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-integrations-core

**Summary:**

Adopted component: ground-up (bridge policy). Seam: src/integrations/bridge.ts (MessageBridge) + src/integrations/health.ts (new). Per-adapter, per-target token buckets enforced in the bridge (not the adapter); Retry-After honored; adapter health verdicts (ok/degraded/unhealthy) surfaced on the integration status dashboard; auth-channel consumers fall back to the next ladder rung on unhealthy (epic-auth-channel-provisioning.md invariant 7). AC: rate limit config per adapter instance with per-protocol default; 429 + Retry-After honored; health verdict unit tests; dashboard surface. Epic: epic-integrations-core.md

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-04 registry-driven close: git issue fe24ae2 (registry tip: 65848fa8e Konstantin Fedotov Auto-closed: appended .md marker marks TASK-ADAPTER-HEALTH-MONITORING-A)
