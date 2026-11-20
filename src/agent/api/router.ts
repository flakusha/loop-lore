// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RSI agent API router (TASK-recursive-self-improvement-agent-api-router-
 * and-token-scope-).
 *
 * Mounts the `/api/v1/agent/*` surface. Ticket #5 owns ONLY the surface
 * shell + token auth: `GET /agent/whoami` is the single #5-owned route (the
 * guard's observable identity probe — lets an external agent confirm its
 * token id/scope before driving the capability routes). The business
 * sub-routes are separate tickets and intentionally ABSENT here (no stubs):
 *   #6 worktree spawn / TTY-free harness ops (`agent:worktree`)
 *   #7 check stream (`bun run check`) (`agent:check`)
 *   #8 commit + finalize (`agent:commit` / `agent:finalize`)
 * They hang off this plugin via the same `requireAgentScope(...)` guards.
 *
 * Every request is budgeted twice (ticket AC): 60 req/min per token and
 * 600 req/min global, via `src/middleware/rate-limit.ts`.
 */
import { Elysia, t, } from "elysia";
import type { Db, } from "../../db";
import type { RateLimiter, } from "../../middleware/rate-limit";
import { jsonResponse, } from "../../routes/http-utils";
import { requireAgentToken, type ResolvedAgentToken, } from "./auth";

/** Options threaded into the agent surface (limiter seams for tests). */
export interface AgentApiOpts {
  database: Db;
  /** Overrides the 60/min per-token limiter (test seam). */
  perTokenLimiter?: RateLimiter;
  /** Overrides the 600/min global limiter (test seam). */
  globalLimiter?: RateLimiter;
}

/**
 * Agent API surface plugin (mounted under `/api/v1` in `elysia-app.ts`).
 * @param opts - database handle plus optional limiter seams
 * @param prefix - mount prefix (production: `/api/v1`)
 * @returns the Elysia plugin
 */
export function agentApiRoutes(opts: AgentApiOpts, prefix = "/api",): Elysia {
  const deps = {
    database: opts.database,
    perTokenLimiter: opts.perTokenLimiter,
    globalLimiter: opts.globalLimiter,
  };

  return new Elysia({ name: "agent-api", },).guard(
    { beforeHandle: requireAgentToken(deps,), },
    (app,) =>
      app.get(
        `${prefix}/agent/whoami`,
        async (ctx: unknown,) => {
          const token = ctx as { agentToken: ResolvedAgentToken };
          return jsonResponse({ data: { tokenId: token.agentToken.id, scope: token.agentToken.scope, }, },);
        },
        {
          response: t.Object({
            data: t.Object({
              tokenId: t.String(),
              scope: t.String(),
            },),
          },),
          detail: {
            summary: "Identify the presented agent token",
            description:
              "Echoes the resolved agent token id and its scope tier after token auth. The identity probe for the /api/v1/agent surface.",
            tags: ["Agent API",],
          },
        },
      ),
  );
}
