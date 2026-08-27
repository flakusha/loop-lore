# BUG: NSFW consent auto-granted in-memory for any logged-in user; never persisted

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/middleware/nsfw-gate/consent.ts:164 auto-consent on chat creation grants consent in-memory for any authenticated user and never persists; consentRequired check at :92 is a no-op. Server-side consent gate does not exist. Fix: add 068_consent_state migration (user_id, chat_id, action, reason, created_at, revoked_at); persist on explicit consent change; require persisted consent before gated content.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
