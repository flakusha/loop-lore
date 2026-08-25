# TASK: Dead rejectBodyImpersonation guard never fires — Elysia TypeBox parser strips performedBy before beforeHandle

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-nsfw-moderation-priority

## Summary

actions.ts:31 rejectBodyImpersonation reads ctx.body.performedBy to detect body impersonation on block/ban/shadow. Verified empirically: Elysia + TypeBox t.Object({ additionalProperties: false }) silently strips unknown keys (like performedBy) before beforeHandle fires. The guard therefore always sees ctx.body.performedBy as undefined and never triggers. The real protection is correct: handlers use auth-derived ctx.auth.userId via requireAdmin, not body input. Guard is harmless defense-in-depth if the parser behavior changes; documented but not deleted. Task: evaluate whether to keep as defense-in-depth or replace with a runtime log/alert.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
