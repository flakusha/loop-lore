<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Cover routes battle-equipment and comparisons-export to the 80 percent unit floor

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

The diff-scoped coverage gate (diff-files mode) floors each diff-touched src file individually at 80 percent. The safe-json barrel sweep touched src/routes/battle/equipment.ts (62.1 measured) and src/routes/comparisons-export.ts (66.9 measured), exposing pre-existing below-floor unit coverage: both are route handlers exercised end-to-end by the browser e2e suite rather than by unit tests. Per-file integration-only coverage waivers (scripts/check/coverage/waivers.mjs) were added at conservative floors so the barrel unification can land; this ticket owns raising direct unit coverage (or documenting the e2e-only posture) and removing the two waiver entries.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
