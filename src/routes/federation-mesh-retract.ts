// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/federation-mesh-retract.ts — `/api/mesh-retract`.
// Split out of `federation-mesh.ts` (size budget): only the originating
// trusted peer may retract a previously delivered content envelope.
import type { Elysia, } from "elysia";
import { canonicalOrigin, } from "../federation/peer-fetch";
import { authorizeMeshPeer, type MeshRouteOpts, } from "./federation-mesh";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "./http-utils";

/**
 * Mount the mesh retract route on a federation app.
 * @param app Elysia app under construction.
 * @param opts Server config + database.
 * @returns {void}
 */
export function mountMeshRetractApi(app: Elysia, opts: MeshRouteOpts,): void {
  app.post(
    "/api/mesh-retract",
    async ({ body, },) => {
      const request = body as { contentId?: unknown; origin?: unknown } | null;
      if (!request || typeof request.contentId !== "string" || typeof request.origin !== "string") {
        return jsonError({
          message: "contentId and origin are required",
          status: HttpStatus.BadRequest,
          code: ErrorCode.BadRequest,
        },);
      }

      const peer = await authorizeMeshPeer(opts.database, request.origin,);
      if (peer instanceof Response) { return peer; }
      const canonical = peer.origin;

      const delivery = await opts.database
        .selectFrom("mesh_deliveries",)
        .select(["origin",],)
        .where("content_id", "=", request.contentId,)
        .executeTakeFirst();

      if (!delivery) {
        return jsonError({
          message: "content not found",
          status: HttpStatus.NotFound,
          code: ErrorCode.NotFound,
        },);
      }

      if (canonicalOrigin(delivery.origin,) !== canonical) {
        return jsonError({
          message: "origin mismatch",
          status: HttpStatus.Forbidden,
          code: ErrorCode.Forbidden,
        },);
      }

      // Scope the DELETE to the origin that was just authorized. Filtering on
      // the STORED `delivery.origin` (not the canonical form) is what makes the
      // write provably hit only the authorized row: a concurrent
      // `receiveDelivery` upsert that overwrites `origin` in the read-then-write
      // window makes the predicate miss, and a miss is reported as 403 rather
      // than a retraction that never happened (IDOR).
      const deleted = await opts.database
        .deleteFrom("mesh_deliveries",)
        .where("content_id", "=", request.contentId,)
        .where("origin", "=", delivery.origin,)
        .executeTakeFirst();

      if (Number(deleted?.numDeletedRows ?? 0n,) === 0) {
        return jsonError({
          message: "origin mismatch",
          status: HttpStatus.Forbidden,
          code: ErrorCode.Forbidden,
        },);
      }

      return jsonResponse({ ok: true, },);
    },
    {
      detail: {
        summary: "Retract mesh content delivery",
        description:
          "Deletes a previously delivered content envelope by content id. Only the originating trusted peer may retract.",
        tags: ["Federation",],
      },
    },
  );
}
