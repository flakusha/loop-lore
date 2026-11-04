<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: MCP-over-ACP transport after both servers land

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

MCP-over-ACP RFD: stateless MCP over existing ACP connection. Blocked on MCP server + ACP server landing; file as sequenced follow-up. Scope: transport + scoped-credential trust story. Research: metaapp-usages mode 6.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
