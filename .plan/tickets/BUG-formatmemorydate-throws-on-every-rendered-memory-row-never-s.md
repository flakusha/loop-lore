<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: formatMemoryDate throws on every rendered memory row — never spread onto component

**Status:** Done
**Status Note:** resolved 2026-10-25 (`fix/bug-sweep`) — formatMemoryDate implemented on the memoryPanel component (src/frontend/alpine/memory-panel.ts — delegates to memory-panel/transform.ts:85), repro pinned by new "memoryPanel.formatMemoryDate wiring" tests in src/frontend/alpine/memory-panel.test.ts (failing before: `Expected "function", received "undefined"`; 32/32 after), and the `/formatMemoryDate is not defined/` allowlist entry removed from tests/e2e/flows/browser/chat-memory-panel.browser.ts so the browser E2E now fails on regression. Gates: typecheck + eslint green (2026-10-25, worktree fix/bug-sweep, issue BUG-FORMATMEMORYDATE-THROWS-ON-EVERY-RENDERED-MEMORY-ROW-NEVER-S).
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

SYMPTOM: Every attempt to render a memory row throws a page error 'formatMemoryDate is not defined'; the row is dated via a template call that cannot resolve.

ROOT CAUSE: memory-panel.html:209 calls formatMemoryDate(mem.createdAt); the function is declared on the ChatState type (chat-types/memory-state.ts:29) and implemented in memory-panel/transform.ts, but is never merged/spread onto the memoryPanel component (src/frontend/alpine/memory-panel.ts).

EVIDENCE: Failing audit-tab run:
error: Page errors detected (3):
pageerror: formatMemoryDate is not defined
(fail) Memory panel CRUD + audit (B2) > audit tab lists this session's CRUD rows and the action filter narrows them
The browser test allowlists exactly this message so create/audit stay testable.

FIX DIRECTION: Spread/implement formatMemoryDate on the memoryPanel component.

**Context:**

Closure rationale (2026-10-25, branch `fix/bug-sweep`): formatMemoryDate implemented on the memoryPanel component (src/frontend/alpine/memory-panel.ts — delegates to memory-panel/transform.ts:85), repro pinned by new "memoryPanel.formatMemoryDate wiring" tests in src/frontend/alpine/memory-panel.test.ts (failing before: `Expected "function", received "undefined"`; 32/32 after), and the `/formatMemoryDate is not defined/` allowlist entry removed from tests/e2e/flows/browser/chat-memory-panel.browser.ts so the browser E2E now fails on regression.

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue 27901d8 (registry tip: 92ded9fcc Konstantin Fedotov Close issue)
