<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: IRC integration as group-chat (channel) + DM (PM) — RFC 1459/2812

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** large
**Type:** FEAT
**Epic:** epic-communications-integrations

## Summary

Implement IRC as a Loop Lore integration:

- **Channels** map to **group chats** (`channelName#server` → `chats` row with `kind = 'group'`).
- **Private messages (PM)** map to **DMs** (1:1 chats).
- Protocol: **RFC 1459 + 2812** (modern IRCv3 extensions welcome; cap at SASL-only auth).
- **No E2EE** in v1 — server sees plaintext (matching existing chat model).
- **Persistence** via bouncer (e.g. ZNC) or relay — the IRC adapter connects outbound, never listens inbound.

## Acceptance Criteria

- [ ] `src/social-hub/adapters/irc.ts` upgraded from stub to working adapter.
- [ ] Adapter connects via TCP+TLS (port 6697 default; 6667 plaintext opt-in).
- [ ] SASL PLAIN or EXTERNAL auth (configurable).
- [ ] Channel → group chat mapping: joining `#foo` on `irc.libera.chat` creates/joins chat with slug `{server}/{channel}`.
- [ ] PM → DM mapping: incoming PRIVMSG creates/joins 1:1 chat between sender and bot user.
- [ ] Outbound messages from Loop Lore chat render to IRC channel/PM correctly (handle IRC line-length split at 512 bytes, escape special chars per RFC 2812).
- [ ] Reconnect with exponential backoff (capped at 5 min).
- [ ] Bouncer/relay mode documented in `docs/spec/integrations/irc.md`.
- [ ] Tests:
  - Adapter unit tests with mocked TCP socket.
  - Group-chat mapping end-to-end test (mocked server).
  - PM → DM test.
  - Reconnect backoff test.
- [ ] Migration: no DB migration needed (uses existing `chats` + `messages` tables; reuse group-chat tables for channel mapping).

## Design Constraints

- **No E2EE** in v1 — Loop Lore currently has at-rest encryption via per-chat keys, but the IRC adapter sees plaintext. Document explicitly that IRC messages bypass per-chat encryption.
- **Auth model**: bot user (config-driven nickname + SASL). Users do not authenticate to IRC; they read/write Loop Lore, the adapter maps to IRC.
- **Federation/idle**: defer to a future FEAT — IRC integration does not participate in Loop Lore federation in v1.
- **Duplicate-adapter ticket**: prefer consolidating with the existing chat adapter where possible; if the duplication ticket's scope blocks this, file as a follow-up.

## Files

- `src/social-hub/adapters/irc.ts` — adapter implementation.
- `src/social-hub/adapters/irc.test.ts` — mocked TCP tests.
- `docs/spec/integrations/irc.md` — operational guide (bouncer setup, SASL, limits).
- `src/config/sections/integrations.ts` — `[integrations.irc]` config block (nick, server, channels, sasl credentials).

## Out of Scope

- IRCv3.2 capability negotiation beyond SASL.
- DCC (file transfer) — n/a, server-brokered.
- Channel mode management (op, voice) — bot runs unprivileged.
- Server-to-server (TS6/IRCv3 server protocol) — only client-side.

## Related

- `BUG-irc-integration-unscoped-as-group-chat-only-in-social-hub-ad` — predecessor scope-discovery ticket, closed 2026-09-15.
- `epic-communications-integrations.md` — parent epic.
