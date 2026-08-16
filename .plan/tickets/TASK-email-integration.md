<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Email Integration

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-communications-integrations.md

## Summary

Integrate email via IMAP/SMTP with PGP encryption for notifications and character correspondence.

## Tasks

### Core Email

- [ ] Install `imapflow` and `nodemailer` dependencies
- [ ] Create `src/integrations/email/imap.ts` — IMAP client
- [ ] Create `src/integrations/email/smtp.ts` — SMTP client
- [ ] Create `src/integrations/email/auth.ts` — email authentication
- [ ] Create `src/integrations/email/config.ts` — email configuration

### PGP Encryption

- [ ] Add `openpgp` dependency
- [ ] Implement PGP key generation
- [ ] Add PGP encryption/decryption
- [ ] Implement key management UI
- [ ] Add PGP signature verification

### Email-to-Chat Bridge

- [ ] Implement email → loop-lore message conversion
- [ ] Add loop-lore → email message conversion
- [ ] Implement email threading and replies
- [ ] Add email attachment handling
- [ ] Implement email forwarding rules

### Notification System

- [ ] Create email notification templates
- [ ] Implement notification preferences
- [ ] Add email scheduling
- [ ] Implement email rate limiting
- [ ] Add email delivery status tracking

### Email Management

- [ ] Implement email search and filtering
- [ ] Add email archiving
- [ ] Implement email labeling/folders
- [ ] Add email templates for character responses
- [ ] Create email dashboard UI

## Files

- `src/integrations/email/imap.ts`
- `src/integrations/email/smtp.ts`
- `src/integrations/email/auth.ts`
- `src/integrations/email/config.ts`
- `src/integrations/email/pgp.ts`
- `src/integrations/email/bridge.ts`
- `src/integrations/email/notifications.ts`
- `src/integrations/email/templates/`
- `src/frontend/alpine/email.ts`
- `docs/integrations/email.md`

## Verification

```bash
# Connect to IMAP server
curl -X POST http://localhost:3000/api/integrations/email/connect \
  -H "Content-Type: application/json" \
  -d '{"host": "imap.example.com", "port": 993, "user": "user@example.com", "pass": "password"}'

# Send email
curl -X POST http://localhost:3000/api/integrations/email/send \
  -H "Content-Type: application/json" \
  -d '{"to": "recipient@example.com", "subject": "Hello", "body": "From loop-lore!"}'

# Check email status
curl http://localhost:3000/api/integrations/email/status
```
