# Server-Side Crypto Architecture

Status: Core built. Key management UI pending.
Source: `src/crypto/` (SMK, actor keys, chat keys, pipeline, BYOK).
69 unit tests — `bun test src/crypto/`.

Encryption model: chats use public/standard/private tiers. See `docs/frontend/encryption.md`.

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

### SMK (Server Master Key)

- `src/crypto/smk.ts` — `initSmk(config)` at startup via HKDF from `SERVER_ENCRYPTION_KEY` (64 hex chars = 256 bit)
- `ENCRYPTION_REQUIRED=false` in dev skips encryption (SMK stays null)
- In-memory only. Web Crypto `AES-GCM` + `HKDF-SHA256` salt `"loop-lore-smk-v1"`

### Actor Keys — `src/crypto/actor-keys.ts`

- Each actor (user, character, narrator, system) gets keys in `actor_keys` table
- `generateActorKey()` — 32-byte random, SMK-encrypted
- `ensureActorKey()` — auto-create if missing (race-safe)
- `rotateActorKey()` — new key, old stays `expired` for historical reads
- `revokeActorKey()` — `status='revoked'`, irreversible
- `listActorKeys()` — all keys for an actor

### Chat Keys — `src/crypto/chat-keys.ts`

- Per-chat AES-256-GCM key via HKDF from all participant actor keys
- `deriveChatKeyForChat(db, chatId, smk)` + `getChatParticipantActorIds()`
- HMAC salt `"loop-lore-chat-key-v1"` for deterministic derivation

---

## Compress-Encrypt Pipeline — `src/crypto/pipeline.ts`

### Write: `compressThenEncrypt({ plaintext, chatKey, keyId, config }) → JSON`

1. If plaintext ≥ 128 bytes, try gzip → brotli → zstd (best-effort)
2. AES-256-GCM with random 12-byte nonce
3. Returns `{ enc, nonce, algo, comp, compAlgo, key_id }`

### Read: `decryptThenDecompress(storedContent, chatKey) → plaintext`

1. Parse JSON (`safeJsonParse`)
2. Decode base64, AES-256-GCM decrypt
3. Decompress if `comp=true`

### Helpers

- `isEncryptedPayload(content)` — skip double-encrypt
- `extractKeyIdFromPayload(content)` — read key_id without full decrypt

---

## BYOK — `src/crypto/byok.ts`

AES-256-GCM for API key encryption at rest. PBKDF2 from config secret (100k iterations, SHA-256).
`encryptValue(plaintext, secret)` / `decryptValue(ciphertext, secret)`.

---

## Error Handling

| Layer      | Failure                      | Behaviour                            |
| ---------- | ---------------------------- | ------------------------------------ |
| SMK        | Env missing + required=true  | Throws on startup — refuses to start |
| SMK        | Env missing + required=false | Dev mode — no encryption, warning    |
| Encrypt    | Key invalid/null             | 500. No partial write.               |
| Decrypt    | Auth tag mismatch            | Throw — tampered                     |
| Decrypt    | Key missing/revoked          | 403                                  |
| Decompress | Corrupt data                 | Return raw bytes, log warning        |
| Parse      | Malformed JSON               | Return error, log audit event        |

---

## Remaining Work

- Key management UI (`/settings/keys`)
- Wire into message write/read routes
- Group key distribution (new participant joins encrypted chat)
- Key rotation auto-trigger via `KEY_ROTATION_DAYS`
- Async re-encrypt historical messages on rotation
- Anonymous chat mode (`ANONYMOUS_CHAT=true`)
- Browser-side pre-encrypt (`src/frontend/browser.ts` exists, integration pending)
- `actor_keys.key_type` enum normalization

---

## References

- `docs/frontend/encryption.md` — frontend UX, pipeline spec, key management
- `src/crypto/index.ts` — barrel exports
- `src/db/schema-core.ts` — `actor_keys`, `messages.key_id`
- `docs/meta/plan.md` §17 — encryption foundation tasks
