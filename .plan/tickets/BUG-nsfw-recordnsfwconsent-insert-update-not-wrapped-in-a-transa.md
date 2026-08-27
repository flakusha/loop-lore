# BUG: nsfw: recordNsfwConsent INSERT+UPDATE not wrapped in a transaction

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/middleware/nsfw-gate/consent-ledger.ts lines 97-118 run INSERT then UPDATE as separate execute() calls with no transaction. Two concurrent given requests can revoke each others rows. Fix: wrap in database.transaction().

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
