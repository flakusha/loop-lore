<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: JWT add issuer claim

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-auth-access
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

Signed JWTs now carry `iss` when `AUTH_JWT_ISSUER` is configured, and verification rejects a missing or mismatched issuer in that mode (`ba16d610c`; `src/auth/jwt.ts`). With the env unset, legacy tokens (with or without `iss`) still verify and newly signed tokens omit `iss`; authenticity continues to rest on HMAC plus live session/user-row checks.

**Context:**
Audit `.tmp/research/tls-startup-audit-2026-11-22.md` §2(f): JWT has no issuer claim. A regex search across `.plan/tickets` for `jwt issuer|iss claim|issuer claim|AUTH_JWT_ISSUER` returned zero matches, so the gap is unowned. Related tickets cover secret strength (`load/safety.ts:201-221`) and session expiry consistency, not claim shape.

## Scope

- Add a configurable issuer value (env/config) and include `iss` when signing.
- Validate `iss` on verification with a fail-closed default once configured.
- Decide and document the upgrade path for already-issued tokens (compat window vs explicit invalidation).
- Do not change HMAC algorithm, secret handling, or session/user-row checks.

## Acceptance Criteria

- [x] Newly signed tokens carry `iss` matching the configured value.
- [x] Verification rejects a token with a wrong or missing issuer when an issuer is configured.
- [x] Token upgrade path documented and covered by a regression test.
- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Verification

- `bun test src/auth/jwt.test.ts`
- `bun run typecheck`

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolved:** 2026-11-22 registry-driven close: git issue 88938c6 (registry tip: d6ec786ca Konstantin Fedotov Auto-closed: appended .md marker marks TASK-JWT-ADD-ISSUER-CLAIM done)
