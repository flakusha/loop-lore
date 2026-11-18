<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Consume honkbox capabilities contract

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-platform-integrations

**Summary:**

**Summary:** Once honkbox ships GET /v1/capabilities (honkbox FEAT-capabilities-api, proposed P0), probe it at provider setup the way sdcpp-discovery.ts probes /sdcpp/v1/capabilities. Never route-probe.

**Acceptance:** Capability probe reports vision, ControlNet, video, jobs/events, and limits from the contract; feature-gated UI (e.g. ControlNet controls hidden while flag false); contract version mismatch warns without breaking; BLOCKED until honkbox FEAT-capabilities-api lands.

**Caveats:** TOCTOU (capabilities change after probe); stale state (cached flags vs rebuilt honkbox); observability (log contract version per dispatch); authorization (probe uses the same bearer layer).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
