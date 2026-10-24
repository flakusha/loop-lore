<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: formatMemoryDate throws on every rendered memory row — never spread onto component

**Status:** Not Started
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

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
