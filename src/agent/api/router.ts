// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RSI agent API router (TASK-recursive-self-improvement-agent-api-router-
 * and-token-scope-).
 *
 * Mounts the `/api/v1/agent/*` surface. `GET /agent/whoami` is the identity
 * probe; the two implemented capability sub-routes hang off the same plugin
 * and share the `requireAgentScope(...)` guards:
 *   #6 worktree spawn (`agent:worktree`) — TTY-free `git worktree add`
 *   #7 check stream (`agent:check`) — `bun run check` over SSE
 *   #8 commit + finalize (`agent:commit` / `agent:finalize`) remains a
 *      separate ticket and is intentionally ABSENT here (no stubs).
 *
 * Every request is budgeted twice (ticket AC): 60 req/min per token and
 * 600 req/min global, via `src/middleware/rate-limit.ts`.
 */
import { Elysia, } from "elysia";
import type { Db, } from "../../db";
import type { RateLimiter, } from "../../middleware/rate-limit";
import { jsonResponse, } from "../../routes/http-utils";
import { requireAgentToken, type ResolvedAgentToken, } from "./auth";
import { checkRoutes, } from "./check";
import type { AgentRouteOpts, } from "./types";
import { worktreeRoutes, } from "./worktree";

/** Options threaded into the agent surface (limiter seams for tests). */
export interface AgentApiOpts {
  database: Db;
  /** Overrides the 60/min per-token limiter (test seam). */
  perTokenLimiter?: RateLimiter;
  /** Overrides the 600/min global limiter (test seam). */
  globalLimiter?: RateLimiter;
  /** Git toplevel for worktree spawn (default: process.cwd()). */
  repoRoot?: string;
  spawnWorktree?: AgentRouteOpts["spawnWorktree"];
  removeWorktree?: AgentRouteOpts["removeWorktree"];
  measureDirectoryBytes?: AgentRouteOpts["measureDirectoryBytes"];
  runCheck?: AgentRouteOpts["runCheck"];
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

  const subOpts: AgentRouteOpts = {
    ...deps,
    repoRoot: opts.repoRoot,
    spawnWorktree: opts.spawnWorktree,
    removeWorktree: opts.removeWorktree,
    measureDirectoryBytes: opts.measureDirectoryBytes,
    runCheck: opts.runCheck,
  };

  return new Elysia({ name: "agent-api", },)
    .get(
      `${prefix}/agent/whoami`,
      async (ctx: unknown,) => {
        const token = ctx as { agentToken: ResolvedAgentToken };
        return jsonResponse({ data: { tokenId: token.agentToken.id, scope: token.agentToken.scope, }, },);
      },
      {
        beforeHandle: [requireAgentToken(deps,),],
        detail: {
          summary: "Identify the presented agent token",
          description:
            "Echoes the resolved agent token id and its scope tier after token auth. The identity probe for the /api/v1/agent surface.",
          tags: ["Agent API",],
        },
      },
    )
    .use(worktreeRoutes(subOpts, prefix,),)
    .use(checkRoutes(subOpts, prefix,),);
}
