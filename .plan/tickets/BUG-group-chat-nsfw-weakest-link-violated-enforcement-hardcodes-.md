# BUG: Group chat NSFW weakest-link violated + enforcement hardcodes EXTREME rating

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/middleware/nsfw-gate/access.ts:133 group chats check only actor ratings + requesting user access; participants own nsfw preferences/age-gate ignored (initiator-only gating). consent.ts:114 after base access passes, user_preference/chat_setting hardcoded to NSFW_EXTREME; actual per-user max_rating / chat override ignored by enforcement object. Minor access.ts:141 dead condition (!userAccess.allowed unreachable after :120 return). Fix: intersect all participants ratings; propagate real preferences into enforcement.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
