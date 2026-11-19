<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Plugin approval must be keyed by plugin name and origin

**Status:** Not Started
**Priority:** Critical
**Effort:** Medium
**Epic:** epic-plugin-system
**Caveats:** security, authorization, data races, partial failure, rollback, stale state, observability

**Context:**

Name-only approval lets a community plugin inherit a core plugin's approval state; identity must include origin.

**Summary:**

Plugin approval is selected by plugin name alone even though loading accepts an origin. A community plugin using the name of an already-approved core plugin can therefore inherit the wrong approval state.

**Evidence:**

- `src/plugins/loader.ts:483-489`
- `src/db/migrations/001_init.ts:138-146`
- `src/plugins/registry.ts:35-37`

**Scope:**

- Add origin to the plugin-state identity through a forward-only migration.
- Query and persist approval by `(name, origin)`.
- Reject cross-origin name collisions at load.
- Update all name-only approval paths, including conflict handling and deletion.
- Preserve approval behavior for already-installed plugins through an explicit data-migration rule.
- Do not reopen the older name-only approval ticket as if it were unimplemented; file this as the corrective root-cause ticket and link related symptom tickets.


git issue: 739f614

**Acceptance Criteria:**

- [ ] A community plugin cannot inherit approval belonging to a core plugin with the same name.
- [ ] Approval reads, inserts, conflict handling, and deletions all use the same identity.
- [ ] Existing installations migrate without silently losing or gaining approval.
- [ ] Regression tests cover same-name/different-origin approval isolation.
- [ ] `bun run check` is green for the affected scope.

**Related:**

- `BUG-plugin-approval-is-keyed-by-name-only-with-no-origin-column-.md`
- `BUG-a-community-plugin-named-core-disables-all-five-built-in-too.md`
- `TASK-plugin-security-sandboxing.md`
