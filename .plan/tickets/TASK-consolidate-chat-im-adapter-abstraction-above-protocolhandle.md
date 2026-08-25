# TASK: Consolidate chat/IM adapter abstraction above ProtocolHandler

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Execution item for G16 (bug git 476e62b). epic-communications-integrations.md specifies ProtocolAdapter and epic-social-hub.md specifies SocialAdapter with overlapping protocol coverage; neither exists in src. Pick ONE chat or IM adapter interface, place it above the real ProtocolHandler byte transport in src/transport/protocol.unified.ts, migrate epic text to the chosen design, delete the duplicate. Gate for Matrix, XMPP, IRC, Telegram, Discord, Signal adapter work. STATUS: BLOCKED pending decision; no adapter code before this lands.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
