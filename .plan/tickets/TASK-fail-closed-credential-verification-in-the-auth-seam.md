<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Fail-closed credential verification in the auth seam

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-principal-scoped-credentials
**Tags:** security, auth
**Depends on:** `TASK-scoped-credential-model-and-api-key-table`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Extend the verified existing auth seam (amendments A9/B6): verify new credential types as a sibling of the authenticate() derive + requireAuthGuard fail-closed pipeline (elysia-app.ts:107-154) — never a parallel auth path or a bypass. Unknown credential = 401/403; a presented-but-invalid credential NEVER downgrades to a lesser identity (precedent: authenticate.ts:157-165, token.ts:106-110 historical bug); revocation = row deletion.
AC: no-downgrade regression tests pin invalid-key behavior; tests carry the parallel-safe resource contract (:memory: DB per test, afterEach teardown, unique principals per test, resource-contract comments).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] No-downgrade regression tests pin invalid-key behavior
- [ ] Tests carry the parallel-safe resource contract (:memory: DB per test, afterEach teardown, unique principals, resource-contract comments)
