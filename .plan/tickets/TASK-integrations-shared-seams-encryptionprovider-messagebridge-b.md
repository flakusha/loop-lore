<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Integrations shared seams: EncryptionProvider, MessageBridge, BridgeRegistry

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-integrations-core.md

**Summary:**

Implement the three planning-only seams from epic-integrations-core.md against the real ProtocolAdapter in src/integrations/adapter.ts: (1) src/integrations/encryption.ts — EncryptionProvider interface (encrypt/decrypt/generateKeys); (2) src/integrations/bridge.ts — MessageBridge routing loop-lore chats to ProtocolAdapters; (3) BridgeRegistry registering/unregistering ProtocolAdapters with declared capabilities per FEAT-messaging-bridge-extensions (auth-challenge/auth-approval caps already in adapter.ts). Do NOT conflate with MeshEncryptionProvider in src/federation/encryption.ts (mesh-specific, separate). AC: EmailAdapter/PgpEncryption/MatrixAdapter implementable against new seams; unit tests for registry capability negotiation; bun run check green. Depends on: epic-integrations-core.md. Epic: epic-integrations-core.md.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
