# Social Hub — Quick Reference

## Epic Overview

**File:** `.plan/epics/epic-social-hub.md`
**Status:** Not Started
**Priority:** High
**Effort:** High

## Architecture

```
src/social-hub/
├── hub.ts                    # Central hub coordinator
├── adapters/                 # Platform adapters
│   ├── discord.ts
│   ├── telegram.ts
│   ├── slack.ts
│   └── whatsapp.ts
├── email/                    # Email subsystem
│   ├── modern/               # Modern alternatives
│   │   ├── nostr.ts          # Nostr protocol
│   │   ├── atproto.ts        # AT Protocol (Bluesky)
│   │   └── mls.ts            # Messaging Layer Security
│   └── migration.ts          # Email → modern migration
├── bridge/                   # Cross-platform bridging
├── routing/                  # Message routing
├── identity/                 # Identity management
└── notifications/            # Notification management
```

## Adapter Interface

```typescript
interface SocialAdapter {
  name: string;
  platform: string;
  connect(config: AdapterConfig,): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(channel: string, message: Message,): Promise<string>;
  onMessage(handler: MessageHandler,): void;
  listChannels(): Promise<Channel[]>;
  listUsers(): Promise<User[]>;
}
```

## Email Modernization

| Protocol    | Type          | Features                           |
| ----------- | ------------- | ---------------------------------- |
| Nostr       | Decentralized | E2EE, relays, censorship-resistant |
| AT Protocol | Federated     | Bluesky, portable identity         |
| MLS         | E2EE          | IETF standard, group messaging     |

## Related Epics

- `epic-encryption-foundation.md` — E2EE
- `epic-communications-integrations.md` — Matrix, XMPP, IM, Email
- `epic-anonymity-decentralization.md` — Tor, I2P
