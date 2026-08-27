# BUG: logNsfwEvent has zero callers: no NSFW gate decision ever audited

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/middleware/nsfw-gate/logging.ts:107 logNsfwEvent never called repo-wide; allow/deny/override decisions unlogged with actor id (silent allows/denials). Related attribution bugs: nsfw-hook.ts:124 + moderation-hook.ts:205 audit recordAction uses performedBy:system with targetUserId=actorId (actor identity lost, character misattributed as target of own gate decision). Fix: wire logNsfwEvent into all gate paths; pass context.userId as performedBy.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
