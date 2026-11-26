// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RSI agent token enums (TASK-recursive-self-improvement-agent-api-router-
 * and-token-scope-).
 *
 * AgentTokenScope is THE capability vocabulary of the `/api/v1/agent/*`
 * surface — one scope per token, value-for-value with the ticket's scope
 * list and the migration's `ck_agent_tokens_scope` CHECK, so the DB column
 * and the `requireAgentScope` guard cannot drift. A fifth tier,
 * `agent:tickets`, gates the ticket lifecycle endpoints (RSI #18).
 */

// ── Agent token scope tier ───────────────────────────────
export const AgentTokenScope = {
  Worktree: "agent:worktree",
  Check: "agent:check",
  Commit: "agent:commit",
  Finalize: "agent:finalize",
  Tickets: "agent:tickets",
} as const;
/** */
export type AgentTokenScope = (typeof AgentTokenScope)[keyof typeof AgentTokenScope];
