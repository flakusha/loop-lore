# BUG: resolveUserIdFromRequest missing user status check

**Status:** [OK] Resolved (worktree fix-csrf-hardening-batch → commit c9ca8edd)
**Priority:** medium
**Effort:** Small

## Summary

Location: src/middleware/auth/token.ts (resolveUserIdFromRequest) — used by src/routes/export.ts and src/routes/export-sse/start.ts.

Symptom: resolveUserIdFromRequest resolves session.user_id from a valid JWT/session but NEVER checks users.status, unlike verifyTokenContext (authenticate.ts) which rejects UserStatus.Disabled | Deactivated. Confirmed by direct source read. Result: a disabled/deactivated user who still holds a valid session token can have their user_id resolved via this path (export routes), bypassing the disabled-user lockout that the primary auth path enforces.

Root cause: two parallel auth code paths with inconsistent checks; this one omitted the status gate.

Fix: after resolving user_id, query users.status and fall back to solo only for non-disabled users (mirror verifyTokenContext), or unify both paths on one verifier. Also: resolveUserIdFromRequest calls loadConfig() per request — accept config via DI like authenticate does.

Acceptance: disabled/deactivated user's export resolves to denial/fallback; per-request config load removed; regression test added.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing (14/14 auth.test.ts on dev HEAD c9ca8edd: 7 pre-existing + 3 new status-gate cases for Disabled/Deactivated/Active + others)
- [x] Documentation updated (this ticket + code comments + commit message)
