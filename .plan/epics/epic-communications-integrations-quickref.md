<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Communications Integrations — Quick Reference

## Epic Overview

**File:** `.plan/epics/epic-communications-integrations.md`
**Status:** Not Started
**Priority:** Medium
**Effort:** High

## Four Phases

### Phase 1: Matrix Integration

- **Protocol:** Matrix (federated, E2EE)
- **Tasks:** 14 tasks
- **Key Features:** E2EE (Olm/Megolm), room management, Discord/Slack bridges
- **File:** `TASK-matrix-integration.md`

### Phase 2: XMPP Integration

- **Protocol:** XMPP (extensible, OMEMO)
- **Tasks:** 10 tasks
- **Key Features:** OMEMO encryption, MUC support, file transfer via Jingle
- **File:** `TASK-xmpp-integration.md`

### Phase 3: Instant Messaging

- **Protocols:** WhatsApp, Telegram, Signal
- **Tasks:** 12 tasks
- **Key Features:** Unified IM abstraction, experimental protocols
- **File:** `TASK-im-abstraction-layer.md`

### Phase 4: Email Integration

- **Protocol:** IMAP/SMTP, PGP
- **Tasks:** 12 tasks
- **Key Features:** Email-to-chat bridge, PGP encryption, notification system
- **File:** `TASK-email-integration.md`

## Cross-Cutting

**File:** `TASK-integration-infrastructure.md`

- Protocol abstraction layer
- Encryption providers
- Message bridge
- Monitoring and UI

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
