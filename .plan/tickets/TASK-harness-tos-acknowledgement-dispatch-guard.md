<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Harness ToS acknowledgement dispatch guard

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

Runtime dispatch guard in the harness profile selector/registry: refuse to select or dispatch a subscription-backed profile whose `tosGrayzoneAcknowledged` flag is not set. Local and api profiles flow unchanged by default — they are not ToS-limited and stay ungated. A denied profile never spawns, and the denial is observable via a distinct error code plus a structured log line so operators can tell ToS gating apart from capability/limit/breaker skips.

Policy frame (binding): harness-as-provider for RPG/other functionalities is permitted ONLY when the user explicitly allowed it (per-profile acknowledgement); local execution and direct API access are NOT limited by ToS by default and must remain ungated.

## Context

- Research `.tmp/research/Harness-ToS-Validation.md` Gaps 4 ("No runtime guard — dispatch paths (profile selector/registry) do not check any acknowledgement before spawning a subscription-backed harness") + Rec 1 last sentence ("Gate profile selection on it when the profile command/model is subscription-backed").
- Selection walks `ProfileSelector.select` (`src/integrations/harness/profile-selector.ts:93-114`: capability → ledger → breaker → cost) and `runTurn` (:125-156, zero-candidate throw :131-134); the guard slots into candidate admission alongside those rules. The registry probe feeds selection via `ensureProbed` (`src/integrations/harness/profile-registry.ts:5-12`).
- Subscription-backed determination comes from the TASK-harness-provider-tos-usage-class-matrix usage classes keyed by `HARNESS_FLAVORS` (`packages/core/src/config/schema/harness.ts:24`); structured logging rides the existing `harness-acp` child logger (`profile-registry.ts:27`).

## Acceptance Criteria

- [x] A subscription-backed profile without `tosGrayzoneAcknowledged: true` is never selected nor dispatched (unit-tested at the `select`/`runTurn` level, mirroring `profile-selector.test.ts`).
- [x] Local and api profiles need no flag and flow unchanged; the guard never consults their acknowledgement.
- [x] Denial is observable: distinct error kind/code (e.g. a `HarnessAcpError` variant or skip reason) plus a structured log naming the profile and the missing acknowledgement.
- [x] Default-off posture preserved: with the flag absent, only subscription-backed profiles change behavior.

**Dependencies:** blocked by TASK-harness-tos-acknowledgement-config-flag (flag + validation must land first); consumes TASK-harness-provider-tos-usage-class-matrix usage classes.

**Context:**

The config flag (`tosGrayzoneAcknowledged` on `AcpProfileConfig`) landed first (TASK-harness-tos-acknowledgement-config-flag); this ticket adds the runtime gate. The usage-class matrix (TASK-harness-provider-tos-usage-class-matrix) that would statically mark flavors subscription-backed has NOT landed, so no subscription detection is invented here: until it lands, candidate admission applies the acknowledgement rule to every profile, and the local/api exemption arrives with the matrix. The guard lives in `ProfileSelector`'s candidate walk (`walk()`): a profile lacking `tosGrayzoneAcknowledged: true` is denied with the distinct `tos_unacknowledged` skip code, logged on the `harness-acp` child logger with the profile name, and a zero-candidate `runTurn` names the code and denied profiles in its error message — clearly distinct from capability/limit/breaker skips.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolved:** 2026-11-01 registry-driven close: git issue c177368 (registry tip: e66782308 Konstantin Fedotov Close issue)
