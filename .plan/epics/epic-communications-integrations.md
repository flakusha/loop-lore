<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Communications Integrations

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High (split into 5 sub-epics)
**Type:** Feature Epic

## Summary

Enable loop-lore to integrate with external communication protocols: Matrix, XMPP, instant messaging, and email. Focus on encryption, data protection, ease of use, and exploration of new communication paradigms.

> **⚠️ This epic is too large to ship in one pass.** It has been split into 5 sub-epics below. Each sub-epic delivers independently shippable value.

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

## Sub-Epics

| Sub-Epic                 | Epic File                            | Scope                                                                                                        | Priority | Effort |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------- | ------ |
| **Integrations Core**    | `epic-integrations-core.md`          | `ProtocolAdapter`/`MessageBridge`/`EncryptionProvider` abstractions, config UI skeleton, health, rate limits | Medium   | Medium |
| **Matrix Integration**   | `epic-matrix-integration.md`         | matrix-js-sdk, E2EE (Olm/Megolm), rooms, bridging, media, presence/receipts, Discord/Slack/IRC bridges       | Medium   | High   |
| **XMPP Integration**     | `epic-xmpp-integration.md`           | xmpp.js, SASL, OMEMO, MUC, presence, Jingle file transfer, roster, vCard                                     | Medium   | Medium |
| **IM Integrations**      | `epic-im-integrations.md`            | WhatsApp Web (experimental), Telegram Bot API, Signal, unified IM UI/status dashboard                        | Medium   | Medium |
| **Email Integration**    | `epic-email-integration.md`          | imapflow/nodemailer, PGP/GPG, email-to-chat bridge, notifications, templates, filtering/search/archiving     | Medium   | Medium |

## Slicing Rationale

The original epic mixed shared infrastructure with four protocol phases. Splitting isolates the shared abstractions so protocol work can proceed independently:

1. **Integrations Core** — foundation slice. All protocol sub-epics implement `ProtocolAdapter`, `MessageBridge`, and `EncryptionProvider` against it; land first or alongside the first protocol.
2. **Matrix Integration** — largest protocol slice; also the route to Discord/Slack/IRC via appservices.
3. **XMPP / IM / Email** — independent protocol slices with no cross-dependencies between them.

## Shared Architecture

The protocol abstraction layer, message bridge, and encryption provider interface live in [epic-integrations-core.md](epic-integrations-core.md). Each protocol sub-epic owns its concrete adapter (`MatrixAdapter`, `XmppAdapter`, `ImAdapter`, `EmailAdapter`) and encryption provider implementation (`MatrixEncryption`, `OmemoEncryption`, `PgpEncryption`). Key material comes from `epic-crypto.md`.

## Dependencies

- Depends on: `epic-crypto.md` (encryption primitives — required by all sub-epics)
- Depends on: `epic-api-library-distribution.md` (API for external tools)
- Enables: Multi-platform chat, notifications, federation

## Security Considerations

Shared cross-protocol security posture (per-protocol details live in each sub-epic):

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

## Open Questions

- **Federation protocols absent:** ActivityPub/Lemmy do not appear anywhere in the current content. IRC appears only as a Matrix bridge target (via matrix-appservice-irc), not as a native integration. If federated/decentralized protocols beyond XMPP are intended, a new sub-epic (e.g. ActivityPub/Fediverse integration) is needed.
- Should experimental protocols (WhatsApp Web, Signal CLI) graduate to supported status, and under what criteria?

## Related Epics

- **epic-crypto.md** — Encryption primitives used by all protocols
- **epic-api-library-distribution.md** — API enables external tool integration
- **epic-headless-alternative-frontends.md** — IM clients as alternative frontends
