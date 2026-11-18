<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Consume honkbox capabilities contract

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-platform-integrations

**Summary:**

Honkbox now serves GET /v1/capabilities (FEAT-capabilities-api, honkbox f44b3fc) and an OpenAI-compatible chat completions shim (2eca89e). Probe it at provider setup the way sdcpp-discovery.ts probes /sdcpp/v1/capabilities. Never route-probe. The 2026-11-18 operator approved the registry slice; the new companion ticket is `FEAT-honkbox-capability-descriptor-registry-and-feature-gate-help.md` (55f8fd5).

**Acceptance:** Capability probe reports vision, ControlNet, video, jobs/events, and limits from the landed contract; feature-gated UI (e.g. ControlNet controls hidden while flag false); contract version mismatch warns without breaking. Probe `GET {baseUrl}/capabilities` — baseUrl already includes `/v1` (providers.ts:24-25). BEFORE: this ticket said BLOCKED until honkbox FEAT-capabilities-api lands; that prerequisite landed and the line was removed 2026-11-18.

**Caveats:** TOCTOU (capabilities change after probe); stale state (cached flags vs rebuilt honkbox); observability (log contract version per dispatch); authorization (probe uses the same bearer layer).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
