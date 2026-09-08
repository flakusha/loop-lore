# BUG: crypto: ActivityPub key rotation is non-atomic; insert failure drops all signing keys

**Status:** ✅ Done (verified landed on dev — expire + insert wrapped in a single `database.transaction()`)
**Priority:** high
**Effort:** Medium

## Summary

src/crypto/activitypub-keys.ts generateActivityPubKey does UPDATE-expire (lines 69-74) then INSERT (lines 76-88) as two separate execute() calls with no transaction. If the INSERT fails, all keys are marked rotated and the actor has zero active keys, breaking federation. Fix: wrap both in database.transaction().

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
