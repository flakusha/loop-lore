# Actor Secret Keys & Message Encryption

## Overview

Message content encrypted at rest with **actor-level encryption keys**.
Each actor (user, character, assistant, narrator, system) can have one or
multiple keys.

- **Privacy**: DB compromise does not leak message content
- **Access Control**: Only authorized actors can decrypt
- **Key Management**: Request keys, view history, purge
- **Anonymous Mode**: Server-level setting

---

## Threat Model

| Threat                          | Mitigation                                          | Coverage |
| ------------------------------- | --------------------------------------------------- | -------- |
| DB dump / backup leak           | Content encrypted with actor keys. Keys not in DB.  | v1       |
| SQL injection                   | Parameterized queries (Kysely).                     | v1       |
| Server process memory dump      | Keys in memory only during active decrypt.          | v1       |
| Compromised server admin        | Admin has process access — holds keys.              | Out      |
| Network eavesdropping           | HTTPS.                                              | v1       |

---

## Key Hierarchy

```
┌─────────────────────────────────────┐
│         Server Master Key           │  SMK: SERVER_ENCRYPTION_KEY env var
│  (256-bit, env only, never DB)      │  or generated on first start
└──────────┬──────────────────────────┘
           │
           ├── encrypts ──► Actor Secret Keys (at rest in actor_keys table)
           │
           └── derives ──► Chat Encryption Keys (per-chat HKDF)
```

### Actor Key Table

```sql
actor_keys (
  id            TEXT PK,
  actor_id      TEXT FK → actors.id,
  name          TEXT NOT NULL,           -- 'primary', 'rotation-2024-01', etc.
  key_type      TEXT NOT NULL,           -- 'primary', 'additional'
  encrypted_key TEXT,                    -- SMK-encrypted AES-256 key
  public_key    TEXT,                    -- For key exchange (future)
  created_at    TEXT,
  expires_at    TEXT,                    -- Rotation window
  status        TEXT DEFAULT 'active'    -- 'active', 'expired', 'revoked'
)
```

---

## Key Lifecycle

### Generation

Actor primary key created on first login:
1. Server generates 256-bit random key (`crypto.randomBytes(32)`)
2. Encrypts with SMK: `AES-256-GCM(SMK, raw_key)` → `encrypted_key`
3. Stores in `actor_keys` with `name='primary'`, `status='active'`

### Distribution

```
New actor joins group chat
  → Server loads all existing participants' keys
  → For each key: encrypt with new actor's public key
  → Send encrypted key bundle to new actor
  → New actor decrypts bundle, can read history
```

**Implementation note**: Keys are distributed SMK-wrapped (server-mediated).
True E2E (client-only keys without server access) is future.

### Rotation

Rotation replaces the active chat key without breaking history:

```
1. Admin/actor triggers rotation
2. New chat key derived: HKDF(new_salt, concat(participant_keys))
3. New messages use new key
4. Old key retained with status='expired' for historical reads
5. Optional: async re-encrypt historical messages with new key
```

**Key versioning**: `messages.content` includes `key_id` referencing which
`actor_keys.id` encrypted it. Historical messages remain readable as long as
the referenced key exists (even if expired).

### Revocation

Revoking an actor's key:
1. Set `actor_keys.status = 'revoked'`
2. New chat key derived excluding revoked participant
3. Future messages unreadable by revoked actor
4. Historical messages encrypted with old key: **permanently inaccessible**
   unless re-encrypted before revocation
5. **Cannot be undone** — re-encrypt history first if retention needed

---

## Message Flow

### User Message (Write Path)

```
Client:
  1. plaintext message
  2. compress (gzip/zstd/brotli, skip if <128 bytes)
  3. encrypt with chat key (AES-256-GCM)
  4. package: {enc, nonce, algo, comp, key_id}
  5. send to server (over HTTPS)

Server:
  6. validate + store in messages.content (raw JSON blob)
  7. return message ID to client

On read by another actor:
  8. server loads content JSON
  9. decrypt with chat key → compressed bytes
  10. decompress → plaintext
  11. deliver to requesting actor
```

### LLM Response (Write Path)

```
Server:
  1. LLM API returns plaintext response
  2. (no key operation — response is fresh plaintext)
  3. compress (gzip/zstd/brotli, skip if <128 bytes)
  4. encrypt with chat key (AES-256-GCM)
  5. package: {enc, nonce, algo, comp, key_id}
  6. store in messages.content
```

**NOT sent compressed to LLM API.** LLM APIs expect plaintext. Compression
and encryption are storage-layer concerns only.

### Read Path (Deliver to Actor)

```
Client requests messages for chat
  → Server loads messages.content (JSON blobs)
  → For each: decrypt with chat key → decompress → plaintext
  → Send plaintext to client over HTTPS
```

---

## Compress-Encrypt Pipeline

### Write: `compressThenEncrypt(plaintext, chatKey) → StoredPayload`

```
Input: plaintext string
1. If length >= 128 bytes:
     try: compressed = gzip(plaintext)
     fallback: try brotli → try zstd → identity
   Else: identity (no compress)
2. nonce = random 12 bytes
3. ciphertext = AES-256-GCM(chatKey, compressed|plaintext, nonce)
4. Output: { enc: b64(ciphertext), nonce: b64(nonce), algo: "aes-256-gcm",
             comp: true|false, key_id: chatKey.id }
```

**Error cases**:
- Compression fails → fallback to identity, log warning, continue
- Encryption fails → return error to caller (no partial write)
- Both succeed → atomically write to DB

### Read: `decryptThenDecompress(payload, chatKey) → plaintext`

