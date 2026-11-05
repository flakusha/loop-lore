// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/routes.ts — the REST surface over the
// facade op registry, so HTTP agents can call every op the future MCP/ACP
// servers route through.
//
// TRUST BOUNDARY (types.ts): the principal is minted EXCLUSIVELY from the
// auth middleware's RequestContext via facadeContextFromRequestContext — any
// principal-shaped field in the request body is inert data (asserted in
// routes.test.ts). POST funnels through runFacadeOp (authz -> budget ->
// handler -> audit) and passes the wrapped service's status + JSON body
// through verbatim; GET manifest serves the discovery descriptors to any
// authenticated principal (no anonymous discovery).

import { Elysia, t, } from "elysia";
import { createRequestContext, } from "../../middleware/types";
import { jsonResponse, requireUserId, } from "../../routes/http-utils";
import type { HandlerOpts, } from "../../routes/messages/types";
import { safeJsonStringify, } from "../../utils";
import { getFacadeRegistry, } from "./instance";
import { runFacadeOp, } from "./registry";
import { facadeContextFromRequestContext, } from "./types";

/**
 * Facade REST surface:
 *  - `POST <prefix>/integrations/:opName` — run one op through the full
 *    facade lifecycle and echo the FacadeResult's status + body;
 *  - `GET <prefix>/integrations/manifest` — op descriptors for discovery.
 * Mounts wherever sibling /api plugins do (v1 barrel), so the app-level auth
 * derive + guards run identically.
 * @param opts - HandlerOpts threaded like every other route plugin
 * @param prefix - mount prefix (production: `/api/v1`)
 * @returns the Elysia plugin
 */
export function createFacadeRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, asyncStore, } = opts;

  return new Elysia({ name: "loop-lore-facade-routes", },)
    .post(
      `${prefix}/integrations/:opName`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }

        const rc = createRequestContext({
          userId,
          userRole: (ctx.userRole as string | null) ?? null,
          sessionId: (ctx.sessionId as string | null) ?? null,
        },);

        const facadeCtx = facadeContextFromRequestContext(
          { ...rc, requestId: typeof ctx.requestId === "string" ? ctx.requestId : "", },
          database,
          config,
          asyncStore,
        );

        const result = await runFacadeOp(
          getFacadeRegistry({ database, config, },),
          facadeCtx,
          (ctx.params as { opName: string }).opName,
          ctx.body,
        );

        // Passthrough: the wrapped service's status + JSON body, verbatim —
        // no envelope re-wrapping (jsonResponse would inject meta).
        const bodyResult = safeJsonStringify(result.json ?? null,);
        return new Response(bodyResult.ok ? bodyResult.value : "null", {
          status: result.status,
          headers: { "content-type": "application/json", },
        },);
      },
      { params: t.Object({ opName: t.String({ minLength: 1, },), },), },
    )
    .get(`${prefix}/integrations/manifest`, (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }

      return jsonResponse(getFacadeRegistry({ database, config, },).manifest(),);
    },);
}
