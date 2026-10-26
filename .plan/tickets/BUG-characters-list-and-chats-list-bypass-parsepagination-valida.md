<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: characters-list and chats-list bypass parsePagination validation

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] FIXED (issue 29f5b01): src/routes/characters/list.ts:27 and src/routes/chats/list.ts:151 now run query params through parsePagination (clamping helper src/routes/http-utils/parse.ts:39-42).
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-api-validation-guardrails

**Summary:**

Two route handlers read `page` and `pageSize` from `ctx.query` directly
without using the `parsePagination()` helper that already exists in
`http-utils/parse.ts`.

## Evidence

`src/routes/characters/list.ts:24-25`:

```ts
  const { page, pageSize, type } = ctx.query;
  const offset = (page - 1) * pageSize;
```

`src/routes/chats/list.ts:108-109` — same pattern.

`parsePagination(ctx.query)` exists at `src/routes/http-utils/parse.ts:39-45`
and correctly clamps page >= 1 and pageSize 1..200.

## Source

- review-routes.md finding 4 and 5
- review-consolidated.md nit 20 and 21
- File:line: `src/routes/characters/list.ts:24-25`,
  `src/routes/chats/list.ts:108-109`

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 29f5b01 (registry tip: 33b6d1eec Konstantin Fedotov Close issue)
