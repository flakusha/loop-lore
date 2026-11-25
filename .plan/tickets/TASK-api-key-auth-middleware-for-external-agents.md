<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: API-key auth middleware for external agents

**Status:** Done
**Status Note:** 2026-11-25 reconcile: the external-agent key auth shipped — agent token prefix `llra_` (`src/agent/api/auth.ts:40`), SHA-256 hashing (`:89`), 24h default TTL (`:48-49`), per-token rate limiting (`:203,274,286`), fail-closed on unknown/revoked keys; mint/revoke live at `src/routes/admin/agent-tokens.ts`. The filed premise (no key auth) was stale.
**Priority:** high
**Effort:** Medium
**Epic:** epic-agentic-integration-mcp-acp
**Tags:** mcp, auth, api-keys
**Depends on:** `TASK-scoped-credential-model-and-api-key-table`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Middleware resolving API keys to an external-agent principal with capability scopes (read-only, chat-write, admin), consuming the shared credential model from epic-principal-scoped-credentials (amendment B2 — replaces the former repo-access grants dependency). AMENDMENT B6: resolution is a sibling of the authenticate() derive + requireAuthGuard fail-closed pipeline (unknown key fails closed; revocation = row deletion) — never a parallel auth path.
AC: rate limits per key; key usage audited; unknown/revoked key = 401/403 with no downgrade.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Rate limits per key; key usage audited
- [ ] Unknown/revoked key = 401/403 with no downgrade
