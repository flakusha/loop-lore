<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ACP stdio server over existing chat sessions

**Status:** Not Started
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

- [ ] ACP server implements initialize/session/new/session/prompt/session/set_config_option/streaming updates via the official ACP TS SDK, ACP v1 pinned
- [ ] Sessions map onto the EXISTING chats/generation model (no RSI Part B dependency)
- [ ] An ACP client completes a full session lifecycle; method names match the ACP v1 schema
