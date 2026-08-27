<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: XMPP Integration

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** xmpp, omemo, muc, jingle, federation
**Parent Epic:** Communications Integrations (epic-communications-integrations.md)

## Summary

XMPP integration for loop-lore: client connection via `xmpp.js`, SASL authentication, OMEMO encryption, Multi-User Chat (MUC), presence and status, file transfer via Jingle, roster management, and vCard support for character profiles.

## Sub-Epic of

Part of the **Communications Integrations** epic. See parent epic for full scope and slicing rationale.

## Scope

- XMPP client connection (`xmpp.js` or `node-xmpp-client`)
- Authentication (SASL)
- OMEMO encryption support
- MUC (Multi-User Chat) support
- Presence and status
- File transfer via Jingle
- Roster management and vCard profiles

## Design

`XmppAdapter` implements `ProtocolAdapter` and `OmemoEncryption` implements `EncryptionProvider`, both defined in **epic-integrations-core.md**. Key material comes from `epic-crypto.md`.

```typescript
// src/integrations/xmpp/adapter.ts
export class XmppAdapter implements ProtocolAdapter { ... }

// src/integrations/xmpp/encryption.ts — OMEMO
export class OmemoEncryption implements EncryptionProvider { ... }
```

## Tasks

- [ ] Add XMPP client library (`xmpp.js` or `node-xmpp-client`)
- [ ] Create `src/integrations/xmpp/` module
- [ ] Implement XMPP authentication (SASL)
- [ ] Add OMEMO encryption support
- [ ] Create MUC (Multi-User Chat) support
- [ ] Implement presence and status
- [ ] Add file transfer via Jingle
- [ ] Create XMPP → loop-lore message handling
- [ ] Implement XMPP roster management
- [ ] Add XMPP vCard support for character profiles
- [ ] Document XMPP setup in `docs/integrations/xmpp.md`

## Files

- `src/integrations/xmpp/` — XMPP adapter
- `docs/integrations/xmpp.md` — Setup documentation

## Dependencies

- Depends on: **Communications Integrations** hub (epic-communications-integrations.md)
- Depends on: **Integrations Core** (epic-integrations-core.md) — implements `ProtocolAdapter`; uses config UI skeleton, health monitoring, rate limiting
- Depends on: `epic-crypto.md` (encryption primitives behind OMEMO device keys)
- Siblings: independent of Matrix/IM/Email sub-epics; can reference epic-matrix-integration.md for feature-parity patterns (presence, receipts)

## Security Considerations

| Aspect         | Approach                         |
| -------------- | -------------------------------- |
| Encryption     | OMEMO                            |
| Key Management | Device keys, trust on first use  |
| Data Storage   | Encrypted locally                |

## Success Criteria

- Can chat with loop-lore characters via an XMPP client
- OMEMO encryption works for 1:1 and MUC conversations
