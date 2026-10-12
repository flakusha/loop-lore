<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Unify safe-json import convention

**Status:** Done
**Priority:** medium
**Effort:** Medium

**Summary:**

Two import conventions for the safeJson helpers coexisted. Decision: the src/utils.ts barrel is the convention (AGENTS.md: index.ts/src.ts barrels are the public API surface; the majority of call sites already imported via the barrel). An eslint no-restricted-imports rule now bans direct utils/safe-json imports (src/utils.ts's own re-export is exempt), and all direct-import call sites were migrated to the barrel (was 271 barrel / 74 direct at migration time).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
