<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG and blog service DB handles are typed as any, losing query type checking

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** (none — hygiene/self-contained)

**Summary:**

Six service modules declare their Kysely handle as Kysely`<any>` or cast it with (db as any) at every call site, so a column rename or a deleted table compiles clean inside these files.

Evidence read on dev (line numbers as found):

- src/rpg/achievements/service/crud.ts:41,55,76,121,138,143 — (db as any)
- src/rpg/achievements/service/progress.ts:27,44,80,112 — (db as any)
- src/rpg/blog/service/comments.ts:22,70,94,139,170 — Kysely`<any>` (:66 also casts a row as any)
- src/rpg/blog/service/follows.ts:16,37,57,76,97 — Kysely`<any>`
- src/rpg/blog/service/posts.ts:41,99,128,211 — Kysely`<any>`
- src/rpg/replayability/service/endings.ts:39 — (db as any)

Distinct from BUG-route-and-bootstrap-boundaries-use-raw-as-any-casts, which covers the Elysia context and adapter boundary; this ticket is the service layer.

Source: .tmp/longcat/review-assets-db-frontend.md N23-N28; .tmp/longcat/review-round2-consolidated.md code-quality list.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
