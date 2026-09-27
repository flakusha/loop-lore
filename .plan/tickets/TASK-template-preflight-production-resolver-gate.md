<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Add production-resolver template preflight gate

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Template integrity is checked only when a view is requested at runtime (`src/routes/views/layout.ts:96-146`). A future missing/cyclic include or unresolved directive passes every static gate and fails only when its route is hit. Add one blocking preflight that enumerates physical files under `VIEWS_DIR` and calls production `loadView()` so template defects are caught before browser tests run.

## Why

The current 19 physical views render non-empty output (verified), so the preflight is healthy on a clean tree. It exists to catch future regressions. Use physical-file enumeration, not `ALLOWED_VIEWS` — the `assets` alias is intentionally empty.

## Where

- src/routes/views/layout.ts (loadView, lines 96-146)
- scripts/check-parallel.mjs (new registry entry, before browser tests)
- src/views/ (physical view files)
- src/components/, src/partials/ (shared includes)

## Acceptance Criteria

- [ ] New script enumerates physical files in `VIEWS_DIR` and calls production `loadView()` for each.
- [ ] Script fails on missing/cyclic includes, unresolved directives, unreadable files, or empty physical views.
- [ ] Script is registered in `scripts/check-parallel.mjs` BEFORE the browser test gates.
- [ ] `assets` alias is intentionally excluded from physical enumeration.
- [ ] Controlled missing include and circular include each fail the gate.
- [ ] Clean tree passes the new gate.


git issue: 12a55a4
