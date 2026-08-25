# TASK: Telemetry schema comment claims additionalProperties: false rejects unknown fields — actually silently strips them

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-nsfw-moderation-priority

## Summary

validation/schemas/telemetry.ts:8 JSDoc comment states that { additionalProperties: false } on the telemetry body schema means 'unknown fields are rejected.' Verified empirically: Elysia + TypeBox t.Object with additionalProperties: false silently strips (Omits) unknown keys from input before beforeHandle, it does NOT return 400/422. Routes consuming ctx.body (e.g. routes/telemetry.ts, routes/telemetry-purge.ts) rely on server-derived fields (ctx.userId, server timestamp) not body fields, so this is a documentation inaccuracy not a security exploit. Fix: correct comment to say 'unknown fields are silently omitted.' Also affects any schema comment claiming 'rejected.'

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
