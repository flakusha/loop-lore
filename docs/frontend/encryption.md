<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> ⚠️ **Status:** Server-side crypto core built (`src/crypto/*` — 69 tests).
> Client-side (`src/frontend/browser.ts`) has encrypt/decrypt/compress but message
> route integration is NOT wired. Key management UI pending.
> This doc covers both implemented and aspirational parts — see implementation
> status table below. [`docs/spec/crypto.md`](../spec/crypto.md) for server arch.

---

## Chat Encryption Tiers

Chats have three encryption levels, set at creation and immutable afterward.
The level determines who holds keys and how content is accessed.

### 1. Public

Messages stored unencrypted or with server-side key only. Accessible without
authentication for public-facing pages. Server decrypts content for anonymous
requests.

Use for: public story pages, shared lore, demo chats.

### 2. Standard (server-mediated)

Messages encrypted at rest with actor-derived chat keys. Keys are distributed
via server when users gain access (invite, join, role promotion). Server holds
keys and decrypts for authorized users.

Use for: normal roleplay chats, group chats with permissioned access.

### 3. At-Rest (server-mediated)

Messages encrypted at rest with server-held chat keys. **The server can decrypt all
content** — this is NOT true end-to-end encryption. The server holds SMK-derived
chat keys and decrypts messages for LLM generation, search, and other server-side
processing.

Use for: chats where at-rest encryption is desired but server-side processing
(LLM generation, search, moderation) is required.

**Historical note:** This tier was previously misnamed "private" and documented as
true E2E. That was incorrect. True client-side E2E (where the server cannot
decrypt) is tracked in `.plan/tickets/TASK-asymmetric-key-pairs-followup.md`.

Rules:

- At-rest chats can feed world/location lore and global memories (server can read).
- Assets created in at-rest chats can be re-linked across chats (server can re-encrypt).
- Sharing with LLM is automatic — server decrypts for generation, re-encrypts on write.

### Immutability

Once a chat's encryption level is set, it cannot be changed. To switch levels,
clone content into a new chat with the desired level.

### Build Order

1. **Public** — ship first. No crypto dependency, validates all other chat flows.
2. **Standard** — ship second. Server-mediated, reuses existing pipeline.
3. **At-Rest** — ship third. Server-mediated (same as standard), with honest docs.

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
True client-side E2E (server cannot decrypt) is not implemented; see
`.plan/tickets/TASK-asymmetric-key-pairs-followup.md`.

### Rotation

Rotation replaces the active chat key without breaking history. Five steps:

1. Server generates new chat key
2. All current participants' keys re-derived
3. New messages encrypted with new key
4. Old key marked `expired` (retained for historical reads)
5. No re-encryption of history required

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

1. Client sends plaintext message to server
2. Server derives chat key via `deriveChatKeyForChat()`
3. Server compresses then encrypts: `compressThenEncrypt(plaintext, chatKey)`
4. Server stores encrypted payload in `messages.content`

**On read by another actor:**

1. Server loads content JSON from DB
2. Decrypt with chat key → compressed bytes
3. Decompress → plaintext
4. Deliver to requesting actor over HTTPS

### LLM Response (Write Path)

When the server receives an LLM response, it encrypts before storing:

1. Server encrypts LLM output with chat key
2. Stores encrypted payload in `messages.content`

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
| Decompress    | Invalid data      | Log warning. Return decrypted raw bytes as content.      |
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
| Purge key      | Delete key record. Messages become permanently inaccessible.  |
| View history   | Per-key message list with date/chat/role filters             |
| Export history | Download as JSON, Markdown, or plain text                    |

---

## Implementation Status

| Component                       | Status   | File / Ref                       |
| ------------------------------- | -------- | -------------------------------- |
| Client compress/decompress      | ✅ Built | `src/frontend/browser.ts`        |
| Client encrypt/decrypt          | ✅ Built | `src/frontend/browser.ts`        |
| Client key import/export/gen    | ✅ Built | `src/frontend/browser.ts`        |
| Compress-then-encrypt wrapper   | ✅ Built | `src/crypto/pipeline.ts`         |
| Decrypt-then-decompress wrapper | ✅ Built | `src/crypto/pipeline.ts`         |
| Server SMK loading              | ✅ Built | `src/crypto/smk.ts`              |
| Server actor key CRUD           | ✅ Built | `src/crypto/actor-keys.ts`       |
| Server chat key derivation      | ✅ Built | `src/crypto/chat-keys.ts`        |
| Server encrypt/decrypt          | ✅ Built | `src/crypto/pipeline.ts`         |
| BYOK (API key at-rest)          | ✅ Built | `src/crypto/byok.ts`             |
| Message route integration       | ✅ Wired | `src/routes/messages.ts`         |
| Key management UI (settings)    | ✅ Built | `src/views/settings.html`        |
| Key distribution (group)        | ✅ Built | `src/crypto/key-distribution.ts` |
| Key rotation auto-trigger       | ✅ Built | `src/crypto/key-rotation.ts`     |
| Key revocation UI               | ✅ Built | `src/views/settings.html`        |
| Anonymous mode                  | ✅ Built | `src/crypto/anonymous.ts`        |

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

## Configuration

```shell
SERVER_ENCRYPTION_KEY=         # 256-bit hex. Missing = dev mode (skip encryption)
ENCRYPTION_REQUIRED=false       # true = refuse to start without SMK
KEY_ROTATION_DAYS=90            # Auto-rotate primary keys
COMPRESS_THRESHOLD=128          # Min bytes before compressing
COMPRESS_ALGORITHM=gzip         # gzip | brotli | zstd
```
