> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Encryption Workflow Specification

## Key Hierarchy

1. **SMK** (Server Master Key) - exists in src/crypto/smk.ts
2. **Actor Keys** - per-user keys via Argon2id, exists in src/crypto/actor-keys.ts
3. **Chat Keys** - derived per-chat, exists in src/crypto/chat-keys.ts
4. **Private Tier** - E2E encryption, NOT implemented

## DB Storage Workflow

### Public Tier (Current)

Messages stored as plaintext in `content` column.

### Standard Tier (Phase 2)

```
Write: compressThenEncrypt(plaintext, chatKey) -> stored as {
  key_id: "key-uuid",
  payload: "base64-compressed-then-encrypted",
  iv: "base64-iv"
}

Read: decryptThenDecompress(payload, chatKey) -> plaintext
```

### Private Tier (Phase 4)

Messages encrypted with user's actor key before server storage.

## Integrity Verification (Always-On Spec)

### Build-time

- Generate .integrity.json with SHA256 of all source files
- Include in build artifact at `/integrity.json`

### Runtime Verification

- Server startup verifies integrity.json against actual files
- Admin endpoint `/api/admin/integrity` shows:
  - Verified: all files match
  - Modified: list of changed files
  - Unknown: missing integrity data

### Trust Badge in UI

- Green check: verified build
- Yellow warning: modified files (encryption may be compromised)
- Red error: integrity check failed

### Implementation Note

Full implementation not possible currently - mark as aspirational in code.

## Access Control for Encrypted Content

### Private Tier

- Only chat participants with valid keys
- Key derivation: Argon2id(password) -> actor key -> chat key
- Assets inherit chat's encryption tier

### Shared Links

- Public tier chats: accessible via share token
- Standard tier: requires auth
- Private tier: share token includes encrypted key for recipient

## Archival Retention

- Default: 90 days before purge available
- Configurable by admin in system settings
- GC DB calls to be confirmed during implementation
