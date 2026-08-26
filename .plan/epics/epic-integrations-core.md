<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Integrations Core

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** integrations, protocols, bridge, encryption, monitoring
**Parent Epic:** Communications Integrations (epic-communications-integrations.md)

## Summary

Shared integration infrastructure for loop-lore: the `ProtocolAdapter` abstraction, `MessageBridge`, and `EncryptionProvider` interfaces that every protocol integration (Matrix, XMPP, IM, Email) implements against, plus the integration config UI skeleton, health monitoring, rate limiting, and logging.

## Sub-Epic of

Part of the **Communications Integrations** epic. See parent epic for full scope and slicing rationale.

This is the foundation slice: **all protocol sub-epics implement `ProtocolAdapter` against these abstractions** and should land after (or alongside) this epic.

## Scope

- Protocol abstraction layer (`ProtocolAdapter`)
- Message bridge between loop-lore chats and external protocols
- Encryption provider abstraction (`EncryptionProvider`)
- Integration config UI skeleton
- Integration status dashboard
- Connection health monitoring
- Per-protocol rate limiting
- Integration logging and observability

## Design

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

// Implementations live in their owning sub-epics:
// - MatrixAdapter   (epic-matrix-integration.md)
// - XmppAdapter     (epic-xmpp-integration.md)
// - ImAdapter       (epic-im-integrations.md, unified layer)
// - EmailAdapter    (epic-email-integration.md)
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

### Encryption Layer (interface only)

```typescript
// src/integrations/encryption.ts
export interface EncryptionProvider {
  encrypt(message: Message): Promise<EncryptedMessage>;
  decrypt(message: EncryptedMessage): Promise<Message>;
  generateKeys(): Promise<KeyPair>;
}

// Concrete providers live in their owning sub-epics:
// - MatrixEncryption (Olm/Megolm) — epic-matrix-integration.md
// - OmemoEncryption  — epic-xmpp-integration.md
// - PgpEncryption    — epic-email-integration.md
```

Key material and primitives come from the encryption foundation epic.

## Tasks

- [ ] Create integration config UI (`src/frontend/alpine/integrations.ts`)
- [ ] Add integration status dashboard
- [ ] Implement connection health monitoring
- [ ] Add rate limiting per protocol
- [ ] Create integration test suite
- [ ] Add integration logging and observability
- [ ] Document security considerations in `docs/security/integrations.md`

## Files

- `src/integrations/protocols/adapter.ts` — Protocol adapter interface
- `src/integrations/bridge.ts` — Message bridge
- `src/integrations/encryption.ts` — Encryption provider interface
- `src/frontend/alpine/integrations.ts` — Integration UI skeleton
- `docs/security/integrations.md` — Security considerations

## Dependencies

- Depends on: **Communications Integrations** hub (epic-communications-integrations.md)
- Depends on: `epic-encryption-foundation.md` (key management primitives behind `EncryptionProvider`)
- Depends on: `epic-api-library-distribution.md` (API surface exposed to external tools)
- Required by: `epic-matrix-integration.md`, `epic-xmpp-integration.md`, `epic-im-integrations.md`, `epic-email-integration.md` (all implement `ProtocolAdapter` against this epic)

## Open Questions

- Should rate limits be configurable per adapter instance or global per protocol?
- Does the config UI skeleton need a plugin registration point for protocol-specific settings panels?
