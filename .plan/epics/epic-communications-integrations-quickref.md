<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Communications Integrations — Quick Reference

## Epic Overview

**File:** `.plan/epics/epic-communications-integrations.md` (hub)
**Status:** Not Started
**Priority:** Medium
**Effort:** High

The epic is split into 5 sub-epics — see the Sub-Epics table in the hub.

## Integrations Core

- **File:** `.plan/epics/epic-integrations-core.md`
- **Tasks:** 7 tasks
- **Key Features:** `ProtocolAdapter`/`MessageBridge`/`EncryptionProvider` abstractions, config UI skeleton, health monitoring, rate limiting
- **Note:** All protocol sub-epics implement `ProtocolAdapter` against this epic

## Four Phases

### Phase 1: Matrix Integration

- **Protocol:** Matrix (federated, E2EE)
- **File:** `.plan/epics/epic-matrix-integration.md`
- **Tasks:** 14 tasks
- **Key Features:** E2EE (Olm/Megolm), room management, Discord/Slack bridges

### Phase 2: XMPP Integration

- **Protocol:** XMPP (extensible, OMEMO)
- **File:** `.plan/epics/epic-xmpp-integration.md`
- **Tasks:** 11 tasks
- **Key Features:** OMEMO encryption, MUC support, file transfer via Jingle

### Phase 3: Instant Messaging

- **Protocols:** WhatsApp, Telegram, Signal
- **File:** `.plan/epics/epic-im-integrations.md`
- **Tasks:** 9 tasks
- **Key Features:** Unified IM abstraction, experimental protocols

### Phase 4: Email Integration

- **Protocol:** IMAP/SMTP, PGP
- **File:** `.plan/epics/epic-email-integration.md`
- **Tasks:** 11 tasks
- **Key Features:** Email-to-chat bridge, PGP encryption, notification system

## Architecture

```
src/integrations/
├── protocols/
│   ├── adapter.ts      # Protocol adapter interface
│   ├── registry.ts     # Protocol registry
│   └── types.ts        # Shared types
├── encryption/
│   ├── provider.ts     # Encryption interface
│   ├── matrix.ts       # Olm/Megolm
│   ├── omemo.ts        # OMEMO
│   └── pgp.ts          # PGP
├── matrix/             # Matrix adapter
├── xmpp/               # XMPP adapter
├── im/                 # IM abstraction
├── email/              # Email adapter
├── bridge.ts           # Message bridge
└── monitor.ts          # Health monitoring
```

## Key Dependencies

- `matrix-js-sdk` — Matrix client
- `xmpp.js` — XMPP client
- `whatsapp-web.js` — WhatsApp (experimental)
- `telegraf` / `grammy` — Telegram Bot API
- `@nicepkg/signal-cli` — Signal (experimental)
- `imapflow` — IMAP client
- `nodemailer` — SMTP client
- `openpgp` — PGP encryption

## Security Matrix

| Protocol | Encryption        | Key Management | Data Storage      |
| -------- | ----------------- | -------------- | ----------------- |
| Matrix   | E2EE (Olm/Megolm) | Server-managed | Encrypted locally |
| XMPP     | OMEMO             | Device keys    | Encrypted locally |
| Email    | PGP/GPG           | User-managed   | Optional          |
| WhatsApp | Signal Protocol   | Server-managed | End-to-end        |
| Telegram | MTProto           | Server-managed | Cloud/local       |
| Signal   | Signal Protocol   | Server-managed | End-to-end        |

## Related Epics

- `epic-encryption-foundation.md` — Encryption primitives
- `epic-api-library-distribution.md` — API for external tools
- `epic-headless-alternative-frontends.md` — IM as alternative frontends
