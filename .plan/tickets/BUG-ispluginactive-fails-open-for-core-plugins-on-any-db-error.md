<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: isPluginActive fails open for core plugins on any DB error

**Status:** Done
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

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue eb8141c (registry tip: 6cbd597de Konstantin Fedotov Close issue)
