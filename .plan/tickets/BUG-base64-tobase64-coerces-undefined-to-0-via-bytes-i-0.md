# BUG: base64.toBase64 coerces undefined to 0 via bytes[i] ?? 0

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

In src/utils/base64.ts, toBase64 iterates for (let i = 0; i < bytes.length; i++) and reads bytes[i] ?? 0. Since i < length, bytes[i] is undefined only for sparse/holes; the ?? 0 silently masks caller bugs instead of throwing. Tighten to bytes[i]! or assert so real underflow/type errors surface.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
