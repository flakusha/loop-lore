# BUG: promptOverride schema has no maxLength - token-bomb storage vector

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

src/validation/schemas/chat.ts:67-70 declares promptOverride as t.Optional(t.Union([t.String(), t.Null()])) with no bound; a client can PUT an arbitrarily large string that is stored in chats.prompt_override and injected into the system prompt every generation (cdd0b6c7 added maxLength 5000 to the new custom-instructions fields as the intended pattern). Pre-existing, surfaced during dev-fix review 2026-09-01. Fix: t.String({ maxLength: N }) with an explicit cap sized for override use.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
