<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Export-gap gate must inspect core exports

**Status:** Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-cicd-pipeline
**Caveats:** partial failure, stale state, observability

**Context:**

Core exports sit outside the gap walk, so missing core coverage can pass silently.

**Summary:**

The export-gap check does not inspect core exports, so missing core coverage can pass unnoticed.

**Scope:**

- Extend the export-gap walk to core exports.
- Resolve `@loop-lore/core/*` specifiers correctly.
- Regenerate the baseline only after the implementation change.
- Do not delete genuine debt entries in order to make the gate pass.

**Acceptance Criteria:**

- [ ] Core exports are included in export-gap analysis.
- [ ] Core specifier resolution is tested.
- [ ] The regenerated baseline reflects the corrected walk.
- [ ] Relevant gates pass.


git issue: ab1f62e
