# BUG: Http1Handler.send is a silent no-op

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium

## Summary

Location: src/transport/http1.ts:28-31 (Http1Handler.send).

Symptom: send(_data) ignores its argument and returns Promise.resolve() without transmitting anything. If Http1Handler is ever wired as a real transport endpoint, outbound messages are silently dropped with no error.

Fix: Implement actual sending via the underlying Bun server/response stream, or explicitly mark the class as a non-sending stub and throw if send is called outside the intended static-serving path. At minimum, document that it is a placeholder and assert it is never used for live writes.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
