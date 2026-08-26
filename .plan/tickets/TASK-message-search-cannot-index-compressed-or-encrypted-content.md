# TASK: message search cannot index compressed or encrypted content

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** review-dev-2026-08-26-security-data-integrity-merges

## Summary

FTS5 indexes stored bytes: base64 for gzip rows, the encryption envelope for encrypted rows. After the read-path leak fix (e8e7a23d), the API no longer returns ciphertext, but large (over 10KB, gzip-stored) and encrypted messages are still UNSEARCHABLE - documented as accepted policy in message-search.test.ts. Index a decompressed or plaintext search column (or stored snippet) so these messages are retrievable. Pre-existing limitation, now tracked.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
