# BUG: Legacy sha256 token-hash fallback authenticates when JWT secret unset

**Status:** ✅ Done
**Priority:** high
**Effort:** Medium

## Summary

src/middleware/auth/token.ts:75-83 — when JWT verify fails or secret unset, falls back to sha256(raw JWT) matched against token_hash: a secret-less deployment authenticates any pre-existing hash row; also hashes untrusted input into DB lookup per request. Fix: gate legacy path behind explicit config; never run with empty jwtSecret.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Verified against src/ in ticket-closeout-audit: token.ts:136 gates legacy fallback behind config.legacyOpaqueTokenFallback.
