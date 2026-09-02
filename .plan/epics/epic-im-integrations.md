<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Instant Messaging Integrations

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** im, whatsapp, telegram, signal, experimental
**Parent Epic:** Communications Integrations (epic-communications-integrations.md)

## Summary

Instant messaging integrations for loop-lore: a unified IM abstraction layer with WhatsApp Web (experimental), Telegram Bot API, and Signal protocol support, plus a unified IM config UI and status dashboard.

## Sub-Epic of

Part of the **Communications Integrations** epic. See parent epic for full scope and slicing rationale.

## Scope

- Unified IM abstraction layer (`src/integrations/im/`)
- WhatsApp Web protocol (experimental, via `whatsapp-web.js`)
- Telegram Bot API support
- Signal protocol (via `@nicepkg/signal-cli`)
- Unified IM config UI and status dashboard

## Design

The unified IM layer implements `ProtocolAdapter` from **epic-integrations-core.md**, with one adapter per network behind the shared abstraction:

```typescript
// src/integrations/im/adapter.ts — unified layer
export class ImAdapter implements ProtocolAdapter { ... }
```

The unified IM config UI and IM status dashboard build on the integration config UI skeleton and status dashboard from **epic-integrations-core.md**.

> WhatsApp Web is an **experimental** unofficial protocol — expect breakage and treat as best-effort. Signal support depends on third-party CLI packaging (`@nicepkg/signal-cli`).

## Tasks

- [ ] Create IM abstraction layer (`src/integrations/im/`)
- [ ] Add WhatsApp Web protocol (experimental, via `whatsapp-web.js`)
- [ ] Implement WhatsApp message handling
- [ ] Add Telegram Bot API support
- [ ] Create Telegram bot integration
- [ ] Add Signal protocol support (via `@nicepkg/signal-cli`)
- [ ] Implement unified IM config UI
- [ ] Add IM status dashboard
- [ ] Document IM setup in `docs/integrations/im.md`

## Files

- `src/integrations/im/` — IM abstraction layer
- `docs/integrations/im.md` — Setup documentation

## Dependencies

- Depends on: **Communications Integrations** hub (epic-communications-integrations.md)
- Depends on: **Integrations Core** (epic-integrations-core.md) — implements `ProtocolAdapter`; unified IM config UI/status dashboard extend the core config UI skeleton and dashboard
- Depends on: `epic-crypto.md` (Signal protocol key management)
- Siblings: independent of Matrix/XMPP/Email sub-epics; IM networks can be reached through Matrix bridges as an alternative (see epic-matrix-integration.md)

## Security Considerations

| Protocol | Encryption      | Key Management | Data Storage               |
| -------- | --------------- | -------------- | -------------------------- |
| WhatsApp | Signal Protocol | Server-managed | End-to-end                 |
| Telegram | MTProto         | Server-managed | Cloud or local secret chat |
| Signal   | Signal Protocol | Server-managed | End-to-end                 |

## Success Criteria

- Can chat with loop-lore characters via at least one IM network (Telegram recommended first)
- All supported IM networks configurable via the unified UI

## Related Epics

- `epic-auth-channel-provisioning.md` — IM adapters double as `messenger-im` 2FA OTP/approval rungs; each adapter must declare `auth-challenge` (outbound) / `auth-approval` (inbound) capability flags — rungs without inbound support deliver OTP only (retype flow). See `matrix-authentication-channels.md` AC7.
