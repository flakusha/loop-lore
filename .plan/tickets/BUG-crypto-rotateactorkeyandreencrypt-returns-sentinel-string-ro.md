# BUG: crypto: rotateActorKeyAndReEncrypt returns sentinel string rotated for oldKeyId

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

src/crypto/key-rotation/rotate.ts lines 50-55: rotateActorKeyAndReEncrypt returns oldKeyId: "rotated" (hardcoded sentinel) instead of the actual old key id. Callers comparing or logging oldKeyId get a meaningless value; the only test passes accidentally. Fix: return the real old key id. Also the function name implies re-encryption but no longer does; rename to rotateActorKey.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
