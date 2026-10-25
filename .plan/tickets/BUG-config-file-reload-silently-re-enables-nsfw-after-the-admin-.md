<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Config-file reload silently re-enables NSFW after the admin turned it off

**Status:** Done
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

An unrelated config-file reload reverts the admin NSFW override in the runtime store. Evidence: src/config/hot-apply.ts:186-194 applyConfigWrite clones the snapshot, writes the admin value into the clone and calls applyConfigChange, which replaces the live snapshot with that clone (src/config/hot-apply.ts:153). The next file reload (src/config/hot-reload.ts:62-65 -> loadConfig -> src/server/start.ts:204-210 applyConfigChange) diffs the reloaded FILE config against that snapshot: the snapshot now says allowNsfw=false while the file still says true, so changedPaths and hotPaths both contain nsfw.allowNsfw (probe-verified: changedPaths [nsfw.allowNsfw], hotPaths [nsfw.allowNsfw]) and applyHotConfig (src/config/hot-apply-consumers.ts:28-33) pushes the file value true back into the runtime store, silently undoing the admin override. The comment at src/config/hot-apply-consumers.ts:7-9 claims an unrelated reload never clobbers an admin override - that holds only while the snapshot still holds the file value. The DB row keeps the admin value, so the state flips back and forth with file edits and only a restart restores it. Failure scenario: an admin disables NSFW in the admin panel (PUT /api/admin/nsfw with allowNsfw false); the runtime store is now false so the RPG capability gate (src/nsfw/capability-gate.ts:185-190) blocks and the prompt layer injects the SFW-only policy (src/assistant/prompt/sections/nsfw-policy.ts:23-24); an operator then edits an unrelated domain file, configs/config.server.toml, and the watcher reloads the whole config; the diff sees nsfw.allowNsfw differ, hot-applies the file value true, and NSFW is silently re-enabled at the runtime store while the admin panel still shows it disabled after a restart and enabled before one. Proposed fix: keep the admin override out of the diff baseline - applyConfigWrite must not replace the file-derived snapshot with the admin value (or the snapshot must keep both a file baseline and an override layer), so a file reload diffs against the file baseline and the runtime store is re-seeded from file plus persisted override rather than from the file alone; alternatively re-apply applyStoredNsfwConfig after every config reload. Regression test: admin write false, then applyConfigChange with a file-derived config, then getRuntimeNsfwConfig().allowNsfw is still false.

**Context:**

The NSFW effective value had no single owner. The runtime store kept the config-file value and the admin's persisted override in one slot, and the admin write (`setConfig` -> `applyConfigWrite`) also replaced the hot-apply diff baseline with the admin value. A config-file reload therefore diffed the file against the ADMIN value, saw `nsfw.allowNsfw` as changed, and `applyHotConfig` pushed the file value back into the runtime store - silently re-enabling NSFW.

The fix has two parts, because there are two owners to fix:

1. The store is split into a file layer and an admin-override layer (`src/nsfw/runtime-config.ts`). The effective value lets the override win. A config-file reload only refreshes the file layer; an admin write (persisted in `system_config`, re-applied at startup) only touches the override layer.
2. `applyConfigWrite` no longer replaces the file-derived diff baseline: the write is emitted as an explicit change (`emitChange("system_config", next, [key])`) while the baseline keeps the file values. Without this, every reload reports the NSFW path as changed and re-applies the file value.

Relation to BUG-route-layer-nsfw-gate-keeps-serving-nsfw-after-the-admin-kil-: same subsystem, one root area - the NSFW effective value had no single owner (boot file config vs. a flat runtime store). That ticket makes the route layer read the store; this one makes the store keep the admin override across reloads. Both land on this branch, one commit per ticket.

Alternatives considered: (a) keep one flat store and only clean the baseline - the admin override would still be lost when the file itself changes `nsfw.allowNsfw`, and the persisted override would be overwritten by the file value at boot; (b) re-read `system_config` on every reload - a DB read per reload for a value the store already holds; (c) let the admin route write the file layer - the same defect as (a).

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolution:**

- Fix: `src/nsfw/runtime-config.ts:31-67` - the store now keeps a `file` and an `override` layer; `get()` (`:47-49`) merges them, the override wins. `update()` (`:56-58`) writes the override layer (admin path), the new `updateFile()` (`:64-66`) writes the file layer. Exported as `updateRuntimeNsfwConfig` (`:117-119`) and `updateRuntimeNsfwFileConfig` (`:127-129`).
- Fix: `src/config/hot-apply-consumers.ts:31-33,67-77` - the NSFW hot path is applied per changed path in `applyNsfwHotPath`: a `system_config` write (an admin override) goes to the override layer, a config-file reload only to the file layer.
- Fix: `src/config/hot-apply.ts:150-165,197-209` - `applyConfigChange` delegates to the new `emitChange` (`:165`); `applyConfigWrite` emits the write as an explicit change and leaves the file baseline untouched.
- Test-support fix: `src/server/start.test.ts:82-89` - the suite mocks `../nsfw/runtime-config`; the mock had to expose the new `updateRuntimeNsfwFileConfig` export as well, otherwise module linking failed for every importer of the mocked module ("Unhandled error between tests: Export named 'updateRuntimeNsfwFileConfig' not found").
- Tests: `src/config/hot-apply.test.ts` - "an admin NSFW override survives a config-file reload".
  - Before the fix: FAIL - `expect(getRuntimeNsfwConfig().allowNsfw).toBe(false)` received `true`: the reload pushed the file value back over the admin override. The reload also reported `nsfw.allowNsfw` in `change.changedPaths`, because the admin write had replaced the file baseline.
  - After the fix: PASS - the override survives the reload and the reload reports no NSFW change.
  - Verified by reverting the fix in the worktree (the baseline write and the store layering) and re-running the test.

**Resolved:** 2026-10-25 registry-driven close: git issue b751a45 (registry tip: 7b385be8a Konstantin Fedotov Auto-closed: appended .md marker marks BUG-CONFIG-FILE-RELOAD-SILENTLY-)
