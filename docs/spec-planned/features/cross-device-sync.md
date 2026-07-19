# Cross-Device E2E Sync Implementation

## Overview

End-to-end encrypted messages synchronized across devices. Users can access chats from multiple endpoints.

## Implementation

### Sync Protocol

```typescript
// src/sync/protocol.ts
export interface SyncRequest {
  deviceId: string;
  lastSync: string; // ISO timestamp
  since: string; // Optional cursor
}

export interface SyncResponse {
  messages: EncryptedMessage[];
  assets: AssetMetadata[];
  keyUpdates: KeyUpdate[];
}

export interface EncryptedMessage {
  id: string;
  chatId: string;
  encryptedContent: string;
  keyId: string;
  timestamp: string;
}

export interface KeyUpdate {
  type: "key_rotation" | "new_key" | "revoked";
  keyId: string;
  encryptedKey: string; // For device-specific key wrapping
}
```

### Device Registration

```typescript
// src/sync/device-registration.ts
export async function registerDevice(
  userId: string,
  deviceInfo: {
    name: string;
    type: "mobile" | "desktop" | "web";
    publicKey: string;
  },
): Promise<string> {
  const deviceId = crypto.randomUUID();

  await db
    .insertInto("user_devices",)
    .values({
      id: deviceId,
      user_id: userId,
      name: deviceInfo.name,
      type: deviceInfo.type,
      public_key: deviceInfo.publicKey,
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
    },)
    .execute();

  return deviceId;
}

// src/db/schema-core.ts
export interface UserDevices {
  id: Generated<string>;
  user_id: string;
  name: string;
  type: "mobile" | "desktop" | "web";
  public_key: string;
  created_at: Generated<string>;
  last_seen: Generated<string>;
}
```

### Sync Endpoint

```typescript
// src/routes/sync.ts
export async function GET(req: Request,) {
  const user = await authenticate(req,);
  const deviceId = req.headers.get("X-Device-ID",);
  const lastSync = req.query.get("since",);

  // Get messages since last sync
  const messages = await db
    .selectFrom("messages",)
    .selectAll()
    .where("chat_id", "in", user.chatIds,)
    .where("created_at", ">", lastSync,)
    .execute();

  // Wrap each message's key for this device
  const encryptedMessages = await Promise.all(
    messages.map(async (msg,) => ({
      id: msg.id,
      chatId: msg.chat_id,
      encryptedContent: msg.content, // Already encrypted
      keyId: msg.key_id,
      timestamp: msg.created_at,
    })),
  );

  return success(200, {
    messages: encryptedMessages,
    timestamp: new Date().toISOString(),
  },);
}
```

### Conflict Resolution

```typescript
// Last-write-wins with vector clocks
export interface VectorClock {
  [deviceId: string]: number;
}

export function resolveConflict(
  local: EncryptedMessage,
  remote: EncryptedMessage,
  clock: VectorClock,
): EncryptedMessage {
  // Compare vector clocks
  const localTime = clock[local.deviceId] || 0;
  const remoteTime = clock[remote.deviceId] || 0;

  return localTime >= remoteTime ? local : remote;
}
```

## Edge Cases

- Device offline > 30 days → require re-auth
- Key revoked on one device → revoke on all
- Message edited on multiple devices → vector clock resolve
- Large sync payload → paginate (max 1000 messages)
- Device compromised → remote wipe capability
- Sync during active chat → merge seamlessly

## Security Considerations

- Device keys never leave the device
- Master key wrapped per-device
- Revoke device → re-encrypt with new keys
- Audit log of all sync operations
- Rate limit: 10 syncs/hour per device
