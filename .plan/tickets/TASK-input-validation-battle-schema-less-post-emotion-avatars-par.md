<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Input validation: battle schema-less POST + emotion-avatars params + query schemas

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** medium
**Effort:** Medium

## Summary

src/routes/battle/* POST handlers read ctx.body as untyped objects with no body/params Elysia schema (morale, social, npc, resolution, weather, equipment); src/routes/character-emotion-avatars.ts reads jobId/actorId via ctx.params as any with no params schema; several routes read ctx.query with no query schema (limit/offset unconstrained). Fix: add t.Object body/params/query schemas with Number ranges and Literal enums. Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
