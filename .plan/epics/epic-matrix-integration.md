<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Matrix Integration

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** matrix, e2ee, olm, megolm, bridges
**Parent Epic:** Communications Integrations (epic-communications-integrations.md)

## Summary

Matrix integration for loop-lore: client SDK, authentication, E2EE (Olm/Megolm), room management, bidirectional message bridging between loop-lore chats and Matrix rooms, media sharing, presence/receipts sync, and bridges to Discord, Slack, and IRC via Matrix appservices.

## Sub-Epic of

Part of the **Communications Integrations** epic. See parent epic for full scope and slicing rationale.

## Scope

- Matrix client SDK integration (`matrix-js-sdk`)
- Authentication (access token, login)
- E2EE support (Olm/Megolm)
- Room creation and management
- Bidirectional bridging (loop-lore ↔ Matrix)
- File/media sharing
- Typing indicators, read receipts, presence sync
- Bridges to Discord (matrix-appservice-discord), Slack (matrix-appservice-slack), IRC

## Design

`MatrixAdapter` implements `ProtocolAdapter` and `MatrixEncryption` implements `EncryptionProvider`, both defined in **epic-integrations-core.md**. Key material comes from `epic-crypto.md`.

```typescript
// src/integrations/matrix/adapter.ts
export class MatrixAdapter implements ProtocolAdapter { ... }

// src/integrations/matrix/encryption.ts — Olm/Megolm
export class MatrixEncryption implements EncryptionProvider { ... }
```

## Tasks

- [ ] Add Matrix client SDK (`matrix-js-sdk`)
- [ ] Create `src/integrations/matrix/` module
- [ ] Implement Matrix authentication (access token, login)
- [ ] Add E2EE support (Olm/Megolm)
- [ ] Create room management API
- [ ] Implement message bridging (loop-lore → Matrix)
- [ ] Add Matrix → loop-lore message handling
- [ ] Create Matrix room creation from loop-lore chat
- [ ] Add file/media sharing via Matrix
- [ ] Implement typing indicators and read receipts
- [ ] Add Matrix presence status sync
- [ ] Create bridge to Discord (via matrix-appservice-discord)
- [ ] Create bridge to Slack (via matrix-appservice-slack)
- [ ] Document Matrix setup in `docs/integrations/matrix.md`

## Files

- `src/integrations/matrix/` — Matrix adapter
- `docs/integrations/matrix.md` — Setup documentation

## Dependencies

- Depends on: **Communications Integrations** hub (epic-communications-integrations.md)
- Depends on: **Integrations Core** (epic-integrations-core.md) — implements `ProtocolAdapter`; uses config UI skeleton, health monitoring, rate limiting
- Depends on: `epic-crypto.md` (encryption primitives behind Olm/Megolm key management)
- Siblings: independent of XMPP/IM/Email sub-epics; Discord/Slack/IRC connectivity is reached through this epic's bridges (IRC has no dedicated sub-epic — see parent Open Questions)

## Security Considerations

| Aspect         | Approach                      |
| -------------- | ----------------------------- |
| Encryption     | E2EE (Olm/Megolm)             |
| Key Management | Server-managed, cross-signing |
| Data Storage   | Encrypted locally             |

## Success Criteria

- Can chat with loop-lore characters via a Matrix client
- E2EE works end-to-end for Matrix rooms
- loop-lore chat can be bridged to Discord/Slack

## Related Epics

- `epic-auth-channel-provisioning.md` — Matrix DM (and bridged Discord/Slack/IRC reach) as verified 2FA OTP / login-approval channel; inbound `auth_challenge` reply parsing rides this epic's receive path (see `matrix-authentication-channels.md` AC4/AC5; Matrix SSO option tracked there).