```
Input: stored JSON payload
1. ciphertext = b64decode(payload.enc)
2. nonce = b64decode(payload.nonce)
3. decrypted = AES-256-GCM-decrypt(chatKey, ciphertext, nonce)
4. If payload.comp:
     try: plaintext = gunzip(decrypted)
     fallback: try brotli → try zstd → identity
   Else: plaintext = decrypted
5. Output: plaintext string
```

**Error cases**:
- Decryption fails (wrong key, tampered data) → return error, log audit event
- Decompression fails → return decrypted raw bytes as-is, log warning
- Missing or malformed JSON → return error, log audit event

---

## Storage Format

Written into `messages.content` as JSON:

```json
{
  "enc": "base64-ciphertext",
  "nonce": "base64-12-byte-nonce",
  "algo": "aes-256-gcm",
  "comp": true,
  "key_id": "actor-key-uuid"
}
```

When encryption disabled (no SMK / dev mode), `messages.content` stores
plaintext directly and `content_encoding` column tracks compression format.
No JSON wrapper in dev mode.

### Encrypted Payload Size Estimate

| Plaintext | Compressed | Encrypted (b64) |
| --------- | ---------- | --------------- |
| 50 bytes  | (skip)     | ~200 bytes      |
| 1 KB      | ~450 bytes | ~700 bytes      |
| 10 KB     | ~3 KB      | ~4.5 KB         |
| 100 KB    | ~25 KB     | ~35 KB          |

---

## Error Handling

### Write Pipeline Errors

| Step | Error | Behaviour |
| ---- | ----- | --------- |
| Compress | Any failure | Log warning. Skip compression (identity). Continue to encrypt. |
| Encrypt | Key invalid | Return error. No partial write. Client retries with idempotency key. |
| Encrypt | Key revoked | Return 403. Actor must re-auth or use different key. |
| DB write | Constraint / timeout | Return 500. Idempotency key prevents duplicate on retry. |

### Read Pipeline Errors

| Step | Error | Behaviour |
| ---- | ----- | --------- |
| Decrypt | Key missing | Return 403. Actor lacks access to this message. |
| Decrypt | Auth tag mismatch | Log audit event. Return error (tampered data detected). |
| Decompress | Invalid data | Log warning. Return decrypted raw bytes as content. |
| Payload parse | Malformed JSON | Log audit event. Return error to client. |

### Key Errors

| Error | Cause | Recovery |
| ----- | ----- | -------- |
| SMK not set | `SERVER_ENCRYPTION_KEY` missing | Dev mode: skip encryption, log warning. Prod: refuse to start. |
| Actor has no key | First login race | Auto-generate on demand. |
| Key expired | Past `expires_at` | Attempt rotation. If failed, fall back to last valid key. |
| Key revoked | Actor / admin action | Irreversible. Historical messages with this key become inaccessible. |

---

## Key Management UI

Actors manage keys at `/settings/keys`:

| Action | Description |
| ------ | ----------- |
| View keys | List all owned keys with name, type, created, status |
| Request key | Download / copy primary key (re-auth required) |
| Generate key | Create additional named key |
| Rotate key | New primary, old → expired. Optionally re-encrypt history. |
| Revoke key | Irreversible. Confirm with typed "REVOKE". |
| Purge key | Delete key record. Messages become permanently inaccessible. |
| View history | Per-key message list with date/chat/role filters |
| Export history | Download as JSON, Markdown, or plain text |

---

## Implementation Status

| Component | Status | File |
| --------- | ------ | ---- |
| Client compress/decompress | ✅ Built | `src/frontend/browser.ts` |
| Client encrypt/decrypt | ✅ Built | `src/frontend/browser.ts` |
| Client key import/export/gen | ✅ Built | `src/frontend/browser.ts` |
| Compress-then-encrypt wrapper | ❌ Not built | Pipeline functions |
| Decrypt-then-decompress wrapper | ❌ Not built | Pipeline functions |
| Server SMK loading | ❌ Not built | Config + startup |
| Server actor key CRUD | ❌ Not built | Service layer |
| Server chat key derivation | ❌ Not built | HKDF service |
| Server encrypt/decrypt | ❌ Not built | crypto integration |
| Key distribution (group) | ❌ Not built | |
| Key rotation | ❌ Not built | |
| Key revocation | ❌ Not built | |
| Anonymous mode | ❌ Not built | |

---

## Anonymous Mode

`ANONYMOUS_CHAT=true` env var (future):

- Actor identities hidden from other participants
- Messages display as "Anonymous" or numbered
- Actor can still decrypt own messages
- Admin sees real identities for moderation

---

## Data Purge

### Message Purge

- Delete all messages in a chat (confirmation required)
- Delete messages older than N days
- Delete messages matching criteria (e.g. "all from character X")
- Purge marks `visibility='redacted'`, does not drop rows

### Key Purge

- Deletes encryption key record (irreversible)
- Historical messages encrypted with that key become permanently inaccessible
- Warn user about unrecoverable messages before confirming

---

## Migration Path: SMK-Only → Actor Keys

1. Generate actor keys, encrypt with SMK
2. Re-encrypt messages with actor-derived chat keys
3. Update `content.key_id` references
4. Enable key request UI
5. Phase out direct SMK-based encryption

---

## Configuration

```env
SERVER_ENCRYPTION_KEY=         # 256-bit hex. Missing = dev mode (skip encryption)
ENCRYPTION_REQUIRED=false       # true = refuse to start without SMK
KEY_ROTATION_DAYS=90            # Auto-rotate primary keys
COMPRESS_THRESHOLD=128          # Min bytes before compressing
COMPRESS_ALGORITHM=gzip         # gzip | brotli | zstd
```
