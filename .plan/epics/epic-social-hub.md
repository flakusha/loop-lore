<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Social Hub — Epic

## Overview

Centralized hub for messengers, social networks, and email integration. Unified message handling, cross-platform bridging, and modern alternatives to legacy email.

## Motivation

Users communicate across many platforms. SillyTavern-like apps need to:

- Respond to messages from any platform
- Maintain context across channels
- Bridge conversations between platforms
- Explore modern alternatives to email (which is outdated)

## Architecture

```
src/social-hub/
├── index.ts                  # Social Hub main entry
├── hub.ts                    # Central hub coordinator
├── adapters/                 # Platform adapters
│   ├── adapter.ts            # Adapter interface
│   ├── discord.ts
│   ├── telegram.ts
│   ├── whatsapp.ts
│   ├── signal.ts
│   ├── slack.ts
│   ├── matrix.ts
│   ├── xmpp.ts
│   ├── irc.ts
│   ├── bluesky.ts
│   ├── mastodon.ts
│   ├── twitter.ts
│   └── reddit.ts
├── email/                    # Email subsystem
│   ├── email.ts              # Email manager
│   ├── imap.ts               # IMAP client
│   ├── smtp.ts               # SMTP client
│   ├── pgp.ts                # PGP encryption
│   ├── modern/               # Modern alternatives
│   │   ├── nostr.ts          # Nostr protocol
│   │   ├── atproto.ts        # AT Protocol (Bluesky)
│   │   ├── activitypub.ts    # ActivityPub
│   │   └── mls.ts            # Messaging Layer Security
│   └── migration.ts          # Email → modern migration
├── bridge/                   # Cross-platform bridging
│   ├── bridge.ts             # Bridge manager
│   ├── transformers.ts       # Message format transformation
│   └── sync.ts               # Conversation sync
├── routing/                  # Message routing
│   ├── router.ts             # Message router
│   ├── rules.ts              # Routing rules engine
│   └── priority.ts           # Priority queue
├── identity/                 # Identity management
│   ├── identity.ts           # Cross-platform identity
│   ├── profiles.ts           # Platform profiles
│   └── sync.ts               # Identity sync
├── notifications/            # Notification management
│   ├── notifications.ts      # Notification center
│   ├── rules.ts              # Notification rules
│   └── channels.ts           # Notification channels
└── api/                      # REST API
    ├── social-hub.ts         # Hub API
    ├── adapters.ts           # Adapter management
    └── bridges.ts            # Bridge management
```

## Phases

### Phase 1: Adapter Foundation

- [ ] Define adapter interface
- [ ] Implement Discord adapter
- [ ] Implement Telegram adapter
- [ ] Implement Slack adapter
- [ ] Build adapter manager
- [ ] Create adapter configuration UI

### Phase 2: Email Modernization

- [ ] Implement IMAP/SMTP client
- [ ] Add PGP encryption support
- [ ] Research modern alternatives (Nostr, AT Protocol, MLS)
- [ ] Create email → modern migration tool
- [ ] Build email dashboard UI

### Phase 3: Cross-Platform Bridging

- [ ] Build message format transformers
- [ ] Implement conversation sync
- [ ] Add cross-platform reply support
- [ ] Create bridge configuration UI

### Phase 4: Advanced Features

- [ ] Implement message routing rules
- [ ] Add priority queue
- [ ] Create notification center
- [ ] Build analytics dashboard

## Adapter Interface

```typescript
interface SocialAdapter {
  name: string;
  platform: string;

  // Lifecycle
  connect(config: AdapterConfig,): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Messaging
  sendMessage(channel: string, message: Message,): Promise<string>;
  editMessage(channel: string, messageId: string, message: Message,): Promise<void>;
  deleteMessage(channel: string, messageId: string,): Promise<void>;

  // Receiving
  onMessage(handler: MessageHandler,): void;
  onReaction(handler: ReactionHandler,): void;
  onPresence(handler: PresenceHandler,): void;

  // Channels
  listChannels(): Promise<Channel[]>;
  getChannel(channelId: string,): Promise<Channel>;

  // Users
  listUsers(): Promise<User[]>;
  getUser(userId: string,): Promise<User>;
}
```

## Message Format

```typescript
interface Message {
  id: string;
  platform: string;
  channel: string;
  author: User;
  content: string;
  attachments: Attachment[];
  reactions: Reaction[];
  timestamp: Date;
  replyTo?: string;
  edited?: Date;
  metadata: Record<string, unknown>;
}

interface Attachment {
  type: "file" | "image" | "video" | "audio" | "link";
  url?: string;
  data?: Buffer;
  name: string;
  mimeType: string;
  size: number;
}
```

## Email Modernization

### Why Email is Outdated

| Issue            | Description                          |
| ---------------- | ------------------------------------ |
| Spam             | Constant battle, imperfect filtering |
| Phishing         | Spoofing, social engineering         |
| Encryption       | Optional, rarely default             |
| Interoperability | Proprietary extensions               |
| UX               | Thread view inconsistent             |
| Search           | Limited, inconsistent                |
| Metadata         | Exposed to providers                 |
| Centralization   | Few large providers                  |

### Modern Alternatives

| Protocol        | Type          | Features                           |
| --------------- | ------------- | ---------------------------------- |
| **Nostr**       | Decentralized | E2EE, relays, censorship-resistant |
| **AT Protocol** | Federated     | Bluesky, portable identity         |
| **ActivityPub** | Federated     | Mastodon, Matrix bridges           |
| **MLS**         | E2EE          | IETF standard, group messaging     |
| **MLS + Relay** | Hybrid        | E2EE + relay infrastructure        |

### Migration Strategy

1. Import existing email (IMAP)
2. Map contacts to modern protocols
3. Redirect mail flow
4. Archive old email
5. Provide transition period

## Security Considerations

- E2EE for all platform adapters
- OAuth2 for platform authentication
- Token rotation and refresh
- Rate limiting per platform
- Content filtering and moderation

## Related Epics

- `epic-encryption-foundation.md` — E2EE for all communications
- `epic-communications-integrations.md` — Matrix, XMPP, IM, Email
- `epic-anonymity-decentralization.md` — Tor, I2P, mesh networking
- `epic-security-sandboxing.md` — LLM sandboxing, security hardening

## Notes

- Adapter pattern allows easy addition of new platforms
- Bridge system enables cross-platform conversations
- Email modernization explores alternatives, not just replacements
- Identity system handles cross-platform presence
