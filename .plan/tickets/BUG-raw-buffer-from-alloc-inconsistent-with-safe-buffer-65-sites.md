# BUG: raw Buffer.from/alloc inconsistent with safe-buffer — 65 sites

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-code-quality

## Summary

**Severity**: NIT

**Scope**: 65 call sites use raw `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe` without routing through `src/utils/safe-buffer/`.

**Root cause**: project has `src/utils/safe-buffer/` (`safeFromUint8Array`, `safeFromBase64`, `safeCompress`, `safeFromString`) — provides consistent error handling and avoids unsafe `allocUnsafe` in hot paths. Many existing sites are fine (encoding specified), but new code and untrusted/arrayBuffer paths should prefer the safe utils.

**Fix direction**:

- New code: always use `safe-buffer` utils.
- Existing: audit untrusted-input paths (`Buffer.from(userInput)`, `Buffer.from(arrayBuffer)`) — route those through `safeFromUint8Array`. Trusted fixed-encoding sites (`Buffer.from(str, 'utf8')`) are acceptable as-is.
- Use `safeFromBase64` for base64 decode paths.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
