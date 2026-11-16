<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: lsp-token-auth-permissions

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-editor-lsp-integration.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

`initializationOptions.token` mapped to userId with isolation-gate enforcement, read-only completion auto-allow via `classifyPermission`, and every turn audited in `tool_call_audit`.

**Description:**

Gate the server on a caller token passed in `initializationOptions`: token → userId lookup, missing/unknown token rejects `initialize`. Completion turns run through the isolation-gate (master switch + admin role + profile allowlist); because completion is read-only, `classifyPermission` auto-allows it, while any edit/exec path requires approval and stays behind the repo-access gate (`internal-service` only at repo root, grants vocab, escalation queue, no auto-approve). Every turn is written to facade `tool_call_audit`.

**Context:**

Research verdict auth/perms row: identical for helix/mitos and vim/nvim paths. No Copilot-style token scraping — admin-configured official flow only. Depends on `TASK-lsp-stdio-server-skeleton`.

**Acceptance Criteria:**

- [ ] Missing/unknown token rejects `initialize` with a clear error
- [ ] Completion turn is auto-allowed (read-only) and appears in `tool_call_audit`
- [ ] Edit/exec attempts from the completion path are denied by the repo-access gate
- [ ] Tests passing
- [ ] Documentation updated
