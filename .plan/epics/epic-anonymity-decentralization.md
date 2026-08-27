<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Anonymity & Decentralization — Epic

## Overview

Anonymous access via Tor/I2P, distributed infrastructure, and BYOK mesh networking for resource sharing between servers.

## Motivation

Users need:

- Anonymous access to the assistant
- Censorship-resistant deployment
- Distributed infrastructure
- P2P resource sharing between instances

## Architecture

```
src/anonymity/
├── index.ts                  # Anonymity main entry
├── tor/                      # Tor integration
│   ├── tor.ts                # Tor manager
│   ├── hidden-service.ts     # .onion hidden service
│   ├── proxy.ts              # Tor SOCKS proxy
│   ├── circuits.ts           # Circuit management
│   └── config.ts             # Tor configuration
├── i2p/                      # I2P integration
│   ├── i2p.ts                # I2P manager
│   ├── hidden-service.ts     # .b32.i2p service
│   ├── proxy.ts              # I2P HTTP proxy
│   └── config.ts             # I2P configuration
├── mesh/                     # Mesh networking
│   ├── mesh.ts               # Mesh manager
│   ├── discovery.ts          # Peer discovery
│   ├── gossip.ts             # Gossip protocol
│   ├── routing.ts            # Mesh routing
│   └── channels.ts           # Mesh channels
├── byok-mesh/                # BYOK mesh (Bring Your Own Key)
│   ├── byok.ts               # BYOK manager
│   ├── resource-sharing.ts   # Resource sharing protocol
│   ├── reputation.ts         # Reputation system
│   ├── ledger.ts             # Resource ledger
│   └── settlement.ts         # Resource settlement
├── radicle/                  # Radicle integration (optional)
│   ├── radicle.ts            # Radicle client
│   ├── git-ssb.ts            # Git-SSB protocol
│   └── collaboration.ts      # Collaborative editing
└── api/                      # REST API
    ├── anonymity.ts          # Anonymity API
    ├── mesh.ts               # Mesh API
    └── byok.ts               # BYOK API
```

## Phases

### Phase 1: Tor Integration

- [ ] Implement Tor manager
- [ ] Create hidden service (.onion)
- [ ] Add SOCKS proxy support
- [ ] Implement circuit management
- [ ] Build Tor configuration UI
- [ ] Add Tor status monitoring

### Phase 2: I2P Integration

- [ ] Implement I2P manager
- [ ] Create hidden service (.b32.i2p)
- [ ] Add HTTP proxy support
- [ ] Build I2P configuration UI
- [ ] Add I2P status monitoring

### Phase 3: Mesh Networking

- [ ] Implement mesh manager
- [ ] Add peer discovery (mDNS, DHT)
- [ ] Implement gossip protocol
- [ ] Add mesh routing
- [ ] Create mesh channels
- [ ] Build mesh dashboard UI

### Phase 4: BYOK Mesh

- [ ] Implement BYOK manager
- [ ] Add resource sharing protocol
- [ ] Implement reputation system
- [ ] Create resource ledger
- [ ] Add resource settlement
- [ ] Build BYOK dashboard UI

### Phase 5: Radicle Integration (Optional)

- [ ] Implement Radicle client
- [ ] Add Git-SSB protocol
- [ ] Implement collaborative editing
- [ ] Build Radicle dashboard UI

## Tor Integration

### Hidden Service

```typescript
interface TorHiddenService {
  id: string;
  hostname: string; // .onion address
  port: number;
  virtualPort: number;
  createdAt: Date;
  expiresAt?: Date;
}

interface TorConfig {
  socksPort: number;
  controlPort: number;
  dataDirectory: string;
  hiddenServices: TorHiddenService[];
  bridges: TorBridge[];
  useBridges: boolean;
}
```

### Circuit Management

```typescript
interface TorCircuit {
  id: string;
  path: string[]; // Exit relay, middle relays
  streamCount: number;
  createdAt: Date;
  expiresAt: Date;
}

interface TorManager {
  getCircuits(): Promise<TorCircuit[]>;
  createCircuit(): Promise<TorCircuit>;
  closeCircuit(circuitId: string,): Promise<void>;
  newIdentity(): Promise<void>;
}
```

## I2P Integration

### Hidden Service

