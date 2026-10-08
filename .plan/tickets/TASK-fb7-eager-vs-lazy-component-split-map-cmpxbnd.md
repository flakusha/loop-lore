<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: FB7 eager-vs-lazy component split map (CMPxBND)

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

**Status:** Not Started
**Priority:** low
**Effort:** M (split declaration across pages and components plus bundle check)
**Summary:** Declare which shared components load eagerly vs on demand at the pages.ts code-split boundary, so the bundle ships eager-only by default.
**Context:** Source row matrix-frontend-backend-integration.md FB7 (CMP x BND). Filed from 02-extract-features.md candidate 3, R02 candidate 3 confirmed dedup-only. Files: src/frontend/pages.ts and src/components (per-component lazy marker). Dedup: grepped index.json for code-split component and eager; only unrelated BUG-eager-db-init. Size-strict ceiling is a veto: this must not grow the bundle.
**Acceptance Criteria:**
- Every shared component is marked eager or lazy at the code-split boundary with the map reviewed.
- Bundle size does not regress vs the size-strict ceiling.
- bun run check green.
**Related:** 02-extract-features.md candidate 3, R02 candidate 3, TASK-size-strict-debt.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
