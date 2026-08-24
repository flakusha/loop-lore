# BUG: JWT payload parse failure yields empty object accepted as valid token

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/auth/jwt.ts:166-170 — jsonParseOr(payloadStr, {} as JwtPayload) then payload.exp < now: malformed payload gives {}, undefined < now is false, token accepted with no sub/sid/exp. Fix: validate exp/sub/sid are finite numbers, reject otherwise.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
