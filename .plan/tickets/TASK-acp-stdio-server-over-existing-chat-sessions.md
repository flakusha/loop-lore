<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ACP stdio server over existing chat sessions

**Status:** In Progress
**Status Note:** 2026-11-25 reconcile: the inbound ACP stdio server shipped — `src/integrations/acp/agent-server.ts` implements initialize (`:161`), session/new (`:171`), session/list (`:199`), session/resume (`:212`), session/load (`:225`), session/set_mode (`:275`), elicitation/create (`:295`), session/prompt (`:327`) and session/cancel (`:370`) with `session/update` streaming chunks (`:263,359`); stdio attach lives in `src/integrations/acp/stdio-server.ts`. NARROWED RESIDUAL (the only open scope): inbound `session/set_config_option` (the outbound client counterpart shipped at `src/integrations/harness/generic-acp.ts:244-266`) plus the official ACP TS SDK adoption decision.
**Priority:** high
**Effort:** Large
**Epic:** epic-agentic-integration-mcp-acp
**Tags:** acp, stdio
**Depends on:** `TASK-facade-slice-chat-and-generation-ops`, `TASK-api-key-auth-middleware-for-external-agents`
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

ACP server over stdio NDJSON implementing initialize/session/new/session/prompt/session/set_config_option/streaming updates using the official ACP TS SDK (amendment B3), ACP v1 pinned (amendment B5). Sessions map to facade ops over the EXISTING chats/generation model.
AMENDMENT B2: dependence on the RSI agent API boundary is REMOVED (evaluation B7: that is an unimplemented draft; chat-session hosting needs only facade + credentials).
AC: an ACP client (omp/opencode) completes a full session lifecycle against the facade; method names match the ACP v1 schema.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] ACP server implements initialize/session/new/session/prompt/session/list/session/resume/session/load/session/set_mode/elicitation/create/session/cancel plus streaming `session/update` chunks (`src/integrations/acp/agent-server.ts:161-370`)
- [x] Sessions map onto the EXISTING chats/generation model (no RSI Part B dependency)
- [ ] RESIDUAL: inbound `session/set_config_option` case in `src/integrations/acp/agent-server.ts` (outbound counterpart shipped at `src/integrations/harness/generic-acp.ts:244-266`)
- [ ] RESIDUAL: adopt the official ACP TS SDK (or record the decision not to) for the inbound server
- [ ] An ACP client completes a full session lifecycle; method names match the ACP v1 schema
