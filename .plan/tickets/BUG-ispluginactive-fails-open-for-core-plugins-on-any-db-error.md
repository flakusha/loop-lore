<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: isPluginActive fails open for core plugins on any DB error

**Status:** Done
**Status Note:** resolved 2026-10-25 (`fix/bug-sweep`) — isPluginActive (src/plugins/loader.ts:339-381) now fails CLOSED on unexpected plugin_state read errors — logs `plugin_state read failed — failing closed` and returns false — while only the pre-migration missing-table error (`no such table`, isMissingPluginStateTable :331-337) keeps the origin-default fallback for first boot. Regressions in src/plugins/loader.discovery-failures.test.ts describe "plugin_state read failures fail closed" (5/5 pass on the fix). BEFORE-EVIDENCE (observed 2026-10-25 by swapping in the parent-commit file b599daffe^ via .tmp/loader-probe.ts and restoring byte-identically): 4 pass / 1 fail — exactly "a transient plugin_state read failure disables a core plugin" fails against the old bare catch (full output .tmp/loader-probe-out.txt). Neighbors green: loader.test.ts 26/26, loader-dispatch.test.ts 7/7. Gates: typecheck + eslint green on final HEAD (run 666566-mvnfwjhq), worktree fix/bug-sweep, issue BUG-ISPLUGINACTIVE-FAILS-OPEN-FOR-CORE-PLUGINS-ON-ANY-DB-ERROR.
**Priority:** high
**Effort:** Medium
**Epic:** epic-plugin-system

**Summary:**

Location: src/plugins/loader.ts:301-305.

Evidence: a bare catch treats table-missing and any lock/IO error identically, then the next statement returns origin === core - re-approving every core plugin (re-running onLoad with a live db handle) on an unexpected DB failure. Community/local correctly fail closed (disabled fallback).

Verification: CODE-READ - trace: loader.ts:293-298 (status select) -> :300 (row.status === Active) -> :301-303 (bare catch, fall through) -> :305 (return origin === core). isPluginActive is module-private and takes a live Kysely handle, so a throwing-db probe cannot reach it without the server; the fail-open return is the literal next statement after the catch.

Impact: a transient DB fault converts approval-state-unknown into everything-core-runs, bypassing an admin-disabled state for the duration of the fault.

Fix: distinguish table absence (probe once / check error code) and fail closed for every other error.

Source: .tmp/glm-review/deep-plugins-1015.md F-4 (gitignored; recorded here verbatim). Related Done ticket BUG-plugin-tool-authorization-fails-open (28c0c9c) covers tool authorization, not the plugin-activity check.

**Context:**

Closure rationale (2026-10-25, branch `fix/bug-sweep`): isPluginActive (src/plugins/loader.ts:339-381) now fails CLOSED on unexpected plugin_state read errors — logs `plugin_state read failed — failing closed` and returns false — while only the pre-migration missing-table error (`no such table`, isMissingPluginStateTable :331-337) keeps the origin-default fallback for first boot.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue eb8141c (registry tip: 6cbd597de Konstantin Fedotov Close issue)
