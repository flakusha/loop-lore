// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Controller — route factory.
 * Thin Elysia plugin wiring; handler logic lives in sibling modules.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { AssetLinkEntity, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { notFoundResponse, } from "../../routes/http-utils";
import {
  handleCreateLink,
  handleCreateShare,
  handleDeleteAsset,
  handleDeleteLink,
  handleDeleteShare,
  handleGetAsset,
  handleListAssets,
  handleListLinks,
  handleListShares,
  handlePatchAsset,
} from "./handlers";
import {
  handleCompressedRoute,
  handleDownloadRoute,
  handleServeRawRoute,
  handleSignedUrlRoute,
} from "./signed-url-routes";
import type { RouteCtx, } from "./types";

const PatchAssetBody = t.Object({ visibility: t.String(), },);
const CreateLinkBody = t.Object({
  entityType: t.Union(Object.values(AssetLinkEntity,).map((v,) => t.Literal(v,)),),
  entityId: t.String(),
  label: t.Optional(t.String(),),
},);
const DeleteLinkBody = t.Object({ entityType: t.Optional(t.String(),), entityId: t.Optional(t.String(),), },);
const ShareBody = t.Object({ actor_id: t.String(), },);

/**
 * @param root0
 * @param root0.database
 * @param root0.config
 */
export function assetRoutes({ database, config, }: { database: Kysely<DB>; config: Config },) {
  const deps = { database, config, };
  const withCtx = (fn: (d: typeof deps & { ctx: RouteCtx },) => Promise<Response>,) => (ctx: any,) =>
    fn({ ...deps, ctx, },);

  return (
    new Elysia({ name: "assets", },)
      .guard({
        beforeHandle: () => {
          if (!config.assets.enabled) {
            return notFoundResponse("Asset system is disabled",);
          }
        },
      },)
      // ── Collection routes ─────────────────────────────
      .get("/api/assets", withCtx(handleListAssets,),)
      // NOTE: POST /api/assets is registered directly in elysia-app.ts (not here)
      // as a workaround for Elysia 1.4.x body consumption: when a child plugin
      // containing routes that call request.json() is .use()d into a parent,
      // Elysia's internal body parser consumes the multipart body stream before
      // the upload handler can call request.formData(). Registering the multipart
      // route directly on the parent app avoids this issue.
      // ── Single asset routes ──────────────────────────
      .get("/api/assets/:id", withCtx(handleGetAsset,),)
      .patch("/api/assets/:id", withCtx(handlePatchAsset,), { body: PatchAssetBody, },)
      .delete("/api/assets/:id", withCtx(handleDeleteAsset,),)
      // ── File serving routes ──────────────────────────
      .get("/api/assets/:id/raw", withCtx(handleServeRawRoute,),)
      .get("/api/assets/:id/download", withCtx(handleDownloadRoute,),)
      .get("/api/assets/:id/thumb", withCtx((d,) => handleCompressedRoute(d, "thumb",)),)
      .get("/api/assets/:id/compressed", withCtx((d,) => handleCompressedRoute(d, "compressed",)),)
      // Signed-URL generation: POST /api/assets/:id/signed-url/:action
      .post("/api/assets/:id/signed-url/:action", withCtx(handleSignedUrlRoute,),)
      // ── Links sub-routes ─────────────────────────────
      .get("/api/assets/:id/links", withCtx(handleListLinks,),)
      .post("/api/assets/:id/links", withCtx(handleCreateLink,), { body: CreateLinkBody, },)
      .delete("/api/assets/:id/links/:linkId", withCtx(handleDeleteLink,), { body: DeleteLinkBody, },)
      // ── Share sub-routes ─────────────────────────────
      .post("/api/assets/:id/share", withCtx(handleCreateShare,), { body: ShareBody, },)
      .delete("/api/assets/:id/share", withCtx(handleDeleteShare,), { body: ShareBody, },)
      .get("/api/assets/:id/shares", withCtx(handleListShares,),)
  );
}
