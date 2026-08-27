<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Email Integration

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** email, imap, smtp, pgp, notifications
**Parent Epic:** Communications Integrations (epic-communications-integrations.md)

## Summary

Email integration for loop-lore: IMAP fetching via `imapflow`, sending via `nodemailer`, PGP/GPG encryption, email-to-chat bridging, notification emails, character-response email templates, and filtering/search/archiving.

## Sub-Epic of

Part of the **Communications Integrations** epic. See parent epic for full scope and slicing rationale.

## Scope

- IMAP connection and email fetching (`imapflow`)
- SMTP for sending emails (`nodemailer`)
- PGP/GPG encryption (via `openpgp`)
- Email-to-chat bridging
- Notification system and character-response templates
- Email filtering, rules, search, and archiving

## Design

`EmailAdapter` implements `ProtocolAdapter` and `PgpEncryption` implements `EncryptionProvider`, both defined in **epic-integrations-core.md**. Keyring management builds on `epic-crypto.md`.

```typescript
// src/integrations/email/adapter.ts
export class EmailAdapter implements ProtocolAdapter { ... }

// src/integrations/email/encryption.ts — PGP/GPG
export class PgpEncryption implements EncryptionProvider { ... }
```

Unlike chat protocols, email encryption is opportunistic: messages are stored unencrypted unless the user configures PGP for a correspondent.

## Tasks

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

## Files

- `src/integrations/email/` — Email adapter
- `docs/integrations/email.md` — Setup documentation

## Dependencies

- Depends on: **Communications Integrations** hub (epic-communications-integrations.md)
- Depends on: **Integrations Core** (epic-integrations-core.md) — implements `ProtocolAdapter`; uses health monitoring, rate limiting, config UI skeleton
- Depends on: `epic-crypto.md` (key material behind the user-managed PGP keyring)
- Siblings: independent of Matrix/XMPP/IM sub-epics; the email-to-chat bridge routes into loop-lore chats shared with those epics' outputs

## Security Considerations

| Aspect         | Approach               |
| -------------- | ---------------------- |
| Encryption     | PGP/GPG                |
| Key Management | User-managed keyring   |
| Data Storage   | Optional encryption    |

## Success Criteria

- Can receive notifications via email
- PGP-encrypted correspondence works when configured
- Email-to-chat bridge delivers inbound mail into loop-lore chats
