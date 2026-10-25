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

The route-layer NSFW gate evaluated the boot-time file `Config`, while every writer (the admin panel, the file watcher) updates the runtime store — so the admin kill switch never reached `POST /api/v1/nsfw/*`. The ticket's own proposed fix was taken as written: evaluate the effective NSFW config at the read site and merge the file value with the runtime store.

- `allowNsfw = file AND runtime`: NSFW is served only when the file config allows it AND the runtime store allows it. The store carries the admin override and the live file value, so the admin's "off" vetoes the file's "on", and a deployment that disables NSFW in the file keeps it disabled. This is the convention the prompt sections already use (`src/assistant/prompt/sections/nsfw-policy.ts:23-24`, `src/assistant/prompt/sections/nsfw-context.ts:21-22`).
- `nsfwMinAge = runtime`: the threshold comes from the store, which holds the admin's value.

Alternatives considered: (a) drop the `config` parameter from the gate functions and read the store alone — rejected, it churns ~50 call sites across 10 files and the store's defaults would silently override a per-request file config; (b) mutate the boot `Config` object in place from the admin route — rejected, spooky action at a distance, and the file watcher replaces the config object anyway; (c) thread a dedicated "effective NSFW config" object through the route layer — the same churn as (a).

Relation to BUG-config-file-reload-silently-re-enables-nsfw-after-the-admin-: same subsystem, one root area — the NSFW effective value had no single owner (boot file config vs. a flat runtime store). This commit makes the route layer read the store; the sibling ticket splits that store into a file layer and an admin-override layer so a config reload cannot push the file value back over the admin value. Both land on this branch, one commit per ticket.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolution:**

- Fix: `src/nsfw/runtime-config.ts:88-98` — new `effectiveNsfwConfig(fileConfig)` merges the request's file config with the live runtime store (`allowNsfw = file AND runtime`, `nsfwMinAge = runtime`).
- Read sites now use it: `src/middleware/nsfw-gate/access.ts:37` (`canAccessNsfw` → `evaluateNsfwBase`) and `src/middleware/nsfw-gate/access.ts:164-169` (the batched participant weakest-link check → `findBlockedParticipant`); `src/middleware/nsfw-gate/request-context.ts:116-118` and `:127` cover the consent path (`checkNsfwWithConsent` → `resolveRequestContext`) that the NSFW routes use for the actor/chat-scoped checks.
- Tests: `src/routes/admin-nsfw.test.ts` — "admin NSFW kill-switch reaches the route layer > PUT allowNsfw=false blocks NSFW route access".
  - Before the fix: FAIL — the route gate answered `{ ok: true, userId }` (the boot file config still said `allowNsfw: true`), i.e. the kill switch did not block the route.
  - After the fix: PASS — `requireNsfwRouteAccess` answers `{ ok: false, reason: "nsfw_disabled" }`.
  - The test drives the real admin route (`PUT /api/admin/nsfw`) and then the real route-layer gate (`requireNsfwRouteAccess`) against a user who clears every other gate (adult, age gate accepted), so the only reason for the denial is the admin toggle.
- Known limitation, fixed by the sibling ticket on this branch: the runtime store still keeps the admin value and the file value in one slot, so an unrelated config-file reload pushes the file value back into the store and the route layer follows it (BUG-config-file-reload-silently-re-enables-nsfw-after-the-admin-).

**Resolved:** 2026-10-25 registry-driven close: git issue eaa16ea (registry tip: 6cb9c0997 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-ROUTE-LAYER-NSFW-GATE-KEEPS-)
