<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Hoist inline route response schemas to exported consts

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-api-library-distribution.md

**Summary:**

Eleven Elysia route handlers build their 200-response schema inline inside the route declaration, e.g. `response: { 200: ListResponse(QuestResponse,) }` at src/routes/blog/posts.ts:161, src/routes/quests/progress.ts:62, src/routes/quests/world.ts:36, src/routes/story-items/definitions.ts:96, src/routes/story-items/instances.ts:87 and :105, src/routes/blog/comments.ts:92, src/routes/blog/follows.ts:95, src/routes/blog/rag.ts:32, src/routes/character-emotions/actor.ts:19, src/routes/character-emotions/definitions.ts:17.

The constructed schema is never bound to a variable, so no scanner can reach it: the schema-driven fuzz generator globs src/validation/schemas/*.ts and reads module exports, so these 11 response contracts get zero fuzz coverage. They are the wire contract for the blog, quest, story-item and character-emotions endpoints.

For this epic (src/ as a programmatic API) the deeper problem is that a consumer cannot import these schemas at all. Hoist each to a named module-level const and export it, so it lands in the module surface, gets fuzzed by the generator, and is importable by an external consumer. Pure refactor: the schema object is identical, so routes keep returning the same shape. Verify by re-running `bun run scripts/generate-schema-fuzz.ts` and confirming the schema count rises, and `bun run scripts/check/test-gaps.mjs` reports no new gaps.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
