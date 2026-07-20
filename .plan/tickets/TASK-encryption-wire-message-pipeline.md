# TASK: Encryption — Wire Message Pipeline

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Med
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

- [ ] Add `encryption_tier` column to `chats` table (public/standard/private)
- [ ] On message write: if tier ≠ public, derive chat key → encrypt content
- [ ] On message read: if tier ≠ public, derive chat key → decrypt content
- [ ] Handle missing key gracefully (fallback to plaintext or error)
- [ ] Add tests: encrypt on write, decrypt on read, tier enforcement

## Files to Modify

- `src/db/schema-chats.ts` — add `encryption_tier` column
- `src/db/migrations/` — migration for new column
- `src/routes/messages.ts` — wire pipeline on write/read
- `src/routes/chats.ts` — enforce tier on chat creation

## Risk

Low — pipeline exists, just needs wiring. Tests validate correctness.
