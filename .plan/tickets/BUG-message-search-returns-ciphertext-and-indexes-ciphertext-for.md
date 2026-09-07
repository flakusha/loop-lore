# BUG: message search returns ciphertext and indexes ciphertext for encrypted chats

**Status:** ✅ Resolved (verified 2026-09-07; bookkeeping)
**Priority:** medium
**Effort:** Medium

## Summary

Location: src/routes/message-search/index.ts (returns m.content raw); migration 054 messages_fts triggers index stored content verbatim.

Symptom: on standard-tier chats every message body is the {enc,nonce,...} JSON envelope. FTS therefore indexes ciphertext JSON tokens (search recall = zero for real words, plus junk matches on base64 substrings), and search results return the raw envelope to the client as 'content' with matchContext snippets cut from ciphertext. Same for gzip-stored unencrypted rows (base64 indexed + returned). Search is functionally broken on encrypted/compressed content and leaks stored envelope blobs to any chat participant.

Fix directions:
- read path: resolve content via decryptAtRest/decodeContent before building the response; snippet from decoded text.
- index path: FTS cannot see plaintext of server-encrypted content without defeating the tier's purpose - decide policy: (a) exclude key_id IS NOT NULL rows from FTS (documented limitation), or (b) maintain a separate plaintext search index with explicit opt-in per chat. At minimum stop returning envelopes.

Acceptance:
- [ ] search on standard-tier chat never returns enc/nonce envelopes
- [ ] documented behavior for search vs encryption tiers
- [ ] gzip rows searchable by plaintext

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Verified on dev HEAD (2026-09-07). src/routes/message-search/index.ts:142-178 resolves each row's content via `resolveMessageContent` (decrypt + decompress) and blanks the FTS5 snippet for client-pre-encrypted rows (no plaintext mirror exists). Search results never carry raw {enc,nonce,...} envelopes or base64 gzip blobs. Covered by src/routes/message-search.test.ts (ciphertext and gzip rows handled).
