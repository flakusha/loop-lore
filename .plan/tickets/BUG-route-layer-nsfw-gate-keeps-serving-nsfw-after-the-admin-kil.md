<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Route-layer NSFW gate keeps serving NSFW after the admin kill switch is turned off

**Status:** Done
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Route-layer NSFW gate reads the boot-time file Config, not the effective (file plus runtime store) value, so the admin NSFW kill switch never blocks NSFW routes. Evidence: src/middleware/nsfw-gate/access.ts:37 canAccessNsfw passes config.nsfw into evaluateNsfwBase; src/middleware/nsfw-gate/base-eval.ts:49 returns nsfw_disabled only when that object says allowNsfw is false; src/elysia-app.ts:70 and :236 capture the boot Config in the app closure and hand it to v1Routes, which reaches src/routes/nsfw/\* where requireNsfwRouteAccess (src/routes/nsfw/shared.ts:99) is called. Every writer updates only the runtime store: src/routes/admin-nsfw.ts:93-116 (PUT /api/admin/nsfw to setConfig to applyConfigWrite to applyHotConfig to updateRuntimeNsfwConfig) and the file watcher src/server/start.ts:204-210. applyConfigWrite (src/config/hot-apply.ts:186-194) mutates a structuredClone of the snapshot, so the live boot Config object is never mutated (probe-verified: boot.nsfw.allowNsfw stays true after writing false). The runtime store is read only by the RPG capability gate (src/nsfw/capability-gate.ts:185-190) and the prompt sections (src/assistant/prompt/sections/nsfw-policy.ts:23-24, nsfw-context.ts:21-22). Failure scenario: an admin sets NSFW off via PUT /api/admin/nsfw with allowNsfw false and gets ok true, requires_restart false; GET /api/admin/nsfw then reports allowNsfw false because it reads the runtime store (src/routes/admin-nsfw.ts:56-63), the RPG NSFW services throw CapabilityBlockedError and the prompt layer injects the SFW-only policy; but POST /api/v1/nsfw/* routes still pass requireNsfwRouteAccess to canAccessNsfw to evaluateNsfwBase(config.nsfw) with the boot file value true, so an underage or blocked participant is still served NSFW content. A restart does not help: applyStoredNsfwConfig (src/nsfw/runtime-config.ts:103-129) replays the persisted override into the runtime store only, never into the boot Config the route layer reads. Proposed fix: evaluate the effective NSFW config at the read site - merge the file value and the runtime store (allowNsfw = file AND runtime, nsfwMinAge = runtime) and pass that to evaluateNsfwBase from src/middleware/nsfw-gate/access.ts:37 and from the participant weakest-link check at src/middleware/nsfw-gate/access.ts:163, so the route layer reads the same source as every other consumer. Regression test: admin PUT allowNsfw false, then requireNsfwRouteAccess must return not-ok with reason nsfw_disabled.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue eaa16ea (registry tip: 6cb9c0997 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-ROUTE-LAYER-NSFW-GATE-KEEPS-)
