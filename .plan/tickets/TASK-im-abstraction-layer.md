<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Instant Messaging Abstraction Layer

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Epic:** epic-communications-integrations.md

## Summary

Create unified IM abstraction layer supporting WhatsApp, Telegram, and Signal protocols.

## Tasks

### Abstraction Layer

- [ ] Create `src/integrations/im/adapter.ts` — IM adapter interface
- [ ] Create `src/integrations/im/manager.ts` — IM connection manager
- [ ] Create `src/integrations/im/config.ts` — IM configuration
- [ ] Create `src/integrations/im/status.ts` — connection status

### WhatsApp (Experimental)

- [ ] Add `whatsapp-web.js` dependency
- [ ] Implement WhatsApp Web authentication (QR code)
- [ ] Add WhatsApp message handling
- [ ] Implement WhatsApp media sharing
- [ ] Add WhatsApp presence and typing indicators

### Telegram

- [ ] Add `telegraf` or `grammy` dependency
- [ ] Implement Telegram Bot API authentication
- [ ] Add Telegram message handling
- [ ] Implement Telegram inline keyboards
- [ ] Add Telegram media sharing (photos, videos, documents)

### Signal (Experimental)

- [ ] Add `@nicepkg/signal-cli` dependency
- [ ] Implement Signal protocol integration
- [ ] Add Signal message handling
- [ ] Implement Signal group messaging
- [ ] Add Signal media sharing

### Unified UI

- [ ] Create IM config UI (`src/frontend/alpine/integrations.ts`)
- [ ] Add IM status dashboard
- [ ] Implement connection health monitoring
- [ ] Add rate limiting per protocol

## Files

- `src/integrations/im/adapter.ts`
- `src/integrations/im/manager.ts`
- `src/integrations/im/config.ts`
- `src/integrations/im/status.ts`
- `src/integrations/im/whatsapp.ts`
- `src/integrations/im/telegram.ts`
- `src/integrations/im/signal.ts`
- `src/frontend/alpine/integrations.ts`
- `docs/integrations/im.md`

## Verification

```bash
# List available IM adapters
curl http://localhost:3000/api/integrations/im/adapters

# Connect WhatsApp (shows QR code)
curl -X POST http://localhost:3000/api/integrations/im/whatsapp/connect

# Send message via Telegram
curl -X POST http://localhost:3000/api/integrations/im/telegram/send \
  -H "Content-Type: application/json" \
  -d '{"chatId": "123456789", "message": "Hello from loop-lore!"}'

# Check IM status
curl http://localhost:3000/api/integrations/im/status
```


git issue: 37b4eab
