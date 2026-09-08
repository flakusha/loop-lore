# BUG: crypto: asset re-encryption runs inside DB transaction; rollback orphans assets

**Status:** ✅ Done (verified landed on dev — asset files are re-encrypted BEFORE the transaction opens; DB rollback no longer affects already-written files)
**Priority:** high
**Effort:** Medium

## Summary

src/crypto/key-distribution.ts rotateKeyOnLeave wraps reEncryptChatAssets (disk writeFileSync) inside database.transaction().execute (lines 97-146). If the txn rolls back after asset overwrite (e.g. chat_keys update at line 132 fails), DB reverts to old key but files are encrypted under new key, making them permanently undecryptable. Fix: re-encrypt asset files before opening the txn, or write-then-verify-then-commit.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
