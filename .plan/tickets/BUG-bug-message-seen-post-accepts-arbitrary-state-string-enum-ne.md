# BUG: BUG: message-seen POST accepts arbitrary state string; enum never enforced

**Status:** ✅ Resolved (already on dev, 2026-09-04)
**Priority:** medium
**Effort:** Medium

## Summary

src/routes/message-seen.ts POST body schema is t.Object({ actorId: t.String(), state: t.Optional(t.String()) }) so state accepts any string. The MessageSeenState enum and messageSeenStateMachine in src/db/enums-core/flags.ts are never enforced on write, so invalid states are persisted and break consumers that expect the enum. Fix: constrain state to the enum (t.Union of the three literals) and reject unknown values.

## Resolution

Already fixed in dev by `70176a12` (fix(message-seen): enforce state enum, atomic upsert, IDOR-safe POST + DELETE). Verified 2026-09-04 against current `dev` (`7c76aed4`):

- `src/routes/message-seen.ts` — `seenStateSchema` is now `t.Union([t.Literal("unseen"), t.Literal("processing"), t.Literal("seen")])`, rejecting unknown state strings on write.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
