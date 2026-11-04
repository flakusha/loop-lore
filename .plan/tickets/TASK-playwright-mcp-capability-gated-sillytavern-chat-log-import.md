<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Playwright MCP (capability-gated) + SillyTavern chat-log import

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-import-export-io
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Two consume/interop gaps from .tmp/research/external-brains/01-integrations.md. (1) Playwright MCP consume, capability-gated (https://playwright.dev/mcp/capabilities): reference gathering + self-QA of htmx frontend + blog-output verification; local-only. Status quo: no browser provider. (2) SillyTavern data-level interop: card V1/V2 import-export shipped (TASK-actors-import-export Done), lorebook import exists (src/routes/import/lorebook.ts) — chat-log import is the missing leg (character + lorebook + logs = full migration). Code-level ST extension hosting explicitly NOT recommended (browser-context model clashes with server-side authz).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
