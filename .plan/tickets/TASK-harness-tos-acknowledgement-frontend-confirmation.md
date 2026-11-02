<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Harness ToS acknowledgement frontend confirmation

**Status:** Done
**Scope:** Harness provider ToS usage-class matrix + admin settings ToS acknowledgement frontend confirmation
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

Frontend confirmation surface for the harness ToS grayzone: a settings toggle plus a warning modal that requires explicit confirmation before a subscription-backed harness profile is enabled, persisting through the existing config save path. The admin harness panel also shows the provider ToS note and usage class from TASK-harness-provider-tos-usage-class-matrix. Modal copy must make the scope explicit: the acknowledgement covers harness-as-provider usage of subscription-backed provider accounts ONLY; local execution and direct API access are NOT limited by ToS and stay ungated.

## Context

- Research `.tmp/research/Harness-ToS-Validation.md` Gaps 3 ("No frontend confirmation — no settings UI toggle or modal warning") + Rec 3 ("frontend settings toggle + warning modal requiring explicit confirmation before enabling harness.acp with a subscription-backed profile; persist via existing config save path").
- Today there is no user-facing settings toggle or acknowledgement UI: the harness admin surface (`src/components/harness/admin-harness-panel.html`, `src/frontend/alpine/admin-harness.ts`) renders telemetry only.
- Persistence rides the existing harness config section save path (`harness.acp` in `packages/core/src/config/schema/harness.ts:79-84`, validated by `validateAcpProfiles`); the flag persisted is `AcpProfileConfig.tosGrayzoneAcknowledged` from TASK-harness-tos-acknowledgement-config-flag.

## Acceptance Criteria

- [ ] Settings UI exposes a harness ACP enable toggle gated by an explicit-confirmation warning modal when any profile is subscription-backed.
- [ ] Enabling requires a deliberate confirm action (no silent default-on); declining leaves the acknowledgement flag unset / acp disabled.
- [ ] Persisted via the existing config save path; values round-trip through `validateAcpProfiles`.
- [ ] Admin harness panel displays per-profile provider ToS note + usage class from the ticket-1 matrix.
- [ ] Modal copy states the frame: subscription-backed harness-as-provider only; local/API unaffected.

**Dependencies:** blocked by TASK-harness-provider-tos-usage-class-matrix (note content) and TASK-harness-tos-acknowledgement-config-flag (flag to persist).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-11-02 registry-driven close: git issue bc45824 (registry tip: cf5c2287b Konstantin Fedotov Close issue)
