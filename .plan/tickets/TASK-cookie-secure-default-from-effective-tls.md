<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Cookie secure default from effective TLS

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-auth-access
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

Both `ll_token` and `csrf_token` omit the Secure attribute unless the LL_COOKIE_SECURE override is explicitly set or NODE_ENV is production (`src/routes/auth/shared.ts:101-127`, `src/middleware/csrf.ts:122-135`). A direct-TLS deployment with TLS_KEY and TLS_CERT set but no proxy therefore serves session cookies over HTTPS without Secure.

**Context:**
Audit `.tmp/research/tls-startup-audit-2026-11-22.md` §1c/:59-61. `BUG-bug-csrf-cookie-secure-flag-hardcoded-true-breaks-over-plain.md` is Done and wired the LL_COOKIE_SECURE override for csrf_token, but its Out of scope note (:38) defers docs and does not change the default derivation. Production compose sets the override (`deploy/docker-compose.yml:42-46`), so only direct TLS and hand-rolled deployments are exposed.

## Scope

- Derive Secure from the effective TLS configuration when no explicit override is present; an explicit override always wins.
- Preserve plain-HTTP dev deployments (no Secure, cookies still set) and the existing HttpOnly/SameSite/Path/Max-Age attributes.
- Apply the same decision to both cookies through the existing shared helper rather than two new rules.
- Document the override and the derived default in operator docs.

## Acceptance Criteria

- [ ] With TLS configured and no override, both cookies carry Secure.
- [ ] With TLS off, both cookies remain usable over plain HTTP without Secure.
- [ ] Explicit true/false overrides continue to win in both directions.
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Verification

- `bun test src/routes/auth/shared.test.ts src/middleware/csrf.test.ts`
- `bun run typecheck`

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
