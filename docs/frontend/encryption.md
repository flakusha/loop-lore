> ⚠️ **Status:** NOT IMPLEMENTED. Client-side encryption/decryption, `actor_keys` table, and at-rest message encryption do NOT exist.
> Messages are stored as plaintext (optionally gzip/zstd/brotli compressed for large payloads).
> This entire spec is aspirational. See [`docs/meta/plan.md`](../meta/plan.md) "Skipped During Implementation".

---

## Threat Model

| Threat                     | Mitigation                                         | Coverage |
| -------------------------- | -------------------------------------------------- | -------- |
| DB dump / backup leak      | Content encrypted with actor keys. Keys not in DB. | v1       |
| SQL injection              | Parameterized queries (Kysely).                    | v1       |
| Server process memory dump | Keys in memory only during active decrypt.         | v1       |
| Compromised server admin   | Admin has process access — holds keys.             | Out      |
| Network eavesdropping      | HTTPS.                                             | v1       |

---

## Key Hierarchy

Encryption keys form a three-level hierarchy:

1. **Server Master Key (SMK)** — 256-bit key from `SERVER_ENCRYPTION_KEY` env var (never stored in DB). Generated on first start if env var is absent
2. **Actor Secret Keys** — Each actor (user, character, assistant, narrator, system) has one or more keys. Stored in `actor_keys` table, encrypted at rest by SMK (`AES-256-GCM(SMK, raw_key)`)
3. **Chat Encryption Keys** — Per-chat keys derived via HKDF from participant actor keys. Used for message content encryption

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

When a new actor joins a group chat, keys are distributed in four steps:

1. **Server loads** all existing participants' keys from `actor_keys` table
2. **For each key**, encrypts it with the new actor's public key (SMK-wrapped — server-mediated, not true E2E)
3. **Sends** encrypted key bundle to new actor
4. **New actor decrypts** bundle, can now read chat history

**Implementation note**: Keys are distributed SMK-wrapped (server-mediated).
True E2E (client-only keys without server access) is future.

### Rotation

Rotation replaces the active chat key without breaking history. Five steps:

1. **Admin/actor triggers rotation**
2. **New chat key derived**: `HKDF(new_salt, concat(participant_keys))`
3. **New messages** use the new key
4. **Old key** retained with `status='expired'` for historical reads (key versioning via `key_id` in `messages.content`)
5. **Optional**: Async re-encrypt historical messages with new key

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

A message travels from client to server through these steps:

**Client side:**

1. Take the plaintext message string
2. Compress (gzip/zstd/brotli, skip if `<128` bytes)
3. Encrypt with chat key (AES-256-GCM)
4. Package as JSON: `{enc, nonce, algo, comp, key_id}`
5. Send to server over HTTPS

**Server side:** 6. Validate input, store `messages.content` as raw JSON blob 7. Return message ID to client

**On read by another actor:** 8. Server loads content JSON from DB 9. Decrypt with chat key → compressed bytes 10. Decompress → plaintext 11. Deliver to requesting actor over HTTPS

### LLM Response (Write Path)

When the server receives an LLM response, it encrypts before storing:

1. LLM API returns plaintext response
2. No key operation — response is fresh plaintext
3. Compress (gzip/zstd/brotli, skip if `<128` bytes)
4. Encrypt with chat key (AES-256-GCM)
5. Package as JSON: `{enc, nonce, algo, comp, key_id}`
6. Store in `messages.content`

**Note:** The response is NOT sent compressed to the LLM API. Compression and encryption are storage-layer concerns only. LLM APIs expect plaintext.

### Read Path (Deliver to Actor)

When a client requests messages for a chat:

1. Client sends request for messages (e.g., `GET /api/chats/:id/messages`)
2. Server loads each `messages.content` JSON blob from DB
3. For each blob: decrypt with chat key → decompress → plaintext
4. Send plaintext to client over HTTPS

---

## Compress-Encrypt Pipeline

### Write: `compressThenEncrypt(plaintext, chatKey) → StoredPayload`

