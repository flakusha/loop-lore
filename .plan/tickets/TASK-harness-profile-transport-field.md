<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: harness profile transport field

**Status:** In Progress
**Priority:** medium
**Effort:** Small
**Epic:** epic-harness-integration

**Summary:** Add a `transport` field to `AcpProfileConfig` and expose it in admin settings views.

**Context:** Research 2026-11-24 (.tmp/research/harness-acp-sdk-profiles-2026-11-24.md). Only ACP stdio has a driver today; `sdk` and unknown values stay rejected until one exists. The name `default` is reserved for the implicit-failover alias in the companion ticket. Slice A has already landed worktree-only in tree/harness-profile-transport @ 41e3ef517; this ticket records the durable scope.

**Caveats:** TOCTOU, security, authorization, parallelism, partial failure, rollback, stale state, idempotency, observability

**Acceptance Criteria:**

- [x] `transport?: "acp"` on `AcpProfileConfig`, omitted means `acp`, JSDoc states ACP stdio is the only driver.
- [x] `validateAcpProfiles` rejects `sdk`/unknown with a config-pointing error and reserves `default` as a name.
- [x] Admin settings store view and settings wire expose `transport` defaulted `acp`; no write path and no secret echo.
- [x] Config/env JSON schemas regenerated; tests cover omitted/`acp`/`sdk`/unknown/`default` and the view default.
- [ ] Full check at landing owner; worktree targeted gates already pass.
