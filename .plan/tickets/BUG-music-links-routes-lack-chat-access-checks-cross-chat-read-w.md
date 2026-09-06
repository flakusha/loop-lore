# BUG: Music links routes lack chat access checks — cross-chat read/write

**Status:** ✅ Resolved
**Priority:** high
**Effort:** Medium

## Summary

src/routes/music-links.ts:44,70 — POST and GET /chats/:id/music-links never call checkChatAccess; any authenticated user writes into and reads any chat id (chat-pins.ts:37 is the correct pattern). Also :48 external oEmbed fetch happens BEFORE authorization → unauthenticated-cost SSRF-style probe of attacker URLs. Fix: add access check on both routes, move fetchMetadata behind check + rate limit.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated


git issue: d283ff9

## Resolution

Already fixed on dev: both POST and GET call checkChatAccess before fetchMetadata/persist (src/routes/music-links.ts); oEmbed fetch is post-auth. (resolved 2026-09-06)
