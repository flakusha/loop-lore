<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: JWT add issuer claim

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-auth-access
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

Signed JWTs carry no `iss` (issuer) claim; the code marks this as an explicit TODO (`src/auth/jwt.ts:210-211`). Authenticity currently rests only on HMAC plus live session/user-row checks, so tokens are not bound to an identifiable issuer.

**Context:**
Audit `.tmp/research/tls-startup-audit-2026-11-22.md` §2(f): JWT has no issuer claim. A regex search across `.plan/tickets` for `jwt issuer|iss claim|issuer claim|AUTH_JWT_ISSUER` returned zero matches, so the gap is unowned. Related tickets cover secret strength (`load/safety.ts:201-221`) and session expiry consistency, not claim shape.

## Scope

- Add a configurable issuer value (env/config) and include `iss` when signing.
- Validate `iss` on verification with a fail-closed default once configured.
- Decide and document the upgrade path for already-issued tokens (compat window vs explicit invalidation).
- Do not change HMAC algorithm, secret handling, or session/user-row checks.

## Acceptance Criteria

- [ ] Newly signed tokens carry `iss` matching the configured value.
- [ ] Verification rejects a token with a wrong or missing issuer when an issuer is configured.
- [ ] Token upgrade path documented and covered by a regression test.
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Verification

- `bun test src/auth/jwt.test.ts`
- `bun run typecheck`

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
