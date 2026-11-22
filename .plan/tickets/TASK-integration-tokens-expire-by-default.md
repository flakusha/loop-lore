<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Integration tokens expire by default

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-auth-access
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

`llri_` integration tokens are non-expiring by default: `expires_at` is nullable by design pending an ADR (`src/middleware/auth/integration-token.ts:93-95`). A present but unparseable value fails closed; an absent one never expires, so a leaked token is a permanent credential.

**Context:**
Audit `.tmp/research/tls-startup-audit-2026-11-22.md` §2(f) and §3 (Secrets/auth): issue `llri_` tokens with explicit expiry for 1.0.0. No ticket found: `TASK-asymmetric-key-pairs-followup.md` covers key-pair `expires_at`, not integration-token TTL; `TASK-enforce-rbac-tranche-1-capability-gates-on-the-create-import.md:33` only notes that `llri_` tokens have null userRole. Tokens are confined to integration surfaces (`integration-token.ts:145-163`), so the blast radius is bounded but the lifetime is not.

## Scope

- Require an explicit expiry at issuance (bounded default TTL, configurable maximum).
- Keep present-but-unparseable values failing closed; make absent expiry fail closed or be impossible to issue.
- Decide the treatment of already-issued non-expiring tokens (revoke, or assign a TTL) and document it.
- Do not change token scoping or the integration-surface allowlist.

## Acceptance Criteria

- [ ] New llri_ tokens always carry an `expires_at` within the configured bound.
- [ ] Expired and absent/unparseable expiry are rejected in tests.
- [ ] Existing non-expiring tokens have a documented, tested migration path.
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Verification

- `bun test src/middleware/auth/integration-token.test.ts`
- `bun run typecheck`

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
