# BUG: static-files 304 only matches a single exact If-None-Match ETag

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium

## Summary

Location: src/server/static-files.ts:113 (if (ifNoneMatch === etag)).

Symptom: Conditional requests with a list of ETags or '*' never produce a 304, so the server re-sends full bodies unnecessarily. Per RFC 7232, If-None-Match may be a comma-separated list of ETags and/or '*'.

Example: client sends If-None-Match: W/"a", W/"b" where the current asset is W/"b" -> current code compares the whole string "W/\"a\", W/\"b\"" against etag and never matches, returning 200.

Fix: Parse ifNoneMatch into tokens; match if any token equals etag (weak comparison) or the value is '*'.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution

Verified against src/ in ticket-closeout-audit: static-files.ts:159-161 If-None-Match * + comma list (RFC7232).
