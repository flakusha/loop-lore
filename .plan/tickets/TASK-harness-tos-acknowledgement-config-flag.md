<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Harness ToS acknowledgement config flag

**Status:** In Progress
**Priority:** high
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

Add `tosGrayzoneAcknowledged?: boolean` (default false) to `AcpProfileConfig` — per-profile granularity, not on `HarnessAcpConfig` — and validate it in `validateAcpProfiles`; the schema description carries the grayzone warning text. The flag records explicit user acknowledgement that driving this profile for RPG/other non-chat functionalities may conflict with the provider ToS when the profile is subscription-backed.

Policy frame (binding): gating applies to harness-as-provider dispatch ONLY. Local execution and direct API access are NOT limited by ToS by default and must stay ungated; with the flag absent or false every existing profile keeps flowing exactly as today.

## Context

- Research `.tmp/research/Harness-ToS-Validation.md` Gaps 2 ("No config flip — harness.acp.enabled is a generic on/off; no explicit acknowledgement flag (global or per-profile)"), Gaps 5 ("No documentation/warning text in config schema descriptions"), Rec 1 (boolean on `AcpProfileConfig` (or `HarnessAcpConfig`), default false, validated in `validateAcpProfiles`).
- Judged placement: `AcpProfileConfig` (`packages/core/src/config/schema/harness.ts:58-76`) — the schema already scopes per-profile concerns there (`limits` :72-73, `health` :74-75) and the acknowledgement must be granular per profile; `HarnessAcpConfig` (:79-84) carries only the master switch.
- Validation lives in `validateAcpProfiles` (`packages/core/src/config/sections/harness.ts:62-66`, per-entry `validateProfile` :74-114); JSON-schema description text goes into `harnessMeta` (:155-219).

## Acceptance Criteria

- [ ] `AcpProfileConfig.tosGrayzoneAcknowledged?: boolean`, absent/false by default (`HARNESS_DEFAULTS`, `packages/core/src/config/sections/harness.ts:19-25`, unchanged).
- [ ] `validateProfile` rejects non-boolean values for the flag; absent stays false after defaults application.
- [ ] `harnessMeta` schema description for the flag carries the warning: enabling permits harness-as-provider usage of a subscription-backed provider account, which may conflict with provider ToS.
- [ ] No gating behavior change in this ticket — runtime enforcement is TASK-harness-tos-acknowledgement-dispatch-guard.

**Dependencies:** none; blocks TASK-harness-tos-acknowledgement-dispatch-guard (runtime guard) and TASK-harness-tos-acknowledgement-frontend-confirmation (toggle persists this flag).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
