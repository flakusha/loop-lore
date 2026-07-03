# User Secret Keys & Message Encryption

## Overview

Message content is encrypted at rest in the database. Each user has a personal secret key used to protect their data. The encryption model balances privacy (DB compromise does not leak message content) with functionality (the server needs to decrypt messages for LLM API calls and display).

---

## Threat Model

| Threat                                   | Mitigation                                                                                                                                                   | Coverage     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| DB dump / backup leak                    | Message content encrypted at rest. Keys are not in the DB.                                                                                                   | v1           |
| Unauthorized DB access via SQL injection | Parameterized queries (Kysely) prevent injection. Encryption adds defense-in-depth.                                                                          | v1           |
| Server process memory dump               | Keys held in process memory only when actively decrypting. Not persisted in logs.                                                                            | v1           |
| Compromised server admin                 | Not protected — admin has access to the server process which holds decryption keys. True end-to-end encryption would prevent LLM access and is out of scope. | Not in scope |

---

## Key Hierarchy

```
┌─────────────────────────────────────┐
│         Server Master Key           │  ← SMK: from env SERVER_ENCRYPTION_KEY
│  (256-bit, stored in env, never DB) │      or generated on first start
└──────────┬──────────────────────────┘
           │
           ├── encrypts ──► Message content (at rest)
           │
           ├── encrypts ──► User Secret Keys (at rest)
           │
           └── derives ──► Chat Encryption Keys (per-chat, derived)
```

---

## Server Master Key (SMK)

- 256-bit symmetric key, stored in environment variable `SERVER_ENCRYPTION_KEY`
- On first server start without the key set: auto-generate a key and print it to stdout (requires manual placement in `.env`)
- Format: 64-character hex string (32 bytes)
- The SMK is NEVER written to the database or logs
- If the SMK changes, all encrypted data becomes unreadable. A key rotation mechanism is a future feature.

---

## User Secret Key

Each user has a personal secret key that encrypts their sensitive data (API keys, private preferences).

**Generation**: on user registration, a 256-bit random key is generated.

**Storage**: the user's secret key is encrypted with the SMK before being stored in the `users` table (`encrypted_secret_key` column). This means:

- The user's secret key is encrypted at rest in the DB
- The server can decrypt it using the SMK when needed
- If the SMK is compromised, all user secret keys are compromised (but they were in process memory anyway)

**Purpose**:

- Encrypts LLM API keys stored in settings (API keys are never stored in plaintext)
- Future: per-chat key derivation, message-level encryption with user-selectable keys

**Password-derived fallback** (future): instead of SMK-encrypted storage, the user's secret key could be derived from their login password via Argon2id. This means the server can never decrypt user keys without the user being logged in. Not implemented in v1 due to complexity with session renewal and LLM background operations.

---

## Message Encryption

**Encrypted field**: `messages.content` — the message text/body. All other message fields (`id`, `chat_id`, `parent_id`, `sender_type`, `state`, `created_at`, `swipe_group`, `metadata`) remain in plaintext for querying and indexing.

**Algorithm**: AES-256-GCM (authenticated encryption with associated data)

**Algorithm rationale**: the choice between modern AEAD options depends on hardware and parallelism requirements. Here's the comparison for this use case:

| Algorithm         | Parallelism                                                                                | HW acceleration (x86)                                                            | Bun/Node support                                      | Nonce misuse resistance                                                      | Status                   |
| ----------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------ |
| AES-256-GCM       | **High** — CTR mode encrypts blocks independently. GHASH pipelineable.                     | AES-NI on all modern x86. BoringSSL dispatches to accelerated path.              | `crypto.createCipheriv` — native, battle-tested       | Weak — nonce reuse leaks auth key                                            | **Selected**             |
| ChaCha20-Poly1305 | **Message-level** — ChaCha20 itself is sequential, but each message is independent.        | No AES-NI needed. Fast in software. Preferred for mobile/ARM without crypto ISA. | `crypto.createCipheriv` — native                      | Strong — 192-bit nonce variant (XChaCha20) makes random collision negligible | Fallback for ARM devices |
| AES-256-GCM-SIV   | **Moderate** — SIV construction is inherently serial (two passes). CTR inside is parallel. | Same AES-NI as GCM.                                                              | Not available in BoringSSL/Bun (requires custom impl) | **Strong** — nonce reuse only leaks message equality, not key                | Not available            |
| AEGIS-256         | **Very high** — 4-way SIMD pipeline, 32 bytes/round. Fastest AEAD on AES-NI hardware.      | AES-NI + SSSE3. ~2-3x faster than AES-GCM on modern x86.                         | Not available in BoringSSL/Bun                        | Weak (same as GCM)                                                           | Future candidate         |

**Why AES-256-GCM wins for v1**:

- Available in Bun's `crypto` module (BoringSSL) without native addons
- Hardware-accelerated via AES-NI on all modern server CPUs
- GCM is parallelizable at the block level (CTR mode), which means decryption of a single message leverages SIMD
- At the application level, per-message encryption is trivially parallel — each message is an independent operation, so we can encrypt/decrypt batches of messages concurrently regardless of cipher choice
- Well-audited, universally implemented, no footguns with correct nonce generation
- The nonce collision risk (birthday bound at ~2^32 messages) is acceptable for a chat application — at 1M messages/day it would take ~100 years to reach

