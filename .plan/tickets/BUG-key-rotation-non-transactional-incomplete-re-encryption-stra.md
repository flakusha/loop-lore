# BUG: Key rotation non-transactional + incomplete re-encryption strands history under expired keys

**Status:** ✅ Done (verified landed on dev — `rotateKeyOnLeave` wraps message re-encrypt + key swap in one Kysely transaction, calls `reEncryptChatAssets` pre-transaction, `RE_ENCRYPT_LIMIT = MAX_SAFE_INTEGER` with `includeAll: true`)
**Priority:** high
**Effort:** Medium

## Summary

src/crypto/key-distribution.ts:92 — rotateKeyOnLeave re-encrypts messages then swaps chat_keys row non-transactionally; crash between → ciphertext-under-new-key with row holding old key = permanent loss. Also never calls reEncryptChatAssets → asset blobs undecryptable after swap. src/crypto/key-rotation/rotate.ts:41 — reEncryptLimit=100 leaves older messages under old key while step 2 already expires participant actor keys → permanently undecryptable. rotate.ts:73 — actor key expired BEFORE re-encrypt; failures only log.warn and rotation succeeds (:102), stranded rows unrecoverable (LoadActorKeys filters status=active). Fix: single tx for re-encrypt+swap, cover assets+all messages, abort on failure or retain recovery path.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
