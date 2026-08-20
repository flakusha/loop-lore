# FEAT-messaging-bridge-extensions: Messaging bridge registry & extended bridges

## What

Extract a **generic bridge registry** from the `ProtocolAdapter` abstraction in `epic-communications-integrations.md` and implement **Telegram** and **Discord** bridges (Bot-API, low risk), with **Signal** deferred behind a feature flag (no official SDK; self-hosted signal-cli/signald daemon + unofficial wrapper, high ops risk). Extends — does not duplicate — the already-planned Matrix/XMPP/Email adapters.

## Why

`epic-communications-integrations.md` Phase 3 ("Instant Messaging") names IM but has no ticket for concrete transports beyond Matrix/XMPP. Users expect to reach loop-lore from mainstream IM networks. A registry lets new bridges plug in without touching core routing, and keeps the adapter contract consistent across all transports.

## Current State

- `epic-communications-integrations.md` defines `ProtocolAdapter`, `MessageBridge`, `EncryptionProvider`, and Phase 3 "Instant Messaging" (no concrete ticket).
- Existing tickets: `TASK-matrix-integration.md`, `TASK-xmpp-integration.md`, `TASK-email-integration.md`. No Telegram/Discord/Signal ticket exists.
- Research: **grammY** (Telegram Bot API, mature), **discord.js** (Discord Bot API, mature), **signald** (Signal daemon; no official SDK — requires self-hosted daemon + unofficial RPC wrapper, high integration risk).

## Acceptance Criteria

- `BridgeRegistry` registers/unregisters `ProtocolAdapter` implementations with declared capabilities; core routing is registry-driven, not hard-coded per transport.
- Telegram adapter (`grammY`): inbound messages reach loop-lore chat; outbound delivers; bot-token config via existing config loader.
- Discord adapter (`discord.js`): same contract as Telegram.
- Signal adapter scaffolded behind a feature flag using `signald`; documented as deferred/experimental.
- All bridges implement the same `ProtocolAdapter` contract (verified by shared contract tests).
- Bridges are scoped by capability so a compromised bridge cannot escalate beyond granted channels (security consideration in the epic).

## Implementation Notes

- Reuse the `ProtocolAdapter` / `MessageBridge` / `EncryptionProvider` interfaces from the comms epic — do not invent a parallel abstraction.
- Telegram/Discord: Bot-API webhook or long-poll; map fediverse/IM external identities to loop-lore auth without trusting foreign auth.
- Signal: `signald`/`signal-cli` Unix-socket RPC protocol; no official SDK; gate behind `SWARM_BRIDGE_SIGNAL=0|1`; treat as experimental.
- Route outbound bridge content through the existing NSFW/moderation gate.

## Dependencies

- `epic-communications-integrations.md` (adapter seams, Phase 3 IM)
- `epic-federation-swarm-sync.md` (this epic)
- `TASK-matrix-integration.md`, `TASK-xmpp-integration.md`, `TASK-email-integration.md` (sibling adapters)
- NSFW / moderation service (existing)
