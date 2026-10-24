<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Config-file reload silently re-enables NSFW after the admin turned it off

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

An unrelated config-file reload reverts the admin NSFW override in the runtime store. Evidence: src/config/hot-apply.ts:186-194 applyConfigWrite clones the snapshot, writes the admin value into the clone and calls applyConfigChange, which replaces the live snapshot with that clone (src/config/hot-apply.ts:153). The next file reload (src/config/hot-reload.ts:62-65 -> loadConfig -> src/server/start.ts:204-210 applyConfigChange) diffs the reloaded FILE config against that snapshot: the snapshot now says allowNsfw=false while the file still says true, so changedPaths and hotPaths both contain nsfw.allowNsfw (probe-verified: changedPaths [nsfw.allowNsfw], hotPaths [nsfw.allowNsfw]) and applyHotConfig (src/config/hot-apply-consumers.ts:28-33) pushes the file value true back into the runtime store, silently undoing the admin override. The comment at src/config/hot-apply-consumers.ts:7-9 claims an unrelated reload never clobbers an admin override - that holds only while the snapshot still holds the file value. The DB row keeps the admin value, so the state flips back and forth with file edits and only a restart restores it. Failure scenario: an admin disables NSFW in the admin panel (PUT /api/admin/nsfw with allowNsfw false); the runtime store is now false so the RPG capability gate (src/nsfw/capability-gate.ts:185-190) blocks and the prompt layer injects the SFW-only policy (src/assistant/prompt/sections/nsfw-policy.ts:23-24); an operator then edits an unrelated domain file, configs/config.server.toml, and the watcher reloads the whole config; the diff sees nsfw.allowNsfw differ, hot-applies the file value true, and NSFW is silently re-enabled at the runtime store while the admin panel still shows it disabled after a restart and enabled before one. Proposed fix: keep the admin override out of the diff baseline - applyConfigWrite must not replace the file-derived snapshot with the admin value (or the snapshot must keep both a file baseline and an override layer), so a file reload diffs against the file baseline and the runtime store is re-seeded from file plus persisted override rather than from the file alone; alternatively re-apply applyStoredNsfwConfig after every config reload. Regression test: admin write false, then applyConfigChange with a file-derived config, then getRuntimeNsfwConfig().allowNsfw is still false.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
