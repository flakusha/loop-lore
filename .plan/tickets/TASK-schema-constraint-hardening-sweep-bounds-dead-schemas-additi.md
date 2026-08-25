# TASK: Schema constraint hardening sweep: bounds, dead schemas, additionalProperties

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/validation/schemas/* minors: messages.ts:16 content no maxLength (multi-MB into FTS column — cap ~100k); chat.ts:29 participantIds unbounded array of unconstrained strings (use Id + maxItems); chat.ts:179 initiative t.Numeric unbounded; character-systems.ts:39 MoodDeltaBody.delta unbounded; primitives.ts:61 GmConfig llmConfig unbounded strings + no maxTokens min/max; actors.ts:56 dataVersion Optional but update route 400s when absent — make required. Dead schemas: settings.ts:13 SettingsUpdateBody and messages.ts:139 MusicLinkMessageSchema wired nowhere. Systemic: zero additionalProperties:false repo-wide → unknown keys forwarded on every body; strip/reject at schema level to close mass-assignment class.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
