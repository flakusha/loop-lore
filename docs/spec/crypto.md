# Server-Side Crypto Architecture

> **Status:** Core implementation built. Key management UI pending.
> Source: `src/crypto/` (SMK, actor keys, chat keys, pipeline, BYOK).
> 69 unit tests — run `bun test src/crypto/`.
>
> **Encryption model:** Chats use one of three tiers (public / standard /
> private) — see [`docs/frontend/encryption.md`](../frontend/encryption.md#chat-encryption-tiers).
> This doc covers the server-side crypto layer supporting standard
> (server-mediated) encryption. Private (E2E) tier requires client-side key
> exchange and external security audit before production use.

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

- Loaded once at startup via `initSmk(config)` → `smk.ts`
- Derived via HKDF from `SERVER_ENCRYPTION_KEY` env var (64 hex chars = 256 bit)
- `ENCRYPTION_REQUIRED=false` in dev skips encryption (SMK stays null)
- In-memory only — never persisted. Process restart = re-derive from env var.
- Web Crypto `AES-GCM` with `HKDF-SHA256` salt `"loop-lore-smk-v1"`

### Actor Keys

- Each actor (user, character, narrator, system) gets one+ keys in `actor_keys` table
- `generateActorKey()` — creates 32-byte random, encrypts with SMK, stores
- `ensureActorKey()` — auto-creates if missing (first-login race safe)
- `rotateActorKey()` — new key generated, old stays `expired` for historical reads
- `revokeActorKey()` — `status='revoked'`, irreversible, history inaccessible
- `listActorKeys()` — returns all keys for an actor with metadata
- Source: `actor-keys.ts` (244 lines)

### Chat Keys

- Per-chat AES-256-GCM key derived via HKDF from all participant actor keys
- `deriveChatKeyForChat(db, chatId, smk)` — loads participant keys, derives
- `getChatParticipantActorIds()` — helper for message route
- Same HMAC salt `"loop-lore-chat-key-v1"` ensures deterministic derivation
- Source: `chat-keys.ts` (105 lines)

---

## Compress-Encrypt Pipeline

Full spec at `docs/frontend/encryption.md` §Compress-Encrypt Pipeline.
Source: `pipeline.ts` (179 lines).

### Write: `compressThenEncrypt({ plaintext, chatKey, keyId, config }) → JSON`

1. If plaintext ≥ `threshold` (128 bytes), try gzip → brotli → zstd. Best-effort.
2. AES-256-GCM encrypt with random 12-byte nonce
3. Package as `EncryptedPayload` JSON: `{ enc, nonce, algo, comp, compAlgo, key_id }`

### Read: `decryptThenDecompress(storedContent, chatKey) → plaintext`

1. Parse JSON (safeJsonParse)
2. Decode base64, AES-256-GCM decrypt
3. Decompress if `comp=true` (gzip/brotli/zstd auto-detect, fallback to raw bytes)

### Helpers

- `isEncryptedPayload(content)` — detect if content is already encrypted (skip double-encrypt)
- `extractKeyIdFromPayload(content)` — read key_id without full decrypt

---

## BYOK (Bring Your Own Key)

- AES-256-GCM for API key encryption at rest
- PBKDF2 key derivation from config secret (100k iterations, SHA-256)
- `encryptValue(plaintext, secret)` / `decryptValue(ciphertext, secret)`
- Source: `byok.ts` (62 lines)

---

## Error Handling

| Layer      | Failure                          | Behaviour                                    |
| ---------- | -------------------------------- | -------------------------------------------- |
| SMK        | Env var missing + required=true  | Throws on startup — process refuses to start |
| SMK        | Env var missing + required=false | Dev mode — no encryption, warning logged     |
| Encrypt    | Key invalid/null                 | Return 500. No partial write.                |
| Decrypt    | Auth tag mismatch                | Throw — tampered data detected               |
| Decrypt    | Key missing/revoked              | Return 403 — actor lacks access              |
| Decompress | Corrupt data                     | Return decrypted raw bytes, log warning      |
| Parse      | Malformed JSON                   | Return error, log audit event                |

---

## Remaining Work

- [ ] Key management UI (`/settings/keys`) — view, rotate, revoke, export
- [ ] Server integration in message write/read routes (current: pipeline built, not wired)
- [ ] Group key distribution (new participant joins existing encrypted chat)
- [ ] Key rotation auto-trigger via `KEY_ROTATION_DAYS`
- [ ] Async re-encrypt historical messages on rotation
- [ ] Anonymous chat mode (`ANONYMOUS_CHAT=true`)
- [ ] Browser-side pre-encrypt before send (`src/frontend/browser.ts` exists, integration pending)
- [ ] `actor_keys.key_type` enum normalization (currently bare text)

---

## References

- `docs/frontend/encryption.md` — frontend encryption UX, full pipeline spec, key management UI
- `src/crypto/index.ts` — barrel exports
- `src/db/schema-core.ts` — `actor_keys`, `messages.key_id`
- `docs/meta/plan.md` §17 — encryption foundation tasks
- `docs/meta/backlog.md` — client-side encryption, deferred features
