<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: resolve message content unit test all encodings

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** low
**Effort:** Small
**Epic:** review-dev-2026-08-26-security-data-integrity-merges

## Summary

resolveMessageContent is now the single decode path (identity/gzip/brotli/zstd/encrypted). chat-history.test.ts covers identity plus gzip; no direct unit test for brotli/zstd or encrypted-without-SMK error paths. Add a focused, parallel-safe unit test (unique tmp/DB per test) asserting: gzip round-trips, brotli/zstd round-trip, invalid base64 throws (caller shows placeholder), encrypted without SMK throws.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
