<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Email Modernization Exploration

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-social-hub.md

## Summary

Explore modern alternatives to email (Nostr, AT Protocol, MLS) and create migration strategy.

## Tasks

### Email Analysis

- [ ] Analyze email limitations (spam, phishing, encryption, UX)
- [ ] Research modern protocols (Nostr, AT Protocol, MLS)
- [ ] Compare protocol features and trade-offs
- [ ] Document migration challenges

### Protocol Research

- [ ] Research Nostr protocol (E2EE, relays, censorship-resistant)
- [ ] Research AT Protocol (Bluesky, portable identity)
- [ ] Research MLS (IETF standard, group messaging)
- [ ] Research ActivityPub (federation, Mastodon bridges)

### Migration Strategy

- [ ] Design email → modern protocol migration
- [ ] Create contact mapping system
- [ ] Implement mail flow redirection
- [ ] Design archive strategy
- [ ] Plan transition period

### PoC Implementation

- [ ] Implement Nostr adapter PoC
- [ ] Implement AT Protocol adapter PoC
- [ ] Test migration workflow
- [ ] Document findings and recommendations

## Files

- `src/social-hub/email/modern/nostr.ts`
- `src/social-hub/email/modern/atproto.ts`
- `src/social-hub/email/modern/mls.ts`
- `src/social-hub/email/migration.ts`

## Verification

```bash
# Research output
cat docs/research/email-modernization.md

# Test Nostr adapter
curl -X POST http://localhost:3000/api/social-hub/email/nostr/connect \
  -H "Content-Type: application/json" \
  -d '{"relay": "wss://relay.damus.io"}'

# Test AT Protocol adapter
curl -X POST http://localhost:3000/api/social-hub/email/atproto/connect \
  -H "Content-Type: application/json" \
  -d '{"identifier": "user.bsky.social"}'
```