```typescript
interface I2PHiddenService {
  id: string;
  hostname: string; // .b32.i2p address
  port: number;
  virtualPort: number;
  createdAt: Date;
}

interface I2PConfig {
  httpProxy: number;
  socksProxy: number;
  dataDirectory: string;
  hiddenServices: I2PHiddenService[];
  floodfill: boolean;
}
```

## Mesh Networking

### Peer Discovery

```typescript
interface MeshPeer {
  id: string;
  publicKey: string;
  address: string;
  port: number;
  lastSeen: Date;
  reputation: number;
  services: string[];
}

interface MeshDiscovery {
  // mDNS
  advertiseMdns(services: string[],): Promise<void>;
  discoverMdns(): Promise<MeshPeer[]>;

  // DHT
  lookupDht(key: string,): Promise<MeshPeer[]>;
  storeDht(key: string, value: Buffer,): Promise<void>;
}
```

### Gossip Protocol

```typescript
interface GossipMessage {
  id: string;
  topic: string;
  payload: Buffer;
  author: string;
  signature: string;
  timestamp: Date;
  ttl: number;
}

interface GossipProtocol {
  publish(message: GossipMessage,): Promise<void>;
  subscribe(topic: string, handler: (msg: GossipMessage,) => void,): void;
  unsubscribe(topic: string,): void;
}
```

## BYOK Mesh (Bring Your Own Key)

### Resource Sharing

```typescript
interface ResourceOffer {
  id: string;
  provider: string;
  type: "gpu" | "cpu" | "storage" | "bandwidth";
  capacity: number;
  price: number;
  currency: string;
  reputation: number;
}

interface ResourceRequest {
  id: string;
  requester: string;
  type: "gpu" | "cpu" | "storage" | "bandwidth";
  requirements: number;
  maxPrice: number;
  deadline: Date;
}

interface ResourceSession {
  id: string;
  offer: ResourceOffer;
  request: ResourceRequest;
  startTime: Date;
  endTime?: Date;
  usage: number;
  cost: number;
}
```

### Reputation System

```typescript
interface ReputationRecord {
  provider: string;
  score: number;
  transactions: number;
  positive: number;
  negative: number;
  lastUpdated: Date;
}

interface ReputationSystem {
  getReputation(provider: string,): Promise<ReputationRecord>;
  updateReputation(provider: string, score: number,): Promise<void>;
  getTopProviders(limit: number,): Promise<ReputationRecord[]>;
}
```

### Resource Ledger

```typescript
interface LedgerEntry {
  id: string;
  provider: string;
  requester: string;
  type: string;
  usage: number;
  cost: number;
  timestamp: Date;
  txHash?: string;
}

interface ResourceLedger {
  addEntry(entry: LedgerEntry,): Promise<void>;
  getEntries(provider: string,): Promise<LedgerEntry[]>;
  getBalance(provider: string,): Promise<number>;
  settle(): Promise<void>;
}
```

## Radicle Integration

### Collaborative Editing

```typescript
interface RadicleDocument {
  id: string;
  name: string;
  content: Buffer;
  author: string;
  timestamp: Date;
  signature: string;
}

interface RadicleClient {
  createDocument(doc: RadicleDocument,): Promise<void>;
  updateDocument(id: string, content: Buffer,): Promise<void>;
  getDocument(id: string,): Promise<RadicleDocument>;
  listDocuments(): Promise<RadicleDocument[]>;
}
```

## Security Considerations

- **Tor**: Hide service from public internet, resist censorship
- **I2P**: Additional anonymity layer, resist surveillance
- **Mesh**: Distribute infrastructure, resist single point of failure
- **BYOK**: Incentivize resource sharing, resist free-riding
- **Radicle**: Decentralized code collaboration, resist censorship

## Performance Considerations

- Tor/I2P: Higher latency, lower throughput
- Mesh: Variable performance based on topology
- BYOK: Resource allocation optimization
- Radicle: Consensus overhead

## Related Epics

- `epic-crypto.md` — E2EE for all communications
- `epic-security-sandboxing.md` — Security hardening
- `epic-social-hub.md` — Cross-platform communication
- `epic-api-governance.md` — API security and validation

## Notes

- Tor/I2P provide anonymity but increase latency
- Mesh networking enables distributed infrastructure
- BYOK mesh creates incentive model for resource sharing
- Radicle enables decentralized code collaboration