**Future migration path**: if Bun adds native AEGIS support, or if ARM servers without AES-NI dominate deployment, swap the algorithm by (a) updating `encryption_algo` column on the messages table and (b) running a background re-encryption job. The key hierarchy and storage format remain identical.

---

### Message Compression

Content is compressed **before** encryption. This serves two purposes:

- **Storage efficiency**: LLM responses are often verbose markdown (2-5KB per message). Compression reduces storage by 60-70% for typical chat text.
- **Cryptographic hygiene**: compressed plaintext has no predictable byte patterns, making cryptanalysis harder. The attacker cannot distinguish "weather talk" from "API keys" by ciphertext size alone.

**Algorithm**: `deflate-raw` (zlib without the zlib header) — available in Bun as `Bun.deflateSync` / `Bun.inflateSync`. Chosen over `gzip` (smaller overhead without CRC) and `brotli` (not universally available for streaming in Bun).

**Threshold**: messages under 128 bytes are stored uncompressed (compression header overhead exceeds savings). The `comp` field in the storage JSON tracks this.

**Write path**:

1. Plaintext → if length > 128 bytes, compress with deflate-raw → if compressed is smaller, mark `comp: true`
2. Compressed (or original short) plaintext → encrypt with AES-256-GCM → store as JSON

**Read path**:

1. Decrypt ciphertext → if `comp: true`, decompress with inflate-raw → return plaintext
2. If `comp: false`, return decrypted plaintext directly

**Performance impact**: deflate on 5KB of text completes in <10μs on modern CPUs. This is negligible compared to AES-256-GCM decryption (~1μs for the same size) and the LLM API call that follows.

---

**AEAD associated data**: `chat_id + message_id` — binds the ciphertext to a specific message. If an attacker swaps encrypted messages between chats, decryption fails.

**Per-message nonce**: a random 12-byte nonce is generated for each message and stored alongside the ciphertext.

**Storage format**: the `content` column stores a JSON blob:

```json
{
  "enc": "base64-encoded ciphertext",
  "nonce": "base64-encoded 12-byte nonce",
  "algo": "aes-256-gcm",
  "comp": true
}
```

- `algo`: algorithm used (allows future rotation to AEGIS, ChaCha20, etc. without data loss)
- `comp`: whether the plaintext was compressed before encryption (see below)

In v1, the `content` column type changes from `TEXT` to `TEXT` (still text, but now JSON). A migration updates existing messages to flag them as unencrypted (legacy messages display normally, but new messages use encryption).

**Legacy messages**: existing plaintext messages are NOT encrypted retroactively in v1. A `content_format` column on the `messages` table tracks the format:

- `"plain"` — raw text, no encryption
- `"encrypted"` — AES-256-GCM encrypted JSON blob
- `"empty"` — message has no content (deleted or system-only)

---

## API Key Encryption

LLM API keys stored in user settings are encrypted with the user's secret key (which itself is SMK-encrypted at rest).

- When the user saves API settings: the plaintext API key is encrypted with the user's secret key before being stored in the settings table
- When the server needs to make an LLM API call: it decrypts the user's secret key via SMK, then decrypts the API key
- API keys are never stored in plaintext in the DB
- API keys are never logged (sanitized in server logs)

---

## Encryption Flow (Message Write/Read)

**Write path**:

1. User sends message → server receives plaintext
2. Server encrypts plaintext with SMK + random nonce → ciphertext JSON
3. Ciphertext JSON written to `messages.content`
4. `messages.content_format` set to `"encrypted"`
5. Non-encrypted fields (`chat_id`, `parent_id`, etc.) written in plaintext

**Read path**:

1. Server reads message row from DB
2. If `content_format = "encrypted"`: decrypt ciphertext using SMK + nonce from the JSON
3. If `content_format = "plain"`: return as-is (legacy compatibility)
4. Decrypted content served to client or LLM pipeline

---

## Key Rotation (Future)

Not in v1. Provides a path for future implementation.

- SMK rotation: re-encrypt all user secret keys with the new SMK. Messages are NOT re-encrypted (they use the old SMK) — a `key_version` column on messages tracks which key was used.
- User secret key rotation: decrypt the old key, generate a new key, re-encrypt API settings.
- Key rotation triggers a one-time background job. The UI shows "encrypting messages..." during rotation.

---

## Implementation Notes (v1)

- Use Node.js `crypto` module (built into Bun): `crypto.createCipheriv('aes-256-gcm', key, nonce)`
- SMK loaded once at server startup from `SERVER_ENCRYPTION_KEY` env var
- Decrypted content is held in memory only for the duration of the request/LLM call — never written to disk or logs
- The encryption layer is transparent to the client (htmx/Alpine). The server encrypts on write, decrypts on read. The client never sees ciphertext.
- If SMK is not set on first start: log a warning and skip encryption (all content stored as `plain`). This allows development without requiring key setup. Production should fail if SMK is missing.
