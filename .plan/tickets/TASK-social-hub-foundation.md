<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Social Hub Foundation

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-social-hub.md

## Summary

Implement adapter interface, Discord/Telegram/Slack adapters, and adapter manager.

## Tasks

### Adapter Interface

- [ ] Define adapter interface (`src/social-hub/adapters/adapter.ts`)
- [ ] Create message types and events
- [ ] Implement adapter lifecycle (connect, disconnect, reconnect)
- [ ] Add adapter configuration schema

### Discord Adapter

- [ ] Implement Discord adapter (`src/social-hub/adapters/discord.ts`)
- [ ] Add message sending/receiving
- [ ] Implement channel management
- [ ] Add user presence tracking
- [ ] Support attachments and embeds

### Telegram Adapter

- [ ] Implement Telegram adapter (`src/social-hub/adapters/telegram.ts`)
- [ ] Add bot token authentication
- [ ] Implement message sending/receiving
- [ ] Add inline keyboard support
- [ ] Support media attachments

### Slack Adapter

- [ ] Implement Slack adapter (`src/social-hub/adapters/slack.ts`)
- [ ] Add OAuth2 authentication
- [ ] Implement message sending/receiving
- [ ] Add block kit support
- [ ] Support threads and reactions

### Adapter Manager

- [ ] Create adapter manager (`src/social-hub/hub.ts`)
- [ ] Implement adapter registration
- [ ] Add adapter lifecycle management
- [ ] Create adapter configuration API
- [ ] Build adapter dashboard UI

## Files

- `src/social-hub/adapters/adapter.ts`
- `src/social-hub/adapters/discord.ts`
- `src/social-hub/adapters/telegram.ts`
- `src/social-hub/adapters/slack.ts`
- `src/social-hub/hub.ts`

## Verification

```bash
# Connect Discord adapter
curl -X POST http://localhost:3000/api/social-hub/adapters/discord/connect \
  -H "Content-Type: application/json" \
  -d '{"token": "discord-bot-token"}'

# List adapters
curl http://localhost:3000/api/social-hub/adapters

# Send message via Discord
curl -X POST http://localhost:3000/api/social-hub/adapters/discord/send \
  -H "Content-Type: application/json" \
  -d '{"channel": "channel-id", "message": "Hello from Loop-Lore!"}'
```
