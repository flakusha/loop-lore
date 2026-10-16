<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: MCP tool-call audit + invocation records

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** `epic-harness-integration`
**Depends on:** `TASK-harness-mcp-client-wrapper`
**Related:** docs/meta/research/harness-mcp-wiring.md, TASK-harness-mcp-server-surface.md

**Summary:**

Every tool invocation (MCP or native) writes an audit row attributed to its parent generation run. Key trap, verified in the research doc: `HarnessRunRecord.tools` records the tools OFFERED to the model (populated from `req.tools` at the egress seam, `call-with-failover.ts:43,66`), not the tools INVOKED — a name appearing in `tools` is not an invocation record.

**Context:**

External-runtime tool calls are the one class of invocation with no audit trail today; the IDEA-level requirement is "every invocation audited". `memory_audit_log` cannot hold a non-memory tool, so this needs a generic audit table (or an `AuditLogEntry` extension), plus attribution plumbing so the row lands on the harness run.

**Acceptance Criteria:**

- [ ] Each `tools/call` writes one audit row (generic audit table or `AuditLogEntry` extension — decision recorded); timestamp, tool name, caller identity, parent run id
- [ ] Row is attributed to the parent generation run so it surfaces in the harness exec log / query surface
- [ ] Audit-write failure never fails the tool call (best-effort, logged once — same posture as the exec-log append)
- [ ] Test proves `tools` (offered) ≠ invocation rows (invoked): a run offering 3 tools and invoking 1 writes exactly 1 audit row
- [ ] `bun run check` green

## Technical Notes

- The offered-vs-invoked distinction is the whole reason this ticket exists separately from the exec log; the doc's caveat at :235-239 is the ground truth.


git issue: 1710a00
