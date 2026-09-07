# BUG: crypto: rotateActorKeyAndReEncrypt returns sentinel string rotated for oldKeyId

**Status:** ✅ Resolved (verified 2026-09-07; bookkeeping)
**Priority:** low
**Effort:** Medium

## Summary

src/crypto/key-rotation/rotate.ts lines 50-55: rotateActorKeyAndReEncrypt returns oldKeyId: "rotated" (hardcoded sentinel) instead of the actual old key id. Callers comparing or logging oldKeyId get a meaningless value; the only test passes accidentally. Fix: return the real old key id. Also the function name implies re-encryption but no longer does; rename to rotateActorKey.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Ticket claims are stale on dev HEAD (2026-09-07):

- `rotateActorKeyAndReEncrypt` no longer exists. The function was renamed
  to `rotateActorKey` and the re-encrypt side of the operation was
  dropped because post-migration-054 chat keys are stable per-chat
  random keys (deriveChatKeyForChat), independent of actor keys
  (`src/crypto/key-rotation/rotate.ts:1-15`).
- `oldKeyId` is now computed from `listActorKeys` at
  `src/crypto/key-rotation/rotate.ts:44-45`:
  `oldKeys.find((k) => k.status === "primary" || k.status === "active")?.id
  ?? "unknown"`. The hardcoded `"rotated"` sentinel is gone.
- `messagesReEncrypted` is always `0` for `rotateActorKey`; the
  integration test at `src/crypto/key-rotation-history.integration.test.ts:160-186`
  asserts `result.messagesReEncrypted === 0` already.

Pin regression coverage added:
- `src/crypto/key-rotation/rotate.test.ts` — 3 unit cases assert:
  1. `oldKeyId` matches the real pre-rotation `actor_keys.id`, never
     the `"rotated"` sentinel;
  2. `messagesReEncrypted === 0` always;
  3. when the actor has no primary/active key, `oldKeyId === "unknown"`
     (not `"rotated"`).

The function name (`rotateActorKey`) and the contract (no
re-encryption) are both correct on dev; the ticket body was written
against an older shape that pre-dated the post-054 stable-key design.
