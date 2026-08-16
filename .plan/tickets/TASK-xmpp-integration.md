<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: XMPP Integration

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-communications-integrations.md

## Summary

Integrate XMPP protocol for extensible, encrypted messaging with OMEMO support.

## Tasks

### Core Integration

- [ ] Install `xmpp.js` dependency
- [ ] Create `src/integrations/xmpp/client.ts` — XMPP client wrapper
- [ ] Create `src/integrations/xmpp/auth.ts` — SASL authentication
- [ ] Create `src/integrations/xmpp/presence.ts` — presence and status
- [ ] Create `src/integrations/xmpp/messages.ts` — message handling

### OMEMO Encryption

- [ ] Implement OMEMO key exchange
- [ ] Add device list management
- [ ] Implement trust management (TOFU, manual)
- [ ] Add OMEMO status indicators

### MUC Support

- [ ] Create Multi-User Chat support
- [ ] Implement room creation and management
- [ ] Add MUC moderation features
- [ ] Implement MUC subject and configuration

### File Transfer

- [ ] Implement Jingle file transfer
- [ ] Add HTTP upload for file sharing
- [ ] Implement file download and caching
- [ ] Add file type validation

### Roster and vCard

- [ ] Implement roster management (contact list)
- [ ] Add vCard support for character profiles
- [ ] Implement contact sync with loop-lore users
- [ ] Add avatar support via vCard

## Files

- `src/integrations/xmpp/client.ts`
- `src/integrations/xmpp/auth.ts`
- `src/integrations/xmpp/presence.ts`
- `src/integrations/xmpp/messages.ts`
- `src/integrations/xmpp/omemo.ts`
- `src/integrations/xmpp/muc.ts`
- `src/integrations/xmpp/jingle.ts`
- `src/integrations/xmpp/roster.ts`
- `src/integrations/xmpp/vcard.ts`
- `docs/integrations/xmpp.md`

## Verification

```bash
# Connect to XMPP server
bun run src/integrations/xmpp/test-connection.ts

# Send message via XMPP
curl -X POST http://localhost:3000/api/integrations/xmpp/send \
  -H "Content-Type: application/json" \
  -d '{"jid": "user@example.com", "message": "Hello from loop-lore!"}'

# Check OMEMO status
curl http://localhost:3000/api/integrations/xmpp/omemo/status
```
