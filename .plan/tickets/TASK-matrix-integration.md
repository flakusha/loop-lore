# TASK: Matrix Integration

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-communications-integrations.md

## Summary

Integrate Matrix protocol for federated, encrypted messaging with loop-lore characters.

## Tasks

### Core Integration

- [ ] Install `matrix-js-sdk` dependency
- [ ] Create `src/integrations/matrix/client.ts` — Matrix client wrapper
- [ ] Create `src/integrations/matrix/auth.ts` — authentication (access token, login)
- [ ] Create `src/integrations/matrix/rooms.ts` — room management
- [ ] Create `src/integrations/matrix/messages.ts` — message handling

### E2EE Support

- [ ] Implement Olm/Megolm encryption
- [ ] Add key backup and recovery
- [ ] Implement cross-signing for device verification
- [ ] Add E2EE status indicators

### Message Bridging

- [ ] Implement loop-lore → Matrix message forwarding
- [ ] Implement Matrix → loop-lore message ingestion
- [ ] Add message transformation (format, media, reactions)
- [ ] Implement typing indicators and read receipts

### Room Management

- [ ] Create room from loop-lore chat
- [ ] Add room invitation handling
- [ ] Implement room state sync
- [ ] Add file/media sharing via Matrix content API

### Network Bridging

- [ ] Configure matrix-appservice-discord for Discord bridge
- [ ] Configure matrix-appservice-slack for Slack bridge
- [ ] Add bridge health monitoring
- [ ] Document bridge setup

## Files

- `src/integrations/matrix/client.ts`
- `src/integrations/matrix/auth.ts`
- `src/integrations/matrix/rooms.ts`
- `src/integrations/matrix/messages.ts`
- `src/integrations/matrix/e2ee.ts`
- `src/integrations/matrix/bridge.ts`
- `docs/integrations/matrix.md`

## Verification

```bash
# Connect to Matrix homeserver
bun run src/integrations/matrix/test-connection.ts

# Send message to Matrix room
curl -X POST http://localhost:3000/api/integrations/matrix/send \
  -H "Content-Type: application/json" \
  -d '{"roomId": "!abc:matrix.org", "message": "Hello from loop-lore!"}'

# Check E2EE status
curl http://localhost:3000/api/integrations/matrix/e2ee/status
```
