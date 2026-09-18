<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: nsfw: recordNsfwConsent INSERT+UPDATE not wrapped in a transaction

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Resolved
**Priority:** medium
**Effort:** Medium

## Summary

src/middleware/nsfw-gate/consent-ledger.ts lines 97-118 run INSERT then UPDATE as separate execute() calls with no transaction. Two concurrent given requests can revoke each others rows. Fix: wrap in database.transaction().

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

consent-ledger.ts recordNsfwConsent: INSERT + prior-given-ROW UPDATE now inside database.transaction() — concurrent given requests cannot revoke each other. (resolved 2026-09-06)