1. If input length ≥ 128 bytes, try compression in order: gzip → brotli → zstd. All fallbacks on failure, fallback to identity. If `<128` bytes, skip compression (identity)
2. Generate random 12-byte nonce (`crypto.randomBytes(12)`)
3. Encrypt: `AES-256-GCM(chatKey, compressed|plaintext, nonce)` → ciphertext
4. Package: `{ enc: b64(ciphertext), nonce: b64(nonce), algo: "aes-256-gcm", comp: true|false, key_id: chatKey.id }`

**Error cases:**

- Compression fails → fallback to identity, log warning, continue
- Encryption fails → return error to caller (no partial write)
- Both succeed → atomically write to DB

### Read: `decryptThenDecompress(payload, chatKey) → plaintext`

1. Decode `payload.enc` and `payload.nonce` from base64
2. Decrypt: `AES-256-GCM-decrypt(chatKey, ciphertext, nonce)` → decrypted bytes
3. If `payload.comp` is true, decompress in order: gunzip → brotli → zstd. All fallbacks on failure, return decrypted bytes as-is
4. If comp is false, return decrypted bytes directly

**Error cases:**

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

| Step     | Error                | Behaviour                                                            |
| -------- | -------------------- | -------------------------------------------------------------------- |
| Compress | Any failure          | Log warning. Skip compression (identity). Continue to encrypt.       |
| Encrypt  | Key invalid          | Return error. No partial write. Client retries with idempotency key. |
| Encrypt  | Key revoked          | Return 403. Actor must re-auth or use different key.                 |
| DB write | Constraint / timeout | Return 500. Idempotency key prevents duplicate on retry.             |

### Read Pipeline Errors

| Step          | Error             | Behaviour                                               |
| ------------- | ----------------- | ------------------------------------------------------- |
| Decrypt       | Key missing       | Return 403. Actor lacks access to this message.         |
| Decrypt       | Auth tag mismatch | Log audit event. Return error (tampered data detected). |
| Decompress    | Invalid data      | Log warning. Return decrypted raw bytes as content.     |
| Payload parse | Malformed JSON    | Log audit event. Return error to client.                |

### Key Errors

| Error            | Cause                           | Recovery                                                             |
| ---------------- | ------------------------------- | -------------------------------------------------------------------- |
| SMK not set      | `SERVER_ENCRYPTION_KEY` missing | Dev mode: skip encryption, log warning. Prod: refuse to start.       |
| Actor has no key | First login race                | Auto-generate on demand.                                             |
| Key expired      | Past `expires_at`               | Attempt rotation. If failed, fall back to last valid key.            |
| Key revoked      | Actor / admin action            | Irreversible. Historical messages with this key become inaccessible. |

---

## Key Management UI

Actors manage keys at `/settings/keys`:

| Action         | Description                                                  |
| -------------- | ------------------------------------------------------------ |
| View keys      | List all owned keys with name, type, created, status         |
| Request key    | Download / copy primary key (re-auth required)               |
| Generate key   | Create additional named key                                  |
| Rotate key     | New primary, old → expired. Optionally re-encrypt history.   |
| Revoke key     | Irreversible. Confirm with typed "REVOKE".                   |
| Purge key      | Delete key record. Messages become permanently inaccessible. |
| View history   | Per-key message list with date/chat/role filters             |
| Export history | Download as JSON, Markdown, or plain text                    |

---

## Implementation Status

| Component                       | Status       | File                      |
| ------------------------------- | ------------ | ------------------------- |
| Client compress/decompress      | ✅ Built     | `src/frontend/browser.ts` |
| Client encrypt/decrypt          | ✅ Built     | `src/frontend/browser.ts` |
| Client key import/export/gen    | ✅ Built     | `src/frontend/browser.ts` |
| Compress-then-encrypt wrapper   | ❌ Not built | Pipeline functions        |
| Decrypt-then-decompress wrapper | ❌ Not built | Pipeline functions        |
| Server SMK loading              | ❌ Not built | Config + startup          |
| Server actor key CRUD           | ❌ Not built | Service layer             |
| Server chat key derivation      | ❌ Not built | HKDF service              |
| Server encrypt/decrypt          | ❌ Not built | crypto integration        |
| Key distribution (group)        | ❌ Not built |                           |
| Key rotation                    | ❌ Not built |                           |
| Key revocation                  | ❌ Not built |                           |
| Anonymous mode                  | ❌ Not built |                           |

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
