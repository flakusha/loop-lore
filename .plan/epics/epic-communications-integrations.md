<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Communications Integrations

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic

## Summary

Enable loop-lore to integrate with external communication protocols: Matrix, XMPP, instant messaging, and email. Focus on encryption, data protection, ease of use, and exploration of new communication paradigms.

## Motivation

Users want to:

- Chat with loop-lore characters via Matrix/XMPP clients
- Receive notifications via email or IM
- Bridge loop-lore chats to external networks
- Export/import conversations across platforms
- Maintain privacy with end-to-end encryption

## Core Principles

| Principle           | Implementation                                              |
| ------------------- | ----------------------------------------------------------- |
| **Encryption**      | E2EE for Matrix (Olm/Megolm), OMEMO for XMPP, PGP for email |
| **Data Protection** | Local-first, no cloud dependencies, user-controlled data    |
| **Ease of Use**     | Auto-configuration, bridge discovery, minimal setup         |
| **Exploration**     | Plugin architecture for experimental protocols              |

## Scope

### Phase 1: Matrix Integration

- Matrix client SDK integration
- E2EE support (Olm/Megolm)
- Room creation and management
- Message bridging (loop-lore ↔ Matrix)
- Bridge to other networks (Discord, Slack, IRC)

### Phase 2: XMPP Integration

- XMPP client connection
- OMEMO encryption support
- MUC (Multi-User Chat) support
- Presence and status
- File transfer via Jingle

### Phase 3: Instant Messaging

- WhatsApp Web protocol (experimental)
- Telegram Bot API
- Signal protocol (via libsignal)
- Unified IM abstraction layer

### Phase 4: Email Integration

- IMAP/SMTP support
- PGP/GPG encryption
- Email-to-chat bridging
- Notification emails
- Email templates for character responses

## Architecture

### Protocol Abstraction Layer

```typescript
// src/integrations/protocols/adapter.ts
export interface ProtocolAdapter {
  name: string;
  connect(config: ProtocolConfig): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(target: string, message: Message): Promise<void>;
  onMessage(handler: MessageHandler): void;
  isEncrypted(): boolean;
}

// Implementations
export class MatrixAdapter implements ProtocolAdapter { ... }
export class XmppAdapter implements ProtocolAdapter { ... }
export class EmailAdapter implements ProtocolAdapter { ... }
```

### Message Bridge

```typescript
// src/integrations/bridge.ts
export class MessageBridge {
  constructor(
    private loopLore: LoopLoreInstance,
    private protocols: ProtocolAdapter[],
  ) {}

  async bridgeMessage(
    source: ProtocolAdapter,
    target: ProtocolAdapter,
    message: Message,
  ): Promise<void> {
    // Transform, encrypt, route
  }
}
```

### Encryption Layer

```typescript
// src/integrations/encryption.ts
export interface EncryptionProvider {
  encrypt(message: Message): Promise<EncryptedMessage>;
  decrypt(message: EncryptedMessage): Promise<Message>;
  generateKeys(): Promise<KeyPair>;
}

// Matrix: Olm/Megolm
export class MatrixEncryption implements EncryptionProvider { ... }

// XMPP: OMEMO
export class OmemoEncryption implements EncryptionProvider { ... }

// Email: PGP
export class PgpEncryption implements EncryptionProvider { ... }
```

## Tasks

### Phase 1: Matrix Integration

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

### Phase 2: XMPP Integration

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

### Phase 3: Instant Messaging

- [ ] Create IM abstraction layer (`src/integrations/im/`)
- [ ] Add WhatsApp Web protocol (experimental, via `whatsapp-web.js`)
- [ ] Implement WhatsApp message handling
- [ ] Add Telegram Bot API support
- [ ] Create Telegram bot integration
- [ ] Add Signal protocol support (via `@nicepkg/signal-cli`)
- [ ] Implement unified IM config UI
- [ ] Add IM status dashboard
- [ ] Document IM setup in `docs/integrations/im.md`

### Phase 4: Email Integration

- [ ] Add IMAP/SMTP libraries (`imapflow`, `nodemailer`)
- [ ] Create `src/integrations/email/` module
- [ ] Implement IMAP connection and email fetching
- [ ] Add SMTP for sending emails
- [ ] Implement PGP/GPG encryption
- [ ] Create email-to-chat bridge
- [ ] Add email notification system
- [ ] Create email templates for character responses
- [ ] Implement email filtering and rules
- [ ] Add email search and archiving
- [ ] Document email setup in `docs/integrations/email.md`

### Cross-Cutting Concerns

- [ ] Create integration config UI (`src/frontend/alpine/integrations.ts`)
- [ ] Add integration status dashboard
- [ ] Implement connection health monitoring
- [ ] Add rate limiting per protocol
- [ ] Create integration test suite
- [ ] Add integration logging and observability
- [ ] Document security considerations in `docs/security/integrations.md`

## Files

- `src/integrations/` — integration modules
- `src/integrations/matrix/` — Matrix adapter
- `src/integrations/xmpp/` — XMPP adapter
- `src/integrations/im/` — IM abstraction layer
- `src/integrations/email/` — Email adapter
- `src/integrations/protocols/adapter.ts` — Protocol interface
- `src/integrations/bridge.ts` — Message bridge
- `src/integrations/encryption.ts` — Encryption providers
- `src/frontend/alpine/integrations.ts` — Integration UI
- `docs/integrations/` — Protocol documentation
- `docs/security/integrations.md` — Security considerations

## Dependencies

- Depends on: `epic-encryption-foundation.md` (encryption primitives)
- Depends on: `epic-api-library-distribution.md` (API for external tools)
- Enables: Multi-platform chat, notifications, federation

## Security Considerations

| Protocol | Encryption        | Key Management                  | Data Storage               |
| -------- | ----------------- | ------------------------------- | -------------------------- |
| Matrix   | E2EE (Olm/Megolm) | Server-managed, cross-signing   | Encrypted locally          |
| XMPP     | OMEMO             | Device keys, trust on first use | Encrypted locally          |
| Email    | PGP/GPG           | User-managed keyring            | Optional encryption        |
| WhatsApp | Signal Protocol   | Server-managed                  | End-to-end                 |
| Telegram | MTProto           | Server-managed                  | Cloud or local secret chat |
| Signal   | Signal Protocol   | Server-managed                  | End-to-end                 |

## Success Criteria

- [ ] Can chat with loop-lore characters via Matrix client
- [ ] Can chat with loop-lore characters via XMPP client
- [ ] Can receive notifications via email
- [ ] E2EE works for Matrix and XMPP
- [ ] Bridge loop-lore chat to Discord/Slack
- [ ] All integrations configurable via UI
- [ ] Integration health dashboard shows status
- [ ] Documentation covers setup for each protocol

## Related Epics

- **epic-encryption-foundation.md** — Encryption primitives used by all protocols
- **epic-api-library-distribution.md** — API enables external tool integration
- **epic-headless-alternative-frontends.md** — IM clients as alternative frontends
