# BUG: IRC integration unscoped as group-chat (only in social-hub adapter list)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

IRC (channels equal group chat, PM equals DM, RFC 1459 and 2812) is listed as `src/social-hub/adapters/irc.ts` in `epic-social-hub.md` but is absent from `epic-communications-integrations.md` and the federation epic. No ticket or scope exists.

**Fix**: scope IRC as a group-chat integration (channel equals group-chat, PM equals chat) under `epic-communications-integrations` or a new FEAT, reusing the consolidated chat or IM adapter (after the duplication ticket). Note: no E2EE, no auth model, needs bouncer or relay for persistence.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
