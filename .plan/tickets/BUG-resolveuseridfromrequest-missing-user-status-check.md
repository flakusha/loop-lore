# BUG: resolveUserIdFromRequest missing user status check

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

Location: src/middleware/auth/token.ts (resolveUserIdFromRequest) — used by src/routes/export.ts and src/routes/export-sse/start.ts.

Symptom: resolveUserIdFromRequest resolves session.user_id from a valid JWT/session but NEVER checks users.status, unlike verifyTokenContext (authenticate.ts) which rejects UserStatus.Disabled | Deactivated. Confirmed by direct source read. Result: a disabled/deactivated user who still holds a valid session token can have their user_id resolved via this path (export routes), bypassing the disabled-user lockout that the primary auth path enforces.

Root cause: two parallel auth code paths with inconsistent checks; this one omitted the status gate.

Fix: after resolving user_id, query users.status and fall back to solo only for non-disabled users (mirror verifyTokenContext), or unify both paths on one verifier. Also: resolveUserIdFromRequest calls loadConfig() per request — accept config via DI like authenticate does.

Acceptance: disabled/deactivated user's export resolves to denial/fallback; per-request config load removed; regression test added.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
