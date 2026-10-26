<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Kysely<any> type safety gaps in DB layer

**Status:** Done
**Priority:** low
**Effort:** Medium
**Epic:** epic-code-quality

**Summary:**

Multiple places in the codebase use Kysely`<any>` instead of Kysely`<DB>`, losing type safety on table names and column types. This allows typos in table/column names to pass typecheck and fail at runtime. Files affected include various service files in src/rpg/ and src/chat/. Fix: replace Kysely`<any>` with Kysely`<DB>` and fix resulting type errors.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 6738d32 (registry tip: 83c210ce5 Konstantin Fedotov Close issue)
