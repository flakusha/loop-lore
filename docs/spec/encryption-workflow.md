> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Encryption Workflow Specification

**Status:** Core pipeline built and wired. Tier system, key distribution, at-rest layer done.
**Source:** `src/crypto/` (pipeline, smk, actor-keys, chat-keys, key-distribution, at-rest, e2e/key-bundle, user-keys)

---

## Key Hierarchy

```
SERVER_ENCRYPTION_KEY (env var, hex 64 chars = 256 bit)
  └─ HKDF-SHA256 → SMK (AES-256-GCM CryptoKey, in-memory only)
       └─ AES-256-GCM encrypts each actor's raw key
            └─ actor_keys table (SMK-encrypted, one row per key)
                 └─ HKDF(concat(participant_raw_keys)) → ChatKey
                      └─ Encrypts messages.content per chat
```

1. **SMK** (Server Master Key) — `src/crypto/smk.ts` ✅
2. **Actor Keys** — per-user keys via Argon2id — `src/crypto/actor-keys.ts` ✅
3. **Chat Keys** — derived per-chat — `src/crypto/chat-keys.ts` ✅
4. **User Keys** — passphrase-based — `src/crypto/user-keys.ts` ✅
5. **E2E Key Bundles** — symmetric key wrapping — `src/crypto/e2e/key-bundle.ts` ✅

## Encryption Tiers

Chats have three encryption levels, set at creation via `chats.encryption_level`:

| Tier | Behaviour | Status |
|------|-----------|--------|
| `public` | Plaintext, no crypto | ✅ Built |
| `standard` | Server-mediated AES-256-GCM via chat keys | ✅ Built |
| `private` | E2E — clients pre-encrypt, server cannot decrypt | ⬜ Not wired |

## Compress-Encrypt Pipeline — `src/crypto/pipeline.ts` ✅

### Write: `compressThenEncrypt({ plaintext, chatKey, keyId, config })`

1. If `plaintext.length >= threshold` (default 128 bytes), try compression: gzip → brotli → zstd (best-effort, fallback to identity)
2. AES-256-GCM encrypt with random 12-byte nonce
3. Returns JSON string: `{ enc, nonce, algo, comp, compAlgo, key_id }`

### Read: `decryptThenDecompress(storedContent, chatKey)`

1. Parse JSON (`safeJsonParse`)
2. Base64 decode, AES-256-GCM decrypt
3. Decompress if `comp=true`

### Helpers

- `isEncryptedPayload(content)` — detect encrypted content (skip double-encrypt)
- `extractKeyIdFromPayload(content)` — read key_id without full decrypt

### Pipeline Configuration

```typescript
interface PipelineConfig {
  threshold: number;    // COMPRESS_THRESHOLD (default 128)
  algorithm: "gzip" | "brotli" | "zstd";  // COMPRESS_ALGORITHM
}
```

## At-Rest Layer — `src/crypto/at-rest.ts` ✅

Tier-aware wrapper around the pipeline:

- `encryptAtRest({ database, chatId, plaintext, encryptionLevel, config })` — encrypts based on tier
- `decryptAtRest({ database, chatId, storedContent, encryptionLevel })` — decrypts based on tier
- `needsEncryption(encryptionLevel, storedContent)` — check if content needs encryption
- `getChatEncryptionLevel(database, chatId)` — read tier from DB

## Key Distribution — `src/crypto/key-distribution.ts` ✅

- `distributeKeysOnJoin(database, chatId, actorId)` — wrap chat key for new participant
- `rotateKeyOnLeave(database, chatId, actorId)` — rotate key when participant leaves
- `resolveChatKey(database, chatId, smk)` — get current chat key

## DB Storage Format

### Standard Tier

`messages.content` stores the encrypted JSON payload directly. `messages.key_id` references the chat key used.

### Public Tier

`messages.content` stores plaintext. `messages.key_id` is null.

### Dev Mode (no SMK)

`messages.content` stores plaintext. `messages.content_encoding` tracks compression format. No JSON wrapper.

## Route Integration — `src/routes/messages.ts` ✅

### Write Path (POST /api/chats/:id/messages)

1. Client sends message
2. If `isEncryptionEnabled()`:
   - `ensureActorKey()` for sender
   - `deriveChatKeyForChat()` for chat
   - `compressThenEncrypt()` → stored content
3. Store `content`, `key_id`, `content_encoding`

### Read Path (GET /api/chats/:id/messages)

1. Load messages from DB
2. For each message: `resolveMessageContent()` → decrypt if `key_id` present
3. Return plaintext to client

### Edit Path (PATCH /api/messages/:id)

1. If `isEncryptedPayload(newContent)` — client pre-encrypted, store as-is
2. Else if encryption enabled — server-side encrypt
3. Else — store plaintext

## Key Management Routes — `src/routes/key-management.ts` ✅

- `GET /api/keys` — list actor's keys
- `POST /api/keys/generate` — generate new key
- `POST /api/keys/:id/rotate` — rotate key
- `POST /api/keys/:id/revoke` — revoke key (irreversible)

## Chat Key Endpoint — `src/routes/message-encryption.ts` ✅

- `GET /api/chats/:id/encryption-key` — returns derived chat key (base64)

## Error Handling

| Layer | Failure | Behaviour |
|-------|---------|-----------|
| SMK | Env missing + required=true | Throws on startup — refuses to start |
| SMK | Env missing + required=false | Dev mode — no encryption, warning |
| Encrypt | Key invalid/null | 500. No partial write. |
| Decrypt | Auth tag mismatch | Throw — tampered |
| Decrypt | Key missing/revoked | 403 |
| Decompress | Corrupt data | Return raw bytes, log warning |
| Parse | Malformed JSON | Return error, log audit event |

## Configuration

```shell
SERVER_ENCRYPTION_KEY=         # 256-bit hex. Missing = dev mode (skip encryption)
ENCRYPTION_REQUIRED=false       # true = refuse to start without SMK
KEY_ROTATION_DAYS=90            # Auto-rotate primary keys (NOT YET IMPLEMENTED)
COMPRESS_THRESHOLD=128          # Min bytes before compressing
COMPRESS_ALGORITHM=gzip         # gzip | brotli | zstd
```

## Remaining Work

| Item | Priority | Blocked By |
|------|----------|------------|
| Auto-key rotation (cron/timer) | Medium | None |
| Asset encryption | Medium | Wire message pipeline (done) |
| Time-based access expiry | Medium | Group key distribution (done) |
| World/Location encryption | Low | Schema design |
| Asymmetric key pairs (E2E) | Low | Architecture clarification |
| Browser pre-encrypt integration | Medium | Feature detection, fallbacks |
| Key management UI (frontend) | Medium | Routes exist, UI pending |
| Crypto test isolation fix | High | ~20 failures in full suite |
| Anonymous chat mode | Medium | ✅ Done |

## References

- `docs/frontend/encryption.md` — frontend UX, full pipeline spec, tiers, threat model
- `docs/spec/crypto.md` — server-side crypto architecture
- `src/crypto/index.ts` — barrel exports
- `src/db/schema-core.ts` — `actor_keys`, `messages.key_id`
- `.plan/epics/epic-crypto.md` — encryption epic
- `.plan/tickets/TASK-epic17-encryption-e2e-expansion.md` — status tracker
