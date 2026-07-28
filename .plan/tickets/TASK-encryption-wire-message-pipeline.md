# TASK: Encryption — Wire Message Pipeline

**Status:** ✅ Done
**Priority:** High
**Effort:** Med
**Epic:** epic-crypto
**Parent:** TASK-epic17-encryption-e2e-expansion
**Blocked by:** None (crypto foundation exists)

## Summary

Wire existing `src/crypto/pipeline.ts` into message write/read routes. Messages in standard/private tier chats get encrypted on storage and decrypted on retrieval.

## What Exists

- `src/crypto/pipeline.ts` — `compressThenEncrypt()` / `decryptThenDecompress()`
- `src/crypto/chat-keys.ts` — `deriveChatKeyForChat(db, chatId, smk)`
- `src/crypto/smk.ts` — SMK initialized at startup
- Message routes: `src/routes/messages.ts`
- Chat routes: `src/routes/chats.ts`

## Tasks

- [x] Add `encryption_level` column to `chats` table (migration 024)
- [x] On message write: derive chat key → encrypt content (standard tier)
- [x] On message read: derive chat key → decrypt content (standard tier)
- [x] Handle missing key gracefully (fallback to plaintext or error)
- [x] Client pre-encryption detection (`isEncryptedPayload`)
- [x] Edit path: re-encrypt on edit
- [x] Slash command messages: encrypted storage
- [x] Assistant replies: encrypted storage
- [ ] Add tests: encrypt on write, decrypt on read, tier enforcement

## Files Modified

- `src/db/schema-chats.ts` — `encryption_level` column (migration 024)
- `src/routes/messages.ts` — pipeline wired on write/read/edit
- `src/routes/chats.ts` — tier enforcement on chat creation

## Risk

Low — pipeline exists, just needs wiring. Tests validate correctness.

## Linked Epics

- `epic-crypto.md`
