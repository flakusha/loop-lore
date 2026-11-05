// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/mcp/routes.ts — the MCP Streamable HTTP
// transport over the facade registry (epic TASK: tools/list + tools/call).
//
// One authenticated POST endpoint speaking JSON-RPC 2.0 through the SDK
// stateless bridge (initialize, tools/list, tools/call, ping; batch arrays
// supported). The caller identity is minted EXCLUSIVELY from the auth
// middleware's RequestContext — the RPC body is protocol payload only and
// can never assert a principal. Sessions are STATELESS by slice decision
// (pinned spec removed protocol sessions): no session ids, initialize per
// request tolerated; notification-only posts answer 202. Response transport
// is plain application/json (no SSE streams this slice).
//
// parse:"none" — the body must be dispatched as RAW text so malformed JSON
// answers the JSON-RPC -32700 Parse error instead of the app validation
// envelope (same composed-parse hazard documented at elysia-app.ts for the
// assets upload).

import { Elysia, } from "elysia";
import { APP_VERSION, } from "../../../config/constants";
import { createRequestContext, } from "../../../middleware/types";
import { requireUserId, } from "../../../routes/http-utils";
import type { HandlerOpts, } from "../../../routes/messages/types";
import { safeJsonStringify, } from "../../../utils";
import { getFacadeRegistry, } from "../instance";
import { type FacadeRouteCtx, } from "../routes";
import { facadeContextFromRequestContext, } from "../types";
import { McpTransportBridge, } from "./bridge";

/** The MCP POST handler additionally consumes the raw Request body. */
interface McpRouteCtx extends FacadeRouteCtx {
  request: Request;
}

/** Stateless: the bridge holds no per-session state of its own. */
const mcpBridge = new McpTransportBridge();

/**
 * MCP transport endpoint:
 *  - `POST <prefix>/integrations/mcp` — JSON-RPC 2.0 (single or batch);
 *  - `GET <prefix>/integrations/mcp` — 405 (no SSE stream in stateless mode).
 * @param opts - HandlerOpts threaded like every other route plugin
 * @param prefix - mount prefix (production: `/api/v1`)
 * @returns the Elysia plugin
 */
export function createMcpRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, asyncStore, } = opts;

  return new Elysia({ name: "loop-lore-facade-mcp", },)
    .post(
      `${prefix}/integrations/mcp`,
      async (ctx: McpRouteCtx,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const rc = createRequestContext({
          userId,
          userRole: ctx.userRole ?? null,
          sessionId: ctx.sessionId ?? null,
        },);

        const facadeCtx = facadeContextFromRequestContext(
          { ...rc, requestId: typeof ctx.requestId === "string" ? ctx.requestId : "", },
          database,
          config,
          asyncStore,
        );

        const raw = await ctx.request.text();
        const outcome = await mcpBridge.handlePayload(raw, {
          registry: getFacadeRegistry({ database, config, },),
          version: APP_VERSION,
          ctx: facadeCtx,
        },);

        // Notification-only payload: nothing to answer -> 202 Accepted.
        if (outcome.status === 202) {
          return new Response(null, { status: 202, },);
        }

        const serialized = safeJsonStringify(outcome.body,);
        return new Response(serialized.ok ? serialized.value : "null", {
          status: 200,
          headers: { "content-type": "application/json", },
        },);
      },
      { parse: "none", },
    )
    .get(`${prefix}/integrations/mcp`, () =>
      new Response(null, {
        status: 405,
        headers: { allow: "POST", },
      },),);
}
