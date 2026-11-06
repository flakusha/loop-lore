<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: byok-settings-ui

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-byok-api-keys

**Summary:**

Add/list/revoke UI for user API keys in the frontend settings surface (BYOK epic's ":214-219,236" not-shipped item). Research findings (2026-11-05 credential pass): the API surface is already key-material-safe — `POST /api/user-api-keys` (`src/routes/api-keys.ts`, `requireUserId`, refuses without `encryptionKey`, provider names validated against configured `openaiCompatible` instances) and `GET` returns only `provider_name` + timestamps, never key material; cross-user isolation is enforced by `(user_id, provider_name)` scoping and asserted by tests (`src/routes/api-keys.coverage.test.ts:171-188`). DELETE drops only loop-lore's row (no upstream revocation, epic ":145-146") — the UI copy must say the upstream provider key stays live. Note the epic's ":104-111,209-212" still describes the older non-fatal fallback in `registry.ts`; current behavior is fail-closed in `src/generation/providers/user-api-key.ts`.

**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Acceptance Criteria:**

- [ ] Settings UI supports add / list / revoke for per-provider user API keys
- [ ] No key material is ever rendered back to the client (matches GET's no-material contract)
- [ ] Cross-user isolation preserved (own rows only)

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
