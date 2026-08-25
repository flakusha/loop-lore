# FEAT: IRC integration: channels as group-chat, PM as chat

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

Scoped per matrix-protocol-chat-group-integration.md. Map IRC channels to loop-lore group-chat and PMs to chat (RFC 1459 and 2812). No E2EE and no native auth model; persistence requires bouncer or relay logging. STATUS: BLOCKED - requires the consolidated chat or IM adapter (G16, git 476e62b) before any adapter code; filing closes the G18 scoping gap (git 27cc7ab).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
