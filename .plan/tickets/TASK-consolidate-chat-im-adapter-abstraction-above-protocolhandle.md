# TASK: Consolidate chat/IM adapter abstraction above ProtocolHandler

**Status:** 🟡 In Progress — decision recorded, seam landed
**Priority:** high
**Effort:** Medium

## Summary

Execution item for G16 (bug git 476e62b). epic-communications-integrations.md specifies ProtocolAdapter and epic-social-hub.md specifies SocialAdapter with overlapping protocol coverage; neither exists in src. Pick ONE chat or IM adapter interface, place it above the real ProtocolHandler byte transport in src/transport/protocol.unified.ts, migrate epic text to the chosen design, delete the duplicate. Gate for Matrix, XMPP, IRC, Telegram, Discord, Signal adapter work. STATUS: BLOCKED pending decision; no adapter code before this lands.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Decision 2026-09-09 (mesh-followup)

- CHOSEN: `ProtocolAdapter` (integrations-core) as the single message-level
  seam. Reasons: four named implementer epics + 2FA consumer already target it;
  bridge-registry FEAT builds on it; SocialAdapter is referenced only inside
  social-hub with 1:1 core overlap.
- LANDED: `src/integrations/adapter.ts` — `ProtocolAdapter` (name, protocol,
  connect/disconnect, isConnected, isEncrypted, capabilities, sendMessage,
  onMessage) + `ADAPTER_CAPABILITIES` registry + optional
  `ChannelCapable` / `PresenceCapable` / `ReactionCapable` /
  `MessageEditCapable` (the retired SocialAdapter surface, capability-gated).
  Pointer comment in `protocol.unified.ts` (byte transport stays separate).
- DOCS: social-hub `## Adapter Interface` replaced with retirement pointer +
  mapping table; decision note appended to integrations-core epic.
- Contract tests: `src/integrations/adapter.test.ts` (stub bridge lifecycle,
  echo, capability narrowing, registry coverage).
- Explicit non-goal: no real bridge code — Matrix/XMPP/IRC tickets implement
  against this seam next. Gossip `PeerFetch` is transport-level, unchanged.
