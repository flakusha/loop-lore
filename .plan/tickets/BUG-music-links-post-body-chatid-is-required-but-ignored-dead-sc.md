# BUG: music-links POST body.chatId is required-but-ignored dead schema field

**Status:** ✅ Resolved
**Priority:** high
**Effort:** Medium

## Summary

MusicLinkCreateBody requires { chatId, url, sectionId? } but the POST handler at src/routes/music-links.ts uses ctx.params.id exclusively. body.chatId is never read by the handler, never validated against ctx.params.id, and never persisted. The schema field is dead code that misleads API consumers and breaks OpenAPI fidelity.

Repro: POST /api/chats/{A}/music-links with body { chatId: B, url: '...' }. Authorization check fires against chat A (param), the link is stored against chat A (well, chatId param value), and body.chatId is silently discarded.

Severity: high (correctness, API hygiene, future-proofing). Security: low — current handler does NOT leak across chats since ctx.params.id is authoritative, but the dead field is a foot-gun if anyone later wires body.chatId into service.store.

Fix options:
  (a) remove body.chatId from MusicLinkCreateBody entirely (single chatId source = route param).
  (b) validate body.chatId === ctx.params.id in handler, return 400 on mismatch.
Recommended: (a) for clarity, (b) for defense-in-depth.

Tests: add a regression asserting the schema rejects body without chatId OR the handler rejects body.chatId !== ctx.params.id.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Already fixed on dev: MusicLinkCreateBody omits chatId entirely (single authority = route param); schema comment documents the rationale. (resolved 2026-09-06)
