<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Integration tokens expire by default

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-auth-access
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

Newly minted `llri_` integration tokens always carry a stamped UTC expiry — 24h default, requested lifetimes clamped to 7d (`4e02dfc41`; `src/middleware/auth/integration-token.ts`). Verification now fails closed on absent, unparseable or expired stamps, so a leaked token is no longer a permanent credential; pre-policy NULL rows must be re-issued.

**Context:**
Audit `.tmp/research/tls-startup-audit-2026-11-22.md` §2(f) and §3 (Secrets/auth): issue `llri_` tokens with explicit expiry for 1.0.0. No ticket found: `TASK-asymmetric-key-pairs-followup.md` covers key-pair `expires_at`, not integration-token TTL; `TASK-enforce-rbac-tranche-1-capability-gates-on-the-create-import.md:33` only notes that `llri_` tokens have null userRole. Tokens are confined to integration surfaces (`integration-token.ts:145-163`), so the blast radius is bounded but the lifetime is not.

## Scope

- Require an explicit expiry at issuance (bounded default TTL, configurable maximum).
- Keep present-but-unparseable values failing closed; make absent expiry fail closed or be impossible to issue.
- Decide the treatment of already-issued non-expiring tokens (revoke, or assign a TTL) and document it.
- Do not change token scoping or the integration-surface allowlist.

## Acceptance Criteria

- [x] New llri_ tokens always carry an `expires_at` within the configured bound.
- [x] Expired and absent/unparseable expiry are rejected in tests.
- [x] Existing non-expiring tokens have a documented, tested migration path.
- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Verification

- `bun test src/middleware/auth/integration-token.test.ts`
- `bun run typecheck`

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
