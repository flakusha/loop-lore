<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Anonymity & Decentralization — Quick Reference

## Epic Overview

**File:** `.plan/epics/epic-anonymity-decentralization.md`
**Status:** Not Started
**Priority:** High
**Effort:** High
**Type:** Architecture Epic
**Tags:** tor, i2p, mesh, byok, radicle, anonymous, decentralization

## Architecture

```
src/anonymity/
├── tor/                      # Tor integration
│   ├── hidden-service.ts     # .onion service
│   ├── proxy.ts              # SOCKS proxy
│   └── circuits.ts           # Circuit management
├── i2p/                      # I2P integration
│   ├── hidden-service.ts     # .b32.i2p service
│   └── proxy.ts              # HTTP proxy
├── mesh/                     # Mesh networking
│   ├── discovery.ts          # Peer discovery
│   ├── gossip.ts             # Gossip protocol
│   └── routing.ts            # Mesh routing
├── byok-mesh/                # BYOK mesh
│   ├── resource-sharing.ts   # Resource sharing
│   ├── reputation.ts         # Reputation system
│   └── ledger.ts             # Resource ledger
└── radicle/                  # Radicle integration
    └── git-ssb.ts            # Git-SSB protocol
```

## Tor

- **Hidden Service**: `.onion` address for anonymous access
- **SOCKS Proxy**: Route traffic through Tor
- **Circuit Management**: Rotate circuits for privacy

## I2P

- **Hidden Service**: `.b32.i2p` address
- **HTTP Proxy**: Route traffic through I2P
- **Floodfill**: Participate in I2P network

## Mesh Networking

- **Peer Discovery**: mDNS, DHT
- **Gossip Protocol**: Broadcast messages
- **Mesh Routing**: Route messages through peers

## BYOK Mesh

- **Resource Sharing**: GPU, CPU, storage, bandwidth
- **Reputation System**: Rate providers
- **Resource Ledger**: Track usage and settlement

## Related Epics

- `epic-encryption-foundation.md` — E2EE
- `epic-security-sandboxing.md` — Security hardening
- `epic-social-hub.md` — Platform security
