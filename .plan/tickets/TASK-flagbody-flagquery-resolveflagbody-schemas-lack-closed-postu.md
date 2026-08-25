# TASK: flagBody, flagQuery, resolveFlagBody schemas lack CLOSED posture (additionalProperties: false) — unlike blockBody/modBody/unblockBody

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-nsfw-moderation-priority

## Summary

shared.ts:109-125 flagBody, flagQuery, resolveFlagBody schemas use t.Object without { additionalProperties: false } (CLOSED posture). The sibling schemas blockBody (line 62), modBody (line 70), unblockBody (line 80) all include { additionalProperties: false }. Without it, Elysia silently passes unknown keys to beforeHandle hooks — a mass-assignment surface on flag creation and resolution. While Elysia TypeBox strips the keys from ctx.body, the inconsistency is a latent risk if schemas are reused outside Elysia. Fix: add { additionalProperties: false } to flagBody, flagQuery, resolveFlagBody.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
