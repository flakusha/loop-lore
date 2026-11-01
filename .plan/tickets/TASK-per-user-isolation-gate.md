<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: per-user isolation gate

**Status:** Done
**Scope:** Per-user isolation gate for external harness execution (TASK-per-user-isolation-gate)
**Priority:** high
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Gate harness execution behind isAdminRole (not auth.required); solo/admin only; never share subscription across users; store config per-user or server-wide admin config; spawn official binary only. Caveats: TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Context:**

The harness modules (ProfileRegistry/ProfileSelector/driver) had no principal gate: nothing tied an ACP execution to an admin-role caller. This ticket adds the isolation gate the future wiring consumes: `assertHarnessExecution` (src/integrations/harness/isolation-gate.ts) decides fail-closed, in order — master switch (`harness.acp.enabled`), explicit `isAdminRole` (solo/admin from src/users/roles.ts; checked directly, never implied by a route's `auth.required`), and a profile allowlist over the admin-owned `harness.acp.profiles` config, so the spawn argv is always the configured official binary command and never caller-supplied. Config storage is the server-wide admin config section; per-user overrides do not exist. Isolation follows from the verdict shape: an allowed execution is attributed to exactly one `userId` and may spawn only the returned profile's `command`, so a subscription is never shared across users. Denials are typed values (`harness_disabled` / `role_denied` / `profile_unknown`), never throws. Alternative considered — gating inside ProfileRegistry probes — rejected: probes are config-driven background work; the principal gate belongs at the execution boundary the composition root will call.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolved:** 2026-11-01 registry-driven close: git issue e5ed173 (registry tip: 3d9a38c2f Konstantin Fedotov Close issue)
