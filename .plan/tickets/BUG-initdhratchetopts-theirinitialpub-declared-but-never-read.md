<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: InitDhRatchetOpts.theirInitialPub declared but never read

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Done (fixed by f69d0229)
**Priority:** low
**Effort:** Medium

## Summary

In src/crypto/e2e/dh-ratchet.ts, initDhRatchet(opts: InitDhRatchetOpts) receives theirInitialPub: CryptoKey but never uses it. Callers (e2e-session.ts, dh-ratchet.test.ts) pass it. Dead/misleading API. Remove from the interface and callsites, or use it to seed theirCurrentPubJwk.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
