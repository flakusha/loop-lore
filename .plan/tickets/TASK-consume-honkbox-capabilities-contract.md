<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Consume honkbox capabilities contract

**Status:** Done
**Scope:** Honkbox registry, capability consumption, provider wiring
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

**Resolved:** 2026-11-19 registry-driven close: git issue 48bc41a (registry tip: de02c8016 Konstantin Fedotov Close issue)

## Engine research addendum (2026-11-25)

- No new ticket: Blender, artifact, events and external-tools keys are already parsed.
- Advertise only probed capabilities; recipe byte digest is additive only if strict pre-pinning is approved, and honkbox owns contract truth.
