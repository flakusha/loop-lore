# TASK: JWT header alg/kid never asserted; fail-open route guard pattern

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/auth/jwt.ts:139 — JOSE header parsed but alg/kid/typ ignored; currently safe (HMAC key always used) but one refactor from alg-confusion. Fix: assert header decodes to {alg:'HS256',typ:'JWT'}. Also the `elysia-app.ts` `.derive` returns nulls and each route self-checks → one forgotten null-check = anonymous-by-default access (formerly `src/middleware/elysia-auth.ts` shim — deleted, see `BUG-elysia-auth-ts-dead-shim-duplicate-logic.md`). Consider reject-by-default guard plugin with opt-in public routes. Minor: login.ts:50 username enumeration (no dummy bcrypt for unknown users + distinct disabled message); nsfw-gate/access.ts:53 missing birth_date passes age check if gate accepted once; jwt.ts:170 expiry < vs <= off-by-one; token.ts:51 loadConfig() per request.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
