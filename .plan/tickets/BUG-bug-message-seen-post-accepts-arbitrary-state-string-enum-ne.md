# BUG: BUG: message-seen POST accepts arbitrary state string; enum never enforced

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/routes/message-seen.ts POST body schema is t.Object({ actorId: t.String(), state: t.Optional(t.String()) }) so state accepts any string. The MessageSeenState enum and messageSeenStateMachine in src/db/enums-core/flags.ts are never enforced on write, so invalid states are persisted and break consumers that expect the enum. Fix: constrain state to the enum (t.Union of the three literals) and reject unknown values.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
