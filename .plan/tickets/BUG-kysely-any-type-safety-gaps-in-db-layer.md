<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Kysely<any> type safety gaps in DB layer

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

Multiple places in the codebase use Kysely`<any>` instead of Kysely`<DB>`, losing type safety on table names and column types. This allows typos in table/column names to pass typecheck and fail at runtime. Files affected include various service files in src/rpg/ and src/chat/. Fix: replace Kysely`<any>` with Kysely`<DB>` and fix resulting type errors.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
