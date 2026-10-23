<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Route and bootstrap boundaries use raw 'as any' casts instead of typed context or schema validation

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-schema

**Summary:**

Six trust boundaries cast away type checking rather than validating. One root cause: the Elysia Context type is not threaded into handlers, so every handler reaches for a cast.

Evidence read on dev:

- src/assets/controller.ts:160-161 and :183-184 — const userId = (ctx as any).userId as string | null ?? null; repeated across the asset routes.
- src/routes/entity-routes/create.ts:28-32 — opts.database as any, `(ctx.params as any)[parentParam]`, (ctx as any).userId, and ((ctx as any).body || {}) as Record<string, unknown> with no body schema; get/list/remove/update follow the same shape.
- src/chat/service/crud/get.ts:32-33 — chatData as unknown as Record<string, unknown> and the same for participants, feeding the API response.
- src/elysia-app.ts:229 — (app as any).use(v1Routes(...)) bypasses typed plugin registration (line 227 already does the typed version for registerPlugins).
- src/db/index.ts:58-60 — statement.all(...(parameters as any[])) at the Kysely adapter boundary, three times.
- src/config/load/domain.ts:35, :62, :78 — deepMerge(config as unknown as Record<string, unknown>, parsed) as unknown as Config, and the same pattern in the server/database domain validators.

Note: the earlier claim that controller.ts:158 has an as-vs-?? precedence bug is a false positive; the casts themselves are the issue.

Source: .tmp/longcat/review-consolidated.md nits 28, 29, 30, 31, 32, 33; .tmp/cat-jam/review-quality.md P1.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
